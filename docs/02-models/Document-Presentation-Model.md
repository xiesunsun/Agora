# Document Presentation Model

## 1. 文档目标

本文档定义 MVP 阶段 blackboard 的展示内容模型。

本文档重点回答以下问题：

* Agent 产出的展示内容是什么格式；
* 这些内容如何被渲染为连续文稿型 HTML 页面；
* 页面内部最小交互单元是什么；
* 哪些 Markdown 语法被允许，哪些被禁止；
* 不同文稿单元如何支持编辑、批注、bullet 挂靠与 review。

本文档不展开：

* `subagent` 如何调用 CLI；
* 前后端 command / event / snapshot 协议；
* 具体 CSS、动画资源或像素级排版实现。

---

## 2. 基本原则

### 2.1 展示内容与工作上下文分离

`main agent` 交给 `subagent` 的任务上下文保存在：

* `mainAgentInfo.md`

它属于 `subagent` 私有工作区，用于帮助 Agent 理解目标、约束和讨论重点。

它不是前端直接展示给用户的文稿内容。

真正进入 blackboard 页面展示的是：

* `subagent` 基于任务上下文生成的 Markdown 文稿

### 2.2 V1 只支持一种展示模式

V1 仅支持：

* `document`

即连续文稿视图。

V1 不支持：

* 任意 HTML 页面生成
* dashboard / card board 风格展示
* 自定义组件树
* 多种布局模式自由切换

### 2.3 用户感知的是一篇原稿

页面对用户的视觉呈现应满足：

* 主体是一篇连续文稿；
* 文稿有自然阅读节奏，而不是卡片拼装感；
* bullet 像边注一样附着在原稿边缘；
* Agent 小人沿文稿边缘与 bullet 轨道移动；
* review 时仍在原稿上展示 tracked changes，而不是跳出到另一套完全不同的布局。

### 2.4 Markdown 是内容真相

V1 中：

* `initialContent`
* `WorkingSet.currentContent`
* `candidateContent`

都以 Markdown 作为核心内容真相。

系统不会将任意 HTML 作为正文内容真相。

---

## 3. 渲染管线

V1 采用如下渲染管线：

1. `subagent` 生成符合固定约束的 Markdown 文稿。
2. 系统解析 Markdown。
3. 系统将解析结果转换为适合 blackboard 交互的有序 `DocumentUnit[]`。
4. 固定 `document` HTML template 基于这些 `DocumentUnit` 渲染连续文稿页面。
5. bullet、Agent 小人、review 覆盖层等交互能力再附着到这些 `DocumentUnit` 上。

因此：

* Agent 不直接生成 HTML；
* Agent 不直接生成 `DocumentUnit[]`；
* `DocumentUnit[]` 是系统从 Markdown 派生出的渲染与交互中间结构。

---

## 4. Blackboard Markdown Profile

V1 不接受任意 Markdown，而是要求 `subagent` 产出符合固定约束的 Markdown 文稿。

该受限子集称为：

* `Blackboard Markdown Profile`

### 4.1 目标

限制 Markdown 的目的不是削弱表达能力，而是为了：

* 稳定解析；
* 稳定渲染；
* 稳定分段；
* 稳定生成交互锚点；
* 稳定支持 diff / review / bullet 挂靠。

### 4.2 允许的语法

V1 允许：

* 一级标题 `#`
* 二级标题 `##`
* 三级标题 `###`
* 普通段落
* 引用块 `>`
* 无序列表
* 有序列表
* GitHub 风格 Markdown 表格
* fenced code block
* 基础 inline formatting：
  * `**bold**`
  * `*italic*`
  * `` `inline code` ``
  * `[link](url)`

### 4.3 禁止的语法

V1 禁止：

* 原生 HTML
* MDX / 自定义组件
* 脚注
* 数学公式
* 任务列表
* 图片
* iframe / script
* 深层嵌套列表
* blockquote 内嵌复杂结构
* 表格单元格内嵌复杂块结构
* 任意自定义扩展语法

### 4.4 结构约束

V1 约束如下：

