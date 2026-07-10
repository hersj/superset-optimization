# 测试与验证

## 环境

- 前端必须使用 Superset 声明的 Node `^22.22.0`。本地执行时将
  `/opt/homebrew/opt/node@22/bin` 放在 `PATH` 首位。
- 前端依赖安装和 Jest 命令均在 `superset-frontend` 目录运行。
- 后端 pytest 只能在本地隔离 Python 环境或与生产网络隔离的测试容器运行。
- 公开安全扫描需要 `rg` 和 `gitleaks`。

## 命令

安全扫描器自身测试：

```bash
scripts/optimization/check-public-safety.test.sh
```

公开差异安全扫描：

```bash
scripts/optimization/check-public-safety.sh
```

前端目标测试使用明确文件集合：

```bash
cd superset-frontend
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand <test-files>
```

后端目标测试：

```bash
pytest -q <test-files>
```

完整前端验证：

```bash
cd superset-frontend
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run type
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
```

## 禁止事项

- 禁止使用生产数据库配置运行 pytest。
- 禁止在迁移和公开仓库验证期间运行 `superset db upgrade`。
- 禁止通过关闭规则、排除自定义提交或修改 gitleaks 结果绕过安全扫描。
- 禁止把生产容器的应用初始化命令当作只读版本检查。

每批迁移必须记录实际测试命令、退出码和通过数量。基础设施错误不算有效 RED，因错误
退出也不算 GREEN。
