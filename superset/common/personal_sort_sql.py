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
"""Compile only validated original columns and bound category values."""

from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
import sqlalchemy as sa

from superset.common.personal_sort import column_label
from superset.exceptions import QueryObjectValidationError


class _CohortTemporalType(sa.types.TypeDecorator):
    """Preserve native driver binds, filling SQLAlchemy 1.4's literal-only gap."""

    impl = sa.DateTime
    cache_ok = True

    def __init__(self, sqltype: Any, sqlite_bucket: bool = False) -> None:
        super().__init__()
        self.sqlite_bucket = sqlite_bucket
        self.sqltype = sqltype
        self.impl = sqltype

    def coerce_compared_value(self, op: Any, value: Any) -> Any:
        if isinstance(value, date):
            return self
        return self.impl.coerce_compared_value(op, value)

    def literal_processor(self, dialect: Any) -> Any:
        processor = self.impl.literal_processor(dialect)
        if processor is not None:
            if self.sqlite_bucket and dialect.name == "sqlite":
                # Chart SQL uses literal_binds. SQLite's DATETIME grain expression
                # returns seconds text even when its declared source type is DATE.
                return lambda value: f"DATETIME({processor(value)})"
            return processor
        quote = sa.String().literal_processor(dialect)
        sqltype = self.impl.compile(dialect=dialect)

        def render(value: Any) -> str:
            text = (
                value.isoformat(" ")
                if isinstance(value, datetime)
                else value.isoformat()
            )
            return f"CAST({quote(text)} AS {sqltype})"

        return render


def _native_cohort_value(value: Any, sqltype: Any) -> Any:
    if isinstance(value, np.datetime64):
        value = pd.Timestamp(value)
    elif isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, pd.Timestamp):
        value = value.to_pydatetime(warn=False)
    if (
        isinstance(sqltype, sa.Date)
        and not isinstance(sqltype, sa.DateTime)
        and isinstance(value, datetime)
    ):
        # A DATE is a business calendar date, not its UTC-converted instant.
        return value.date()
    return value


def _cohort_column_type(sqltype: Any, values: list[Any]) -> Any:
    if not isinstance(sqltype, sa.types.NullType):
        return sqltype
    for value in values:
        value = _native_cohort_value(value, sqltype)
        if isinstance(value, datetime):
            return sa.DateTime(timezone=value.utcoffset() is not None)
        if isinstance(value, date):
            return sa.Date()
    return sqltype


def apply_sort_predicate(
    query: Any, sort: dict[str, Any], expressions: dict[str, Any]
) -> Any:
    columns = sort.get("cohort_columns")
    if columns is None:
        return query
    try:
        cols = [expressions[column_label(col)] for col in columns]
    except KeyError as ex:
        raise QueryObjectValidationError(
            "Personal sort grouping is missing from the query"
        ) from ex
    sqltypes = [
        _cohort_column_type(col.type, [row[index] for row in sort["cohort_values"]])
        for index, col in enumerate(cols)
    ]
    values = [
        [
            _native_cohort_value(value, sqltype)
            for sqltype, value in zip(sqltypes, row, strict=True)
        ]
        for row in sort["cohort_values"]
    ]
    cols = [
        sa.type_coerce(
            col,
            _CohortTemporalType(
                sqltype,
                sqlite_bucket=isinstance(original, dict)
                and original.get("columnType") == "BASE_AXIS"
                and bool(original.get("timeGrain")),
            ),
        )
        if isinstance(sqltype, (sa.Date, sa.DateTime))
        else col
        for col, sqltype, original in zip(cols, sqltypes, columns, strict=True)
    ]
    ordinary = [tuple(row) for row in values if all(value is not None for value in row)]
    nullable = [row for row in values if any(value is None for value in row)]
    predicates = []
    if ordinary:
        predicates.append(
            cols[0].in_([row[0] for row in ordinary])
            if len(cols) == 1
            else sa.tuple_(*cols).in_(ordinary)
        )
    predicates.extend(
        sa.and_(
            *(
                col.is_(None) if value is None else col == value
                for col, value in zip(cols, row, strict=True)
            )
        )
        for row in nullable
    )
    return query.where(sa.or_(*predicates) if predicates else sa.false())


def custom_sort_expression(sort: dict[str, Any], expressions: dict[str, Any]) -> Any:
    if sort.get("mode") != "custom" or "cohort_columns" in sort:
        return None
    field = sort["field"]
    if field not in expressions:
        raise QueryObjectValidationError("Custom sort field is missing from the query")
    values = sort["customOrder"]
    if not values:
        return None
    return sa.case(
        [
            (sa.cast(expressions[field], sa.String) == value, index)
            for index, value in enumerate(values)
        ],
        else_=len(values),
    )


def enforce_personal_row_limit(sort: dict[str, Any] | None, count: int) -> None:
    if sort and sort.get("record_limit") is not None and count > sort["record_limit"]:
        raise QueryObjectValidationError(
            "Selected groups exceed the safe query row limit; "
            "reduce the row limit or narrow filters"
        )
