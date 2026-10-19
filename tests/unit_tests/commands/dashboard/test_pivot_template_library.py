from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from marshmallow import ValidationError
from pytest_mock import MockerFixture

from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand
from superset.utils import json


def test_library_preserves_legacy_and_keeps_default_snapshots(mocker):
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    layout = {
        "version": 1,
        "ordered_metric_ids": ["sales"],
        "hidden_metric_ids": [],
        "frozen_column_key": "sales",
    }
    row = SimpleNamespace(layout_json=json.dumps(layout))
    query = mocker.MagicMock()
    locked_query = query.options.return_value.filter_by.return_value
    locked_query.with_for_update.return_value.one_or_none.return_value = row
    mocker.patch("superset.extensions.db.session.query", return_value=query)
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.get_user_id", return_value=7
    )
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(
            id=44, slices=[SimpleNamespace(id=1), SimpleNamespace(id=2)]
        ),
    )
    save = mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardPivotLayoutDAO.upsert",
        side_effect=lambda user, dashboard, value: setattr(
            row, "layout_json", json.dumps(value)
        ),
    )
    command = DashboardPivotLayoutCommand(44)
    edit = DashboardPivotLayoutCommand.edit_library.__wrapped__
    result = edit(command, {"action": "default", "slot": 1, "chart_id": 1})
    assert result["defaults"] == {"1": layout}
    assert result["legacy_layout"] == layout
    changed = {**layout, "frozen_column_key": None}
    result = edit(
        command,
        {"action": "save", "slot": 1, "template": {"name": "New", "layout": changed}},
    )
    assert result["defaults"]["1"] == layout
    result = edit(command, {"action": "delete", "slot": 1})
    assert result["templates"] == []
    assert result["defaults"]["1"] == layout
    assert save.call_args.args[:2] == (7, 44)
    query.options.return_value.filter_by.assert_called_with(user_id=7, dashboard_id=44)
    save.reset_mock()
    with pytest.raises(ValueError, match="not part"):
        edit(command, {"action": "default", "slot": 1, "chart_id": 999})
    save.assert_not_called()


def test_freeze_boundary_schema_and_library_permission():
    from superset.dashboards.api import DashboardRestApi
    from superset.dashboards.schemas import DashboardChartLayoutSchema

    schema = DashboardChartLayoutSchema()
    base = {"version": 1, "ordered_metric_ids": ["sales"], "hidden_metric_ids": []}
    assert "frozen_column_key" not in schema.load(base)
    assert schema.load({**base, "frozen_column_key": None})["frozen_column_key"] is None
    for value in ([], {}, "", "x" * 4097):
        with pytest.raises(ValidationError):
            schema.load({**base, "frozen_column_key": value})
    assert "pivot_templates" in DashboardRestApi.include_route_methods
    assert DashboardRestApi.pivot_templates._permission_name == "read"


@pytest.fixture
def personal_library(
    mocker: MockerFixture,
) -> tuple[DashboardPivotLayoutCommand, SimpleNamespace, MagicMock, MagicMock]:
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    layout = {
        "version": 1,
        "ordered_metric_ids": ["sales", "profit"],
        "hidden_metric_ids": [],
    }
    row = SimpleNamespace(
        layout_json=json.dumps(
            {
                "version": 2,
                "templates": [
                    {
                        "slot": 1,
                        "name": "Original",
                        "is_default": False,
                        "layout": layout,
                    }
                ],
                "defaults": {"2": layout},
                "legacy_layout": None,
            }
        )
    )
    query = mocker.MagicMock()
    locked_query = query.options.return_value.filter_by.return_value
    locked_query.with_for_update.return_value.one_or_none.return_value = row
    mocker.patch("superset.extensions.db.session.query", return_value=query)
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.get_user_id", return_value=7
    )
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(
            id=44, slices=[SimpleNamespace(id=1), SimpleNamespace(id=2)]
        ),
    )
    mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardPivotLayoutDAO.find",
        return_value=row,
    )
    save = mocker.patch(
        "superset.commands.dashboard.chart_layouts.DashboardPivotLayoutDAO.upsert",
        side_effect=lambda user, dashboard, value: setattr(
            row, "layout_json", json.dumps(value)
        ),
    )
    return DashboardPivotLayoutCommand(44), row, save, query


def test_apply_persists_snapshot_without_changing_template_or_other_chart(
    personal_library: tuple[
        DashboardPivotLayoutCommand, SimpleNamespace, MagicMock, MagicMock
    ],
) -> None:
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    command, row, save, query = personal_library
    before = json.loads(row.layout_json)
    layout = {
        "version": 1,
        "ordered_metric_ids": ["profit", "sales"],
        "hidden_metric_ids": ["sales"],
        "frozen_column_key": "profit",
    }
    result = DashboardPivotLayoutCommand.edit_library.__wrapped__(
        command, {"action": "apply", "chart_id": 1, "layout": layout, "user_id": 999}
    )
    assert result["templates"] == before["templates"]
    assert result["defaults"] == {**before["defaults"], "1": layout}
    assert command.get_library() == result
    assert save.call_args.args[:2] == (7, 44)
    query.options.return_value.filter_by.assert_called_with(user_id=7, dashboard_id=44)


def test_apply_rejects_chart_outside_dashboard_without_writing(
    personal_library: tuple[
        DashboardPivotLayoutCommand, SimpleNamespace, MagicMock, MagicMock
    ],
) -> None:
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    command, row, save, _ = personal_library
    before = row.layout_json
    with pytest.raises(ValueError, match="not part"):
        DashboardPivotLayoutCommand.edit_library.__wrapped__(
            command, {"action": "apply", "chart_id": 999, "layout": {}}
        )
    assert row.layout_json == before
    save.assert_not_called()


