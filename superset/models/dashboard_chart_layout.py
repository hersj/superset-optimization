from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from superset.models.helpers import AuditMixinNullable


class DashboardChartLayout(Model, AuditMixinNullable):
    __tablename__ = "dashboard_chart_layouts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("ab_user.id", ondelete="CASCADE"), nullable=False)
    dashboard_id = Column(
        Integer,
        ForeignKey("dashboards.id", ondelete="CASCADE"),
        nullable=False,
    )
    chart_id = Column(Integer, ForeignKey("slices.id", ondelete="CASCADE"), nullable=False)
    layout_json = Column(Text, nullable=False)

    user = relationship("User", foreign_keys=[user_id], lazy="joined")
    dashboard = relationship("Dashboard", foreign_keys=[dashboard_id], lazy="joined")
    chart = relationship("Slice", foreign_keys=[chart_id], lazy="joined")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "dashboard_id",
            "chart_id",
            name="uq_dashboard_chart_layouts_user_dashboard_chart",
        ),
    )

