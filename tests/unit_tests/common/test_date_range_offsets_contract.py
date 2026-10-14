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
        ns = {
            "pd": pd,
            "np": np,
            "copy": copy,
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
            "get_x_axis_label": lambda columns: columns[0]["label"]
            if columns
            else None,
            "get_since_until_from_time_range": lambda time_range, **_: bounds(
                time_range
            ),
            "get_since_until_from_query_object": lambda obj: bounds(
                obj.time_range
                or next(
                    f["val"]
                    for f in reversed(obj.filter)
                    if f["op"] == "TEMPORAL_RANGE"
                )
            ),
            "get_past_or_future": lambda offset, value: value
            + DateOffset(**ns["normalize_time_delta"](offset)),
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
            is_datetime_series=lambda series: isinstance(series, pd.Series)
            and pd.api.types.is_datetime64_any_dtype(series),
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
