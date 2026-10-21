# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from flask import g
from sqlalchemy import bindparam, or_, text
from sqlalchemy.dialects.postgresql import dialect as postgresql_dialect

from superset.commands.dashboard.cascade_filter_options import (
    clear_cascade_filter_options_cache,
    GetCascadeFilterOptionsCommand,
)


class FakeRows(list):
    def mappings(self):
        return self

    def all(self):
        return list(self)


def setup_function():
    clear_cascade_filter_options_cache()


def test_point_cascade_compiles_union_in_every_column_with_rls():
    command = GetCascadeFilterOptionsCommand(
        44,
        98,
        ["shop", "country"],
        time_range="2025-04-27 : 2026-07-12",
        time_ranges=["2025-04-27 : 2025-05-04", "2026-07-05 : 2026-07-12"],
        time_column="event_date",
    )
    dataset = MagicMock(schema="public", table_name="point_events", catalog=None)
    # 精确传递绑定列，不借用数据集可能不同的 main_dttm_col。
    dataset.main_dttm_col = "wrong_date"
    metadata = {
        "columns": ["shop", "country"],
        "parent_columns_by_column": {"shop": [], "country": []},
    }
    command._get_dashboard_filter_metadata = MagicMock(return_value=metadata)
    statement, params = command._build_statement(dataset, None, None, ["(shop = 42)"])
    sql = str(statement)
    assert sql.count("range_0_since") == 2 and sql.count("range_1_since") == 2
    assert sql.count("(shop = 42)") == 2
    assert "wrong_date" not in sql
    assert params["range_0_until"] == datetime(2025, 5, 4)
    assert params["range_1_since"] == datetime(2026, 7, 5)


@pytest.mark.parametrize(
    "ranges,column,envelope",
    [
        ([], "event_date", "No filter"),
        ({}, "event_date", "2026-01-01 : 2026-02-01"),
        (["2026-01-01 : 2026-02-01"], "unbound", "2026-01-01 : 2026-02-01"),
        (["2026-01-01 : 2026-02-01"], "event_date", "2025-01-01 : 2026-02-01"),
    ],
)
def test_point_cascade_rejects_invalid_binding_or_envelope(ranges, column, envelope):
    command = GetCascadeFilterOptionsCommand(
        44, 98, ["shop"], time_ranges=ranges, time_column=column, time_range=envelope
    )
    command._get_dashboard_filter_metadata = MagicMock(
        return_value={"time_columns": {"event_date"}}
    )
    with pytest.raises(ValueError):
        command._resolve_time_range()


def test_activate_request_identity_keeps_session_user_without_jwt(app, mocker):
    session_user = object()
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.verify_jwt_in_request",
        return_value=None,
    )

    with app.test_request_context("/"):
        g.user = session_user
        GetCascadeFilterOptionsCommand(44, 98, ["country"])._activate_request_identity()

        assert g.user is session_user


def test_activate_request_identity_uses_verified_jwt_user(app, mocker):
    verified_user = object()
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.verify_jwt_in_request",
        return_value=("header", "claims"),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.jwt_current_user",
        new=verified_user,
    )

    with app.test_request_context("/"):
        g.user = object()
        GetCascadeFilterOptionsCommand(44, 98, ["country"])._activate_request_identity()

        assert g.user is verified_user


def test_valid_jwt_identity_reaches_rls_and_bypasses_shared_cache(app, mocker):
    fake_engine = MagicMock()
    fake_engine.dialect = postgresql_dialect()
    fake_engine.execute.return_value = FakeRows(
        [{"__column": "country", "__value": "US"}]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine
    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.main_dttm_col = "earliest_ship_date"
    verified_user = object()
    observed_users = []

    def get_rls_filters():
        observed_users.append(g.user)
        return [text('"shop_id" = 42')]

    fake_dataset.get_sqla_row_level_filters.side_effect = get_rls_filters
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country"],
            "parent_columns_by_column": {"country": []},
        },
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.verify_jwt_in_request",
        return_value=("header", "claims"),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.jwt_current_user",
        new=verified_user,
    )
    cached_get = mocker.patch(
        "superset.commands.dashboard.cascade_filter_options._get_cached_options"
    )
    cached_set = mocker.patch(
        "superset.commands.dashboard.cascade_filter_options._set_cached_options"
    )

    with app.test_request_context("/"):
        GetCascadeFilterOptionsCommand(44, 98, ["country"]).run()

    assert observed_users == [verified_user]
    assert 'AND ("shop_id" = 42)' in str(fake_engine.execute.call_args.args[0])
    cached_get.assert_not_called()
    cached_set.assert_not_called()


