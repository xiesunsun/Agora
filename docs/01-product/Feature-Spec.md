# Agent 文本黑板会话 Feature Spec

## 1. 文档目标

本文档用于把 PRD 中的产品能力进一步细化为可实现的交互规格，重点定义：

* 每个页面区块负责展示什么；
* 每个核心对象如何产生、变化和结束；
* 用户每一步操作之后，系统具体如何响应；
* Flow Review、PR Review、版本切换、Proceed、关闭会话等核心路径的状态机。

本文档以当前确认的 MVP 方案为准。

## 2. 范围与原则

### 2.1 当前范围

当前 Feature Spec 只覆盖以下能力：

* Markdown 文档按文稿单元展示与编辑；
* 文稿单元级正文修改；
* 单个文稿单元内选区备注；
* bullet 事件队列；
* Agent 后台预处理；
* Proceed 回合提交；
* Flow Review；
* PR Review；
* 版本历史、版本恢复、关闭会话。

### 2.2 已明确移除

以下能力不在当前规格内：

* 全局备注；
* 新版本中继续展示旧版本 bullet；
* 多人协作；
* 多 Agent 协作；
* Proceed 过程中的取消操作。

### 2.3 核心原则

* 人类主导节奏，Agent 不主动推进回合。
* Agent 可在后台持续预处理，但只能在 `Proceed` 后正式修改正文。
* 页面中始终只有一个 Agent 小人。
* 用户最新正文始终是画布上看到的正文。
* 所有用户输入最终都转换为 bullet 事件参与 Agent 处理。

## 3. 核心对象

### 3.1 Session

表示一场黑板会话。

字段建议：

* `sessionId`
* `status`: `active | proceeding | reviewing | history_preview | closed`
* `currentVersionId`
* `workingSet`
* `activeReviewChangeSet`
* `versionHistory`

规则：

* 一个 Session 同时只有一个顶层状态；
* 一个 Session 同时最多只有一个 `activeReviewChangeSet`；
* `reviewMode = flow | pr` 属于 `reviewing` 状态下的交互视图，不是独立顶层状态。
* `currentVersionId` 表示当前页面所处的正式版本上下文，而不是待审阅候选结果的身份。

### 3.2 Version

表示一次正式提交后的文本版本。

字段建议：

* `versionId`
* `versionNumber`
* `content`
* `summary?`
* `diffFromPrevious`
* `createdAt`

规则：

* 只有 Agent 完成一次 `Proceed` 审阅结算，且至少存在一个 accepted change 时才生成新版本。
* 用户单纯编辑正文不会生成版本。

### 3.3 Working Set

表示当前工作现场。

字段建议：

* `baseVersionId`
* `currentContent`
* `documentUnits`
* `activeBullets`
* `suspended`

规则：

* `currentContent` 始终表示当前画布正文；
* 用户确认过的正文编辑必须立即写入 `currentContent`；
* `Proceed` 基于当前 `WorkingSet` 执行；
* `history_preview` 期间，`WorkingSet` 被挂起而不是被销毁。

### 3.4 Document Unit

表示一个独立展示和编辑的文稿单元。

字段建议：

* `unitId`
* `markdown`
* `type`
* `state`: `rendered | editing`
* `sourceStart`
* `sourceEnd`

规则：

* 页面默认以渲染态展示文稿单元。
* 同一时间只允许一个文稿单元进入编辑态。
* `sourceStart` / `sourceEnd` 表示该单元在当前 Markdown 真相中的源码切片范围。

### 3.5 Bullet

表示一个进入 Agent 处理队列的用户事件。

字段建议：

* `bulletId`
* `type`: `edit | comment`
* `status`: `new | processing | ready | applied`
* `unitId`
* `createdAt`
* `queueOrder`
* `displayAnchor`

说明：

* `Bullet` 是联合类型；
* `edit bullet` 与 `comment bullet` 共享公共字段，但载荷不同；
* `displayAnchor` 用于决定视觉上贴近哪段高亮或哪段内容显示，属于展示层定位信息；
* bullet 的视觉位置与队列顺序解耦。

`edit bullet` 额外字段建议：

* `beforeText`
* `afterText`

说明：

* `edit bullet` 由正文编辑确认后生成；
* 它的核心职责是通知 Agent “用户已经直接做了什么修改”；
* 它按文稿单元级编辑事实建模，不要求精确字符级选区锚点。

`comment bullet` 额外字段建议：

* `anchorTextSnapshot`
* `anchorStartOffset`
* `anchorEndOffset`
* `content`

说明：

