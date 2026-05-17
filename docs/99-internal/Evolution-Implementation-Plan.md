# Blackboard 演进开发实施方案

本文档用于把当前代码审查结论与正式产品文档对齐，形成一份可执行的演进开发方案。

目标不是继续堆叠功能，而是把项目从：

- 前端形态已成
- 协议骨架已通
- 但核心合同尚未收口

推进到：

- 文档定义与代码实现一致
- 单 session 黑板闭环真实可运行
- 人类与 subagent 的最小协作链路可验证
- MVP 具备结构、语义、交互和运行时层面的收敛基础

---

## 1. 当前判断

基于当前正式文档与代码实现的对照，项目处于如下阶段：

- 已完成前端 manuscript-first 页面母版与主要页面状态
- 已完成 HTTP commands + SSE events 的首版接入
- 已有 backend/CLI 雏形与 mock proceed 路径
- 尚未完成核心领域合同、真实 session 语义、review/version 结算语义与真实 subagent 闭环

因此，当前阶段不应继续优先扩展功能，而应优先完成“合同收口”。

---

## 2. 演进原则

### 2.1 先修合同，再扩能力

如果核心对象、状态机、协议和 CLI 合同仍然漂移，新增能力只会扩大后续返工成本。

### 2.2 先保真相层，再保交互层

Blackboard 的稳定性首先来自：

- Markdown 是唯一正文真相
- `DocumentUnit[]` 是派生结构
- `Version / WorkingSet / ReviewChangeSet` 三层文本状态不混淆

### 2.3 先打通真实单闭环，再做复杂验收

当前最重要的不是更多 UI 细节，而是打通：

`create_session -> 编辑/批注 -> Proceed -> candidate -> review -> version -> close`

### 2.4 以正式文档为唯一基线

本轮演进以以下目录为稳定真相：

- `docs/01-product/`
- `docs/02-models/`
- `docs/03-contracts/`
- `docs/04-design/`
- `docs/05-agent/`

`docs/99-internal/` 仅承载执行计划与阶段性判断，不覆盖正式规范。

---

## 3. 阶段总览

| 阶段 | 名称 | 目标 |
| --- | --- | --- |
| 0 | 基线冻结 | 冻结范围，建立合同差距清单 |
| 1 | Schema 收口 | 统一领域对象、共享类型、补齐合同字段 |
| 2 | Markdown 真相链路收口 | 编辑走源码替换与全文重解析 |
| 3 | Session 与协议收口 | 统一 frontend/backend/CLI 的 session 语义 |
| 4 | Review 与 Version 收口 | 修正 Proceed、review、version 结算逻辑 |
| 5 | 真实 Subagent 闭环 | 移除 mock 主路径，打通真实 agent loop |
| 6 | 验收层收口 | 建立五层验收证据并形成可复现验证路径 |

---

## 4. 阶段 0：基线冻结

### 目标

停止无序漂移，统一“本轮什么算完成”。

### 任务

1. 明确本轮只做单人类、单 subagent、单 session 的 MVP 闭环。
2. 整理当前代码与正式文档的合同差距。
3. 将差距分为三类：
   - `must-fix`
   - `should-fix`
   - `defer`
4. 暂停新增非必要 UI 变化与额外功能支线。

### 产出

- 合同差距清单
- 本轮范围边界说明

### 完成标准

- 团队对“当前不是扩功能阶段，而是收口阶段”达成一致
- 后续任务不再脱离阶段顺序执行

---

## 5. 阶段 1：Schema 收口

### 目标

让代码里的对象先和文档说同一种语言。

### 任务

1. 建立共享 schema 层，避免前后端各自维护近似但不一致的类型。
2. 对齐以下核心对象：
   - `ReviewChangeSet`
   - `Change`
   - `Bullet`
   - `SessionSnapshot`
   - `HistoryVersionPayload`
3. 补齐文档要求的核心字段。

`ReviewChangeSet` 至少应包含：

- `reviewChangeSetId`
- `sourceWorkingSetRevision`
- `baseVersionId`
- `candidateContent`
- `changes`
- `status`

