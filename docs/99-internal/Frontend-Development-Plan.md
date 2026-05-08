# Frontend Development Plan

本文档用于指导 Blackboard 前端 MVP 的分阶段开发与验收。

当前策略：

- 先建立可运行前端工程；
- 再用 fixture snapshot 驱动完整页面状态；
- 先打磨 `active` 文稿母版；
- 最后替换为真实 HTTP commands + SSE events。

## 1. 开发原则

### 1.1 不等待后端完整实现

前端第一阶段使用 fixture snapshot 与 mock event reducer 开发。

后端协议接入应在页面结构、状态边界与核心交互稳定后进行。

### 1.2 Markdown 与 DocumentUnit 是前端核心输入

前端不得把渲染后的 HTML 当作业务真相。

页面应始终基于：

- `SessionSnapshot`
- `DocumentUnit[]`
- `activeBullets`
- `activeReviewChangeSet`

驱动 UI。

### 1.3 先保证页面形态正确

`active` 页面是整个产品的视觉母版。

在 `active` 尚未表现为“原稿阅读面”之前，不应急于堆叠 review、history、closed 等状态。

### 1.4 每个阶段都必须可验收

每个阶段完成时都应能运行、能截图、能说明与当前文档约束的差距。

## 2. 阶段总览

| 阶段 | 名称              | 目标                            | 状态        |
| ---- | ----------------- | ------------------------------- | ----------- |
| 0    | 工程初始化        | 前端项目可启动                  | done        |
| 1    | Schema 与 fixture | 页面可由 mock snapshot 驱动     | done        |
| 2    | Active 文稿母版   | 建立核心阅读界面                | done        |
| 3    | Active 核心交互   | 支持编辑、批注、bullet rail     | done        |
| 4    | 状态接管页面      | 支持 proceeding/history/closed  | done        |
| 5    | Review            | 支持 flow/pr review             | done        |
| 6    | 协议接入          | 接入 HTTP commands + SSE events | in progress |
| 7    | 验收与截图        | 建立 e2e 与视觉证据             | partial     |

当前状态说明：

- 阶段 0-5 已完成的是 fixture/mock 驱动版本，页面形态与核心交互已按 Stitch 参考打通。
- 阶段 6 已开始：当前已固定 V1 endpoint / envelope / error 细节，并加入 Vite dev mock backend，让前端通过真实 HTTP commands + SSE events 跑固定流程。
- 阶段 7 已产生临时 Playwright 验证脚本和截图证据，但尚未落成 repo 内可重复运行的 e2e 测试套件。

## 3. 阶段 0：工程初始化

### 目标

创建可运行的前端工程，为后续页面开发提供稳定目录结构、开发命令和基础样式入口。

### 任务

- 创建 `apps/frontend/`
- 配置 TypeScript 前端工程
- 配置 Vite 或等价轻量开发服务器
- 配置基础 lint/format/test 命令
- 建立目录结构：
  - `src/app/`
  - `src/components/`
  - `src/styles/`
  - `src/fixtures/`
  - `src/types/`
  - `src/test/`

### 交付物

- 前端工程可启动
- 空白 Blackboard 页面可打开
- 页面显示最小 shell：标题、加载状态、空阅读面

### 验收标准

- `pnpm install` 可执行
- `pnpm dev` 可启动前端
- 浏览器可访问本地页面
- 页面没有运行时报错

## 4. 阶段 1：Schema 与 Fixture Snapshot

### 目标

在没有真实后端的情况下，用 repo-local fixture 驱动所有核心页面状态。

### 任务

- 落地 TypeScript schema：
  - `SessionSnapshot`
  - `DocumentUnit`
  - `Bullet`
  - `ReviewChangeSet`
  - `Change`
  - `VersionSummaryItem`
  - command/event envelope
- 创建 fixture snapshot：
  - `active`
  - `active-editing`
  - `active-selection`
  - `proceeding`
  - `reviewing-flow`
  - `reviewing-pr`
  - `history-preview`
  - `closed`
- 建立 fixture switcher，仅供开发和测试使用
- 建立基础 store/reducer，使页面状态从 snapshot 派生

### 交付物

- `src/types/blackboard.ts`
- `src/fixtures/*.ts`
- `src/app/sessionStore.ts`
- `src/app/sessionSelectors.ts`