* `comment bullet` 由选区备注提交后生成；
* `anchorTextSnapshot` 用于保留创建当时的关联文本快照；
* 文本型单元中的 `anchorStartOffset` / `anchorEndOffset` 用于确定该 bullet 在当前文稿单元内的输入锚点；
* `table` 与 `code_block` 的 comment 在 V1 中按整块批注处理，不强制要求字符级 offset；
* `content` 是用户提交的备注内容。

### 3.6 Review Change Set

表示一次 `Proceed` 生成的待审阅改动集。

字段建议：

* `reviewChangeSetId`
* `sourceWorkingSetRevision`
* `baseVersionId`
* `candidateContent`
* `changes`
* `status`: `open | resolved`

规则：

* 一次 `Proceed` 最多只生成一份 `ReviewChangeSet`；
* 一个 `ReviewChangeSet` 必须同时拥有 `candidateContent` 与 `changes`；
* `ReviewChangeSet` 结算前不能生成新的正式版本。

## 4. 页面区块

### 4.1 顶部控制区

包含：

* 当前会话标题；
* 当前版本号；
* Review 模式切换或当前模式标识；
* `Proceed` 按钮；
* 关闭会话入口。

输入：

* 当前会话状态；
* 当前版本信息；
* 当前是否存在 bullet；
* 当前是否处于 `reviewing`。

输出：

* 触发 `Proceed`；
* 切换审阅视图模式；
* 触发关闭请求。

### 4.2 正文画布区

包含：

* 文稿单元级 Markdown 渲染结果；
* 当前唯一可编辑文稿单元的 Markdown 编辑态；
* 文稿单元附近的 bullet 标记。

输入：

* 当前 `WorkingSet.currentContent`；
* 文稿单元列表；
* bullet 列表；
* 当前页面状态。

输出：

* 双击文稿单元进入编辑；
* 点击对勾确认编辑；
* 点击叉号取消编辑；
* 在单个可批注文稿单元内选区并右键创建备注；
* 点击已有 bullet 重新展开便利贴。

### 4.3 Bullet 轨道区

bullet 默认展示在正文右侧边缘。

规则：

* 默认贴右侧；
* 当同一区域 bullet 过多时，允许自动错位或分散布局；
* 必要时可扩展到两侧，但默认心智仍是右侧 bullet 轨道。

输出：

* 展示 `edit bullet` 与 `comment bullet`；
* 展示 bullet 的极简状态；
* 展示当前唯一 Agent 小人所在位置。

### 4.4 Agent 小人区

页面中只能有一个 Agent 小人。

规则：

* 平时附着在当前 `processing` 的 bullet 旁边；
* 若当前没有 `processing` bullet，则停留在中性待命状态；
* `Proceed` 期间进入全屏锁定流程时，小人参与整体进度动画。

### 4.5 版本与 diff 区

包含：

* 版本历史列表；
* 历史版本只读内容；
* “恢复此版本”操作。

规则：

* 历史版本默认只读；
* 只有显式“恢复此版本”后，目标版本才成为新的工作基底。
* V1 的历史查看不要求逐版本 summary 或 diff 详情。

### 4.6 Proceed 进度覆盖层

仅在 `Proceed` 期间出现。

包含：

* bullet 总进度，例如 `3/10`；
* 当前阶段文案：
  * `正在处理 bullet`
  * `正在统合修改方案`
  * `正在生成待审阅改动`

规则：

* `Proceed` 期间页面完全锁屏；
* 用户不能滚动、编辑、切版本、关闭会话或触发其他交互。

## 5. 状态模型

### 5.1 Session 状态

* `active`：正常编辑、创建 bullet、查看版本。
* `proceeding`：用户点击 `Proceed` 后，系统进入处理流程。
* `reviewing`：Agent 已生成待审阅改动集，进入 `flow` 或 `pr` 审阅视图。
* `history_preview`：用户正在只读查看某个历史版本。
* `closed`：会话已结束，页面显示结束态。

### 5.2 Document Unit 状态

* `rendered`：文稿单元以 Markdown 渲染结果展示。
* `editing`：文稿单元以原始 Markdown 文本编辑。

状态规则：

* 只允许一个文稿单元处于 `editing`；
* 切入新文稿单元编辑前，必须先结束已有编辑态。

### 5.3 Bullet 状态

* `new`：刚生成，尚未开始处理。
* `processing`：Agent 正在后台处理该 bullet。
* `ready`：该 bullet 的局部思考已完成，等待参与 `Proceed` 的全局统合。
* `applied`：该 bullet 已被某次 `Proceed -> reviewing -> 结算` 消化。