* 文档必须且只能有一个一级标题 `#`；
* 第一条一级标题视为整篇文稿标题；
* heading 层级不允许乱跳；
* 段落之间必须规范空行；
* 正文尽量按自然段组织；
* 列表层级最多 2 层；
* 表格必须是标准 GFM 表格；
* code block 一律使用 fenced code block；
* code block 应尽量带语言标记。

### 4.5 Agent 输出要求

`subagent` 的 skill / prompt 应明确要求：

1. 输出必须是合法 Markdown。
2. 输出必须符合 `Blackboard Markdown Profile`。
3. 第一行必须是一级标题。
4. 正文应以自然段组织，不要为了排版制造伪结构。
5. 当内容无法优雅表达时，优先退化为 paragraph 或 list，而不是发明新语法。

---

## 5. DocumentUnit 模型

### 5.1 定义

`DocumentUnit` 是系统从 Markdown 派生出的、用于渲染与交互的最小文稿单元。

它不是 Agent 直接输出的对象，而是系统的中间表示。

### 5.2 核心原则

* 用户感知到的是一篇连续文稿；
* 系统内部则使用有序 `DocumentUnit[]` 承载可编辑、可批注、可挂 bullet 的结构化单元；
* `DocumentUnit` 应尽量接近稳定的语义化 HTML 渲染目标。

### 5.3 最小公共字段

V1 的 `DocumentUnit` 最小公共字段为：

* `unitId`
* `type`
* `markdown`
* `order`
* `sourceStart`
* `sourceEnd`

说明：

* `unitId`
  在当前这次 Markdown 派生结果内稳定标识一个可交互文稿单元。
* `type`
  表示该单元属于哪种文稿语义类型。
* `markdown`
  表示该单元对应的 Markdown 内容片段。
* `order`
  表示该单元在整篇文稿中的顺序。
* `sourceStart` / `sourceEnd`
  表示该单元在当前 Markdown 源串中的半开区间 `[sourceStart, sourceEnd)`。

稳定性说明：

* `unitId` 只在当前派生上下文内稳定；
* 对工作现场协议，可理解为只在同一个 `workingSetRevision` 内稳定；
* 重新解析、恢复历史版本或切换到另一份历史正文后，不应假设旧 `unitId` 仍然有效。

### 5.4 V1 支持的 `DocumentUnit.type`

V1 支持：

* `title`
* `heading`
* `paragraph`
* `list_item`
* `table`
* `code_block`
* `blockquote`

编辑语义：

* Markdown 是唯一事实源；
* 用户编辑某个 `DocumentUnit` 后，backend 以该单元的 `sourceStart` / `sourceEnd` 替换整篇 Markdown 中的对应切片；
* 然后重新解析整篇 Markdown，生成新的 `DocumentUnit[]`；
* 编辑后允许该位置的最终单元类型发生变化。

说明：

* `list` 是渲染容器，而不是独立交互单元；
* 真正进入交互模型的是 `list_item`；
* `table` 与 `code_block` 在 V1 中都作为整块交互单元处理。

---

## 6. 不同内容单元的语义与交互

### 6.1 `title`

Markdown 来源：

* 文档第一条一级标题 `#`

HTML 渲染目标：

* `<h1>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

说明：

* `title` 是整个文稿的第 0 个核心内容单元；
* 虽然它视觉上是标题，但在 blackboard 中仍然被视为可讨论的原稿内容。

### 6.2 `heading`

Markdown 来源：

* 二级或三级标题

HTML 渲染目标：

* `<h2>` / `<h3>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

### 6.3 `paragraph`

Markdown 来源：

* 普通段落

HTML 渲染目标：

* `<p>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

说明：

* `paragraph` 是最常见的正文交互单元；
* Agent 小人和 bullet 轨道的默认布局参考优先围绕正文段落组织；
* 但它不是唯一可交互单元。

### 6.4 `list_item`

Markdown 来源：

* 有序或无序列表项

HTML 渲染目标：

* `<ul>/<ol>` 容器中的 `<li>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

说明：

* list 在视觉上保持为一个连续列表；
* 系统内部则将每个 item 当作一个独立 `DocumentUnit`。

### 6.5 `table`

Markdown 来源：

* 标准 GFM 表格

HTML 渲染目标：