`Change` 至少应包含：

- `changeId`
- `unitId`
- `kind`
- `startOffset`
- `endOffset`
- `beforeText`
- `afterText`
- `status`

`Bullet` 至少应覆盖文档定义的核心语义字段，并区分：

- `edit bullet`
- `comment bullet`

4. 明确哪些字段属于：
   - backend 真相
   - frontend 派生视图
   - subagent 本地缓存

### 产出

- 统一后的共享类型定义
- 前后端类型引用收口

### 完成标准

- 前后端不再各自维护语义缩水版 schema
- 代码对象可以直接映射正式文档

---

## 6. 阶段 2：Markdown 真相链路收口

### 目标

真正实现“Markdown 是唯一正文真相”。

### 任务

1. 将 `document_unit.edit.commit` 改为：
   - 基于 `sourceStart/sourceEnd` 替换 Markdown 源切片
   - 重新解析整篇 Markdown
   - 生成新的 `DocumentUnit[]`
2. 不再采用“原地修改当前 unit 并重新拼接全文”的方式。
3. 编辑后允许单元类型自然变化。
4. 每次重解析后重新生成：
   - `sourceStart`
   - `sourceEnd`
   - 当前 revision 内稳定的 `unitId`
5. 明确 `DocumentUnit[]` 只是派生结构，不是业务真相。

### 测试要求

至少补齐以下测试：

- Markdown profile tests
- `DocumentUnit` derivation tests
- edit reparse tests
- source range correctness tests
- unit type transition tests

### 产出

- 符合合同的编辑链路
- 稳定的 Markdown 解析与重解析测试

### 完成标准

- 所有正文编辑都走“源码替换 + 全文重解析”
- `DocumentUnit[]` 明确成为派生结果

---

## 7. 阶段 3：Session 与协议收口

### 目标

让 frontend、backend、CLI 真正在操作同一个 session。

### 任务

1. 明确 session 生命周期：
   - `create_session`
   - frontend attach
   - SSE snapshot
   - commands
   - history query
2. 移除未知 `sessionId` 静默回退 `demo` 的行为。
3. 统一三条路径的 session 处理：
   - SSE
   - command
   - history
4. 修复 CLI 合同路径：
   - `POST /cli/sessions/:id/bullets/:bulletId/ready`
5. 区分三种运行模式：
   - fixture mode
   - demo mode
   - real session mode
6. 若保留 `demo`，需明确它只作为显式开发入口，不是未知 session 的兜底替身。

### 测试要求

- 创建 session 后 frontend 可正常 attach
- SSE/command/history 三条链路命中同一 session
- CLI `mark_bullet_ready` 路径符合文档定义

### 产出

- 一致的 session 语义
- 一致的 frontend/backend/CLI 协议行为

### 完成标准

- 真实 session 路径不再依赖 `demo` 回退
- 新 session 可以从创建到进入页面完成基本联通

---

## 8. 阶段 4：Review 与 Version 收口

### 目标

把最核心的 Proceed 闭环修到符合文档。

### 任务

1. 严格按文档实现 review 结算规则：
   - 还有 `pending` 时不结算
   - 全部结算后：
     - 若至少一个 `accepted`，生成新 Version
     - 若全部 `rejected`，回到原 `WorkingSet`，不生成新 Version
2. 正确处理 `Change.kind`：
   - `replace`
   - `insert`
   - `delete`
3. 确保 `candidateContent` 与 `changes` 始终一致。
4. 保证 `currentVersionId`、`baseVersionId`、`workingSetRevision` 的推进逻辑符合文档。

### 测试要求

- accept single change
- reject single change
- accept all
- reject all
- mixed settlement
- insert/delete apply behavior
- version generation conditions

### 产出

- 符合合同的 review settlement
- 正确的 version 生成逻辑

### 完成标准

- version 只在正确条件下生成
- rejected-only 的 review 不会错误落版

---

## 9. 阶段 5：真实 Subagent 闭环

### 目标

