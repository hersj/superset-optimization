# Superset Optimization 公开项目迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 禁止使用子任务代理；涉及功能迁移时必须先确认 RED，再迁移实现并确认 GREEN。

**目标：** 将生产服务器上可复用的 Superset 定制安全迁移到独立公开仓库 `hersj/superset-optimization`，保留 Apache Superset 历史，并确保整个过程不修改生产数据库或线上部署。

**架构：** 本地仓库以生产环境当前基础提交 `cc066b3576` 为基线，Apache Superset 配置为 `upstream`。生产工作区只作为只读来源，改动按日期、筛选器、透视表、大数字、翻译和运行配置分批重建并独立提交。公开仓库创建和推送发生在代码测试、构建、容器验证及两轮敏感信息扫描全部通过之后。

**技术栈：** Apache Superset、Python/pytest、React/TypeScript/Jest、Docker Compose、Git/GitHub CLI、gitleaks。

---

## 全局安全约束

- 服务器源目录通过本地私有环境变量 `SUPERSET_SOURCE_HOST` 指定，仓库内只记录
  `/superset/superset` 路径；所有盘点和提取命令只允许读取。
- 禁止在生产服务器执行 `git apply`、`git checkout`、`git clean`、`git reset`、`superset db upgrade` 或任何数据库写入命令。
- 禁止迁移 `docker/.env`、真实 `superset_config.py`、日志、`.bak`、`.orig`、数据库连接、密钥、生产 IP、看板参数备份和业务数据样本。
- 后端测试只能在本地隔离环境运行，不能使用生产容器的数据库配置。
- 生产部署切换不属于本计划；本计划只产生可以部署的公开仓库和验证记录。

### Task 1：建立迁移清单和安全基线

**文件：**
- 创建：`docs/optimization/migration-manifest.md`
- 创建：`docs/optimization/private-exclusions.md`
- 修改：`.gitignore`

- [ ] **Step 1：记录本地和服务器基础提交**

运行：

```bash
git rev-parse HEAD
git merge-base --is-ancestor cc066b3576 HEAD
ssh -o BatchMode=yes "${SUPERSET_SOURCE_HOST}" \
  'cd /superset/superset && git rev-parse HEAD && git branch --show-current'
```

预期：本地基础历史包含 `cc066b3576`；服务器分支为 `master`，服务器 HEAD 为
`cc066b3576`。如提交不一致，停止迁移并重新确定共同基线。

- [ ] **Step 2：生成只读差异清单**

运行：

```bash
ssh -o BatchMode=yes "${SUPERSET_SOURCE_HOST}" \
  'cd /superset/superset && git status --short && git diff --stat && git ls-files --others --exclude-standard'
```

预期：已跟踪差异约为 64 个文件；输出包含 CustomTime、级联筛选、透视表和
Big Number 新测试，同时也包含必须排除的日志、备份和生产配置。

- [ ] **Step 3：写入允许迁移和禁止迁移的路径清单**

`docs/optimization/migration-manifest.md` 必须按以下模块列出路径：

```markdown
# 迁移清单

基线：cc066b3576
来源：生产服务器 /superset/superset，只读

## 日期与 CustomTime
## 原生筛选器与状态保存
## 透视表
## Big Number 与 ECharts
## 条件格式和通用 UI
## 中文翻译
## 通用运行配置

每个路径记录：来源状态、迁移提交、测试命令、验证结果。
```

`docs/optimization/private-exclusions.md` 必须包含：

```markdown
# 私有内容排除清单

- docker/.env
- docker/pythonpath_dev/superset_config.py 的生产值
- build_superset*.log
- **/*.bak*
- **/*.orig*
- .superset_backup/
- 看板 params/query_context 备份
- 数据库连接、密钥、Token、生产 IP 和内部用户信息
```

- [ ] **Step 4：增加本项目专属忽略规则**

在 `.gitignore` 末尾增加：

```gitignore
# superset-optimization local migration artifacts
.migration-private/
build_superset*.log
*.bak.*
*.orig.*
```

- [ ] **Step 5：验证并提交清单**

运行：