状态流转：

* `new -> processing -> ready -> applied`

补充规则：

* 若用户修改一个 `new bullet`，直接更新该 bullet。
* 若用户修改一个 `processing` 或 `ready` 的 bullet，不回写旧 bullet，而是新增一个 bullet 事件到队尾。
* `applied` 表示该 bullet 已被某轮 `Proceed -> reviewing -> 结算` 消化，不再作为下一轮待处理输入。

### 5.4 Review Change 状态

* `pending`：尚未被用户结算；
* `accepted`：已被用户接受；
* `rejected`：已被用户拒绝。

状态规则：

* `flow` 与 `pr` 共享同一组 `accepted / rejected / pending` 结果；
* 一旦某个 change 被 `accepted` 或 `rejected`，不再回到 `pending`。
* 当最后一个 `pending` 消失时，backend 自动结算当前 review。

## 6. 详细交互

### 6.1 正文编辑

#### 6.1.1 进入编辑

1. 用户双击某个文稿单元。
2. 若当前无其他文稿单元处于编辑态，该文稿单元切换为 `editing`。
3. 系统展示该文稿单元的原始 Markdown 文本。

限制：

* 同一时间只能编辑一个文稿单元。
* 点击页面其他区域不会自动保存，也不会自动取消；
* 用户必须显式点击对勾或叉号来结束编辑。

#### 6.1.2 确认编辑

1. 用户修改文稿单元 Markdown 内容。
2. 用户点击对勾。
3. 系统以该文稿单元的源码范围替换当前整篇 Markdown 中对应切片。
4. 系统重新解析整篇 Markdown，并按容错规则派生新的 `DocumentUnit[]`。
5. 该文稿单元退出编辑态，回到渲染态。
6. 系统自动生成一条 `edit bullet`。
7. Agent 可开始后台处理这条 `edit bullet`。

结果：

* 画布正文立即显示用户最新修改；
* 更新当前 `WorkingSet.currentContent`；
* 生成 bullet 队列事件。
* 新的文稿单元类型、边界和 `unitId` 以重解析结果为准。

#### 6.1.3 取消编辑

1. 用户点击叉号。
2. 系统丢弃当前文稿单元未确认修改。
3. 文稿单元退出编辑态。
4. 不生成 `edit bullet`。

### 6.2 选区备注

#### 6.2.1 创建 comment bullet

1. 用户在单个可批注文稿单元内发起备注。
2. 若该单元支持文本选区，用户可选中文本并通过右键进入备注输入。
3. 若该单元为 `table` 或 `code_block`，页面直接以整块为目标进入备注输入。
4. 页面在相关位置弹出便利贴输入态。
5. 用户输入备注内容，可多行输入。
6. 用户按 `Cmd+Enter` 提交。
7. 对文本型单元，系统记录 `anchorTextSnapshot`、`anchorStartOffset` 与 `anchorEndOffset`。
8. 便利贴收起。
9. 页面在相关文稿单元附近生成一条 `comment bullet`。
10. Agent 可开始后台处理这条 bullet。

限制：

* 文本选区备注只能落在单个支持文本选区的文稿单元内；
* `table` 与 `code_block` 在 V1 中按整块备注处理；
* 不支持跨多个文稿单元创建选区备注。

#### 6.2.2 编辑已有 comment bullet

1. 用户点击已有 bullet。
2. bullet 原地展开为便利贴。
3. 用户修改备注内容后按 `Cmd+Enter`。

规则：

* 若 bullet 状态为 `new`，直接修改原 bullet；
* 若 bullet 状态为 `processing` 或 `ready`，生成一个新的 bullet 事件：
  * 视觉上贴近原文本位置；
  * 队列顺序追加到末尾。

### 6.3 Bullet 队列与 Agent 后台处理

#### 6.3.1 队列规则

* Agent 按 bullet 创建时间顺序处理；
* `displayAnchor` 仅决定视觉展示位置，不决定处理顺序；
* 删除、重写、追加正文后，画布始终显示最新正文；
* 原来被批注的高亮文字可以消失，但原 bullet 仍可保留在队列语义中。

#### 6.3.2 Agent 后台处理

规则：

* bullet 一生成，Agent 就可以开始后台预处理；
* 预处理只代表 Agent 对该局部事件形成初步思考；
* 预处理不会直接修改正文；
* 预处理不会生成新版本；
* 页面中只显示极简状态，不展示中间推理内容。
* V1 中，bullet 的完整局部处理结果保存在当前 `subagent` 的本地工作区，而不是 backend 的正式会话对象中；
* backend 只持有 bullet 的生命周期状态，不持有完整局部处理草稿；
* 当 bullet 被当前 Agent 接手后，可自动从 `new` 进入 `processing`；
* 当 Agent 确认该 bullet 的局部处理已完成时，该 bullet 才进入 `ready`。

