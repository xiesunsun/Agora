# Blackboard Collaboration Skill Spec

## 1. 文档目标

本文档用于定义当前阶段的 **Blackboard Collaboration Skill**。

本文档的目标不是产出最终可发布的 skill 文案，而是先把这项能力的核心定位、统一工作流、角色边界与 prompt handoff 约束固定下来，作为后续 skill 设计、实现与迭代的基础。

本文档重点回答以下问题：

* 这项 skill 到底是什么能力；
* 为什么它应被定义为一份统一 skill，而不是 `main agent` / `subagent` 两份独立 skill；
* `main agent` 与 `subagent` 在这项 skill 中分别承担什么职责；
* 二者的职责切换如何完成；
* 当前 `Codex` 目标下，哪些约束属于稳定 skill 合同，哪些只是宿主实现细节。

本文档当前不回答：

* 最终对外命名是否保持不变；
* 最终 skill 文件应该如何拆分为平台具体配置；
* 非 `Codex` 宿主的后续适配方式；
* 最终 prompt 文案的逐句措辞优化。

---

## 2. Skill 定位

### 2.1 这是一项统一的黑板协作能力

`Blackboard Collaboration Skill` 的定位是：

> 让 agent 在 human-in-the-loop 的黑板会话中，与人类围绕同一份文本持续协作、推进、审阅与收敛的一项统一能力。

它首先是一条完整的协作工作流，而不是某个单独角色的局部技巧。

因此，本文不把它定义为：

* 一份 `main agent skill`；
* 一份 `subagent skill`；
* 两份彼此独立、只在外层编排上相遇的 skill。

更准确地说：

* skill 定义的是统一的 blackboard collaboration workflow；
* `main agent` 与 `subagent` 只是该 workflow 中承担不同职责的两个角色。

### 2.2 角色差异不等于 skill 拆分

虽然 `main agent` 与 `subagent` 的职责明显不同，但这不构成拆成两份 skill 的理由。

原因在于：

* 它们服务的是同一项产品能力；
* 它们共享同一套核心对象、状态边界与协作流程；
* 它们的差异主要体现在职责、工具使用范围、上下文持有方式与回传义务上；
* 这些差异更适合作为 role contract 定义，而不是作为两份产品能力拆开定义。

因此，本文采用：

* 一份统一 skill spec；
* 两个角色合同：
  * `Main Agent Contract`
  * `Subagent Contract`

---

## 3. 设计原则

### 3.1 workflow 统一，role 显式

本文将 blackboard 协作定义为一条统一 workflow。

当 `main agent` 需要把任务委派给 `subagent` 时，角色切换必须显式发生。`subagent` 不应依赖“自行猜测当前职责”来决定行为，而应收到明确的 role contract。

### 3.2 role 通过 prompt handoff 注入

当前阶段，本文明确采用以下约束：

* `main agent -> subagent` 的职责切换通过任务提示词 handoff 完成；
* 在 `Codex` 中，`main agent` 首次启动的是原生 `subagent`；
* 该原生 `subagent` 的 `agent_id` 会被宿主持久化为后续直接控制用的 `threadId`。

这意味着：

* 当前角色身份要写进 prompt；
* 当前任务目标要写进 prompt；
* 职责边界与禁区要写进 prompt；
* 预期输出与回传方式要写进 prompt。

### 3.3 backend 是业务真相，agent 工作区是可重建缓存

与现有 PRD / CLI 文档一致，本文继续采用以下原则：

* backend 持有 blackboard 业务状态真相；
* `subagent` 本地工作区承载中间思考、局部 resolution、candidate draft 与私有笔记；
* 本地工作区不是正式业务状态；
* 本地工作区必须被视为可重建缓存，而不是不可丢失资产。

### 3.4 黑板页面是主协作现场

一旦进入 blackboard collaboration，用户的主要协作现场应转移到黑板页面。

Agent 的中间处理与正式回应应围绕黑板页面的版本、review 与 proceed 节奏展开，而不是退回普通聊天流作为主交互界面。

### 3.5 V1 采用单一 `subagent` 托管模型

当前阶段，本文对执行模型进一步收敛为：

* 一个 blackboard session 只由一个专用 `subagent` 托管；
* 该 `subagent` 从创建会话开始持续工作到正式关闭；
* V1 不讨论多个 `subagent` 协同同一 session；
* V1 不讨论 session 在多个 worker 之间的接管、迁移或恢复。

这里的 `subagent` 不是一个抽象的“任意处理者集合”，而是当前 session 的唯一执行 owner。

### 3.6 事件以串行队列方式交付给 `subagent`

