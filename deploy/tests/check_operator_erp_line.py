"""服务器隔离验收：SELLFOX_TEST_DSN 指向 sellfox_db 后直接运行本文件。"""
import json
import os
import sys
from pathlib import Path

import psycopg2
from jinja2 import Template

sys.path.insert(0, str(Path(__file__).parents[1]))
from operator_access import clauses


def check(connection):
    """功能审计（可重写规格）：ERP 品线权限最小可运行验收。
    - 功能目的与触发方式：直接运行或传入测试连接，验证正式规则生成器的授权变化。
    - 输入契约：仅 sellfox_db 或名称含 test 的 PostgreSQL 测试库；连接无同名临时表。
    - 输出契约：全部断言通过返回 PASS；任何失败抛错，不吞错误。
    - 处理流程：建立临时人员/Mapping/店铺表→执行全部 ERP 品线规则→变更归属并复验。
    - 业务规则：同店铺整品线开放；跨店同名品线不开放；新增、撤销、停用均自动生效；BASE 不授权。
    - 状态与副作用：仅连接级临时表，全部测试后 rollback；不修改任何业务表。
    - 外部依赖：现有 psycopg2/Jinja2 和 operator_access.clauses；缺少测试连接直接失败。
    - 异常与边界：拒绝生产库；空品线不授权；重复调用规则不改变状态。
    - 不变量与约束：测试只将正式 SQL 的 public 限定改为 pg_temp，业务谓词不改。
    - 验证方式：本函数分别验证每个目标数据集，100 的继承由服务器 SQL 验证。
    """
    with connection.cursor() as cur:
        cur.execute("SELECT current_database()")
        name = cur.fetchone()[0]
        assert name == "sellfox_db" or "test" in name.lower()
        cur.execute("SET LOCAL statement_timeout='5s'")
        cur.execute("CREATE TEMP TABLE operators(operator_id text,login_username text,is_active boolean)")
        cur.execute("CREATE TEMP TABLE shops(id text,name text)")
        cur.execute("CREATE TEMP TABLE asin_sku_mapping(shop_id text,asin text,lt text,operator_engineer_id text)")
        cur.execute("INSERT INTO operators VALUES ('w','王云明',true),('o','其他运营',true)")
        cur.execute("INSERT INTO shops VALUES ('s1','店铺一'),('s2','店铺二')")
        cur.execute("INSERT INTO asin_sku_mapping VALUES ('s1','a1','品线一','w'),('s1','a2','品线一','o'),('s2','a3','品线一','o'),('s1','a4','品线二','o'),('s1','a5','品线二','o'),('s1','a6','','w')")
        rules = clauses("lt")
        assert not {27,109,100}.intersection(rules)
        assert len(rules) == 10
        def visible(expected):
            # 与真实数据集字段对应；只替换测试 schema，不替换授权表达式。
            for did, clause in rules.items():
                sql = Template(clause.replace("public.","pg_temp.")).render(
                    current_username=lambda:"王云明",cache_key_wrapper=lambda x:x,operator_scope_epoch=lambda:1)
                cur.execute('SELECT asin FROM (SELECT m.*,m.shop_id AS "店铺ID",m.asin AS "ASIN",s.name FROM pg_temp.asin_sku_mapping m JOIN pg_temp.shops s ON s.id=m.shop_id) data WHERE '+sql)
                assert {row[0] for row in cur.fetchall()} == expected, did
        visible({'a1','a2'})
        cur.execute("UPDATE asin_sku_mapping SET operator_engineer_id='w' WHERE asin='a4'")
        visible({'a1','a2','a4','a5'})
        visible({'a1','a2','a4','a5'})
        cur.execute("UPDATE asin_sku_mapping SET operator_engineer_id='o' WHERE asin='a1'")
        visible({'a4','a5'})
        cur.execute("UPDATE operators SET is_active=false WHERE operator_id='w'")
        visible(set())
        cur.execute("UPDATE operators SET is_active=true WHERE operator_id='w'")
        cur.execute("UPDATE asin_sku_mapping SET operator_engineer_id='o' WHERE asin='a4'")
        visible(set())
    connection.rollback()
    return {"result":"PASS","datasets":10,"scenarios":6,"cross_shop_denied":True,"base_denied":True}


if __name__ == "__main__":
    connection = psycopg2.connect(os.environ["SELLFOX_TEST_DSN"])
    try:
        print(json.dumps(check(connection)))
    finally:
        connection.close()
