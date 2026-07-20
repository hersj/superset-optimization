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
from __future__ import annotations

import json
import time
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime
from typing import Any

from sqlalchemy import bindparam, text

from superset import db
from superset.commands.base import BaseCommand
from superset.common.utils.time_range_utils import get_since_until_from_time_range
from superset.connectors.sqla.models import SqlaTable
from superset.models.dashboard import Dashboard

GENERIC_STRING_TYPE = 1
CASCADE_FILTER_OPTIONS_CACHE_TTL_SECONDS = 30
CASCADE_FILTER_OPTIONS_CACHE_MAX_SIZE = 128
_cascade_filter_options_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = (
    OrderedDict()
)


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def quote_table_name(table_name: str) -> str:
    return ".".join(quote_identifier(part) for part in table_name.split("."))


def get_dataset_table_name(dataset: SqlaTable) -> str:
    if not dataset.table_name:
        raise ValueError(f"Dataset {dataset.id} does not have a table name")
    if dataset.schema:
        return quote_table_name(f"{dataset.schema}.{dataset.table_name}")
    return quote_table_name(dataset.table_name)


def clear_cascade_filter_options_cache() -> None:
    _cascade_filter_options_cache.clear()


def _get_cached_options(cache_key: str) -> dict[str, Any] | None:
    cached = _cascade_filter_options_cache.get(cache_key)
    if not cached:
        return None

    cached_at, result = cached
    if time.monotonic() - cached_at > CASCADE_FILTER_OPTIONS_CACHE_TTL_SECONDS:
        _cascade_filter_options_cache.pop(cache_key, None)
        return None

    _cascade_filter_options_cache.move_to_end(cache_key)
    return deepcopy(result)


def _set_cached_options(cache_key: str, result: dict[str, Any]) -> None:
    _cascade_filter_options_cache[cache_key] = (time.monotonic(), deepcopy(result))
    _cascade_filter_options_cache.move_to_end(cache_key)

    while len(_cascade_filter_options_cache) > CASCADE_FILTER_OPTIONS_CACHE_MAX_SIZE:
        _cascade_filter_options_cache.popitem(last=False)