def test_invalid_jwt_fails_before_cascade_query(app, mocker):
    fake_engine = MagicMock()
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine
    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country"],
            "parent_columns_by_column": {"country": []},
        },
    )
    jwt_error = RuntimeError("invalid JWT")
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.verify_jwt_in_request",
        side_effect=jwt_error,
    )

    with app.test_request_context("/"):
        with pytest.raises(RuntimeError, match="invalid JWT"):
            GetCascadeFilterOptionsCommand(44, 98, ["country"]).run()

    fake_engine.execute.assert_not_called()


def test_cascade_filter_options_queries_each_column_with_parent_filters(mocker):
    fake_engine = MagicMock()
    fake_engine.execute.return_value = FakeRows(
        [
            {"__column": "country", "__value": "US"},
            {"__column": "shop_name", "__value": "Shop A"},
        ]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.main_dttm_col = "earliest_ship_date"

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(datetime(2026, 1, 1), datetime(2027, 1, 1)),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": [
                "department_label",
                "country",
                "shop_name",
                "main_pf",
                "main_spu",
                "lt",
                "grade",
                "kk_sku",
            ],
            "parent_columns_by_column": {
                "department_label": [],
                "country": ["department_label"],
                "shop_name": ["department_label", "country"],
                "main_pf": ["department_label", "country", "shop_name"],
                "main_spu": [
                    "department_label",
                    "country",
                    "shop_name",
                    "main_pf",
                ],
                "lt": [
                    "department_label",
                    "country",
                    "shop_name",
                    "main_pf",
                    "main_spu",
                ],
                "grade": [
                    "department_label",
                    "country",
                    "shop_name",
                    "main_pf",
                    "main_spu",
                    "lt",
                ],
                "kk_sku": [
                    "department_label",
                    "country",
                    "shop_name",
                    "main_pf",
                    "main_spu",
                    "lt",
                    "grade",
                ],
            },
        },
    )

    result = GetCascadeFilterOptionsCommand(
        dashboard_id=44,
        dataset_id=98,
        columns=["country", "shop_name"],
        applied_filters={
            "department_label": ["D1"],
            "country": ["US"],
            "shop_name": ["Shop A"],
        },
        time_range="Current year",
    ).run()

    assert result == {
        "country": {
            "colnames": ["country"],
            "coltypes": [1],
            "data": [{"country": "US"}],
            "rowcount": 1,
        },
        "shop_name": {
            "colnames": ["shop_name"],
            "coltypes": [1],
            "data": [{"shop_name": "Shop A"}],
            "rowcount": 1,
        },
    }

    assert fake_engine.execute.call_count == 1
    params = fake_engine.execute.call_args.args[1]
    sql = str(fake_engine.execute.call_args.args[0])

    assert '"department_label" IN' in sql
    assert '"country" IN' in sql
    assert '"shop_name" IN' not in sql
    assert '"earliest_ship_date" >= :since' in sql
    assert '"earliest_ship_date" < :until' in sql
    assert ["D1"] in params.values()
    assert ["US"] in params.values()
    assert params["since"] == datetime(2026, 1, 1)
    assert params["until"] == datetime(2027, 1, 1)


def test_cascade_filter_options_does_not_apply_implicit_time_filter_when_time_range_is_missing(
    mocker,
):
    fake_engine = MagicMock()
    fake_engine.execute.return_value = FakeRows(
        [{"__column": "department_label", "__value": "大EU部"}]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = "sellfox_prod"
    fake_dataset.schema = "public"
    fake_dataset.table_name = "product_base"
    fake_dataset.main_dttm_col = "created_at"

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(None, datetime(2026, 7, 8)),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["department_label"],
            "parent_columns_by_column": {"department_label": []},
        },
    )

    result = GetCascadeFilterOptionsCommand(
        dashboard_id=55,
        dataset_id=109,
        columns=["department_label"],
    ).run()

    sql = str(fake_engine.execute.call_args.args[0])

    assert result["department_label"]["data"] == [{"department_label": "大EU部"}]
    assert '"created_at" < :until' not in sql
    assert '"created_at" >= :since' not in sql