#### 6.3.3 Agent 小人行为

规则：

* 页面中始终只有一个 Agent 小人；
* 小人只跟随当前 `processing` 的 bullet；
* 多条 bullet 并存时，小人按队列顺序移动；
* 用户看到的是“当前正在处理哪条 bullet”，而不是全部 bullet 的详细处理过程。

### 6.4 Proceed

#### 6.4.1 点击 Proceed

`Proceed` 只在 `active` 状态下可触发。

分两种情况：

#### 情况 A：不存在任何 bullet 输入

1. 用户点击 `Proceed`。
2. 系统提示：`无任何修改`。
3. 用户确认后，系统不触发 Agent 处理。
4. 不生成新版本。
5. 页面保持当前状态不变。

#### 情况 B：存在 bullet

1. 用户点击 `Proceed`。
2. 页面进入 `proceeding` 状态。
3. 页面完全锁屏。
4. 显示 bullet 总进度，例如 `3/10`。
5. 已 `ready` 的 bullet 直接计入已完成数。
6. `new` 或 `processing` 的 bullet 继续后台处理，直到全部完成。
7. 当进度达到 `10/10` 后，页面进入 `正在统合修改方案`。
8. Agent 基于：
   * 所有 bullet 的局部处理结果；
   * 当前最新 `WorkingSet.currentContent`；
   进行一次统一统合。
9. 统合完成后，页面进入 `正在生成待审阅改动`。
10. Agent 根据统一方案生成 `reviewChangeSet`。
11. 页面进入 `reviewing`，默认展示 `flow` 视图。

#### 6.4.2 Proceed 的本质

`Proceed` 不是让 Agent 从零开始处理 bullet，而是：

* 等待所有 bullet 完成局部预处理；
* 将这些局部结果统一统合；
* 再生成一份待审阅改动集，而不是直接落正式版本。

#### 6.4.3 Proceed 中断

规则：

* 用户不能主动取消 `Proceed`；
* 若发生异常、打断或 Agent 意外停止：
  * 本次 `Proceed` 视为失败；
  * 页面回到 `Proceed` 前状态；
  * 不生成新版本；
  * 不写入半成品候选正文。

### 6.5 Flow Review

Flow Review 是默认模式。

进入 `reviewing(flow)` 后：

1. 系统展示整篇正文上的 inline tracked changes；
2. `pending` 插入内容高亮显示；
3. `pending` 删除内容以删除线和弱化颜色显示；
4. `pending` 替换内容表现为“旧内容删除线 + 新内容高亮”；
5. 用户可执行：
   * `Accept All Remaining`
   * `Reject All Remaining`
6. 用户可切换到 `pr` 视图做逐项审阅。

规则：

* `accepted` 内容按正常正文渲染，不再高亮；
* `rejected` 内容回退为本轮 `Proceed` 前的基底内容，不再高亮；
* `flow` 与 `pr` 共享同一份 change 结算结果。
* 若当前操作后不存在任何 `pending` change，backend 自动结算当前 review。

### 6.6 PR Review

`PR Review` 是 `reviewing` 下的逐项审阅视图。

1. 页面按语义 hunk 展示当前 `pending` 改动；
2. 用户可对每个 hunk 执行：
   * `Accept`
   * `Reject`
3. 用户可随时切回 `flow` 视图；
4. 在 `pr` 中已处理过的结果，切回 `flow` 时必须立即反映到整篇正文中。

规则：

* `pr` 不提供 `Comment` 动作；
* `pr` 与 `flow` 只是同一份 `reviewChangeSet` 的两种视图；
* 若在 `pr` 中已接受部分改动，再到 `flow` 中执行 `Reject All Remaining`，则只拒绝剩余 `pending` 改动。
* 若当前操作后不存在任何 `pending` change，backend 自动结算当前 review。

### 6.7 审阅结算

#### 6.7.1 至少存在一个 accepted

1. 系统生成新的正式版本。
2. 本轮参与处理的 bullet 统一进入 `applied`。
3. 页面退出 `reviewing`，回到新的 `active` 工作态。
4. 当前画布切换为新的正式版本正文。

#### 6.7.2 全部 rejected

