# Agent CLI

## 1. 文档目标

本文档定义 MVP 阶段 `Blackboard` 的 Agent CLI。

本文档只回答以下问题：

* `subagent` 通过哪些命令操作黑板会话；
* 每个命令的语义、输入、输出和副作用是什么；
* 哪些内容属于 backend 业务状态；
* 哪些内容只属于 `subagent` 本地工作区。

本文档不展开：

* Browser 前后端线协议；
* SSE / WebSocket 等 transport 细节；
* review 视图的 UI 表现；
* `main agent` 与宿主平台的通用子代理编排协议。

---

## 2. 运行形态

### 2.1 角色

V1 中涉及 4 个核心角色：

* `main agent`
  总任务 owner，负责决定是否进入黑板协作模式。
* `subagent`
  专用 blackboard worker，负责在自己的上下文中持续托管当前黑板会话。
* `backend`
  黑板业务状态真相持有者。
* `frontend`
  人类操作黑板的网页界面。

### 2.2 基本关系

V1 的标准流程是：

1. `main agent` 判断某段任务需要进入可视化协作。
2. `main agent` 派出专用 `subagent`。
3. `subagent` 调用 Agent CLI 创建并托管黑板会话。
4. 人类主要在网页中编辑、批注、审阅和点击 `Proceed`。
5. `subagent` 在自己的上下文中持续处理事件、维护本地工作区，并在 `Proceed` 后提交整篇候选正文。
6. 会话关闭后，结果与总结回传给 `main agent`。

### 2.3 总体交互模型

V1 整体采用：

* `command + event stream`

但对 `subagent-facing CLI` 而言：

* CLI 只暴露高层业务命令；
* runtime 将黑板事件桥接进当前 Agent 长会话；
* 不设计显式 `await_event` 作为 V1 核心命令。

---

## 3. 设计原则

### 3.1 backend 是业务状态真相

以下内容由 backend 持有：

* `WorkingSet.currentContent`
* `Bullet`
* `Bullet.status`
* `ReviewChangeSet`
* `Version`

### 3.2 subagent 本地工作区承载思考过程

以下内容默认只存在于当前 `subagent` 的本地工作区：

* `CommentBulletResolution`
* snapshot 工作副本
* `Proceed` 统合草稿
* candidate draft
* 为处理 bullet 而保存的私有笔记、研究材料与中间文件

说明：

* 这些内容是 Agent 的工作产物，不是 backend 的正式会话对象；
* 这些内容必须被视为可重建缓存，而不是业务真相。

### 3.3 BulletResolution 不进入 backend

V1 中：

* `CommentBulletResolution` 是 `subagent-local working object`；
* backend 不持有其完整内容；
* backend 只感知 bullet 生命周期状态，例如 `new -> processing -> ready -> applied`。

### 3.4 Proceed 的职责边界

`Proceed` 发生后：

* backend 负责进入 `proceeding` 状态并驱动前端展示进度；
* `subagent` 负责基于本地 `CommentBulletResolution` 与最新 snapshot 进行统一统合；
* `subagent` 只向 backend 提交整篇 `candidateContent`；
* backend 再基于 `WorkingSet.currentContent` 与 `candidateContent` 生成 `ReviewChangeSet` 和 `Change[]`。

---

## 4. 本地工作区约定

### 4.1 目的

本地工作区用于让 `subagent`：

* 保存 `main agent` 交付的初始任务上下文；
* 保存当前 snapshot 的工作副本；
* 维护每条 `comment bullet` 的局部处理结果；
* 维护 `Proceed` 前的统合计划与候选正文草稿；
* 在需要时查资料、写临时笔记、反复推敲修改方案。

V1 建议约定：

* `main agent` 交给 `subagent` 的任务上下文优先落为 `mainAgentInfo.md`；
* 该文件属于当前 `subagent` 的私有工作文件，不是 backend 会话状态的一部分。

### 4.2 可重建原则

本地工作区中的内容必须满足：

* 可以被丢弃；
* 可以基于最新 snapshot 重新构建；
* 不被视为 session 真相。

### 4.3 失效条件

以下事件发生时，当前本地工作区必须整体视为失效：

* 用户恢复历史版本为新的工作基底；
* 当前黑板会话被正式关闭；
* runtime 明确告知当前 `WorkingSet` 已重建或重置。

失效后，`subagent` 必须：

