from __future__ import annotations

from typing import Any

from superset.utils import json

from superset.commands.base import BaseCommand
from superset.commands.dashboard.exceptions import DashboardAccessDeniedError
from superset.daos.dashboard import DashboardDAO
from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO, DashboardPivotLayoutDAO
from superset.utils.core import get_user_id
from superset.utils.decorators import transaction


class DashboardPivotLayoutCommand(BaseCommand):
    """Read or change only the current user's shared layout for an accessible dashboard."""

    def __init__(self, dashboard_id: int):
        self.dashboard_id = dashboard_id

    def validate(self) -> None:
        pass

    def scope(self) -> tuple[int, int]:
        dashboard = DashboardDAO.get_by_id_or_slug(self.dashboard_id)
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        return user_id, dashboard.id

    def run(self) -> dict[str, Any] | None:
        user_id, dashboard_id = self.scope()
        row = DashboardPivotLayoutDAO.find(user_id, dashboard_id)
        return json.loads(row.layout_json) if row else None

    @transaction()
    def put(self, layout: dict[str, Any]) -> dict[str, Any]:
        user_id, dashboard_id = self.scope()
        DashboardPivotLayoutDAO.upsert(user_id, dashboard_id, layout)
        return layout

    @transaction()
    def delete(self) -> None:
        user_id, dashboard_id = self.scope()
        DashboardPivotLayoutDAO.delete(user_id, dashboard_id)

    def library(self, value: dict[str, Any] | None) -> dict[str, Any]:
        # Legacy shared layouts remain available and keep their initial appearance.
        if value and value.get("version") == 2:
            return value
        return {
            "version": 2,
            "templates": ([{"slot": 1, "name": "原看板共享布局", "is_default": False, "layout": value}] if value else []),
            "defaults": {},
            "legacy_layout": value,
        }

    def get_library(self) -> dict[str, Any]:
        return self.library(self.run())

    @transaction()
    def edit_library(self, payload: dict[str, Any]) -> dict[str, Any]:
        from sqlalchemy.orm import lazyload
        from superset.extensions import db
        from superset.models.dashboard_chart_layout import DashboardPivotLayout

        user_id, dashboard_id = self.scope()
        row = (
            db.session.query(DashboardPivotLayout)
            .options(lazyload("*"))
            .filter_by(user_id=user_id, dashboard_id=dashboard_id)
            .with_for_update()
            .one_or_none()
        )
        library = self.library(json.loads(row.layout_json) if row else None)
        action, slot = payload["action"], payload.get("slot")
        template = next(
            (item for item in library["templates"] if item["slot"] == slot), None
        )
        if action == "save":
            library["templates"] = [
                item for item in library["templates"] if item["slot"] != slot
            ]
            library["templates"].append(
                {
                    "slot": slot,
                    "name": payload["template"]["name"],
                    "layout": payload["template"]["layout"],
                    "is_default": False,
                }
            )
            library["templates"].sort(key=lambda item: item["slot"])
        elif action == "delete":
            library["templates"] = [
                item for item in library["templates"] if item["slot"] != slot
            ]
            # Applied/default snapshots are deliberately not removed with their source.
        elif action in ("default", "apply"):
            dashboard = DashboardDAO.get_by_id_or_slug(dashboard_id)
            chart_id = payload["chart_id"]
            if chart_id not in {chart.id for chart in dashboard.slices}:
                raise ValueError("Chart is not part of dashboard")
            if action == "default" and template is None:
                raise ValueError("Template slot does not exist")
            # Remember an applied snapshot without overwriting any saved template.
            library["defaults"][str(chart_id)] = (
                payload["layout"] if action == "apply" else template["layout"]
            )
        else:
            raise ValueError("Invalid action")
        DashboardPivotLayoutDAO.upsert(user_id, dashboard_id, library)
        return library


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