### 验收标准

- 页面可以切换不同 fixture
- 页面显示内容来自 snapshot，不来自组件硬编码
- `workingSetRevision`、`sessionStatus`、`activeReviewChangeSet` 能进入 store
- 类型能覆盖当前文档定义的最小 schema

## 5. 阶段 2：Active 文稿母版

### 目标

完成最重要的 `active` 默认态，使页面首先像一份全屏原稿，而不是后台工具页面。

### 任务

- 实现组件骨架：
  - `BlackboardPage`
  - `PageChrome`
  - `ReadingSurface`
  - `DocumentScroller`
  - `DocumentView`
  - `DocumentUnitRenderer`
  - `EdgeLayer`
  - `BulletRail`
  - `AgentAvatar`
- 实现 `DocumentUnit` 到语义 HTML 的渲染：
  - `title` -> `h1`
  - `heading` -> `h2/h3`
  - `paragraph` -> `p`
  - `list_item` -> `li`
  - `blockquote` -> `blockquote`
  - `table` -> `table`
  - `code_block` -> `pre > code`
- 建立字体与基础样式：
  - title/display：Fraunces 或 fallback
  - body：Source Serif 4 或 fallback
  - controls：IBM Plex Sans 或 fallback
  - code：JetBrains Mono 或 fallback
- 实现纸面背景、正文宽度、留白和 rail 基础位置

### 交付物

- `active` 默认页面
- 可渲染完整 Markdown 派生后的文稿单元
- 弱存在的 bullet rail

### 验收标准

- 页面第一感受是“原稿”，不是 dashboard
- 桌面正文宽度接近 `720-840px`
- 主正文 measure 接近 `68-72ch`
- rail 附着在纸面边缘，不形成等权侧栏
- 顶部 chrome 弱于正文主体
- 对照 `docs/04-design/Visual-Reference.md` 的 active 默认态记录差距

## 6. 阶段 3：Active 核心交互

### 目标

完成用户在 active 状态下的主要表达能力。

### 任务

- 文稿单元编辑：
  - 双击进入编辑
  - 同时只允许一个 `DocumentUnit` 编辑
  - 确认编辑
  - 取消编辑
  - 未确认编辑不写入正文
- 本地模拟 edit commit：
  - 更新 fixture store
  - 生成 mock `edit bullet`
  - 递增 mock `workingSetRevision`
- 选区批注：
  - 选中文本后显示 inline popover
  - 提交 comment
  - 生成 mock `comment bullet`
- bullet rail：
  - hover 映射到文稿锚点
  - click 展开 comment note
  - 显示视觉聚合状态：`new`、`processing`、`processed`
- guard：
  - 编辑态禁止 Proceed
  - 编辑态禁止 History
  - 编辑态禁止 Close

### 交付物

- `DocumentUnitEditor`
- `SelectionAffordance`
- `InlineBulletPopover`
- `BulletNode`
- `BulletNote`
- `active` 交互 fixture

### 验收标准

- 同一时间只能编辑一个文稿单元
- 确认编辑后正文变化，取消编辑后正文不变
- 编辑确认后生成 edit bullet
- comment bullet 可创建并显示在 rail
- hover 不展开卡片，只显示精确映射
- click 才展开 note
- active 状态下交互不破坏原稿阅读感

## 7. 阶段 4：Proceeding / History / Closed

### 目标

完成三个强状态页面，使顶层状态边界清晰。

### 任务

- `ProceedOverlay`
  - 全屏接管
  - 展示阶段：
    - `resolving_bullets`
    - `synthesizing_changes`
    - `materializing_review`
  - 展示进度
  - 禁止页面交互
- `HistoryPreviewPage`
  - 整页只读稿件
  - 无 rail
  - 返回当前工作区
  - 恢复此版本
- `ClosedStatePage`
  - 原稿仍可见
  - 明确显示协作已结束
  - 无恢复协作入口

### 交付物

- `proceeding` fixture 可展示
- `history-preview` fixture 可展示
- `closed` fixture 可展示
- 状态切换 mock action

### 验收标准

- proceeding 不退化为空白 loading
- proceeding 保留幽灵原稿连续性
- history 是整页状态，不是 modal/drawer
- closed 是终态，不显示继续协作入口
- 三个状态都延续原稿视觉语言

