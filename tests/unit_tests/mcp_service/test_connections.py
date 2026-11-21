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
"""Exercise personal connection management and authenticated MCP chart access."""

import sqlite3
from pathlib import Path
from secrets import token_urlsafe
from time import time

import jwt
import pytest
from flask import session
from flask_wtf.csrf import generate_csrf
from httpx import ASGITransport, AsyncClient
from jinja2 import FileSystemLoader

from superset import db, security_manager
from superset.connectors.sqla.models import (
    RowLevelSecurityFilter,
    SqlaTable,
    TableColumn,
)
from superset.mcp_service import flask_singleton
from superset.mcp_service.app import mcp
from superset.mcp_service.connections import McpConnection, token_digest
from superset.mcp_service.server import _create_auth_provider
from superset.models.core import Database
from superset.models.slice import Slice
from superset.utils import json
from superset.utils.core import RowLevelSecurityFilterType

ENDPOINT = "/api/v1/mcp_connections/"


@pytest.mark.parametrize("app", [{"WTF_CSRF_ENABLED": True}], indirect=True)
async def test_personal_connection_lifecycle(app, monkeypatch, tmp_path):
    monkeypatch.setitem(app.config, "MCP_SELF_SERVICE_ENABLED", True)
    monkeypatch.setitem(app.config, "MCP_AUTH_ENABLED", True)
    monkeypatch.setitem(app.config, "MCP_RBAC_ENABLED", True)
    signing_key = token_urlsafe(48)
    monkeypatch.setitem(app.config, "MCP_JWT_SECRET", signing_key)
    monkeypatch.setitem(app.config, "MCP_JWT_ALGORITHM", "HS256")
    monkeypatch.setitem(app.config, "MCP_JWT_ISSUER", "mcp-test")
    monkeypatch.setitem(app.config, "MCP_JWT_AUDIENCE", "mcp-test")
    monkeypatch.setattr(flask_singleton, "app", app)
    templates = Path(__file__).resolve().parents[3] / "superset" / "templates"
    monkeypatch.setattr(app, "jinja_loader", FileSystemLoader(templates))

    McpConnection.__table__.create(db.engine, checkfirst=True)
    source = tmp_path / "sample.sqlite"
    with sqlite3.connect(source) as data:
        data.executescript(
            "CREATE TABLE allowed "
            "(value INTEGER, shop_id INTEGER, product TEXT, month_start DATETIME);"
            "INSERT INTO allowed VALUES "
            "(42, 1, 'target', '2026-10-01 12:00:00'),"
            "(100, 2, 'target', '2026-10-01 12:00:00'),"
            "(16, 1, 'other', '2026-10-01 12:00:00'),"
            "(27, 1, 'target', '2026-11-01 12:00:00');"
            "CREATE TABLE hidden (value INTEGER); INSERT INTO hidden VALUES (99);"
        )

    role = security_manager.add_role("MCP test reader")
    reader = security_manager.add_user(
        "mcp-reader",
        "MCP",
        "Reader",
        "reader@example.com",
        role,
        password="test-login-only",  # noqa: S106
    )
    other = security_manager.add_user(
        "mcp-other",
        "MCP",
        "Other",
        "other@example.com",
        role,
        password="test-login-only",  # noqa: S106
    )
    database = Database(database_name="isolated-mcp")
    database.set_sqlalchemy_uri(f"sqlite:///{source}")
    db.session.add(database)

    charts = []
    for table_name in ("allowed", "hidden"):
        columns = [TableColumn(column_name="value", type="INTEGER")]
        if table_name == "allowed":
            columns.extend(
                [
                    TableColumn(column_name="shop_id", type="INTEGER"),
                    TableColumn(column_name="product", type="TEXT"),
                    TableColumn(
                        column_name="month_start", type="DATETIME", is_dttm=True
                    ),
                ]
            )
        dataset = SqlaTable(
            table_name=table_name,
            database=database,
            columns=columns,
            main_dttm_col="month_start" if table_name == "allowed" else None,
        )
        db.session.add(dataset)
        db.session.flush()
        chart = Slice(
            slice_name=table_name,
            viz_type="table",
            datasource_id=dataset.id,
            datasource_type="table",
            params=json.dumps({"viz_type": "table", "all_columns": ["value"]}),
            query_context=json.dumps(
                {
                    "datasource": {"id": dataset.id, "type": "table"},
                    "queries": [
                        {
                            "columns": ["value"],
                            "metrics": [],
                            "row_limit": 20,
                            "time_range": "No filter",
                        }
                    ],
                    "form_data": {"viz_type": "table"},
                    "result_format": "json",
                    "result_type": "full",
                }
            ),
        )
        db.session.add(chart)
        charts.append(chart)
        if table_name == "allowed":
            allowed_dataset = dataset
            db.session.add(
                RowLevelSecurityFilter(
                    name="MCP test assigned shop",
                    filter_type=RowLevelSecurityFilterType.REGULAR,
                    roles=[role],
                    tables=[allowed_dataset],
                    clause="shop_id = 1",
                )
            )

    db.session.commit()
    allowed_id, hidden_id = (chart.id for chart in charts)
    for permission, view in (
        ("can_read", "Chart"),
        ("can_read", "user"),
        ("datasource_access", allowed_dataset.perm),
    ):
        security_manager.add_permission_role(
            role, security_manager.add_permission_view_menu(permission, view)
        )

    reader_id, reader_name = reader.id, reader.username
    other_id, other_name = other.id, other.username

    def login(user_id, username):
        browser = app.test_client()
        with app.app_context(), app.test_request_context():
            csrf = generate_csrf()
            session_value = session["csrf_token"]
        with app.app_context():
            with browser.session_transaction() as client_session:
                client_session["csrf_token"] = session_value
            response = browser.post(
                "/login/",
                data={
                    "username": username,
                    "password": "test-login-only",
                    "csrf_token": csrf,
                },
            )
            assert response.status_code == 302
            with browser.session_transaction() as client_session:
                assert client_session["_user_id"] == str(user_id)
        return browser, {"X-CSRFToken": csrf}

    browser, headers = login(reader_id, reader_name)
    other_browser, other_headers = login(other_id, other_name)
    with app.app_context():
        assert app.test_client().get(ENDPOINT).status_code == 401
    with app.app_context():
        assert (
            browser.post(ENDPOINT, json={"label": "Desk", "days": 30}).status_code
            == 400
        )
        assert (
            browser.post(
                ENDPOINT, json={"label": "Desk", "days": 366}, headers=headers
            ).status_code
            == 400
        )
        created = browser.post(
            ENDPOINT, json={"label": "Desk", "days": 365}, headers=headers
        )
        assert created.status_code == 201
        assert created.headers["Cache-Control"] == "no-store"
        body = created.get_json()
        token = body["token"]
        connection = body["result"]
        assert "token" not in browser.get(ENDPOINT).get_json()["result"][0]
        record = db.session.get(McpConnection, connection["id"])
        assert record.token_digest == token_digest(token)
        assert record.expires_at - record.created_at == 365 * 86400
        assert browser.get("/mcp-connections/").status_code == 200
    with app.app_context():
        assert other_browser.get(ENDPOINT).get_json()["result"] == []
        denied = other_browser.delete(
            ENDPOINT + connection["id"], headers=other_headers
        )
        assert denied.status_code == 404

    monkeypatch.setattr(mcp, "auth", _create_auth_provider(app))
    transport_app = mcp.http_app(json_response=True, stateless_http=True)
    async with transport_app.router.lifespan_context(transport_app):
        async with AsyncClient(
            transport=ASGITransport(app=transport_app),
            base_url="http://test",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json, text/event-stream",
                "MCP-Protocol-Version": "2025-03-26",
            },
        ) as agent:

            async def tool(name, request):
                reply = await agent.post(
                    "/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/call",
                        "params": {"name": name, "arguments": {"request": request}},
                    },
                )
                assert reply.status_code == 200
                result = reply.json()["result"]
                payload = result.get("structuredContent") or json.loads(
                    result["content"][0]["text"]
                )
                return payload.get("result", payload)

            listed = await tool("list_charts", {"select_columns": ["id"]})
            assert {item["id"] for item in listed["charts"]} == {allowed_id}
            data = await tool("get_chart_data", {"identifier": allowed_id})
            assert sorted(row["value"] for row in data["data"]) == [16, 27, 42]

            product = {"col": "product", "op": "IN", "val": ["target"]}
            october = "2026-10-01 : 2026-11-01"
            filtered = await tool(
                "get_chart_data",
                {
                    "identifier": allowed_id,
                    "extra_form_data": {"filters": [product], "time_range": october},
                },
            )
            assert filtered.get("data") == [{"value": 42}], filtered

            october_filter = {
                "col": "month_start",
                "op": "TEMPORAL_RANGE",
                "val": october,
            }
            denied_shop = await tool(
                "get_chart_data",
                {
                    "identifier": allowed_id,
                    "extra_form_data": {
                        "filters": [
                            product,
                            {"col": "shop_id", "op": "IN", "val": [2]},
                            october_filter,
                        ]
                    },
                },
            )
            assert denied_shop["error_type"] == "NoData"
            invalid = await tool(
                "get_chart_data",
                {
                    "identifier": allowed_id,
                    "extra_form_data": {
                        "filters": [{"col": "unknown", "op": "IN", "val": ["target"]}]
                    },
                },
            )
            assert invalid["error_type"] == "DataError"
            hidden = await tool("get_chart_data", {"identifier": hidden_id, "limit": 1})
            assert hidden["error_type"] == "NotFound"

            with app.app_context():
                assert (
                    browser.delete(
                        ENDPOINT + connection["id"], headers=headers
                    ).status_code
                    == 204
                )
                assert (
                    browser.get(ENDPOINT).get_json()["result"][0]["status"] == "revoked"
                )

            refused = await agent.post(
                "/mcp",
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            )
            assert refused.status_code == 401

            legacy = jwt.encode(
                {
                    "sub": reader_name,
                    "iss": "mcp-test",
                    "aud": "mcp-test",
                    "exp": int(time()) + 120,
                },
                signing_key,
                algorithm="HS256",
            )
            legacy_reply = await agent.post(
                "/mcp",
                headers={"Authorization": f"Bearer {legacy}"},
                json={"jsonrpc": "2.0", "id": 3, "method": "tools/list"},
            )
            assert legacy_reply.status_code == 200