```bash
git diff --check
git status --short
git add .gitignore docs/optimization/migration-manifest.md docs/optimization/private-exclusions.md
git commit -m "docs: define public migration inventory and exclusions" \
  -m "Record migration scope, safety boundaries, and author. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

预期：提交只包含三个清单/忽略文件，不包含任何生产配置或源码改动。

### Task 2：建立本地测试和敏感信息扫描门槛

**文件：**
- 创建：`docs/optimization/testing.md`
- 创建：`scripts/optimization/check-public-safety.sh`
- 测试：`scripts/optimization/check-public-safety.sh`

- [ ] **Step 1：确认安全扫描工具可用**

```bash
command -v gitleaks || brew install gitleaks
gitleaks version
```

预期：`gitleaks` 可执行。安装失败时停止，不得跳过公开安全扫描。

- [ ] **Step 2：先写安全扫描脚本的失败用例**

创建临时文件但不提交：

```bash
mkdir -p .migration-private/safety-test
printf '%s%s\n' 'SQLALCHEMY_DATABASE_URI=postgresql://user:' \
  'password@example.invalid/db' \
  > .migration-private/safety-test/leak.env
```

- [ ] **Step 3：实现公开安全扫描脚本**

`scripts/optimization/check-public-safety.sh` 必须使用 `set -euo pipefail`，并完成：

```bash
git ls-files -z | xargs -0 rg -n \
  "SQLALCHEMY_DATABASE_URI\\s*=\\s*[\"']|SECRET_KEY\\s*=\\s*[\"']|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@" \
  && exit 1 || true

if [[ -n "${PRIVATE_DEPLOYMENT_HOST_PATTERN:-}" ]] && \
  git ls-files -z | xargs -0 rg -n "${PRIVATE_DEPLOYMENT_HOST_PATTERN}"; then
  exit 1
fi

git ls-files | rg '(^|/)(\.env|.*\.bak.*|.*\.orig.*|build_superset.*\.log)$' \
  && exit 1 || true

gitleaks git . --redact --no-banner --log-opts="cc066b3576..HEAD"
```

脚本不得扫描或输出未跟踪私有文件的具体密钥值。

- [ ] **Step 4：验证失败和通过路径**

先将测试文件强制加入索引，运行脚本并确认失败；随后从索引移除并确认通过：

```bash
git add -f .migration-private/safety-test/leak.env
scripts/optimization/check-public-safety.sh
git rm --cached .migration-private/safety-test/leak.env
scripts/optimization/check-public-safety.sh
```

预期：第一次非零退出；第二次退出码为 0。测试文件始终留在忽略目录且不提交。

- [ ] **Step 5：记录测试环境**

`docs/optimization/testing.md` 必须记录：

```markdown
- 前端：在 superset-frontend 下运行本计划列出的 Jest 命令。
- 后端：仅在本地隔离 Python/容器环境运行 pytest。
- 构建：npm run build。
- 禁止：使用生产数据库配置运行 pytest 或 superset db upgrade。
```

- [ ] **Step 6：提交测试门槛**

```bash
git add docs/optimization/testing.md scripts/optimization/check-public-safety.sh
git commit -m "test: add public repository safety gate" \
  -m "Add repeatable secret and private-file checks. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 3：迁移日期格式和 CustomTime

**文件：**
- 修改：`superset-frontend/packages/superset-ui-core/src/time-format/TimeFormatsForGranularity.ts`
- 修改：`superset-frontend/packages/superset-ui-core/src/time-format/TimeFormatterRegistrySingleton.ts`
- 修改：`superset-frontend/packages/superset-ui-core/src/time-format/formatters/smartDate.ts`
- 修改：`superset-frontend/packages/superset-ui-core/src/time-format/formatters/smartDateVerbose.ts`
- 修改：`superset-frontend/packages/superset-ui-core/src/time-format/types.ts`
- 修改：`superset-frontend/packages/superset-ui-core/src/time-format/utils/createTimeRangeFromGranularity.ts`
- 修改：`superset-frontend/src/filters/components/index.ts`
- 修改：`superset-frontend/src/visualizations/presets/MainPreset.ts`
- 创建：`superset-frontend/src/filters/components/CustomTime/`
- 测试：`superset-frontend/packages/superset-ui-core/test/time-format/TimeFormatterRegistrySingleton.test.ts`
- 测试：`superset-frontend/packages/superset-ui-core/test/time-format/formatters/smartDate.test.ts`
- 测试：CustomTime 目录内随实现迁入的测试文件

