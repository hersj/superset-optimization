"""Run standalone against actual AST methods, with no Superset app or database."""
# Isolated unittest runner and trusted-source AST execution are intentional.
# ruff: noqa: PT009, PT027, S102

from __future__ import annotations

import ast
import copy
import re
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import cast
from unittest.mock import patch

import numpy as np
import pandas as pd
from pandas import DateOffset

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "superset/models/helpers.py"


def bounds(range_):
    return tuple(datetime.fromisoformat(part.strip()) for part in range_.split(" : "))


class Query(SimpleNamespace):
    def to_dict(self):
        return {
            key: copy.deepcopy(value)
            for key, value in vars(self).items()
            if key not in {"exec_post_processing"}
        }


def query(
    axis="__timestamp", grain="P1D", start="2026-10-01", end="2026-10-04", offsets=None
):
    return Query(
        columns=[{"label": axis, "columnType": "BASE_AXIS", "timeGrain": grain}],
        granularity="event_date",
        time_range=f"{start} : {end}",
        time_shift=None,
        metrics=["metric"],
        extras={"time_grain_sqla": grain},
        row_limit=10000,
        row_offset=0,
        time_offsets=offsets or ["2026-08-05 : 2026-08-08"],
        post_processing=[],
        from_dttm=datetime.fromisoformat(start),
        to_dttm=datetime.fromisoformat(end),
        filter=[
            {
                "col": "other_date",
                "op": "TEMPORAL_RANGE",
                "val": "2026-01-01 : 2027-01-01",
            },
            {"col": "event_date", "op": "TEMPORAL_RANGE", "val": f"{start} : {end}"},
            {"col": "shop", "op": "IN", "val": ["allowed"]},
        ],
        exec_post_processing=lambda df: df,
    )


def frame(dates, values, axis="__timestamp", shops=None):
    data = {axis: pd.to_datetime(dates), "metric": values}
    if shops is not None:
        data["shop"] = shops
    return pd.DataFrame(data)


