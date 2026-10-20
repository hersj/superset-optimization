from types import SimpleNamespace

import pytest
from flask import Flask

from superset.commands.dashboard.chart_row_limits import DashboardChartRowLimitsCommand
from superset.commands.dashboard.exceptions import DashboardAccessDeniedError
from superset.key_value.types import JsonKeyValueCodec


@pytest.fixture
def scope(mocker):
    app = Flask(__name__)
    app.config["SQL_MAX_ROW"] = 500
    user = mocker.patch(
        "superset.commands.dashboard.chart_row_limits.get_user_id", return_value=7
    )
    dashboard = mocker.patch(
        "superset.commands.dashboard.chart_row_limits.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(
            id=54, slices=[SimpleNamespace(id=1), SimpleNamespace(id=2)]
        ),
    )
    records = {}

    def upsert(resource, value, codec, key):
        records[key] = SimpleNamespace(uuid=key, value=codec.encode(value))

    save = mocker.patch(
        "superset.commands.dashboard.chart_row_limits.KeyValueDAO.upsert_entry",
        side_effect=upsert,
    )
    delete = mocker.patch(
        "superset.commands.dashboard.chart_row_limits.KeyValueDAO.delete_entry",
        side_effect=lambda resource, key: records.pop(key, None),
    )
    query = mocker.patch(
        "superset.commands.dashboard.chart_row_limits.db.session.query"
    )
    command = DashboardChartRowLimitsCommand(54)
    query.return_value.filter.return_value.all.side_effect = lambda: [
        row
        for key, row in records.items()
        if key in {command.key(user.return_value, 1), command.key(user.return_value, 2)}
    ]
    with app.app_context():
        yield command, user, records, save, delete, dashboard


def put(command, payload):
    return DashboardChartRowLimitsCommand.put.__wrapped__(command, payload)


def test_persists_per_user_dashboard_chart_and_reset(scope):
    command, user, records, save, delete, dashboard = scope
    assert put(command, {"chart_id": 1, "row_limit": 50, "user_id": 999}) == 50
    put(command, {"chart_id": 2, "row_limit": 100})
    assert command.run() == {"1": 50, "2": 100}
    assert command.key(7, 1) != DashboardChartRowLimitsCommand(55).key(7, 1)
    user.return_value = 8
    assert command.run() == {}
    put(command, {"chart_id": 1, "row_limit": 250})
    user.return_value = 7
    assert command.run() == {"1": 50, "2": 100}
    put(command, {"chart_id": 1, "row_limit": None})
    assert command.run() == {"2": 100}
    delete.assert_called_once()


@pytest.mark.parametrize("value", [0, -1, 501, 1.5, True, "50", {}, []])
def test_rejects_invalid_limit_without_writing(scope, value):
    command, user, records, save, delete, dashboard = scope
    with pytest.raises(ValueError, match="Row limit must"):
        put(command, {"chart_id": 1, "row_limit": value})
    save.assert_not_called()
    delete.assert_not_called()


@pytest.mark.parametrize(
    "payload",
    [
        {"chart_id": 99, "row_limit": 50},
        {"chart_id": True, "row_limit": 50},
        {"chart_id": 1},
    ],
)
def test_rejects_invalid_chart_or_missing_value(scope, payload):
    command, user, records, save, delete, dashboard = scope
    with pytest.raises(ValueError, match="Chart is not part|Row limit must"):
        put(command, payload)
    save.assert_not_called()
    delete.assert_not_called()


def test_anonymous_and_inaccessible_dashboard_cannot_read_or_write(scope):
    command, user, records, save, delete, dashboard = scope
    user.return_value = None
    with pytest.raises(DashboardAccessDeniedError):
        command.run()
    with pytest.raises(DashboardAccessDeniedError):
        put(command, {"chart_id": 1, "row_limit": 50})
    user.return_value = 7
    dashboard.side_effect = DashboardAccessDeniedError()
    with pytest.raises(DashboardAccessDeniedError):
        put(command, {"chart_id": 1, "row_limit": 50})
    save.assert_not_called()


def test_lowered_system_max_clamps_existing_preference(scope):
    command, user, records, save, delete, dashboard = scope
    key = command.key(7, 1)
    records[key] = SimpleNamespace(
        uuid=key, value=JsonKeyValueCodec().encode({"row_limit": 1000})
    )
    assert command.run() == {"1": 500}


def test_real_key_value_database_round_trip_isolated_sqlite(mocker):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from superset.daos.key_value import KeyValueDAO
    from superset.key_value.models import KeyValueEntry
    from superset.key_value.types import KeyValueResource

    engine = create_engine("sqlite://")
    KeyValueEntry.__table__.create(engine)
    app = Flask(__name__)
    app.config["SQL_MAX_ROW"] = 500
    mocker.patch(
        "superset.commands.dashboard.chart_row_limits.get_user_id", return_value=7
    )
    mocker.patch("superset.daos.key_value.get_user_id", return_value=7)
    mocker.patch(
        "superset.commands.dashboard.chart_row_limits.DashboardDAO.get_by_id_or_slug",
        return_value=SimpleNamespace(id=54, slices=[SimpleNamespace(id=1)]),
    )
    with app.app_context(), Session(engine) as session:
        mocker.patch("superset.commands.dashboard.chart_row_limits.db.session", session)
        command = DashboardChartRowLimitsCommand(54)
        put(command, {"chart_id": 1, "row_limit": 50})
        session.commit()
        assert command.run() == {"1": 50}
        entry = KeyValueDAO.get_entry(KeyValueResource.APP, command.key(7, 1))
        assert entry.expires_on is None
        assert entry.created_by_fk == 7
        put(command, {"chart_id": 1, "row_limit": None})
        session.commit()
        assert command.run() == {}
    engine.dispose()
