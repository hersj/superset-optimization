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
from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd
from flask import current_app

from superset.common.personal_sort import (
    _temporal_axis,
    column_label,
    get_mixed_sort_dimensions,
    get_sort_options,
    validate_chart_sort,
)
from superset.common.utils.time_range_utils import get_since_until_from_query_object
from superset.constants import TimeGrain
from superset.exceptions import QueryObjectValidationError
from superset.utils import json
from superset.utils.core import apply_max_row_limit, get_x_axis_label
from superset.utils.date_parser import normalize_time_delta
from superset.utils.selected_time_ranges import selected_period_starts


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


def _sort_period_bounds(query: Any) -> tuple[datetime | None, datetime | None]:
    if query.from_dttm is not None and query.to_dttm is not None:
        return query.from_dttm, query.to_dttm
    return get_since_until_from_query_object(query)


def _sort_grain(grain: str | None) -> str:
    return {
        TimeGrain.WEEK_STARTING_SUNDAY: "P1W_SUN",
        TimeGrain.WEEK_ENDING_SATURDAY: "P1W_SUN",
        TimeGrain.WEEK_STARTING_MONDAY: "P1W",
        TimeGrain.WEEK_ENDING_SUNDAY: "P1W",
    }.get(grain, grain or "P1D")


def _sort_bucket(stamp: pd.Timestamp, grain: str) -> datetime:
    value = stamp.to_pydatetime()
    return selected_period_starts([(value, value + timedelta(microseconds=1))], grain)[
        0
    ]


def _mapped_sort_date(
    value: Any,
    grain: str,
    source_bounds: Any,
    target_bounds: Any,
    relative_offset: str | None,
    calendar_years: bool,
) -> Any:
    stamp = pd.Timestamp(value)
    local = stamp.tz_localize(None) if stamp.tzinfo else stamp
    grain = _sort_grain(grain)
    if relative_offset:
        shifted = local + pd.DateOffset(**normalize_time_delta(relative_offset))
        if grain in {"P1M", "P3M", "P1Y", "P1W", "P1W_SUN"}:
            clock = local - pd.Timestamp(_sort_bucket(local, grain))
            mapped = pd.Timestamp(_sort_bucket(shifted, grain)) + clock
        else:
            mapped = shifted
    else:
        bucket = _sort_bucket(local, grain)
        clock = local - pd.Timestamp(bucket)
        source_from, source_to = source_bounds
        target_from, target_to = target_bounds
        if (
            calendar_years
            and grain == "P1D"
            and (source_from.month, source_from.day)
            == (target_from.month, target_from.day)
            and source_from.year != target_from.year
        ):
            try:
                mapped = local.replace(
                    year=local.year + target_from.year - source_from.year
                )
            except ValueError:
                return None
            if not target_from <= mapped < target_to:
                return None
        else:
            current = selected_period_starts([source_bounds], grain)
            history = selected_period_starts([target_bounds], grain)
            if bucket not in current or current.index(bucket) >= len(history):
                return None
            mapped = pd.Timestamp(history[current.index(bucket)]) + clock
    if isinstance(value, date) and not isinstance(value, datetime):
        return mapped.date()
    return mapped.tz_localize(stamp.tzinfo) if stamp.tzinfo else mapped


def remap_personal_sort_cohort(
    query: Any,
    source: Any,
    temporal_column: str | None,
    grain: str | None,
    relative_offset: str | None = None,
    calendar_years: bool = False,
) -> None:
    """SQL binds historical raw buckets; metadata keeps current display keys.

    Only the bound comparison column (or its direct BASE_AXIS projection) moves.
    Business dimensions and independent date filters retain their original values.
    Absolute periods reuse existing ordinal buckets; missing buckets query no rows.
    """
    sort = getattr(query, "personal_sort", None)
    if not sort or not temporal_column or "cohort_values" not in sort:
        return
    indices = [
        index
        for index, col in enumerate(sort["cohort_columns"])
        if column_label(col) == temporal_column
        or isinstance(col, dict)
        and col.get("sqlExpression") == temporal_column
    ]
    if not indices:
        return
    source_bounds, target_bounds = (
        _sort_period_bounds(source),
        _sort_period_bounds(query),
    )
    if not relative_offset and source_bounds == target_bounds:
        return
    if any(value is None for value in (*source_bounds, *target_bounds)):
        raise QueryObjectValidationError(
            "Personal date sorting requires enclosed comparison periods"
        )
    values = []
    for row in sort["cohort_values"]:
        mapped_row = list(row)
        for index in indices:
            if row[index] is None:
                continue
            col = sort["cohort_columns"][index]
            col_grain = col.get("timeGrain") if isinstance(col, dict) else None
            try:
                mapped_row[index] = _mapped_sort_date(
                    row[index],
                    col_grain or grain,
                    source_bounds,
                    target_bounds,
                    relative_offset,
                    calendar_years,
                )
            except (ValueError, TypeError) as ex:
                raise QueryObjectValidationError(
                    "Unable to map personal sort dates to the comparison period"
                ) from ex
            if mapped_row[index] is None:
                break
        else:
            values.append(mapped_row)
    query.personal_sort = {**sort, "cohort_values": values}


def _remap_period_sort(processor: Any, query: Any, source: Any) -> None:
    datasource = getattr(processor, "_qc_datasource", None)
    if datasource is None:
        return
    temporal_column = datasource._get_temporal_column_for_filter(
        source, get_x_axis_label(source.columns)
    )
    remap_personal_sort_cohort(
        query, source, temporal_column, datasource.get_time_grain(source)
    )


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
    source.row_limit = _candidate_row_limit(
        None if form.get("server_pagination") else form.get("row_limit"),
        source.row_limit,
    )
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
    _remap_period_sort(processor, query, source)
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
