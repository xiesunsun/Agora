# Frontend UI Structure

## 1. 文档目标

本文档用于定义 blackboard 前端页面的结构组织方式，重点回答以下问题：

* 页面有哪些核心结构；
* 每个结构负责什么；
* `document view`、`bullet rail`、`review overlay`、`history preview` 如何组织；
* 哪些状态必须由顶层页面持有；
* 哪些状态应该保留在局部组件内部。

本文档不重新定义业务状态机，也不展开前后端协议，而是把现有产品原则进一步收束为前端页面结构原则。

当前 MVP 阶段的具体桌面视觉原型参考固定在：

* `docs/04-design/Visual-Reference.md`

前端视觉实现应默认对齐该文档中的页面状态原型与交互原型，除非稳定设计文档被显式更新。

---

## 2. 页面总原则

### 2.1 页面首先是一整页文稿

Blackboard 的页面不应被感知为一个“带文档区的应用界面”，而应被感知为“一整页可阅读、可协作、可审阅的原稿”。

在 `active` 状态下，用户进入页面后的第一感受必须是：

* 这是一整页全屏文档阅读界面；
* 正文是唯一持续占据视觉中心的对象；
* 其他能力都从文稿边缘或文稿表面自然长出。

### 2.2 不以分栏组织页面

前端内部可以有多个结构层，但视觉上不应呈现为传统的分栏工作台。

因此页面不应以：

* 正文区；
* 侧栏区；
* 审阅区；
* 历史区；

这种并列主区方式组织。

正确的组织方式应当是：

* 一张全屏阅读面；
* 一份连续文稿；
* 若干附着在文稿边缘或文稿表面的协作层；
* 在少数强状态下由整页切入新的整体态。

### 2.3 阅读感优先于功能显露

所有结构决策都应优先服务以下感受：

* 文稿阅读节奏稳定；
* 正文宽度不被常驻面板持续挤压；
* 空间记忆尽量延续；
* 用户始终感觉自己在同一份原稿上工作，而不是在多个工具面板之间跳转。

### 2.4 视觉方向固定为 `Editorial Base + Precision Review`

MVP 阶段，blackboard 的前端视觉方向不应开放式探索，而应固定为：

* `active` 态以高级文稿阅读页为默认气质；
* `reviewing` 态在同一阅读基底上增加精密度、对比度与控制感；
* 整体保持低品牌表达，不依赖强色块、重装饰或强情绪化视觉；
* 高级感主要来自排版、留白、比例、节奏、材质感与克制的动效，而不是 UI 装饰堆叠。

这意味着：

* 页面首先应像一份高质量原稿，而不是一个“好看的工具页面”；
* 审阅态首先应像“进入精密校订层”，而不是切到另一套产品壳；
* 所有视觉强化都必须服务于文稿阅读与审阅判断，而不是制造存在感。

### 2.5 字体与排版策略

MVP 的字体策略应视为硬约束：

* 标题 / display accent 使用具有出版感的 serif；
* 长文正文使用高可读性的 serif；
* 控件、状态标签、审阅 chrome 使用克制的 sans-serif；
* 代码与结构化 diff 使用清晰、紧凑的 monospace。

排版原则：

* 标题与正文要有明确气质区分，但不能形成海报化夸张反差；
* 正文必须优先可读性、段落节奏与长时间阅读舒适度；
* 控件文字不能长成产品后台式按钮墙；
* 审阅态中的 sans-serif 应增强精密感，但不能把整页阅读语言切断。

### 2.6 阅读几何与页面密度

页面密度应固定为 `Relaxed`。

阅读几何建议：

* 主正文 measure 应稳定在适合长文阅读的区间，约 `68-72ch`；
* 桌面主阅读框宽度应大致落在 `720-840px`；
* 移动端正文宽度应优先保证自然留边，而不是强行铺满；
* 段落间距、标题间距、列表间距必须形成稳定节奏，而不是组件级各自为政；
* 任意状态下都不允许出现持续压缩正文宽度的常驻结构。

这些约束的目标是：

* 用户感到自己在读文稿，而不是在看居中的功能容器；
* 页面在桌面端有沉静、稳定的阅读中心；
* 页面在移动端仍保留原稿感，而不是退化为普通移动工具页。