V1 中，宿主不应将黑板事件无序推送给 `subagent`。

应采用如下模型：

* 宿主为当前 session 维护一个面向单一 `subagent` 的串行事件队列；
* 同一时刻只允许 `subagent` 处理一个当前事件；
* 新事件必须先入队，不能直接打断当前处理；
* 只有当前事件处理回合结束后，宿主才可交付下一个事件。

这一定义用于约束当前阶段的宿主执行语义，不改变 backend 作为会话业务真相持有者的地位。

### 3.7 `Codex` 宿主采用一事件一回合

对于当前目标宿主 `Codex`，V1 进一步约束为：

* 宿主每次只向当前 `subagent` 交付一个 blackboard 事件；
* `subagent` 围绕该事件完成本地思考、文件更新与必要工具调用；
* 当该次回答回合收到 `turn/completed` 时，当前事件才视为处理完成；
* 只有此时，宿主才可将队列中的下一个事件交给同一个 `subagent`。

---

## 4. 核心假设

### 4.1 黑板会话的本质

黑板会话是一次围绕同一份文本持续推进的 human-agent 协作过程。

在该过程中：

* 人类可以直接修改正文；
* 人类可以对局部内容添加批注；
* Agent 可以后台跟随这些输入；
* 但 Agent 只能在 `Proceed` 后正式形成候选修改并进入审阅。

### 4.2 `main agent` 与 `subagent` 的关系

本文中：

* `main agent` 是总任务 owner；
* `subagent` 是 blackboard 会话的专用执行角色。

`subagent` 负责托管当前 blackboard session，并在自己的上下文中持续处理与该 session 直接相关的工作。

说明：

* 本文中的 `subagent` 是一个角色名；
* 在当前 `Codex` 目标下，该角色由一个原生 `subagent thread` 承载；
* `main agent` 启动该原生 `subagent` 后，宿主持久化其 `threadId`；
* 后续 session 事件不再通过 `main agent` 转发，而是直接交给该 `subagent thread`；
* 在当前实现中，这个 direct-to-thread 过程由 host-adapter 负责，不属于 `main agent` 的普通对话职责。

### 4.3 进入 blackboard 是任务层决策

是否进入 blackboard collaboration，不是 `subagent` 自主决定的事情。

它首先是 `main agent` 的任务层判断：

* 当前问题是否需要可视化文本协作；
* 当前文本是否需要持续版本推进；
* 当前修改是否值得进入黑板审阅节奏；
* 当前问题是否需要由专用 blackboard 执行角色持续托管。

---

## 5. 统一 Workflow

### 5.1 总体流程

`Blackboard Collaboration Skill` 的统一流程如下：

1. `main agent` 判断当前任务需要进入 blackboard collaboration。
2. `main agent` 整理目标、上下文、约束与交付要求。
3. `main agent` 通过 prompt handoff 派出 `subagent`。
4. 宿主持久化该原生 `subagent` 的 `threadId`。
5. `subagent` 将 handoff 落为本地 `mainAgentInfo.md`，并创建、托管 blackboard session。
6. 人类在黑板页面中阅读、编辑、批注并点击 `Proceed`。
7. 宿主将 session 事件按串行队列逐次交付给该 `subagent thread`。
8. `subagent` 维护本地工作区、处理 bullet，并在 `Proceed` 后统合候选正文。
9. backend 基于候选正文生成 review change set。
10. 人类完成 review，接受或拒绝改动，并形成新版本或返回继续编辑。
11. 会话结束后，`subagent` 将结果与总结回传给 `main agent`。
12. `main agent` 基于回传结果继续推进上层总任务。

### 5.2 skill 覆盖的核心动作

这项 skill 至少应覆盖以下动作语义：

* 判断是否需要打开黑板；
* 初始化黑板会话；
* 把进入黑板的初始文本组织为适合协作的文稿；
* 理解人类正文编辑与批注；
* 以串行回合方式处理 blackboard 事件；
* 在 `Proceed` 后生成候选修改；
* 配合 review 与版本推进；
* 在会话结束后输出结构化总结。

### 5.3 skill 不等于 CLI 命令表

skill 不直接等于 CLI 命令集合。

CLI 解决的是：

* agent 可以调用哪些正式工具；
* 工具的输入输出与副作用是什么。

skill 解决的是：

* 何时使用这些工具；
* 在什么顺序使用；
* 使用前后如何理解当前会话语义；
* 如何把工具操作组织成完整协作流程。

---

## 6. Main Agent Contract

### 6.1 角色定义

`main agent` 是总任务 owner。

