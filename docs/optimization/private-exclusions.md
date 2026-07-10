# 私有内容排除清单

以下内容不得进入公开仓库：

- `docker/.env` 以及任何 `.env`、`.env.backup`、`.env.bak.*` 文件；
- 生产 `docker/pythonpath_dev/superset_config.py` 和 `conf/superset_config.py` 的真实值；
- `build_superset.log`、`build_superset_lean.log` 和其他构建日志；
- 所有 `*.bak*`、`*.orig*`、编译产物和缓存；
- Sellerfox 中的 `.superset_backup/` 看板 `params`、`query_context` 和 SQL 备份；
- 数据库连接、密码、密钥、Token、生产主机、内部用户和客户身份信息；
- 固定看板 ID、数据集 ID、店铺、客户或业务表数据样本；
- 生产容器名、卷路径、端口映射、镜像标签和内部运维命令；
- 生成的 `messages.json`、`messages.mo` 及其历史备份。

以下文件必须先参数化，不能直接复制：

- `docker-compose-prod.yml`；
- `install-custom-time-filter.sh`；
- `build_zh.py`、`zh_overrides.json`；
- 服务器 `docs/superpowers/` 中可能包含生产路径或业务标识的文档；
- Superset metadb、RLS 或看板元数据脚本。

每批文件暂存前运行公开安全扫描。发现命中时立即取消暂存，先定位并删除私有内容，
不得通过关闭规则或增加忽略项绕过扫描。