### 2.7 表面语言与动效约束

blackboard 的表面语言应保持克制：

* 背景应更接近温和纸面，而不是纯应用底色；
* 允许极弱纹理或噪声，但只能作为气氛，不可形成装饰主题；
* 边框、阴影、分割线都应尽量弱，避免切割出过强的“模块盒子感”。

动效原则：

* 动效只用于状态转场、注意力引导与局部空间连续性；
* 默认采用短时、克制的 opacity / translate 类过渡；
* 不应使用炫技式弹跳、缩放或过度 spring 感；
* `proceeding`、`reviewing`、`history_preview` 的切换应让用户感觉“同一原稿进入新阶段”，而不是页面跳转。

---

## 3. 页面结构总览

页面结构应按“阅读面 + 附着层 + 状态接管”组织，而不是按“页面分区”组织。

在概念上，前端可分为四类结构：

1. `Full-Screen Reading Surface`
2. `Peripheral Interaction Affordances`
3. `Review Overlay`
4. `State-Level Takeovers`

其中：

* `Full-Screen Reading Surface` 定义整页文稿阅读气质；
* `Peripheral Interaction Affordances` 承载边缘协作能力；
* `Review Overlay` 承载同一份文稿上的审阅态；
* `State-Level Takeovers` 只在少数强状态下接管整页。

核心原则是：

> Blackboard 不是多面板协作台，而是一篇连续文稿上的分层交互结构。

---

## 4. 核心结构

### 4.1 Document View

`Document View` 是页面真正的内容本体，也是唯一持续占据视觉中心的结构。

它负责：

* 渲染连续文稿；
* 以 `DocumentUnit[]` 组织可交互的文稿单元；
* 提供单元级编辑入口；
* 提供选区批注锚点；
* 为 bullet、review、history 恢复提供稳定空间基底；
* 保持滚动上下文、阅读节奏和空间记忆。

要求：

* 必须表现为整篇原稿，而不是卡片集合；
* 不应被实现成被侧栏挤压后的中间内容列；
* 在 `active`、`reviewing`、`history_preview` 中都应延续同一种文稿阅读语言。
* 必须承载稳定的阅读几何、字体节奏与留白系统，而不是把这些规则下放给零散局部组件各自决定。
* code block、table、blockquote 等较强结构单元，也必须服从同一阅读版式，而不是跳成独立小应用组件。

### 4.2 Bullet Rail

`Bullet Rail` 不是侧栏，而是附着在文稿边缘的一层弱结构。

它负责：

* 承载 `edit bullet` 与 `comment bullet`；
* 展示 bullet 的极简状态；
* 提供 bullet 展开后的便利贴入口；
* 承载唯一 Agent 小人的当前位置；
* 在相关段落附近形成轻量协作回应感。

要求：

* 默认保持很弱的结构感；
* 具体 bullet 只在相关区域活跃时展开；
* 视觉上更像边注轨道，而不是第二列内容流；
* 不应持续占据与正文等权的页面空间。
* 颜色、对比度、边框和展开态体积都必须受控，避免 bullet 成为页面上第二视觉主角。

### 4.3 Review Overlay

`Review Overlay` 是覆盖在当前文稿之上的审阅层，而不是独立页面或常驻审阅面板。

它负责：

* 在整篇正文上表达 tracked changes；
* 承载 `Flow Review` 与 `PR Review` 的模式切换；
* 维持同一份 `reviewChangeSet` 的共享结算结果；
* 提供 `Accept`、`Reject` 及批量结算动作；
* 在用户点入具体改动时形成局部聚焦。

要求：

* 用户必须感觉自己仍在同一篇文稿上审阅；
* 审阅态不应制造第二份候选内容树；
* 切换审阅模式时不应让用户感觉自己跳到了另一页。
* 审阅态应比 `active` 更精密、更清楚，但不能丢失阅读面的纸面感与空间记忆。
* 审阅态的增强主要通过对比、sans-serif chrome、局部聚焦和 tracked changes 层级来完成，而不是通过另起一套布局。

### 4.4 History Preview

