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
"""Validate viewer sorting against chart identities, never free-form SQL."""

from __future__ import annotations

from typing import Any

from superset.utils import json


def _list(value: Any) -> list[Any]:
    return [] if value is None else value if isinstance(value, list) else [value]


def column_label(column: Any) -> str:
    if isinstance(column, str):
        return column
    if isinstance(column, dict):
        return column.get("label") or column.get("sqlExpression") or ""
    return ""


def metric_label(metric: Any) -> str:
    return metric if isinstance(metric, str) else metric.get("label", "")


def _temporal_axis(form_data: dict[str, Any], label: str) -> bool:
    viz_type = form_data.get("viz_type", "")
    return bool(
        (viz_type.startswith("echarts_timeseries") or viz_type == "mixed_timeseries")
        and label == column_label(form_data.get("x_axis"))
        and (
            label == form_data.get("granularity_sqla")
            or (form_data.get("temporal_columns_lookup") or {}).get(label)
        )
    )


def _metric_option(metric: Any, query: str | None) -> dict[str, Any] | None:
    if not isinstance(metric, (str, dict)) or not metric:
        return None
    name = metric_label(metric)
    identity = metric if isinstance(metric, str) else metric.get("optionName") or name
    return (
        {
            "value": f"{query}:{identity}" if query else identity,
            "label": name,
            "kind": "metric",
            "metric": metric,
            "query": query,
        }
        if identity
        else None
    )


def get_sort_options(form_data: dict[str, Any]) -> list[dict[str, Any]]:
    viz_type = form_data.get("viz_type", "")
    if viz_type in ("big_number", "big_number_total"):
        return []
    mixed = viz_type == "mixed_timeseries"
    options: list[dict[str, Any]] = []
    metrics = sum(
        (
            _list(form_data.get(key))
            for key in (
                ("metrics", "metric", "metric_2", "x", "y", "size")
                if viz_type == "bubble_v2"
                else ("metrics", "metric", "metric_2")
            )
        ),
        [],
    )
    groups = [(metrics, "A" if mixed else None)]
    if mixed:
        groups.append((_list(form_data.get("metrics_b")), "B"))
    for items, query in groups:
        for metric in items:
            if option := _metric_option(metric, query):
                options.append(option)
    if viz_type == "pivot_table_v2":
        dimensions = _list(
            form_data.get(
                "groupbyColumns" if form_data.get("transpose_pivot") else "groupbyRows"
            )
        )
    else:
        dimensions = sum(
            (
                _list(form_data.get(key))
                for key in (
                    "x_axis",
                    "y_axis_dimension",
                    "groupby",
                    "columns",
                    "all_columns",
                    "entity",
                    "series",
                )
            ),
            [],
        )
    for column in dimensions:
        label = column_label(column)
        if label and label != "__timestamp" and not _temporal_axis(form_data, label):
            options.append(
                {"value": label, "label": label, "kind": "name", "column": column}
            )
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for option in options:
        unique.setdefault((option["value"], option["kind"]), option)
    return list(unique.values())


def validate_chart_sort(payload: Any, form_data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) - {
        "mode",
        "field",
        "direction",
        "customOrder",
        "columnValues",
    }:
        raise ValueError(
            "Sort must contain only mode, field, direction and optional ordering values"
        )
    mode, field, direction = (
        payload.get(key) for key in ("mode", "field", "direction")
    )
    if (
        mode not in ("metric", "name", "custom")
        or direction not in ("asc", "desc")
        or not isinstance(field, str)
    ):
        raise ValueError("Invalid personal sort mode, direction or field")
    kind = "metric" if mode == "metric" else "name"
    if not any(
        option["value"] == field and option["kind"] == kind
        for option in get_sort_options(form_data)
    ):
        raise ValueError("Sort field is not available in this chart")
    result: dict[str, Any] = {"mode": mode, "field": field, "direction": direction}
    if mode == "custom":
        values = payload.get("customOrder")
        if (
            not isinstance(values, list)
            or len(values) > 1000
            or any(not isinstance(value, str) or len(value) > 4096 for value in values)
        ):
            raise ValueError(
                "Custom order must contain at most 1000 original category values"
            )
        values = list(dict.fromkeys(values))
        if len(json.dumps(values, ensure_ascii=False)) > 65536:
            raise ValueError("Custom order is too large")
        result["customOrder"] = values
    if "columnValues" in payload:
        columns = _list(
            form_data.get(
                "groupbyRows" if form_data.get("transpose_pivot") else "groupbyColumns"
            )
        )
        values = payload["columnValues"]
        if (
            mode != "metric"
            or form_data.get("viz_type") != "pivot_table_v2"
            or not isinstance(values, list)
            or len(values) != len(columns)
            or any(not isinstance(value, str) or len(value) > 4096 for value in values)
        ):
            raise ValueError(
                "Column context must match this pivot table's column dimensions"
            )
        result["columnValues"] = list(values)
    return result