def test_cascade_filter_options_executes_one_statement_for_multiple_columns(mocker):
    fake_engine = MagicMock()
    fake_engine.execute.return_value = FakeRows(
        [
            {"__column": "country", "__value": "US"},
            {"__column": "shop_name", "__value": "Shop A"},
        ]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.main_dttm_col = "earliest_ship_date"

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(None, None),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["department_label", "country", "shop_name"],
            "parent_columns_by_column": {
                "department_label": [],
                "country": ["department_label"],
                "shop_name": ["department_label", "country"],
            },
        },
    )

    result = GetCascadeFilterOptionsCommand(
        dashboard_id=44,
        dataset_id=98,
        columns=["country", "shop_name"],
        applied_filters={
            "department_label": ["D1"],
            "country": ["US"],
        },
    ).run()

    assert fake_engine.execute.call_count == 1
    assert result["country"]["data"] == [{"country": "US"}]
    assert result["shop_name"]["data"] == [{"shop_name": "Shop A"}]


def test_cascade_filter_options_rejects_out_of_scope_dashboard():
    command = GetCascadeFilterOptionsCommand(
        dashboard_id=43,
        dataset_id=98,
        columns=["country"],
        applied_filters={},
    )

    try:
        command._filter_metadata = {
            "columns": [],
            "parent_columns_by_column": {},
        }
        command.run()
    except ValueError as ex:
        assert "Unsupported dashboard/dataset cascade context" in str(ex)
    else:
        raise AssertionError("expected ValueError")


def test_cascade_filter_options_rejects_out_of_scope_dataset(mocker):
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": [],
            "parent_columns_by_column": {},
        },
    )
    command = GetCascadeFilterOptionsCommand(
        dashboard_id=43,
        dataset_id=98,
        columns=["country"],
        applied_filters={},
    )

    try:
        command.run()
    except ValueError as ex:
        assert "Unsupported dashboard/dataset cascade context" in str(ex)
    else:
        raise AssertionError("expected ValueError")


def test_cascade_filter_options_supports_kk_sku_with_full_parent_chain(mocker):
    fake_engine = MagicMock()
    fake_engine.execute.return_value = FakeRows(
        [{"__column": "kk_sku", "__value": "KK-001"}]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.main_dttm_col = "earliest_ship_date"

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(None, None),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": [
                "department_label",
                "country",
                "shop_name",
                "main_pf",
                "main_spu",
                "lt",
                "grade",
                "kk_sku",
            ],
            "parent_columns_by_column": {
                "kk_sku": [
                    "department_label",
                    "country",
                    "shop_name",
                    "main_pf",
                    "main_spu",
                    "lt",
                    "grade",
                ],
            },
        },
    )

    result = GetCascadeFilterOptionsCommand(
        dashboard_id=44,
        dataset_id=98,
        columns=["kk_sku"],
        applied_filters={
            "department_label": ["D1"],
            "country": ["US"],
            "shop_name": ["Shop A"],
            "main_pf": ["PF1"],
            "main_spu": ["SPU1"],
            "lt": ["LT1"],
            "grade": ["A"],
            "kk_sku": ["KK-001"],
        },
    ).run()

    assert result["kk_sku"]["data"] == [{"kk_sku": "KK-001"}]

    sql = str(fake_engine.execute.call_args.args[0])
    params = fake_engine.execute.call_args.args[1]
    for parent_column in [
        "department_label",
        "country",
        "shop_name",
        "main_pf",
        "main_spu",
        "lt",
        "grade",
    ]:
        assert f'"{parent_column}" IN' in sql
        assert [
            {
                "department_label": "D1",
                "country": "US",
                "shop_name": "Shop A",
                "main_pf": "PF1",
                "main_spu": "SPU1",
                "lt": "LT1",
                "grade": "A",
            }[parent_column]
        ] in params.values()
    assert '"kk_sku" IN' not in sql


def test_cascade_filter_options_rejects_kk_sku_when_dashboard_has_no_kk_sku(
    mocker,
):
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": [
                "department_label",
                "country",
                "shop_name",
                "main_pf",
                "main_spu",
                "lt",
                "grade",
            ],
            "parent_columns_by_column": {},
        },
    )
    command = GetCascadeFilterOptionsCommand(
        dashboard_id=51,
        dataset_id=98,
        columns=["kk_sku"],
        applied_filters={},
    )

    try:
        command.run()
    except ValueError as ex:
        assert "Unsupported columns" in str(ex)
        assert "kk_sku" in str(ex)
    else:
        raise AssertionError("expected ValueError")


