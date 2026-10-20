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

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from flask import current_app

from superset.commands.base import BaseCommand
from superset.commands.dashboard.exceptions import DashboardAccessDeniedError
from superset.daos.dashboard import DashboardDAO
from superset.daos.key_value import KeyValueDAO
from superset.extensions import db
from superset.key_value.models import KeyValueEntry
from superset.key_value.types import JsonKeyValueCodec, KeyValueResource
from superset.utils.core import get_user_id
from superset.utils.decorators import transaction


class DashboardChartRowLimitsCommand(BaseCommand):
    """Remember viewer query limits separately from filters and chart definitions."""

    def __init__(self, dashboard_id: int):
        self.dashboard_id = dashboard_id

    def validate(self) -> None:
        pass

    def scope(self) -> tuple[int, set[int]]:
        dashboard = DashboardDAO.get_by_id_or_slug(self.dashboard_id)
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        return user_id, {chart.id for chart in dashboard.slices}

    def key(self, user_id: int, chart_id: int) -> UUID:
        """Use a private application key per user, dashboard and chart."""
        return uuid5(
            NAMESPACE_URL,
            f"superset:chart-row-limit:{user_id}:{self.dashboard_id}:{chart_id}",
        )

    def run(self) -> dict[str, int]:
        user_id, chart_ids = self.scope()
        keys = {self.key(user_id, chart_id): str(chart_id) for chart_id in chart_ids}
        if not keys:
            return {}
        rows = (
            db.session.query(KeyValueEntry)
            .filter(
                KeyValueEntry.resource == KeyValueResource.APP.value,
                KeyValueEntry.uuid.in_(keys),
            )
            .all()
        )
        result = {}
        for row in rows:
            value = JsonKeyValueCodec().decode(row.value).get("row_limit")
            if type(value) is int and value > 0:
                result[keys[row.uuid]] = min(value, current_app.config["SQL_MAX_ROW"])
        return result

    @transaction()
    def put(self, payload: dict[str, Any]) -> int | None:
        user_id, chart_ids = self.scope()
        chart_id, value = payload.get("chart_id"), payload.get("row_limit")
        if type(chart_id) is not int or chart_id not in chart_ids:
            raise ValueError("Chart is not part of dashboard")
        if "row_limit" not in payload or (
            value is not None
            and (
                type(value) is not int
                or not 1 <= value <= current_app.config["SQL_MAX_ROW"]
            )
        ):
            raise ValueError(
                "Row limit must be an integer between 1 and "
                f"{current_app.config['SQL_MAX_ROW']}, or null"
            )
        key = self.key(user_id, chart_id)
        if value is None:
            KeyValueDAO.delete_entry(KeyValueResource.APP, key)
        else:
            KeyValueDAO.upsert_entry(
                KeyValueResource.APP, {"row_limit": value}, JsonKeyValueCodec(), key
            )
        return value
