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
from collections.abc import Iterator
from threading import Event, Thread

import pytest
from flask_appbuilder.security.sqla.models import User
from sqlalchemy import event
from sqlalchemy.orm.session import Session

from superset.models.dashboard import Dashboard
from superset.models.slice import Slice


@pytest.fixture
def dashboard_chart_layout_context(session: Session) -> Iterator[dict[str, object]]:
    from superset.models.dashboard_chart_layout import DashboardChartLayout

    engine = session.get_bind()
    DashboardChartLayout.metadata.create_all(engine)

    admin = session.query(User).filter_by(username="admin").one()
    gamma = session.query(User).filter_by(username="gamma").one()

    chart = Slice(
        id=99101,
        slice_name="layout chart",
        datasource_id=1,
        datasource_type="table",
        datasource_name="table",
        viz_type="pivot_table_v2",
        params="{}",
        query_context="{}",
    )
    dashboard = Dashboard(
        id=99102,
        dashboard_title="layout dashboard",
        slug="layout-dashboard",
        published=True,
        json_metadata="{}",
        slices=[chart],
        owners=[admin],
    )

    session.add(chart)
    session.add(dashboard)
    session.commit()

    yield {
        "admin": admin,
        "gamma": gamma,
        "chart": chart,
        "dashboard": dashboard,
    }

    session.query(DashboardChartLayout).delete()
    session.delete(dashboard)
    session.delete(chart)
    session.commit()


def test_find_by_dashboard_and_user_returns_only_user_rows(
    session: Session, dashboard_chart_layout_context: dict[str, object]
) -> None:
    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO

    admin = dashboard_chart_layout_context["admin"]
    gamma = dashboard_chart_layout_context["gamma"]
    dashboard = dashboard_chart_layout_context["dashboard"]
    chart = dashboard_chart_layout_context["chart"]

    DashboardChartLayoutDAO.upsert(
        user_id=admin.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        layout={
            "ordered_metric_ids": ["sales", "profit"],
            "hidden_metric_ids": [],
            "version": 1,
        },
    )
    DashboardChartLayoutDAO.upsert(
        user_id=gamma.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        layout={
            "ordered_metric_ids": ["profit", "sales"],
            "hidden_metric_ids": ["cost"],
            "version": 1,
        },
    )

    result = DashboardChartLayoutDAO.find_by_dashboard_and_user(
        dashboard.id, admin.id
    )

    assert result == {
        chart.id: {
            "ordered_metric_ids": ["sales", "profit"],
            "hidden_metric_ids": [],
            "version": 1,
        }
    }


def test_upsert_replaces_existing_row(
    dashboard_chart_layout_context: dict[str, object]
) -> None:
    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO

    admin = dashboard_chart_layout_context["admin"]
    dashboard = dashboard_chart_layout_context["dashboard"]
    chart = dashboard_chart_layout_context["chart"]

    DashboardChartLayoutDAO.upsert(
        user_id=admin.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        layout={
            "ordered_metric_ids": ["sales", "profit"],
            "hidden_metric_ids": [],
            "version": 1,
        },
    )
    DashboardChartLayoutDAO.upsert(
        user_id=admin.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        layout={
            "ordered_metric_ids": ["profit", "sales"],
            "hidden_metric_ids": ["cost"],
            "version": 1,
        },
    )

    result = DashboardChartLayoutDAO.find_by_dashboard_and_user(
        dashboard.id, admin.id
    )

    assert result[chart.id]["ordered_metric_ids"] == ["profit", "sales"]
    assert result[chart.id]["hidden_metric_ids"] == ["cost"]


def test_delete_removes_only_requested_row(
    dashboard_chart_layout_context: dict[str, object]
) -> None:
    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO

    admin = dashboard_chart_layout_context["admin"]
    dashboard = dashboard_chart_layout_context["dashboard"]
    chart = dashboard_chart_layout_context["chart"]

    DashboardChartLayoutDAO.upsert(
        user_id=admin.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        layout={
            "ordered_metric_ids": ["sales"],
            "hidden_metric_ids": [],
            "version": 1,
        },
    )

    assert (
        DashboardChartLayoutDAO.delete(
            user_id=admin.id,
            dashboard_id=dashboard.id,
            chart_id=chart.id,
        )
        is True
    )
    assert (
        DashboardChartLayoutDAO.find_by_dashboard_and_user(dashboard.id, admin.id)
        == {}
    )


def test_template_slots_keep_only_the_explicit_default(
    dashboard_chart_layout_context: dict[str, object]
) -> None:
    """默认切换只改变同 scope 既有 slot；删默认后必须保持无个人默认。"""
    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO

    admin = dashboard_chart_layout_context["admin"]
    dashboard = dashboard_chart_layout_context["dashboard"]
    chart = dashboard_chart_layout_context["chart"]
    layout = {
        "ordered_metric_ids": ["sales"],
        "hidden_metric_ids": [],
        "version": 1,
    }
    DashboardChartLayoutDAO.upsert(
        user_id=admin.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        slot=1,
        name="Template 1",
        layout=layout,
    )
    DashboardChartLayoutDAO.upsert(
        user_id=admin.id,
        dashboard_id=dashboard.id,
        chart_id=chart.id,
        slot=2,
        name="Template 2",
        layout=layout,
    )

    DashboardChartLayoutDAO.set_default(
        user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=2
    )
    templates = DashboardChartLayoutDAO.find_templates_by_dashboard_and_user(
        dashboard.id, admin.id
    )[chart.id]
    assert [(row.slot, row.is_default) for row in templates] == [(1, False), (2, True)]

    assert DashboardChartLayoutDAO.delete_slot(
        user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=2
    )
    templates = DashboardChartLayoutDAO.find_templates_by_dashboard_and_user(
        dashboard.id, admin.id
    )[chart.id]
    assert [(row.slot, row.is_default) for row in templates] == [(1, False)]