1. 系统不生成新版本。
2. 页面回到本轮 `Proceed` 前的当前工作现场。
3. 本轮参与处理的 bullet 统一进入 `applied`。
4. 页面退出 `reviewing`，回到 `active`。

自动触发规则：

* 不要求用户额外点击“完成审阅”
* 当最后一个 `pending` change 被处理后，系统立即根据当前接受/拒绝结果自动结算

### 6.8 版本切换

#### 6.8.1 查看历史版本

1. 用户点击历史版本。
2. 当前 `WorkingSet` 被挂起。
3. 页面进入目标版本只读视图。
4. 用户可继续切换查看其他历史版本。
5. 用户可返回当前工作区。

规则：

* 进入历史查看默认不丢弃当前现场；
* 若当前存在段落 `editing`，必须先完成或取消该编辑；
* 历史查看态不可直接编辑正文，不可创建 bullet，不可点击 `Proceed`。

#### 6.8.2 恢复历史版本

1. 用户在历史版本只读视图点击 `恢复此版本`。
2. 系统提示该操作会替换当前未落版现场。
3. 用户确认后，该历史版本成为新的当前工作基底。
4. 当前未结算 bullet 队列被清空。
5. 当前 Agent 基于旧工作基底形成的本地草稿与局部处理结果全部失效。
6. 页面回到 `active`。

规则：

* 历史版本默认不可直接编辑；
* 必须显式恢复后才可继续工作。
* 恢复历史版本不生成额外 bullet；
* 它代表一次系统级 `WorkingSet` 重建，而不是普通用户输入事件。

### 6.9 关闭会话

#### 6.9.1 关闭前检查

1. 用户点击关闭会话。
2. 若当前存在段落 `editing`，必须先完成或取消该编辑。
3. 若当前存在未落版现场，弹确认：
   * `关闭会话将结束当前协作，当前未落版现场不会继续保留`
4. 用户取消则留在当前会话。
5. 用户确认则发起关闭请求。

#### 6.9.2 关闭后状态

1. backend 启动会话收尾流程，并等待当前 `subagent` 生成会话总结。
2. `subagent` 调用正式 `close_session` 后，页面进入 `closed` 状态。
3. 页面展示已结束态提示。
4. 聊天窗口展示会话总结。

规则：

* 前端关闭动作是关闭请求，不是正式 closed 的唯一入口；
* 结束态页面只负责收尾提示；
* 真正总结内容在聊天窗口承接。

## 7. 输入输出定义

### 7.1 正文编辑

输入：

* 双击段落；
* 编辑 Markdown；
* 点击对勾或叉号。

输出：

* 更新 `WorkingSet.currentContent`；
* 重新渲染段落；
* 生成或不生成 `edit bullet`。

### 7.2 选区备注

输入：

* 单个可批注文稿单元内选区；
* 右键打开便利贴；
* 输入备注；
* `Cmd+Enter` 提交。

输出：

* 生成 `comment bullet`；
* 可触发 Agent 后台预处理。

### 7.3 Proceed

输入：

* 用户点击 `Proceed`。

输出：

* 无修改时：提示后 no-op；
* 有输入时：进入进度动画、方案统合、生成 `reviewChangeSet`；
* 最终进入 `reviewing` 或失败回滚。

### 7.4 版本切换

输入：

* 点击历史版本；
* 点击恢复此版本。

输出：

* 进入只读历史版本；
* 或恢复为新的当前工作基底。

### 7.5 关闭会话

输入：

* 点击关闭；
* 关闭确认。

输出：

* 结束当前协作会话；
* 进入已结束态页面；
* 聊天窗口输出总结。

## 8. 异常与边界

### 8.1 Markdown 语法异常

* 用户保存段落时采用容错策略；
* 不因轻微 Markdown 语法问题阻止保存。

### 8.2 正文已变但旧高亮消失

* 允许原高亮文本消失；
* bullet 仍可保留；
* 视觉位置可继续贴近相关段落。

### 8.3 Proceed 期间页面交互

* 禁止滚动；
* 禁止编辑；
* 禁止切版本；
* 禁止关闭会话；
* 禁止触发其他操作。

### 8.4 新版本中的旧 bullet

* 不展示；
* 不在新版本主界面继续管理。

## 9. 待后续细化但不阻塞当前实现

以下内容可在后续版本继续收紧，但不阻塞当前 Feature Spec：

* bullet 的精确视觉样式；
* 右侧拥挤时的自动排布算法；
* PR Review 中 hunk 的切分策略；
* Agent 小人的具体动画资源与切换帧；
* bullet 与段落的像素级定位策略。
