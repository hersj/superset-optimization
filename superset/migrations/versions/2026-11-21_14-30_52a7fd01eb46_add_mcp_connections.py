# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""Add personal MCP connections.

Revision ID: 52a7fd01eb46
Revises: a1b2c3d4e5f6
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy_utils import UUIDType

revision = "52a7fd01eb46"
down_revision = "a1b2c3d4e5f6"


def upgrade() -> None:
    op.create_table(
        "mcp_connection",
        sa.Column("id", UUIDType(binary=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("ab_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(length=32), nullable=False),
        sa.Column("token_digest", sa.String(length=64), nullable=False, unique=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("revoked_at", sa.BigInteger()),
    )
    op.create_index("ix_mcp_connection_user_id", "mcp_connection", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mcp_connection_user_id", table_name="mcp_connection")
    op.drop_table("mcp_connection")
