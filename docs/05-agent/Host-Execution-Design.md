# Subagent Host Execution Design

## 1. 文档目标

本文档定义 MVP 阶段 blackboard `subagent` 的宿主执行层设计。

本文档重点回答以下问题：

* 当实际执行者是 `Codex` 时，`main agent`、宿主、`subagent`、backend、frontend 如何接线；
* `subagent` 在自己的私有工作区中必须维护哪些稳定文件；
* session 事件如何交付给单一 `subagent`；
* `subagent` 针对不同事件类型如何完成一个处理回合；
* 当前阶段哪些内容是稳定执行合同，哪些内容仍是后续可细化实现。

本文档当前不展开：

* backend / frontend 的业务协议细节；
* Agent CLI 的命令字段定义；
* `Codex App Server` 的逐字段 schema 细节；
* 多 worker、接管、迁移或恢复机制。

---

## 2. 设计边界

### 2.1 本文只覆盖一段生命周期

本文只覆盖以下执行路径：

1. `main agent` 形成 handoff；
2. `main agent` 启动单一原生 `subagent`；
3. 宿主持久化该 `subagent` 的 `threadId`；
4. `subagent` 将 handoff 落为 `mainAgentInfo.md`；
5. `subagent` 创建并持续托管 blackboard session；
6. 宿主通过 `subagent threadId` 逐回合交付 session 事件；
7. `subagent` 在自己的会话目录中处理事件、调用 CLI、维护本地工作区；
8. 会话正式关闭后，`subagent` 形成 `summary.md` 并回传给 `main agent`。

### 2.2 本文不重写产品协议

本文不是产品协议替身。

以下内容仍以既有稳定文档为准：

* blackboard 业务对象与状态机
* frontend / backend 协议
* Agent CLI 命令语义
* Blackboard Collaboration Skill 的角色合同与 handoff 合同

本文只负责把这些稳定定义接成一个可执行的宿主运行模型。

---

## 3. 核心参与方

### 3.1 `main agent`

`main agent` 是总任务 owner。

它在本文中的职责是：

* 判断当前任务是否需要进入 blackboard collaboration；
* 组织并显式写出对 `subagent` 的 handoff；
* 启动 blackboard 专用 `subagent`；
* 在会话关闭后接收 `subagent` 的最终总结与结果；
* 基于回传结果继续推进上层任务。

`main agent` 不负责：

* 长时间驻留 blackboard session 内处理细粒度事件；
* 直接维护 `subagent` 的本地工作区；
* 在每次 `Proceed` 后亲自统合候选正文。
* 手工将后续 blackboard 事件转写为普通聊天消息再发送给 `subagent`。

### 3.2 宿主

本文中的宿主特指 `Codex` 运行时与其 `Codex App Server` 控制面。

宿主在本文中的职责是：

* 让 `main agent` 启动一个原生 `subagent`；
* 持久化该 `subagent` 的 `threadId`；
* 通过 `Codex App Server` 对该 `threadId` 执行 `thread/read`、`thread/resume`、`turn/start` 与必要时的 `turn/steer`；
* 在 `thread/start` / `thread/resume` 时向 `subagent` 注入当前会话的 `backendUrl`、`frontendUrl` 与 `workspaceRoot`；
* 为该 `subagent` 提供私有会话目录；
* 为当前 session 维护串行事件队列；
* 每次只向该 `subagent thread` 交付一个当前事件；
* 只有在收到 `turn/completed` 后，才允许交付下一个事件；
* 在会话关闭后，将 `subagent` 的最终结果回传给 `main agent`。

说明：

* 这里的 `Codex App Server` / `turn/start(threadId=...)` 表示宿主控制面的概念能力；
* 在实际 Codex 环境中，等价能力也可能通过 `spawn_agent`、`send_input`、`wait_agent`、agent 通知等宿主工具暴露；
* 这些控制能力属于宿主层，不属于 blackboard backend 进程本身。
* 在当前实现中，后续 blackboard 事件的 direct-to-thread 投递由 host-adapter 事件循环执行，而不是由 `main agent` 在普通聊天流中手工转发。

