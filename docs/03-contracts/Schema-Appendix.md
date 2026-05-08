# Schema Appendix

## 1. 文档目标

本文档作为黑板会话系统的 Schema 附录，统一定义以下内容：

* 核心领域对象的规范字段；
* frontend 可消费的 snapshot 结构；
* frontend/backend command、event、error 的最小 envelope；
* 字段稳定性、对象身份与失效规则。

本文档不重复：

* 产品目标与用户价值；
* 页面交互流程；
* 状态机迁移叙述；
* Agent 本地工作区对象设计。

---

## 2. 设计原则

### 2.1 真相最少

Schema 只定义真正需要跨边界同步的业务对象。

以下内容不进入 backend 正式 schema：

* `CommentBulletResolution`
* Agent 私有草稿
* 高亮重定位算法
* 页面局部编辑态 UI 细节

### 2.2 表现与真相分离

例如：

* `comment bullet` 的锚点信息属于业务真相；
* comment 在当前正文上的高亮是否还能精确显示，属于系统基于当前内容派生的表现结果。

### 2.3 V1 优先最小闭环

V1 只为当前核心路径定义最小必要 schema，不为未来可能能力预留多余层次。

### 2.4 稳定性必须写清楚

字段存在不代表它跨所有文本演化都稳定。

特别是：

* `unitId` 只在同一个 `workingSetRevision` 内稳定；
* `comment bullet` 的 offset 只描述创建时锚点，不承诺跨 revision 稳定；
* `Change` 不允许跨多个 `DocumentUnit`。

---

## 3. Primitive Types

### 3.1 ID 类型

V1 统一使用字符串 ID：

* `sessionId`
* `versionId`
* `reviewChangeSetId`
* `bulletId`
* `changeId`
* `unitId`

### 3.2 Timestamp

时间字段统一使用 ISO 8601 UTC 字符串，例如：

```json
"2026-05-02T10:30:00Z"
```

### 3.3 Revision

`workingSetRevision` 是当前工作现场的并发守卫字段。

约束：

* 为单调递增整数；
* 每次 `WorkingSet.currentContent` 被正式更新时递增；
* 每次 `WorkingSet` 被 rebase 或重建时也必须递增；
* 前端和 subagent 都应将其视为“当前现场是否仍最新”的判断依据。

V1 不定义公开 `workingSetId`。

---

## 4. Enums

### 4.1 `SessionStatus`

```ts
type SessionStatus =
  | "active"
  | "proceeding"
  | "reviewing"
  | "history_preview"
  | "closed"
```

### 4.2 `DocumentUnitType`

```ts
type DocumentUnitType =
  | "title"
  | "heading"
  | "paragraph"
  | "list_item"
  | "table"
  | "code_block"
  | "blockquote"
```

### 4.3 `BulletType`

```ts
type BulletType = "edit" | "comment"
```

### 4.4 `BulletStatus`

```ts
type BulletStatus = "new" | "processing" | "ready" | "applied"
```

### 4.5 `ReviewChangeSetStatus`

```ts
type ReviewChangeSetStatus = "open" | "resolved"
```

### 4.6 `ChangeKind`

```ts
type ChangeKind = "insert" | "delete" | "replace"
```

### 4.7 `ChangeStatus`

```ts
type ChangeStatus = "pending" | "accepted" | "rejected"
```

### 4.8 `ProceedStage`

```ts
type ProceedStage =
  | "resolving_bullets"
  | "synthesizing_changes"
  | "materializing_review"
```

### 4.9 `ErrorCode`

```ts
type ErrorCode =
  | "INVALID_STATE"
  | "REVISION_MISMATCH"
  | "NOT_FOUND"
  | "PROCEED_IN_PROGRESS"
  | "REVIEW_NOT_OPEN"
  | "SESSION_CLOSED"
  | "INTERNAL_ERROR"
```

---

## 5. Canonical Domain Schemas

### 5.1 `BlackboardSession`

```ts
type BlackboardSession = {
  sessionId: string
  title: string
  status: SessionStatus
  workingSet: WorkingSet
  activeReviewChangeSet?: ReviewChangeSet
  versionHistory: VersionSummaryItem[]
  createdAt: string
  closedAt?: string
}
```

规则：

* 一个 session 同时只有一个顶层状态；
* 一个 session 同时最多只有一个 `activeReviewChangeSet`；
* `closed` 后不再产生新的 `Bullet`、`ReviewChangeSet` 或 `WorkingSet` 更新。

### 5.2 `WorkingSet`

```ts
type WorkingSet = {
  baseVersionId?: string
  workingSetRevision: number
  currentContent: string
  documentUnits: DocumentUnit[]
  activeBullets: Bullet[]
  suspended: boolean
}
```

规则：