- [ ] **Step 1：只迁移日期和 CustomTime 测试**

从服务器逐个读取测试差异和新增测试文件，审查后应用到本地。禁止复制整个工作区。

- [ ] **Step 2：运行测试确认 RED**

```bash
cd superset-frontend
npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand \
  packages/superset-ui-core/test/time-format/TimeFormatterRegistrySingleton.test.ts \
  packages/superset-ui-core/test/time-format/formatters/smartDate.test.ts \
  src/filters/components/CustomTime
```

预期：测试能够启动，但至少一个关于日、周、月、季度或年份显示，以及
CustomTime 注册的断言失败。依赖安装错误不算有效 RED。

- [ ] **Step 3：迁移最小实现**

只应用本任务“文件”列表中的生产差异。SmartDate 必须按时间粒度输出一致标签；
CustomTime 必须通过过滤器组件索引和 MainPreset 注册，不得引用 Sellerfox 表名或
看板 ID。

- [ ] **Step 4：运行测试确认 GREEN**

重复 Step 2 命令。

预期：所列测试全部通过，退出码为 0。

- [ ] **Step 5：提交**

```bash
git add superset-frontend/packages/superset-ui-core \
  superset-frontend/src/filters/components \
  superset-frontend/src/visualizations/presets/MainPreset.ts
git commit -m "feat: add granular date formatting and custom time filter" \
  -m "Migrate tested date and CustomTime behavior. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 4：迁移原生筛选器、状态保存和级联候选项

**文件：**
- 修改：`superset-frontend/src/dashboard/components/nativeFilters/FilterBar/`
- 修改：`superset-frontend/src/dashboard/containers/DashboardPage.tsx`
- 修改：`superset-frontend/src/dataMask/actions.ts`
- 修改：`superset-frontend/src/dataMask/reducer.ts`
- 修改：`superset/dashboards/api.py`
- 修改：`superset/dashboards/filter_state/api.py`
- 创建：`superset/commands/dashboard/cascade_filter_options.py`
- 创建：`superset/commands/dashboard/filter_state/last.py`
- 测试：`superset-frontend/src/dashboard/components/nativeFilters/FilterBar/FilterBar.test.tsx`
- 测试：`superset-frontend/src/dashboard/components/nativeFilters/FilterBar/FilterControls/FilterValue.test.ts`
- 测试：`superset-frontend/src/dashboard/components/nativeFilters/FilterBar/FilterControls/cascadeFilterOptions.test.ts`
- 测试：`superset-frontend/src/dashboard/containers/DashboardPage.test.tsx`
- 测试：`superset-frontend/src/dataMask/reducer.test.ts`
- 测试：`tests/unit_tests/dashboards/test_cascade_filter_options.py`
- 测试：`tests/unit_tests/dashboards/filter_state/`

- [ ] **Step 1：先迁移筛选器和后端测试**

只迁移上述测试文件。测试数据必须使用通用字段名；发现具体店铺、客户、看板 ID、
生产数据集 ID 或生产地址时，先参数化再暂存。

- [ ] **Step 2：运行前端测试确认 RED**

```bash
cd superset-frontend
npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand \
  src/dashboard/components/nativeFilters/FilterBar/FilterBar.test.tsx \
  src/dashboard/components/nativeFilters/FilterBar/FilterControls/FilterValue.test.ts \
  src/dashboard/components/nativeFilters/FilterBar/FilterControls/cascadeFilterOptions.test.ts \
  src/dashboard/containers/DashboardPage.test.tsx \
  src/dataMask/reducer.test.ts
```

预期：至少一个关于恢复上次筛选、延迟应用、相同 dataMask 去重或级联批量加载的
断言失败；Jest 本身必须正常启动。

- [ ] **Step 3：运行后端测试确认 RED**

在本地隔离环境运行：

```bash
pytest -q tests/unit_tests/dashboards/test_cascade_filter_options.py \
  tests/unit_tests/dashboards/filter_state
