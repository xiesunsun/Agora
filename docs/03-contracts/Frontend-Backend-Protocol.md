# Frontend-Backend Protocol

## 1. 文档目标

本文档定义 MVP 阶段 blackboard 的前后端协议。

本文档重点回答以下问题：

* 前端页面如何与 backend 建立连接；
* 前端如何获取当前会话状态；
* 前端可以发送哪些 command；
* backend 会向前端推送哪些 event；
* `DocumentUnit`、`Bullet`、`ReviewChangeSet`、`Version` 如何在前后端之间同步。

本文档不展开：

* `subagent` 如何通过 Agent CLI 托管黑板会话；
* Agent 本地工作区如何组织文件；
* 具体的 CSS、动画资源或像素级渲染实现。

---

## 2. 运行前提

### 2.1 V1 运行环境

V1 默认运行在本机环境：

* `frontend`
  为本地 HTML 页面；
* `backend`
  为同机黑板服务；
* `subagent`
  通过独立 Agent CLI 与 backend 交互。

### 2.2 V1 客户端约束

V1 只支持：

* 单前端页面
* 单活跃客户端

V1 不支持：

* 多标签页并发编辑同一会话；
* 多前端客户端同时连接同一会话；
* 多前端之间的控制权协商。

### 2.3 交互对象前提

前端看到的是：

* 连续文稿页面

但交互锚点统一基于：

* `DocumentUnit`
* `unitId`

正文内容真相仍然是：

* Markdown

页面内部的 `DocumentUnit[]` 为系统派生结构。

---

## 3. 协议模型

前后端协议采用四分模型：

* `snapshot`
  通过 SSE 初始化事件交付当前完整状态。
* `query`
  读取只读数据，不修改业务状态。
* `command`
  前端请求 backend 执行一个动作。
* `event`
  backend 向前端广播一个已发生的事实。

V1 中：

* 前端上行以 `HTTP` 承载 query / command；
* 前端下行以 `SSE` 承载 event；
* 前端首次进入或状态恢复时，通过 `session.snapshot` event 重建本地状态。

---

## 4. 传输模型

### 4.1 选择

V1 采用：

* `HTTP commands + SSE events`

即：

* 前端 -> backend：HTTP
* backend -> 前端：SSE

### 4.2 选择原因

该模型适合当前产品形态，因为：

* 页面处于浏览器环境；
* 前端上行是离散命令；
* backend 下行是异步状态变化；
* 需要一定实时感，但不需要 WebSocket 级别的双向流复杂度；
* 同机运行不妨碍继续使用 HTTP + SSE。

### 4.3 V1 不采用

V1 不采用：

* WebSocket 双向协议；
* 前端纯 polling 作为主同步机制；
* 浏览器直接消费 Agent 运行时私有事件流。

### 4.4 V1 Endpoint 决策

本轮前端接入与 mock backend 固定以下 endpoint：

* `GET /api/sessions/:sessionId/events`
  建立 SSE 事件流。连接建立后 backend 必须先推送 `session.snapshot`。
* `POST /api/sessions/:sessionId/commands`
  统一接收前端 command。command 类型由 envelope 的 `type` 字段区分。
* `GET /api/sessions/:sessionId/history/:versionId`
  读取历史版本正文，用于本地 `history_preview` 视图。
* `GET /api/sessions/:sessionId/snapshot`
  可作为调试兜底接口；V1 页面主同步路径仍以 SSE `session.snapshot` 为准。

`sessionId` 来源：

* 前端优先读取 URL query：`?sessionId=demo`
* 若未提供，则本地开发默认使用 `demo`

---

## 5. 初始化与恢复

### 5.1 页面初始化

V1 页面初始化顺序为：

1. 页面加载。
2. 前端建立 SSE 事件流订阅。
3. backend 在该连接上先推送一条完整 `session.snapshot`。
4. 前端基于该 `session.snapshot` 构建当前页面状态。
5. 后续主要依赖 event 增量同步。

### 5.2 断线恢复

当 SSE 事件流中断时：

1. 前端重新建立 SSE 连接。
2. backend 在新连接上再次推送完整 `session.snapshot`。
3. 前端用新的 `session.snapshot` 覆盖本地状态。
4. 后续继续消费新事件。

### 5.3 V1 约定

V1 暂不做：

* `Last-Event-ID` 精准续流；
* event replay；
* 基于历史 event 的客户端状态重建。

V1 的恢复方式是：

* 重新建立 SSE 并重新接收完整 `session.snapshot`

---

## 6. Snapshot 模型

### 6.1 定义

`snapshot` 表示某一时刻当前黑板会话的完整前端可消费状态。