1. 丢弃基于旧 `WorkingSet` 形成的本地草稿；
2. 重新调用 `get_snapshot`；
3. 基于新的 snapshot 重建本地工作区。

---

## 5. 命令总览

V1 的 `subagent-facing CLI` 最小命令集合为：

* `create_session`
* `get_snapshot`
* `mark_bullet_ready`
* `submit_review_candidate`
* `close_session`

这些命令全部是高层业务命令。

V1 明确不提供：

* `attach_session`
* `await_event`
* `subscribe_events`
* `commit_bullet_resolution`
* `save_bullet_resolution`

---

## 6. 命令定义

### 6.1 `create_session`

#### 定义

创建并启动一场新的黑板会话。

#### 调用方

* 当前专用 `subagent`

#### 输入

最小输入建议：

* `title`
* `initialContent`

可扩展输入可在后续版本补充，例如：

* 初始化上下文
* 页面展示偏好
* 会话级元数据

V1 当前约束：

* 黑板前端采用固定的 blackboard shell；
* `subagent` 不生成任意 HTML 页面；
* `subagent` 只负责生成要进入黑板的初始内容；
* 当前只支持一种展示模式：`document`。

#### 输出

最小输出建议：

* `sessionId`

#### 副作用

* 创建新的 `BlackboardSession`
* 创建当前 `WorkingSet`
* 初始化 `WorkingSet.currentContent`
* 打开或关联对应 HTML 页面

#### 说明

V1 采用：

* `subagent create_session`

而不是：

* `main agent create + subagent attach`

---

### 6.2 `get_snapshot`

#### 定义

主动读取当前黑板会话的最新快照。

#### 调用方

* 当前专用 `subagent`

#### 输入

* `sessionId`

#### 输出

最小输出应覆盖：

* 当前 `BlackboardSession.status`
* 当前 `WorkingSet.currentContent`
* 当前 `baseVersionId`
* 当前 `activeBullets`
* 当前 `activeReviewChangeSet` 概要（若存在）

#### 用途

`get_snapshot` 是辅助理解工具，不是主同步机制。

它主要用于：

* 会话刚创建后建立本地工作区；
* `Proceed` 前重新确认最新正文；
* 本地工作区失效后重建；
* 调试与兜底恢复。

---

### 6.3 `mark_bullet_ready`

#### 定义

将指定 bullet 的状态从 `processing` 标记为 `ready`。

#### 调用方

* 当前专用 `subagent`

#### 输入

* `sessionId`
* `bulletId`

#### 输出

* 成功确认

#### 副作用

* backend 将该 bullet 的状态更新为 `ready`
* frontend 可据此更新 bullet 队列展示和 Agent 小人状态

#### 说明

此命令是极轻量状态提交。

它不提交：

* `CommentBulletResolution`
* `changeIntent`
* `rationale`
* 任何本地工作区内容

V1 中：

* `new -> processing` 由 runtime/backend 自动推进；
* `processing -> ready` 由 `subagent` 显式调用本命令推进。

---

### 6.4 `submit_review_candidate`

#### 定义

在 `Proceed` 阶段完成统一统合后，向 backend 提交整篇候选正文。

#### 调用方

* 当前专用 `subagent`

#### 输入

* `sessionId`
* `candidateContent`

#### 输出

* 成功确认

#### 副作用

* backend 创建新的 `ReviewChangeSet`
* backend 基于当前 `WorkingSet.currentContent` 与 `candidateContent` 生成 `Change[]`
* 会话进入 `reviewing`

#### 说明

V1 中，本命令只提交：

* `candidateContent`

不提交：

* `BulletResolution` 列表
* `changeIntent`
* diff
* review hunk

这些内容要么属于 `subagent` 本地工作区，要么由 backend 根据候选正文自行生成。

---

### 6.5 `close_session`

#### 定义

在用户已发起关闭请求后，正式结束当前黑板会话。

#### 调用方

* 当前专用 `subagent`

#### 输入

* `sessionId`

#### 输出

最小输出建议：

* `sessionId`
* `status = closed`
* 会话总结上下文

#### 副作用

* `BlackboardSession.status` 进入 `closed`
* 页面进入结束态
* 当前会话不再接受新的协作输入

#### 说明

会话关闭后，结果与总结应回传给 `main agent`，而不是停留在当前 `subagent` 内部。

V1 中：

* frontend 的关闭动作只是关闭请求；
* `close_session` 才是正式 closed 的唯一 CLI 入口。

