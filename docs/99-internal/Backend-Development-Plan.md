# Backend Development Plan

本文档用于指导 Blackboard 后端 MVP 的分阶段开发与验收。

当前策略：

- 以 Node.js + TypeScript 实现后端，与前端共用同一 monorepo；
- 将 `mockProtocolServer.ts` 中已验证的业务逻辑直接迁移，不重写；
- 优先打通前端协议接入，再实现 Agent CLI，最后完善 Proceed 真实流程；
- V1 使用内存状态，不引入数据库。

---

## 1. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 与前端共用类型定义，`sessionModel.ts` 可直接复用 |
| 运行时 | Node.js | 同机运行，无需跨语言 RPC |
| HTTP 框架 | Node 内置 `http` 或 `fastify` | 轻量，SSE 支持简单 |
| 状态持久化 | 内存（V1） | 重启丢失 session 在 V1 可接受 |
| 传输协议 | HTTP + SSE | 已在 `Frontend-Backend-Protocol.md` 固定 |
| diff 计算 | `diff` npm 包 | 用于 `candidateContent` → `Change[]` 生成 |

---

## 2. 项目结构

在现有 monorepo 中新增 `apps/backend`：

```
apps/backend/
  src/
    domain/
      session.ts          # BlackboardSession 聚合根与状态机
      workingSet.ts       # WorkingSet 操作
      bullet.ts           # Bullet 生命周期
      reviewChangeSet.ts  # ReviewChangeSet + Change[] 生成
      version.ts          # Version 快照
      markdownParser.ts   # Markdown → DocumentUnit[]（复用前端版本）
    store/
      sessionStore.ts     # 内存 session 状态持久化
    api/
      routes.ts           # HTTP 路由注册
      sseManager.ts       # SSE 连接管理与事件广播
    cli/
      commands.ts         # Agent CLI endpoint 处理
    index.ts              # 入口，启动 HTTP server
  package.json
  tsconfig.json
```

---

## 3. 接口总览

### 3.1 前端 API（对接浏览器）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions/:sessionId/events` | SSE 事件流，连接后立即推送 `session.snapshot` |
| POST | `/api/sessions/:sessionId/commands` | 统一 command 入口 |
| GET | `/api/sessions/:sessionId/history/:versionId` | 历史版本 query |

### 3.2 Agent CLI（对接 subagent）

| 方法 | 路径 | 对应命令 |
|------|------|---------|
| POST | `/cli/sessions` | `create_session` |
| GET | `/cli/sessions/:sessionId/snapshot` | `get_snapshot` |
| POST | `/cli/sessions/:sessionId/bullets/:bulletId/ready` | `mark_bullet_ready` |
| POST | `/cli/sessions/:sessionId/review-candidate` | `submit_review_candidate` |
| POST | `/cli/sessions/:sessionId/close` | `close_session` |

---

## 4. 前端 Commands 与后端行为映射

| Command | 后端行为 | 广播 Events |
|---------|---------|------------|
| `document_unit.edit.commit` | 替换 Markdown 切片，重新解析 `DocumentUnit[]`，生成 `edit bullet` | `document_unit.updated`, `bullet.created`, `session.snapshot` |
| `bullet.comment.create` | 创建 `comment bullet`（状态 `new`） | `bullet.created`, `session.snapshot` |
| `session.proceed` | session 进入 `proceeding`，等待 bullets ready，通知 subagent | `proceed.started`, `proceed.stage_changed`, `proceed.progress_updated` |
| `review.change.accept` | 单个 Change 状态 → `accepted`，若无 pending 则自动结算 | `review.change_status_changed`, `session.snapshot` |
| `review.change.reject` | 单个 Change 状态 → `rejected`，若无 pending 则自动结算 | `review.change_status_changed`, `session.snapshot` |
| `review.accept_all_remaining` | 批量 `accepted`，立即结算 | `review.resolved`, `session.snapshot` |
| `review.reject_all_remaining` | 批量 `rejected`，立即结算 | `review.resolved`, `session.snapshot` |
| `history.restore_version` | 重建 `WorkingSet`，清空 `activeBullets` | `working_set.rebased`, `session.snapshot` |
| `session.request_close` | 记录关闭意图，等待 subagent 调用 `close_session` | （无，等待 CLI 触发） |

---

## 5. Agent CLI 命令与后端行为映射

