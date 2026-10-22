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

from superset.commands.temporary_cache.parameters import CommandParameters


class FakeCache:
    def __init__(self):
        self.values = {}
        self.timeouts = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, timeout=None):
        self.values[key] = value
        self.timeouts[key] = timeout

    def delete(self, key):
        return self.values.pop(key, None) is not None


def test_last_filter_state_is_scoped_by_user_and_dashboard(mocker):
    from superset.commands.dashboard.filter_state.last import (
        DeleteLastFilterStateCommand,
        GetLastFilterStateCommand,
        UpsertLastFilterStateCommand,
    )

    cache = FakeCache()
    mocker.patch(
        "superset.commands.dashboard.filter_state.last.cache_manager._filter_state_cache",
        cache,
    )
    mocker.patch("superset.commands.dashboard.filter_state.last.check_access")
    get_user_id = mocker.patch(
        "superset.commands.dashboard.filter_state.last.get_user_id", return_value=101
    )

    user_one_value = '{"NATIVE_FILTER-1":{"filterState":{"value":["shop-a"]}}}'
    user_two_value = '{"NATIVE_FILTER-1":{"filterState":{"value":["shop-b"]}}}'

    UpsertLastFilterStateCommand(
        CommandParameters(resource_id=7, value=user_one_value)
    ).run()
    assert (
        GetLastFilterStateCommand(CommandParameters(resource_id=7)).run()
        == user_one_value
    )

    get_user_id.return_value = 202
    assert GetLastFilterStateCommand(CommandParameters(resource_id=7)).run() is None

    UpsertLastFilterStateCommand(
        CommandParameters(resource_id=7, value=user_two_value)
    ).run()
    assert (
        GetLastFilterStateCommand(CommandParameters(resource_id=7)).run()
        == user_two_value
    )

    get_user_id.return_value = 101
    assert (
        GetLastFilterStateCommand(CommandParameters(resource_id=7)).run()
        == user_one_value
    )
    assert GetLastFilterStateCommand(CommandParameters(resource_id=8)).run() is None
    assert set(cache.timeouts.values()) == {0}

    assert DeleteLastFilterStateCommand(CommandParameters(resource_id=8)).run() is False
    assert DeleteLastFilterStateCommand(CommandParameters(resource_id=7)).run() is True
    assert GetLastFilterStateCommand(CommandParameters(resource_id=7)).run() is None
    get_user_id.return_value = 202
    assert (
        GetLastFilterStateCommand(CommandParameters(resource_id=7)).run()
        == user_two_value
    )
