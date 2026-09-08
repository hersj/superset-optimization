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
"""Run: pytest deploy/tests/test_operator_registration.py (isolated PG URL optional)."""

import importlib.util
import os
import sys
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from flask import Flask
from sqlalchemy import (
    Boolean,
    Column,
    create_engine,
    ForeignKey,
    Integer,
    String,
    Table,
    text,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

spec = importlib.util.spec_from_file_location(
    "operator_registration",
    Path(__file__).parents[2] / "docker/pythonpath_dev/operator_registration.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Base = declarative_base()
links = Table(
    "links",
    Base.metadata,
    Column("user_id", ForeignKey("users.id")),
    Column("role_id", ForeignKey("roles.id")),
)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String)
    active = Column(Boolean)
    login_count = Column(Integer, default=0)
    roles = relationship("Role", secondary=links, back_populates="users")


class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    users = relationship(User, secondary=links, back_populates="roles")


class Database(Base):
    __tablename__ = "databases"
    id = Column(Integer, primary_key=True)
    database_name = Column(String)

    def get_sqla_engine(self):
        raise NotImplementedError


@pytest.fixture
def source():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    enqueue = Mock()
    module.attach_events(factory, User, Role, enqueue, lambda: True)
    with factory() as session:
        yield session, enqueue
    engine.dispose()


def test_committed_account_and_role_changes_trigger_but_login_does_not(source):
    session, enqueue = source
    user = User(username="测试运营", active=True)
    role = Role(name="用户运营")
    session.add_all([user, role])
    session.commit()
    assert enqueue.call_count == 1
    user.login_count = 1
    session.commit()
    assert enqueue.call_count == 1
    user.roles.append(role)
    session.commit()
    assert enqueue.call_count == 2
    role.users.remove(user)
    session.commit()
    assert enqueue.call_count == 3
    user.active = False
    session.commit()
    assert enqueue.call_count == 4


def test_rollback_and_savepoint_do_not_dispatch_early(source):
    session, enqueue = source
    session.add(User(username="回滚", active=True))
    session.flush()
    session.rollback()
    session.commit()
    enqueue.assert_not_called()
    with session.begin_nested():
        session.add(User(username="保存点", active=True))
    enqueue.assert_not_called()
    session.rollback()
    session.commit()
    enqueue.assert_not_called()
    with session.begin_nested():
        session.add(User(username="提交", active=True))
    enqueue.assert_not_called()
    session.commit()
    enqueue.assert_called_once()


def test_broker_failure_does_not_fail_committed_account(source):
    session, enqueue = source
    enqueue.side_effect = RuntimeError("broker offline")
    session.add(User(username="消息故障", active=True))
    session.commit()
    assert session.query(User).count() == 1


def test_postgres_idempotency_conflict_and_transaction_rollback(source, monkeypatch):
    url = os.environ.get("OPERATOR_REGISTRATION_TEST_URL")
    if not url:
        pytest.skip("Set OPERATOR_REGISTRATION_TEST_URL to an isolated test database")
    engine = create_engine(url)
    # 只允许显式命名的隔离库，防止将建表验证指向生产。
    assert engine.url.database == "operator_registration_test"
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE operators (operator_id varchar(50) PRIMARY KEY, "
                "name varchar(200) NOT NULL, login_username varchar(200), "
                "is_active boolean, created_at timestamp, updated_at timestamp)"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX uq_login "
                "ON operators(lower(btrim(login_username)))"
            )
        )
    try:
        with engine.begin() as conn:
            assert module.register_identity(conn, 38, " 王云明 ")
            assert not module.register_identity(conn, 38, "王云明")
            assert not module.register_identity(conn, 39, "王云明")
            row = conn.execute(
                text("SELECT operator_id, is_active FROM operators")
            ).one()
            assert row == ("TEMP-SUPERSET-38", False)
            conn.execute(
                text("UPDATE operators SET operator_id='ERP-38', is_active=TRUE")
            )
            assert not module.register_identity(conn, 38, "王云明")
            assert conn.execute(
                text("SELECT operator_id, is_active FROM operators")
            ).one() == ("ERP-38", True)
            assert module.register_identity(conn, 40, "另一个运营")
        with (  # noqa: PT012 -- 验证异常会回滚此前成功插入的同事务记录。
            pytest.raises(ValueError, match="identity conflict"),
            engine.begin() as conn,
        ):  # noqa: PT012
            assert module.register_identity(conn, 41, "应回滚")
            module.register_identity(conn, 40, "冲突改名")
        with engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM operators")).scalar() == 2
        session, _ = source
        operator_role = Role(name="用户运营")
        session.add_all(
            [
                User(id=100, username="补扫运营", active=True, roles=[operator_role]),
                User(
                    id=101, username="未启用运营", active=False, roles=[operator_role]
                ),
                User(
                    id=102, username="管理员", active=True, roles=[Role(name="Admin")]
                ),
                Database(database_name="test-target"),
            ]
        )
        session.commit()
        monkeypatch.setattr(
            Database, "get_sqla_engine", lambda self: nullcontext(engine)
        )
        monkeypatch.setitem(
            sys.modules,
            "superset",
            SimpleNamespace(
                db=SimpleNamespace(session=session),
                security_manager=SimpleNamespace(user_model=User, role_model=Role),
            ),
        )
        monkeypatch.setitem(
            sys.modules, "superset.models.core", SimpleNamespace(Database=Database)
        )
        app = Flask(__name__)
        app.config.update(
            SELLERFOX_OPERATOR_DATABASE="test-target",
            SELLERFOX_OPERATOR_ROLES=("用户运营",),
        )
        with app.app_context():
            assert module.scan() == {"scanned": 1, "created": 1, "failed": 0}
            assert module.scan() == {"scanned": 1, "created": 0, "failed": 0}
            session.add_all(
                [
                    User(
                        id=40, username="冲突改名", active=True, roles=[operator_role]
                    ),
                    User(
                        id=103,
                        username="冲突后仍登记",
                        active=True,
                        roles=[operator_role],
                    ),
                ]
            )
            session.commit()
            assert module.scan() == {"scanned": 3, "created": 1, "failed": 1}
            assert module.scan() == {"scanned": 3, "created": 0, "failed": 1}
        with engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM operators")).scalar() == 4
    finally:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE operators"))
        engine.dispose()
