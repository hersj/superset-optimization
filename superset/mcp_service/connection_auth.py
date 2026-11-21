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
"""Verify personal connection tokens alongside the configured JWT verifier."""

import asyncio
from time import time

from fastmcp.server.auth import AccessToken, TokenVerifier
from flask import Flask
from flask_appbuilder.security.sqla.models import User

from superset.extensions import db
from superset.mcp_service.connections import (
    MCP_CONNECTION_PREFIX,
    McpConnection,
    token_digest,
)


class ConnectionTokenVerifier(TokenVerifier):
    def __init__(self, app: Flask, legacy: TokenVerifier | None) -> None:
        super().__init__()
        self.app = app
        self.legacy = legacy

    async def verify_token(self, token: str) -> AccessToken | None:
        if not token.startswith(MCP_CONNECTION_PREFIX):
            return await self.legacy.verify_token(token) if self.legacy else None
        return await asyncio.to_thread(self._verify_connection, token)

    def _verify_connection(self, token: str) -> AccessToken | None:
        with self.app.app_context():
            row = (
                db.session.query(User.username, McpConnection.expires_at)
                .join(McpConnection, User.id == McpConnection.user_id)
                .filter(
                    McpConnection.token_digest == token_digest(token),
                    McpConnection.revoked_at.is_(None),
                    McpConnection.expires_at > int(time()),
                    User.active.is_(True),
                )
                .one_or_none()
            )

        if row is None:
            return None
        username, expires_at = row
        return AccessToken(
            token=token,
            client_id="superset-personal-mcp",
            scopes=[],
            expires_at=expires_at,
            claims={"sub": username},
        )