从“模拟 Agent”推进到“真实 Agent”。

### 任务

1. 保留 mock 作为 fallback，但不再把 mock 作为默认主路径。
2. 按文档完成最小 subagent 工作流：
   - `create_session`
   - `get_snapshot`
   - `mark_bullet_ready`
   - `submit_review_candidate`
   - `close_session`
3. 明确宿主交付模型：
   - 一事件一回合
   - 本地工作区可重建
4. 验证两个关键回合：
   - comment bullet 回合
   - Proceed 回合
5. 在真实环境中完成一轮人工黑板循环：
   - human edit/comment
   - subagent follow
   - Proceed
   - review
   - accept/reject
   - close

### 产出

- 可运行的真实 subagent 主路径
- 至少一轮真实协作验证记录

### 完成标准

- 在关闭 mock 主路径的情况下，真实 subagent 可完成完整一轮闭环

---

## 10. 阶段 6：验收层收口

### 目标

把“能跑”升级成“可证明”。

### 任务

1. 按 `Acceptance Matrix` 补齐五层验收：
   - structure
   - rendering
   - interaction
   - presentation
   - runtime
2. 重写 e2e，使其不再依赖错误的 fixture 前提。
3. 让 e2e 走真实 session seed 与真实协议路径。
4. 补齐 presentation 证据：
   - desktop screenshots
   - mobile screenshots
   - prototype comparison notes
5. 补齐 runtime evidence：
   - adapter tests
   - dispatcher tests
   - one real host validation run
6. 在 runbook 中记录：
   - `automated-pass`
   - `manual-pass`
   - `known-gap`
   - `blocker`

### 产出

- 可复现的测试与验收证据
- 明确的 MVP readiness 记录

### 完成标准

- `test/build/e2e` 建立在真实合同前提上
- 至少完成一轮真实 host validation

---

## 11. 推荐执行顺序

推荐严格按以下顺序推进：

1. 阶段 0：基线冻结
2. 阶段 1：Schema 收口
3. 阶段 2：Markdown 真相链路收口
4. 阶段 3：Session 与协议收口
5. 阶段 4：Review 与 Version 收口
6. 阶段 5：真实 Subagent 闭环
7. 阶段 6：验收层收口

说明：

- 阶段 1、2、3 必须优先串行完成
- 阶段 4 紧跟 3
- 阶段 5 依赖 3 和 4 基本稳定
- 阶段 6 可局部提前铺设，但正式收口放在最后

---

## 12. 当前最核心的三项任务

如果仅开一个短周期，建议只优先做以下三项：

### 12.1 统一共享 schema

重点补齐：

- `ReviewChangeSet`
- `Change`
- `Bullet`

目标：

- 前后端以同一合同表达核心对象

### 12.2 修复 Markdown 真相链路

重点实现：

- 源码切片替换
- 全文重解析
- `DocumentUnit[]` 派生重建

目标：

- 真正落地“Markdown 是唯一正文真相”

### 12.3 修复 session 语义

重点实现：

- 移除未知 session 回退 `demo`
- 打通 `create_session -> frontend attach`
- 统一 SSE / command / history 三条链路

目标：

- 黑板从“局部演示”升级到“真实 session 系统”

---

## 13. 风险提示

### 13.1 最大风险不是功能不够，而是合同继续漂移

如果继续先做 UI 或先做更多交互，后续重构成本会明显增大。

### 13.2 当前 e2e 不能作为完成依据

在 session 语义与 review 语义未收口之前，现有 e2e 只能提供局部信号，不能作为产品完成的强证据。

### 13.3 mock 主路径会掩盖真实问题

Proceed mock 保留为 fallback 可以接受，但如果继续依赖 mock 主路径，会持续遮蔽真实 agent loop 中的问题。

---

## 14. 本文档用途

本文档用于：

- 后续演进开发排期
- 阶段性任务切分
- 代码审查时判断是否偏离正确方向
- 验收前核对当前阶段是否已满足进入下一阶段的条件

本文档不替代正式产品/模型/协议文档。
