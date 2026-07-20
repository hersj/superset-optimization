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
from types import SimpleNamespace

import pytest

from superset.commands.dashboard.exceptions import DashboardAccessDeniedError


def test_get_chart_layouts_is_scoped_by_dashboard_and_user(mocker) -> None:
    from superset.commands.dashboard.chart_layouts import (
        GetDashboardChartLayoutsCommand,
    )

    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(id=44, slices=[SimpleNamespace(id=642)]),
    )
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.get_user_id", return_value=7
    )
    find_by_dashboard_and_user = mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardChartLayoutDAO.find_by_dashboard_and_user",
        return_value={
            642: {
                "ordered_metric_ids": ["profit", "sales"],
                "hidden_metric_ids": ["cost"],
                "version": 1,
            }
        },
    )

    result = GetDashboardChartLayoutsCommand(44).run()

    find_by_dashboard_and_user.assert_called_once_with(44, 7)
    assert result["642"]["ordered_metric_ids"] == ["profit", "sales"]


def test_upsert_chart_layout_rejects_chart_outside_dashboard(mocker) -> None:
    from superset.commands.dashboard.chart_layouts import (
        UpsertDashboardChartLayoutCommand,
    )

    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(id=44, slices=[SimpleNamespace(id=111)]),
    )

    with pytest.raises(ValueError, match="not part of dashboard"):
        UpsertDashboardChartLayoutCommand(
            dashboard_id=44,
            chart_id=642,
            layout={
                "ordered_metric_ids": ["profit", "sales"],
                "hidden_metric_ids": [],
                "version": 1,
            },
        ).run()


def test_get_chart_layouts_propagates_dashboard_access_errors(mocker) -> None:
    from superset.commands.dashboard.chart_layouts import (
        GetDashboardChartLayoutsCommand,
    )

    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        side_effect=DashboardAccessDeniedError(),
    )

    with pytest.raises(DashboardAccessDeniedError):
        GetDashboardChartLayoutsCommand(44).run()


@pytest.mark.parametrize(
    "method_name",
    ["get_chart_layouts", "put_chart_layout", "delete_chart_layout"],
)
def test_chart_layout_endpoints_reuse_dashboard_read_permission(
    method_name: str,
) -> None:
    from superset.dashboards.api import DashboardRestApi

    method = getattr(DashboardRestApi, method_name)

    assert method._permission_name == "read"