在 V1 中：

* `snapshot` 的主交付方式是 SSE 初始化事件 `session.snapshot`
* 独立 HTTP snapshot 仅可作为调试或兜底接口，不是主同步路径

### 6.2 最小内容

V1 的 `snapshot` 至少应包含：

* `sessionId`
* `sessionStatus`
* `title`
* `baseVersionId`
* `currentVersionId`
* `currentContent`
* `documentUnits`
* `activeBullets`
* `activeReviewChangeSet`（若存在）
* `versionHistory` 概要

### 6.2.1 `sessionStatus` 与前端视图状态

V1 backend snapshot 的 `sessionStatus` 只表达后端业务生命周期：

* `active`
* `proceeding`
* `reviewing`
* `closed`

以下状态不进入 backend `sessionStatus`：

* `history_preview`
  是前端本地只读 view mode，由 `history.get_version` query 的返回内容驱动。
* `reviewing_flow` / `reviewing_pr`
  是前端 review view mode，由同一份 `activeReviewChangeSet.mode` 或本地 view state 驱动。

前端可以派生页面显示状态：

* `active`
* `proceeding`
* `reviewing_flow`
* `reviewing_pr`
* `history_preview`
* `closed`

### 6.3 说明

其中：

* `currentContent`
  是 Markdown 真相；
* `documentUnits`
  是从 Markdown 派生出的有序交互单元；
* `currentVersionId`
  表示当前页面所处的正式版本上下文；
* `activeBullets`
  用于驱动 bullet 轨道与 Agent 小人；
* `activeReviewChangeSet`
  用于驱动 `flow` / `pr` review 视图；
* `versionHistory`
  用于历史版本查看与恢复。

### 6.4 `documentUnits`

V1 中，`documentUnits` 的最小公共字段为：

* `unitId`
* `type`
* `markdown`
* `order`
* `sourceStart`
* `sourceEnd`

`type` 当前支持：

* `title`
* `heading`
* `paragraph`
* `list_item`
* `table`
* `code_block`
* `blockquote`

其中：

* `sourceStart` / `sourceEnd` 表示该 `DocumentUnit` 在当前 `currentContent` Markdown 源串中的半开区间 `[sourceStart, sourceEnd)`
* backend 在处理 `document_unit.edit.commit` 时，应以该源码范围执行切片替换，再重新解析整篇 Markdown

---

## 7. Query / Command 模型

### 7.1 Query 总原则

query 用于读取只读数据，不修改 backend 业务状态。

V1 中：

* history preview 所需的历史版本正文通过 query 读取
* query 不进入业务状态机，不生成副作用型业务 event

### 7.2 Command 总原则

前端只发送高层业务 command，不直接写本地状态为真相。

前端发送 command 后：

* backend 决定是否接受；
* backend 修改正式业务状态；
* backend 再通过 event 广播事实更新。

### 7.3 Query / 命令分类

V1 前端 query 分为：

* 历史版本读取 query

V1 前端 command 分为：

* 文稿编辑命令
* bullet 命令
* Proceed 命令
* review 命令
* 历史版本命令
* 关闭会话命令

### 7.4 并发守卫

V1 建议前端在关键写操作中携带：

* `workingSetRevision`

它用于帮助 backend 判断：

* 当前操作是否基于过期现场；
* 是否需要拒绝并要求前端刷新 `snapshot`。

本字段属于 V1 推荐守卫字段。

### 7.5 Command 响应格式

Command HTTP 成功被 backend 接收时，返回：

```json
{
  "ok": true,
  "commandId": "cmd_123",
  "acceptedAt": "2026-05-07T12:00:00.000Z"
}
```

说明：

* 该响应只表示 command 已被接收，不表示业务状态已经完成；
* 前端业务状态仍以后续 SSE event 为准；
* 长流程如 `session.proceed` 不在 HTTP 响应中返回最终结果。

Command 或 query 失败时，返回统一错误 envelope：

```json
{
  "ok": false,
  "error": {
    "code": "REVISION_MISMATCH",
    "message": "Command was issued against an old working set revision",
    "recoverable": true
  }
}
```

HTTP status 与错误类型建议：

* `400`：请求格式错误；
* `404`：目标 session / version / bullet / review 不存在；
* `409`：状态冲突，如 `REVISION_MISMATCH`、`INVALID_STATE`、`PROCEED_IN_PROGRESS`；
* `500`：`INTERNAL_ERROR`。

---

## 8. Frontend Queries

### 8.1 `history.get_version`

#### 定义

读取某个历史版本的只读正文，用于 `history_preview`。

#### 最小输入

* `sessionId`
* `versionId`

