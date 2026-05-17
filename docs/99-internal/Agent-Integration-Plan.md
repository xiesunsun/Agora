# Agent 接入开发方案（阶段 2）

本文档定义将 Codex subagent 接入 Blackboard 后端的开发方案。

当前阶段目标：让一个完整的 human-agent 协作循环端到端跑通：
**前端编辑/批注 → Proceed → Codex 统合 → Review → 接受/拒绝 → 新版本**

---

## 1. 背景与现状

### 1.1 已完成（阶段 1）

- 前端通过 HTTP commands + SSE events 与后端联调
- 编辑、批注、Proceed（mock）、Review、History、Close 流程可跑通
- Proceed 后的候选内容是后端自动 mock 的（修改第一段），不是真实 Agent 生成

### 1.2 本阶段要解决的问题

- 实现后端 CLI 接口，让 Codex subagent 可以通过 HTTP 操作 session
- 实现宿主事件交付机制，让 Codex 能收到 session 事件并处理
- 编写 subagent prompt，让 Codex 知道如何扮演 blackboard subagent 角色
- 用真实 Codex 替换 mock 的 Proceed 流程

### 1.3 事件交付模型（来自文档）

按 `Collaboration-Skill-Spec.md` 第 3.7 节的定义：

> 宿主每次只向当前 subagent 交付一个 blackboard 事件；subagent 围绕该事件完成本地思考、文件更新与必要工具调用；当该次回答回合收到 turn/completed 时，当前事件才视为处理完成。

旧的人工 relay 只可作为一次性 bootstrap 调试路径，不是目标实现。

当前项目目标应改为：

* 宿主 adapter 自动接收 backend dispatch event
* 宿主 adapter 自动把事件投递到同一个 `subagent thread`
* 宿主 adapter 自动等待并校验回合义务

具体方案见：

* `docs/99-internal/Codex-Host-Adapter-Plan.md`

---

## 2. 需要实现的内容

### 2.1 后端 CLI 接口（5 个）

新增路由前缀 `/cli/`，与前端 API `/api/` 分离。

| 方法 | 路径 | 对应命令 | 触发时机 |
|------|------|---------|---------|
| POST | `/cli/sessions` | `create_session` | subagent 启动回合 |
| GET | `/cli/sessions/:id/snapshot` | `get_snapshot` | subagent 需要确认当前状态 |
| POST | `/cli/sessions/:id/bullets/:bulletId/ready` | `mark_bullet_ready` | subagent 处理完一条 bullet |
| POST | `/cli/sessions/:id/review-candidate` | `submit_review_candidate` | subagent 完成统合 |
| POST | `/cli/sessions/:id/close` | `close_session` | subagent 完成收尾 |

**各接口详细说明：**

`POST /cli/sessions`
```json
// 请求
{ "title": "文稿标题", "initialContent": "# 标题\n\n正文..." }
// 响应
{ "sessionId": "demo", "ok": true }
```
副作用：创建 BlackboardSession，广播 `session.snapshot`

`GET /cli/sessions/:id/snapshot`
```json
// 响应：完整 SessionSnapshot，不广播
```

`POST /cli/sessions/:id/bullets/:bulletId/ready`
```json
// 请求：无 body
// 响应：{ "ok": true }
```
副作用：`Bullet.status: processing → ready`，广播 `bullet.status_changed`

`POST /cli/sessions/:id/review-candidate`
```json
// 请求
{ "candidateContent": "# 标题\n\n修改后的正文..." }
// 响应：{ "ok": true }
```
副作用：生成 `ReviewChangeSet` + `Change[]`，session → reviewing，广播 `review_change_set.created`

`POST /cli/sessions/:id/close`
```json
// 请求：无 body
// 响应：{ "ok": true }
```
副作用：session → closed，广播 `session.closed`

### 2.2 移除 Proceed mock

当前 `startProceedFlow` 里有一个 1550ms 后自动生成候选内容的 setTimeout。
接入真实 Agent 后，这个 mock 需要移除，改为等待 subagent 调用 `submit_review_candidate`。

但在 subagent prompt 写好并验证之前，保留 mock 作为 fallback（可通过环境变量控制）。

### 2.3 Bullet 状态自动推进

当前 bullet 创建后状态是 `new`，没有自动推进到 `processing`。
按文档：`new → processing` 由 runtime/backend 自动推进，`processing → ready` 由 subagent 显式调用。

需要在 bullet 创建后自动将其推进到 `processing` 并广播 `bullet.status_changed`。

### 2.4 Subagent Prompt

按 `Collaboration-Skill-Spec.md` 第 8 节的 handoff 结构编写，存放在 `docs/05-agent/subagent-prompt.md`。

核心内容：
- 角色：你是 blackboard subagent
- 工具：通过 HTTP 调用 `http://localhost:3001/cli/...`
- 工作区：维护 `mainAgentInfo.md`、`sessionDocument.md`、`summary.md`
- 回合义务：comment bullet 回合必须调用 `mark_bullet_ready`，Proceed 回合必须调用 `submit_review_candidate`

