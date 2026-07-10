# 迁移清单

## 基线

- 上游基线：`cc066b35761098d1ec557b9149b855dc6ad2f530`
- 来源：生产服务器 `/superset/superset`，只读
- 目标分支：`codex/public-project-migration`
- 原则：先迁移测试并确认 RED，再迁移实现并确认 GREEN

## 日期与 CustomTime

| 路径 | 来源状态 | 迁移提交 | 验证 |
| --- | --- | --- | --- |
| `superset-frontend/packages/superset-ui-core/src/time-format/` | 已跟踪修改 | 待迁移 | 目标 Jest |
| `superset-frontend/packages/superset-ui-core/test/time-format/` | 已跟踪修改 | 待迁移 | 目标 Jest |
| `superset-frontend/src/filters/components/CustomTime/` | 新增 | 待迁移 | 目标 Jest |
| `superset-frontend/src/filters/components/index.ts` | 已跟踪修改 | 待迁移 | 类型检查 |
| `superset-frontend/src/visualizations/presets/MainPreset.ts` | 已跟踪修改 | 待迁移 | 类型检查 |

## 原生筛选器与状态保存

| 路径 | 来源状态 | 迁移提交 | 验证 |
| --- | --- | --- | --- |
| `superset-frontend/src/dashboard/components/nativeFilters/FilterBar/` | 已跟踪修改及新增 | 待迁移 | 目标 Jest |
| `superset-frontend/src/dashboard/containers/DashboardPage.tsx` | 已跟踪修改 | 待迁移 | 目标 Jest |
| `superset-frontend/src/dashboard/containers/DashboardPage.test.tsx` | 新增 | 待迁移 | 目标 Jest |
| `superset-frontend/src/dataMask/` | 已跟踪修改 | 待迁移 | 目标 Jest |
| `superset/dashboards/api.py` | 已跟踪修改 | 待迁移 | 目标 pytest |
| `superset/dashboards/filter_state/api.py` | 已跟踪修改 | 待迁移 | 目标 pytest |
| `superset/commands/dashboard/cascade_filter_options.py` | 新增 | 待迁移 | 目标 pytest |
| `superset/commands/dashboard/filter_state/last.py` | 新增 | 待迁移 | 目标 pytest |
| `tests/unit_tests/dashboards/` 中对应测试 | 新增 | 待迁移 | 目标 pytest |

## 透视表

| 路径 | 来源状态 | 迁移提交 | 验证 |
| --- | --- | --- | --- |
| `superset-frontend/plugins/plugin-chart-pivot-table/src/` | 已跟踪修改及新增 | 待迁移 | 目标 Jest |
| `superset-frontend/plugins/plugin-chart-pivot-table/test/` | 已跟踪修改及新增 | 待迁移 | 目标 Jest |

## Big Number 与 ECharts

| 路径 | 来源状态 | 迁移提交 | 验证 |
| --- | --- | --- | --- |
| `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/` | 已跟踪修改及新增 | 待迁移 | 目标 Jest |
| `superset-frontend/plugins/plugin-chart-echarts/src/MixedTimeseries/` | 已跟踪修改 | 待迁移 | 目标 Jest/类型检查 |
| `superset-frontend/plugins/plugin-chart-echarts/src/Timeseries/` | 已跟踪修改及新增 | 待迁移 | 目标 Jest/类型检查 |
| `superset-frontend/plugins/plugin-chart-echarts/src/utils/` | 已跟踪修改 | 待迁移 | 目标 Jest/类型检查 |
| `superset-frontend/packages/superset-ui-chart-controls/` | 已跟踪修改及新增测试 | 待迁移 | 目标 Jest |

## 条件格式和通用 UI

| 路径 | 来源状态 | 迁移提交 | 验证 |
| --- | --- | --- | --- |
| `superset-frontend/src/explore/components/controls/ConditionalFormattingControl/` | 已跟踪修改 | 待迁移 | 目标 Jest |
| `superset-frontend/src/setup/setupFormatters.ts` | 已跟踪修改 | 待迁移 | 目标 Jest |
| `superset-frontend/src/setup/setupFormatters.test.ts` | 新增 | 待迁移 | 目标 Jest |
| `superset-frontend/src/pages/ActionLog/` | 已跟踪修改及新增测试 | 待迁移 | 目标 Jest |
| 其他单行差异 | 已跟踪修改 | 暂缓，逐项审查 | 对应测试或类型检查 |

## 中文翻译

| 路径 | 来源状态 | 迁移提交 | 验证 |
| --- | --- | --- | --- |
| `superset/translations/zh/LC_MESSAGES/messages.po` | 已跟踪修改 | 待迁移 | 翻译质量 pytest |
| `zh_overrides.json` | 新增 | 待审查和参数化 | 翻译质量 pytest |
| `tests/test_build_zh_overrides.py` | 新增 | 待迁移 | pytest |
| `tests/test_zh_catalog_quality.py` | 新增 | 待迁移 | pytest |

生成的 `messages.json`、`messages.mo` 及其备份不迁移。

## 通用运行配置

| 路径 | 来源状态 | 处理方式 | 验证 |
| --- | --- | --- | --- |
| `Dockerfile` | 已跟踪修改 | 逐行审查后重建 | Docker 构建 |
| `docker-compose*.yml` | 已跟踪修改及新增 | 不直接复制，重建公开模板 | `docker compose config` |
| `docker/apt-install.sh` | 已跟踪修改 | 逐行审查 | Docker 构建 |
| `docker/pip-install.sh` | 已跟踪修改 | 逐行审查 | Docker 构建 |
| `docker/.env` | 已跟踪修改 | 禁止迁移 | 不适用 |
| `docker/pythonpath_dev/superset_config.py` | 已跟踪修改 | 禁止复制真实值，重建示例 | 安全扫描 |

## 已确认禁止迁移

禁止项以 [`private-exclusions.md`](private-exclusions.md) 为准。任何未列入本清单的
新增文件默认不迁移，必须先完成内容审查并更新清单。
