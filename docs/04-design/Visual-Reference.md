# Frontend Visual Reference

## 1. Purpose

This document fixes the current canonical visual reference set for the Blackboard frontend.

前端实现的视觉参考采用两级体系：

1. **第一级（主参考）**：Stitch 项目中的已确认设计稿 — 包含完整的页面几何、排版、间距、组件比例
2. **第二级（辅助参考）**：本文档指向的 PNG 截图 — 用于离线对照和视觉 QA

当两者存在差异时，以 Stitch 中用户手动保留的版本为准。

## 2. Status

This document is stable design guidance for the current MVP stage.

## 3. Stitch 项目

当前 Stitch 项目：

- 项目名称：`Blackboard Frontend Redesign v1`
- 项目 ID：`7442061039043085610`

重要规则：

- 用户有时会在 Stitch 项目中手动保留某个满意版本，即使后续生成了新屏幕
- 因此最后生成的屏幕不一定是真正的首选版本
- 以用户手动保留的版本为准

## 4. How To Use Stitch Assets

Stitch 产出有两种使用方式：

- **截图**：最终视觉验收目标
- **`htmlCode`**：间距、节奏、表面处理、组件比例的参考

不要把 Stitch `htmlCode` 当作可直接使用的前端代码。

从中提取：

- 页面几何
- 纸面宽度
- 顶部 chrome 间距
- rail 偏移和 rail 宽度
- 字号比例
- 颜色和对比度
- 边框、高亮和阴影处理

然后在以下位置重新实现这些设计决策：

- `apps/frontend/src/components`
- `apps/frontend/src/styles`

## 5. Stable Visual Rules

以下规则在设计评审中被反复确认，应视为实现约束。

### 5.1 整体页面语言

- 页面必须首先是一份原稿
- 纸面始终是主视觉对象
- 页面不能读起来像仪表盘、shell 应用或分栏工作台

### 5.2 顶部 chrome

`active` 系列页面：

- 左侧：截断的中文原稿标题
- 中间：轻状态位，如 `v1.2 · 协作中`
- 右侧：极弱的 `Proceed` 和关闭控件

`reviewing(flow)` 和 `reviewing(pr)`：

- 不显示 `Proceed`

`history_preview` 和 `closed`：

- 保持原稿语言
- 减少操作压力

### 5.3 Rail

- rail 不是侧栏
- rail 是附着在纸面边缘的细协作脊柱
- 默认 `active` rail 应弱、窄、几乎隐藏
- 节点必须放置在对应文本区域附近，不能随机分布

### 5.4 Rail 状态

用户可见的高层状态：

- `new`
- `processing`
- `processed`

说明：

- 稳定产品文档仍有更细的内部状态区分
- 视觉上聚合为这 3 个用户可见状态是可接受的
- `proceed` 不是 bullet state，而是会话动作；进入后对应顶层 `proceeding` 状态
- 协议层 `ready` / `applied` 在 rail 视觉上统一聚合为 `processed`

Rail 状态视觉约定：

| 视觉状态     | 协议状态            | 含义                               | 默认样式                           |
| ------------ | ------------------- | ---------------------------------- | ---------------------------------- |
| `new`        | `new`               | 用户刚创建，尚未被 Agent 接手      | 小号中性空心点，弱描边，白色纸面底 |
| `processing` | `processing`        | Agent 正在处理该 bullet            | 较大暖棕描边圆点，中心有暖棕实心点 |
| `processed`  | `ready` / `applied` | 已处理完成，等待或已经进入后续结算 | 极弱中性实心小点，不抢正文注意力   |

Rail 位置约定：

- bullet 的主定位依据是 `anchorUnitId` 对应文稿单元在当前阅读面中的实际 DOM 位置
- `edit bullet` 由确认编辑产生，必须贴近被编辑的 `DocumentUnit`
- `comment bullet` 由选区或整块批注产生，必须贴近被批注的 `DocumentUnit`
- `railY` 只能作为 fixture 或 DOM 尚未测量时的 fallback，不应作为真实定位事实
- 同一垂直区域出现多颗 bullet 时，保持贴近正文的 rail 基线，优先横向成簇排列；超过横向槽位后才允许小幅换行，不能一路向下漂移成侧栏列表
- hover 映射线必须从当前 bullet 节点指向对应文稿单元或选区，不使用队列顺序、创建时间或固定百分比代替锚点位置

### 5.5 Hover vs Click 语义

