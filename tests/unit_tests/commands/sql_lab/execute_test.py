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
from typing import cast
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from flask_babel import Babel

from superset.commands.sql_lab.execute import ExecuteSqlCommand
from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from superset.exceptions import SupersetSecurityException
from superset.sqllab.command_status import SqlJsonExecutionStatus
from superset.sqllab.exceptions import (
    QueryIsForbiddenToAccessException,
    SqlLabException,
)


@pytest.fixture
def command() -> Iterator[ExecuteSqlCommand]:
    app = Flask(__name__)
    Babel(app)
    session = MagicMock()
    with (
        app.test_request_context(),
        patch("superset.db", session),
        patch("superset.commands.sql_lab.execute.db", session),
    ):
        context = MagicMock()
        context.get_query_details.return_value = "SELECT 1"
        query_dao = MagicMock()
        query_dao.find_one_or_none.return_value = None
        converter = MagicMock()
        converter.serialize_payload.return_value = {"data": [{"value": 1}]}
        cmd = ExecuteSqlCommand(
            context,
            query_dao,
            MagicMock(),
            MagicMock(),
            MagicMock(),
            MagicMock(),
            converter,
            False,
        )
        with patch.object(cmd, "_set_query_limit_if_required"):
            yield cmd


def test_permission_failure_reaches_api_as_forbidden(
    command: ExecuteSqlCommand,
) -> None:
    failure = SupersetSecurityException(
        SupersetError(
            message="Table is not authorized",
            error_type=SupersetErrorType.TABLE_SECURITY_ACCESS_ERROR,
            level=ErrorLevel.ERROR,
        )
    )
    cast(MagicMock, command._access_validator).validate.side_effect = failure

    with pytest.raises(QueryIsForbiddenToAccessException) as caught:
        command.run()

    assert caught.value.__cause__ is failure
    cast(MagicMock, command._sql_query_render).render.assert_not_called()
    cast(MagicMock, command._sql_json_executor).execute.assert_not_called()


def test_hidden_database_is_forbidden(command: ExecuteSqlCommand) -> None:
    cast(MagicMock, command._database_dao).find_by_id.return_value = None

    with pytest.raises(QueryIsForbiddenToAccessException):
        command.run()

    cast(MagicMock, command._query_dao).create.assert_not_called()
    cast(MagicMock, command._sql_query_render).render.assert_not_called()
    cast(MagicMock, command._sql_json_executor).execute.assert_not_called()


@pytest.mark.parametrize(
    "status",
    [SqlJsonExecutionStatus.HAS_RESULTS, SqlJsonExecutionStatus.QUERY_IS_RUNNING],
)
def test_authorized_query_keeps_result(
    command: ExecuteSqlCommand, status: SqlJsonExecutionStatus
) -> None:
    cast(MagicMock, command._sql_json_executor).execute.return_value = status

    assert command.run() == {"status": status, "payload": {"data": [{"value": 1}]}}
    cast(MagicMock, command._sql_json_executor).execute.assert_called_once()


def test_unexpected_validation_failure_is_not_forbidden(
    command: ExecuteSqlCommand,
) -> None:
    failure = RuntimeError("Validator failed")
    cast(MagicMock, command._access_validator).validate.side_effect = failure

    with pytest.raises(SqlLabException) as caught:
        command.run()

    assert not isinstance(caught.value, QueryIsForbiddenToAccessException)
    assert caught.value.status == 500
    assert caught.value.__cause__ is failure
    cast(MagicMock, command._sql_query_render).render.assert_not_called()
    cast(MagicMock, command._sql_json_executor).execute.assert_not_called()


def test_execution_failure_remains_server_error(command: ExecuteSqlCommand) -> None:
    failure = RuntimeError("Executor failed")
    cast(MagicMock, command._sql_json_executor).execute.side_effect = failure

    with pytest.raises(SqlLabException) as caught:
        command.run()

    assert not isinstance(caught.value, QueryIsForbiddenToAccessException)
    assert caught.value.status == 500
    assert caught.value.__cause__ is failure