它不长期托管 blackboard session，而负责：

* 判断是否进入 blackboard collaboration；
* 组织初始任务上下文；
* 把任务交给 `subagent`；
* 在 blackboard 会话结束后接收总结与结果；
* 继续推进上层总任务。

### 6.2 核心职责

`main agent` 的核心职责包括：

* 判断当前问题是否适合进入黑板协作；
* 明确 blackboard 会话要解决的目标问题；
* 整理与该会话相关的背景、约束、成功标准与已有结论；
* 构造对 `subagent` 的 prompt handoff；
* 启动原生 `subagent` 并记录其 `threadId`；
* 在黑板会话结束后吸收结果并恢复主任务流程。

对于写作型 blackboard 会话，`main agent` 默认只应提供：

* 主题；
* 目标；
* 上下文；
* 关键约束；
* 成功标准。

`main agent` 默认不应先写出整篇起稿，再把它交给 `subagent` 执行。除非人类明确要求保留 `main agent` 给出的原句，否则首版讨论文稿应由 `subagent` 在启动回合内生成。

对于真实 blackboard 协作，上述 handoff 至少必须包含：

* `Role`
* `Task Goal`
* `Why Blackboard`
* `Context`
* `Initial Content`
* `Success Criteria`
* `Startup Contract`
* `Return Contract`

其中 `Initial Content` 不要求由 `main agent` 提供完整正文。更常见且更符合角色分工的做法是：

* `main agent` 在该段说明希望 `subagent` 生成什么样的首版文稿；
* `subagent` 基于主题、目标、上下文与约束，自行形成首版 `sessionDocument.md`；
* 只有当人类明确要求以某段既定文字作为开头时，`main agent` 才应在 `Initial Content` 中直接放入完整正文。

### 6.3 不负责的事情

`main agent` 默认不负责：

* 长时间驻留于 blackboard session 内处理细粒度事件；
* 直接维护当前 session 的本地工作区；
* 直接处理每条 bullet 的局部 resolution；
* 先行完成整篇正文起稿，再把其余工作交给 `subagent`；
* 在每次 `Proceed` 后亲自统合候选正文。
* 手工向 `subagent` 逐条转发后续 blackboard 事件。

如果未来某个平台场景需要由单线程 agent 同时承担两类职责，那属于实现退化形态，而不是本文默认形态。

### 6.4 对 `subagent` 的交付义务

当 `main agent` 派出 `subagent` 时，必须向其交付足够的任务上下文。

至少应包括：

* 当前总任务要解决什么问题；
* 为什么此处需要进入 blackboard collaboration；
* 本次 blackboard 会话的目标产物是什么；
* 有哪些关键约束不能违反；
* 本地工作区至少应维护哪些稳定文件；
* 当前回合结束前必须完成哪些工具动作；
* 会话结束后应该回传什么。

---

## 7. Subagent Contract

### 7.1 角色定义

`subagent` 是 blackboard 会话的专用执行角色。

它负责在自己的上下文中持续托管当前 blackboard session，并承担会话内部的主要执行工作。

### 7.2 核心职责

`subagent` 的核心职责包括：

* 创建并启动 blackboard session；
* 初始化并维护本地工作区；
* 保存 `main agent` 交付的任务上下文；
* 在本地维护 `mainAgentInfo.md` 与 `sessionDocument.md`；
* 跟踪用户正文编辑、批注与当前 active bullets；
* 在 `Proceed` 后基于最新 snapshot 与本地 resolutions 进行统一统合；
* 提交整篇候选正文以进入 review；
* 在会话关闭后向 `main agent` 回传结果与总结。

在当前 `Codex` 目标下，`subagent` 的持续执行载体是其原生 `threadId`，而不是 `main agent` 的后续转发回合。

### 7.3 行为要求

`subagent` 的行为应满足以下要求：

* 将黑板会话视为当前阶段的主工作现场；
* 尊重用户已直接修改过的正文；
* 将 comment bullet 视为需要认真处理的显式输入；
* 对当前 session 的事件按一事件一回合的方式顺序处理；
* 在需要时重读最新 snapshot，而不是盲目依赖旧草稿；
* 将本地工作区视为私有、可重建、可失效的工作缓存；
* 在工作基底失效后主动放弃旧草稿并重建。

### 7.4 本地工作区最小锚点

V1 中，`subagent` 的私有工作区至少应有以下稳定锚点：

* `mainAgentInfo.md`
  保存 `main agent` 对当前 `subagent` 的 handoff 与任务上下文。
* `sessionDocument.md`
  保存当前 blackboard 会话正文的本地 Markdown 工作副本。