宿主不负责：

* 替 `subagent` 完成 blackboard 业务判断；
* 解析或持久化 `CommentBulletResolution`；
* 替 backend 持有会话业务真相。

### 3.3 `subagent`

`subagent` 是当前 blackboard session 的唯一执行 owner。

它在本文中的职责是：

* 接收 `main agent` handoff；
* 以 `Codex` 原生 `subagent thread` 的身份持续存在；
* 维护自己的本地会话目录；
* 创建并托管 blackboard session；
* 逐回合处理宿主交付的 session 事件；
* 在处理过程中调用 Agent CLI；
* 在 close 阶段形成 `summary.md` 并回传给 `main agent`。

### 3.4 backend

backend 是 blackboard 业务状态真相持有者。

backend 持有的正式状态包括：

* `WorkingSet.currentContent`
* `Bullet`
* `Bullet.status`
* `ReviewChangeSet`
* `Version`

backend 不读取 `subagent` 私有工作区文件作为正式状态来源。

### 3.5 frontend

frontend 只消费 backend 提供的 snapshot 与 event。

frontend：

* 不读取 `mainAgentInfo.md`
* 不读取 `sessionDocument.md`
* 不读取 `summary.md`

frontend 展示的正文来源始终是 backend 当前会话状态，而不是 `subagent` 本地文件。

---

## 4. 会话目录合同

### 4.1 每个 session 对应一个私有目录

V1 中，每个 blackboard session 都应对应一个仅属于当前 `subagent` 的私有会话目录。

本文不固定该目录的绝对路径命名规则，但要求同一 session 内的稳定文件都落在该目录下。

### 4.2 必需文件

当前阶段，以下文件是稳定锚点：

* `mainAgentInfo.md`
  `main agent` handoff 的本地落盘文件。
* `sessionDocument.md`
  当前 blackboard 会话正文的本地 Markdown 工作副本。
* `summary.md`
  close 阶段形成的最终总结与回传载体。

### 4.3 可选目录

当前阶段，以下目录是推荐但非强制的本地产物：

* `bullets/`
  每条 `comment bullet` 的结构化 resolution 文件。
* `notes/`
  围绕单条 bullet 或统合工作的 Markdown 笔记。
* `scratch/`
  临时分析、试写草稿和中间文件。

### 4.4 文件与系统状态的关系

`mainAgentInfo.md`

* 来源是 `main agent` handoff；
* 面向对象是当前 `subagent`；
* 不是 frontend 渲染内容；
* 不是 backend 业务状态。

`sessionDocument.md`

* 在创建会话前承载 `subagent` 形成的初稿；
* 创建会话时，其内容被作为 `create_session.initialContent` 提交；
* 创建会话后，它承载的是当前正文的本地工作副本；
* 它不是 frontend 的直接数据源；
* 它也不是 backend 的正式真相。

`summary.md`

* 只在 close 阶段成为必需文件；
* 其内容用于向 `main agent` 回传最终结果；
* 它不是会话进行中的 frontend / backend 状态来源。

### 4.5 失效规则

当当前工作基底失效时，`subagent` 必须将旧本地产物视为失效。

至少包括以下场景：

* 用户恢复历史版本为新的工作基底；
* backend 明确告知当前 `WorkingSet` 已重建；
* 当前 blackboard session 被正式关闭。

失效后：

* 旧的 `sessionDocument.md` 不得继续作为最新正文依据；
* 绑定旧工作基底的局部 resolution 不得继续直接用于后续统合；
* `subagent` 必须基于最新 snapshot 重建本地工作副本。

---

## 5. 事件交付模型

### 5.1 单一 owner

V1 中，同一 blackboard session 只有一个活跃 `subagent`。

宿主不得在同一时间把同一 session 的事件分发给多个不同执行者。

### 5.2 串行事件队列

宿主必须为当前 session 维护串行事件队列。

规则如下：