def test_cascade_filter_options_supports_dashboard_metadata_columns(mocker):
    fake_engine = MagicMock()
    fake_engine.execute.return_value = FakeRows(
        [{"__column": "店铺名称", "__value": "Shop A"}]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_monthly_v2_zh"
    fake_dataset.main_dttm_col = "月开始日期"

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(datetime(2026, 6, 1), datetime(2026, 7, 1)),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["年月", "事业部", "店铺名称"],
            "parent_columns_by_column": {
                "年月": [],
                "事业部": ["年月"],
                "店铺名称": ["年月", "事业部"],
            },
        },
    )

    result = GetCascadeFilterOptionsCommand(
        dashboard_id=43,
        dataset_id=95,
        columns=["店铺名称"],
        applied_filters={"年月": ["2026-06"], "事业部": ["D1"]},
        time_range="2026-06-01 : 2026-07-01",
    ).run()

    sql = str(fake_engine.execute.call_args.args[0])
    params = fake_engine.execute.call_args.args[1]

    assert result["店铺名称"]["data"] == [{"店铺名称": "Shop A"}]
    assert '"public"."profit_dws_monthly_v2_zh"' in sql
    assert '"年月" IN' in sql
    assert '"事业部" IN' in sql
    assert '"店铺名称" IN' not in sql
    assert '"月开始日期" >= :since' in sql
    assert ["2026-06"] in params.values()
    assert ["D1"] in params.values()


def test_cascade_filter_options_rejects_columns_not_declared_on_dashboard(mocker):
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["事业部"],
            "parent_columns_by_column": {"事业部": []},
        },
    )

    command = GetCascadeFilterOptionsCommand(
        dashboard_id=43,
        dataset_id=95,
        columns=["不存在字段"],
        applied_filters={},
    )

    with pytest.raises(ValueError, match="Unsupported columns"):
        command.run()


def test_cascade_filter_options_reuses_identical_request_cache(mocker):
    fake_engine = MagicMock()
    fake_engine.execute.return_value = FakeRows(
        [{"__column": "country", "__value": "US"}]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.main_dttm_col = "earliest_ship_date"

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(None, None),
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["department_label", "country"],
            "parent_columns_by_column": {
                "department_label": [],
                "country": ["department_label"],
            },
        },
    )

    command_kwargs = {
        "dashboard_id": 44,
        "dataset_id": 98,
        "columns": ["country"],
        "applied_filters": {"department_label": ["D1"]},
    }

    first = GetCascadeFilterOptionsCommand(**command_kwargs).run()
    second = GetCascadeFilterOptionsCommand(**command_kwargs).run()

    assert first == second
    assert fake_engine.execute.call_count == 1


def test_cascade_filter_options_applies_rls_and_does_not_share_cached_options(mocker):
    fake_engine = MagicMock()
    fake_engine.dialect = postgresql_dialect()
    fake_engine.execute.return_value = FakeRows(
        [
            {"__column": "country", "__value": "US"},
            {"__column": "shop_name", "__value": "Shop A"},
        ]
    )
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.main_dttm_col = "earliest_ship_date"
    fake_dataset.get_sqla_row_level_filters.return_value = [
        or_(
            text('"shop_id" = :shop_a').bindparams(bindparam("shop_a", value=42)),
            text('"shop_id" = :shop_b').bindparams(bindparam("shop_b", value=43)),
        )
    ]

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country", "shop_name"],
            "parent_columns_by_column": {
                "country": ["department_label"],
                "shop_name": ["department_label"],
            },
        },
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.get_since_until_from_time_range",
        return_value=(datetime(2026, 1, 1), datetime(2027, 1, 1)),
    )

    command_kwargs = {
        "dashboard_id": 44,
        "dataset_id": 98,
        "columns": ["country", "shop_name"],
        "applied_filters": {"department_label": ["D1"]},
        "time_range": "Current year",
    }

    GetCascadeFilterOptionsCommand(**command_kwargs).run()
    GetCascadeFilterOptionsCommand(**command_kwargs).run()

    assert fake_engine.execute.call_count == 2
    sql = str(fake_engine.execute.call_args.args[0])
    assert sql.count('AND ("shop_id" = 42 OR "shop_id" = 43) AND') == 2
    assert sql.count('"department_label" IN') == 2
    assert sql.count('"earliest_ship_date" >= :since') == 2
    assert sql.count('"earliest_ship_date" < :until') == 2
    assert ":shop_a" not in sql
    assert ":shop_b" not in sql


