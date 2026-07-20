from __future__ import annotations

from typing import Any

from superset.commands.base import BaseCommand
from superset.commands.dashboard.exceptions import DashboardAccessDeniedError
from superset.daos.dashboard import DashboardDAO
from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO
from superset.utils.core import get_user_id
from superset.utils.decorators import transaction


class GetDashboardChartLayoutsCommand(BaseCommand):
    def __init__(self, dashboard_id: int):
        self._dashboard_id = dashboard_id

    def validate(self) -> None:
        pass

    def run(self) -> dict[str, dict[str, Any]]:
        dashboard = DashboardDAO.get_by_id_or_slug(self._dashboard_id)
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        chart_ids = {chart.id for chart in dashboard.slices}
        layouts = DashboardChartLayoutDAO.find_by_dashboard_and_user(
            dashboard.id,
            user_id,
        )
        return {
            str(chart_id): layout
            for chart_id, layout in layouts.items()
            if chart_id in chart_ids
        }


class UpsertDashboardChartLayoutCommand(BaseCommand):
    def __init__(self, dashboard_id: int, chart_id: int, layout: dict[str, Any]):
        self._dashboard_id = dashboard_id
        self._chart_id = chart_id
        self._layout = layout

    def validate(self) -> None:
        pass

    @transaction()
    def run(self) -> dict[str, Any]:
        dashboard = DashboardDAO.get_by_id_or_slug(self._dashboard_id)
        if self._chart_id not in {chart.id for chart in dashboard.slices}:
            raise ValueError(
                f"Chart {self._chart_id} is not part of dashboard {dashboard.id}"
            )
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        DashboardChartLayoutDAO.upsert(
            user_id=user_id,
            dashboard_id=dashboard.id,
            chart_id=self._chart_id,
            layout=self._layout,
        )
        return self._layout


class DeleteDashboardChartLayoutCommand(BaseCommand):
    def __init__(self, dashboard_id: int, chart_id: int):
        self._dashboard_id = dashboard_id
        self._chart_id = chart_id

    def validate(self) -> None:
        pass

    @transaction()
    def run(self) -> bool:
        dashboard = DashboardDAO.get_by_id_or_slug(self._dashboard_id)
        if self._chart_id not in {chart.id for chart in dashboard.slices}:
            raise ValueError(
                f"Chart {self._chart_id} is not part of dashboard {dashboard.id}"
            )
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        return DashboardChartLayoutDAO.delete(
            user_id=user_id,
            dashboard_id=dashboard.id,
            chart_id=self._chart_id,
        )
