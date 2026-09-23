from types import SimpleNamespace

import pytest
from marshmallow import ValidationError

from superset.commands.dashboard.exceptions import DashboardAccessDeniedError


def test_dashboard_pivot_layout_is_scoped_to_current_user(mocker):
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(id=44),
    )
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.get_user_id", return_value=7
    )
    find = mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardPivotLayoutDAO.find",
        return_value=SimpleNamespace(
            layout_json='{"version":1,"ordered_metric_ids":["sales"],"hidden_metric_ids":[]}'
        ),
    )

    assert DashboardPivotLayoutCommand(44).run()["ordered_metric_ids"] == ["sales"]
    find.assert_called_once_with(7, 44)


def test_dashboard_pivot_layout_denies_anonymous_user(mocker):
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(id=44),
    )
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.get_user_id", return_value=None
    )
    find = mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardPivotLayoutDAO.find"
    )

    with pytest.raises(DashboardAccessDeniedError):
        DashboardPivotLayoutCommand(44).run()
    find.assert_not_called()


def test_dashboard_pivot_layout_validates_freeze_count_and_read_permission():
    from superset.dashboards.api import DashboardRestApi
    from superset.dashboards.schemas import DashboardChartLayoutSchema

    assert "pivot_layout" in DashboardRestApi.include_route_methods
    assert DashboardRestApi.pivot_layout._permission_name == "read"
    with pytest.raises(ValidationError):
        DashboardChartLayoutSchema().load(
            {
                "version": 1,
                "ordered_metric_ids": ["sales"],
                "hidden_metric_ids": [],
                "frozen_column_count": 2001,
            }
        )