## 8. 阶段 5：Review

### 目标

实现 `reviewing` 状态下的 Flow Review 和 PR Review，并保证二者共享同一份 `ReviewChangeSet`。

### 任务

- `ReviewOverlay`
- `FlowReview`
- `PrReview`
- review mode 切换
- inline tracked changes 表达
- hunk 聚焦
- accept change
- reject change
- accept all remaining
- reject all remaining
- 最后一个 pending 处理后的 mock review resolved

### 交付物

- `reviewing-flow` 页面
- `reviewing-pr` 页面
- 共享 change 状态的 reducer

### 验收标准

- Flow Review 仍是整篇稿件阅读
- PR Review 是局部 hunk 聚焦，不是独立 PR 工具页面
- Flow/PR 切换后 accepted/rejected 状态一致
- 不显示 Proceed
- 所有 pending 消失后 mock 流程回到 active

## 9. 阶段 6：HTTP Commands + SSE Events 接入

### 目标

将 fixture 驱动替换为真实协议驱动，同时保留 fixture/dev mode。

### 任务

- 实现 `apiClient`
- 实现 `eventSourceClient`
- 实现 command envelope：
  - `document_unit.edit.commit`
  - `bullet.comment.create`
  - `bullet.update`
  - `session.proceed`
  - `review.change.accept`
  - `review.change.reject`
  - `review.accept_all_remaining`
  - `review.reject_all_remaining`
  - `history.restore_version`
  - `session.request_close`
- 实现 query：
  - `history.get_version`
- 实现 event reducer：
  - `session.snapshot`
  - `document_unit.updated`
  - `bullet.created`
  - `bullet.status_changed`
  - `working_set.rebased`
  - `proceed.started`
  - `proceed.stage_changed`
  - `proceed.progress_updated`
  - `review_change_set.created`
  - `review.change_status_changed`
  - `review.resolved`
  - `version.created`
  - `session.closed`
  - `error.raised`
- SSE 断线重连后用新的 `session.snapshot` 覆盖本地状态

### 交付物

- `src/app/apiClient.ts`
- `src/app/eventSourceClient.ts`
- `src/app/eventReducer.ts`
- `src/app/commands.ts`
- `mockProtocolServer.ts`

### 验收标准

- 所有上行写操作都通过 command
- 组件不直接调用散落的 fetch
- SSE 初始化 snapshot 可重建页面
- 重连后本地状态以新 snapshot 为准
- `REVISION_MISMATCH` 能提示刷新或等待 snapshot

### 当前阶段 6 进度

已完成：

- V1 endpoint 决策已写入 `docs/03-contracts/Frontend-Backend-Protocol.md`
- 前端新增 `apiClient`、`eventSourceClient`、`commands`、`eventReducer`
- `useSessionStore` 默认使用协议模式，`?transport=fixture` 可回到本地 fixture fallback
- Vite dev server 提供 mock protocol backend：
  - `GET /api/sessions/:sessionId/events`
  - `POST /api/sessions/:sessionId/commands`
  - `GET /api/sessions/:sessionId/history/:versionId`
- mock backend 已覆盖 edit、comment、proceed、review accept/reject、history restore、close 的固定流程

待补：

- 增加 Playwright e2e，验证用户交互会触发 command 并由 SSE event 改变页面
- 接入真实后端时复用同一套 endpoint 与 envelope

已在后续补齐：

- `SessionSnapshot.sessionStatus` 已收窄为 backend 生命周期：`active | proceeding | reviewing | closed`
- `history_preview` 已迁移到前端 `viewMode`
- `reviewing_flow/reviewing_pr` 已迁移为由 `reviewMode` 派生出的页面状态

## 10. 阶段 7：验收与截图

### 目标

建立可重复的前端验收证据，防止页面形态偏离文档。

当前状态：partial。已通过临时 Playwright 脚本生成并人工检查 desktop 截图；已加入一条协议级 smoke e2e；尚未提交完整交互 e2e、视觉截图矩阵和 mobile 截图矩阵。

当前已有截图证据：