```

预期：由于命令或 last filter 实现尚不存在而失败；测试不得连接生产数据库。

- [ ] **Step 4：迁移筛选器最小实现**

应用 FilterBar、DashboardPage 和 dataMask 差异，并迁入
`cascadeFilterOptions.ts`。保持通用数据集行为，不保留 `kk_sku` 等业务字段的
硬编码白名单；需要批量加载时应由字段能力或配置驱动。

- [ ] **Step 5：迁移后端最小实现**

应用 dashboard API、filter state API、`cascade_filter_options.py` 和
`filter_state/last.py`。删除生产表名、固定 dashboard ID 和生产时间范围假设。

- [ ] **Step 6：运行 GREEN 测试**

重复 Step 2 和 Step 3 命令。

预期：全部通过；后端测试日志不出现生产主机或生产数据库名称。

- [ ] **Step 7：提交**

```bash
git add superset-frontend/src/dashboard superset-frontend/src/dataMask \
  superset/dashboards superset/commands/dashboard tests/unit_tests/dashboards
git commit -m "feat: optimize native filter state and cascade loading" \
  -m "Migrate generic filter persistence, batching, and deduplication. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 5：迁移透视表公开属性

**文件：**
- 修改：`superset-frontend/plugins/plugin-chart-pivot-table/src/PivotTableChart.tsx`
- 修改：`superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/controlPanel.tsx`
- 修改：`superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/transformProps.ts`
- 修改：`superset-frontend/plugins/plugin-chart-pivot-table/src/react-pivottable/TableRenderers.tsx`
- 修改：`superset-frontend/plugins/plugin-chart-pivot-table/src/react-pivottable/utilities.ts`
- 修改：`superset-frontend/plugins/plugin-chart-pivot-table/src/types.ts`
- 创建：`superset-frontend/plugins/plugin-chart-pivot-table/src/utils/`
- 测试：`superset-frontend/plugins/plugin-chart-pivot-table/test/plugin/transformProps.test.ts`
- 测试：`superset-frontend/plugins/plugin-chart-pivot-table/test/react-pivottable/tableRenders.test.tsx`
- 测试：`superset-frontend/plugins/plugin-chart-pivot-table/test/react-pivottable/pivotData.test.ts`

- [ ] **Step 1：迁移测试并确认 RED**

```bash
cd superset-frontend
npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand \
  plugins/plugin-chart-pivot-table/test/plugin/transformProps.test.ts \
  plugins/plugin-chart-pivot-table/test/react-pivottable/tableRenders.test.tsx \
  plugins/plugin-chart-pivot-table/test/react-pivottable/pivotData.test.ts
```

预期：行列数字格式、总计聚合、总计条件格式或字段重命名相关断言至少一项失败。

- [ ] **Step 2：迁移最小实现**

迁移公开 chart properties、规则解析和渲染逻辑。规则必须来自 chart formData，
不得按具体字段名写死。比率总计必须使用已定义聚合规则，不能默认直接求和。

- [ ] **Step 3：运行 GREEN 测试**

重复 Step 1 命令，预期全部通过。

- [ ] **Step 4：提交**

```bash
git add superset-frontend/plugins/plugin-chart-pivot-table
git commit -m "feat: add public pivot formatting properties" \
  -m "Migrate tested formats, totals, conditional colors, and labels. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 6：迁移 Big Number 同环比和通用 ECharts 格式化

**文件：**
- 修改：`superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/`
- 修改：`superset-frontend/plugins/plugin-chart-echarts/src/MixedTimeseries/`
- 修改：`superset-frontend/plugins/plugin-chart-echarts/src/Timeseries/`
- 修改：`superset-frontend/plugins/plugin-chart-echarts/src/utils/formatters.ts`
- 修改：`superset-frontend/plugins/plugin-chart-echarts/src/utils/mergeCustomEChartOptions.ts`
- 修改：`superset-frontend/plugins/plugin-chart-echarts/src/index.ts`
- 修改：`superset-frontend/packages/superset-ui-chart-controls/src/types.ts`
- 修改：`superset-frontend/packages/superset-ui-chart-controls/src/utils/D3Formatting.ts`
- 修改：`superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts`
- 创建：`superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/comparisonRanges.ts`
- 测试：`superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts`
- 测试：`superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/comparisonRanges.test.ts`
- 测试：`superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.test.ts`

- [ ] **Step 1：迁移测试并确认 RED**

```bash
cd superset-frontend
npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand \
  plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts \
  plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/comparisonRanges.test.ts \
  plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.test.ts