def test_cascade_filter_options_rejects_uncompilable_rls_before_query(mocker):
    fake_engine = MagicMock()
    fake_engine.dialect = postgresql_dialect()
    fake_context = MagicMock()
    fake_context.__enter__.return_value = fake_engine

    rls_filter = MagicMock()
    rls_filter.compile.side_effect = ValueError("bad RLS")
    fake_dataset = MagicMock()
    fake_dataset.database.get_sqla_engine.return_value = fake_context
    fake_dataset.catalog = None
    fake_dataset.schema = "public"
    fake_dataset.table_name = "profit_dws_daily_v2"
    fake_dataset.get_sqla_row_level_filters.return_value = [rls_filter]

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country"],
            "parent_columns_by_column": {"country": []},
        },
    )

    with pytest.raises(ValueError, match="Unable to compile row level security"):
        GetCascadeFilterOptionsCommand(
            dashboard_id=44,
            dataset_id=98,
            columns=["country"],
        ).run()

    fake_engine.execute.assert_not_called()


def test_cascade_filter_options_keeps_one_postgresql_percent_escape():
    dialect = postgresql_dialect()
    rls_filter = text('"shop_name" ILIKE :pattern').bindparams(
        bindparam("pattern", value="%foo%")
    )

    rls_clauses = GetCascadeFilterOptionsCommand._compile_rls_clauses(
        [rls_filter],
        dialect,
    )
    statement = text(f"SELECT 1 WHERE {' AND '.join(rls_clauses)}")
    sql = str(statement.compile(dialect=dialect))

    assert "ILIKE '%%foo%%'" in sql
    assert "%%%%foo%%%%" not in sql


@pytest.mark.parametrize("invalid_time_range", [[], {}, "", "No filter"])
def test_cascade_filter_options_rejects_invalid_time_range_at_api_boundary(
    mocker, invalid_time_range
):
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country"],
            "parent_columns_by_column": {"country": []},
            "applicable_time_filter_count": 0,
        },
    )
    command = GetCascadeFilterOptionsCommand(
        dashboard_id=44,
        dataset_id=98,
        columns=["country"],
        applied_filters={},
        time_range=invalid_time_range,
    )

    with pytest.raises(ValueError, match="time_range"):
        command.run()


def test_cascade_filter_options_rejects_missing_range_when_filter_is_configured(
    mocker,
):
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country"],
            "parent_columns_by_column": {"country": []},
            "applicable_time_filter_count": 1,
        },
    )
    command = GetCascadeFilterOptionsCommand(
        dashboard_id=44,
        dataset_id=98,
        columns=["country"],
        applied_filters={},
    )

    with pytest.raises(ValueError, match="time_range"):
        command.run()


@pytest.mark.parametrize("operator", ["ILIKE", "NOT ILIKE", "NOT IN"])
def test_text_parent_keeps_country_time_and_rls(operator):
    command = GetCascadeFilterOptionsCommand(
        73,
        156,
        ["brand"],
        applied_filters={"competitor": ["%深圳%"], "site": ["US"]},
        filter_operators={"competitor": operator},
    )
    command._get_dashboard_filter_metadata = MagicMock(
        return_value={
            "columns": ["site", "competitor", "brand"],
            "parent_columns_by_column": {"brand": ["site", "competitor"]},
        }
    )
    command.validate()
    dataset = MagicMock(
        schema="public",
        table_name="market_monthly_fact",
        main_dttm_col="snapshot_month",
    )
    statement, params = command._build_statement(
        dataset, datetime(2026, 1, 1), datetime(2026, 10, 1), ["(allowed = TRUE)"]
    )
    sql = str(statement)
    assert '"site" IN' in sql
    assert operator in sql
    assert "深圳" not in sql
    assert "since" in sql
    assert "until" in sql
    assert "(allowed = TRUE)" in sql
    assert ["US"] in params.values()
    assert ("%深圳%" if operator != "NOT IN" else ["%深圳%"]) in params.values()
    old_cache_key = command._get_cache_key()
    command._filter_operators = {}
    assert command._get_cache_key() != old_cache_key


@pytest.mark.parametrize(
    "operators,values",
    [
        ({"competitor": "ILIKE OR TRUE"}, ["%深圳%"]),
        ({"competitor": "ILIKE"}, ["a", "b"]),
        ({"competitor": "ILIKE"}, [1]),
        ({"unconfigured": "ILIKE"}, ["a"]),
    ],
)
def test_rejects_invalid_parent_patterns(operators, values):
    command = GetCascadeFilterOptionsCommand(
        73,
        156,
        ["brand"],
        applied_filters={"competitor": values},
        filter_operators=operators,
    )
    command._get_dashboard_filter_metadata = MagicMock(
        return_value={"columns": ["brand", "competitor"]}
    )
    with pytest.raises(ValueError, match="Unsupported parent|Pattern filters"):
        command.validate()
