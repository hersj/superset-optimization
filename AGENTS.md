# Apache Superset

Flask/Python 后端，React/TypeScript 前端。本文件适用于仓库及其工作树；本机已加载的通用规则作为补充，不要求其他环境存在 `~/.codex/AGENTS.md`。

## 最小实现与任务范围

- 极低概率或仅理论上的边界/并发问题默认不加防御、不打断任务；确需增加时说明触发条件、概率依据和代价，获用户确认后再加，不编造概率。
- 外部输入只在信任边界校验一次，内部按类型和契约流转，不重复判断同一保证；保留每次请求的鉴权/授权和写入一致性约束。
- 单次逻辑就近内联，不提前拆无意义的 helper 或抽象；复用现有能力，不为未来预留接口、存储或配置。
- 非必要不用 `try/catch` 或 `try/except`，不吞错、不重复包装；能由一个清晰函数完成的逻辑不硬拆。
- 问答只读取足够证据；实施任务按已有授权连续完成修改、验证和交付。确认/核验默认由 Agent 查证，不重复索要授权；仅关键输入无法查明、授权不足或必须扩大范围时询问。
- 保留已有工作，仅暂存本任务文件；只在新改动或具体疑点出现时重跑受影响检查。历史模板与本节冲突时以本节为准，当前用户明确要求除外。

## 按需定位

- 后端 API/schema/commands/models 在 `superset/`；前端在 `superset-frontend/src/`，共享 UI 在 `superset-frontend/packages/superset-ui-core/`。
- Python 配置查 `pyproject.toml`、`requirements/`，前端命令查 `superset-frontend/package.json`。测试在 `tests/` 及相邻前端测试文件；按变化更新 `docs/` 中受影响的用户说明，破坏性变化更新 `UPDATING.md`，API 文档来自 docstring/schema。
- 仅 JS → TS 迁移任务读取 `.claude/projects/js-to-ts/AGENT.md`，普通修复不附带迁移。

## 实现约定

- 新前端代码用 TypeScript、函数组件和 hooks，复用已有类型，避免 `any`；组件用 `@superset-ui/core/components` 包装与 antd tokens，优先现有样式能力。已有全局状态沿用 Redux，局部状态用 hooks。
- Python 新代码沿用类型提示、SQLAlchemy 模型注解及项目 docstring 约定，避免重复代码已表达的说明；布尔 SQL 条件用 `~Model.field`，避免 `== False` 的 lint 错误。
- 新增模型或公开 API 契约遵循 UUID 约定；修复现有接口不触发 ID 迁移，已有 integer ID 兼容变更仅在明确授权的 schema/API 范围内进行。
- 保留 Flask-AppBuilder RBAC、feature flags 和 SQL RLS 边界；外部输入使用已有入口 schema 校验，内部沿用已确认的类型契约，不逐层重复校验。
- 新代码文件保留 ASF license header；LLM 指令文件按 `.rat-excludes` 处理。注释描述稳定契约，避免易过期的时间措辞。

## 验证

- 选择覆盖本次故障的最小测试层级；前端用 Jest + React Testing Library，新增 E2E 优先 Playwright，不新增 Enzyme/Cypress 用例或附带迁移。简单用例用 `test()`，不为模板增加嵌套。
- 从根目录运行 `pre-commit run --files <本任务文件...>` 中适用的 hooks，检查自动修正差异；Python 类型检查使用已配置 mypy hook。纯文档只检查内容、引用、差异及适用格式，不触发业务测试或服务启动。
- 前端在 `superset-frontend/` 按当前 scripts 运行指定测试，如 `npm run test -- <测试路径>`；后端在根目录用 `pytest <测试路径>`。E2E 命令、目录和依赖以当前 checkout 为准；涉及外部副作用时按通用规则核实隔离。
- Python 集成测试复用 `tests/integration_tests/base_tests.py` 的 `SupersetTestCase`、config/feature flag 装饰器及登录、dashboard/slice helpers；同步调用用同步 mock，字段变化更新 API 断言。
- 前端复用 `superset-frontend/spec/helpers/testing-library.tsx` 的 provider 渲染和已有 wrapper/选择组件 helpers。环境缺失先查现有依赖和配置，完成可运行检查后报告具体阻塞。
- 仅集成测试、浏览器验收或部署需要实例时核对已确认的服务地址，不默认 `localhost:8088` 存在；健康检查不是业务验收。

## 专项与交付

- schema 迁移放 `superset/migrations/versions/`，沿用 `YYYY-MM-DD_HH-MM_hash_description.py` 和 `superset.migrations.shared.utils`；明确范围、兼容和回滚，生产执行须有明确授权，先核对范围、预计行数及恢复方式；按已授权范围分批验证执行，不逐批确认。
- Storybook → MDX：stories 是内容来源，内容问题修 story、生成器缺陷修生成器，不加个别组件特判。metadata 用内联 `export default { title: '...' }`，交互 story 用 `Interactive${ComponentName}`，默认 props 放 `args`，控制类型及描述放 story 级 `argTypes`。
- 按需使用 `parameters.docs.gallery`、`sampleChildren`、`liveExample`、`staticProps`；入口 `docs/scripts/generate-superset-components.mjs`，包装器 `docs/src/components/StorybookWrapper.jsx`，产物 `docs/developer_docs/components/`，修改时核对来源和生成结果。
- 创建 PR 读取当前 `.github/PULL_REQUEST_TEMPLATE.md`，标题用 `type(scope): description`，说明行为变化、实际验证和未完成项；部署才补充目标环境、运行版本及真实业务验收。
