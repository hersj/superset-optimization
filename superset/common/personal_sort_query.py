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
"""Resolve trusted viewer ordering before SQL limits, sharing current-period keys.

Candidate queries use the same datasource, filters, RLS and query cache as their
parent. Only their grouping changes; the main query retains every pivot column.
"""

from __future__ import annotations

from copy import copy, deepcopy
from typing import Any

from flask import current_app

from superset.common.personal_sort import (
    column_label,
    get_sort_options,
    validate_chart_sort,
)
from superset.exceptions import QueryObjectValidationError
from superset.utils import json


def _ranking_dimensions(form: dict[str, Any], source: Any) -> list[Any]:
    if form.get("viz_type") == "pivot_table_v2":
        return (
            form.get("groupbyColumns" if form.get("transpose_pivot") else "groupbyRows")
            or []
        )
    if form.get("y_axis_dimension"):
        return [form["y_axis_dimension"]]
    if source.is_timeseries:
        return source.series_columns or form.get("groupby") or []
    if form.get("x_axis"):
        return [form["x_axis"]]
    return source.columns


def prepare_personal_sort(
    processor: Any, query: Any, force_cached: bool | None
) -> dict[str, Any] | None:
    if getattr(query, "_personal_sort_candidate", False):
        return None
    if getattr(query, "_personal_sort_prepared", False):
        return getattr(query, "_personal_sort_order", None)
    form = processor._query_context.form_data or {}
    payload = form.get("personal_sort") or query.personal_sort
    if not isinstance(payload, dict) or not payload:
        return None
    try:
        sort = validate_chart_sort(payload, form)
    except ValueError as ex:
        raise QueryObjectValidationError(str(ex)) from ex
    options = get_sort_options(form)
    option = next(
        item
        for item in options
        if item["value"] == sort["field"]
        and item["kind"] == ("metric" if sort["mode"] == "metric" else "name")
    )
    source = processor._personal_sort_sources[1 if option.get("query") == "B" else 0]
    source = copy(source)
    source._personal_sort_candidate = True
    source.personal_sort = dict(sort)
    viz = form.get("viz_type", "")
    dimensions = _ranking_dimensions(form, source)
    names = [column_label(col) for col in dimensions]
    available = {column_label(col): col for col in source.columns}
    dimensions = [
        available.get(name, col) for name, col in zip(names, dimensions, strict=True)
    ]
    ascending = sort["direction"] == "asc"
    ordering = option.get("metric") if sort["mode"] == "metric" else option["column"]
    orderby = [(ordering, ascending)] + [
        (col, True) for col in dimensions if column_label(col) != column_label(ordering)
    ]
    complex_query = bool(dimensions) and (
        len(dimensions) != len(source.columns)
        or source.is_timeseries
        or source.time_offsets
        or len(processor._query_context.queries) > 1
        or viz == "pivot_table_v2"
    )
    query.personal_sort = dict(sort)
    query.orderby = orderby
    query.series_limit = 0
    query._personal_sort_prepared = True
    if not complex_query:
        return None
    source.columns = dimensions
    source.metrics = [option["metric"]] if sort["mode"] == "metric" else []
    source.is_timeseries = False
    source.time_offsets = []
    source.post_processing = []
    source.annotation_layers = []
    source.series_limit = 0
    source.series_columns = []
    source.series_limit_metric = None
    source.row_offset = query.row_offset
    source.row_limit = min(
        form.get("row_limit") or source.row_limit or current_app.config["SQL_MAX_ROW"],
        current_app.config["SQL_MAX_ROW"],
    )
    source.orderby = orderby
    source.filter = deepcopy(source.filter)
    if "columnValues" in sort:
        columns = (
            form.get("groupbyRows" if form.get("transpose_pivot") else "groupbyColumns")
            or []
        )
        source.filter.extend(
            {"col": col, "op": "==", "val": value}
            for col, value in zip(columns, sort["columnValues"], strict=True)
        )
    cache = processor._personal_sort_candidates
    key = json.dumps(source.to_dict(), sort_keys=True, default=str)
    if key not in cache:
        result = processor.get_df_payload(source, force_cached)
        if result.get("error"):
            raise QueryObjectValidationError(result["error"])
        frame = result["df"]
        cache[key] = {
            "columns": names,
            "values": frame[names]
            .astype(object)
            .where(frame[names].notna(), None)
            .values.tolist(),
        }
    order = cache[key]
    query.personal_sort.update(cohort_columns=dimensions, cohort_values=order["values"])
    # Retrieve all columns/periods of selected keys, never a separately truncated TopN.
    limit = current_app.config["SQL_MAX_ROW"]
    query.personal_sort["record_limit"] = limit
    query.row_limit = limit + 1
    query.row_offset = 0
    query.orderby = [
        (col, True) for col in query.columns if column_label(col) != "__timestamp"
    ]
    query._personal_sort_order = order
    return order