* 新事件先入队；
* 同一时刻只允许存在一个当前处理事件；
* 当前事件未完成前，不得交付下一个事件；
* 不允许新事件直接打断当前回合。

### 5.3 一事件一回合

对于 `Codex` 宿主，V1 采用一事件一回答回合。

也就是说：

* 宿主从队列中取出一个事件；
* 宿主通过 `turn/start(threadId=...)` 将该事件作为一次新的输入交给当前 `subagent thread`；
* `subagent` 围绕这个事件完成思考、文件更新和必要 CLI 调用；
* 当前回答回合结束时，该事件才视为 `handled`。

### 5.4 handled 的判定边界

在当前阶段，对 `Codex` 宿主：

* 已观察到当前 `threadId` 的 `turn/completed`
* 且本回合要求的强制工具动作已经完成

当前事件才可视为 `handled`。

若强制工具动作未完成，则宿主不得将该事件视为处理完成，也不得继续交付下一个事件。

### 5.5 `turn/steer` 的角色

`turn/steer` 不是常规事件交付机制。

它只应用于以下场景：

* 当前回合仍在进行中；
* 宿主需要向该回合补充或修正输入；
* 目标仍然是当前活跃 `turnId`。

正常的 blackboard 事件队列推进仍以 `turn/start` 为主，不应依赖忙时连续投递多个 `turn/start` 作为隐式排队机制。

### 5.6 `get_snapshot` 的角色

`get_snapshot` 不是主同步机制。

它在本文中的用途是：

* 会话创建后初始化本地工作区；
* `Proceed` 前确认最新正文；
* 工作基底失效后重建本地副本；
* 必要时的兜底校验。

---

## 6. `subagent` 回合工作循环

### 6.1 启动回合

启动回合中，`subagent` 至少应完成：

1. 接收 `main agent` handoff；
2. 将 handoff 落为 `mainAgentInfo.md`；
3. 基于 handoff 生成首版 `sessionDocument.md`；
4. 调用 `create_session`；
5. 调用一次初始 `get_snapshot`；
6. 用 snapshot 返回的当前正文重写 `sessionDocument.md`。

启动回合结束前，`create_session` 必须完成，初始 `get_snapshot` 应完成。

这里的“基于 handoff 生成首版 `sessionDocument.md`”默认意味着：

* `main agent` 主要提供主题、目标、上下文、约束和成功标准；
* `subagent` 负责把这些信息扩展成适合协作的首版文稿；
* 除非人类明确要求以既定正文作为起点，否则不要求 `main agent` 预先写好整篇首稿。

### 6.2 `comment bullet` 回合

当宿主交付的是单条 `comment bullet` 事件时，`subagent` 至少应完成：

1. 读取 bullet 输入；
2. 必要时 `get_snapshot` 确认当前正文与 active bullets；
3. 结合 `sessionDocument.md` 定位相关上下文；
4. 在本地形成该 bullet 的局部 resolution；
5. 按需更新 `bullets/`、`notes/`、`scratch/`；
6. 在当前回合结束前成功调用 `mark_bullet_ready`。

`comment bullet` 回合结束前，`mark_bullet_ready` 是强制动作。

### 6.3 `Proceed` 回合

当宿主交付的是 `Proceed` 收敛事件时，`subagent` 至少应完成：

1. 必要时重读最新 snapshot；
2. 用 snapshot 返回的正文重写 `sessionDocument.md`；
3. 基于本地 resolutions 与最新正文进行统一统合；
4. 形成整篇候选正文；
5. 在当前回合结束前成功调用 `submit_review_candidate`。

`Proceed` 回合结束前，`submit_review_candidate` 是强制动作。

### 6.4 restore / rebuild 回合

当宿主交付的是工作基底失效事件时，`subagent` 至少应完成：

1. 放弃旧工作基底上的局部草稿与统合结果；
2. 调用 `get_snapshot`；
3. 用最新 snapshot 重写 `sessionDocument.md`；
4. 将绑定旧工作基底的本地 resolution 视为失效。

