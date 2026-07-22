from __future__ import annotations

from typing import Any

from superset.daos.base import BaseDAO
from superset.extensions import db
from superset.models.dashboard_chart_layout import DashboardChartLayout
from superset.utils import json


class DashboardChartLayoutDAO(BaseDAO[DashboardChartLayout]):
    """
    功能审计（可重写规格）：个人透视表列模板持久化
    - 功能目的与触发方式：为同一用户、仪表盘和图表保存最多三个可复用的透视表列顺序/隐藏模板；由模板 API 的查询、覆盖、重命名、删除和设默认命令调用。
    - 输入契约：scope 为 user_id/dashboard_id/chart_id，slot 仅允许 1..3；layout 为已由 API schema 校验的 v1 JSON；name 长度不超过 40。
    - 输出契约：查询按 chart/slot 升序返回；写入返回对应行；删除返回是否实际删除；设默认返回目标行。
    - 处理流程：按 scope+slot 查询或写入；设默认先按 slot 升序锁住 scope 的全部既有行，再清除旧默认并设置目标行。
    - 业务规则：同 scope+slot 只能一行；删除默认不补选；新模板不自动加入历史 layout；layout 身份规则由前端生成并由 schema 保证结构。
    - 状态与副作用：仅写 dashboard_chart_layouts；调用者的 transaction 负责提交或回滚。
    - 外部依赖：SQLAlchemy session、dashboard_chart_layouts 表及其 slot 检查、scope+slot 唯一约束和默认部分唯一索引。
    - 异常与边界：不存在的 slot 删除返回 False；设默认目标不存在抛 ValueError；并发设默认由已有行锁串行化，后取得锁并提交者成为最终默认。
    - 不变量与约束：不得跨用户/仪表盘/图表读取或写入；不得新增锁表、缓存或服务层；一次 dashboard 查询只进行一次批量数据库读取。
    - 验证方式：DAO 单元测试覆盖用户隔离、slot 覆盖/删除、默认删除、行锁默认切换和并发最终唯一默认。
    """

    @staticmethod
    def find_templates_by_dashboard_and_user(
        dashboard_id: int, user_id: int
    ) -> dict[int, list[DashboardChartLayout]]:
        rows = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.user_id == user_id,
            )
            .order_by(DashboardChartLayout.chart_id, DashboardChartLayout.slot)
            .all()
        )
        result: dict[int, list[DashboardChartLayout]] = {}
        for row in rows:
            result.setdefault(row.chart_id, []).append(row)
        return result

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
        # 兼容旧单布局端点：优先暴露个人默认，否则使用最小 slot，绝不随机覆盖。
        result: dict[int, dict[str, Any]] = {}
        for row in sorted(rows, key=lambda item: (item.chart_id, item.slot)):
            if row.chart_id not in result or row.is_default:
                result[row.chart_id] = json.loads(row.layout_json)
        return result

    @staticmethod
    def upsert(
        user_id: int,
        dashboard_id: int,
        chart_id: int,
        layout: dict[str, Any],
        slot: int = 1,
        name: str = "模板 1",
    ) -> DashboardChartLayout:
        row = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.user_id == user_id,
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.chart_id == chart_id,
                DashboardChartLayout.slot == slot,
            )
            .one_or_none()
        )
        if row is None:
            row = DashboardChartLayout(
                user_id=user_id,
                dashboard_id=dashboard_id,
                chart_id=chart_id,
                slot=slot,
                name=name,
                is_default=False,
            )
            db.session.add(row)
        row.layout_json = json.dumps(layout)
        row.name = name
        db.session.flush()
        return row

    @staticmethod
    def delete(user_id: int, dashboard_id: int, chart_id: int) -> bool:
        # 旧单布局端点只对应历史 slot 1，避免多模板后误删用户其他模板。
        return DashboardChartLayoutDAO.delete_slot(
            user_id=user_id,
            dashboard_id=dashboard_id,
            chart_id=chart_id,
            slot=1,
        )

    @staticmethod
    def delete_slot(
        user_id: int, dashboard_id: int, chart_id: int, slot: int
    ) -> bool:
        """删除指定 slot；删除默认模板后不补选，保留无个人默认状态。"""
        row = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.user_id == user_id,
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.chart_id == chart_id,
                DashboardChartLayout.slot == slot,
            )
            .one_or_none()
        )
        if row is None:
            return False
        db.session.delete(row)
        db.session.flush()
        return True

    @staticmethod
    def rename_slot(
        user_id: int, dashboard_id: int, chart_id: int, slot: int, name: str
    ) -> DashboardChartLayout:
        """重命名既有模板；不存在时不创建，防止把草稿误落库。"""
        row = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.user_id == user_id,
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.chart_id == chart_id,
                DashboardChartLayout.slot == slot,
            )
            .one_or_none()
        )
        if row is None:
            raise ValueError("Template slot does not exist")
        row.name = name
        db.session.flush()
        return row

    @staticmethod
    def set_default(
        user_id: int, dashboard_id: int, chart_id: int, slot: int
    ) -> DashboardChartLayout:
        rows = (
            db.session.query(DashboardChartLayout)
            .filter(
                DashboardChartLayout.user_id == user_id,
                DashboardChartLayout.dashboard_id == dashboard_id,
                DashboardChartLayout.chart_id == chart_id,
            )
            .order_by(DashboardChartLayout.slot)
            # 只锁模板主表；模型的 joined scope 关系会形成外连接，PostgreSQL 不允许对其 nullable 侧裸 FOR UPDATE。
            .with_for_update(of=DashboardChartLayout)
            .all()
        )
        target = next((row for row in rows if row.slot == slot), None)
        if target is None:
            raise ValueError("Template slot does not exist")
        for row in rows:
            row.is_default = False
        # PostgreSQL 的部分唯一索引即时校验；必须先消除旧默认再设目标，不能依赖 ORM UPDATE 顺序。
        db.session.flush()
        target.is_default = True
        db.session.flush()
        return target
