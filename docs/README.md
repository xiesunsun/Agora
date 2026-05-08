# 文档索引

本目录是 AgentBoard 项目的正式文档体系。

## 快速入门

- [开发者指南](Developer-Guide.md) — 按角色（前端/后端/Agent）的开发指引
- [产品概述](01-product/Product-Overview.md) — 产品全局视图，10 分钟快速理解

## 文档总览

### `01-product/` — 产品定义

回答"我们要做什么"。

| 文档 | 职责 |
|-----|------|
| [Product-Overview.md](01-product/Product-Overview.md) | 产品全局视图与核心概念速查 |
| [PRD.md](01-product/PRD.md) | 完整产品需求文档：愿景、场景、核心概念、MVP 范围 |
| [Feature-Spec.md](01-product/Feature-Spec.md) | 交互规格：页面区块、核心对象、详细交互路径 |
| [Product-Interaction-State-Machine.md](01-product/Product-Interaction-State-Machine.md) | 产品交互状态机：5 个顶层状态与迁移规则 |

### `02-models/` — 核心模型

回答"系统里的核心对象是什么"。

| 文档 | 职责 |
|-----|------|
| [Domain-Model.md](02-models/Domain-Model.md) | 领域模型：7 个核心对象的职责、边界与不变量 |
| [Document-Presentation-Model.md](02-models/Document-Presentation-Model.md) | 文稿展示模型：Markdown 到 DocumentUnit 的派生与渲染管线 |

### `03-contracts/` — 系统契约

回答"系统边界之间如何对接"。

| 文档 | 职责 |
|-----|------|
| [Frontend-Backend-Protocol.md](03-contracts/Frontend-Backend-Protocol.md) | 前后端协议：HTTP commands + SSE events，snapshot/command/event 模型 |
| [Agent-CLI.md](03-contracts/Agent-CLI.md) | Agent CLI：subagent-facing 命令语义与本地工作区原则 |
| [Schema-Appendix.md](03-contracts/Schema-Appendix.md) | Schema 附录：所有领域对象、command、event 的 TypeScript 定义 |
| [Markdown-Rendering-Contract.md](03-contracts/Markdown-Rendering-Contract.md) | Markdown 渲染契约：渲染管线、编辑重解析、review 派生规则 |
| [Document-Template-Contract.md](03-contracts/Document-Template-Contract.md) | 页面模板契约：固定 document 模板骨架与 anti-drift 规则 |

### `04-design/` — UI/UX 设计

回答"页面长什么样、怎么交互"。

| 文档 | 职责 |
|-----|------|
| [UI-Structure.md](04-design/UI-Structure.md) | 前端页面结构：阅读面 + 附着层 + 状态接管 |
| [Visual-Reference.md](04-design/Visual-Reference.md) | 视觉原型参考：各状态的 canonical 桌面截图 |
| [Control-Surface-Matrix.md](04-design/Control-Surface-Matrix.md) | 控制面矩阵：稳定约束与防护规则映射 |
| [Acceptance-Matrix.md](04-design/Acceptance-Matrix.md) | 验收矩阵：5 层验收（结构/渲染/交互/展示/运行时） |
| [Visual-QA-Checklist.md](04-design/Visual-QA-Checklist.md) | 视觉 QA 检查清单 |

### `05-agent/` — Agent 执行设计

回答"Agent 如何执行黑板协作"。

| 文档 | 职责 |
|-----|------|
| [Collaboration-Skill-Spec.md](05-agent/Collaboration-Skill-Spec.md) | 统一协作 Skill：main agent 与 subagent 的角色合同 |
| [Host-Execution-Design.md](05-agent/Host-Execution-Design.md) | 宿主执行层：Codex 下的 subagent 运行模型 |
| [Harness-Engineering-Design.md](05-agent/Harness-Engineering-Design.md) | 工程治理设计：分层、命名、复用、workflow |
| [Codex-Host-Validation-Contract.md](05-agent/Codex-Host-Validation-Contract.md) | Codex 宿主验证：哪些保证由谁提供 |
| [MVP-Runbook.md](05-agent/MVP-Runbook.md) | MVP 运行手册：验收顺序、已知限制、发布门禁 |

### `90-research/` — 调研文档

存放调研、推导和草稿类文档。有参考价值，但默认不视为当前正式规范。

### `99-internal/` — 内部计划

存放团队内部过程文档，例如计划、执行记录和辅助资料。不属于项目正式规范。

## 推荐阅读顺序

### 理解产品

1. [Product-Overview.md](01-product/Product-Overview.md)
2. [PRD.md](01-product/PRD.md)
3. [Feature-Spec.md](01-product/Feature-Spec.md)
4. [Product-Interaction-State-Machine.md](01-product/Product-Interaction-State-Machine.md)

### 理解技术设计

1. [Domain-Model.md](02-models/Domain-Model.md)
2. [Document-Presentation-Model.md](02-models/Document-Presentation-Model.md)
3. [Frontend-Backend-Protocol.md](03-contracts/Frontend-Backend-Protocol.md)
4. [Agent-CLI.md](03-contracts/Agent-CLI.md)
5. [Schema-Appendix.md](03-contracts/Schema-Appendix.md)

### 理解前端实现

1. [Developer-Guide.md](Developer-Guide.md) — 前端开发者部分
2. [UI-Structure.md](04-design/UI-Structure.md)
3. [Visual-Reference.md](04-design/Visual-Reference.md)
4. [Markdown-Rendering-Contract.md](03-contracts/Markdown-Rendering-Contract.md)
5. [Document-Template-Contract.md](03-contracts/Document-Template-Contract.md)

### 理解 Agent 实现

1. [Developer-Guide.md](Developer-Guide.md) — Agent 开发者部分
2. [Collaboration-Skill-Spec.md](05-agent/Collaboration-Skill-Spec.md)
3. [Host-Execution-Design.md](05-agent/Host-Execution-Design.md)
4. [Agent-CLI.md](03-contracts/Agent-CLI.md)

## 文档放置规则

| 文档类型 | 放置目录 |
|---------|---------|
| 产品目标、范围、交互规则 | `01-product/` |
| 领域对象、展示对象、不变量 | `02-models/` |
| 协议、schema、命令、事件、实现契约 | `03-contracts/` |
| 页面结构、视觉设计、验收标准 | `04-design/` |
| Agent 执行、Skill、宿主设计、工程治理 | `05-agent/` |
| 调研、草稿、方案比较 | `90-research/` |
| 内部计划、执行记录 | `99-internal/` |

## 维护原则

- `docs/` 根目录只保留入口文档和分类目录
- 研究文档与正式规范分开存放
- 若一份文档开始承担正式规范职责，应从 `90-research/` 移入对应正式目录
- 新增文档后更新本索引