```

预期：自适应上一周期、同比区间或比较展示相关断言至少一项失败。

- [ ] **Step 2：迁移最小实现**

迁移 comparison range 计算、查询构建、控制面板和 transform props。周期计算必须
只依赖当前筛选时间范围和选定模式，不依赖 Sellerfox 数据最新日期或固定 T-2。

- [ ] **Step 3：运行 GREEN 测试**

重复 Step 1 命令，预期全部通过。

- [ ] **Step 4：提交**

```bash
git add superset-frontend/plugins/plugin-chart-echarts \
  superset-frontend/packages/superset-ui-chart-controls \
  superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts
git commit -m "feat: add adaptive big number comparisons" \
  -m "Migrate reusable comparison ranges and chart formatting. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 7：迁移条件格式、格式注册和通用 UI 修复

**文件：**
- 修改：`superset-frontend/packages/superset-ui-chart-controls/src/utils/getColorFormatters.ts`
- 测试：`superset-frontend/packages/superset-ui-chart-controls/test/utils/getColorFormatters.test.ts`
- 修改：`superset-frontend/src/explore/components/controls/ConditionalFormattingControl/FormattingPopoverContent.tsx`
- 修改：`superset-frontend/src/explore/components/controls/ConditionalFormattingControl/types.ts`
- 测试：`superset-frontend/src/explore/components/controls/ConditionalFormattingControl/FormattingPopoverContent.test.tsx`
- 修改：`superset-frontend/src/setup/setupFormatters.ts`
- 测试：`superset-frontend/src/setup/setupFormatters.test.ts`
- 修改：`superset-frontend/src/pages/ActionLog/index.tsx`
- 测试：`superset-frontend/src/pages/ActionLog/index.test.tsx`

- [ ] **Step 1：迁移测试并确认 RED**

```bash
cd superset-frontend
npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand \
  packages/superset-ui-chart-controls/test/utils/getColorFormatters.test.ts \
  src/explore/components/controls/ConditionalFormattingControl/FormattingPopoverContent.test.tsx \
  src/setup/setupFormatters.test.ts \
  src/pages/ActionLog/index.test.tsx
```

预期：自定义颜色、总计颜色、格式注册或页面行为至少一项断言失败。

- [ ] **Step 2：迁移实现并确认 GREEN**

只迁移与测试直接对应的实现；对无法由测试说明的 `DrillDetailPane.tsx`、
`ControlPanelsContainer.tsx`、`constants.ts` 等单行差异逐个审查，确认属于通用修复后
才纳入，否则记录在迁移清单中并暂缓。

重复 Step 1 命令，预期全部通过。

- [ ] **Step 3：提交**

```bash
git add superset-frontend/packages/superset-ui-chart-controls \
  superset-frontend/src/explore/components/controls/ConditionalFormattingControl \
  superset-frontend/src/setup superset-frontend/src/pages/ActionLog
git commit -m "feat: extend reusable formatting controls" \
  -m "Migrate tested color and formatter behavior. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 8：整理中文翻译和通用部署配置

**文件：**
- 修改：`superset/translations/zh/LC_MESSAGES/messages.po`
- 测试：`tests/test_build_zh_overrides.py`
- 测试：`tests/test_zh_catalog_quality.py`
- 创建：`deploy/example.env`
- 创建：`deploy/superset_config.example.py`
- 创建：`docs/optimization/deployment.md`
- 审查：`Dockerfile`
- 审查：`docker-compose.yml`
- 审查：`docker-compose-image-tag.yml`
- 审查：`docker/apt-install.sh`
- 审查：`docker/pip-install.sh`

- [ ] **Step 1：迁移翻译质量测试并确认 RED**

在本地隔离 Python 环境运行：

```bash
pytest -q tests/test_build_zh_overrides.py tests/test_zh_catalog_quality.py
```

预期：上游中文目录不满足新增质量或覆盖断言；测试不得读取生产配置。

- [ ] **Step 2：只迁移源翻译**

迁移 `messages.po` 和生成脚本需要的通用覆盖文件。禁止迁移 `.mo`、`.json`、备份
和服务器构建产物。运行翻译测试，预期全部通过。

- [ ] **Step 3：重建通用配置模板**

`deploy/example.env` 只允许占位值：

```dotenv
SUPERSET_SECRET_KEY=replace-with-a-random-secret
SUPERSET_DATABASE_URI=replace-at-deploy-time
REDIS_HOST=redis
REDIS_PORT=6379
```

`deploy/superset_config.example.py` 必须只从环境变量读取值，不包含默认生产凭据：

```python
import os

SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]
SQLALCHEMY_DATABASE_URI = os.environ["SUPERSET_DATABASE_URI"]
```

- [ ] **Step 4：审查而不是复制服务器部署差异**

逐项比较 Docker 相关文件。仅保留安装通用依赖和启动 Superset 所必需的内容；固定
容器名、生产卷路径、生产端口、镜像标签和数据库地址全部拒绝迁移。

- [ ] **Step 5：运行安全扫描并提交**

```bash
scripts/optimization/check-public-safety.sh
git add superset/translations/zh/LC_MESSAGES/messages.po \
  tests/test_build_zh_overrides.py tests/test_zh_catalog_quality.py \
  deploy docs/optimization/deployment.md Dockerfile docker-compose*.yml \
  docker/apt-install.sh docker/pip-install.sh
git diff --cached --check
git commit -m "chore: add sanitized localization and deployment assets" \
  -m "Publish reusable translations and environment-driven templates. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

预期：暂存区不包含 `.env`、生产配置、备份、日志或私有值。

### Task 9：执行完整验证和公开仓库审计

**文件：**
- 创建：`docs/optimization/verification-report.md`

- [ ] **Step 1：运行所有目标前端测试**

在 `superset-frontend` 下按 Task 3 至 Task 7 的文件集合执行一次 Jest：

```bash
npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=8192" \
  jest --runInBand \
  packages/superset-ui-core/test/time-format \
  src/filters/components/CustomTime \
  src/dashboard/components/nativeFilters/FilterBar \
  src/dashboard/containers/DashboardPage.test.tsx \
  src/dataMask/reducer.test.ts \
  plugins/plugin-chart-pivot-table/test \
  plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal \
  src/explore/components/controls/ConditionalFormattingControl \
  src/setup/setupFormatters.test.ts \
  src/pages/ActionLog/index.test.tsx
```

预期：退出码为 0，报告中记录 suite 和 test 的实际通过数量。

- [ ] **Step 2：运行后端目标测试**

```bash
pytest -q tests/unit_tests/dashboards/test_cascade_filter_options.py \
  tests/unit_tests/dashboards/filter_state \
  tests/test_build_zh_overrides.py tests/test_zh_catalog_quality.py
```

预期：退出码为 0，并记录实际通过数量。

- [ ] **Step 3：运行类型检查和生产构建**

```bash
cd superset-frontend
npm run type
npm run build
```

预期：两个命令退出码均为 0；构建期间不得访问生产数据库。

- [ ] **Step 4：验证脱敏 Docker 环境可启动**

```bash
command -v docker
docker info
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

预期：Docker 可用，Compose 配置有效，测试栈中的 Superset 服务进入 healthy。
如果本机没有 Docker 运行环境，必须在公开推送前停止并报告，不能改用生产数据库
配置完成验证。验证结束后运行 `docker compose down`，不得附加 `-v` 删除数据卷。

- [ ] **Step 5：运行两轮公开安全扫描**

```bash
scripts/optimization/check-public-safety.sh
git log --oneline cc066b3576..HEAD
git diff --check cc066b3576..HEAD
```

预期：扫描通过；提交只按已批准模块分组；差异无空白错误。

- [ ] **Step 6：生成验证报告并提交**

`docs/optimization/verification-report.md` 必须记录实际命令、时间、通过数量、构建结果、
安全扫描结果、未迁移文件及原因，不得填写预估结果。

```bash
git add docs/optimization/verification-report.md
git commit -m "docs: record public migration verification" \
  -m "Record tests, build, safety scan, and author. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

### Task 10：创建公开 GitHub 仓库并推送

**文件：**
- 修改：`README.md`
- 创建：`docs/optimization/README.zh-CN.md`

- [ ] **Step 1：增加项目身份说明**

