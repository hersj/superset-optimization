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
from copy import copy
from types import SimpleNamespace

import pandas as pd
import pytest
import sqlalchemy as sa
from flask import Flask

from superset.common.personal_sort import validate_chart_sort
from superset.common.personal_sort_query import prepare_personal_sort
from superset.common.personal_sort_sql import (
    apply_sort_predicate,
    custom_sort_expression,
    enforce_personal_row_limit,
)
from superset.common.query_object import QueryObject
from superset.exceptions import QueryObjectValidationError

FORM = {
    "viz_type": "table",
    "metrics": ["sales", "margin"],
    "groupby": ["sku"],
    "row_limit": 2,
}


def spec(mode="metric", field="sales", **extra):
    return {"mode": mode, "field": field, "direction": "desc", **extra}


@pytest.mark.parametrize(
    "payload",
    [
        spec(field="sales; DROP TABLE x"),
        spec(direction="bad"),
        spec(mode="custom", field="sku", customOrder=[1]),
        {**spec(), "sql": "x"},
    ],
)
def test_reject_untrusted_sort(payload):
    with pytest.raises(ValueError, match="Sort|Invalid|Custom"):
        validate_chart_sort(payload, FORM)


def test_custom_original_values_and_mixed_identity():
    assert validate_chart_sort(
        spec("custom", "sku", customOrder=["O'Reilly", "O'Reilly", "SKU-A"]), FORM
    )["customOrder"] == ["O'Reilly", "SKU-A"]
    mixed = {**FORM, "viz_type": "mixed_timeseries", "metrics_b": ["sales"]}
    assert validate_chart_sort(spec(field="B:sales"), mixed)["field"] == "B:sales"
    with pytest.raises(ValueError, match="Sort field"):
        validate_chart_sort(spec(), mixed)


def test_query_cache_and_legacy_serialization():
    original = QueryObject(columns=["sku"], metrics=["sales"], row_limit=2)
    assert "personal_sort" not in original.to_dict()
    alternate = copy(original)
    alternate.personal_sort = spec()
    assert alternate.cache_key() != original.cache_key()
    alternate.personal_sort = spec(field="margin")
    assert alternate.cache_key() != original.cache_key()


def test_bound_custom_priority_nulls_negative_and_pagination():
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    table = sa.Table(
        "items", metadata, sa.Column("sku", sa.String), sa.Column("sales", sa.Float)
    )
    metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            table.insert(),
            [
                {"sku": "O'Reilly", "sales": -2},
                {"sku": "b", "sales": 0},
                {"sku": "a", "sales": 0},
                {"sku": "n", "sales": None},
            ],
        )
        query = (
            sa.select([table.c.sku])
            .order_by(table.c.sales.desc().nullslast(), table.c.sku.asc())
            .limit(2)
            .offset(1)
        )
        assert [row[0] for row in conn.execute(query)] == ["b", "O'Reilly"]
        custom = custom_sort_expression(
            spec("custom", "sku", customOrder=["O'Reilly"]), dict(table.c)
        )
        query = sa.select([table.c.sku]).order_by(custom.asc(), table.c.sku.asc())
        assert [row[0] for row in conn.execute(query)][0] == "O'Reilly"
        assert "O'Reilly" not in str(query)


def test_cohort_tuple_predicate_does_not_leak_cross_product_or_null():
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    table = sa.Table(
        "items", metadata, sa.Column("parent", sa.String), sa.Column("sku", sa.String)
    )
    metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            table.insert(),
            [
                {"parent": "a", "sku": "x"},
                {"parent": "a", "sku": "y"},
                {"parent": "b", "sku": "x"},
                {"parent": None, "sku": "z"},
            ],
        )
        query = apply_sort_predicate(
            sa.select([table]),
            {
                "cohort_columns": ["parent", "sku"],
                "cohort_values": [["a", "x"], [None, "z"]],
            },
            dict(table.c),
        )
        assert list(conn.execute(query)) == [("a", "x"), (None, "z")]
        empty = apply_sort_predicate(
            sa.select([table]),
            {"cohort_columns": ["sku"], "cohort_values": []},
            dict(table.c),
        )
        assert list(conn.execute(empty)) == []


def test_pivot_column_context_only_filters_candidate_and_shared_period_keys():
    form = {
        "viz_type": "pivot_table_v2",
        "groupbyRows": ["department", "sku"],
        "groupbyColumns": ["country"],
        "metrics": ["sales"],
        "row_limit": 2,
        "personal_sort": spec(columnValues=["US"]),
    }
    current = QueryObject(
        columns=["department", "sku", "country"],
        metrics=["sales"],
        row_limit=2,
        filters=[{"col": "store", "op": "==", "val": "one"}],
    )
    history = copy(current)
    calls = []

    def execute(candidate, force_cached):
        calls.append(candidate)
        assert force_cached is True
        return {
            "df": pd.DataFrame(
                [
                    {"department": "a", "sku": "SKU-2", "sales": 40},
                    {"department": "a", "sku": "SKU-1", "sales": -5},
                ]
            )
        }

    processor = SimpleNamespace(
        _query_context=SimpleNamespace(form_data=form, queries=[current, history]),
        _personal_sort_sources=[copy(current), copy(history)],
        _personal_sort_candidates={},
        get_df_payload=execute,
    )
    app = Flask(__name__)
    app.config["SQL_MAX_ROW"] = 100
    with app.app_context():
        order = prepare_personal_sort(processor, current, True)
        assert prepare_personal_sort(processor, history, True) == order
    assert len(calls) == 1
    assert calls[0].columns == ["department", "sku"]
    assert calls[0].filter[-1] == {"col": "country", "op": "==", "val": "US"}
    assert len(current.filter) == 1
    assert current.columns == ["department", "sku", "country"]
    assert current.row_limit == 101
    assert history.personal_sort["cohort_values"] == [["a", "SKU-2"], ["a", "SKU-1"]]
    with pytest.raises(QueryObjectValidationError):
        enforce_personal_row_limit(current.personal_sort, 101)


def test_simple_sort_replaces_order_before_limit_without_extra_query():
    form = {**FORM, "personal_sort": spec(field="margin")}
    query = QueryObject(
        columns=["sku"],
        metrics=["sales", "margin"],
        row_limit=2,
        row_offset=1,
        orderby=[("sales", False)],
    )
    processor = SimpleNamespace(
        _query_context=SimpleNamespace(form_data=form, queries=[query]),
        _personal_sort_sources=[copy(query)],
    )
    assert prepare_personal_sort(processor, query, False) is None
    assert query.orderby == [("margin", False), ("sku", True)]
    assert query.row_limit == 2
    assert query.row_offset == 1


def test_no_sort_preserves_query():
    query = QueryObject(columns=["sku"], metrics=["sales"], row_limit=2)
    baseline = query.to_dict()
    processor = SimpleNamespace(
        _query_context=SimpleNamespace(form_data=FORM, queries=[query])
    )
    assert prepare_personal_sort(processor, query, False) is None
    assert query.to_dict() == baseline