`History Preview` 是整页切入的只读历史态。

它负责：

* 展示某个历史版本的只读正文；
* 提供“返回当前工作区”与“恢复此版本为当前基底”；
* 在浏览期间挂起当前 `WorkingSet`。

要求：

* 它不是侧面板、抽屉或模态框；
* 进入后应明确表现为“离开当前现场，进入历史稿件阅读态”；
* 视觉语言仍应保持文稿阅读感，而不是切成另一套应用壳。
* 它应看起来像在翻阅另一版原稿，而不是在访问系统历史记录页面。

---

## 5. 不同结构如何共同组织一页文稿

### 5.1 `active`

在 `active` 状态下：

* `Document View` 是绝对主体；
* `Bullet Rail` 以弱存在方式附着在文稿边缘；
* 顶部只保留极简固定控制；
* 页面整体首先成立为全屏文稿阅读态。
* 视觉上应最接近高级长文阅读页，功能感被压到最低。
* 当前桌面实现应优先对齐 `Visual-Reference.md` 中的 `active` 与 `rail mapping` 原型。

### 5.2 `reviewing`

在 `reviewing` 状态下：

* 仍然是同一个 `Document View`；
* `Review Overlay` 接管文稿表面的审阅表达；
* `Bullet Rail` 退到次要或冻结，不再作为主要注意力对象；
* 页面应表现为“同一篇文稿进入待审阅状态”。
* 相比 `active`，应提升精密感与判断效率，但不应牺牲正文连续可读性。
* 当前桌面实现应优先对齐 `Visual-Reference.md` 中的 `flow review` 与 `pr review` 原型。

### 5.3 `history_preview`

在 `history_preview` 状态下：

* 当前工作现场被挂起；
* 页面整页切入只读历史稿件；
* 不保留当前轮 bullet 现场；
* 用户只执行浏览、返回或恢复。
* 视觉上应更安静、更像在翻阅历史稿，而不是进入系统管理页面。
* 当前桌面实现应优先对齐 `Visual-Reference.md` 中的 `history preview` 原型。

### 5.4 `proceeding`

在 `proceeding` 状态下：

* 页面由全屏流程覆盖层完全接管；
* 文稿细节暂时退出；
* 不保留局部交互；
* 用户只感知回合处理进度与阶段变化。
* 覆盖层应保留原稿上下文的余韵，而不是切成通用 loading page。
* 当前桌面实现应优先对齐 `Visual-Reference.md` 中的 `proceeding` 原型。

---

## 6. Flow Review 与 PR Review

### 6.1 它们不是两个顶层页面

`Flow Review` 与 `PR Review` 必须被定义为同一 `reviewing` 状态中的两种审阅模式，而不是两个并列页面，也不是两条独立生命周期。

固定规则：

* 页面进入 `reviewing` 后，默认始终先以 `Flow Review` 打开；
* `PR Review` 只能由用户在 `Flow Review` 中手动开启；
* 用户可随时从 `PR Review` 切回 `Flow Review`；
* 两者共享同一份 `reviewChangeSet`；
* 两者共享同一组 `accepted / rejected / pending` 结算结果。

### 6.2 Flow Review

`Flow Review` 是默认审阅模式。

它服务于整篇阅读判断，职责是：

* 让用户继续像读文稿一样读完整结果；
* 在文稿表面看到改动痕迹；
* 先做整体判断，再决定是否需要更细颗粒度控制。

其页面表达应当是：

* 整篇文稿完整可读；
* 改动以内联 tracked changes 附着在原文上；
* 批量动作优先，例如 `Accept All Remaining`、`Reject All Remaining`。
* 用户首先仍在“读稿”，其次才是在“结算改动”。

### 6.3 PR Review

`PR Review` 是高级审阅模式。

它服务于逐 hunk 精确控制，职责是：

* 将同一份待审阅结果收紧为逐项判断流程；
* 让用户围绕单个 hunk 执行 `Accept` 或 `Reject`；
* 在不离开文稿整体语境的前提下提高控制精度。

其页面表达应当是：

