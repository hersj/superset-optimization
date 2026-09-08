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

import logging
from typing import Any

from flask import current_app, has_app_context
from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
TASK = "sellerfox.register_operators"
PENDING = "sellerfox_operator_registration"


def register_identity(connection: Connection, user_id: int, username: str) -> bool:
    """仅插入缺失身份；真实身份、已有登录名和所有权限保持原值。"""
    username = username.strip()
    if user_id <= 0 or not username or len(username) > 200:
        raise ValueError("Invalid operator identity")
    result = connection.execute(
        text(
            "INSERT INTO public.operators "
            "(operator_id, name, login_username, is_active, created_at, updated_at) "
            "SELECT :operator_id, :username, :username, FALSE, "
            "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP "
            "WHERE NOT EXISTS (SELECT 1 FROM public.operators "
            "WHERE lower(btrim(login_username)) = lower(btrim(:username))) "
            "ON CONFLICT DO NOTHING RETURNING operator_id"
        ),
        {"operator_id": f"TEMP-SUPERSET-{user_id}", "username": username},
    )
    if result.fetchone():
        return True
    # 同一 Superset ID 改名时不能静默建立第二身份或覆盖原来的桥接关系。
    existing = connection.execute(
        text(
            "SELECT 1 FROM public.operators WHERE "
            "lower(btrim(login_username)) = lower(btrim(:username))"
        ),
        {"username": username},
    ).first()
    if existing is None:
        raise ValueError("Operator identity conflict; manual reconciliation required")
    return False


def scan() -> dict[str, int]:
    """扫描指定角色的已启用账号；身份冲突单独跳过，数据库故障整批回滚。"""
    from superset import db, security_manager
    from superset.models.core import Database

    database_name = current_app.config.get("SELLERFOX_OPERATOR_DATABASE")
    roles = current_app.config.get("SELLERFOX_OPERATOR_ROLES", ())
    if not database_name or not roles:
        return {"scanned": 0, "created": 0, "failed": 0}
    user = security_manager.user_model
    role = security_manager.role_model
    # 仅凭显式角色名单入选，不扫描管理员或任意含“运营”字样的角色。
    users = (
        db.session.query(user.id, user.username)
        .filter(user.active.is_(True), user.roles.any(role.name.in_(roles)))
        .order_by(user.id)
        .all()
    )
    database = db.session.query(Database).filter_by(database_name=database_name).one()
    created = 0
    failed = 0
    with database.get_sqla_engine() as engine:
        if engine.dialect.name != "postgresql":
            raise ValueError("Operator registry requires PostgreSQL")
        with engine.begin() as connection:
            connection.execute(text("SET LOCAL lock_timeout = '2s'"))
            connection.execute(text("SET LOCAL statement_timeout = '5s'"))
            for user_id, username in users:
                try:
                    with connection.begin_nested():
                        inserted = register_identity(connection, user_id, username)
                    created += inserted
                except ValueError:
                    failed += 1
                    logger.error(
                        "Operator identity conflict for Superset user_id=%d", user_id
                    )
    logger.info(
        "Operator registration scanned=%d created=%d failed=%d",
        len(users),
        created,
        failed,
    )
    return {"scanned": len(users), "created": created, "failed": failed}


def install(app: Any) -> None:
    """功能审计（可重写规格）：Superset 运营账号自动登记。
    - 功能目的与触发方式：账号新建、用户名/启用状态/角色修改提交成功后，
      投递现有 Celery；
      五分钟补扫覆盖存量、丢失消息和数据库暂时失败。
    - 输入契约：SELLERFOX_OPERATOR_DATABASE 为已配置 Superset 数据库名称；
      SELLERFOX_OPERATOR_ROLES 为精确角色名单；
      任一为空则关闭。目标已有 operators 和登录名唯一索引。
    - 输出契约：以 TEMP-SUPERSET-<用户ID> 创建缺失身份；
      name/login_username 为去首尾空格的登录名，is_active=FALSE；
      返回扫描/新增数。
    - 处理流程：before_flush 记录相关变化，外层 after_commit 投递全量指定角色扫描；
      回滚清除标记；
      任务读取已提交且启用的账号，在目标库单一事务中幂等插入。
    - 业务规则：登录名按 lower(btrim()) 匹配；
      已有记录不覆盖，改名冲突拒绝；
      不创建店铺/商品权限，不修改业务归属，不删除或禁用已有运营；
      真实工号转换由 Sellerfox 既有 Mapping 入口处理。
    - 状态与副作用：仅新增 operators；
      无新表/队列；
      源账号事务不因跨库或消息故障失败；
      日志只记计数或异常类型，不记录连接串/密码。
    - 外部依赖：现有 Celery worker/beat、Superset 数据库连接、PostgreSQL；
      连接不可用导致目标事务回滚；身份冲突仅回滚该账号保存点并计入 failed。
      定时补扫再次尝试，单人冲突不阻塞其余账号。
    - 异常与边界：空名单不扫描；
      空/超长登录名拒绝；
      事务回滚不投递，保存点提交不提前投递；
      重复、并发扫描依赖目标唯一约束，不覆盖任何权限。
    - 不变量与约束：指定角色精确匹配；
      新身份未启用；
      锁等待2秒、单条SQL5秒；
      用户ID必须在同一稳定 Superset 元数据库命名空间内。
    - 验证方式：deploy/tests/test_operator_registration.py 验证真实 SQLAlchemy 提交/
      回滚/角色关系变更、投递失败及 PostgreSQL 身份幂等和回滚。
    """
    if not app.config.get("SELLERFOX_OPERATOR_DATABASE") or app.extensions.get(PENDING):
        return
    from superset import db, security_manager
    from superset.extensions import celery_app

    celery_app.task(name=TASK)(scan)
    attach_events(
        db.session.session_factory,
        security_manager.user_model,
        security_manager.role_model,
        lambda: celery_app.send_task(TASK, retry=False),
        lambda: has_app_context() and current_app._get_current_object() is app,
    )
    app.extensions[PENDING] = True


def attach_events(  # noqa: C901 -- 三个事务回调共用同一配置和投递函数。
    session_type: Any, user_type: Any, role_type: Any, enqueue: Any, enabled: Any
) -> None:
    """在元数据 Session 上监听事务，覆盖 FAB 页面/API/ORM 的共同保存入口。"""

    def before_flush(session: Session, *_: Any) -> None:
        if not enabled():
            return
        for obj in session.new.union(session.dirty):
            if isinstance(obj, user_type):
                state = inspect(obj)
                if obj in session.new or any(
                    state.attrs[name].history.has_changes()
                    for name in ("username", "active", "roles")
                ):
                    session.info[PENDING] = True
            elif isinstance(obj, role_type):
                session.info[PENDING] = True

    def after_commit(session: Session) -> None:
        if session.in_nested_transaction():
            return
        if session.info.pop(PENDING, False):
            try:
                enqueue()
            except Exception as exc:  # 注册失败不能让已提交账号被报告为保存失败。
                logger.error(
                    "Operator registration enqueue failed: %s", type(exc).__name__
                )

    def after_rollback(session: Session) -> None:
        if not session.in_nested_transaction():
            session.info.pop(PENDING, None)

    event.listen(session_type, "before_flush", before_flush)
    event.listen(session_type, "after_commit", after_commit)
    event.listen(session_type, "after_rollback", after_rollback)