* `summary.md`
  保存会话 close 阶段形成的最终总结与回传内容。

这些文件都属于 `subagent` 私有工作区的一部分，不是 frontend 直接渲染的数据源，也不是 backend 的正式业务状态。

### 7.5 回合结束前的强制工具动作

V1 中，`subagent` 的工具调用时机不能完全留给自由发挥。

对于当前阶段的单一 `subagent` 串行执行模型，至少应满足以下规则：

* 若当前回合处理的是创建会话任务，则在回合结束前必须完成 `create_session`，并应完成一次初始 `get_snapshot`；
* 若当前回合处理的是 `comment bullet`，则在回合结束前必须成功调用 `mark_bullet_ready`；
* 若当前回合处理的是 `Proceed` 收敛，则在回合结束前必须成功调用 `submit_review_candidate`；
* 若当前回合处理的是正式关闭，则在回合结束前必须完成 `summary.md` 并成功调用 `close_session`。

若这些动作未完成，则当前回合不应被视为该事件已处理完成。

### 7.6 不负责的事情

`subagent` 默认不负责：

* 决定上层总任务是否需要进入 blackboard；
* 改写 `main agent` 的总体任务计划；
* 在会话结束后独自决定上层总任务下一步怎么走；
* 代替 `main agent` 承担全部外层编排职责。

### 7.7 会话关闭后的义务

会话关闭后，`subagent` 不能仅停留在“session 已结束”这一状态。

它必须向 `main agent` 回传足够的结构化结果，至少说明：

* 会话最终产出了什么；
* 当前文本收敛到了什么状态；
* 关键争议、约束或未完成项是什么；
* `main agent` 接下来应如何继续推进主任务。

---

## 8. Prompt Handoff Contract

### 8.1 总原则

`main agent -> subagent` 的角色切换必须通过显式 prompt handoff 完成。

在当前 `Codex` 目标下，角色 handoff 与原生 `subagent thread` 共同成立：

* handoff 决定角色语义；
* 原生 `subagent thread` 决定后续事件的直接控制载体。

### 8.2 handoff 必含信息

`main agent` 在调用 `subagent` 时，提示词中至少必须显式包含以下信息：

* 当前角色身份；
* 当前任务目标；
* 为什么进入 blackboard collaboration；
* 当前输入上下文；
* `subagent` 负责什么；
* `subagent` 不负责什么；
* 允许或预期使用哪些工具能力；
* 预期输出形式；
* 会话结束后的回传要求。

### 8.3 推荐 handoff 结构

推荐将 handoff 组织为如下语义区块：

* `Role`
* `Task Goal`
* `Why Blackboard`
* `Context`
* `Responsibilities`
* `Non-Responsibilities`
* `Workspace Contract`
* `Turn-End Tool Obligations`
* `Expected Outputs`
* `Return Contract`

### 8.4 role 语义要求

handoff 中必须明确说明：

* 你当前是 `subagent`；
* 你负责托管 blackboard session；
* 你要围绕当前文本现场持续工作；
* 你要按串行事件队列逐回合处理输入事件；
* 你完成会话后必须把结果回传给 `main agent`。

### 8.5 workspace contract 语义要求

handoff 中还必须明确说明本地工作区约束。

至少应覆盖：

* `mainAgentInfo.md` 必须作为 handoff 的本地落盘文件；
* `sessionDocument.md` 是当前会话正文的本地工作副本；
* `summary.md` 是 close 阶段的最终回传载体；
* 这些本地文件属于私有工作缓存，不直接作为 frontend 或 backend 的正式状态来源。

### 8.6 turn-end tool obligations 语义要求

handoff 中还必须明确说明当前阶段的回合结束约束。

至少应覆盖：

* `comment bullet` 回合结束前必须成功调用 `mark_bullet_ready`；
* `Proceed` 回合结束前必须成功调用 `submit_review_candidate`；
* `close` 回合结束前必须完成 `summary.md` 并成功调用 `close_session`；
* 对 `Codex` 宿主，收到当前 `threadId` 的 `turn/completed` 就是当前事件是否 handled 的判定边界。

### 8.7 return contract 语义要求

handoff 中还必须明确说明返回要求。

`subagent` 至少应返回：

* 最终结果摘要；
* 当前文本状态；
* 本轮主要处理了哪些反馈；
* 是否存在仍需 `main agent` 决策的问题；
* 对上层任务的后续建议。

---

## 9. 与现有产品文档的关系

### 9.1 与 PRD 的关系

PRD 定义的是产品层能力与用户体验。

