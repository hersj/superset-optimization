from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import expression
from sqlalchemy.orm import relationship

from superset.models.helpers import AuditMixinNullable


class DashboardChartLayout(Model, AuditMixinNullable):
    """个人透视表模板：每用户/仪表盘/图表最多三个 slot，默认模板由 DAO 行锁切换。"""
    __tablename__ = "dashboard_chart_layouts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("ab_user.id", ondelete="CASCADE"), nullable=False)
    dashboard_id = Column(
        Integer,
        ForeignKey("dashboards.id", ondelete="CASCADE"),
        nullable=False,
    )
    chart_id = Column(Integer, ForeignKey("slices.id", ondelete="CASCADE"), nullable=False)
    slot = Column(Integer, nullable=False)
    name = Column(String(40), nullable=False)
    is_default = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    layout_json = Column(Text, nullable=False)

    user = relationship("User", foreign_keys=[user_id], lazy="joined")
    dashboard = relationship("Dashboard", foreign_keys=[dashboard_id], lazy="joined")
    chart = relationship("Slice", foreign_keys=[chart_id], lazy="joined")

    __table_args__ = (
        CheckConstraint("slot BETWEEN 1 AND 3", name="ck_dashboard_chart_layout_slot"),
        UniqueConstraint("user_id", "dashboard_id", "chart_id", "slot", name="uq_dashboard_chart_layout_scope_slot"),
        Index("uq_dashboard_chart_layout_default", "user_id", "dashboard_id", "chart_id", unique=True, postgresql_where=is_default.is_(True)),
    )
