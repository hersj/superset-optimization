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

    # 功能审计（可重写规格）：级联筛选选项的行级权限执行
    # - 功能目的与触发方式：看板级联筛选请求由 run 触发。
    #   返回当前用户可见的数据集维度值。
    # - 输入契约：已校验的看板、数据集、目标列、父级筛选值和时间范围。
    #   数据集 RLS 使用 Superset 当前用户上下文解析。
    # - 输出契约：每列返回去重、排序、限量后的选项，不能包含规则外值。
    # - 处理流程：先解析时间和 RLS；仅无 RLS 请求可读写既有缓存。
    #   之后将同一 RLS 谓词写入每个列子查询。
    # - 业务规则：复用 dataset.get_sqla_row_level_filters 的角色与模板语义。
    #   RLS 为空时保留原查询和缓存行为。
    # - 状态与副作用：只读数据库；有 RLS 的响应不得进入共享进程缓存。
    # - 外部依赖：SqlaTable、当前 Flask 用户、security_manager 和原生筛选元数据。
    # - 异常与边界：RLS 模板解析失败时请求失败，不能退回无 RLS 查询。
    #   无 RLS 数据集继续使用既有缓存。
    # - 不变量与约束：每个 UNION 子查询均带已解析 RLS 条件。
    #   缓存、默认值或空规则均不得扩大可见范围。
    # - 验证方式：级联筛选单测覆盖 RLS 与缓存隔离。
    #   部署后以受限角色实际请求复核。
    def run(self) -> dict[str, dict[str, Any]]:
        self.validate()
        since, until = self._resolve_time_range()
        dataset = self._get_dataset()
        rls_filters = list(dataset.get_sqla_row_level_filters())
        cache_key = self._get_cache_key()
        if not rls_filters:
            cached_result = _get_cached_options(cache_key)
            if cached_result is not None:
                return cached_result

        result: dict[str, dict[str, Any]] = {}
        with dataset.database.get_sqla_engine(
            catalog=dataset.catalog,
            schema=dataset.schema,
        ) as engine:
            statement, params = self._build_statement(
                dataset,
                since,
                until,
                rls_filters,
            )
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

        if not rls_filters:
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
        chart_datasources = {
            chart.id: chart.datasource_id for chart in (dashboard.slices or [])
        }
        applicable_time_filter_count = 0
        time_filter_scope_ambiguous = False

        for filter_config in filter_configs:
            if filter_config.get("filterType") == "filter_custom_time":
                targets = [
                    target
                    for target in filter_config.get("targets") or []
                    if target.get("datasetId") is not None
                ]
                if targets:
                    if any(
                        target.get("datasetId") == self._dataset_id
                        for target in targets
                    ):
                        applicable_time_filter_count += 1
                else:
                    chart_ids = filter_config.get("chartsInScope")
                    if chart_ids is None:
                        time_filter_scope_ambiguous = True
                        continue
                    if not chart_ids:
                        continue
                    scoped_datasources = [
                        chart_datasources.get(chart_id) for chart_id in chart_ids
                    ]
                    if any(
                        datasource_id is None for datasource_id in scoped_datasources
                    ):
                        time_filter_scope_ambiguous = True
                    elif self._dataset_id in scoped_datasources:
                        applicable_time_filter_count += 1
                continue
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
            "applicable_time_filter_count": applicable_time_filter_count,
            "time_filter_scope_ambiguous": time_filter_scope_ambiguous,
        }

    def _build_statement(
        self,
        dataset: SqlaTable,
        since: datetime | None,
        until: datetime | None,
        rls_filters: list[Any],
    ) -> tuple[Any, dict[str, Any]]:
        table_name = get_dataset_table_name(dataset)
        params: dict[str, Any] = {}
        bindparams = []
        metadata = self._get_filter_metadata()
        time_column = getattr(dataset, "main_dttm_col", None)
        subqueries = []
        # 每个维度值都有独立的 UNION 子查询，RLS 不能只加在外层，否则
        # 子查询的分组结果可能已经包含规则外数据。
        rls_clauses = [str(rls_filter) for rls_filter in rls_filters]

        for column_index, column in enumerate(self._columns):
            quoted_column = quote_identifier(column)
            where_clauses = [f"{quoted_column} IS NOT NULL", *rls_clauses]
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
    # 功能审计（可重写规格）：级联筛选选项的时间范围边界
    # - 功能目的与触发方式：级联选项请求按看板实际适用的时间筛选器收敛数据范围，由 run 触发。
    # - 输入契约：time_range 只能是非空字符串；看板元数据提供适用时间筛选器数量及 scope 歧义状态。
    # - 输出契约：返回各列选项；合法时间范围生成 since/until，非法或缺失时返回 ValueError（API 转 400）。
    # - 处理流程：先校验列和 scope，再解析时间范围，再生成带主时间列谓词的 SQL；无适用筛选器才允许无范围查询。
    # - 业务规则：多个适用筛选器必须提供同一有效范围；解析后 since、until 均为空视为无效，不能扩大到全历史。
    # - 状态与副作用：仅使用既有进程内请求缓存和数据库只读查询，不写数据库、不新增缓存或任务。
    # - 外部依赖：Dashboard JSON、dashboard.slices datasource_id、SqlaTable.main_dttm_col 和既有时间解析器。
    # - 异常与边界：数组、对象、空字符串、No filter、scope 未完成或冲突均拒绝；仅一侧边界的有效范围可保留开放区间。
    # - 不变量与约束：无适用筛选器的旧无范围行为不变；有适用筛选器绝不发无范围 cascade SQL。
    # - 验证方式：tests/unit_tests/dashboards/test_cascade_filter_options.py 及真实 dashboard 44/51 cascade 请求。
    def _resolve_time_range(self) -> tuple[datetime | None, datetime | None]:
        metadata = self._get_filter_metadata()
        if metadata.get("time_filter_scope_ambiguous"):
            raise ValueError(
                "Cannot resolve applicable dashboard time filter scope"
            )

        if self._time_range is None:
            if metadata.get("applicable_time_filter_count", 0):
                raise ValueError(
                    "time_range is required when a dashboard time filter applies"
                )
            return None, None

        if not isinstance(self._time_range, str) or not self._time_range.strip():
            raise ValueError("time_range must be a non-empty string")

        try:
            since, until = get_since_until_from_time_range(self._time_range)
        except (AttributeError, TypeError, ValueError, OverflowError) as ex:
            raise ValueError("time_range is invalid") from ex
        if since is None and until is None:
            raise ValueError("time_range has no valid since or until boundary")
        return since, until