* `<table>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

说明：

* V1 中整表作为一个交互单元；
* 不拆到 cell 级别。

### 6.6 `code_block`

Markdown 来源：

* fenced code block

HTML 渲染目标：

* `<pre><code>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

说明：

* V1 中整块代码作为一个交互单元；
* 不在 code block 内再做更细粒度结构拆分。

### 6.7 `blockquote`

Markdown 来源：

* `>` 引用块

HTML 渲染目标：

* `<blockquote>`

交互规则：

* 可编辑
* 可批注
* 可挂 bullet

说明：

* V1 中整块引用作为一个交互单元。

---

## 7. 编辑与批注模型

### 7.1 编辑原则

V1 中，所有 `DocumentUnit` 默认都可编辑。

包括：

* `title`
* `heading`
* `paragraph`
* `list_item`
* `table`
* `code_block`
* `blockquote`

### 7.2 批注原则

V1 中，所有 `DocumentUnit` 默认都可批注。

这意味着：

* 标题可以批注；
* 正文段落可以批注；
* 列表项可以批注；
* 表格和代码块也可以批注。

补充约束：

* `title`、`heading`、`paragraph`、`list_item`、`blockquote` 支持文本选区 comment；
* `table` 与 `code_block` 在 V1 中按整块 comment 处理，不强求统一字符级 offset。

### 7.3 Bullet 锚点原则

bullet 应优先挂靠到：

* 当前被编辑或被选中的 `DocumentUnit`

其中：

* `edit bullet` 的主锚点应统一为 `unitId`；
* `comment bullet` 的主锚点也应统一为 `unitId`；
* 若该 `DocumentUnit` 支持文本选区，则 `comment bullet` 还可在 `unitId` 内进一步记录选区锚点。

---

## 8. 对 Bullet 模型的影响

当文稿交互单元统一为 `DocumentUnit` 后：

* 旧的 `paragraphId` 语义应逐步收敛为 `unitId`；
* `edit bullet` 不再被理解为只作用于普通段落，而是作用于某个具体 `DocumentUnit`；
* `comment bullet` 也应以 `unitId` 作为主挂靠目标。

在支持文本选区的 `DocumentUnit` 中，例如：

* `title`
* `heading`
* `paragraph`
* `list_item`
* `blockquote`

`comment bullet` 还可保留更细的文本锚点，例如：

* `anchorTextSnapshot`
* `anchorStartOffset`
* `anchorEndOffset`

对于：

* `table`
* `code_block`

V1 可先只要求：

* `unitId`
* 必要时保留局部 `targetTextSnapshot`

而不强求统一的字符级 offset 语义。

---

## 9. 模板渲染原则

固定 `document` HTML template 应满足：

* 主文稿为连续单列阅读流；
* section / heading 只承担阅读节奏，不制造卡片割裂感；
* bullet rail 固定在文稿边侧；
* Agent 小人沿文稿边缘和 bullet 轨道移动；
* review 结果仍在原文稿上投影展示；
* 视觉上像在原始文稿上编辑、批注和审阅，而不是在多组件工作台上操作。

模板层的职责是：

* 将语义化 `DocumentUnit` 渲染成精美、稳定、适合交互的 HTML；
* 保证不同 Markdown 文稿在视觉和交互上具有统一风格。

---

## 10. 与其他文档的关系

本文档与其他文档的分工如下：

* `Agent-CLI.md`
  负责定义 `subagent` 如何托管黑板会话。
* `Frontend-Backend-Protocol.md`
  负责定义页面与 backend 如何交换 command / event / snapshot。
* `Domain-Model.md`
  负责定义会话、版本、bullet、review 等核心业务对象。
* 本文档
  负责定义 Markdown 文稿如何被转化为可渲染、可交互的连续文稿模型。

## 11. Contract And Validation Relationship

本文定义展示内容模型本身。

在当前仓库治理中，它还应与以下文档一起构成稳定实现合同：

* `docs/03-contracts/Markdown-Rendering-Contract.md`
  固定 Markdown truth、`DocumentUnit` 派生、编辑重解析与 review locality
* `docs/03-contracts/Document-Template-Contract.md`
  固定派生结果进入哪一种页面模板
* `docs/04-design/Acceptance-Matrix.md`
  定义渲染层需要怎样的测试与验收证据