---

## 7. Bullet 处理模型

### 7.1 `edit bullet`

`edit bullet` 表示：

* 用户已经直接修改了正文

它的核心职责不是请求 Agent 决定要不要改，而是通知 Agent：

* 用户已经将某段内容从 `beforeText` 改成了 `afterText`

`subagent` 对 `edit bullet` 的主要任务是：

* 理解用户改了什么；
* 将该修改视为新的工作现场事实；
* 避免后续统合时覆盖用户的直接编辑。

### 7.2 `comment bullet`

`comment bullet` 表示：

* 用户对某段文本提出了需要 Agent 理解和回应的备注输入

`subagent` 对 `comment bullet` 的主要任务是：

* 结合当前最新正文理解用户意图；
* 在本地形成 `CommentBulletResolution`；
* 需要时查资料、记录笔记、维护草稿；
* 当局部处理完成后调用 `mark_bullet_ready`。

### 7.3 `CommentBulletResolution`

V1 中，`CommentBulletResolution` 是：

* `subagent-local working object`

它不是 backend 持久化对象。

它至少应承载：

* `bulletId`
* `targetUnitId`
* `targetTextSnapshot`
* `changeIntents`
* `rationale`

其中：

* `changeIntents` 必须是结构化修改指令，而不是自然语言复述；
* `targetTextSnapshot` 是 resolution 级上下文锚点；
* `changeIntents[].targetText` 是动作级执行锚点；
* 一条 `comment bullet` 只对应一条当前有效的 resolution，不通过覆盖旧 resolution 表达新变化。

---

## 8. 典型工作流

### 8.1 创建会话

1. `main agent` 判断任务需要进入 blackboard 协作。
2. `main agent` 派出专用 `subagent`。
3. `subagent` 将主任务上下文保存到本地 `mainAgentInfo.md`。
4. `subagent` 调用 `create_session`。
5. `subagent` 调用 `get_snapshot`，初始化本地工作区。

### 8.2 处理单条 bullet

1. frontend 创建新的 `bullet`。
2. backend 记录该 bullet，初始状态为 `new`。
3. runtime 将该 bullet 交给当前 `subagent` 处理。
4. backend 自动将其推进为 `processing`。
5. `subagent` 在本地工作区处理中间思考、resolution 与草稿。
6. 局部处理完成后，`subagent` 调用 `mark_bullet_ready`。
7. backend 将该 bullet 更新为 `ready`。

### 8.3 Proceed 收敛

1. 用户点击 `Proceed`。
2. backend 进入 `proceeding`。
3. 若仍存在 `new` 或 `processing` 的 bullet，系统等待其全部变为 `ready`。
4. `subagent` 基于本地 resolutions 与最新 snapshot 进行统一统合。
5. `subagent` 形成整篇 `candidateContent`。
6. `subagent` 调用 `submit_review_candidate`。
7. backend 生成 `ReviewChangeSet` 与 `Change[]`，并进入 `reviewing`。

### 8.4 恢复历史版本

1. 用户在 `history_preview` 中执行 `恢复此版本`。
2. backend 重建当前 `WorkingSet`。
3. 当前未结算 bullet 队列被整体清空。
4. runtime 告知当前 `subagent`：旧工作区已失效。
5. `subagent` 丢弃旧本地草稿并重新 `get_snapshot`。

---

## 9. 非目标

以下内容明确不属于 V1 Agent CLI：

* 前端页面的具体 UI 动作接口
* `await_event` 一类显式阻塞式事件消费命令
* backend 持久化 `BulletResolution`
* worker 接管、attach、transfer
* 多 subagent 协同同一 session
* server-side replay `CommentBulletResolution`

---

## 10. 与其他文档的关系

本文档与其他文档的分工如下：

* `PRD`
  负责定义产品目标、整体形态与用户价值。
* `Feature-Spec`
  负责定义页面功能、交互路径与行为规则。
* `Domain-Model`
  负责定义 `BlackboardSession`、`WorkingSet`、`Bullet`、`ReviewChangeSet`、`Change`、`Version` 等核心业务对象。
* `Product-Interaction-State-Machine`
  负责定义顶层状态与交互状态迁移。
* 本文档
  负责定义 `subagent` 如何通过 CLI 托管黑板会话。

后续仍需补充：

* `前后端协议文档`
* `事件 / schema 附录`
