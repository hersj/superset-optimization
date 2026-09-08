# Superset 运营自动登记

账号创建或角色调整提交后，现有 Celery 执行指定运营角色的身份补扫；现有 beat 每五分钟补扫一次，覆盖存量账号和投递/目标数据库故障。

只新增 `operators`：暂存 ID 为 `TEMP-SUPERSET-<Superset用户ID>`，登录名和姓名取去首尾空格的 Superset 登录名，新人 `is_active=false`。已有登录名、工号、状态及全部权限不覆盖。没有新增表、服务或队列。不同 Superset 元数据库不能共用该 ID 命名空间。

## 启用与回滚

1. 按正式发布流程获取已审核 commit 到独立 release 目录。仅叠加 deploy/operator-registration.compose.yml，保留既有所有 Compose 文件和镜像，不替换原配置文件。
2. 覆盖文件统一设置 SUPERSET_CONFIG_PATH；wrapper 从各服务原配置路径加载现有配置，使用以下已确认范围：
   - `SELLERFOX_OPERATOR_DATABASE=sellerfox_sync`：这是已有 Superset 数据库连接的名称，先核对实际目标库与写入权限；不要在文档或命令中放密码。
   - `SELLERFOX_OPERATOR_ROLES=用户运营,LT试点-直杆LED1-EU`：精确角色名单，不使用模糊匹配。
3. 将 OPERATOR_REGISTRATION_RELEASE 设为已审核版本的绝对目录，以原有 Compose 文件顺序再加此覆盖文件，通过正式 Docker Compose 流程重建/重启 web、worker、beat，并记录前后容器ID、镜像和配置版本。只更新挂载文件不算部署验收。
4. 发布前只读输出候选用户名、暂存ID及已有登记状态，核对影响范围。发布后在 Superset app context 执行 `operator_registration.scan()` 一次并读回，以补齐王云明和其他缺失的指定运营身份。
5. 在隔离测试环境经真实 FAB 创建账号、先建账号后分配运营角色、取消事务，验证运营表结果；生产用已授权账号检查补扫与后续五分钟周期，不制造生产测试数据。
6. 验证原 LT 规则、店铺关系、商品关系和其他用户权限均不变。登记未启用是预期行为，不把登记成功解释为开通权限或修复看板无数据。

回滚：移除本次 Compose 覆盖文件，使用原有 Compose 文件顺序重建上述服务。已新增身份默认保留未启用；若确需删除，先确认该次新增ID仍未启用且没有任何关联或真实工号迁移，再单独审核执行。不得批量删除 TEMP 身份。

## 异常与边界

- 消息投递失败不影响已提交账号，日志记录异常类型；下个补扫重试。
- 连接或 SQL 故障整批回滚，下一周期再试；单人身份冲突只回滚该账号保存点并记录失败数，其余账号正常登记。持续姓名/暂存ID冲突需人工核对，不自动改名或合并。
- 指定角色必须直接分配给用户；不将用户组间接继承的角色纳入本次范围。
- 停用/移除角色不会删除运营身份或撤销既有数据权限。本功能负责登记，授权由原流程管理。
- 不同步密码或邮箱。Superset 登录名应采用可与 ERP 同名匹配的中文姓名；后续真实工号出现时由 Sellerfox 既有 Mapping rekey 处理。

## 验证

独立环境安装 SQLAlchemy 1.4.54、Flask、pytest、psycopg2-binary。使用专用空库 `operator_registration_test`；测试拒绝其他库名。

```sh
OPERATOR_REGISTRATION_TEST_URL='<本地隔离库运行时连接>' python -m pytest -q --confcutdir=deploy/tests deploy/tests/test_operator_registration.py
```

覆盖提交/回滚/保存点、双向角色关系修改、登录计数不触发、投递失败不影响账号、PostgreSQL 中文身份/重复/真实身份保留/冲突回滚、指定角色与启用状态筛选和存量补扫幂等。