README 必须明确：项目基于 Apache Superset、遵循 Apache-2.0、不是 Apache 官方发行版，
并概述本项目公开优化范围。不得出现 Sellerfox 客户、服务器或生产数据库信息。

- [ ] **Step 2：最后检查远端和差异**

```bash
git remote -v
scripts/optimization/check-public-safety.sh
git status --short
```

预期：只有 `upstream=https://github.com/apache/superset.git`；安全扫描通过；工作区干净。

- [ ] **Step 3：提交 README**

```bash
git add README.md docs/optimization/README.zh-CN.md
git commit -m "docs: introduce superset optimization project" \
  -m "Document project scope, Apache attribution, and author. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

- [ ] **Step 4：创建公开仓库**

```bash
gh repo create hersj/superset-optimization \
  --public \
  --description "Reusable performance and visualization improvements for Apache Superset"
git remote add origin https://github.com/hersj/superset-optimization.git
```

预期：GitHub 仓库可公开访问，且不是通过 GitHub Fork 按钮创建；`origin` 指向 hersj，
`upstream` 指向 Apache。

- [ ] **Step 5：推送 Apache 基线和迁移分支**

```bash
git push origin master:master
git push -u origin codex/public-project-migration
```

预期：`master` 保存未定制的 Apache 基线；迁移分支推送成功并保留 Apache 历史，
公开分支包含修改内容和作者。

- [ ] **Step 6：创建 Pull Request，不切换生产**

```bash
gh pr create \
  --base master \
  --head codex/public-project-migration \
  --title "feat: publish reusable Superset optimizations" \
  --body-file docs/optimization/verification-report.md
```

预期：创建可审查 PR。不得在本任务中修改服务器 Git 远端、容器、数据库或线上部署。

### Task 11：验证后清理 Sellerfox 中的 Superset 专属资产

**文件：**
- 审查：`/Users/hsk/Documents/Projects/sellerfox_sync 2/.superset_backup/`
- 审查：`/Users/hsk/Documents/Projects/sellerfox_sync 2/.codex_tmp/superset_pivot_fix/`
- 审查：`/Users/hsk/Documents/Projects/sellerfox_sync 2/superset_missing_i18n.json`
- 审查：`/Users/hsk/Documents/Projects/sellerfox_sync 2/docs/superpowers/`
- 审查：`/Users/hsk/Documents/Projects/sellerfox_sync 2/migrations/superset_rls_swap_to_shop_staff.sql`

- [ ] **Step 1：证明公开仓库已有对应资产**

逐项将 Sellerfox 文件映射到 `superset-optimization` 的提交。没有公开替代物的文件不得
删除；包含私有看板备份的数据只做本地私有归档，不进入公开仓库。

- [ ] **Step 2：区分 Git 已跟踪和未跟踪内容**

```bash
git -C '/Users/hsk/Documents/Projects/sellerfox_sync 2' status --short
git -C '/Users/hsk/Documents/Projects/sellerfox_sync 2' ls-files | \
  rg 'superset|pivot|CustomTime|SmartDate'
```

预期：明确哪些文件会形成 Sellerfox 提交；不得触碰当前已有的业务代码改动。

- [ ] **Step 3：只删除已完成职责转移的文件并提交**

使用 `apply_patch` 删除已跟踪的 Superset 专属文件；未跟踪私有备份移动到 Sellerfox
仓库外的私有归档目录。暂存时逐个写出路径，禁止 `git add -A`。

```bash
git -C '/Users/hsk/Documents/Projects/sellerfox_sync 2' diff --cached --check
git -C '/Users/hsk/Documents/Projects/sellerfox_sync 2' commit \
  -m "chore: move Superset ownership to public project" \
  -m "Remove migrated Superset-only assets. Author: hersj <127282478+hersj@users.noreply.github.com>"
```

预期：提交仅包含 Superset 资产清理，Sellerfox 现有业务改动保持不变。

## 计划完成后的状态

- 公开仓库已经创建并包含可审查 PR。
- Apache Superset 为 `upstream`，用户仓库为 `origin`。
- 所有迁移模块有独立提交、目标测试和验证报告。
- 生产服务器代码、容器、Superset 元数据库和 Sellerfox 业务数据库均未改变。
- 生产部署切换需要另行制定计划并获得用户明确批准。