* 仍然基于同一篇待审阅文稿；
* 当前 hunk 获得更强聚焦；
* 其他正文退到背景，但不应彻底消失；
* 用户感觉到的是“审阅粒度切换”，而不是“页面跳转”。
* 当前 hunk 的强化应来自层级、对比和局部空间重心，而不是另开一块审阅工作台。

---

## 7. 顶层页面状态与局部组件状态

### 7.1 分工原则

顶层页面只持有会改变整页交互边界的状态；凡是不改变整页语义、只影响局部呈现或局部操作连续性的状态，都应留在局部组件内部。

### 7.2 顶层页面必须持有的状态

以下状态必须由顶层页面持有：

* `sessionStatus`
  * `active | proceeding | reviewing | history_preview | closed`
* `workingSet`
* `currentVersionId`
* `activeReviewChangeSet`
* `reviewMode`
  * `flow | pr`
* `historyPreviewTarget`
* `activeEditingUnitId`
* `pendingCloseGuard`
* 其他会影响整页状态迁移的 guard 状态

这些状态的共同特征是：

* 它们决定用户当前处于哪一种整页工作语义；
* 它们会改变页面允许什么、禁止什么；
* 它们在模式切换时必须保持一致。

其中：

* `currentVersionId` 表示当前页面所处的正式版本上下文；
* 在 `reviewing` 时，它仍指向当前正式基底版本，而不是待审阅候选结果。

### 7.3 应保留在局部组件内部的状态

以下状态应保留在局部组件内部：

* 某条 bullet 是否展开为便利贴；
* bullet 的 hover / focus / pressed；
* Agent 小人的局部过渡动画；
* 当前是否显示选区工具条；
* 选区备注输入框的临时内容；
* 某个 hunk 是否处于局部聚焦高亮；
* 某个改动是否临时展开查看更多上下文；
* 文稿单元编辑器内部的草稿文本、光标位置、滚动位置；
* bullet rail 的局部排布结果；
* 各类局部浮层的可见性、位置与入退场动画。

这些状态的共同特征是：

* 不改变整页语义；
* 生命周期短；
* 主要服务于局部反馈与局部操作连续性。

### 7.4 判断标准

判断一个状态是否应提升到顶层，可以使用两个问题：

1. 这个状态变化会不会改变整页允许什么、不允许什么？
2. 这个状态变化在切到别的模式后是否仍必须保持一致？

若答案为“是”，通常应由顶层持有。
若答案为“否”，通常应保留在局部组件内部。

---

## 8. 推荐的前端组件层次

组件层次应按“阅读面 + 附着层 + 状态接管”组织。

参考结构如下：

```text
BlackboardPage
  PageChrome
  ReadingSurface
    DocumentScroller
      DocumentView
        DocumentUnitRenderer[]
    EdgeLayer
      BulletRail
      AgentAvatar
      SelectionAffordance
      InlineBulletPopover
    ReviewOverlay
    ProceedOverlay
  HistoryPreviewPage
  ClosedStatePage
```

### 8.1 BlackboardPage

`BlackboardPage` 负责：

* 顶层状态切换；
* 全局数据装配；
* 顶层 guard；
* 不同整页态之间的边界管理。

它不应直接承担复杂局部交互细节。

### 8.2 PageChrome

`PageChrome` 是极简固定顶栏，而不是应用 shell。

它只承载：

* 当前版本信息；
* `Proceed`；
* 历史入口；
* 关闭入口；
* 当前是否处于 `reviewing` 的弱提示。

除 `Proceed` 外，其余全局动作都应弱化，不应抢夺正文中心。

### 8.3 ReadingSurface

`ReadingSurface` 是默认主舞台。

它定义整页文稿阅读气质，而不是一个被其他面板包围的中间区块。

它还应统一持有以下视觉约束：

* 文稿背景、正文列宽、边缘留白；
* 标题 / 正文 / 控件 / code 的字体关系；
* 各状态共享的节奏与材质基底；
* 从 `active` 到 `reviewing` 再到 `history_preview` 的视觉连续性。

### 8.4 DocumentScroller

`DocumentScroller` 负责：

* 稳定滚动上下文；
* 提供锚点定位基准；
* 为 edge layer 与 overlay 提供对齐基础；
* 保持同一篇文稿在不同状态下的空间连续性。

