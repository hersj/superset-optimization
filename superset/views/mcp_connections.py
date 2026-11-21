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
"""Session-authenticated management of the current user's MCP connections."""

from secrets import token_urlsafe
from time import time
from uuid import UUID

from flask import abort, Blueprint, current_app, jsonify, request, Response
from flask_appbuilder.security.sqla.models import User
from flask_login import current_user
from marshmallow import fields, post_load, Schema, validate, ValidationError
from sqlalchemy import func, update

from superset.extensions import db
from superset.mcp_service.connections import (
    MCP_CONNECTION_PREFIX,
    McpConnection,
    self_service_enabled,
    token_digest,
)

mcp_connections = Blueprint(
    "mcp_connections", __name__, url_prefix="/api/v1/mcp_connections"
)


class CreateConnectionSchema(Schema):
    label = fields.String(required=True)
    days = fields.Integer(
        required=True, strict=True, validate=validate.OneOf((7, 30, 90))
    )

    @post_load
    def validate_label(
        self, data: dict[str, str | int], **kwargs: object
    ) -> dict[str, str | int]:
        label = str(data["label"]).strip()
        if not 1 <= len(label) <= 32:
            raise ValidationError("Invalid connection name.", field_name="label")
        return {**data, "label": label}


def connection_payload(connection: McpConnection) -> dict[str, str | int]:
    if connection.revoked_at is not None:
        status = "revoked"
    elif connection.expires_at <= int(time()):
        status = "expired"
    else:
        status = "active"
    return {
        "id": str(connection.id),
        "label": connection.label,
        "expires_at": connection.expires_at,
        "status": status,
    }


@mcp_connections.before_request
def require_session() -> None:
    if not self_service_enabled(current_app.config):
        abort(404)
    if not isinstance(current_user, User) or not current_user.is_active:
        abort(401)


@mcp_connections.after_request
def prevent_credential_caching(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


@mcp_connections.get("/")
def list_connections() -> Response:
    connections = (
        db.session.query(McpConnection)
        .filter_by(user_id=current_user.id)
        .order_by(McpConnection.created_at.desc(), McpConnection.id)
        .all()
    )
    return jsonify(
        result=[connection_payload(connection) for connection in connections]
    )


@mcp_connections.post("/")
def create_connection() -> tuple[Response, int]:
    try:
        data = CreateConnectionSchema().load(request.get_json())
    except ValidationError as exc:
        return jsonify(errors=exc.messages), 400

    raw_token = MCP_CONNECTION_PREFIX + token_urlsafe(32)
    created_at = int(time())
    connection = McpConnection(
        user_id=current_user.id,
        label=data["label"],
        token_digest=token_digest(raw_token),
        created_at=created_at,
        expires_at=created_at + 86400 * data["days"],
    )
    db.session.add(connection)
    db.session.commit()
    return jsonify(result=connection_payload(connection), token=raw_token), 201


@mcp_connections.delete("/<uuid:connection_id>")
def revoke_connection(connection_id: UUID) -> Response:
    updated = db.session.execute(
        update(McpConnection)
        .where(
            McpConnection.id == connection_id,
            McpConnection.user_id == current_user.id,
        )
        .values(revoked_at=func.coalesce(McpConnection.revoked_at, int(time())))
    )
    if not updated.rowcount:
        abort(404)
    db.session.commit()
    return Response(status=204)