* V1 不公开 `workingSetId`；
* `paragraphs` 字段废弃，统一使用 `documentUnits`；
* 用户确认过的正文修改必须立即写入 `currentContent`；
* `history_preview` 期间 `WorkingSet` 被挂起，但不默认销毁。

### 5.3 `DocumentUnit`

```ts
type DocumentUnit = {
  unitId: string
  type: DocumentUnitType
  markdown: string
  order: number
  sourceStart: number
  sourceEnd: number
}
```

规则：

* `unitId` 只保证在同一个 `workingSetRevision` 内稳定；
* 不承诺跨 revision、跨 rebase、跨 version 稳定；
* `DocumentUnit` 的编辑态不属于本 schema 主干。
* `sourceStart` / `sourceEnd` 表示该单元在当前 Markdown 源串中的半开区间 `[sourceStart, sourceEnd)`；
* `document_unit.edit.commit` 应以该源码范围执行切片替换，再重新解析整篇 Markdown。

### 5.4 `Bullet`

```ts
type Bullet = EditBullet | CommentBullet
```

公共字段：

```ts
type BulletBase = {
  bulletId: string
  type: BulletType
  status: BulletStatus
  unitId: string
  queueOrder: number
  createdAt: string
}
```

#### 5.4.1 `EditBullet`

```ts
type EditBullet = BulletBase & {
  type: "edit"
  beforeText: string
  afterText: string
}
```

规则：

* 由 `document_unit.edit.commit` 自动生成；
* 表达“用户已直接修改正文”的事实；
* 不要求精确字符级选区锚点。

#### 5.4.2 `CommentBullet`

```ts
type CommentBullet = BulletBase & {
  type: "comment"
  content: string
  anchorTextSnapshot: string
  anchorStartOffset?: number
  anchorEndOffset?: number
}
```

规则：

* `anchorTextSnapshot` 表示创建 bullet 时用于锚定的文本快照；
* `anchorStartOffset` 与 `anchorEndOffset` 只描述创建时相对于 `anchorTextSnapshot` 的选区范围；
* 系统应尽力在当前 `unitId` 对应内容上恢复 comment 高亮；
* 若当前正文已变化导致无法精确恢复，则 bullet 仍保留挂载，但高亮可以退化消失；
* 不承诺 comment 高亮在跨 `workingSetRevision` 后仍精确稳定。
* 对 `table` 与 `code_block`，V1 允许整块 comment，不强制要求字符级 offset。

### 5.5 `ReviewChangeSet`

```ts
type ReviewChangeSet = {
  reviewChangeSetId: string
  sourceWorkingSetRevision: number
  baseVersionId?: string
  candidateContent: string
  changes: Change[]
  status: ReviewChangeSetStatus
}
```

规则：

* 一次 `Proceed` 最多只生成一份 `ReviewChangeSet`；
* `ReviewChangeSet` 的核心是 `candidateContent + changes`；
* `flow` 与 `pr` 是同一对象的两种视图，不是两个 schema；
* `resolved` 前不得再次发起新的 `Proceed`。

### 5.6 `Change`

```ts
type Change = {
  changeId: string
  kind: ChangeKind
  unitId: string
  startOffset: number
  endOffset: number
  beforeText: string
  afterText: string
  status: ChangeStatus
}
```

规则：

* `startOffset` / `endOffset` 一律相对于基底 `DocumentUnit` 文本计算；
* 使用半开区间 `[startOffset, endOffset)`；
* `beforeText` 必须等于基底文本在该区间上的原文本；
* 一个 `Change` 只允许作用于一个 `unitId`；
* V1 不允许跨多个 `DocumentUnit` 的单一 change。

### 5.7 `Version`

```ts
type Version = {
  versionId: string
  versionNumber: number
  content: string
  summary?: string
  diffFromPrevious?: string
  acceptedChangeSetRef?: string
  createdAt: string
}
```

规则：

* `Version` 是正式历史快照，一旦生成即不可变；
* V1 中 `summary` 为可选字段，不作为版本生成的前置条件；
* 若存在 `summary`，其内容应表达本次正式落版的主要改动或结论。

### 5.8 `VersionSummaryItem`

```ts
type VersionSummaryItem = {
  versionId: string
  versionNumber: number
  summary?: string
  createdAt: string
}
```

---

## 6. Frontend Snapshot Schema

### 6.1 `SessionSnapshot`

```ts
type SessionSnapshot = {
  sessionId: string
  sessionStatus: SessionStatus
  title: string
  baseVersionId?: string
  currentVersionId?: string
  workingSetRevision: number
  currentContent: string
  documentUnits: DocumentUnit[]
  activeBullets: Bullet[]
  activeReviewChangeSet?: ReviewChangeSet
  versionHistory: VersionSummaryItem[]
}
```

说明：