#### 输出

最小输出建议：

* `versionId`
* `versionNumber`
* `content`
* `createdAt`
* `documentUnits`

#### 说明

* 本 query 不修改当前 `WorkingSet`
* V1 不要求在该返回中包含逐版本 `summary` 或 `diff` 详情
* `history_preview` 是前端本地只读视图，不作为 backend 持久业务状态；只有 `history.restore_version` 会修改 backend `WorkingSet`

---

## 9. Frontend Commands

### 9.1 `document_unit.edit.commit`

#### 定义

提交某个 `DocumentUnit` 的编辑结果。

#### 最小输入

* `sessionId`
* `unitId`
* `markdown`
* `workingSetRevision`

#### 副作用

* backend 依据该 `DocumentUnit` 当前源码范围替换 `WorkingSet.currentContent` 中对应 Markdown 切片
* backend 重新解析整篇 Markdown，并重新派生 `documentUnits`
* backend 自动生成一条 `edit bullet`

#### 说明

* `DocumentUnit` 编辑允许改变该位置的最终单元类型
* 新的 `DocumentUnit[]`、边界与 `unitId` 以替换后整篇 Markdown 的重新解析结果为准

### 9.2 `bullet.comment.create`

#### 定义

在某个可批注文稿单元内创建 `comment bullet`。

#### 最小输入

* `sessionId`
* `unitId`
* `content`

若该单元属于支持文本选区的文本型单元，还可带：

* `anchorTextSnapshot`
* `anchorStartOffset`
* `anchorEndOffset`

#### 副作用

* backend 创建新的 `comment bullet`
* bullet 初始状态为 `new`

#### 说明

* 文本型单元如 `title`、`heading`、`paragraph`、`list_item`、`blockquote` 支持字符级选区锚点
* `table` 与 `code_block` 在 V1 中仍可批注，但按整块 comment 处理，不要求 `anchorStartOffset` / `anchorEndOffset`

### 9.3 `bullet.update`

#### 定义

编辑一个现有可编辑 bullet。

#### 最小输入

* `sessionId`
* `bulletId`
* `content`

#### 副作用

* 若 bullet 仍为 `new`，可直接更新；
* 若 bullet 已进入 `processing` 或 `ready`，则 backend 生成新的 bullet 事件追加到队尾。

### 9.4 `session.proceed`

#### 定义

请求发起一次 `Proceed`。

#### 最小输入

* `sessionId`
* `workingSetRevision`

#### 副作用

* backend 进入 `proceeding`
* frontend 后续通过 event 获得阶段更新

### 9.5 `review.change.accept`

#### 定义

接受一个具体 `Change`。

#### 最小输入

* `sessionId`
* `reviewChangeSetId`
* `changeId`

#### 副作用

* 该 change 状态变为 `accepted`
* 若该操作后当前 `ReviewChangeSet` 已不存在任何 `pending` change，backend 必须自动结算 review

### 9.6 `review.change.reject`

#### 定义

拒绝一个具体 `Change`。

#### 最小输入

* `sessionId`
* `reviewChangeSetId`
* `changeId`

#### 副作用

* 该 change 状态变为 `rejected`
* 若该操作后当前 `ReviewChangeSet` 已不存在任何 `pending` change，backend 必须自动结算 review

### 9.7 `review.accept_all_remaining`

#### 定义

将所有 `pending` change 批量接受。

#### 最小输入

* `sessionId`
* `reviewChangeSetId`

#### 副作用

* backend 将所有 `pending` change 批量转为 `accepted`
* backend 在批量处理完成后立即自动结算 review

### 9.8 `review.reject_all_remaining`

#### 定义

将所有 `pending` change 批量拒绝。

#### 最小输入

* `sessionId`
* `reviewChangeSetId`

#### 副作用

* backend 将所有 `pending` change 批量转为 `rejected`
* backend 在批量处理完成后立即自动结算 review

### 9.9 `history.restore_version`

#### 定义

将目标历史版本恢复为新的当前工作基底。

#### 最小输入

* `sessionId`
* `versionId`

#### 副作用

* backend 重建 `WorkingSet`
* 当前未结算 bullet 队列被清空
* 不生成新的 bullet

### 9.10 `session.request_close`

#### 定义

请求结束当前黑板会话。

#### 最小输入

* `sessionId`

#### 副作用

* backend 记录用户关闭意图并启动会话收尾流程
* backend 不应在此命令返回前直接将 `BlackboardSession.status` 置为 `closed`

#### 说明

* V1 中，正式关闭由当前 `subagent` 完成总结后调用 CLI `close_session`
* `session.request_close` 不是正式 closed 的唯一入口；它只表达前端用户关闭请求