- active：`output/frontend/active-desktop-stitch-aligned.png`
- active history entry：`output/frontend/active-history-entry.png`
- proceeding：`output/frontend/proceeding-stitch-aligned.png`
- proceeding mock progress：`output/frontend/proceeding-mock-progress.png`
- history preview：`output/frontend/history-preview-stitch-aligned-viewport.png`
- closed：`output/frontend/closed-state-stitch-aligned.png`
- flow review：`output/frontend/flow-review-stitch-aligned.png`
- pr review：`output/frontend/pr-review-stitch-rewrite.png`

### 任务

- 配置 Playwright
- 增加 e2e：
  - active 渲染
  - 编辑文稿单元
  - 创建 comment bullet
  - Proceed mock 流程
  - Flow/PR review 切换
  - accept/reject change
  - history preview
  - closed
- 为顶层状态生成截图：
  - desktop
  - mobile
- 记录视觉 QA 结果

### 交付物

- `tests/e2e/`
- `playwright.config.ts`
- `artifacts/screenshots/`
- 前端视觉 QA 记录

### 当前阶段 7 进度

已完成：

- 新增 `playwright.config.ts`
- 新增协议级 smoke：`tests/e2e/protocol-smoke.spec.ts`
- smoke 只断言关键协议链路：
  - SSE `session.snapshot` 后页面进入 active
  - 点击 Proceed 发出 `session.proceed` command
  - SSE 推动页面进入 reviewing flow
  - accept all 发出 `review.accept_all_remaining` command
  - review 结算后页面回到 active

暂不固化：

- 当前页面布局、截图、hover、popover、rail 精确视觉
- review / history / proceeding 的像素级结构
- mobile 截图矩阵

原因：

- 当前 UI 仍会继续打磨，过早锁定视觉细节会增加无效维护成本；
- 现阶段更适合只保护协议状态流转不回归。

### 验收标准

- 每个顶层状态都有 desktop/mobile 截图
- 截图对照 `Visual-Reference.md`
- 移动端正文不被 rail 或 review 挤压
- 字体 fallback 不造成明显布局破坏
- 记录 prototype delta

## 11. 第一轮执行范围

第一轮原计划只执行：

1. 阶段 0：工程初始化
2. 阶段 1：Schema 与 fixture snapshot
3. 阶段 2：Active 文稿母版

当前实际进度已经推进到阶段 5：

- 阶段 3：Active 核心交互已完成 mock 版本，包括编辑、选区批注、bullet rail、hover/click 映射与 note 展开。
- 阶段 4：Proceeding / History / Closed 已完成 mock 版本，包括 Proceed mock 进度、History Preview、Closed State。
- 阶段 5：Review 已完成 mock 版本，包括 Flow Review、PR Review、mode 切换、accept/reject 与完成后回到 active。

第一轮结束后必须先验收 `active` 页面形态；该项已完成，并在后续交互中持续按 Stitch 参考修正。

如果 `active` 页面没有达到“原稿阅读面”的目标，应先修正视觉结构，再进入交互开发。

## 12. 当前待补决策

以下事项已在阶段 6 第一轮固定：

- HTTP command endpoint：`POST /api/sessions/:sessionId/commands`
- SSE endpoint：`GET /api/sessions/:sessionId/events`
- history query endpoint：`GET /api/sessions/:sessionId/history/:versionId`
- sessionId 来源：URL query `?sessionId=demo`，缺省为 `demo`
- command 成功响应格式：`{ ok: true, commandId, acceptedAt }`
- query 成功响应格式：按 query payload 直接返回；history query 返回 `versionId/versionNumber/content/createdAt/documentUnits`
- HTTP status 与 `ErrorEnvelope` 对应关系：见 `Frontend-Backend-Protocol.md`
- `history_preview` 语义：前端本地只读 view mode，不作为 backend 持久 session status

## 13. 推荐执行节奏

每个阶段按以下节奏推进：

1. 先实现最小可运行版本。
2. 用 fixture 验证主要状态。
3. 补交互 guard。
4. 截图对照文档。
5. 记录已知差距。
6. 再进入下一阶段。

不要在同一阶段同时追求全部视觉细节和全部协议能力。

前端 MVP 的关键路径是：

```text
工程可启动
  -> snapshot 可驱动页面
  -> active 原稿母版成立
  -> active 交互成立
  -> 强状态成立
  -> review 成立
  -> 协议接入
  -> 截图与 e2e 验收
```
