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
"""通过 Superset 原生角色/RLS 提供管理员可选的试点粒度。"""

from __future__ import annotations

import argparse
from typing import Any

ROLES = {"shop": "运营试点-整店", "asin": "运营试点-ASIN", "sku": "运营试点-商品SKU"}
DATASETS = (27, 30, 31, 32, 33, 57, 79, 80, 95, 98, 100, 109, 149)


def clauses(mode: str) -> dict[int, str]:
    """以当前 Mapping 计算归属；人工限制通过其他 Regular RLS 继续取交集。"""
    if mode not in ROLES:
        raise ValueError("Unknown access mode")
    identity = (
        "o.login_username = '{{ current_username() | replace(\"'\", \"''\") }}'"
        " AND o.is_active"
    )
    source = (
        " FROM public.asin_sku_mapping m JOIN public.operators o "
        "ON o.operator_id = m.operator_engineer_id "
    )
    result = {}
    for did in DATASETS:
        # 100 的查询读取 98，继承底层过滤；不能在汇总后的虚拟表引用身份列。
        if did == 100:
            continue
        if did == 27 or (mode == "sku" and did not in (32, 33, 98, 109)):
            result[did] = "1 = 0"
            continue
        shop = '"店铺ID"' if did in (31, 95) else '"shop_id"'
        asin = '"ASIN"' if did in (31, 95) else '"asin"'
        fields = [shop + "::text"]
        selected = ["m.shop_id::text"]
        joins = ""
        if did == 149:
            fields = ['"name"::text']
            selected = ["s.name::text"]
            joins = "JOIN public.shops s ON s.id = m.shop_id "
        if mode != "shop":
            fields.append(asin + "::text")
            selected.append("m.asin::text")
        if mode == "sku":
            fields.append('"commodity_sku"::text')
            selected.append("m.commodity_sku::text")
        result[did] = (
            "("
            + ",".join(fields)
            + ") IN (SELECT "
            + ",".join(selected)
            + source
            + joins
            + "WHERE "
            + identity
            + ")"
        )
    epoch = " /* scope_epoch={{ cache_key_wrapper(operator_scope_epoch()) }} */"
    return {did: clause + epoch for did, clause in result.items()}


def configure(apply: bool = False) -> dict[str, Any]:
    """功能审计（可重写规格）：人工选择粒度、自动跟随归属的最小试点。
    - 功能目的与触发方式：管理员一次执行本脚本，创建三个可选原生角色；
      默认 dry-run，--apply 才保存，管理员在用户管理界面选择角色。
    - 输入契约：固定试点数据集、已有 LT 试点只读权限；Mapping 包含真实运营工号。
    - 输出契约：创建/维护本脚本命名的角色和 Regular RLS，不自动给用户分配角色。
    - 处理流程：校验源角色权限→构建按粒度的 Mapping 子查询→原子保存角色/RLS。
    - 业务规则：整店按当前 Mapping 的店铺集合；ASIN/SKU 增加对应联合键。
      所有者使用 operators 登录桥接且须启用；人工 LT/ASIN/SKU 限制另设 RLS 取交集。
      同一店铺 ASIN 跨 FNSKU 的多个运营均有权；SKU 指 commodity_sku。
    - 状态与副作用：只写 Superset 元数据；不复制权限清单，不改旧角色或业务归属。
    - 外部依赖：复用原生 RLS 与虚拟表底层 RLS 继承；每日 Mapping 同步后查询即生效。
    - 异常与边界：无归属/未启用返回空；缺粒度字段的数据集强制空，禁止以汇总代替隔离。
      原角色缺失或带管理/数据库范围权限拒绝；失败回滚。
    - 不变量与约束：新增角色只具备既有试点的只读数据访问权限；固定独立命名空间；
      group_key 为空以与人工限制取交集；不启用 SQL Lab，不自动切换其他用户。
    - 验证方式：隔离 PostgreSQL 验证整店/ASIN/SKU、归属转移和人工上限；
      真实数据集 EXPLAIN 与底层过滤继承验证。业务验收由管理员完成。
    """
    from superset import db, security_manager as sm
    from superset.connectors.sqla.models import RowLevelSecurityFilter, SqlaTable

    source = sm.find_role("LT试点-直杆LED1-EU")
    if source is None:
        raise ValueError("Pilot read-only source role missing")
    denied = {
        "database_access",
        "schema_access",
        "all_datasource_access",
        "all_database_access",
        "all_query_access",
    }
    if any(p.permission.name in denied for p in source.permissions):
        raise ValueError("Pilot role contains broad privileges")
    tables = {
        t.id: t for t in db.session.query(SqlaTable).filter(SqlaTable.id.in_(DATASETS))
    }
    if len(tables) != len(DATASETS):
        raise ValueError("Pilot datasets missing")
    plan = {ROLES[mode]: clauses(mode) for mode in ROLES}
    if not apply:
        db.session.rollback()
        return {"apply": False, "roles": plan}
    try:
        for role_name, conditions in plan.items():
            role = sm.find_role(role_name)
            if role is None:
                role = sm.role_model(name=role_name)
                db.session.add(role)
            role.permissions = list(source.permissions)
            for did, clause in conditions.items():
                name = f"{role_name}-dataset-{did}"
                rule = (
                    db.session.query(RowLevelSecurityFilter)
                    .filter_by(name=name)
                    .one_or_none()
                )
                if rule is None:
                    rule = RowLevelSecurityFilter(name=name)
                    db.session.add(rule)
                rule.filter_type = "Regular"
                rule.group_key = ""
                rule.clause = clause
                rule.roles = [role]
                rule.tables = [tables[did]]
                rule.description = "当前 Mapping 归属；与管理员额外限制取交集。"
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return {"apply": True, "roles": list(plan), "users_changed": 0}


if __name__ == "__main__":
    from superset.app import create_app
    from superset.utils import json

    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with create_app().app_context():
        print(json.dumps(configure(args.apply)))