### 2.5 宿主事件队列（正式实现）

V1 需要自动化的宿主 adapter，而不是长期停留在人工 relay。

宿主 adapter 负责：

1. 从 backend 获取当前 session 的 dispatch event
2. 使用当前 Codex 宿主控制能力把该 event 投给同一个 `subagent thread`
3. 等待该回合结束
4. 校验强制工具动作已完成
5. 只有当前事件 handled 后才交付下一个事件

---

## 3. 开发顺序

### 阶段 2-A：CLI 接口实现（优先）

**任务：**
1. 新建 `apps/backend/src/cliRoutes.ts`，实现 5 个 CLI endpoint
2. 在 `index.ts` 里注册 CLI 路由（`/cli/` 前缀）
3. 实现 bullet `new → processing` 自动推进
4. 移除或条件化 Proceed mock（默认保留，`DISABLE_PROCEED_MOCK=true` 时关闭）

**验收：**
- `curl -X POST http://localhost:3001/cli/sessions -d '{"title":"test","initialContent":"# Test\n\nHello"}'` 返回 sessionId
- `curl http://localhost:3001/cli/sessions/demo/snapshot` 返回完整 snapshot
- 前端创建 bullet 后，`curl -X POST .../bullets/:id/ready` 能将其推进到 ready
- `curl -X POST .../review-candidate -d '{"candidateContent":"..."}'` 能触发前端进入 reviewing

### 阶段 2-B：Subagent Prompt 编写

**任务：**
1. 编写 `docs/05-agent/subagent-prompt.md`
2. 包含完整的 role contract、工具调用说明、回合义务
3. 包含具体的 HTTP 调用示例（curl 格式）

**验收：**
- 把 prompt 发给 Codex，Codex 能正确调用 `create_session` 并返回 sessionId
- Codex 能根据 snapshot 内容理解当前 bullets

### 阶段 2-C：端到端联调（人工 bootstrap）

**任务：**
1. 启动后端 + 前端
2. 用 Codex 扮演 subagent，手动走完一个完整循环：
   - Codex 调用 `create_session`
   - 前端显示文稿
   - 用户创建 comment bullet
   - 你把 bullet 事件发给 Codex
   - Codex 调用 `mark_bullet_ready`
   - 用户点击 Proceed
   - 你把 Proceed 事件发给 Codex
   - Codex 调用 `submit_review_candidate`（提交真实修改内容）
   - 前端进入 reviewing，显示真实 diff
   - 用户 accept/reject
   - 前端回到 active，生成新版本

**验收：**
- 完整循环跑通一次
- Review 里的 Change 内容是 Codex 真实生成的，不是 mock

说明：

* 这一阶段只允许作为 bootstrap 验证，不是目标终态
* 完成后必须继续进入 host adapter 自动化阶段

### 阶段 2-D：Host Adapter 自动化

**任务：**
1. 将 backend dispatch 事件正式化为可消费队列
2. 实现 host adapter startup flow
3. 实现基于同一 `subagentThreadId` 的自动事件投递
4. 实现 handled 边界校验
5. 去掉人工复制 relay message 的依赖

**验收：**
- backend event 自动进入同一 worker thread
- `comment bullet`、`Proceed`、`close` 不需要人工 relay
- 同一 session 事件严格串行
- 端到端 create -> collaborate -> close 自动跑通

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/backend/src/cliRoutes.ts` | 新建 | 5 个 CLI endpoint |
| `apps/backend/src/routes.ts` | 修改 | bullet 自动推进到 processing；条件化 mock |
| `apps/backend/src/index.ts` | 修改 | 注册 CLI 路由 |
| `docs/05-agent/subagent-prompt.md` | 新建 | Codex subagent 的完整 prompt |
| `docs/99-internal/Backend-Development-Plan.md` | 更新 | 标记阶段 2 进度 |

---

## 5. 关键约束（来自文档）

- **CLI 接口只供 subagent 调用**，不暴露给前端
- **`submit_review_candidate` 只接收 `candidateContent`**，不接收 diff 或 BulletResolution
- **后端负责 diff 计算**，生成 `Change[]`
- **`close_session` 才是正式关闭的唯一入口**，前端的 `session.request_close` 只是请求
- **subagent 本地工作区（`sessionDocument.md` 等）不是后端状态**，后端不读取这些文件

---

## 6. 与其他文档的关系

| 文档 | 关系 |
|------|------|
| `docs/03-contracts/Agent-CLI.md` | 定义 5 个 CLI 命令的完整语义，本方案严格遵守 |
| `docs/05-agent/Collaboration-Skill-Spec.md` | 定义 subagent prompt 的结构和回合义务 |
| `docs/05-agent/Host-Execution-Design.md` | 定义宿主事件交付模型（一事件一回合） |
| `docs/99-internal/Codex-Host-Adapter-Plan.md` | 定义宿主直投层的正式实现方案 |
| `docs/99-internal/Backend-Development-Plan.md` | 本方案是其阶段 2 的细化 |
