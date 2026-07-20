from __future__ import annotations

from typing import Any

from superset.daos.base import BaseDAO
from superset.extensions import db
from superset.models.dashboard_chart_layout import DashboardChartLayout
from superset.utils import json


class DashboardChartLayoutDAO(BaseDAO[DashboardChartLayout]):
    @staticmethod
    def find_by_dashboard_and_user(
        dashboard_id: int, user_id: int
    ) -> dict[int, dict[str, Any]]:
        rows = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.user_id == user_id,
            )
            .all()
        )
        return {
            row.chart_id: json.loads(row.layout_json)
            for row in rows
        }

    @staticmethod
    def upsert(
        user_id: int,
        dashboard_id: int,
        chart_id: int,
        layout: dict[str, Any],
    ) -> DashboardChartLayout:
        row = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.user_id == user_id,
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.chart_id == chart_id,
            )
            .one_or_none()
        )
        if row is None:
            row = DashboardChartLayout(
                user_id=user_id,
                dashboard_id=dashboard_id,
                chart_id=chart_id,
            )
            db.session.add(row)
        row.layout_json = json.dumps(layout)
        db.session.flush()
        return row

    @staticmethod
    def delete(user_id: int, dashboard_id: int, chart_id: int) -> bool:
        row = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.user_id == user_id,
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.chart_id == chart_id,
            )
            .one_or_none()
        )
        if row is None:
            return False
        db.session.delete(row)
        db.session.flush()
        return True