class GetCascadeFilterOptionsCommand(BaseCommand):
    def __init__(
        self,
        dashboard_id: int,
        dataset_id: int,
        columns: list[str],
        applied_filters: dict[str, list[Any]] | None = None,
        time_range: str | None = None,
        limit: int = 1000,
    ) -> None:
        self._dashboard_id = dashboard_id
        self._dataset_id = dataset_id
        self._columns = columns
        self._applied_filters = applied_filters or {}
        self._time_range = time_range
        self._limit = min(max(limit, 1), 5000)
        self._filter_metadata: dict[str, Any] | None = None

    def validate(self) -> None:
        metadata = self._get_filter_metadata()
        if not metadata["columns"]:
            raise ValueError(
                "Unsupported dashboard/dataset cascade context: "
                f"{self._dashboard_id}/{self._dataset_id}"
            )
        if not self._columns:
            raise ValueError("At least one column is required")
        supported_columns = metadata["columns"]
        unknown_columns = set(self._columns) - set(supported_columns)
        if unknown_columns:
            raise ValueError(f"Unsupported columns: {sorted(unknown_columns)}")

    def run(self) -> dict[str, dict[str, Any]]:
        self.validate()
        cache_key = self._get_cache_key()
        cached_result = _get_cached_options(cache_key)
        if cached_result is not None:
            return cached_result

        dataset = self._get_dataset()
        if self._time_range:
            since, until = get_since_until_from_time_range(self._time_range)
        else:
            since, until = None, None

        result: dict[str, dict[str, Any]] = {}
        with dataset.database.get_sqla_engine(
            catalog=dataset.catalog,
            schema=dataset.schema,
        ) as engine:
            statement, params = self._build_statement(dataset, since, until)
            rows = engine.execute(statement, params).mappings().all()

        result = {
            column: {
                "colnames": [column],
                "coltypes": [GENERIC_STRING_TYPE],
                "data": [],
                "rowcount": 0,
            }
            for column in self._columns
        }
        for row in rows:
            column = row["__column"]
            if column not in result:
                continue
            result[column]["data"].append({column: row["__value"]})
        for column_result in result.values():
            column_result["rowcount"] = len(column_result["data"])

        _set_cached_options(cache_key, result)
        return result

    def _get_cache_key(self) -> str:
        return json.dumps(
            {
                "dashboard_id": self._dashboard_id,
                "dataset_id": self._dataset_id,
                "columns": self._columns,
                "applied_filters": self._applied_filters,
                "time_range": self._time_range,
                "limit": self._limit,
            },
            sort_keys=True,
            default=str,
        )

    def _get_dataset(self) -> SqlaTable:
        return db.session.query(SqlaTable).filter(SqlaTable.id == self._dataset_id).one()

    def _get_filter_metadata(self) -> dict[str, Any]:
        if self._filter_metadata is None:
            self._filter_metadata = self._get_dashboard_filter_metadata()
        return self._filter_metadata

    def _get_dashboard_filter_metadata(self) -> dict[str, Any]:
        dashboard = (
            db.session.query(Dashboard).filter(Dashboard.id == self._dashboard_id).one()
        )
        dashboard_metadata = json.loads(dashboard.json_metadata or "{}")
        filter_configs = dashboard_metadata.get("native_filter_configuration") or []
        filters_by_id = {
            filter_config.get("id"): filter_config for filter_config in filter_configs
        }
        columns: list[str] = []
        parent_columns_by_column: dict[str, list[str]] = {}

        for filter_config in filter_configs:
            if filter_config.get("filterType") != "filter_select":
                continue
            target = (filter_config.get("targets") or [{}])[0]
            if target.get("datasetId") != self._dataset_id:
                continue
            column = (target.get("column") or {}).get("name")
            if not column:
                continue

            columns.append(column)
            parent_columns: list[str] = []
            for parent_id in filter_config.get("cascadeParentIds") or []:
                parent_filter = filters_by_id.get(parent_id) or {}
                parent_target = (parent_filter.get("targets") or [{}])[0]
                if parent_target.get("datasetId") != self._dataset_id:
                    continue
                parent_column = (parent_target.get("column") or {}).get("name")
                if parent_column:
                    parent_columns.append(parent_column)
            parent_columns_by_column[column] = parent_columns

        return {
            "columns": columns,
            "parent_columns_by_column": parent_columns_by_column,
        }

    def _build_statement(
        self,
        dataset: SqlaTable,
        since: datetime | None,
        until: datetime | None,
    ) -> tuple[Any, dict[str, Any]]:
        table_name = get_dataset_table_name(dataset)
        params: dict[str, Any] = {}
        bindparams = []
        metadata = self._get_filter_metadata()
        time_column = getattr(dataset, "main_dttm_col", None)
        subqueries = []

        for column_index, column in enumerate(self._columns):
            quoted_column = quote_identifier(column)
            where_clauses = [f"{quoted_column} IS NOT NULL"]
            params[f"column_{column_index}"] = column
            params[f"limit_{column_index}"] = self._limit

            parent_columns = metadata["parent_columns_by_column"].get(column, [])
            for parent_index, parent_column in enumerate(parent_columns):
                values = [
                    value
                    for value in self._applied_filters.get(parent_column, [])
                    if value is not None and value != ""
                ]
                if values:
                    param_name = f"column_{column_index}_parent_{parent_index}_values"
                    where_clauses.append(
                        f"{quote_identifier(parent_column)} IN :{param_name}"
                    )
                    params[param_name] = values
                    bindparams.append(bindparam(param_name, expanding=True))

            if since is not None and time_column:
                where_clauses.append(f"{quote_identifier(time_column)} >= :since")
                params["since"] = since
            if until is not None and time_column:
                where_clauses.append(f"{quote_identifier(time_column)} < :until")
                params["until"] = until

            subqueries.append(
                f"""
SELECT
  :column_{column_index} AS __column,
  to_jsonb({quoted_column}) AS __value,
  {quoted_column}::text AS __sort
FROM {table_name}
WHERE {' AND '.join(where_clauses)}
GROUP BY {quoted_column}
ORDER BY {quoted_column} ASC
LIMIT :limit_{column_index}
"""
            )

        sql = f"""
SELECT __column, __value
FROM (
  {' UNION ALL '.join(f'SELECT * FROM ({subquery}) AS cascade_options_{index}' for index, subquery in enumerate(subqueries))}
) AS cascade_options
ORDER BY __column ASC, __sort ASC
"""
        statement = text(sql)
        if bindparams:
            statement = statement.bindparams(*bindparams)
        return statement, params