def test_restoring_system_default_and_deleting_template_preserves_snapshots(
    personal_library: tuple[
        DashboardPivotLayoutCommand, SimpleNamespace, MagicMock, MagicMock
    ],
) -> None:
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand

    command, row, _, _ = personal_library
    before = json.loads(row.layout_json)
    layout = {
        "version": 1,
        "ordered_metric_ids": ["sales", "profit"],
        "hidden_metric_ids": [],
        "frozen_column_key": None,
        "frozen_column_count": 0,
    }
    edit = DashboardPivotLayoutCommand.edit_library.__wrapped__
    edit(command, {"action": "apply", "chart_id": 1, "layout": layout})
    result = edit(command, {"action": "delete", "slot": 1})
    assert result["templates"] == []
    assert command.get_library()["defaults"] == {**before["defaults"], "1": layout}


@pytest.mark.parametrize(
    "payload, status",
    [
        (
            {
                "action": "apply",
                "chart_id": 1,
                "layout": {
                    "version": 1,
                    "ordered_metric_ids": ["sales"],
                    "hidden_metric_ids": [],
                },
            },
            200,
        ),
        (
            {
                "action": "apply",
                "chart_id": True,
                "layout": {
                    "version": 1,
                    "ordered_metric_ids": ["sales"],
                    "hidden_metric_ids": [],
                },
            },
            400,
        ),
        (
            {
                "action": "apply",
                "chart_id": 1,
                "layout": {"ordered_metric_ids": "sales"},
            },
            400,
        ),
        ({"action": "apply", "chart_id": 1}, 400),
        ({"action": "default", "chart_id": 1}, 400),
        (
            {
                "action": "apply",
                "chart_id": 1,
                "layout": {
                    "version": 2,
                    "ordered_metric_ids": ["sales"],
                    "hidden_metric_ids": [],
                },
            },
            400,
        ),
        (
            {
                "action": "apply",
                "chart_id": 1,
                "layout": {
                    "version": 1,
                    "ordered_metric_ids": ["sales", "sales"],
                    "hidden_metric_ids": [],
                },
            },
            400,
        ),
        (
            {
                "action": "apply",
                "chart_id": 1,
                "layout": {
                    "version": 1,
                    "ordered_metric_ids": ["sales"],
                    "hidden_metric_ids": ["unknown"],
                },
            },
            400,
        ),
        (
            {
                "action": "apply",
                "chart_id": 1,
                "layout": {
                    "version": 1,
                    "ordered_metric_ids": [str(i) for i in range(2001)],
                    "hidden_metric_ids": [],
                },
            },
            400,
        ),
    ],
)
def test_apply_api_validates_layout_and_chart_id(
    mocker: MockerFixture, payload: dict[str, Any], status: int
) -> None:
    import inspect

    from flask import Flask

    from superset.dashboards.api import DashboardRestApi
    from superset.dashboards.schemas import (
        DashboardChartLayoutSchema,
        DashboardChartTemplateSchema,
    )

    command = mocker.patch(
        "superset.dashboards.api.DashboardPivotLayoutCommand"
    ).return_value
    command.edit_library.return_value = {
        "version": 2,
        "templates": [],
        "defaults": {},
        "legacy_layout": None,
    }
    api = SimpleNamespace(
        chart_layout_model_schema=DashboardChartLayoutSchema(),
        chart_template_model_schema=DashboardChartTemplateSchema(),
        response=lambda code, **kwargs: (code, kwargs),
        response_400=lambda **kwargs: (400, kwargs),
    )
    with Flask(__name__).test_request_context(method="PUT", json=payload):
        result = inspect.unwrap(DashboardRestApi.pivot_templates)(api, 44)
    assert result[0] == status
    if status == 200:
        command.edit_library.assert_called_once_with(
            {**payload, "layout": {**payload["layout"], "frozen_column_count": 0}}
        )
    else:
        command.edit_library.assert_not_called()


def test_apply_commits_and_reloads_real_user_scoped_snapshots(
    mocker: MockerFixture,
) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from superset.models.dashboard_chart_layout import DashboardPivotLayout

    engine = create_engine("sqlite://")
    DashboardPivotLayout.__table__.create(engine)
    try:
        with Session(engine) as session:
            mocker.patch("superset.extensions.db.session", session)
            current_user = mocker.patch(
                "superset.commands.dashboard.chart_layouts.get_user_id", return_value=7
            )
            mocker.patch(
                "superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug",
                return_value=SimpleNamespace(
                    id=44, slices=[SimpleNamespace(id=1), SimpleNamespace(id=2)]
                ),
            )
            command = DashboardPivotLayoutCommand(44)
            layout = {
                "version": 1,
                "ordered_metric_ids": ["profit", "sales"],
                "hidden_metric_ids": ["sales"],
                "frozen_column_key": "profit",
            }
            command.edit_library({"action": "apply", "chart_id": 1, "layout": layout})
            session.expire_all()
            assert DashboardPivotLayoutCommand(44).get_library()["defaults"] == {
                "1": layout
            }
            current_user.return_value = 8
            assert DashboardPivotLayoutCommand(44).get_library()["defaults"] == {}
            other = {**layout, "hidden_metric_ids": [], "frozen_column_key": None}
            command.edit_library({"action": "apply", "chart_id": 2, "layout": other})
            session.expire_all()
            assert command.get_library()["defaults"] == {"2": other}
            current_user.return_value = 7
            assert command.get_library()["defaults"] == {"1": layout}
            assert session.query(DashboardPivotLayout).count() == 2
    finally:
        engine.dispose()
