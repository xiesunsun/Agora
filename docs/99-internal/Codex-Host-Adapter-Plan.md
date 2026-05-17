# Codex Host Adapter Plan

## 1. Goal

本文档定义要如何把当前 blackboard 项目从“backend 打印 turn message + 人工 relay”推进到文档要求的正式执行模型：

* 同一 blackboard session 绑定同一个 `subagent thread`
* 宿主以串行事件队列方式逐回合交付事件
* 常规事件交付不再依赖人工复制粘贴

目标不是重写 backend / frontend 协议，而是补上当前缺失的 **host adapter**。

---

## 2. 结论先行

当前缺的不是产品定义，也不是 `Codex` 能力。

当前缺的是一层明确实现：

* backend 负责产生 blackboard 业务事件
* host adapter 负责把这些事件送进同一个 `subagent thread`
* adapter 使用当前 Codex 宿主提供的等价控制能力
  当前环境下优先按：
  * `spawn_agent`
  * `send_input`
  * `wait_agent`
  * agent completion notification
  来实现

对本文而言：

* `send_input(target=subagentThreadId, ...)` 是当前环境里 `turn/start(threadId=...)` 的操作等价物
* `wait_agent(targets=[subagentThreadId], ...)` + 回合义务校验，是当前环境里 `turn/completed` 判定的操作等价物

---

## 3. Non-Goals

当前阶段不做：

* 多个 `subagent` 协同同一 session
* backend 直接调用 Codex 内部控制面
* 恢复 backend 重启后的完整 worker 续跑能力
* 把 `subagent` 本地工作区变成 backend 正式状态

---

## 4. Required End State

打通后，完整链路必须收敛为：

1. `main agent` 判断进入 blackboard collaboration
2. `main agent` 启动专用 `blackboard-worker`
3. worker 启动回合完成 `create_session + get_snapshot`
4. `main agent` 从 worker 启动结果中拿到：
   * `sessionId`
   * `frontendUrl`
   * `subagentThreadId`
5. 宿主将 `subagentThreadId` 持久化到 backend session
6. 用户在 frontend 中编辑 / 批注 / Proceed / close
7. backend 产生 dispatch event
8. host adapter 自动把该 event 投递到同一个 `subagentThreadId`
9. adapter 等待该回合完成，并校验强制工具动作已完成
10. 只有在当前事件 handled 后，adapter 才能继续下一个事件

如果第 8 步仍要靠人工复制粘贴，则此功能未打通。

---

## 5. Adapter Responsibilities

host adapter 必须承担以下职责：

### 5.1 Session bootstrap

* 接收 `main agent` 的 handoff 请求
* 调用 `spawn_agent(agent_type="blackboard-worker")`
* 记录返回的 `agent_id` 作为 `subagentThreadId`
* 等待 worker 启动回合返回
* 解析启动返回中的 `sessionId` 与 `frontendUrl`
* 调用 `POST /cli/sessions/:id/thread` 写回 `subagentThreadId`

### 5.2 Event intake

* 从 backend 读取当前 session 的 dispatch queue
* 读取单位是“一个事件”
* 保证同一 session 同时只有一个 in-flight event

### 5.3 Event delivery

* 将 backend event 格式化为 `subagent` prompt contract 要求的 turn message
* 调用当前 Codex 宿主控制能力把消息投递到 `subagentThreadId`
* 当前环境下优先实现为：
  * `send_input(target=subagentThreadId, message=...)`

### 5.4 Completion boundary

* 等待 worker 当前回合结束
* 结合 backend snapshot / 状态校验本回合的强制工具动作确已发生：
  * `comment bullet` → bullet status 至少到 `ready`
  * `Proceed` → session 进入 `reviewing`
  * `close` → session 进入 `closed`
* 未完成则不得 ack 当前事件

### 5.5 Queue advancement

* 当前事件 handled 前，不投递后续事件
* 失败时保留事件，标记 retryable / terminal

---

## 6. Placement

host adapter 不应放进 backend 业务进程内部直接调用。

原因：

* backend 是业务真相持有者，不是 Codex 宿主控制面
* `spawn_agent` / `send_input` / `wait_agent` 属于宿主层能力
* backend 直接耦合宿主工具会混淆业务层与执行层

推荐放置方式：

* 一个 repo 内的宿主执行模块
* 运行在 Codex 宿主工具可用的环境中
* 可读 backend queue，可调用 Codex host controls

建议目录：

* `apps/host-adapter/`

---

## 7. Backend Changes Required

当前 backend 已经能：

* 创建 session
* 记录 `subagentThreadId`
* 产生 dispatchable events

但为了让 adapter 正式接线，还需要把“打印日志 + jsonl 文件”升级为显式 queue contract。

### 7.1 Replace stdout-only dispatch with typed queue state