这个区分至关重要：

- **hover 状态**：
  不展开内容卡片
  仅显示节点 hover 处理 + 细连接线指向精确文本锚点
- **click 状态**：
  comment bullet 可在 rail 附近局部展开为小笔记
  edit bullet 当前阶段可展开固定文案 note：`这一段被用户修改了`
  点击正文或其他空白区域应自然关闭当前 note

不要用 click 状态的构图作为 hover 映射的基线。

### 5.6 映射语义

当 rail 节点被 hover 时：

- 连接线必须从 bullet 状态图标本身出发
- 连接线必须指向精确的 `comment` 锚文本；当前阶段 `edit` 没有稳定 diff range 时指向对应 `DocumentUnit`
- `comment` 的原稿目标区域必须被窄高亮；`edit` 在没有 diff range 前使用对应 `DocumentUnit` 的整块高亮
- 页面应读起来像精确的原稿映射层，而不是装饰性连线

## 6. Canonical Screen References

### 6.1 已确认的核心基线

#### Active 默认态

- Stitch 标题：`Agent 黑板协作 - 极致原稿母版 (协作脊柱默认态)`
- Screen ID：`cc1e8cbe5c7f4e7f819ccff2addbb176`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-active-prototype-v2.png`

这是主视觉母版页面。用于：

- page chrome
- 纸面几何
- 标题截断
- 居中状态位
- 弱 rail / spine 行为

#### Active click 展开态

- Stitch 标题：`Agent 黑板协作 - 点击展开态 (Refined Click State)`
- Screen ID：`3bb0ca6394b54e668dc57c3745f154ff`

仅用于 comment bullet 的 click 展开行为。不要用作 hover 映射的基线。

#### Active click + 映射态

- Stitch 标题：`Agent 黑板协作 - 点击展开 + 映射态 (Refined Mapping)`
- Screen ID：`53d24619eaaf46108f486e553c6bad9a`

仅用于 click 展开 + 映射的组合展示。不要用作 hover 基线。

#### Flow Review

- Stitch 标题：`Manuscript Draft - Flow Review (稿尾结算版 - 无推进)`
- Screen ID：`5f9276dbfa6e4feea780245fc429ff9f`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-flow-review-prototype-v2.png`

已锁定的关键决策：

- 不显示 `Proceed`
- 仍是同一份原稿
- 批量 accept / reject 在原稿底部
- 顶部为 Flow / PR 分段切换，不使用 active bullet rail
- 接受 / 拒绝全部处理完 pending 后，mock 流程回到 active

#### PR Review

- Stitch 标题：`Manuscript Draft - PR Review (局部聚焦版 - 无推进)`
- Screen ID：`53c39ed2e05340bfbbd41448f434e57d`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-pr-review-prototype-v1.png`

已锁定的关键决策：

- 不显示 `Proceed`
- 同一份原稿，局部 hunk 聚焦
- 无分离的工程 PR shell
- 前后文淡化，中间 hunk 浮起，接受 / 拒绝按钮在 hunk 内
- Flow / PR 切换共享同一份 `ReviewChangeSet`

#### Document Unit Editing

- 使用用户在 Stitch 中手动保留的版本
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-editing-prototype-v1.png`

关键规则：

- rail 必须继承自 active 默认母版
- 编辑区域必须感觉嵌入原稿，不能像灰色编辑器盒子

#### Selection + Inline Popover

- Stitch 标题：`Manuscript Draft - 选区与行内气泡交互 (母版对齐)`
- Screen ID：`d314bb4a6bd74513bdd53964c8de9ce0`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-selection-popover-prototype-v1.png`

关键规则：

- popover 必须附着在纸面内的选区上，不能漂移到页面边缘

#### Proceeding / Takeover

- 使用用户在 Stitch 中手动保留的版本
- Stitch 标题：`Manuscript Draft - 正在统合修改 (终极对齐)`
- Screen ID：`d4665fb941ad446a84dd056948d6d618`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-proceeding-prototype-v1.png`

关键规则：

- 这是最强的接管状态
- 必须保留下方的幽灵原稿连续性
- 不能退化为空白 loading 页面
- 点击 active 的 `Proceed` 后进入本地 mock proceeding：三段进度推进，完成后自动进入 `reviewing_flow`

#### History Preview

