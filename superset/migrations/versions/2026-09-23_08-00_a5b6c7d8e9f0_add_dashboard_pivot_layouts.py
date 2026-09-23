"""add personal dashboard-wide pivot layout

Revision ID: a5b6c7d8e9f0
Revises: c4f812a9e1d3
"""

import sqlalchemy as sa
from alembic import op


revision = "a5b6c7d8e9f0"
down_revision = "c4f812a9e1d3"


def upgrade():
    op.create_table(
        "dashboard_pivot_layouts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("ab_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "dashboard_id",
            sa.Integer(),
            sa.ForeignKey("dashboards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("layout_json", sa.Text(), nullable=False),
        sa.Column("created_on", sa.DateTime(), nullable=True),
        sa.Column("changed_on", sa.DateTime(), nullable=True),
        sa.Column(
            "created_by_fk", sa.Integer(), sa.ForeignKey("ab_user.id"), nullable=True
        ),
        sa.Column(
            "changed_by_fk", sa.Integer(), sa.ForeignKey("ab_user.id"), nullable=True
        ),
        sa.UniqueConstraint(
            "user_id", "dashboard_id", name="uq_dashboard_pivot_layout_scope"
        ),
    )


def downgrade():
    op.drop_table("dashboard_pivot_layouts")