* `currentContent` 是 Markdown 真相；
* `currentVersionId` 表示当前页面所处的正式版本上下文；
* `documentUnits` 是系统派生的交互结构；
* `activeBullets` 是当前轮仍 relevant 的 bullet；
* `activeReviewChangeSet` 仅在 `reviewing` 时存在；
* `versionHistory` 用于历史预览与恢复入口。

---

## 7. Frontend Command Schemas

### 7.1 最小 `CommandEnvelope`

```ts
type CommandEnvelope<TPayload> = {
  commandId: string
  command: string
  sessionId: string
  payload: TPayload
}
```

V1 不要求统一携带：

* `protocolVersion`
* `requestTimestamp`

但 V1 约定：

* 每个 command 必须有 `commandId`
* backend 产生直接业务响应 event 时，应使用 `causationId = commandId`
* 长流程事件应共享同一个 `correlationId`

### 7.2 `document_unit.edit.commit`

```ts
type DocumentUnitEditCommitPayload = {
  unitId: string
  markdown: string
  workingSetRevision: number
}
```

### 7.3 `bullet.comment.create`

```ts
type BulletCommentCreatePayload = {
  unitId: string
  content: string
  anchorTextSnapshot: string
  anchorStartOffset?: number
  anchorEndOffset?: number
}
```

说明：

* 文本型单元支持 `anchorStartOffset` / `anchorEndOffset`
* `table` 与 `code_block` 在 V1 中可省略字符级 offset，按整块 comment 处理

### 7.4 `bullet.update`

```ts
type BulletUpdatePayload = {
  bulletId: string
  content: string
}
```

### 7.5 `session.proceed`

```ts
type SessionProceedPayload = {
  workingSetRevision: number
}
```

### 7.6 `review.change.accept`

```ts
type ReviewChangeAcceptPayload = {
  reviewChangeSetId: string
  changeId: string
}
```

### 7.7 `review.change.reject`

```ts
type ReviewChangeRejectPayload = {
  reviewChangeSetId: string
  changeId: string
}
```

### 7.8 `review.accept_all_remaining`

```ts
type ReviewAcceptAllRemainingPayload = {
  reviewChangeSetId: string
}
```

### 7.9 `review.reject_all_remaining`

```ts
type ReviewRejectAllRemainingPayload = {
  reviewChangeSetId: string
}
```

### 7.10 `history.restore_version`

```ts
type HistoryRestoreVersionPayload = {
  versionId: string
}
```

### 7.11 `session.request_close`

```ts
type SessionRequestClosePayload = {}
```

---

## 8. Query Schemas

### 8.1 `history.get_version`

```ts
type HistoryGetVersionPayload = {
  versionId: string
}
```

```ts
type HistoryVersionView = {
  versionId: string
  versionNumber: number
  content: string
  createdAt: string
}
```

说明：

* 该 query 仅用于 `history_preview`
* V1 不要求逐版本 `summary` / `diff` 详情

---

## 9. Backend Event Schemas

### 9.1 最小 `EventEnvelope`

```ts
type EventEnvelope<TPayload> = {
  eventType: string
  eventId: string
  sessionId: string
  timestamp: string
  causationId?: string
  correlationId?: string
  payload: TPayload
}
```

V1 可选扩展但不强制：

* `sequence`

### 9.2 事件列表

#### `session.snapshot`

```ts
type SessionSnapshotEventPayload = SessionSnapshot
```

说明：

* 该 event 是 SSE 连接建立或重连后的初始化全量状态事件
* 它不是普通业务副作用 event

#### `document_unit.updated`

```ts
type DocumentUnitUpdatedPayload = {
  workingSetRevision: number
  currentContent: string
  documentUnits: DocumentUnit[]
}
```

#### `bullet.created`

```ts
type BulletCreatedPayload = {
  bullet: Bullet
}
```

#### `bullet.status_changed`

```ts
type BulletStatusChangedPayload = {
  bulletId: string
  fromStatus: BulletStatus
  toStatus: BulletStatus
}
```

#### `working_set.rebased`

```ts
type WorkingSetRebasedPayload = {
  baseVersionId?: string
  workingSetRevision: number
  currentContent: string
  documentUnits: DocumentUnit[]
  activeBullets: Bullet[]
}
```

#### `proceed.started`

```ts
type ProceedStartedPayload = {
  workingSetRevision: number
}
```

#### `proceed.stage_changed`

```ts
type ProceedStageChangedPayload = {
  stage: ProceedStage
}
```

#### `proceed.progress_updated`

```ts
type ProceedProgressUpdatedPayload = {
  completed: number
  total: number
}
```

#### `review_change_set.created`

```ts
type ReviewChangeSetCreatedPayload = {
  reviewChangeSet: ReviewChangeSet
}
```

#### `review.change_status_changed`