| CLI 命令 | 输入 | 后端行为 | 广播 Events |
|---------|------|---------|------------|
| `create_session` | `title`, `initialContent` | 创建 `BlackboardSession` + `WorkingSet`，解析初始 `DocumentUnit[]` | `session.snapshot` |
| `get_snapshot` | `sessionId` | 返回当前完整 snapshot（不广播） | — |
| `mark_bullet_ready` | `sessionId`, `bulletId` | `Bullet.status: processing → ready` | `bullet.status_changed` |
| `submit_review_candidate` | `sessionId`, `candidateContent` | 生成 `ReviewChangeSet` + `Change[]`，session → `reviewing` | `review_change_set.created`, `session.snapshot` |
| `close_session` | `sessionId` | session → `closed` | `session.closed`, `session.snapshot` |

---

## 6. 核心业务逻辑说明

### 6.1 Markdown → DocumentUnit[] 解析

- 复用 `apps/frontend/src/app/markdownDocument.ts`（直接引用或复制）
- 每次 `document_unit.edit.commit` 后重新解析整篇 Markdown
- `unitId` 在同一 `workingSetRevision` 内稳定，重新解析后不保证旧 `unitId` 有效

### 6.2 Change[] 生成（submit_review_candidate 触发）

1. 取 `WorkingSet.currentContent` 为基底
2. 取 `candidateContent` 为候选
3. 按 `DocumentUnit` 粒度对齐两份内容
4. 对每个变化的 unit 做段内 diff（使用 `diff` 包）
5. 将原子差异合并为适合人类审阅的 `Change`（`insert` / `delete` / `replace`）
6. `startOffset` / `endOffset` 相对于基底 unit 文本，半开区间 `[start, end)`
7. `beforeText` 必须等于基底 unit 在该区间的原文本

### 6.3 Review 结算规则

- 最后一个 `pending` Change 消失时，后端**自动**触发结算
- 若存在至少一个 `accepted` Change：生成新 `Version`，广播 `version.created`
- 若全部 `rejected`：回退到原 `WorkingSet`，不生成新版本
- 结算后广播 `review.resolved`，session 回到 `active`

### 6.4 Proceed 流程

```
session.proceed command
  → session.status = proceeding
  → 广播 proceed.started
  → 等待所有 activeBullets 变为 ready
  → 广播 proceed.stage_changed (resolving_bullets → synthesizing_changes → materializing_review)
  → 通知 subagent 执行统合（subagent 调用 submit_review_candidate）
  → 收到 candidateContent → 生成 ReviewChangeSet + Change[]
  → session.status = reviewing
  → 广播 review_change_set.created, session.snapshot
```

### 6.5 SSE 管理规则

- 连接建立时立即推送 `session.snapshot`
- 断线重连后再次推送完整 `session.snapshot`
- 同一 sessionId 的所有连接都收到广播（V1 实际只有一个客户端）
- 连接关闭时从客户端集合中移除

---

## 7. 错误处理

| 错误码 | HTTP 状态 | 触发场景 |
|--------|----------|---------|
| `INVALID_STATE` | 409 | 当前状态不允许该操作 |
| `REVISION_MISMATCH` | 409 | `workingSetRevision` 不匹配 |
| `PROCEED_IN_PROGRESS` | 409 | 已在 proceeding，不允许再次发起 |
| `REVIEW_NOT_OPEN` | 409 | 不存在可操作的 ReviewChangeSet |
| `SESSION_CLOSED` | 409 | 会话已关闭 |
| `NOT_FOUND` | 404 | session / bullet / version 不存在 |
| `INTERNAL_ERROR` | 500 | 后端内部异常 |

Command 成功响应格式：
```json
{ "ok": true, "commandId": "cmd_xxx", "acceptedAt": "..." }
```

错误响应格式：
```json
{ "ok": false, "error": { "code": "...", "message": "...", "recoverable": true } }
```

---

## 8. 阶段总览

| 阶段 | 名称 | 目标 | 状态 |
|------|------|------|------|
| 1 | 骨架搭建 | 后端可启动，前端可连接 | todo |
| 2 | Agent CLI | 5 个 CLI 命令可用 | todo |
| 3 | Proceed 真实流程 | 对接 subagent 统合流程 | todo |
| 4 | 持久化（可选） | SQLite 持久化 session | todo |

---

## 9. 阶段 1：骨架搭建

### 目标

后端可启动，前端默认模式连接真实后端，跑通完整的 edit → proceed → review → accept 流程。

### 任务

- 创建 `apps/backend/`，配置 TypeScript 与 package.json
- 实现 HTTP server（端口 `3001`）
- 实现 SSE manager（连接管理、事件广播）
- 将 `mockProtocolServer.ts` 中的业务逻辑迁移到 `domain/` 层
- 实现三个前端 API endpoint
- 前端 `apiClient.ts` 中的 base URL 指向 `http://localhost:3001`

