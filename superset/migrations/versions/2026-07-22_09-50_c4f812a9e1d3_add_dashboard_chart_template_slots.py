"""add dashboard chart template slots

Revision ID: c4f812a9e1d3
Revises: b7f5640f3b21
Create Date: 2026-07-22 09:50:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "c4f812a9e1d3"
down_revision = "b7f5640f3b21"


def upgrade():
    op.add_column(
        "dashboard_chart_layouts",
        sa.Column("slot", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "dashboard_chart_layouts",
        sa.Column("name", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "dashboard_chart_layouts",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        "UPDATE dashboard_chart_layouts SET slot = 1, name = '模板 1', is_default = true"
    )
    op.alter_column("dashboard_chart_layouts", "slot", nullable=False)
    op.alter_column("dashboard_chart_layouts", "name", nullable=False)
    op.alter_column("dashboard_chart_layouts", "is_default", server_default=None)
    op.drop_constraint(
        "uq_dashboard_chart_layouts_user_dashboard_chart",
        "dashboard_chart_layouts",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_dashboard_chart_layout_scope_slot",
        "dashboard_chart_layouts",
        ["user_id", "dashboard_id", "chart_id", "slot"],
    )
    op.create_check_constraint(
        "ck_dashboard_chart_layout_slot",
        "dashboard_chart_layouts",
        "slot BETWEEN 1 AND 3",
    )
    op.create_index(
        "uq_dashboard_chart_layout_default",
        "dashboard_chart_layouts",
        ["user_id", "dashboard_id", "chart_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )


def downgrade():
    op.drop_index("uq_dashboard_chart_layout_default", table_name="dashboard_chart_layouts")
    op.drop_constraint("ck_dashboard_chart_layout_slot", "dashboard_chart_layouts", type_="check")
    op.drop_constraint("uq_dashboard_chart_layout_scope_slot", "dashboard_chart_layouts", type_="unique")
    op.create_unique_constraint(
        "uq_dashboard_chart_layouts_user_dashboard_chart",
        "dashboard_chart_layouts",
        ["user_id", "dashboard_id", "chart_id"],
    )
    op.drop_column("dashboard_chart_layouts", "is_default")
    op.drop_column("dashboard_chart_layouts", "name")
    op.drop_column("dashboard_chart_layouts", "slot")
