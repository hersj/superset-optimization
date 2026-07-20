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
from __future__ import annotations

from typing import Optional

from superset.commands.base import BaseCommand
from superset.commands.dashboard.filter_state.utils import check_access
from superset.commands.temporary_cache.entry import Entry
from superset.commands.temporary_cache.parameters import CommandParameters
from superset.extensions import cache_manager
from superset.temporary_cache.utils import cache_key
from superset.utils.core import get_user_id

LAST_FILTER_STATE_KEY_PREFIX = "last_filter_state"


def last_filter_state_key(user_id: int) -> str:
    return f"{LAST_FILTER_STATE_KEY_PREFIX}:{user_id}"


def get_last_filter_state_cache_key(resource_id: int, user_id: int) -> str:
    return cache_key(resource_id, last_filter_state_key(user_id))


class UpsertLastFilterStateCommand(BaseCommand):
    def __init__(self, cmd_params: CommandParameters) -> None:
        self._cmd_params = cmd_params

    def run(self) -> bool:
        self.validate()
        resource_id = self._cmd_params.resource_id
        value = self._cmd_params.value
        owner = get_user_id()
        key = get_last_filter_state_cache_key(resource_id, owner)
        entry: Entry = {"owner": owner, "value": value}
        cache_manager.filter_state_cache.set(key, entry, timeout=0)
        return True

    def validate(self) -> None:
        check_access(self._cmd_params.resource_id)


class GetLastFilterStateCommand(BaseCommand):
    def __init__(self, cmd_params: CommandParameters) -> None:
        self._cmd_params = cmd_params

    def run(self) -> Optional[str]:
        self.validate()
        owner = get_user_id()
        key = get_last_filter_state_cache_key(self._cmd_params.resource_id, owner)
        entry: Entry = cache_manager.filter_state_cache.get(key) or {}
        if entry.get("owner") != owner:
            return None
        return entry.get("value")

    def validate(self) -> None:
        check_access(self._cmd_params.resource_id)


class DeleteLastFilterStateCommand(BaseCommand):
    def __init__(self, cmd_params: CommandParameters) -> None:
        self._cmd_params = cmd_params

    def run(self) -> bool:
        self.validate()
        owner = get_user_id()
        key = get_last_filter_state_cache_key(self._cmd_params.resource_id, owner)
        entry: Entry = cache_manager.filter_state_cache.get(key) or {}
        if entry.get("owner") != owner:
            return False
        return cache_manager.filter_state_cache.delete(key)

    def validate(self) -> None:
        check_access(self._cmd_params.resource_id)