### 验收标准

- `pnpm --filter @blackboard/backend dev` 可启动后端
- 前端默认模式（不带 `?transport=fixture`）可连接后端
- edit、comment、proceed、review accept/reject、history restore、close 流程可跑通
- `?transport=fixture` 仍可回退到 mock 模式

---

## 10. 阶段 2：Agent CLI

### 目标

5 个 Agent CLI 命令可用，subagent 可通过 HTTP 调用创建和管理 session。

### 任务

- 实现 `POST /cli/sessions`（`create_session`）
  - 接收 `title`、`initialContent`
  - 解析 `DocumentUnit[]`
  - 返回 `sessionId`
  - 广播 `session.snapshot`
- 实现 `GET /cli/sessions/:sessionId/snapshot`（`get_snapshot`）
  - 返回完整 snapshot，不广播
- 实现 `POST /cli/sessions/:sessionId/bullets/:bulletId/ready`（`mark_bullet_ready`）
  - `Bullet.status: processing → ready`
  - 广播 `bullet.status_changed`
- 实现 `POST /cli/sessions/:sessionId/review-candidate`（`submit_review_candidate`）
  - 接收 `candidateContent`
  - 生成 `ReviewChangeSet` + `Change[]`（diff 计算）
  - session → `reviewing`
  - 广播 `review_change_set.created`、`session.snapshot`
- 实现 `POST /cli/sessions/:sessionId/close`（`close_session`）
  - session → `closed`
  - 广播 `session.closed`、`session.snapshot`

### 验收标准

- 可通过 curl 或测试脚本调用所有 5 个 CLI 命令
- `create_session` 后前端可通过 SSE 收到 `session.snapshot` 并渲染页面
- `submit_review_candidate` 后前端进入 reviewing 状态，Change[] 正确生成
- `close_session` 后前端进入 closed 状态

---

## 11. 阶段 3：Proceed 真实流程

### 目标

`session.proceed` command 触发后，后端正确等待 bullets ready，并通知 subagent 执行统合。

### 任务

- 实现 bullet 状态自动推进：`new → processing`（收到 bullet 后自动）
- 实现 Proceed 等待逻辑：等待所有 `activeBullets` 变为 `ready`
- 实现阶段广播：`resolving_bullets → synthesizing_changes → materializing_review`
- 实现 subagent 通知机制（通过事件队列或回调）
- 联调：subagent 收到通知 → 调用 `submit_review_candidate` → 前端进入 reviewing

### 验收标准

- 有 bullet 时，Proceed 等待所有 bullet ready 后才进入统合阶段
- 无 bullet 时，Proceed 直接进入统合阶段（subagent 提交空改动或最小改动）
- 前端 proceeding overlay 的三个阶段按顺序展示
- 联调流程：前端点击 Proceed → subagent 统合 → 前端进入 reviewing

---

## 12. 阶段 4：持久化（可选）

### 目标

后端重启后 session 状态不丢失。

### 说明

V1 内存状态已足够支撑开发与演示。只有在以下场景才需要持久化：

- 需要跨进程重启保留 session
- 需要多个 session 并发运行且不能丢失

### 方案

使用 SQLite（通过 `better-sqlite3`），存储：

- `BlackboardSession` 基本信息
- `WorkingSet.currentContent`
- `Bullet[]`
- `Version[]`
- `ReviewChangeSet`（若存在）

`DocumentUnit[]` 不持久化，每次从 Markdown 重新派生。

---

## 13. 与 mock server 的关系

`apps/frontend/mockProtocolServer.ts` 继续保留，但职责收窄为：

- 仅在 `?transport=fixture` 模式下使用
- 用于前端组件开发和 e2e 测试时不依赖后端
- 不再扩展新功能

后端开发完成后，前端默认模式直接连真实后端，mock 退化为纯测试工具。

---

## 14. 与其他文档的关系

| 文档 | 关系 |
|------|------|
| `docs/03-contracts/Frontend-Backend-Protocol.md` | 定义前端 API 的 endpoint、envelope、error 格式，后端必须严格遵守 |
| `docs/03-contracts/Agent-CLI.md` | 定义 5 个 CLI 命令的语义、输入输出与副作用 |
| `docs/02-models/Domain-Model.md` | 定义后端业务对象与不变量 |
| `docs/01-product/Product-Interaction-State-Machine.md` | 定义 session 状态迁移规则 |
| `docs/99-internal/Frontend-Development-Plan.md` | 前端开发计划，后端阶段 1 完成后前端阶段 6 可切换到真实后端 |
