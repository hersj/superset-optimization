# Superset 运营自动登记

账号创建或角色调整提交后，现有 Celery 执行指定运营角色的身份补扫；现有 beat 每五分钟补扫一次，覆盖存量账号和投递/目标数据库故障。

只新增 `operators`：暂存 ID 为 `TEMP-SUPERSET-<Superset用户ID>`，登录名和姓名取去首尾空格的 Superset 登录名，新人 `is_active=false`。已有登录名、工号、状态及全部权限不覆盖。没有新增表、服务或队列。不同 Superset 元数据库不能共用该 ID 命名空间。

## 启用与回滚

1. 按正式发布流程获取已审核 commit 到独立 release 目录。仅叠加 deploy/operator-registration.compose.yml，保留既有所有 Compose 文件和镜像，不替换原配置文件。
2. 部署前在三个服务核实原 SUPERSET_CONFIG_PATH；未设置时读取已加载 superset_config.__file__。只有三者原路径一致才将 SELLERFOX_ORIGINAL_CONFIG_PATH 设为该路径；不一致则禁止套用此共享覆盖文件。wrapper 必须显式收到这个路径，缺失、文件不存在或指向自身均拒绝启动。使用以下已确认范围：
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

## 人工粒度选择与每日归属

先执行 `deploy/operator_access.py` dry-run 核对，再以 `--apply` 原子创建三个独立试点角色；不自动改任何用户角色。管理员在 Superset 用户管理中选择一个：

- 运营试点-整店：默认推荐，按当前 Mapping 归属获取整店数据。
- 运营试点-ASIN：按店铺+ASIN 当前归属。
- 运营试点-商品SKU：按店铺+ASIN+commodity_sku 当前归属；没有 SKU 粒度的数据集拒绝访问。

使用新角色时替换旧的“用户运营”角色，避免叠加旧店铺策略；可额外分配已有 LT 试点角色作为人工上限。其他自定义上限使用原生 Regular RLS，group_key 留空以取交集。不要给试点账号 Admin/Alpha/SQL Lab 或宽数据库权限。现有员工不会被批量切换。

查询直接使用 asin_sku_mapping 的最新归属，不依赖只增不减的 shop_staff 清单。现有主流程每天07:00运行；成功同步后，试点 RLS 的五分钟缓存版本键保证最迟五分钟内的新查询按新归属过滤；已打开页面需刷新。同步失败不能视作权限已更新。整店模式下同店的新增 ASIN 自动可见；ASIN/SKU 模式按对应当前归属，人工上限继续有效。

无 ERP 工号的王云明保留已明确授权的人工 LT 试点角色，自动登记 TEMP 身份；没有真实工号前不宣称可以自动匹配其 ERP 归属。后续 Mapping 出现真实工号时使用既有 rekey 机制。
