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
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from superset.commands.dashboard.chart_sorts import DashboardChartSortsCommand
from superset.commands.dashboard.exceptions import DashboardAccessDeniedError
from superset.extensions import db
from superset.key_value.models import KeyValueEntry
from superset.key_value.types import JsonKeyValueCodec, KeyValueResource

SORT = {"mode": "metric", "field": "sales", "direction": "desc"}
FORM = {"viz_type": "table", "metrics": ["sales"], "groupby": ["sku"]}


@pytest.fixture
def isolated_store(mocker):
    engine = create_engine("sqlite://")
    KeyValueEntry.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    mocker.patch.object(db, "session", session)
    mocker.patch("superset.commands.dashboard.chart_sorts.get_user_id", return_value=1)
    mocker.patch("superset.daos.key_value.get_user_id", return_value=None)
    dashboard = SimpleNamespace(slices=[SimpleNamespace(id=3, form_data=FORM)])
    lookup = mocker.patch("superset.commands.dashboard.chart_sorts.DashboardDAO.get_by_id_or_slug", return_value=dashboard)
    yield session, lookup
    session.close()
    engine.dispose()


def test_roundtrip_private_scopes_and_reset(isolated_store, mocker):
    session, lookup = isolated_store
    command = DashboardChartSortsCommand(2)
    assert command.put({"chart_id": 3, "sort": SORT, "user_id": 99}) == SORT
    assert command.run() == {"3": SORT}
    assert lookup.call_args.args == (2,)
    assert DashboardChartSortsCommand(4).run() == {}
    mocker.patch("superset.commands.dashboard.chart_sorts.get_user_id", return_value=5)
    assert command.run() == {}
    mocker.patch("superset.commands.dashboard.chart_sorts.get_user_id", return_value=1)
    assert command.put({"chart_id": 3, "sort": None}) is None
    assert session.query(KeyValueEntry).count() == 0


@pytest.mark.parametrize("payload", [
    {"chart_id": 999, "sort": SORT}, {"chart_id": True, "sort": SORT},
    {"chart_id": 3}, {"chart_id": 3, "sort": {**SORT, "field": "not-on-chart"}},
])
def test_reject_unknown_chart_field_and_missing_sort(isolated_store, payload):
    session, _ = isolated_store
    with pytest.raises(ValueError):
        DashboardChartSortsCommand(2).put(payload)
    assert session.query(KeyValueEntry).count() == 0


def test_obsolete_preferences_do_not_block_dashboard(isolated_store):
    session, _ = isolated_store
    command = DashboardChartSortsCommand(2)
    session.add(KeyValueEntry(resource=KeyValueResource.APP.value, uuid=command.key(1, 3), value=JsonKeyValueCodec().encode({**SORT, "field": "removed"})))
    session.commit()
    assert command.run() == {}


def test_dashboard_access_and_authenticated_user_required(isolated_store, mocker):
    _, lookup = isolated_store
    command = DashboardChartSortsCommand(2)
    lookup.side_effect = DashboardAccessDeniedError()
    with pytest.raises(DashboardAccessDeniedError):
        command.run()
    lookup.side_effect = None
    mocker.patch("superset.commands.dashboard.chart_sorts.get_user_id", return_value=None)
    with pytest.raises(DashboardAccessDeniedError):
        command.run()
