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
    _temporal_axis,
    column_label,
    get_mixed_sort_dimensions,
    get_sort_options,
    validate_chart_sort,
)
from superset.exceptions import QueryObjectValidationError
from superset.utils import json
from superset.utils.core import apply_max_row_limit


def _ranking_dimensions(form: dict[str, Any], source: Any) -> list[Any]:
    if form.get("viz_type") == "mixed_timeseries":
        return get_mixed_sort_dimensions(form)
    if form.get("viz_type") == "pivot_table_v2":
        return (
            form.get("groupbyColumns" if form.get("transpose_pivot") else "groupbyRows")
            or []
        )
    if form.get("y_axis_dimension"):
        return [form["y_axis_dimension"]]
    if source.is_timeseries or _temporal_axis(form, column_label(form.get("x_axis"))):
        return source.series_columns or form.get("groupby") or []
    if form.get("x_axis"):
        return [form["x_axis"]]
    return source.columns


def _source_query(processor: Any, option: dict[str, Any]) -> Any:
    if getattr(processor, "_personal_sort_sources", None) is None:
        processor._personal_sort_sources = [
            copy(item) for item in processor._query_context.queries
        ]
    source_index = 1 if option.get("query") == "B" else 0
    if source_index >= len(processor._personal_sort_sources):
        raise QueryObjectValidationError("Personal sort source query is missing")
    return copy(processor._personal_sort_sources[source_index])


def _has_multiple_periods(processor: Any, source: Any) -> bool:
    return any(
        item.columns and not item.is_rowcount and item.time_range != source.time_range
        for item in processor._personal_sort_sources
    )


def _candidate_row_limit(form_limit: Any, query_limit: int | None) -> int:
    # Old saved forms contain numeric strings; zero/empty retain default semantics.
    if isinstance(form_limit, bool):
        raise QueryObjectValidationError(
            "Personal sort row limit must be a positive integer"
        )
    value = query_limit if form_limit in (None, 0, "", "0") else form_limit
    if isinstance(value, bool) or not isinstance(value, (int, str, type(None))):
        raise QueryObjectValidationError(
            "Personal sort row limit must be a positive integer"
        )
    if value in (None, 0, "", "0"):
        value = current_app.config["SQL_MAX_ROW"]
    try:
        limit = int(value)
    except (ValueError, TypeError) as ex:
        raise QueryObjectValidationError(
            "Personal sort row limit must be a positive integer"
        ) from ex
    if limit <= 0:
        raise QueryObjectValidationError(
            "Personal sort row limit must be a positive integer"
        )
    return apply_max_row_limit(limit)


def prepare_personal_sort(
    processor: Any, query: Any, force_cached: bool | None
) -> dict[str, Any] | None:
    if query is None or getattr(query, "_personal_sort_candidate", False):
        return None
    if query.is_rowcount or (not query.columns and not query.is_timeseries):
        query.personal_sort = None
        return None
    if getattr(query, "_personal_sort_prepared", False):
        return getattr(query, "_personal_sort_order", None)
    raw_form = processor._query_context.form_data
    form = raw_form if isinstance(raw_form, dict) else {}
    payload = form.get("personal_sort", getattr(query, "personal_sort", None))
    if payload is None:
        query.personal_sort = None
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
    source = _source_query(processor, option)
    source.columns = deepcopy(source.columns)
    source.metrics = deepcopy(source.metrics)
    source.extras = deepcopy(source.extras)
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
        or viz == "mixed_timeseries"
        or _has_multiple_periods(processor, source)
        or viz == "pivot_table_v2"
    )
    query.personal_sort = dict(sort)
    query.orderby = deepcopy(orderby)
    query.series_limit = 0
    query._personal_sort_prepared = True
    if not complex_query:
        return None
    source.columns = dimensions
    source.metrics = [deepcopy(option["metric"])] if sort["mode"] == "metric" else []
    source.is_timeseries = False
    source.time_offsets = []
    source.post_processing = []
    source.annotation_layers = []
    source.series_limit = 0
    source.series_columns = []
    source.series_limit_metric = None
    source.row_offset = query.row_offset
    source.row_limit = _candidate_row_limit(form.get("row_limit"), source.row_limit)
    source.orderby = deepcopy(orderby)
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
