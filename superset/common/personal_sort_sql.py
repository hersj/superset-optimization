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

from typing import Any

import sqlalchemy as sa

from superset.common.personal_sort import column_label
from superset.exceptions import QueryObjectValidationError


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
    values = sort["cohort_values"]
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