### 8.5 EdgeLayer

`EdgeLayer` 是依附正文边缘的逻辑层。

它的目标不是形成可见分区，而是统一管理：

* bullet rail；
* Agent 小人；
* 选区附着能力；
* 局部便利贴浮层。

### 8.6 ReviewOverlay

`ReviewOverlay` 只在 `reviewing` 时出现。

规则：

* 默认先以 `Flow Review` 组织；
* 当用户手动开启高级审阅时，切到 `PR Review` 聚焦组织；
* 始终共享同一份 `reviewChangeSet`；
* 不创造第二份候选正文。

### 8.7 HistoryPreviewPage

`HistoryPreviewPage` 是完整只读页面态。

它不是：

* drawer；
* modal；
* side sheet；
* 常驻历史侧栏。

它应延续文稿阅读语言，只是内容来源切换为历史版本快照。

---

## 9. 页面原则与明确禁区

### 9.1 页面原则

以下原则应视为硬约束：

* `active` 状态下，页面首先必须表现为全屏文档阅读态；
* 正文是唯一持续占据视觉中心的对象；
* 所有协作能力都只能附着在正文边缘或正文表面生长出来；
* `Flow Review` 必须保持“仍在读整篇文稿”的感受；
* `PR Review` 必须表现为“同一篇待审阅文稿中的局部精确控制”；
* `history_preview` 必须是整页切入的只读历史态；
* 顶层页面状态只守住整页语义边界，局部交互状态尽量留在局部组件。
* `active` 的视觉目标是高级阅读页，而不是功能工作台；
* `reviewing` 的视觉目标是精密校订层，而不是另一套应用页面；
* 字体、measure、留白、背景、动效节奏属于页面级系统，不允许由局部组件临时拼凑。

### 9.2 明确禁区

以下方向应明确禁止：

* 左右分栏式主布局；
* “正文区 + 侧栏区 + 审阅区 + 历史区”的并列工作台；
* 会持续挤压正文宽度的常驻面板；
* 重边框、重模块盒子、明显区域切割线；
* 默认系统字体直接上屏，导致页面缺乏明确排版气质；
* 让 `bullet rail` 长成第二列内容流；
* 让 `PR Review` 长成独立页面或独立候选内容树；
* 让 `history preview` 以 drawer、modal、side sheet 的形式出现；
* 通过高饱和品牌色、大面积渐变、强装饰图形来制造“高级感”；
* 使用过强、过慢、过显眼的动效破坏阅读节奏；
* 将 hover、展开、浮层、局部聚焦等短生命周期 UI 细节提升成顶层页面状态。

---

## 10. 视觉验收基线

MVP 的前端结构完成，不应只以“功能是否可用”判断，还应满足最小视觉验收基线。

至少应检查：

* 桌面端 `active` 是否首先被感知为一份高级文稿，而不是产品页面；
* 移动端是否仍保留原稿感、留白和稳定阅读中心；
* 字体是否按预期加载，fallback 不会明显破坏页面气质；
* `bullet rail` 是否始终弱于正文；
* `reviewing` 是否明显更精密，但仍保留同一份原稿的阅读感；
* `history_preview` 与 `closed` 是否延续同一套文稿语言；
* 各顶层状态之间的转场是否稳定、克制，不制造页面跳转感。

## 11. 总结

Blackboard 的前端不是一个带文档区的协作应用，而是一份全屏文稿阅读界面；编辑、批注、审阅、历史都只是在这份文稿上自然生长出的协作状态。

这份结构定义的目标不是让页面“功能齐全”，而是让页面始终保持：

* 阅读天然；
* 协作自然；
* 状态清楚；
* 空间纯净。

## 12. Contract Relationship

本文定义的是前端结构原则。

在当前仓库治理中，它应与以下文档一起被阅读：

* `docs/03-contracts/Document-Template-Contract.md`
  固定 MVP 页面骨架与 anti-drift 规则
* `docs/04-design/Acceptance-Matrix.md`
  定义结构、呈现与运行时验收层
* `docs/04-design/Visual-QA-Checklist.md`
  定义视觉人工验收检查项