新增内存级 dispatch event store：

* 每个 session 一条串行事件队列
* 每个 event 至少包含：
  * `eventId`
  * `sessionId`
  * `eventType`
  * `message`
  * `occurredAt`
  * `deliveryStatus`
    * `pending`
    * `delivering`
    * `handled`
    * `failed`

### 7.2 CLI endpoints for adapter

建议新增：

* `GET /cli/sessions/:id/dispatch-events?status=pending`
  返回当前可交付事件
* `POST /cli/sessions/:id/dispatch-events/:eventId/claim`
  将事件标为 `delivering`
* `POST /cli/sessions/:id/dispatch-events/:eventId/complete`
  将事件标为 `handled`
* `POST /cli/sessions/:id/dispatch-events/:eventId/fail`
  将事件标为 `failed`，附带错误信息

保留 stdout 打印仅作为调试镜像，不再作为正式交付路径。

### 7.3 Validation helpers

为 adapter completion 校验提供稳定查询来源：

* `GET /cli/sessions/:id/snapshot`
* 必要时补充更细粒度的 queue / proceeding / close state 查询

---

## 8. Adapter Runtime Flow

### 8.1 Startup flow

1. `main agent` 调 adapter：开始一场 blackboard session
2. adapter `spawn_agent(blackboard-worker)`
3. adapter 等待启动结果
4. adapter 解析 `sessionId`
5. adapter `POST /cli/sessions/:id/thread`
6. adapter 返回 `frontendUrl` 给 `main agent`

### 8.2 Event loop

1. adapter 轮询或订阅 dispatch queue
2. 取一个 `pending` event
3. `claim`
4. `send_input(target=subagentThreadId, message=event.message)`
5. 等待该 worker 回合结束
6. 校验该事件的回合义务
7. 成功则 `complete`
8. 失败则 `fail`
9. 继续下一个事件

### 8.3 Close flow

1. close event 入队
2. adapter 投递给同一 worker
3. 等待 worker 写 `summary.md` + 调 `close_session`
4. adapter 校验 session 已关闭
5. adapter 取回 worker close summary
6. 回传给 `main agent`

---

## 9. Queue Semantics

当前阶段必须明确：

* queue 是 per-session 的
* `subagentThreadId` 是 per-session 的
* 同一 session 同时最多一个 delivering event
* 不允许两个 event 并发投给同一 worker
* adapter 是 queue owner，不是 backend

---

## 10. Failure Handling

### 10.1 Worker delivery failure

若 `send_input` 或等待回合失败：

* 不推进后续事件
* 当前 event 标为 `failed`
* session 标记 host intervention required

### 10.2 Obligation missing

若 worker 回合结束但强制工具动作未完成：

* 当前 event 不得标记 handled
* 记录 obligation mismatch
* 允许有限重试，超过阈值转人工介入

### 10.3 Backend restart

V1 接受：

* `subagentThreadId` 丢失后需重新注册
* in-memory dispatch queue 丢失后该 session 进入 broken state

这不影响当前“先打通主链路”的目标。

---

## 11. Implementation Order

### Phase A: backend queue contract

1. 引入显式 dispatch event store
2. 新增 queue CLI endpoints
3. 让 `hostDispatcher.ts` 同时写正式 queue 状态

### Phase B: host adapter skeleton

1. 新建 `apps/host-adapter/`
2. 实现 startup flow
3. 实现 event polling + claim + complete

### Phase C: same-thread delivery

1. 用当前 Codex 宿主等价能力实现 direct delivery
2. 优先按 `send_input(target=subagentThreadId, ...)`
3. 以 `wait_agent` / completion notification 做 handled 边界

### Phase D: obligation verification

1. `comment bullet` 校验 `ready`
2. `Proceed` 校验 `reviewing`
3. `close` 校验 `closed`

### Phase E: end-to-end validation

1. create session
2. comment bullet
3. proceed
4. review
5. close

整条链路不允许任何人工复制 turn message。

---

## 12. Acceptance Criteria

只有同时满足以下条件，才算“宿主直投层已打通”：

* worker 启动后获得真实 `sessionId` 与 `frontendUrl`
* `subagentThreadId` 被写回 backend session
* dispatch event 自动投递到同一 worker
* 同一 session 的事件严格串行
* `comment bullet` / `Proceed` / `close` 的强制工具动作被自动校验
* 整个 create -> collaborate -> close 循环中不需要人工复制 relay message

---

## 13. Immediate Repo Tasks

当前应立即创建以下任务：

1. backend dispatch queue 正式化
2. host adapter 目录与最小运行骨架
3. startup flow 自动写回 `subagentThreadId`
4. same-thread `send_input` 交付实现
5. obligation verification
6. 端到端自动验证
