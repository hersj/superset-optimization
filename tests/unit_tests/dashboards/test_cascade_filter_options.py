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
from sqlalchemy import text

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

    assert result["department_label"]["data"] == [
        {"department_label": "大EU部"}
    ]
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
    fake_dataset.get_sqla_row_level_filters.return_value = [text('"shop_id" = 42')]

    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dataset",
        return_value=fake_dataset,
    )
    mocker.patch(
        "superset.commands.dashboard.cascade_filter_options.GetCascadeFilterOptionsCommand._get_dashboard_filter_metadata",
        return_value={
            "columns": ["country", "shop_name"],
            "parent_columns_by_column": {"country": [], "shop_name": []},
        },
    )

    command_kwargs = {
        "dashboard_id": 44,
        "dataset_id": 98,
        "columns": ["country", "shop_name"],
    }

    GetCascadeFilterOptionsCommand(**command_kwargs).run()
    GetCascadeFilterOptionsCommand(**command_kwargs).run()

    assert fake_engine.execute.call_count == 2
    assert str(fake_engine.execute.call_args.args[0]).count('"shop_id" = 42') == 2


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
