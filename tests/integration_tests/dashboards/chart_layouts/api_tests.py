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
from collections.abc import Iterator

import pytest
from flask_appbuilder.security.sqla.models import User

from superset import db
from superset.models.dashboard import Dashboard
from superset.models.slice import Slice


@pytest.fixture
def dashboard_with_pivot_chart() -> Iterator[dict[str, int]]:
    admin = db.session.query(User).filter_by(username="admin").one()
    chart = Slice(
        id=99201,
        slice_name="api layout chart",
        datasource_id=1,
        datasource_type="table",
        datasource_name="table",
        viz_type="pivot_table_v2",
        params="{}",
        query_context="{}",
    )
    dashboard = Dashboard(
        id=99202,
        dashboard_title="api layout dashboard",
        slug="api-layout-dashboard",
        published=True,
        json_metadata="{}",
        slices=[chart],
        owners=[admin],
    )

    db.session.add(chart)
    db.session.add(dashboard)
    db.session.commit()

    yield {"dashboard_id": dashboard.id, "chart_id": chart.id, "admin_id": admin.id}

    db.session.delete(dashboard)
    db.session.delete(chart)
    db.session.commit()


def test_get_dashboard_chart_layouts_returns_dashboard_map(
    test_client, login_as_admin, dashboard_with_pivot_chart
) -> None:
    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO

    DashboardChartLayoutDAO.upsert(
        user_id=dashboard_with_pivot_chart["admin_id"],
        dashboard_id=dashboard_with_pivot_chart["dashboard_id"],
        chart_id=dashboard_with_pivot_chart["chart_id"],
        layout={
            "ordered_metric_ids": ["profit", "sales"],
            "hidden_metric_ids": ["cost"],
            "version": 1,
        },
    )

    response = test_client.get(
        f"/api/v1/dashboard/{dashboard_with_pivot_chart['dashboard_id']}/chart_layouts"
    )

    assert response.status_code == 200
    payload = response.json["result"]
    assert payload[str(dashboard_with_pivot_chart["chart_id"])]["version"] == 1


def test_put_dashboard_chart_layout_upserts_row(
    test_client, login_as_admin, dashboard_with_pivot_chart
) -> None:
    response = test_client.put(
        f"/api/v1/dashboard/{dashboard_with_pivot_chart['dashboard_id']}/chart_layouts/{dashboard_with_pivot_chart['chart_id']}",
        json={
            "ordered_metric_ids": ["sales", "profit"],
            "hidden_metric_ids": [],
            "version": 1,
        },
    )

    assert response.status_code == 200


def test_delete_dashboard_chart_layout_removes_row(
    test_client, login_as_admin, dashboard_with_pivot_chart
) -> None:
    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO

    DashboardChartLayoutDAO.upsert(
        user_id=dashboard_with_pivot_chart["admin_id"],
        dashboard_id=dashboard_with_pivot_chart["dashboard_id"],
        chart_id=dashboard_with_pivot_chart["chart_id"],
        layout={
            "ordered_metric_ids": ["profit", "sales"],
            "hidden_metric_ids": [],
            "version": 1,
        },
    )

    response = test_client.delete(
        f"/api/v1/dashboard/{dashboard_with_pivot_chart['dashboard_id']}/chart_layouts/{dashboard_with_pivot_chart['chart_id']}"
    )

    assert response.status_code == 200


def test_get_dashboard_chart_layouts_access_denied(
    test_client, login_as, dashboard_with_pivot_chart
) -> None:
    login_as("gamma")
    response = test_client.get(
        f"/api/v1/dashboard/{dashboard_with_pivot_chart['dashboard_id']}/chart_layouts"
    )

    assert response.status_code == 404
