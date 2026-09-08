# ruff: noqa: S608 -- 测试受控 SQL 子句及登录名转义，不接收外部 SQL。
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
from collections.abc import Iterator
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from typing import Any
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
from sqlalchemy.orm import declarative_base, relationship, Session, sessionmaker

spec = importlib.util.spec_from_file_location(
    "operator_registration",
    Path(__file__).parents[2] / "docker/pythonpath_dev/operator_registration.py",
)
assert spec is not None
assert spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Base: Any = declarative_base()
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

    def get_sqla_engine(self) -> Any:
        raise NotImplementedError


@pytest.fixture
def source() -> Iterator[tuple[Session, Mock]]:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    enqueue = Mock()
    module.attach_events(factory, User, Role, enqueue, lambda: True)
    with factory() as session:
        yield session, enqueue
    engine.dispose()


def test_committed_account_and_role_changes_trigger_but_login_does_not(
    source: tuple[Session, Mock],
) -> None:
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


def test_rollback_and_savepoint_do_not_dispatch_early(
    source: tuple[Session, Mock],
) -> None:
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


def test_broker_failure_does_not_fail_committed_account(
    source: tuple[Session, Mock],
) -> None:
    session, enqueue = source
    enqueue.side_effect = RuntimeError("broker offline")
    session.add(User(username="消息故障", active=True))
    session.commit()
    assert session.query(User).count() == 1


def test_postgres_idempotency_conflict_and_transaction_rollback(
    source: tuple[Session, Mock],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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


def test_original_config_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import runpy

    original = tmp_path / "original.py"
    original.write_text(
        "class Config:\n    beat_schedule = {'existing': {'schedule': 10}}\n"
        "CELERY_CONFIG = Config\nFEATURE_FLAGS = {'existing': True}\n"
        "def FLASK_APP_MUTATOR(app):\n    app.config['original_hook'] = True\n"
    )
    wrapper = Path(__file__).parents[1] / "operator_registration_config.py"
    monkeypatch.setenv("SELLERFOX_ORIGINAL_CONFIG_PATH", str(original))
    installer = Mock()
    monkeypatch.setitem(
        sys.modules, "operator_registration", SimpleNamespace(install=installer)
    )
    settings = runpy.run_path(str(wrapper))
    assert settings["FEATURE_FLAGS"] == {"existing": True}
    assert "existing" in settings["CELERY_CONFIG"].beat_schedule
    app = Flask(__name__)
    settings["FLASK_APP_MUTATOR"](app)
    assert app.config["original_hook"]
    installer.assert_called_once_with(app)
    monkeypatch.setenv("SELLERFOX_ORIGINAL_CONFIG_PATH", str(wrapper))
    with pytest.raises(ValueError, match="Invalid original"):
        runpy.run_path(str(wrapper))


def test_mapping_scope_changes_and_manual_cap() -> None:
    import runpy

    from jinja2 import Environment

    url = os.environ.get("OPERATOR_REGISTRATION_TEST_URL")
    if not url:
        pytest.skip("Set isolated PostgreSQL test URL")
    engine = create_engine(url)
    assert engine.url.database == "operator_registration_test"
    build = runpy.run_path(str(Path(__file__).parents[1] / "operator_access.py"))[
        "clauses"
    ]
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE operators(operator_id text, login_username text, is_active boolean)"  # noqa: E501
            )
        )
        conn.execute(
            text(
                "CREATE TABLE asin_sku_mapping(shop_id text, asin text, commodity_sku text, operator_engineer_id text)"  # noqa: E501
            )
        )
        conn.execute(
            text("CREATE TABLE fact(shop_id text, asin text, commodity_sku text)")
        )
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO operators VALUES ('1', :name, TRUE), ('2', 'other', TRUE)"  # noqa: E501
                ),
                {"name": "O'Brien"},
            )
            conn.execute(
                text(
                    "INSERT INTO asin_sku_mapping VALUES ('s1','a1','k1','1'), ('s1','a2','k2','2'), ('s1','a1','k3','2')"  # noqa: E501
                )
            )
            conn.execute(
                text(
                    "INSERT INTO fact SELECT shop_id,asin,commodity_sku FROM asin_sku_mapping"  # noqa: E501
                )
            )
            rendered = {
                mode: Environment(autoescape=False)  # noqa: S701 -- 测试 SQL 模板，非 HTML。
                .from_string(build(mode)[98])
                .render(
                    current_username=lambda: "O'Brien",
                    cache_key_wrapper=lambda value: value,
                    operator_scope_epoch=lambda: 0,
                )
                for mode in ("shop", "asin", "sku")
            }
            counts = {
                mode: conn.execute(
                    text("SELECT count(*) FROM fact WHERE " + clause)
                ).scalar()
                for mode, clause in rendered.items()
            }
            assert counts == {"shop": 3, "asin": 2, "sku": 1}
            assert (
                conn.execute(
                    text(
                        "SELECT count(*) FROM fact WHERE "
                        + rendered["asin"]
                        + " AND asin='a2'"
                    )
                ).scalar()
                == 0
            )
            conn.execute(
                text(
                    "UPDATE asin_sku_mapping SET operator_engineer_id='2' WHERE commodity_sku='k1'"  # noqa: E501
                )
            )
            assert all(
                conn.execute(text("SELECT count(*) FROM fact WHERE " + clause)).scalar()
                == 0
                for clause in rendered.values()
            )
            assert build("sku")[30].startswith("1 = 0")
    finally:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE fact,asin_sku_mapping,operators"))
        engine.dispose()
