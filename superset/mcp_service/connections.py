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
"""Personal MCP connection metadata and credential boundaries."""

from hashlib import sha256
from uuid import uuid4

from flask import Config
from flask_appbuilder import Model
from sqlalchemy import BigInteger, Column, ForeignKey, Integer, String
from sqlalchemy_utils import UUIDType

MCP_CONNECTION_PREFIX = "sfmcp_"


def self_service_enabled(config: Config) -> bool:
    return bool(
        config.get("MCP_SELF_SERVICE_ENABLED")
        and config.get("MCP_AUTH_ENABLED")
        and config.get("MCP_RBAC_ENABLED", True)
        and not config.get("MCP_AUTH_FACTORY")
        and not config.get("MCP_REQUIRED_SCOPES")
    )


def token_digest(token: str) -> str:
    return sha256(token.encode()).hexdigest()


class McpConnection(Model):
    __tablename__ = "mcp_connection"

    id = Column(UUIDType(binary=True), primary_key=True, default=uuid4)
    user_id = Column(
        Integer,
        ForeignKey("ab_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label = Column(String(32), nullable=False)
    token_digest = Column(String(64), nullable=False, unique=True)
    created_at = Column(BigInteger, nullable=False)
    expires_at = Column(BigInteger, nullable=False)
    revoked_at = Column(BigInteger)