class Contract(unittest.TestCase):
    def setUp(self):
        self.cache_values = {}
        cache_values = self.cache_values

        class Cache:
            def __init__(self, key):
                self.key = key
                self.is_loaded = bool(key) and key in cache_values
                if self.is_loaded:
                    self.df = cache_values[key]["df"].copy()
                    self.query = cache_values[key]["query"]

            def set(self, key, value, **_):
                cache_values[key] = copy.deepcopy(value)

        module = ModuleType("superset.common.utils.query_cache_manager")
        module.QueryCacheManager = SimpleNamespace(get=lambda key, *_: Cache(key))
        patcher = patch.dict(sys.modules, {module.__name__: module})
        patcher.start()
        self.addCleanup(patcher.stop)

        def time_range_bounds(time_range, time_shift=None, **_):
            dates = bounds(time_range)
            return (
                tuple(
                    value + DateOffset(**ns["normalize_time_delta"](time_shift))
                    for value in dates
                )
                if time_shift
                else dates
            )

        ns = {
            "pd": pd,
            "np": np,
            "copy": copy,
            "cast": cast,
            "datetime": datetime,
            "timedelta": timedelta,
            "DateOffset": DateOffset,
            "re": re,
            "TimeDeltaAmbiguousError": ValueError,
            "QueryObjectValidationError": ValueError,
            "_": lambda value: value,
            "TIME_COMPARISON": "__",
            "DTTM_ALIAS": "__timestamp",
            "R_SUFFIX": "__r",
            "OFFSET_JOIN_COLUMN_SUFFIX": "__offset",
            "PREVIOUS_SELECTED_PERIOD": "上一选中区间",
            "FilterOperator": SimpleNamespace(TEMPORAL_RANGE="TEMPORAL_RANGE"),
            "CacheRegion": SimpleNamespace(DATA="data"),
            "CachedTimeOffset": lambda **values: values,
            "feature_flag_manager": SimpleNamespace(is_feature_enabled=lambda _: True),
            "app": SimpleNamespace(
                config={"TIME_GRAIN_JOIN_COLUMN_PRODUCERS": {}, "ROW_LIMIT": 50000}
            ),
            "get_metric_names": lambda metrics: list(metrics),
            "get_base_axis_labels": lambda columns: tuple(
                col["label"]
                for col in columns
                if isinstance(col, dict) and col.get("columnType") == "BASE_AXIS"
            ),
            "get_x_axis_label": lambda columns: (
                columns[0]["label"] if columns else None
            ),
            "get_since_until_from_time_range": time_range_bounds,
            "get_since_until_from_query_object": lambda obj: bounds(
                obj.time_range
                or next(
                    f["val"]
                    for f in reversed(obj.filter)
                    if f["op"] == "TEMPORAL_RANGE"
                )
            ),
            "get_past_or_future": lambda offset, value: (
                value + DateOffset(**ns["normalize_time_delta"](offset))
            ),
        }
        from enum import StrEnum

        ns["StrEnum"] = StrEnum
        constants = ast.parse((ROOT / "superset/constants.py").read_text())
        grain_class = next(
            node
            for node in constants.body
            if isinstance(node, ast.ClassDef) and node.name == "TimeGrain"
        )
        selected = ast.parse(
            (ROOT / "superset/utils/selected_time_ranges.py").read_text()
        )
        parser = ast.parse((ROOT / "superset/utils/date_parser.py").read_text())
        helpers = ast.parse(SOURCE.read_text())
        explorer = next(
            node
            for node in helpers.body
            if isinstance(node, ast.ClassDef) and node.name == "ExploreMixin"
        )
        names = {
            "processing_time_offsets",
            "get_query_result",
            "get_time_grain",
            "is_valid_date",
            "is_valid_date_range",
            "is_valid_date_range_static",
            "get_offset_custom_or_inherit",
            "_get_temporal_column_for_filter",
            "_process_date_range_offset",
            "_align_date_range_offset",
            "_apply_cleanup_logic",
            "_determine_join_keys",
            "_perform_join",
            "join_offset_dfs",
            "add_offset_join_column",
            "generate_join_column",
        }
        cls = ast.ClassDef(
            name="ExploreMixin",
            bases=[],
            keywords=[],
            body=[
                node
                for node in explorer.body
                if isinstance(node, ast.FunctionDef) and node.name in names
            ],
            decorator_list=[],
        )
        body = [
            ast.ImportFrom(
                module="__future__", names=[ast.alias(name="annotations")], level=0
            ),
            grain_class,
        ]
        body += [
            node
            for node in parser.body
            if isinstance(node, ast.FunctionDef) and node.name == "normalize_time_delta"
        ]
        body += [
            node
            for node in selected.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "selected_period_starts"
        ]
        body += [cls]
        exec(
            compile(
                ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])),
                str(SOURCE),
                "exec",
            ),
            ns,
        )

        def left_join_df(left_df, right_df, join_keys, rsuffix="", **_):
            return (
                left_df.set_index(join_keys)
                .join(right_df.set_index(join_keys), rsuffix=rsuffix)
                .reset_index()
            )

        ns["dataframe_utils"] = SimpleNamespace(
            left_join_df=left_join_df,
            is_datetime_series=lambda series: (
                isinstance(series, pd.Series)
                and pd.api.types.is_datetime64_any_dtype(series)
            ),
        )
        self.ns = ns
        self.source = ns["ExploreMixin"]()
        self.source.uid = "rls-dataset"
        self.source.normalize_df = lambda df, _: df.copy()
        self.calls = []
        self.offset = pd.DataFrame()
        self.source.query = self.fake_query

    def fake_query(self, obj):
        self.calls.append(copy.deepcopy(obj))
        return SimpleNamespace(
            df=self.offset.copy(),
            query="SELECT ... WHERE existing_rls",
            status="success",
        )

    def run_offset(self, main, comparison, obj=None, cache_key=None):
        self.offset = comparison
        return self.source.processing_time_offsets(
            main.copy(), obj or query(), cache_key, lambda: 300
        )["df"]

    def test_daily_values_are_not_summed_and_broadcast(self):
        output = self.run_offset(
            frame(["2026-10-01", "2026-10-02"], [100, 200]),
            frame(["2026-08-05", "2026-08-06"], [0.1, 0.2]),
        )
        self.assertEqual(output["metric__2026-08-05 : 2026-08-08"].tolist(), [0.1, 0.2])

    def test_relative_comparison_preserves_independent_dates_and_business_filters(self):
        self.source.join_offset_dfs = lambda current, *_args, **_kwargs: current
        for axis in ("sku", "__timestamp"):
            with self.subTest(axis=axis):
                obj = query(axis=axis, offsets=["1 month ago"])
                obj.filter.append({"col": "sku", "op": "ILIKE", "val": "%lamp%"})
                original = copy.deepcopy(obj.to_dict())
                main = (
                    frame(["2026-10-01"], [100])
                    if axis == "__timestamp"
                    else pd.DataFrame({"sku": ["lamp-1"], "metric": [100]})
                )
                self.run_offset(main, main, obj)
                actual = self.calls[-1]
                self.assertEqual(
                    next(
                        f["val"] for f in actual["filter"] if f["col"] == "event_date"
                    ),
                    "2026-09-01 00:00:00 : 2026-09-04 00:00:00",
                )
                self.assertEqual(
                    [f for f in actual["filter"] if f["col"] != "event_date"],
                    [f for f in original["filter"] if f["col"] != "event_date"],
                )
                self.assertEqual(obj.to_dict(), original)

    def test_missing_first_bucket_and_longer_b_are_preserved(self):
        output = self.run_offset(
            frame(["2026-10-02"], [200]), frame(["2026-08-05", "2026-08-07"], [10, 30])
        )
        indexed = output.set_index("__timestamp")
        self.assertEqual(len(output), 3)
        self.assertTrue(
            pd.isna(
                indexed.loc[
                    pd.Timestamp("2026-10-02"), "metric__2026-08-05 : 2026-08-08"
                ]
            )
        )
        self.assertTrue(pd.isna(indexed.loc[pd.Timestamp("2026-10-03"), "metric"]))

    def test_categorical_limit_preserves_current_sql_order_and_complete_history_query(
        self,
    ):
        obj = query(axis="sku")
        obj.row_limit, obj.row_offset = 10, 5
        names = ["sku-z", "sku-a", *[f"sku-{i}" for i in range(8)]]
        main = pd.DataFrame({"sku": names, "metric": range(100, 110)})
        comparison = pd.DataFrame(
            {
                "sku": [*reversed(names), *[f"old-{i}" for i in range(133)]],
                "metric": range(143),
            }
        )
        original = copy.deepcopy(obj.to_dict())
        main_before, comparison_before = main.copy(), comparison.copy()
        calls = []

        def execute(actual):
            calls.append(copy.deepcopy(actual))
            return SimpleNamespace(
                df=main.copy() if len(calls) == 1 else comparison.copy(),
                query="SELECT ... WHERE existing_rls",
                status="success",
            )

        self.source.query = execute
        result = self.source.get_query_result(obj).df
        self.assertEqual(result["sku"].tolist(), names)
        self.assertEqual(result["metric"].tolist(), list(range(100, 110)))
        self.assertEqual(
            result[f"metric__{obj.time_offsets[0]}"].tolist(), list(reversed(range(10)))
        )
        self.assertEqual(calls[0]["row_limit"], 10)
        self.assertEqual(calls[0]["row_offset"], 5)
        self.assertEqual(calls[1]["row_limit"], 50000)
        self.assertEqual(calls[1]["row_offset"], 0)
        self.assertEqual(obj.to_dict(), original)
        pd.testing.assert_frame_equal(main, main_before)
        pd.testing.assert_frame_equal(comparison, comparison_before)

    def test_categorical_history_only_rows_fill_remaining_limit_in_sql_order(self):
        main = pd.DataFrame({"sku": ["z", None, "a"], "metric": [None, 20, 10]})
        comparison = pd.DataFrame(
            {"sku": ["old-z", "a", None, "old-a", "old-m"], "metric": [9, 1, 2, 3, 4]}
        )
        for limit, expected in [
            (1, ["z"]),
            (5, ["z", None, "a", "old-z", "old-a"]),
            (100, ["z", None, "a", "old-z", "old-a", "old-m"]),
            (0, ["z", None, "a", "old-z", "old-a", "old-m"]),
        ]:
            with self.subTest(limit=limit):
                obj = query(axis="sku")
                obj.row_limit = limit
                result = self.run_offset(main, comparison, obj)
                self.assertEqual(result["sku"].tolist(), expected)
                self.assertTrue(pd.isna(result["metric"].iloc[0]))
                if limit != 1:
                    self.assertEqual(
                        result[f"metric__{obj.time_offsets[0]}"].iloc[1], 2
                    )

    def test_empty_current_categorical_limit_uses_history_sql_order(self):
        obj = query(axis="sku")
        obj.row_limit = 2
        main = pd.DataFrame({"sku": pd.Series(dtype="object"), "metric": []})
        result = self.run_offset(
            main, pd.DataFrame({"sku": ["z", "a", "m"], "metric": [30, 10, 20]}), obj
        )
        self.assertEqual(result["sku"].tolist(), ["z", "a"])
        self.assertTrue(result["metric"].isna().all())
        self.assertEqual(result[f"metric__{obj.time_offsets[0]}"].tolist(), [30, 10])

    def test_categorical_limit_matches_all_business_keys_and_null_keys(self):
        obj = query(axis="sku")
        obj.columns.append("shop")
        obj.row_limit = 3
        result = self.run_offset(
            pd.DataFrame({"sku": ["z", "z"], "shop": [None, "a"], "metric": [None, 2]}),
            pd.DataFrame(
                {
                    "sku": ["z", "old", "z", "excluded"],
                    "shop": ["a", None, None, "b"],
                    "metric": [20, 30, 10, 40],
                }
            ),
            obj,
        )
        self.assertEqual(result["sku"].tolist(), ["z", "z", "old"])
        self.assertEqual(
            result[f"metric__{obj.time_offsets[0]}"].tolist(), [10, 20, 30]
        )
        self.assertTrue(pd.isna(result["metric"].iloc[0]))
        self.assertTrue(pd.isna(result["shop"].iloc[0]))

    def test_multiple_categorical_offsets_share_one_final_limit(self):
        offsets = ["2026-08-05 : 2026-08-08", "2026-07-05 : 2026-07-08"]
        obj = query(axis="sku", offsets=offsets)
        obj.row_limit = 3
        main = pd.DataFrame({"sku": ["z"], "metric": [100]})
        result = self.source.join_offset_dfs(
            main,
            {
                offsets[0]: pd.DataFrame({"sku": ["b"], f"metric__{offsets[0]}": [20]}),
                offsets[1]: pd.DataFrame(
                    {
                        "sku": ["c", "a", "z", "b"],
                        f"metric__{offsets[1]}": [30, 40, 50, 60],
                    }
                ),
            },
            "P1D",
            ["sku"],
            query_object=obj,
        )
        self.assertEqual(result["sku"].tolist(), ["z", "b", "c"])
        self.assertEqual(result[f"metric__{offsets[1]}"].tolist(), [50, 60, 30])
        self.assertEqual(main["sku"].tolist(), ["z"])

    def test_temporal_history_extension_is_not_capped_by_categorical_limit(self):
        obj = query()
        obj.row_limit = 1
        result = self.run_offset(
            frame(["2026-10-01"], [100]),
            frame(["2026-08-05", "2026-08-06", "2026-08-07"], [10, 20, 30]),
            obj,
        )
        self.assertEqual(len(result), 3)
        self.assertEqual(
            result[f"metric__{obj.time_offsets[0]}"].tolist(), [10, 20, 30]
        )

    def test_longer_history_extends_current_axis_without_expanding_current_query(self):
        offset = "2025-09-01 : 2025-10-01"
        obj = query(start="2026-09-01", end="2026-09-08", offsets=[offset])
        original = copy.deepcopy(obj.to_dict())
        output = self.run_offset(
            frame(["2026-09-01", "2026-09-07"], [100, 700]),
            frame(["2025-09-01", "2025-09-07", "2025-09-30"], [10, 70, 300]),
            obj,
        ).set_index("__timestamp")
        self.assertEqual(
            output.loc[pd.Timestamp("2026-09-30"), f"metric__{offset}"], 300
        )
        self.assertTrue(pd.isna(output.loc[pd.Timestamp("2026-09-30"), "metric"]))
        self.assertEqual(output["metric"].sum(), 800)
        self.assertEqual(obj.to_dict(), original)
        self.assertEqual(self.calls[0]["time_range"], offset)

    def test_yearly_history_uses_month_day_without_shifting_march_by_leap_day(self):
        offset = "2023-02-27 : 2023-03-04"
        obj = query(start="2024-02-27", end="2024-03-02", offsets=[offset])
        output = self.run_offset(
            frame(
                ["2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01"], [1, 2, 3, 4]
            ),
            frame(
                ["2023-02-27", "2023-02-28", "2023-03-01", "2023-03-03"],
                [10, 20, 40, 60],
            ),
            obj,
        ).set_index("__timestamp")
        self.assertTrue(
            pd.isna(output.loc[pd.Timestamp("2024-02-29"), f"metric__{offset}"])
        )
        self.assertEqual(
            output.loc[pd.Timestamp("2024-03-01"), f"metric__{offset}"], 40
        )
        self.assertEqual(
            output.loc[pd.Timestamp("2024-03-03"), f"metric__{offset}"], 60
        )
        self.assertTrue(pd.isna(output.loc[pd.Timestamp("2024-03-03"), "metric"]))

    def test_longer_history_extends_each_calendar_grain_by_real_periods(self):
        for grain, start, end, offset, history_dates, expected in [
            (
                "P1W_SUN",
                "2026-09-06",
                "2026-09-13",
                "2025-09-07 : 2025-09-28",
                ["2025-09-07", "2025-09-14", "2025-09-21"],
                ["2026-09-06", "2026-09-13", "2026-09-20"],
            ),
            (
                "P1M",
                "2026-09-01",
                "2026-10-01",
                "2025-09-01 : 2025-12-01",
                ["2025-09-01", "2025-10-01", "2025-11-01"],
                ["2026-09-01", "2026-10-01", "2026-11-01"],
            ),
            (
                "P3M_FISCAL",
                "2026-04-01",
                "2026-07-01",
                "2025-04-01 : 2026-01-01",
                ["2025-04-01", "2025-07-01", "2025-10-01"],
                ["2026-04-01", "2026-07-01", "2026-10-01"],
            ),
            (
                "P1Y",
                "2026-01-01",
                "2027-01-01",
                "2023-01-01 : 2026-01-01",
                ["2023-01-01", "2024-01-01", "2025-01-01"],
                ["2026-01-01", "2027-01-01", "2028-01-01"],
            ),
            (
                "P1Y_FISCAL",
                "2026-04-01",
                "2027-03-31",
                "2023-04-01 : 2026-03-31",
                ["2023-04-01", "2024-04-01", "2025-04-01"],
                ["2026-04-01", "2027-04-01", "2028-04-01"],
            ),
        ]:
            with self.subTest(grain=grain):
                obj = query(grain=grain, start=start, end=end, offsets=[offset])
                output = self.run_offset(
                    frame([start], [100]),
                    frame(history_dates, [10, 20, 30]),
                    obj,
                ).sort_values("__timestamp")
                self.assertEqual(
                    output["__timestamp"].tolist(), list(pd.to_datetime(expected))
                )
                self.assertEqual(output[f"metric__{offset}"].tolist(), [10, 20, 30])
                self.assertTrue(output["metric"].iloc[1:].isna().all())
                self.assertEqual(obj.time_range, f"{start} : {end}")

    def test_historical_leap_day_is_not_merged_into_february_28_or_march_1(self):
        offset = "2024-02-27 : 2024-03-03"
        obj = query(start="2025-02-27", end="2025-03-02", offsets=[offset])
        output = self.run_offset(
            frame(["2025-02-27", "2025-02-28", "2025-03-01"], [1, 2, 3]),
            frame(
                ["2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"],
                [10, 20, 999, 30, 40],
            ),
            obj,
        ).set_index("__timestamp")
        self.assertEqual(
            output.loc[pd.Timestamp("2025-02-28"), f"metric__{offset}"], 20
        )
        self.assertEqual(
            output.loc[pd.Timestamp("2025-03-01"), f"metric__{offset}"], 30
        )
        self.assertEqual(
            output.loc[pd.Timestamp("2025-03-02"), f"metric__{offset}"], 40
        )
        self.assertNotIn(999, output[f"metric__{offset}"].tolist())

    def test_series_dimensions_do_not_cross_join(self):
        output = self.run_offset(
            frame(
                ["2026-10-01", "2026-10-02"], [100, 200], shops=["allowed", "allowed"]
            ),
            frame(["2026-08-05", "2026-08-06"], [10, 20], shops=["allowed", "allowed"]),
        )
        self.assertEqual(len(output), 2)
        self.assertEqual(output["metric__2026-08-05 : 2026-08-08"].tolist(), [10, 20])

    def test_actual_axis_name_is_not_treated_as_a_business_dimension(self):
        output = self.run_offset(
            frame(["2026-10-01"], [100], axis="event_date"),
            frame(["2026-08-05"], [10], axis="event_date"),
            query(axis="event_date"),
        )
        self.assertEqual(output["metric__2026-08-05 : 2026-08-08"].tolist(), [10])

    def test_only_bound_temporal_filter_is_replaced_and_query_is_immutable(self):
        obj = query()
        original = copy.deepcopy(obj.to_dict())
        self.run_offset(frame(["2026-10-01"], [100]), frame(["2026-08-05"], [10]), obj)
        filters = self.calls[0]["filter"]
        self.assertIn(original["filter"][0], filters)
        self.assertIn(original["filter"][2], filters)
        self.assertTrue(
            any(f["col"] == "event_date" and "2026-08-05" in f["val"] for f in filters)
        )
        self.assertEqual(obj.to_dict(), original)

    def test_current_period_comes_from_bound_filter_not_other_date(self):
        obj = query()
        obj.time_range = None
        obj.filter = [obj.filter[1], obj.filter[0], obj.filter[2]]
        output = self.run_offset(
            frame(["2026-10-01"], [100]), frame(["2026-08-05"], [10]), obj
        )
        indexed = output.set_index("__timestamp")
        self.assertEqual(
            indexed.loc[pd.Timestamp("2026-10-01"), "metric__2026-08-05 : 2026-08-08"],
            10,
        )

    def test_non_temporal_filters_on_axis_are_preserved(self):
        obj = query()
        condition = {"col": "__timestamp", "op": "IS NOT NULL"}
        obj.filter.append(condition)
        self.run_offset(frame(["2026-10-01"], [100]), frame(["2026-08-05"], [10]), obj)
        self.assertIn(condition, self.calls[0]["filter"])

    def test_week_and_month_alignment(self):
        for grain, a, b, start, end, offset in [
            (
                "P1W",
                ["2026-09-28", "2026-10-05"],
                ["2026-08-03", "2026-08-10"],
                "2026-10-01",
                "2026-10-13",
                "2026-08-05 : 2026-08-18",
            ),
            (
                "P1M",
                ["2026-10-01", "2026-11-01"],
                ["2025-02-01", "2025-03-01"],
                "2026-10-13",
                "2026-12-03",
                "2025-02-20 : 2025-04-01",
            ),
        ]:
            with self.subTest(grain=grain):
                output = self.run_offset(
                    frame(a, [100, 200]),
                    frame(b, [10, 20]),
                    query(grain=grain, start=start, end=end, offsets=[offset]),
                )
                self.assertEqual(output[f"metric__{offset}"].tolist(), [10, 20])

    def test_business_utc8_dates(self):
        for aware in [False, True]:
            a = pd.to_datetime(["2026-09-30 16:00", "2026-10-01 16:00"], utc=aware)
            b = pd.to_datetime(["2026-08-04 16:00", "2026-08-05 16:00"], utc=aware)
            with self.subTest(aware=aware):
                output = self.run_offset(frame(a, [100, 200]), frame(b, [10, 20]))
                self.assertEqual(
                    output["metric__2026-08-05 : 2026-08-08"].tolist(), [10, 20]
                )
                self.assertEqual(output["__timestamp"].tolist(), list(a))

    def test_categorical_query_without_time_granularity_replaces_only_bound_date(self):
        obj = query(
            axis="shop_name",
            start="2026-09-01",
            end="2026-09-08",
            offsets=["2026-08-05 : 2026-08-12"],
        )
        obj.granularity = None
        obj.columns[0].update(
            {
                "sqlExpression": "shop_name",
                "expressionType": "SQL",
                "isColumnReference": True,
            }
        )
        obj.filter[1]["col"] = "earliest_ship_date"
        obj.filter.append(
            {"col": "earliest_ship_date", "op": "TEMPORAL_RANGE", "val": "No filter"}
        )
        self.source.get_column = lambda col: SimpleNamespace(
            is_dttm=col in {"earliest_ship_date", "other_date"}
        )
        current = pd.DataFrame({"shop_name": ["SW1-UK"], "metric": [11895.668808]})
        comparison = pd.DataFrame({"shop_name": ["SW1-UK"], "metric": [9766.0]})

        def execute(params):
            self.calls.append(copy.deepcopy(params))
            date_filters = [
                f
                for f in params["filter"]
                if f["col"] == "earliest_ship_date" and f["op"] == "TEMPORAL_RANGE"
            ]
            is_comparison = (
                len(date_filters) == 1
                and date_filters[0]["val"]
                == "2026-08-05 00:00:00 : 2026-08-12 00:00:00"
            )
            result = (
                current
                if params.get("time_offsets")
                else (comparison if is_comparison else comparison.iloc[:0])
            )
            return SimpleNamespace(
                df=result.copy(),
                query="SELECT ... WHERE existing_rls",
                status="success",
            )

        original = copy.deepcopy(obj.to_dict())
        self.source.query = execute
        output = self.source.get_query_result(obj).df
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(obj.to_dict(), original)
        self.assertEqual(self.calls[1]["columns"], original["columns"])
        self.assertEqual(output["metric__2026-08-05 : 2026-08-12"].tolist(), [9766.0])
        self.assertEqual(self.calls[1]["granularity"], "earliest_ship_date")
        self.assertIn(obj.filter[0], self.calls[1]["filter"])
        self.assertIn(obj.filter[2], self.calls[1]["filter"])
        self.assertFalse(
            any(
                f["col"] == "shop_name" and f["op"] == "TEMPORAL_RANGE"
                for f in self.calls[1]["filter"]
            )
        )

    def test_categorical_axis_with_time_grain_pairs_business_keys_without_summing(self):
        obj = query(axis="shop")
        current = pd.DataFrame({"shop": ["SW1-UK", "A-only"], "metric": [0.12, 0.20]})
        comparison = pd.DataFrame(
            {"shop": ["SW1-UK", "B-only"], "metric": [0.10, 0.30]}
        )
        output = self.run_offset(current, comparison, obj).set_index("shop")
        baseline = "metric__2026-08-05 : 2026-08-08"
        self.assertEqual(set(output.index), {"SW1-UK", "A-only", "B-only"})
        self.assertEqual(output.loc["SW1-UK", "metric"], 0.12)
        self.assertEqual(output.loc["SW1-UK", baseline], 0.10)
        self.assertTrue(pd.isna(output.loc["A-only", baseline]))
        self.assertTrue(pd.isna(output.loc["B-only", "metric"]))
        self.assertEqual(output.loc["B-only", baseline], 0.30)

    def test_categorical_date_like_strings_are_not_temporal_buckets(self):
        obj = query(axis="shop")
        current = pd.DataFrame({"shop": ["2026-10-01"], "metric": [0.12]})
        comparison = pd.DataFrame({"shop": ["2026-10-01"], "metric": [0.10]})
        output = self.run_offset(current, comparison, obj)
        self.assertEqual(output["shop"].tolist(), ["2026-10-01"])
        self.assertEqual(output["metric__2026-08-05 : 2026-08-08"].tolist(), [0.10])

    def test_empty_current_and_both_empty_categorical_axes_keep_business_keys(self):
        obj = query(axis="shop")
        current = pd.DataFrame(
            {"shop": pd.Series(dtype="object"), "metric": pd.Series(dtype="float")}
        )
        comparison = pd.DataFrame({"shop": ["SW1-UK"], "metric": [0.10]})
        output = self.run_offset(current, comparison, obj)
        self.assertEqual(output["shop"].tolist(), ["SW1-UK"])
        self.assertTrue(pd.isna(output["metric"].iloc[0]))
        self.assertEqual(output["metric__2026-08-05 : 2026-08-08"].tolist(), [0.10])
        empty_baseline = self.run_offset(comparison, current.copy(), obj)
        self.assertEqual(empty_baseline["shop"].tolist(), ["SW1-UK"])
        self.assertTrue(
            pd.isna(empty_baseline["metric__2026-08-05 : 2026-08-08"].iloc[0])
        )
        both_empty = self.run_offset(current, current.copy(), obj)
        self.assertTrue(both_empty.empty)
        self.assertIn("shop", both_empty.columns)

    def test_calendar_month_and_quarter_units_keep_independent_ranges_without_tail(
        self,
    ):
        for grain, current_dates, comparison_dates in [
            (
                "P1M",
                ["2026-07-01", "2026-08-01", "2026-09-01"],
                ["2026-04-01", "2026-05-01", "2026-06-01"],
            ),
            ("P3M", ["2026-07-01"], ["2026-04-01"]),
            ("P3M_FISCAL", ["2026-07-01"], ["2026-04-01"]),
        ]:
            with self.subTest(grain=grain):
                obj = query(
                    grain=grain,
                    start="2026-07-01",
                    end="2026-10-01",
                    offsets=["2026-04-01 : 2026-07-01"],
                )
                expected = list(range(1, len(comparison_dates) + 1))
                output = self.run_offset(
                    frame(current_dates, [100] * len(current_dates)),
                    frame([*comparison_dates, "2026-07-01"], [*expected, 999]),
                    obj,
                )
                self.assertEqual(len(output), len(current_dates))
                self.assertEqual(
                    output["metric__2026-04-01 : 2026-07-01"].tolist(), expected
                )
                request = self.calls[-1]
                self.assertEqual(request["from_dttm"], datetime(2026, 4, 1))
                self.assertEqual(request["to_dttm"], datetime(2026, 7, 1))
                self.assertEqual(request["time_range"], "2026-04-01 : 2026-07-01")
                self.assertEqual(request["granularity"], "event_date")
                self.assertEqual(request["columns"], obj.columns)
                self.assertIsNone(request["inner_from_dttm"])
                self.assertIsNone(request["inner_to_dttm"])
                self.assertEqual(
                    [f["val"] for f in request["filter"] if f["col"] == "event_date"],
                    ["2026-04-01 00:00:00 : 2026-07-01 00:00:00"],
                )
                self.assertIn(obj.filter[0], request["filter"])

    def test_calendar_year_and_fiscal_year_do_not_extend_shorter_baseline(self):
        for grain, start, end, b_start, b_end in [
            ("P1Y", "2024-01-01", "2025-01-01", "2023-01-01", "2024-01-01"),
            ("P1Y_FISCAL", "2023-04-01", "2024-03-31", "2022-04-01", "2023-03-31"),
        ]:
            with self.subTest(grain=grain):
                offset = f"{b_start} : {b_end}"
                obj = query(grain=grain, start=start, end=end, offsets=[offset])
                expected = 0.10
                if grain == "P1Y_FISCAL":
                    # Model the SQL boundary before its one-row fiscal-year aggregation.
                    records = frame(
                        [b_start, "2023-03-30", b_end, "2023-04-01"],
                        [10, 20, 999, 9999],
                    )

                    def execute(params, records=records, b_start=b_start):
                        self.calls.append(copy.deepcopy(params))
                        selected = records.copy()
                        for condition in params["filter"]:
                            if (
                                condition["col"] == "event_date"
                                and condition["op"] == "TEMPORAL_RANGE"
                            ):
                                low, high = bounds(condition["val"])
                                selected = selected[
                                    (selected["__timestamp"] >= low)
                                    & (selected["__timestamp"] < high)
                                ]
                        result = frame([b_start], [selected["metric"].sum()])
                        return SimpleNamespace(
                            df=result,
                            query="SELECT SUM(metric) ... WHERE existing_rls",
                            status="success",
                        )

                    self.source.query = execute
                    expected = 30
                output = self.run_offset(
                    frame([start], [0.12]), frame([b_start, b_end], [0.10, 999]), obj
                )
                self.assertEqual(len(output), 1)
                self.assertEqual(output[f"metric__{offset}"].tolist(), [expected])
                self.assertEqual(self.calls[-1]["time_range"], offset)
                self.assertEqual(
                    self.calls[-1]["to_dttm"], datetime.fromisoformat(b_end)
                )

    def test_daily_month_selection_preserves_92_current_and_only_91_baseline_days(self):
        obj = query(
            start="2026-07-01", end="2026-10-01", offsets=["2026-04-01 : 2026-07-01"]
        )
        output = self.run_offset(
            frame(pd.date_range("2026-07-01", "2026-09-30"), [100] * 92),
            frame(pd.date_range("2026-04-01", "2026-07-01"), [*range(1, 92), 999]),
            obj,
        ).sort_values("__timestamp")
        baseline = output["metric__2026-04-01 : 2026-07-01"]
        self.assertEqual(len(output), 92)
        self.assertEqual(baseline.iloc[:-1].tolist(), list(range(1, 92)))
        self.assertTrue(pd.isna(baseline.iloc[-1]))
        self.assertNotIn(999, baseline.tolist())
        self.assertEqual(self.calls[-1]["to_dttm"], datetime(2026, 7, 1))

    def test_daily_leap_year_differences_preserve_real_buckets_not_extra_end_dates(
        self,
    ):
        for start, end, b_start, b_end, a_days, b_days in [
            ("2024-01-01", "2025-01-01", "2023-01-01", "2024-01-01", 366, 365),
            ("2023-01-01", "2024-01-01", "2024-01-01", "2025-01-01", 365, 366),
        ]:
            with self.subTest(current_days=a_days):
                offset = f"{b_start} : {b_end}"
                obj = query(start=start, end=end, offsets=[offset])
                current_dates = pd.date_range(start, end, inclusive="left")
                comparison_dates = pd.date_range(b_start, b_end, inclusive="both")
                output = self.run_offset(
                    frame(current_dates, [100] * a_days),
                    frame(comparison_dates, [*range(1, b_days + 1), 999]),
                    obj,
                ).sort_values("__timestamp")
                baseline = output[f"metric__{offset}"]
                self.assertEqual(len(output), a_days)
                expected = [
                    index + 1
                    for index, date in enumerate(comparison_dates[:-1])
                    if not (b_days > a_days and date.month == 2 and date.day == 29)
                ]
                self.assertEqual(baseline.dropna().tolist(), expected)
                self.assertNotIn(999, baseline.tolist())
                self.assertEqual(int(baseline.isna().sum()), int(a_days > b_days))
                self.assertEqual(baseline.iloc[-1], b_days)
                self.assertEqual(
                    self.calls[-1]["to_dttm"], datetime.fromisoformat(b_end)
                )

    def test_calendar_categories_keep_whole_period_ratios_by_business_key(self):
        obj = query(
            axis="shop_name",
            grain="P1M",
            start="2026-07-01",
            end="2026-10-01",
            offsets=["2026-04-01 : 2026-07-01"],
        )
        current = pd.DataFrame(
            {"shop_name": ["SW1-UK", "A-only"], "metric": [0.12, 0.20]}
        )
        comparison = pd.DataFrame(
            {"shop_name": ["SW1-UK", "B-only"], "metric": [0.10, 0.30]}
        )
        output = self.run_offset(current, comparison, obj).set_index("shop_name")
        baseline = "metric__2026-04-01 : 2026-07-01"
        self.assertEqual(set(output.index), {"SW1-UK", "A-only", "B-only"})
        self.assertEqual(output.loc["SW1-UK", baseline], 0.10)
        self.assertEqual(output.loc["B-only", baseline], 0.30)
        self.assertTrue(pd.isna(output.loc["A-only", baseline]))
        self.assertTrue(pd.isna(output.loc["B-only", "metric"]))
        self.assertEqual(self.calls[-1]["to_dttm"], datetime(2026, 7, 1))

    def test_no_axis_ratio_is_not_summed(self):
        obj = query()
        obj.columns = []
        output = self.run_offset(
            pd.DataFrame({"metric": [0.12]}), pd.DataFrame({"metric": [0.10]}), obj
        )
        self.assertEqual(output["metric__2026-08-05 : 2026-08-08"].tolist(), [0.10])

    def test_duplicate_ordinal_dimension_keys_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate|unique"):
            self.run_offset(
                frame(["2026-10-01"], [100]),
                frame(["2026-08-05", "2026-08-05"], [10, 20]),
            )

    def test_empty_a_still_queries_b_in_real_get_query_result_chain(self):
        main = frame([], [])
        self.offset = frame(["2026-08-05"], [10])
        calls = []

        def execute(obj):
            calls.append(obj)
            return SimpleNamespace(
                df=main.copy() if len(calls) == 1 else self.offset.copy(),
                query="SELECT ... WHERE existing_rls",
                status="success",
            )

        self.source.query = execute
        output = self.source.get_query_result(query()).df
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(output), 1)
        self.assertTrue(pd.isna(output["metric"].iloc[0]))

    def test_cache_range_identity_and_warm_results(self):
        main = frame(["2026-10-01"], [100])
        comparison = frame(["2026-08-05"], [10])
        keys = []

        def key(obj, offset, grain):
            value = repr((offset, obj.from_dttm, obj.to_dttm, obj.filter, grain))
            keys.append(value)
            return value

        first = self.run_offset(main, comparison, query(), key)
        second = self.run_offset(main, comparison, query(), key)
        self.assertEqual(len(self.calls), 1)
        pd.testing.assert_frame_equal(first, second)
        other = query(offsets=["2026-08-06 : 2026-08-09"])
        self.run_offset(main, frame(["2026-08-06"], [20]), other, key)
        self.assertNotEqual(keys[0], keys[-1])
        self.assertEqual(len(self.calls), 2)

    def test_relative_offset_path_remains_calendar_shift(self):
        main = frame(["2026-10-01", "2026-10-02"], [100, 200])
        comparison = frame(["2026-09-01", "2026-09-02"], [10, 20])
        comparison = comparison.rename(columns={"metric": "metric__1 month ago"})
        output = self.source.join_offset_dfs(
            main, {"1 month ago": comparison}, "P1D", ["__timestamp"]
        )
        self.assertEqual(output["metric"].tolist(), [100, 200])
        self.assertEqual(output["metric__1 month ago"].tolist(), [10, 20])

    def test_explicit_disabled_flag_remains_respected(self):
        self.ns["feature_flag_manager"].is_feature_enabled = lambda _: False
        with self.assertRaisesRegex(
            ValueError, "Date range timeshifts are not enabled"
        ):
            self.run_offset(frame(["2026-10-01"], [100]), frame(["2026-08-05"], [10]))

    def test_date_range_feature_default_is_enabled(self):
        config = ast.parse((ROOT / "superset/config.py").read_text())
        flags = next(
            node.value
            for node in config.body
            if isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == "DEFAULT_FEATURE_FLAGS"
        )
        self.assertTrue(ast.literal_eval(flags)["DATE_RANGE_TIMESHIFTS_ENABLED"])