本文在此基础上进一步明确：

* 这项能力应被组织为一份统一 skill；
* 角色差异应体现在 contract 中；
* role 切换当前通过 prompt handoff 完成。

### 9.2 与 Agent CLI 文档的关系

`Agent CLI` 文档定义的是 `subagent-facing` 工具能力与命令语义。

本文不重复命令定义，而把它们视为 skill 可依赖的执行工具层。

`Agent CLI` 文档仍然负责定义 `create_session`、`get_snapshot`、`mark_bullet_ready`、`submit_review_candidate`、`close_session` 的命令语义。

但在 V1 skill 合同中，以下执行约束已不再视为可随意变化的宿主细节：

* 创建会话回合结束前应完成 `create_session`，并应完成一次初始 `get_snapshot`；
* `comment bullet` 回合结束前必须成功调用 `mark_bullet_ready`；
* `Proceed` 回合结束前必须成功调用 `submit_review_candidate`；
* `close` 回合结束前必须完成 `summary.md` 并成功调用 `close_session`。

### 9.3 与 Host Validation Contract 的关系

本文定义的是 skill 与 handoff 约束，不直接等于宿主运行时已经被证明的能力。

因此它必须与：

* `docs/05-agent/Codex-Host-Validation-Contract.md`

一起阅读，用来区分：

* 哪些内容是 skill-enforced
* 哪些内容是 codex-host-provided
* 哪些内容仍然需要 agent-verified

### 9.4 与后续最终 skill 文档的关系

本文是当前阶段的能力级 spec，不是最终发布版 skill 文件。

后续最终 skill 文档可以在本文基础上继续演化，包括但不限于：

* 调整最终命名；
* 拆分平台具体配置；
* 补充更细的 prompt 模板；
* 补充具体示例与 failure handling 策略。

---

## 10. Platform Independence

### 10.1 当前目标平台

本文当前直接面向 `Codex`。

当前阶段成立所需的最小依赖是：

* `main agent` 可以启动原生 `subagent`；
* `spawn_agent` 返回的 `agent_id` 可被宿主持久化为 `threadId`；
* 宿主可以通过 `Codex App Server` 对该 `threadId` 执行 `thread/read`、`thread/resume`、`turn/start` 与必要时的 `turn/steer`；
* 宿主可以为该 `subagent` 提供私有工作区并串行交付 session 事件；
* blackboard backend / frontend / CLI 提供基础会话能力。

说明：

* 这里强调的是 **Codex 宿主层** 具备对子 agent 的控制能力；
* 这不等于 blackboard backend 进程内部天然拥有一套可直接调用的 subagent API；
* 若当前 Codex 环境提供的是 `spawn_agent` / `send_input` / `wait_agent` 等宿主工具，而不是字面上的 `turn/start(threadId=...)`，应视为同一设计意图的具体实现形式。

---

## 11. 当前非目标

本文当前不覆盖以下内容：

* 多个 `subagent` 同时托管同一 blackboard session；
* session 在多个 worker 之间的接管与迁移；
* 当前阶段的 worker 恢复与继续执行机制；
* 嵌套 blackboard 协作；
* `subagent` 自主决定再派出下一层 blackboard worker；
* 最终面向外部用户的 marketing 命名。

---

## 12. 当前结论

当前阶段，本文建议将 blackboard 相关 skill 的核心内容收敛为以下结论：

* 这是一项统一的 **Blackboard Collaboration Skill**；
* 它表示黑板协作能力，而不是某个单独角色；
* 其中包含两个角色：
  * `main agent`
  * `subagent`
* 二者的职责差异通过 contract 定义；
* 二者的职责切换通过 prompt handoff 显式注入；
* 在当前 `Codex` 目标下，`main agent` 首先启动一个原生 `subagent`；
* 该原生 `subagent` 的 `agent_id` 会被宿主持久化为后续直接控制用的 `threadId`；
* V1 采用单一 `subagent` 托管单一 session 的执行模型；
* session 事件以串行队列方式逐回合交付给该 `subagent thread`；
* `mainAgentInfo.md`、`sessionDocument.md`、`summary.md` 构成当前阶段的最小本地工作区锚点；
* `comment bullet`、`Proceed`、`close` 回合在结束前分别受 `mark_bullet_ready`、`submit_review_candidate`、`close_session` 的强制工具动作约束；
* 后续中间事件不再通过 `main agent` 转发，而是由宿主通过 `threadId` 直接控制该原生 `subagent`。

这一定义为后续 skill prompt 设计、CLI 接线、宿主平台实现与文档细化提供统一基础。
