# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements. See the NOTICE file
# distributed with this work for additional information regarding
# copyright ownership. The ASF licenses this file to You under the
# Apache License, Version 2.0 (the "License"); you may not use this
# file except in compliance with the License. You may obtain a copy
# of the License at http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Compile actual cascade SQL methods without a Flask app or database."""

# ruff: noqa: PT009, PT027, S102, TID251
from __future__ import annotations
import __future__

import ast
import importlib.util
import json
import re
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from dateutil.relativedelta import relativedelta
from sqlalchemy import bindparam, text

ROOT = Path(__file__).resolve().parents[3]


def get_bounds(time_range=None, time_shift=None):
    start, end = (datetime.fromisoformat(x.strip()) for x in time_range.split(" : "))
    if time_shift:
        match = re.fullmatch(r"(\d+) (day|week|month|year)s? ago", time_shift)
        if not match:
            raise ValueError("Invalid time shift")
        delta = relativedelta(**{match[2] + "s": int(match[1])})
        start, end = start - delta, end - delta
    return start, end


def load_command():
    spec = importlib.util.spec_from_file_location(
        "selected_ranges_contract", ROOT / "superset/utils/selected_time_ranges.py"
    )
    ranges = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ranges)
    source = ROOT / "superset/commands/dashboard/cascade_filter_options.py"
    tree = ast.parse(source.read_text())
    cls = next(
        n
        for n in tree.body
        if isinstance(n, ast.ClassDef) and n.name == "GetCascadeFilterOptionsCommand"
    )
    wanted = {
        "__init__",
        "_get_cache_key",
        "_build_statement",
        "_resolve_time_range",
        "_option_time_ranges",
    }
    cls.body = [
        n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name in wanted
    ]
    cls.bases = []
    helpers = [
        n
        for n in tree.body
        if isinstance(n, ast.FunctionDef)
        and n.name in {"quote_identifier", "quote_table_name", "get_dataset_table_name"}
    ]
    namespace = {
        "json": json,
        "bindparam": bindparam,
        "text": text,
        "parse_selected_time_ranges": ranges.parse_selected_time_ranges,
        "get_since_until_from_time_range": get_bounds,
        "PREVIOUS_SELECTED_PERIOD": ranges.PREVIOUS_SELECTED_PERIOD,
    }
    exec(
        compile(
            ast.Module(body=[*helpers, cls], type_ignores=[]),
            str(source),
            "exec",
            flags=__future__.annotations.compiler_flag,
        ),
        namespace,
    )
    return namespace["GetCascadeFilterOptionsCommand"]


class ComparisonOptions(unittest.TestCase):
    def command(self, **kwargs):
        command = load_command()(
            87,
            184,
            ["sku", "country"],
            time_range="2026-10-01 : 2026-11-01",
            time_column="event_date",
            **kwargs,
        )
        command._get_filter_metadata = lambda: {
            "columns": ["sku", "country", "shop"],
            "parent_columns_by_column": {"sku": ["shop"], "country": []},
            "time_columns": {"event_date"},
            "applicable_time_filter_count": 1,
        }
        return command

    def statement(self, command):
        dataset = SimpleNamespace(
            schema="public", table_name="events", main_dttm_col="wrong_date", columns=[]
        )
        start, end = command._resolve_time_range()
        return command._build_statement(dataset, start, end, ["(tenant_id = 7)"])

    def test_custom_union_keeps_binding_parent_and_rls_in_every_column(self):
        command = self.command(
            comparison_time_ranges=["2026-08-01 : 2026-09-01"],
            applied_filters={"shop": ["allowed"]},
        )
        sql, params = self.statement(command)
        self.assertNotIn('"wrong_date"', str(sql))
        self.assertEqual(str(sql).count("(tenant_id = 7)"), 2)
        self.assertEqual(str(sql).count(" OR "), 2)
        self.assertEqual(params["column_0_parent_0_values"], ["allowed"])
        self.assertEqual(
            {v for k, v in params.items() if k.startswith("range_")},
            {
                datetime(2026, 8, 1),
                datetime(2026, 9, 1),
                datetime(2026, 10, 1),
                datetime(2026, 11, 1),
            },
        )

    def test_relative_history_is_resolved_before_one_union_query(self):
        sql, params = self.statement(self.command(time_offsets=["1 month ago"]))
        self.assertIn(" OR ", str(sql))
        self.assertIn(datetime(2026, 9, 1), params.values())
        self.assertIn(datetime(2026, 11, 1), params.values())

    def test_comparison_is_part_of_existing_cache_identity(self):
        first = self.command(comparison_time_ranges=["2026-08-01 : 2026-09-01"])
        second = self.command(comparison_time_ranges=["2026-07-01 : 2026-08-01"])
        self.assertNotEqual(first._get_cache_key(), second._get_cache_key())

    def test_invalid_history_and_wrong_binding_fail_before_sql(self):
        for invalid in [
            ["2026-02-30 : 2026-03-05"],
            ["No filter"],
            [],
            "2026-08-01 : 2026-09-01",
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.statement(self.command(comparison_time_ranges=invalid))
        command = self.command(time_offsets=["1 month ago"])
        command._time_column = "unconfigured_date"
        with self.assertRaises(ValueError):
            self.statement(command)

    def test_selected_period_comparison_does_not_expand_the_selected_dates(self):
        command = self.command(
            time_offsets=["上一选中区间"],
            time_ranges=["2026-10-01 : 2026-10-05", "2026-10-20 : 2026-11-01"],
        )
        sql, params = self.statement(command)
        self.assertEqual(str(sql).count(" OR "), 2)
        self.assertEqual(len([k for k in params if k.startswith("range_")]), 4)


if __name__ == "__main__":
    unittest.main()
