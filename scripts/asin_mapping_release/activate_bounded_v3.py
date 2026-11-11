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
"""Activate the bounded one-to-one V3 dataset without changing chart identity."""

import argparse
import inspect
import json
from pathlib import Path

from superset.app import create_app, SupersetApp

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backup", type=Path, required=True)
parser.add_argument("--apply", action="store_true")
parser.add_argument("--rollback", action="store_true")
args = parser.parse_args()
assert not (args.apply and args.rollback)
SupersetApp.sync_config_to_db = lambda self: None  # type: ignore[method-assign]
app = create_app()
with app.app_context():
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.jinja_context import ExtraCache

    dataset = db.session.get(SqlaTable, 184)
    assert dataset.table_name == "profit_dws_daily_v3_usd"
    column = next(c for c in dataset.columns if c.column_name == "cpc_cost_diff")
    metrics = [m for m in dataset.metrics if m.metric_name == "cpc_cost_diff"]
    current = {
        "sql": dataset.sql,
        "column_expression": column.expression,
        "metric_expressions": {m.metric_name: m.expression for m in metrics},
    }
    if args.rollback:
        original = json.loads(args.backup.read_text())
        dataset.sql = original["sql"]
        column.expression = original["column_expression"]
        for metric in metrics:
            metric.expression = original["metric_expressions"][metric.metric_name]
        db.session.commit()
        print(json.dumps({"dataset": dataset.id, "rolled_back": True}))
    else:
        assert (
            "require_bounded"
            in inspect.signature(ExtraCache.get_time_filter).parameters
        )
        target = Path("/app/.bounded-v3-dataset.sql").read_text()
        if dataset.sql == target and column.expression is None:
            print(json.dumps({"dataset": dataset.id, "already_applied": True}))
        else:
            assert dataset.sql is None, "Dataset changed since diagnosis"
            assert "profit_dws_daily_v3_fee_detail_usd" in (column.expression or "")
            if args.apply:
                args.backup.parent.mkdir(parents=True, exist_ok=True)
                if args.backup.exists():
                    assert json.loads(args.backup.read_text()) == current
                else:
                    args.backup.write_text(json.dumps(current, indent=2) + "\n")
                dataset.sql = target
                column.expression = None
                for metric in metrics:
                    metric.expression = "SUM(cpc_cost_diff)"
                db.session.commit()
            print(
                json.dumps(
                    {
                        "dataset": dataset.id,
                        "applied": args.apply,
                        "one_to_one_fee_join": True,
                        "bounded_fee_queries": True,
                    }
                )
            )
    db.session.rollback()