def test_postgresql_concurrent_default_switch_is_serialized_by_scope_row_lock(
    app, session: Session, dashboard_chart_layout_context: dict[str, object]
) -> None:
    """第二个事务必须在第一个提交后取得行锁，并成为最终唯一默认。"""
    if session.get_bind().dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL SELECT FOR UPDATE semantics")

    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO
    from superset.extensions import db

    admin = dashboard_chart_layout_context["admin"]
    dashboard = dashboard_chart_layout_context["dashboard"]
    chart = dashboard_chart_layout_context["chart"]
    layout = {"ordered_metric_ids": ["sales"], "hidden_metric_ids": [], "version": 1}
    for slot in (1, 2):
        DashboardChartLayoutDAO.upsert(
            user_id=admin.id,
            dashboard_id=dashboard.id,
            chart_id=chart.id,
            slot=slot,
            name=f"Template {slot}",
            layout=layout,
        )
    db.session.commit()

    # 先使较高 slot 成为默认，再反向切回较低 slot；覆盖部分唯一索引的危险更新顺序。
    DashboardChartLayoutDAO.set_default(
        user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=2
    )
    db.session.commit()
    DashboardChartLayoutDAO.set_default(
        user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=1
    )
    db.session.commit()
    DashboardChartLayoutDAO.set_default(
        user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=2
    )
    db.session.commit()

    first_locked = Event()
    release_first = Event()
    second_finished = Event()
    errors: list[Exception] = []

    def switch(slot: int, hold_lock: bool = False) -> None:
        try:
            with app.app_context():
                DashboardChartLayoutDAO.set_default(
                    user_id=admin.id,
                    dashboard_id=dashboard.id,
                    chart_id=chart.id,
                    slot=slot,
                )
                if hold_lock:
                    first_locked.set()
                    assert release_first.wait(timeout=5)
                db.session.commit()
                if slot == 1:
                    second_finished.set()
        except Exception as ex:  # pragma: no cover - surfaced by the assertion below
            errors.append(ex)

    first = Thread(target=switch, args=(2, True))
    second = Thread(target=switch, args=(1,))
    first.start()
    assert first_locked.wait(timeout=5)
    second.start()
    assert not second_finished.wait(timeout=0.2)
    release_first.set()
    first.join(timeout=5)
    second.join(timeout=5)
    assert not errors
    assert second_finished.is_set()

    session.expire_all()
    templates = DashboardChartLayoutDAO.find_templates_by_dashboard_and_user(
        dashboard.id, admin.id
    )[chart.id]
    assert [(row.slot, row.is_default) for row in templates] == [(1, True), (2, False)]


def test_postgresql_default_lock_query_uses_only_layout_rows(
    session: Session, dashboard_chart_layout_context: dict[str, object]
) -> None:
    """真实模型的默认切换锁查询不得因 joined 关系生成 DISTINCT 或关联 JOIN。"""
    if session.get_bind().dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL SELECT FOR UPDATE semantics")

    from superset.daos.dashboard_chart_layout import DashboardChartLayoutDAO
    from superset.extensions import db

    admin = dashboard_chart_layout_context["admin"]
    dashboard = dashboard_chart_layout_context["dashboard"]
    chart = dashboard_chart_layout_context["chart"]
    layout = {
        "ordered_metric_ids": ["sales"],
        "hidden_metric_ids": [],
        "version": 1,
    }
    for slot in (1, 2):
        DashboardChartLayoutDAO.upsert(
            user_id=admin.id,
            dashboard_id=dashboard.id,
            chart_id=chart.id,
            slot=slot,
            name=f"Template {slot}",
            layout=layout,
        )
    db.session.commit()

    statements: list[str] = []

    def capture_lock_query(
        connection: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        if "FOR UPDATE" in statement.upper():
            statements.append(statement)

    engine = session.get_bind()
    event.listen(engine, "before_cursor_execute", capture_lock_query)
    try:
        target = DashboardChartLayoutDAO.set_default(
            user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=2
        )
        db.session.commit()
    finally:
        event.remove(engine, "before_cursor_execute", capture_lock_query)

    assert target.slot == 2
    assert len(statements) == 1
    lock_sql = statements[0].lower()
    assert "distinct" not in lock_sql
    assert "join slices" not in lock_sql
    assert "join tables" not in lock_sql
    assert "for update of dashboard_chart_layouts" in lock_sql

    with pytest.raises(ValueError, match="Template slot does not exist"):
        DashboardChartLayoutDAO.set_default(
            user_id=admin.id, dashboard_id=dashboard.id, chart_id=chart.id, slot=3
        )
    db.session.rollback()
    session.expire_all()
    templates = DashboardChartLayoutDAO.find_templates_by_dashboard_and_user(
        dashboard.id, admin.id
    )[chart.id]
    assert [(row.slot, row.is_default) for row in templates] == [(1, False), (2, True)]