- 使用用户在 Stitch 中手动保留的版本
- Stitch 标题：`Manuscript Draft - History Preview`
- Screen ID：`cb10cb107b2c443f9063135d80882c7f`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-history-preview-prototype-v1.png`

关键规则：

- 无 rail、无 line number、无 active 页面 chrome
- 仅只读历史原稿上下文，主体是居中的白色稿纸
- 顶部只保留弱化的版本 / 时间信息
- 底部固定操作条；操作仅限返回 / 恢复

#### Closed State

- Stitch 标题：`Manuscript Draft - 已关闭状态 (归档)`
- Screen ID：`3330d48a204347d7979528d514712ca1`
- PNG 辅助参考：`output/imagegen/2026-05-04-blackboard-closed-prototype-v1.png`

关键规则：

- 原稿仍可见
- 协作已明确结束
- 无 rail、无 line number、无 active 页面 chrome
- 顶部是只读归档 chrome：左侧标题、中间关闭状态、右侧关闭图标
- 正文上方有轻量提示：会话已关闭，仍可阅读最终原稿，但不能编辑或推进
- 无可见的回到活跃协作的路径；active 的关闭按钮进入该状态

### 6.2 不可作为基线的页面

以下不应作为主要重建参考：

- 带 `File / History / Drafts` 的旧 shell 页面
- 任何重新引入右侧等权重栏的 Stitch 屏幕
- 以 click 展开内容作为 hover 映射基线的 rail 详情页
- 退化为白色 loading 屏的 takeover 页面

特别警告：

- `Rail Mapping Detail` 未完全满足用户预期
- 用户的核心纠正是：使用 `Processing Hover 映射态` 作为 rail hover 逻辑的基线，不要用 click 展开作为基线

## 7. PNG Asset Index

以下 PNG 截图作为离线辅助参考和视觉 QA 对照使用。

### 7.1 规范参考

- `active`
  `output/imagegen/2026-05-04-blackboard-active-prototype-v2.png`
- `flow review`
  `output/imagegen/2026-05-04-blackboard-flow-review-prototype-v2.png`
- `pr review`
  `output/imagegen/2026-05-04-blackboard-pr-review-prototype-v1.png`
- `history preview`
  `output/imagegen/2026-05-04-blackboard-history-preview-prototype-v1.png`
- `proceeding`
  `output/imagegen/2026-05-04-blackboard-proceeding-prototype-v1.png`
- `closed`
  `output/imagegen/2026-05-04-blackboard-closed-prototype-v1.png`
- `rail mapping`
  `output/imagegen/2026-05-04-blackboard-rail-detail-v2.png`
- `document unit editing`
  `output/imagegen/2026-05-04-blackboard-editing-prototype-v1.png`
- `selection + inline popover`
  `output/imagegen/2026-05-04-blackboard-selection-popover-prototype-v1.png`

### 7.2 探索性资产

以下保留作为研究历史，但不是默认实现目标：

- `output/imagegen/2026-05-04-blackboard-visual-direction-board-v1.png`
- `output/imagegen/2026-05-04-blackboard-visual-direction-board-v2.png`
- `output/imagegen/2026-05-04-blackboard-visual-direction-board-v3.png`
- `output/imagegen/2026-05-04-blackboard-active-prototype-v1.png`
- `output/imagegen/2026-05-04-blackboard-rail-detail-v1.png`

## 8. Current Visual Constraints

以下规则已固定，除非本文档被显式更新：

- `active` 保持 rail 比展示中更隐藏
- `active` 顶部右侧补充低权重 `History` 入口，进入独立 `history_preview`；Stitch active 母版未显式表达该跳转，但项目内存在独立 History Preview screen
- `history_preview` 移除 rail 和 processing marker UI
- `reviewing(flow)` 和 `reviewing(pr)` 不复用 active bullet rail 作为可见侧栏
- `reviewing(flow)` 不引入 issue 分类 UI
- `proceeding` 保持为最强视觉接管状态

## 9. Use In Implementation

当前端实现面临选择时：

1. 优先参考 Stitch 项目中用户确认/保留的设计稿
2. 其次参考本文档指向的 PNG 截图
3. 两者都不能覆盖时，以稳定产品和模板约束为准

旧的局部实现视觉效果不应覆盖本文档中的参考。

## 10. Related Documents

Use this document together with:

- `docs/04-design/UI-Structure.md`
- `docs/03-contracts/Document-Template-Contract.md`
- `docs/04-design/Visual-QA-Checklist.md`
- `docs/04-design/Control-Surface-Matrix.md`
