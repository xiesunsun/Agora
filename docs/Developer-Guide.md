# 开发者指南

本文档为不同角色的开发者提供快速入门指引。

## 我是产品/设计理解者

快速理解产品是什么、做什么：

1. [Product-Overview.md](01-product/Product-Overview.md) — 产品全局视图（10 分钟）
2. [PRD.md](01-product/PRD.md) — 完整产品需求
3. [Feature-Spec.md](01-product/Feature-Spec.md) — 交互规格
4. [Domain-Model.md](02-models/Domain-Model.md) — 核心领域对象

## 我是前端开发者

前端开发需要理解的核心约束：

### 必读文档

1. [Product-Overview.md](01-product/Product-Overview.md) — 理解产品
2. [Domain-Model.md](02-models/Domain-Model.md) — 核心业务对象
3. [Document-Presentation-Model.md](02-models/Document-Presentation-Model.md) — Markdown 到 DocumentUnit 的派生规则
4. [Frontend-Backend-Protocol.md](03-contracts/Frontend-Backend-Protocol.md) — 前后端协议（HTTP commands + SSE events）
5. [Schema-Appendix.md](03-contracts/Schema-Appendix.md) — 所有 schema 的 TypeScript 定义
6. [UI-Structure.md](04-design/UI-Structure.md) — 页面结构原则
7. [Visual-Reference.md](04-design/Visual-Reference.md) — 视觉原型参考

### 关键实现约束

- **传输模型**：HTTP commands（前端→后端）+ SSE events（后端→前端），不使用 WebSocket
- **内容真相**：Markdown 是唯一文档真相，DocumentUnit[] 是派生结构
- **页面模板**：固定 `document` 模板，不是多面板工作台
- **编辑模型**：用户编辑 DocumentUnit 后，backend 替换源码切片并重新解析
- **审阅模型**：Flow Review 与 PR Review 共享同一份 ReviewChangeSet
- **状态管理**：顶层页面只持有改变整页交互边界的状态

### 目标代码位置

```
apps/frontend/
  src/app/       — session store、selector、api client、event source
  src/components/ — 渲染、局部交互、局部视觉组织
```

## 我是后端开发者

后端开发需要理解的核心约束：

### 必读文档

1. [Product-Overview.md](01-product/Product-Overview.md) — 理解产品
2. [Domain-Model.md](02-models/Domain-Model.md) — 核心业务对象与不变量
3. [Product-Interaction-State-Machine.md](01-product/Product-Interaction-State-Machine.md) — 状态机定义
4. [Frontend-Backend-Protocol.md](03-contracts/Frontend-Backend-Protocol.md) — 前后端协议
5. [Agent-CLI.md](03-contracts/Agent-CLI.md) — Agent CLI 命令语义
6. [Schema-Appendix.md](03-contracts/Schema-Appendix.md) — 所有 schema 定义
7. [Markdown-Rendering-Contract.md](03-contracts/Markdown-Rendering-Contract.md) — Markdown 渲染契约

### 关键实现约束

- **业务真相**：backend 持有 WorkingSet.currentContent、Bullet、ReviewChangeSet、Version 等业务状态
- **状态机**：4 个后端生命周期状态（active/proceeding/reviewing/closed）；history_preview 是前端本地 view mode
- **自动结算**：当最后一个 pending change 消失时，backend 必须自动结算 review
- **并发守卫**：使用 workingSetRevision 防止基于过期现场的操作
- **版本生成**：只有至少存在一个 accepted change 时才生成新 Version

### 目标代码位置

```
apps/backend/
  src/domain/  — session state machine、业务规则
  src/store/   — repository interface、persistence
  src/routes/  — 协议映射、输入校验、响应编码
packages/schema/          — schema、enum、error code
packages/document-model/  — Markdown 单元派生与文档编辑纯函数
packages/review-model/    — ReviewChangeSet 结算纯函数
```

## 我是 Agent 开发者

Agent 开发需要理解的核心约束：

### 必读文档

1. [Product-Overview.md](01-product/Product-Overview.md) — 理解产品
2. [Agent-CLI.md](03-contracts/Agent-CLI.md) — CLI 命令定义
3. [Collaboration-Skill-Spec.md](05-agent/Collaboration-Skill-Spec.md) — 统一 Skill 定义
4. [Host-Execution-Design.md](05-agent/Host-Execution-Design.md) — 宿主执行层设计
5. [Harness-Engineering-Design.md](05-agent/Harness-Engineering-Design.md) — 工程治理设计

### 关键实现约束

- **执行模型**：单一 subagent 托管单一 session，串行事件队列
- **CLI 命令**：create_session、get_snapshot、mark_bullet_ready、submit_review_candidate、close_session
- **本地工作区**：mainAgentInfo.md、sessionDocument.md、summary.md 是最小稳定锚点
- **回合结束义务**：comment bullet → mark_bullet_ready；Proceed → submit_review_candidate；close → summary.md + close_session
- **工作区失效**：用户恢复历史版本后，必须丢弃旧草稿并重新 get_snapshot

### 目标代码位置

```
packages/agent-cli/
  src/commands/ — 任务级命令封装、面向 subagent 的高层业务命令
```

## 核心技术决策速查

| 决策 | 选择 | 详见 |
|-----|------|------|
| 传输模型 | HTTP commands + SSE events | [Frontend-Backend-Protocol.md](03-contracts/Frontend-Backend-Protocol.md) |
| 内容真相 | Markdown（非 HTML） | [Document-Presentation-Model.md](02-models/Document-Presentation-Model.md) |
| 页面模板 | 固定 document 模板 | [Document-Template-Contract.md](03-contracts/Document-Template-Contract.md) |
| 依赖方向 | shared ← backend/agent-cli/frontend | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| 审阅模型 | Flow Review + PR Review 共享 ReviewChangeSet | [Feature-Spec.md](01-product/Feature-Spec.md) |
| Agent 执行 | 单一 subagent + 串行事件队列 | [Host-Execution-Design.md](05-agent/Host-Execution-Design.md) |
| 并发控制 | workingSetRevision 守卫 | [Schema-Appendix.md](03-contracts/Schema-Appendix.md) |

## 开发环境

```bash
# 安装依赖（使用 Corepack + pnpm）
corepack pnpm install

# 运行测试
corepack pnpm test
corepack pnpm test:backend

# 完整 MVP 自动化验证
corepack pnpm run harness:check
corepack pnpm run test:all
corepack pnpm run typecheck:all
corepack pnpm run build:all
corepack pnpm e2e

# 运行 harness 检查
corepack pnpm run harness:report
corepack pnpm run harness:check
corepack pnpm run harness:arch
corepack pnpm run harness:naming
corepack pnpm run harness:boundary
```

## 完整文档索引

见 [docs/README.md](README.md)