这个回合的核心目标不是提交业务状态，而是重建本地工作副本。

### 6.5 close 回合

当宿主交付的是正式关闭相关事件时，`subagent` 至少应完成：

1. 读取当前最终 snapshot 与会话状态；
2. 整理本次会话结果与后续建议；
3. 将总结写入 `summary.md`；
4. 在当前回合结束前成功调用 `close_session`；
5. 让宿主据此将结果回传给 `main agent`。

close 回合结束前，`summary.md` 与 `close_session` 都是强制产物。

---

## 7. 事件类型与回合结束义务

当前阶段至少固定以下回合结束义务：

* 启动回合
  必须完成 `create_session`，并应完成初始 `get_snapshot`
* `comment bullet` 回合
  必须完成 `mark_bullet_ready`
* `Proceed` 回合
  必须完成 `submit_review_candidate`
* close 回合
  必须完成 `summary.md` 与 `close_session`

这些义务属于当前阶段的稳定执行合同，不应在 skill prompt 或宿主实现中被忽略。

---

## 8. 与其他文档的关系

本文与其他稳定文档的分工如下：

* `docs/05-agent/Collaboration-Skill-Spec.md`
  定义当前 `Codex` 目标下的统一 blackboard skill、角色合同、handoff 合同和 V1 回合约束。
* `docs/03-contracts/Agent-CLI.md`
  定义 `subagent-facing` CLI 的命令语义与本地工作区原则。
* `docs/03-contracts/Frontend-Backend-Protocol.md`
  定义 frontend 与 backend 的 snapshot / event / command 协议。
* `docs/02-models/Document-Presentation-Model.md`
  定义 Markdown 文稿、`DocumentUnit[]` 与渲染管线。
* `docs/05-agent/Codex-Host-Validation-Contract.md`
  定义哪些主张由 repo、harness、Codex host、skill 或真实 agent 验证承担。
* 本文
  定义当实际执行者是 `Codex` 时，这些稳定定义如何被接成可执行的 `subagent` 运行模型。

---

## 9. 当前非目标

本文当前明确不覆盖：

* 多个 `subagent` 同时托管同一 session；
* session 在多个 worker 之间的接管、迁移或恢复；
* `subagent` 自主再派出下一层 blackboard worker；
* 会话目录的绝对路径命名规则；
* `bullets/`、`notes/`、`scratch/` 的精确文件格式。

---

## 10. 当前结论

当前阶段，blackboard `subagent` 的宿主执行层应收敛为以下结论：

* V1 采用单一 `subagent` 托管单一 session；
* `main agent` 先启动一个原生 `subagent`；
* `spawn_agent` 返回的 `agent_id` 在 `Codex` 中被视为该 `subagent` 的 `threadId`；
* 宿主持久化这个 `threadId`，并在后续通过 `Codex App Server` 直接控制该 `subagent thread`；
* 宿主为该 session 提供私有会话目录；
* `mainAgentInfo.md`、`sessionDocument.md`、`summary.md` 是最小稳定锚点；
* 宿主以串行事件队列向 `subagent thread` 交付 session 事件；
* 对 `Codex` 宿主，常规事件交付采用 `turn/start(threadId=...)`；
* `turn/steer` 只用于当前活跃回合的补充输入；
* 收到 `turn/completed`，且强制工具动作已完成时，当前事件才视为 `handled`；
* frontend 只消费 backend snapshot / event，不读取 `subagent` 私有文件；
* backend 继续持有正式会话业务真相；

这里的“通过 `Codex App Server` 直接控制”不应被误读为“backend 自己就能直接调到 Codex subagent”。

更准确地说：

* backend 负责产生 blackboard 业务事件与会话状态；
* 宿主编排层负责把这些事件转成对 `subagent thread` 的实际控制调用；
* 若当前环境提供的是 `send_input` 等宿主工具而不是字面上的 `turn/start(threadId=...)`，它们应被视为同一层能力的具体实现。
* `subagent` 本地工作区继续只被视为私有、可重建、可失效的工作缓存。
