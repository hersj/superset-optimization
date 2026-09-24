from types import SimpleNamespace
import pytest
from marshmallow import ValidationError
from superset.utils import json

def test_library_preserves_legacy_and_keeps_default_snapshots(mocker):
    from superset.commands.dashboard.chart_layouts import DashboardPivotLayoutCommand
    layout = {"version": 1, "ordered_metric_ids": ["sales"], "hidden_metric_ids": [], "frozen_column_key": "sales"}
    row = SimpleNamespace(layout_json=json.dumps(layout))
    query = mocker.MagicMock()
    query.options.return_value.filter_by.return_value.with_for_update.return_value.one_or_none.return_value = row
    mocker.patch("superset.extensions.db.session.query", return_value=query)
    mocker.patch("superset.commands.dashboard.chart_layouts.get_user_id", return_value=7)
    mocker.patch("superset.commands.dashboard.chart_layouts.DashboardDAO.get_by_id_or_slug", return_value=SimpleNamespace(id=44, slices=[SimpleNamespace(id=1), SimpleNamespace(id=2)]))
    save = mocker.patch("superset.commands.dashboard.chart_layouts.DashboardPivotLayoutDAO.upsert",
                        side_effect=lambda user, dashboard, value: setattr(row, "layout_json", json.dumps(value)))
    command = DashboardPivotLayoutCommand(44)
    edit = DashboardPivotLayoutCommand.edit_library.__wrapped__
    result = edit(command, {"action": "default", "slot": 1, "chart_id": 1})
    assert result["defaults"] == {"1": layout}
    assert result["legacy_layout"] == layout
    changed = {**layout, "frozen_column_key": None}
    result = edit(command, {"action": "save", "slot": 1, "template": {"name": "New", "layout": changed}})
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