class _DashboardChartTemplateScope(BaseCommand):
    """模板 API 共用的 dashboard/chart/user 归属校验，避免不同写接口绕过权限。"""

    def __init__(self, dashboard_id: int, chart_id: int):
        self.dashboard_id = dashboard_id
        self.chart_id = chart_id

    def validate(self) -> None:
        """满足 BaseCommand 抽象契约，实际归属/权限校验在 run 时使用当前用户执行。"""

        # 模板命令的用户、dashboard、chart 关系依赖请求上下文；由 get_scope()
        # 在事务内统一校验，避免在构造阶段读取可能不存在的当前用户。
        pass

    def get_scope(self) -> tuple[int, int]:
        dashboard = DashboardDAO.get_by_id_or_slug(self.dashboard_id)
        if self.chart_id not in {chart.id for chart in dashboard.slices}:
            raise ValueError(f"Chart {self.chart_id} is not part of dashboard {dashboard.id}")
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        return dashboard.id, user_id


def serialize_chart_template(row: Any) -> dict[str, Any]:
    return {
        "slot": row.slot,
        "name": row.name,
        "is_default": row.is_default,
        "layout": json.loads(row.layout_json),
    }


class GetDashboardChartTemplatesCommand(BaseCommand):
    def __init__(self, dashboard_id: int):
        self.dashboard_id = dashboard_id

    def validate(self) -> None:
        """满足 BaseCommand 抽象契约；读取权限及 dashboard 归属在 run 中校验。"""

        pass

    def run(self) -> dict[str, list[dict[str, Any]]]:
        dashboard = DashboardDAO.get_by_id_or_slug(self.dashboard_id)
        user_id = get_user_id()
        if user_id is None:
            raise DashboardAccessDeniedError()
        valid_chart_ids = {chart.id for chart in dashboard.slices}
        templates = DashboardChartLayoutDAO.find_templates_by_dashboard_and_user(
            dashboard.id, user_id
        )
        return {
            str(chart_id): [serialize_chart_template(row) for row in rows]
            for chart_id, rows in templates.items()
            if chart_id in valid_chart_ids
        }


class PutDashboardChartTemplateCommand(_DashboardChartTemplateScope):
    def __init__(self, dashboard_id: int, chart_id: int, slot: int, payload: dict[str, Any]):
        super().__init__(dashboard_id, chart_id)
        self.slot = slot
        self.payload = payload

    @transaction()
    def run(self) -> dict[str, Any]:
        dashboard_id, user_id = self.get_scope()
        row = DashboardChartLayoutDAO.upsert(
            user_id=user_id, dashboard_id=dashboard_id, chart_id=self.chart_id,
            slot=self.slot, name=self.payload["name"], layout=self.payload["layout"],
        )
        return serialize_chart_template(row)


class SetDefaultDashboardChartTemplateCommand(_DashboardChartTemplateScope):
    def __init__(self, dashboard_id: int, chart_id: int, slot: int):
        super().__init__(dashboard_id, chart_id)
        self.slot = slot

    @transaction()
    def run(self) -> dict[str, Any]:
        dashboard_id, user_id = self.get_scope()
        row = DashboardChartLayoutDAO.set_default(
            user_id=user_id, dashboard_id=dashboard_id, chart_id=self.chart_id, slot=self.slot,
        )
        return serialize_chart_template(row)


class DeleteDashboardChartTemplateCommand(_DashboardChartTemplateScope):
    def __init__(self, dashboard_id: int, chart_id: int, slot: int):
        super().__init__(dashboard_id, chart_id)
        self.slot = slot

    @transaction()
    def run(self) -> bool:
        dashboard_id, user_id = self.get_scope()
        return DashboardChartLayoutDAO.delete_slot(
            user_id=user_id, dashboard_id=dashboard_id, chart_id=self.chart_id, slot=self.slot,
        )


class RenameDashboardChartTemplateCommand(_DashboardChartTemplateScope):
    """仅修改既有模板名称，模板草稿仍只存在于浏览器内存。"""

    def __init__(self, dashboard_id: int, chart_id: int, slot: int, name: str):
        super().__init__(dashboard_id, chart_id)
        self.slot = slot
        self.name = name

    @transaction()
    def run(self) -> dict[str, Any]:
        dashboard_id, user_id = self.get_scope()
        row = DashboardChartLayoutDAO.rename_slot(
            user_id=user_id,
            dashboard_id=dashboard_id,
            chart_id=self.chart_id,
            slot=self.slot,
            name=self.name,
        )
        return serialize_chart_template(row)
