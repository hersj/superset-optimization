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

from flask import g, has_request_context
from flask_jwt_extended import (
    current_user as jwt_current_user,
    verify_jwt_in_request,
)
from sqlalchemy import bindparam, text

from superset import db
from superset.commands.base import BaseCommand
from superset.common.utils.time_range_utils import get_since_until_from_time_range
from superset.connectors.sqla.models import SqlaTable
from superset.models.dashboard import Dashboard
from superset.utils.selected_time_ranges import (
    parse_selected_time_ranges,
    PREVIOUS_SELECTED_PERIOD,
)

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
        time_ranges: list[str] | None = None,
        time_column: str | None = None,
        filter_operators: dict[str, str] | None = None,
        search: dict[str, str] | None = None,
        comparison_time_ranges: list[str] | None = None,
        time_offsets: list[str] | None = None,
    ) -> None:
        self._dashboard_id = dashboard_id
        self._dataset_id = dataset_id
        self._columns = columns
        self._applied_filters = applied_filters or {}
        self._filter_operators = filter_operators or {}
        self._search = search or {}
        self._time_range = time_range
        self._time_ranges = time_ranges
        self._time_column = time_column
        self._comparison_time_ranges = comparison_time_ranges
        self._time_offsets = time_offsets
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
        if not isinstance(self._applied_filters, dict):
            raise ValueError("applied_filters must be an object")
        if not isinstance(self._filter_operators, dict):
            raise ValueError("filter_operators must be an object")
        for column, operator in self._filter_operators.items():
            if (
                not isinstance(operator, str)
                or column not in supported_columns
                or operator not in {"IN", "NOT IN", "ILIKE", "NOT ILIKE"}
            ):
                raise ValueError("Unsupported parent filter operator or column")
            values = self._applied_filters.get(column)
            if not isinstance(values, list) or not values:
                raise ValueError("Parent filter values must be a nonempty list")
            if operator in {"ILIKE", "NOT ILIKE"} and (
                len(values) != 1 or not isinstance(values[0], str) or not values[0]
            ):
                raise ValueError("Pattern filters require exactly one string")
        self._validate_search()
        unknown_columns = set(self._columns) - set(supported_columns)
        if unknown_columns:
            raise ValueError(f"Unsupported columns: {sorted(unknown_columns)}")

    def _validate_search(self) -> None:
        if not isinstance(self._search, dict):
            raise ValueError("search must be an object")
        if self._search and (
            self._search.get("column") not in self._columns
            or not isinstance(self._search.get("value"), str)
            or not self._search["value"].strip()
            or len(self._search["value"]) > 1000
        ):
            raise ValueError("Search requires a requested column and a keyword")

    def _activate_request_identity(self) -> None:
        # 功能审计（可重写规格）：级联筛选选项的请求身份激活
        # - 功能目的与触发方式：级联筛选命令在解析数据集 RLS 前调用，确保
        #   JWT 请求的当前用户已经完成验证和加载，避免 RLS 误用 Public 匿名身份。
        # - 输入契约：必须在 Flask request context 中执行；JWT 由现有
        #   Flask-JWT-Extended 配置解析，session cookie 请求可能没有 JWT。
        # - 输出契约：无 JWT 时保留既有 g.user；有效 JWT 时将已验证的用户写入
        #   g.user；无 request context 时不改变任何状态。
        # - 处理流程与业务规则：调用 verify_jwt_in_request(optional=True)；返回
        #   None 只表示没有 JWT，继续使用 session 身份；有 JWT 时读取
        #   jwt_current_user 并覆盖 g.user。不能用异常来判断“没有 JWT”。
        # - 状态与副作用：只更新当前 Flask 请求上下文，不写数据库、缓存或用户会话。
        # - 外部依赖：复用 Flask-JWT-Extended 的既有 JWT 验证、用户加载和异常语义。
        # - 异常与边界：无效、过期、撤销 JWT 或用户加载失败的异常必须向上抛出，
        #   在数据集 RLS 和 engine.execute 前终止请求，禁止回退旧身份而扩大可见范围。
        # - 不变量与约束：session-only 请求行为不变；JWT 请求必须使用已验证用户；
        #   安全失败采用 fail-closed。
        # - 验证方式：请求 context 下分别验证无 JWT、有效 JWT、无效 JWT，且无效
        #   JWT 时不发生数据库 engine.execute。
        if not has_request_context():
            return
        jwt_result = verify_jwt_in_request(optional=True)
        if jwt_result is not None:
            g.user = jwt_current_user  # 触发 load_user_jwt，使用已验证用户

    # 功能审计（可重写规格）：级联筛选选项的行级权限执行
    # - 功能目的与触发方式：看板级联筛选请求由 run 触发。
    #   返回当前用户可见的数据集维度值。
    # - 输入契约：已校验的看板、数据集、目标列、父级筛选值和时间范围。
    #   数据集 RLS 使用 Superset 当前用户上下文解析。
    # - 输出契约：每列返回去重、排序、限量后的选项，不能包含规则外值。
    # - 处理流程：先激活请求身份(JWT→g.user)，再解析时间和 RLS，
    #   并按目标数据库方言编译完整谓词；
    #   仅无 RLS 请求可读写既有缓存，之后将同一谓词写入每个列子查询。
    # - 业务规则：复用 dataset.get_sqla_row_level_filters 的角色与模板语义。
    #   RLS 为空时保留原查询和缓存行为。
    # - 状态与副作用：只读数据库；有 RLS 的响应不得进入共享进程缓存。
    # - 外部依赖：SqlaTable、当前 Flask 用户、security_manager 和原生筛选元数据。
    # - 异常与边界：RLS 模板解析或方言编译失败时请求失败，不能退回无 RLS 查询。
    #   无 RLS 数据集继续使用既有缓存。
    # - 不变量与约束：每个 UNION 子查询均带完整括号包裹的已解析 RLS 条件，
    #   不改变组内 OR、组间 AND、父筛选和时间条件的优先级；缓存、默认值或空
    #   规则均不得扩大可见范围。
    # - 验证方式：级联筛选单测覆盖 RLS 与缓存隔离。
    #   部署后以受限角色实际请求复核。
    def run(self) -> dict[str, dict[str, Any]]:
        self.validate()
        self._activate_request_identity()
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
            rls_clauses = self._compile_rls_clauses(rls_filters, engine.dialect)
            statement, params = self._build_statement(
                dataset,
                since,
                until,
                rls_clauses,
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
                "filter_operators": self._filter_operators,
                "search": self._search,
                "time_range": self._time_range,
                "time_ranges": self._time_ranges,
                "time_column": self._time_column,
                "comparison_time_ranges": self._comparison_time_ranges,
                "time_offsets": self._time_offsets,
                "limit": self._limit,
            },
            sort_keys=True,
            default=str,
        )

    def _get_dataset(self) -> SqlaTable:
        return (
            db.session.query(SqlaTable).filter(SqlaTable.id == self._dataset_id).one()
        )

    @staticmethod
    def _compile_rls_clauses(
        rls_filters: list[Any],
        dialect: Any,
    ) -> list[str]:
        # RLS 可能是包含 OR 的 BooleanClauseList；必须以实际方言编译并整体加括号，
        # 才能安全地与原始 SQL 的父筛选和时间条件使用 AND 连接。嵌入新的
        # TextClause 前还原方言为 DBAPI 预转义的百分号，避免二次编译时重复转义。
        try:
            compiled_filters = [
                str(
                    rls_filter.compile(
                        dialect=dialect,
                        compile_kwargs={"literal_binds": True},
                    )
                )
                for rls_filter in rls_filters
            ]
        except Exception as ex:
            raise ValueError("Unable to compile row level security filters") from ex
        if dialect.identifier_preparer._double_percents:
            compiled_filters = [
                predicate.replace("%%", "%") for predicate in compiled_filters
            ]
        return [f"({predicate})" for predicate in compiled_filters]

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
        time_columns: set[str] = set()
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
                        time_columns.update(
                            target["column"]["name"]
                            for target in targets
                            if target.get("datasetId") == self._dataset_id
                            and isinstance(
                                (target.get("column") or {}).get("name"), str
                            )
                        )
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
            "time_columns": time_columns,
        }

    def _build_statement(  # noqa: C901
        self,
        dataset: SqlaTable,
        since: datetime | None,
        until: datetime | None,
        rls_clauses: list[str],
    ) -> tuple[Any, dict[str, Any]]:
        table_name = get_dataset_table_name(dataset)
        params: dict[str, Any] = {}
        bindparams = []
        metadata = self._get_filter_metadata()
        ranges = self._option_time_ranges(since, until)
        configured_columns = metadata.get("time_columns", set())
        time_column = self._time_column or (
            next(iter(configured_columns))
            if len(configured_columns) == 1
            else getattr(dataset, "main_dttm_col", None)
        )
        if self._time_column is not None and (
            self._time_column not in configured_columns
            if configured_columns
            else self._time_column != getattr(dataset, "main_dttm_col", None)
        ):
            raise ValueError("Time column must match the configured time filter")
        if ranges is not None and not time_column:
            raise ValueError("Comparison options require a bound time column")
        calculated_columns = {
            column.column_name: column
            for column in dataset.columns
            if column.expression
        }

        def column_sql(name: str) -> str:
            # Resolve only used expressions through the same path as chart queries.
            column = calculated_columns.get(name)
            if column is None:
                return quote_identifier(name)
            expression = column.get_sqla_col(
                template_processor=dataset.get_template_processor()
            )
            return f"({expression})"

        time_expression = column_sql(time_column) if time_column else None
        subqueries = []
        # 每个维度值都有独立的 UNION 子查询，RLS 不能只加在外层，否则
        # 子查询的分组结果可能已经包含规则外数据。rls_clauses 保留完整布尔分组。

        for column_index, column in enumerate(self._columns):
            quoted_column = column_sql(column)
            where_clauses = [f"{quoted_column} IS NOT NULL", *rls_clauses]
            params[f"column_{column_index}"] = column
            params[f"limit_{column_index}"] = self._limit

            if self._search.get("column") == column:
                where_clauses.append(f"CAST({quoted_column} AS TEXT) ILIKE :search")
                keyword = self._search["value"]
                escaped = (
                    keyword.replace("\\", "\\\\")
                    .replace("%", "\\%")
                    .replace("_", "\\_")
                )
                params["search"] = f"%{escaped}%"

            parent_columns = metadata["parent_columns_by_column"].get(column, [])
            for parent_index, parent_column in enumerate(parent_columns):
                values = [
                    value
                    for value in self._applied_filters.get(parent_column, [])
                    if value is not None and value != ""
                ]
                if values:
                    param_name = f"column_{column_index}_parent_{parent_index}_values"
                    operator = self._filter_operators.get(parent_column, "IN")
                    is_pattern = operator in {"ILIKE", "NOT ILIKE"}
                    parent_expression = column_sql(parent_column)
                    parent_expression = (
                        f"CAST({parent_expression} AS TEXT)"
                        if is_pattern
                        else parent_expression
                    )
                    where_clauses.append(
                        f"{parent_expression} {operator} :{param_name}"
                    )
                    params[param_name] = values[0] if is_pattern else values
                    bindparams.append(bindparam(param_name, expanding=not is_pattern))

            if ranges is not None:
                # 每个UNION都使用同一绑定列的区间并集；整体括号后再AND父维度和RLS。
                if not ranges or not time_column:
                    raise ValueError(
                        "Point selection requires a time column and nonempty ranges"
                    )
                clauses = []
                for index, (start, end) in enumerate(ranges):
                    params[f"range_{index}_since"] = start
                    params[f"range_{index}_until"] = end
                    clauses.append(
                        f"({time_expression} >= :range_{index}_since "
                        f"AND {time_expression} < :range_{index}_until)"
                    )
                where_clauses.append("(" + " OR ".join(clauses) + ")")
            elif since is not None and time_column:
                where_clauses.append(f"{time_expression} >= :since")
                params["since"] = since
            if ranges is None and until is not None and time_column:
                where_clauses.append(f"{time_expression} < :until")
                params["until"] = until

            subqueries.append(
                f"""
SELECT
  :column_{column_index} AS __column,
  to_jsonb({quoted_column}) AS __value,
  {quoted_column}::text AS __sort
FROM {table_name}
WHERE {" AND ".join(where_clauses)}
GROUP BY {quoted_column}
ORDER BY {quoted_column} ASC
LIMIT :limit_{column_index}
"""
            )

        sql = f"""
SELECT __column, __value
FROM (
  {" UNION ALL ".join(f"SELECT * FROM ({subquery}) AS cascade_options_{index}" for index, subquery in enumerate(subqueries))}
) AS cascade_options
ORDER BY __column ASC, __sort ASC
"""
        statement = text(sql)
        if bindparams:
            statement = statement.bindparams(*bindparams)
        return statement, params

    def _option_time_ranges(  # noqa: C901
        self, since: datetime | None, until: datetime | None
    ) -> list[tuple[datetime, datetime]] | None:
        """Union A/B candidates on one column; preserve other filters and RLS."""
        if self._time_column is not None and not isinstance(self._time_column, str):
            raise ValueError("Time column must be a string")
        if self._time_offsets is not None and (
            not isinstance(self._time_offsets, list)
            or len(self._time_offsets) > 16
            or any(
                not isinstance(offset, str) or not offset.strip() or len(offset) > 100
                for offset in self._time_offsets
            )
        ):
            raise ValueError("Invalid comparison offsets")
        if self._comparison_time_ranges is None and not self._time_offsets:
            return (
                parse_selected_time_ranges(self._time_ranges)
                if self._time_ranges is not None
                else None
            )
        if since is None or until is None:
            raise ValueError("Comparison options require finite current dates")
        ranges = (
            parse_selected_time_ranges(self._time_ranges)
            if self._time_ranges is not None
            else [(since, until)]
        )
        current_ranges = list(ranges)
        if self._comparison_time_ranges is not None:
            comparison = parse_selected_time_ranges(self._comparison_time_ranges)
            if not comparison:
                raise ValueError("Comparison ranges must not be empty")
            ranges.extend(comparison)
        if self._time_offsets is not None:
            for offset in self._time_offsets:
                if offset == PREVIOUS_SELECTED_PERIOD:
                    continue
                for start, end in current_ranges:
                    try:
                        left, right = get_since_until_from_time_range(
                            f"{start.isoformat()} : {end.isoformat()}",
                            time_shift=offset,
                        )
                    except (AttributeError, TypeError, ValueError, OverflowError) as ex:
                        raise ValueError("Invalid comparison offset") from ex
                    # The legacy parser treats unknown text as a zero shift.
                    if (
                        left is None
                        or right is None
                        or left >= right
                        or (left, right) == (start, end)
                    ):
                        raise ValueError(
                            "Comparison offsets require different finite dates"
                        )
                    ranges.append((left, right))
                    if len(ranges) > 10000:
                        raise ValueError("Comparison options exceed 10000 ranges")
        ranges = list(dict.fromkeys(ranges))
        if len(ranges) > 10000:
            raise ValueError("Comparison options exceed 10000 ranges")
        return ranges

    # Applicable time filters must resolve to a valid, scoped range. Point
    # selections retain gaps; their envelope is not an alternative query range.
    def _resolve_time_range(self) -> tuple[datetime | None, datetime | None]:
        metadata = self._get_filter_metadata()
        if metadata.get("time_filter_scope_ambiguous"):
            raise ValueError("Cannot resolve applicable dashboard time filter scope")

        if self._time_ranges is not None:
            ranges = parse_selected_time_ranges(self._time_ranges)
            if (
                not ranges
                or not isinstance(self._time_column, str)
                or self._time_column not in metadata.get("time_columns", set())
            ):
                raise ValueError(
                    "Point selection requires nonempty ranges "
                    "and the configured time column"
                )
            start, end = ranges[0][0], max(right for _, right in ranges)
            expected = f"{start:%Y-%m-%d} : {end:%Y-%m-%d}"
            if self._time_range != expected:
                raise ValueError("Point ranges and time_range envelope conflict")
            return start, end

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