```ts
type ReviewChangeStatusChangedPayload = {
  reviewChangeSetId: string
  changeId: string
  fromStatus: ChangeStatus
  toStatus: ChangeStatus
}
```

#### `review.resolved`

```ts
type ReviewResolvedPayload = {
  reviewChangeSetId: string
  resolution: "version_created" | "all_rejected"
  versionId?: string
}
```

说明：

* 当最后一个 `pending` change 消失时，backend 必须自动发出该 event

#### `version.created`

```ts
type VersionCreatedPayload = {
  version: VersionSummaryItem
}
```

#### `session.closed`

```ts
type SessionClosedPayload = {
  closedAt: string
}
```

说明：

* 该 event 只在 `subagent` 完成总结并调用 CLI `close_session` 后发出

#### `error.raised`

```ts
type ErrorRaisedPayload = ErrorEnvelope["error"]
```

---

## 10. Error Schema

### 9.1 最小 `ErrorEnvelope`

```ts
type ErrorEnvelope = {
  error: {
    code: ErrorCode
    message: string
    retryable: boolean
    refreshRequired: boolean
  }
}
```

### 9.2 错误语义建议

* `REVISION_MISMATCH`
  * `retryable = true`
  * `refreshRequired = true`
* `INVALID_STATE`
  * `retryable = false`
  * `refreshRequired = false`
* `NOT_FOUND`
  * `retryable = false`
  * `refreshRequired = false`
* `PROCEED_IN_PROGRESS`
  * `retryable = true`
  * `refreshRequired = false`
* `REVIEW_NOT_OPEN`
  * `retryable = false`
  * `refreshRequired = true`
* `SESSION_CLOSED`
  * `retryable = false`
  * `refreshRequired = false`
* `INTERNAL_ERROR`
  * `retryable = false`
  * `refreshRequired = false`

---

## 11. Identity And Consistency Rules

### 10.1 `workingSetRevision` 是 V1 唯一公开并发守卫

V1 中：

* 不公开 `workingSetId`；
* 所有依赖当前现场最新性的写操作，应使用 `workingSetRevision` 守卫；
* backend 拒绝旧 revision 提交时，应返回 `REVISION_MISMATCH`。

### 10.2 `DocumentUnit` 不是跨版本稳定身份

因此：

* 不应将旧 revision 的 `unitId` 长期缓存并假设仍然有效；
* `history.restore_version` 或 `working_set.rebased` 后，前端应整体采用新 snapshot。

### 10.3 `comment bullet` 的高亮可退化

V1 明确允许以下退化：

* bullet 仍挂在对应 `unitId` 上；
* 但由于正文变化，旧选区无法再精确恢复；
* 此时可以不显示精确高亮，而不是伪造错误高亮。

### 10.4 `Change` 与 `Bullet` 语义不同

* `Bullet` 是用户输入事件；
* `Change` 是系统生成的候选审阅单元；
* 两者不能混用，字段也不应相互替代。

### 11.5 `currentVersionId` 表示正式版本上下文

V1 中：

* `active` 时，`currentVersionId` 通常等于 `baseVersionId`
* `reviewing` 时，`currentVersionId` 仍指向当前正式基底版本，而不是候选改动
* `history_preview` 时，`currentVersionId` 指向当前正在预览的历史 `versionId`
* 候选改动身份由 `activeReviewChangeSet.reviewChangeSetId` 承担

---

## 12. Out Of Scope

以下内容明确不属于本附录：

* Agent 本地 `CommentBulletResolution`
* comment 高亮的具体重映射算法
* diff hunk 的内部切分实现
* frontend 的局部编辑状态
* review 的视觉样式与动画资源
* bullet rail 的排布算法

---

## 13. 与其他文档的关系

* [PRD](/Users/ssunxie/code/AgentBoard/docs/01-product/PRD.md)
  定义产品目标、使用场景与核心价值。
* [Feature-Spec](/Users/ssunxie/code/AgentBoard/docs/01-product/Feature-Spec.md)
  定义页面行为、用户流程与交互规则。
* [Product-Interaction-State-Machine](/Users/ssunxie/code/AgentBoard/docs/01-product/Product-Interaction-State-Machine.md)
  定义顶层状态与状态迁移。
* [Domain-Model](/Users/ssunxie/code/AgentBoard/docs/02-models/Domain-Model.md)
  定义业务对象的职责与边界。
* [Document-Presentation-Model](/Users/ssunxie/code/AgentBoard/docs/02-models/Document-Presentation-Model.md)
  定义 Markdown 到 `DocumentUnit[]` 的派生与展示模型。
* [Frontend-Backend-Protocol](/Users/ssunxie/code/AgentBoard/docs/03-contracts/Frontend-Backend-Protocol.md)
  定义 snapshot、command 与 event 的交互方式。

本附录的职责是把这些文档中已经成立的对象与字段，收敛成统一可实现的 schema 规范。
