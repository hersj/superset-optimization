"""add dashboard chart layouts

Revision ID: b7f5640f3b21
Revises: a1b2c3d4e5f6
Create Date: 2026-07-11 18:00:00.000000

"""

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "b7f5640f3b21"
down_revision = "a1b2c3d4e5f6"


def upgrade():
    op.create_table(
        "dashboard_chart_layouts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("dashboard_id", sa.Integer(), nullable=False),
        sa.Column("chart_id", sa.Integer(), nullable=False),
        sa.Column("layout_json", sa.Text(), nullable=False),
        sa.Column("created_on", sa.DateTime(), nullable=True),
        sa.Column("changed_on", sa.DateTime(), nullable=True),
        sa.Column("created_by_fk", sa.Integer(), nullable=True),
        sa.Column("changed_by_fk", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["changed_by_fk"], ["ab_user.id"]),
        sa.ForeignKeyConstraint(["chart_id"], ["slices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_fk"], ["ab_user.id"]),
        sa.ForeignKeyConstraint(["dashboard_id"], ["dashboards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["ab_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "dashboard_id",
            "chart_id",
            name="uq_dashboard_chart_layouts_user_dashboard_chart",
        ),
    )
    op.create_index(
        "ix_dashboard_chart_layouts_dashboard_user",
        "dashboard_chart_layouts",
        ["dashboard_id", "user_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(
        "ix_dashboard_chart_layouts_dashboard_user",
        table_name="dashboard_chart_layouts",
    )
    op.drop_table("dashboard_chart_layouts")