class CompareContract(unittest.TestCase):
    def setUp(self):
        from enum import StrEnum

        constants = ast.parse((ROOT / "superset/constants.py").read_text())
        enum = next(
            node
            for node in constants.body
            if isinstance(node, ast.ClassDef)
            and node.name == "PandasPostprocessingCompare"
        )
        source = ROOT / "superset/utils/pandas_postprocessing/compare.py"
        fn = next(
            node
            for node in ast.parse(source.read_text()).body
            if isinstance(node, ast.FunctionDef) and node.name == "compare"
        )
        fn.decorator_list = []
        ns = {
            "pd": pd,
            "re": re,
            "StrEnum": StrEnum,
            "InvalidPostProcessingError": ValueError,
            "_": lambda value: value,
            "TIME_COMPARISON": "__",
            "PREVIOUS_SELECTED_PERIOD": "上一选中区间",
        }
        body = [
            ast.ImportFrom(
                module="__future__", names=[ast.alias(name="annotations")], level=0
            ),
            enum,
            fn,
        ]
        exec(
            compile(
                ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])),
                str(source),
                "exec",
            ),
            ns,
        )
        self.compare = ns["compare"]
        self.kind = ns["PandasPostprocessingCompare"]

    def run_compare(self, current, baseline, kind, suffix="2026-08-05 : 2026-08-08"):
        name = f"metric__{suffix}"
        output = self.compare(
            pd.DataFrame({"metric": current, name: baseline}), ["metric"], [name], kind
        )
        return output.iloc[:, -1]

    def test_date_range_zero_baseline_is_missing_for_percentage_and_ratio(self):
        for kind in [self.kind.PCT, self.kind.RAT]:
            with self.subTest(kind=kind):
                self.assertTrue(pd.isna(self.run_compare([5], [0], kind).iloc[0]))

    def test_date_range_negative_percentage_denominator_is_absolute(self):
        self.assertEqual(
            self.run_compare([-50, 50], [-100, -100], self.kind.PCT).tolist(),
            [0.5, 1.5],
        )
        self.assertEqual(
            self.run_compare([-50, 50], [-100, -100], self.kind.RAT).tolist(),
            [0.5, -0.5],
        )

    def test_relative_percentage_and_zero_behavior_remain_unchanged(self):
        output = self.run_compare([-50, 5], [-100, 0], self.kind.PCT, "1 month ago")
        self.assertEqual(output.iloc[0], -0.5)
        self.assertTrue(np.isposinf(output.iloc[1]))
        self.assertTrue(
            pd.isna(self.run_compare([5], [0], self.kind.PCT, "上一选中区间").iloc[0])
        )

    def test_difference_is_unchanged_and_ordinary_column_is_not_a_time_offset(self):
        self.assertEqual(
            self.run_compare([-50, 5], [-100, 0], self.kind.DIFF).tolist(), [50, 5]
        )
        self.assertEqual(
            self.run_compare(
                [-50], [-100], self.kind.PCT, "2026-08-05 : 2026-08-08 notes"
            ).iloc[0],
            -0.5,
        )

    def test_multiindex_series_compare_uses_the_corresponding_baseline(self):
        name = "metric__2026-08-05 : 2026-08-08"
        cols = pd.MultiIndex.from_tuples(
            [
                ("metric", "shop-a"),
                ("metric", "shop-b"),
                (name, "shop-a"),
                (name, "shop-b"),
            ]
        )
        output = self.compare(
            pd.DataFrame([[5, -50, 0, -100]], columns=cols),
            ["metric"],
            [name],
            self.kind.PCT,
        )
        metric_name = "__".join([self.kind.PCT, "metric", name])
        self.assertTrue(pd.isna(output[(metric_name, "shop-a")].iloc[0]))
        self.assertEqual(output[(metric_name, "shop-b")].iloc[0], 0.5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
