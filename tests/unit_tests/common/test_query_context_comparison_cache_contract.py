"""Exercise actual processor methods without creating an app or accessing a DB."""
# ruff: noqa: PT009, PT027, S102
from __future__ import annotations

import ast
import copy
import json
import unittest
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "superset/common/query_context_processor.py"


class Query(SimpleNamespace):
    def to_dict(self):
        return copy.deepcopy(vars(self))

    def cache_key(self, **extra):
        return json.dumps({**self.to_dict(), **extra}, sort_keys=True, default=str)


class ContributionQueries(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.role = "viewer-a"
        self.during_main = lambda: None
        self.fail_main = False
        self.datasource = SimpleNamespace(
            uid="market", changed_on="stable", get_extra_cache_keys=lambda _: [],
            get_query_result=self.execute,
        )
        self.main = Query(
            columns=["brand"], metrics=["sales"], row_limit=10,
            filter=[{"col": "brand", "op": "IN", "val": ["selected"]}],
            time_range="2026-10-01 : 2026-11-01", time_offsets=[], result_type="full",
            post_processing=[{"operation": "contribution", "options": {}}],
        )
        self.total = Query(
            columns=[], metrics=["sales"], row_limit=10,
            filter=[{"col": "country", "op": "IN", "val": ["US"]}],
            time_range=self.main.time_range, time_offsets=[], result_type="full",
            post_processing=[],
        )
        self.context = SimpleNamespace(
            datasource=self.datasource, queries=[self.main, self.total],
            force=True, result_type="full",
            cache_values={"queries": [self.main.to_dict(), self.total.to_dict()]},
        )
        namespace = {
            "Any": object, "QueryResult": object,
            "security_manager": SimpleNamespace(get_rls_cache_key=lambda _: self.role),
            "get_query_results": self.query_results,
        }
        tree = ast.parse(SOURCE.read_text())
        original = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "QueryContextProcessor")
        methods = {"__init__", "query_cache_key", "get_query_result", "_prepare_contribution_totals", "ensure_totals_available", "get_payload"}
        cls = ast.ClassDef(name="QueryContextProcessor", bases=[], keywords=[], decorator_list=[],
                          body=[n for n in original.body if isinstance(n, ast.FunctionDef) and n.name in methods])
        module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), cls], type_ignores=[])
        exec(compile(ast.fix_missing_locations(module), str(SOURCE), "exec"), namespace)
        self.processor = namespace["QueryContextProcessor"](self.context)
        self.context.get_query_result = self.processor.get_query_result

    def execute(self, query):
        self.calls.append(query.to_dict())
        return SimpleNamespace(df=pd.DataFrame({"sales": [100 if query.columns else 1000]}))

    def query_results(self, _type, context, query, force_cached):
        if query.columns:
            self.during_main()
            if self.fail_main:
                raise ValueError("query failed")
        result = context.get_query_result(query)
        return {"data": result.df.to_dict(orient="records")}

    def total_calls(self):
        return [q for q in self.calls if not q["columns"]]

    def test_forced_request_executes_full_market_total_once(self):
        before = copy.deepcopy(self.total.filter)
        self.processor.get_payload()
        self.assertEqual(len(self.total_calls()), 1)
        self.assertEqual(self.total.filter, before)
        self.assertIsNone(self.total.row_limit)
        self.assertEqual(self.main.post_processing[0]["options"]["contribution_totals"], {"sales": 1000})

    def test_force_refresh_executes_again_in_next_payload(self):
        self.processor.get_payload()
        self.processor.get_payload()
        self.assertEqual(len(self.total_calls()), 2)

    def test_changed_filters_do_not_reuse_total(self):
        self.during_main = lambda: self.total.filter.append({"col": "shop", "op": "IN", "val": ["shop-a"]})
        self.processor.get_payload()
        self.assertEqual(len(self.total_calls()), 2)

    def test_changed_rls_does_not_reuse_total(self):
        self.during_main = lambda: setattr(self, "role", "viewer-b")
        self.processor.get_payload()
        self.assertEqual(len(self.total_calls()), 2)

    def test_failed_request_does_not_leave_reusable_total(self):
        self.fail_main = True
        with self.assertRaisesRegex(ValueError, "query failed"):
            self.processor.get_payload()
        self.processor.get_query_result(self.total)
        self.assertEqual(len(self.total_calls()), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
