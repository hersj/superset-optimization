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

from superset.commands.base import BaseCommand
from superset.commands.dashboard.exceptions import DashboardAccessDeniedError
from superset.common.personal_sort import validate_chart_sort
from superset.daos.dashboard import DashboardDAO
from superset.daos.key_value import KeyValueDAO
from superset.extensions import db
from superset.key_value.models import KeyValueEntry
from superset.key_value.types import JsonKeyValueCodec, KeyValueResource
from superset.models.slice import Slice
from superset.utils.core import get_user_id
from superset.utils.decorators import transaction


class DashboardChartSortsCommand(BaseCommand):
    """Private viewer preferences; never update a shared chart or filter state."""

    def __init__(self, dashboard_id: int):
        self.dashboard_id = dashboard_id

    def validate(self) -> None:
        pass

    def scope(self) -> tuple[int, dict[int, Slice]]:
        dashboard = DashboardDAO.get_by_id_or_slug(self.dashboard_id)
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        return user_id, {chart.id: chart for chart in dashboard.slices}

    def key(self, user_id: int, chart_id: int) -> UUID:
        return uuid5(
            NAMESPACE_URL,
            f"superset:chart-sort:{user_id}:{self.dashboard_id}:{chart_id}",
        )

    def run(self) -> dict[str, dict[str, Any]]:
        user_id, charts = self.scope()
        keys = {self.key(user_id, chart_id): chart_id for chart_id in charts}
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
            chart_id = keys[row.uuid]
            try:
                saved = JsonKeyValueCodec().decode(row.value)
                result[str(chart_id)] = validate_chart_sort(
                    saved, charts[chart_id].form_data
                )
            except (ValueError, TypeError):
                # Removed fields must not block the dashboard or become new SQL.
                continue
        return result

    @transaction()
    def put(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        user_id, charts = self.scope()
        chart_id = payload.get("chart_id")
        if type(chart_id) is not int or chart_id not in charts:
            raise ValueError("Chart is not part of dashboard")
        if "sort" not in payload:
            raise ValueError("Sort preference is required")
        value = payload["sort"]
        key = self.key(user_id, chart_id)
        if value is None:
            KeyValueDAO.delete_entry(KeyValueResource.APP, key)
            return None
        value = validate_chart_sort(value, charts[chart_id].form_data)
        KeyValueDAO.upsert_entry(
            KeyValueResource.APP, value, JsonKeyValueCodec(), key
        )
        return value