---

## 10. Event 模型

### 9.1 总原则

event 表示 backend 已确认发生的事实。

前端不应通过解析文案猜状态，而应通过 typed events 驱动 UI。

### 10.2 V1 最小 event 字段

V1 建议所有 event 至少带：

* `eventType`
* `eventId`
* `sessionId`
* `timestamp`
* `payload`

按需字段：

* `causationId`
  表示该 event 直接由哪个 command 引起
* `correlationId`
  表示该 event 属于哪条长流程
* `sequence`
  暂不作为 V1 强制字段

---

## 11. Backend Events

### 10.1 `session.snapshot`

表示某条 SSE 连接初始化时交付的一份完整 session snapshot。

V1 中：

* 该 event 是前端进入页面与断线恢复后的第一份主状态输入
* 它不是普通业务副作用 event，而是连接初始化事件

### 10.2 `document_unit.updated`

表示当前文稿结构或某个 `DocumentUnit` 已更新。

常见触发原因：

* 用户提交编辑；
* 历史版本恢复；
* 新版本落版。

### 10.3 `bullet.created`

表示一条新 bullet 已创建。

### 10.4 `bullet.status_changed`

表示某条 bullet 的生命周期状态发生变化。

例如：

* `new -> processing`
* `processing -> ready`
* `ready -> applied`

### 10.5 `working_set.rebased`

表示当前 `WorkingSet` 已被重建或重置。

常见触发原因：

* 用户恢复历史版本为新的工作基底。

该事件发生后：

* 前端应丢弃基于旧 working set 的局部状态；
* 页面应重新以最新 `snapshot` 为准。

### 10.6 `proceed.started`

表示 `Proceed` 已正式开始。

### 10.7 `proceed.stage_changed`

表示 `Proceed` 所处阶段发生变化。

当前阶段至少包括：

* `resolving_bullets`
* `synthesizing_changes`
* `materializing_review`

### 10.8 `proceed.progress_updated`

表示 bullet 处理总进度发生变化。

最小 payload 建议：

* `completed`
* `total`

### 10.9 `review_change_set.created`

表示新的 `ReviewChangeSet` 已生成。

### 10.10 `review.change_status_changed`

表示某个 `Change` 的 `pending / accepted / rejected` 状态发生变化。

### 11.11 `review.resolved`

表示当前 review 已完成结算。

其结果可能是：

* 生成新版本；
* 或回退到 `Proceed` 前工作现场。

V1 规则：

* backend 在最后一个 `pending` change 消失时必须自动发出该 event
* 不要求前端额外发送 `review.finalize`

### 10.12 `version.created`

表示新的正式版本已生成。

### 11.13 `session.closed`

表示当前会话已正式关闭。

V1 中：

* 该 event 只应在 `subagent` 完成会话总结并调用 CLI `close_session` 后发出

### 11.14 `error.raised`

表示某个操作已被 backend 拒绝或执行失败。

---

## 12. 错误模型

V1 至少应区分以下错误类型：

* `INVALID_STATE`
  当前状态不允许执行该操作。
* `REVISION_MISMATCH`
  当前操作基于过期 working set。
* `NOT_FOUND`
  目标 session / bullet / review / version 不存在。
* `PROCEED_IN_PROGRESS`
  当前已处于 `proceeding`，不允许再次发起 Proceed。
* `REVIEW_NOT_OPEN`
  当前不存在可操作的 `ReviewChangeSet`。
* `SESSION_CLOSED`
  当前会话已关闭。
* `INTERNAL_ERROR`
  backend 内部异常。

### 11.1 错误处理原则

* 前端收到业务拒绝后，不应自作主张改本地真相；
* 对 `REVISION_MISMATCH`，前端应等待新的 `session.snapshot` 或重建 SSE 连接；
* 对 `INVALID_STATE`，前端应回退当前交互动作；
* 对不可恢复错误，前端应提示用户并等待下一步动作。

---

## 13. 与其他文档的关系

本文档与其他文档的分工如下：

* `Agent-CLI.md`
  定义 `subagent` 如何通过 CLI 托管会话。
* `Document-Presentation-Model.md`
  定义 Markdown 文稿如何派生为 `DocumentUnit[]` 并渲染为连续文稿页面。
* `Domain-Model.md`
  定义 `BlackboardSession`、`WorkingSet`、`Bullet`、`ReviewChangeSet`、`Version` 等核心业务对象。
* `Product-Interaction-State-Machine.md`
  定义顶层状态与状态迁移规则。
* 本文档
  定义 frontend 与 backend 如何交换 snapshot、command 和 event。
