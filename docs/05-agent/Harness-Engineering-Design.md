# Blackboard Harness Engineering Design

## 1. 文档目标

本文档定义当前阶段 `Blackboard` 项目的 `harness engineering` 设计。

本文档重点回答以下问题：

* 仓库如何对 Agent 友好，并符合渐进式披露原则；
* 项目的分层、依赖方向、稳定实体与命名规则如何固定；
* 如何用简单、可复用、可机械校验的方式约束代码演化；
* 如何为 Agent 提供清晰 workflow、可观测性与反馈闭环；
* 首批应落地哪些文件、脚本与 registry。

本文档当前不展开：

* 具体业务功能实现；
* 最终 CI 平台接线细节；
* 宿主平台特定的 Agent runtime hook。

---

## 2. 设计目标

### 2.1 核心目标

本项目的 harness engineering 目标不是增加一层复杂框架，而是让仓库天然具备以下性质：

* Agent 进入仓库后，能快速知道应该先读什么；
* Agent 改代码前，能明确当前层次边界与禁止事项；
* Agent 改代码后，能立刻收到结构性反馈，而不依赖人工提醒；
* 团队能够稳定复用同一套领域词汇、工程规则与工作流；
* 项目在扩展过程中避免无限抽象、God Class 和方法堆积。

### 2.2 当前仓库判断

基于当前仓库状态，项目仍处于 `docs-first` 阶段：

* `docs/01-product` 已定义产品目标与状态机；
* `docs/02-models` 已定义领域对象与文稿展示模型；
* `docs/03-contracts` 已定义前后端协议与 Agent CLI 合同；
* `docs/04-design` 已定义页面结构与协作 skill 设计；
* `docs/99-internal` 已存在 MVP 实施计划；
* 代码实现骨架尚未建立。

因此当前最合适的 harness 设计不是运行时编排系统，而是：

* 先固定仓库入口；
* 先固定真相边界；
* 先固定分层与命名；
* 先提供最小脚本反馈；
* 先让 Agent 具备最小闭环工作流。

---

## 3. 总体原则

### 3.1 Dual Source but Explicit

本项目采用 `dual source but explicit`：

* `docs/01-04`
  产品、领域、合同、设计真相。
* `harness/`
  工程约束、Agent workflow、结构脚本、反馈报告真相。

两者职责明确分离：

* `docs/` 回答“系统应该是什么”；
* `harness/` 回答“Agent 应该如何安全地把它做出来”。

### 3.2 渐进式披露

Agent 不应在首次进入仓库时被迫读取全部背景。

仓库应固定一条由浅入深的阅读路径：

1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `WORKFLOW.md`
4. `harness/index.md`
5. 任务相关的 `docs/01-04`
6. 必要时再读取 `docs/99-internal`

### 3.3 Repo-local 规则优先

任何稳定约束都必须写进仓库，而不是停留在聊天上下文中。

允许的稳定载体只有三类：

* `docs/`
* `harness/rules/`
* `harness/scripts/` 与 `harness/registry/`

### 3.4 Keep Simple and Stupid

本项目明确采用 `KISS`：

* 如无必要，不增加新实体；
* 如无必要，不增加新层级；
* 如无必要，不抽新抽象；
* 如无必要，不增加新的“通用工具”目录；
* 少量重复优于错误抽象。

### 3.5 复用的目标

本项目中“复用”的目标不是减少代码行数，而是减少重复决策点。

允许复用的重点是：

* 稳定词汇；
* 纯函数；
* 少量明确的端口；
* 仓库规则本身。

不鼓励复用的对象是：

* 提前抽象的基类；
* 宽泛的全局 `utils`；
* 语义模糊的 `Manager` / `Engine` / `Helper`；
* 为未来可能复用而预建的抽象层。

### 3.6 Harness 随项目演进

本项目的 harness engineering 不是一次性写完后长期冻结的制度文件，而是应随项目阶段一起演进的工程治理层。

原因很简单：

* 在 `docs-first` 阶段，最重要的是入口、真相边界与最小阅读路径；
* 在 scaffold 阶段，最重要的是目录结构、package 边界与命名收敛；
* 在实现增长阶段，最重要的是依赖方向、边界解析、测试与回归反馈；
* 在多人或多 Agent 并行阶段，最重要的是规则升级、自动检查与变更影响反馈。

因此 harness 必须同时满足两点：

* 有一组稳定内核，避免仓库语义漂移；
* 有一组可演进外层，随着项目复杂度提升逐步变硬。

### 3.7 稳定内核与可演进外层

以下内容属于稳定内核，应尽量保持稳定：

* 真相边界划分；
* 核心实体白名单；
* 分层方向；
* KISS 原则；
* 渐进式披露入口；
* 命名总原则。

以下内容属于可演进外层，应允许随项目成熟逐步扩展：

* `harness/scripts/*` 的检查粒度；
* `harness/reports/*` 的反馈项；
* `layers.json` 的层级细化；
* `docs-map.json` 的任务分类；
* `WORKFLOW.md` 中针对不同任务类型的分支流程；
* 质量评分模型与变更影响报告。

原则上：

* 稳定内核轻易不改；
* 可演进外层按阶段增量强化；
* 新规则优先追加，不优先推翻旧规则；
* 只有当旧规则已经阻碍正确实现时，才允许替换。

### 3.8 演进方式

Harness 的演进应遵循以下方式：

1. 从提示性规则开始，再升级为机械检查。
2. 从文件存在性检查开始，再升级为结构检查。
3. 从结构检查开始，再升级为跨层约束与质量反馈。
4. 从单 Agent 工作流开始，再升级为多 worker 协作约束。

这意味着：

* 早期不追求一次把全部规则做成重型阻断；
* 但每次项目复杂度上升时，都应同步补强 harness；
* 任何已经稳定下来的有效规则，都应尽快沉淀进 repo-local 文件或脚本。

---

## 4. 真相边界

### 4.1 正式规范真相

以下文档属于正式规范真相：

* `docs/01-product/*`
* `docs/02-models/*`
* `docs/03-contracts/*`
* `docs/04-design/*`

### 4.2 工程治理真相

以下内容属于工程治理真相：

* `AGENTS.md`
* `ARCHITECTURE.md`
* `WORKFLOW.md`
* `harness/index.md`
* `harness/rules/*`
* `harness/registry/*`
* `harness/scripts/*`

### 4.3 非正式真相

以下内容默认不作为稳定规范真相：

* `docs/90-research/*`
* `docs/99-internal/*`

说明：

* `90-research` 用于理解背景；
* `99-internal` 用于计划、执行与团队过程；
* 只有当内容被提升到 `docs/01-04` 或 `harness/` 后，Agent 才能把它视为稳定约束。

---

## 5. 目标仓库结构

### 5.1 顶层入口

```text
AGENTS.md
ARCHITECTURE.md
WORKFLOW.md
harness/
docs/
apps/
packages/
tests/
```

### 5.2 Harness 目录

```text
harness/
  index.md
  rules/
    layering.md
    naming.md
    simplicity.md
    reuse.md
    docs-sync.md
  workflows/
    task-loop.md
    change-intake.md
    self-review.md
  registry/
    entities.json
    enums.json
    layers.json
    docs-map.json
  scripts/
    repo-report.mjs
    verify-doc-links.mjs
    verify-architecture.mjs
    verify-entity-naming.mjs
    verify-boundary-parsing.mjs
    verify-workflow-files.mjs
  reports/
    repo-status.md
    quality-score.md
    known-gaps.md
```

### 5.3 Monorepo 目标结构

```text
docs/*

packages/shared
apps/backend
packages/agent-cli
apps/frontend
tests/e2e
```

---

## 6. 项目分层与依赖方向

### 6.1 分层定义

项目实现层固定为四个主区域：

* `packages/shared`
  schema、稳定领域词汇、纯变换。
* `apps/backend`
  session truth、状态迁移、review materialization、repository 编排。
* `packages/agent-cli`
  面向 Agent 的高层客户端命令。
* `apps/frontend`
  snapshot / event 消费、document-first UI。

### 6.2 允许依赖方向

依赖方向固定如下：

```text
packages/shared
  -> does not depend on app-specific layers

apps/backend
  -> may depend on packages/shared
  -> may not depend on apps/frontend
  -> may not depend on packages/agent-cli

packages/agent-cli
  -> may depend on packages/shared
  -> may depend on backend contract shapes
  -> may not depend on frontend internals
  -> may not depend on backend domain implementation

apps/frontend
  -> may depend on packages/shared
  -> may not depend on backend internals
  -> may not depend on packages/agent-cli
```

### 6.3 层内职责固定

#### `packages/shared/schema/*`

只放：

* schema；
* enum；
* error code；
* 边界共享的数据 shape。

不放：

* IO；
* HTTP；
* repository；
* UI；
* backend business orchestration。

#### `packages/shared/domain/*`

只放：

* 稳定领域词汇；
* 纯函数；
* 可重复使用的无副作用变换逻辑。

#### `apps/backend/src/domain/*`

只放：

* session state machine；
* 工作现场业务规则；
* review materialization 业务规则；
* history / version 业务规则。

不直接承担：

* 文件 IO；
* route 映射；
* 页面状态。

#### `apps/backend/src/store/*`

只放：

* repository interface；
* file-backed persistence；
* 存储读写适配。

#### `apps/backend/src/routes/*`

只放：

* 协议映射；
* 输入校验；
* 响应编码；
* transport 适配。

#### `apps/frontend/src/app/*`

只放：

* session store；
* selector；
* api client；
* event source；
* top-level 状态编排。

#### `apps/frontend/src/components/*`

只放：

* 渲染；
* 局部交互；
* 局部视觉组织。

不掌握：

* 线协议真相；
* backend 业务状态机真相。

#### `packages/agent-cli/src/commands/*`

只放：

* 任务级命令封装；
* 面向 subagent 的高层业务命令入口。

不持有：

* backend 业务真相；
* 前端内部交互细节。

---

## 7. 稳定实体与边界对象

### 7.1 稳定核心实体

第一阶段只承认以下核心实体：

* `BlackboardSession`
* `WorkingSet`
* `ReviewChangeSet`
* `Version`
* `DocumentUnit`
* `Bullet`
* `Change`

这些名称应与 `docs/02-models`、`docs/03-contracts` 保持一致。

### 7.2 技术对象

允许存在的技术对象应明确标注其技术性质，不得冒充领域实体。

示例：

* `SessionSnapshot`
* `FrontendCommandDto`
* `StoredSession`
* `FileSessionRepository`

### 7.3 禁止的伪核心实体

以下类型默认禁止作为新的核心对象：

* `SessionManager`
* `ReviewManager`
* `BulletProcessor`
* `DocumentController`
* `WorkspaceContext`
* `ProceedState`

如果确实需要出现，其角色只能是：

* service；
* helper；
* adapter；
* DTO；
* repository；

且必须与稳定实体区分命名。

---

## 8. 复用设计原则

### 8.1 复用的定义

本项目中的复用是“收敛重复决策”，而不是“把所有相似代码抽成共用层”。

### 8.2 允许复用的四类对象

#### 1. 稳定词汇复用

优先复用已在文档中稳定的实体名、字段名、状态词和模式词。

#### 2. 纯函数复用

优先复用：

* Markdown 到 `DocumentUnit[]` 的派生；
* content diff 到 `Change[]` 的派生；
* selector；
* status 判定函数；
* schema normalization。

#### 3. 端口复用

参考 Ports and Adapters 思想，项目只保留少量按目的划分的端口：

* `Frontend Port`
* `Agent CLI Port`
* `Persistence Port`
* `Event Stream Port`

不继续派生大量 manager-like 抽象。

#### 4. 规则复用

把“怎么做”沉淀到：

* `harness/rules/*`
* `harness/scripts/*`
* `harness/registry/*`

而不是让每个 Agent 再解释一遍。

### 8.3 复用硬规则

1. 第二次使用前不抽象。
2. 先按目的复用，不按技术名词复用。
3. 纯函数优先于 service。
4. 复用上移，状态下沉。
5. 一个方法只回答一个问题。
6. 一个类只持有一个变化原因。
7. 允许重复 10 行，不允许抽错 1 层。

### 8.4 默认不鼓励的复用方式

默认不鼓励：

* `BaseService`
* `AbstractManager`
* `CommonHelper`
* `GlobalUtils`
* “为了以后可能复用”而建立的空接口

---

## 9. KISS 约束

### 9.1 Golden Rules

本项目将以下规则视为 Golden Rules：

1. 先复用词汇，再新增代码。
2. 先补纯函数，再补 service。
3. 先补文件内局部函数，再补跨文件抽象。
4. 先补现有层，再开新层。
5. 边界解析一次，内部只用稳定类型。
6. 一个文件一个主概念。
7. 先让检查失败，再实现。
8. 任何新增约束都必须 repo-local。

### 9.2 如无必要勿增实体

新增实体必须满足至少一个条件：

* 文档真相中已定义但代码中尚未具现；
* 现有实体无法表达明确不同的长期业务语义；
* 新对象不是现有对象的轻微投影或别名。

以下情况不应新增实体：

* 只是为了分拆一个大方法；
* 只是暂存局部中间值；
* 只是把已有对象换一个名字再包装。

### 9.3 一个文件一个主概念

每个文件应只暴露一个中心概念。

示例：

* `session-service.ts` 只负责 session 相关业务编排；
* `parse-document-units.ts` 只负责单一纯变换；
* `frontend-commands.ts` 只负责 frontend command route。

---

## 10. 命名原则

### 10.1 总原则

实体、属性、方法命名必须遵循：

* 简单；
* 易读；
* 语义稳定；
* 全仓统一；
* 优先完整词，不做无意义缩写。

### 10.2 实体命名

推荐：

* `BlackboardSession`
* `WorkingSet`
* `ReviewChangeSet`
* `Version`
* `DocumentUnit`
* `Bullet`
* `Change`

不推荐：

* `WorkspaceContext`
* `ReviewArtifact`
* `UnitPayload`
* `MutationEngine`
* `ProceedCoordinator`

### 10.3 属性命名

属性命名规则：

* 一个属性一个意思；
* 相同概念全仓同名；
* `status` 只表示状态；
* `mode` 只表示模式；
* `type` 只表示类型；
* 主标识字段优先保留完整名。

推荐：

* `sessionId`
* `baseVersionId`
* `currentContent`
* `candidateContent`
* `sourceStart`
* `sourceEnd`
* `createdAt`

不推荐：

* 泛化 `id`
* `ctx`
* `data`
* `payload`
* `val`
* `info`

### 10.4 方法命名

方法名应采用 `动词 + 宾语`，且显式暴露副作用或结果。

推荐：

* `parseDocumentUnits`
* `applyUnitEdit`
* `materializeReviewChangeSet`
* `markBulletReady`
* `restoreVersionAsBase`

不推荐：

* `process`
* `handleData`
* `doReview`
* `executeSession`
* `manageHistory`

### 10.5 命名禁忌词

以下词默认不应成为命名逃生口：

* `Manager`
* `Processor`
* `Engine`
* `Helper`
* `Util`

如确实使用，必须给出明确、局部且可验证的职责边界。

---

## 11. Harness 文件职责

### 11.1 `AGENTS.md`

只负责：

* 给 Agent 一个仓库入口；
* 告诉 Agent 先看什么；
* 告诉 Agent 开工前先跑什么；
* 告诉 Agent 哪些规则是硬约束。

它不应该变成大而全手册。

### 11.2 `ARCHITECTURE.md`

只负责：

* 描述目标 monorepo 结构；
* 固定层次与依赖方向；
* 列出稳定核心实体；
* 列出禁止新增的伪核心实体类型。

### 11.3 `WORKFLOW.md`

只负责：

* 固定 Agent 的最小工作回路；
* 说明每步读什么、写什么、跑什么；
* 指明何时必须补规则或补文档。

### 11.4 `harness/index.md`

只负责：

* 二级导航；
* 把问题类型映射到规则、workflow 和 registry；
* 让 Agent 不必一次性读完整个 harness。

---

## 12. Agent Workflow

### 12.1 最小工作回路

每次任务都按以下 7 步执行：

1. `Orient`
2. `Scope`
3. `Read minimally`
4. `Write failing check first`
5. `Implement in one layer at a time`
6. `Run harness checks`
7. `Reflect back into repo`

### 12.2 每步要求

#### 1. `Orient`

先运行 `repo-report`，再读：

* `AGENTS.md`
* `ARCHITECTURE.md`
* `WORKFLOW.md`
* `harness/index.md`

#### 2. `Scope`

判断当前任务属于哪一层：

* docs
* shared
* backend
* frontend
* agent-cli

#### 3. `Read minimally`

只读当前任务所需的最小文档集。

例如做状态机时优先读：

* `docs/01-product/Product-Interaction-State-Machine.md`
* `docs/02-models/Domain-Model.md`
* `docs/03-contracts/Frontend-Backend-Protocol.md`

#### 4. `Write failing check first`

优先写：

* failing test；
* failing structural check；
* failing report assertion。

#### 5. `Implement in one layer at a time`

默认一次只改一个主层。

跨层改动必须有明确因果链。

#### 6. `Run harness checks`

至少运行：

* `repo-report`
* 相关结构检查
* 相关命名检查
* 与当前改动直接相关的测试

#### 7. `Reflect back into repo`

如果任务暴露了新的稳定规则，应把规则写回：

* `harness/rules/*`
* `harness/registry/*`
* 必要时更新 `docs/`

### 12.3 何时必须停下

以下情况必须停下补规则、补文档或重新定边界：

* 需要新增核心实体；
* 需要新增一层目录；
* 需要让 frontend import backend internals；
* 需要同时发明新的 status / mode / type；
* 一个类开始承担多个变化原因；
* 同一语义出现两个以上命名版本。

---

## 13. 可观测性与反馈

### 13.1 目标

仓库应为 Agent 提供两类反馈：

* `pre-flight feedback`
  开工前知道当前仓库到了哪一步。
* `post-change feedback`
  改动后知道自己是否破坏了结构与命名。

### 13.2 Repo Status

`repo-report.mjs` 应生成至少以下信息：

* 当前日期；
* 仓库阶段，例如：
  * `docs-only`
  * `scaffold`
  * `partial`
  * `runnable`
* 已存在的 docs、apps、packages、tests；
* 缺失的关键目录或文件；
* 推荐下一步入口；
* 当前 blockers；
* 最近一次结构检查结果摘要。

### 13.3 质量反馈

`quality-score.md` 不应追求复杂打分模型，只需覆盖：

* 入口完整性；
* 层次完整性；
* 命名一致性；
* 文档同步状态；
* 当前已知风险。

### 13.4 Change Impact

后续可扩展：

* 变更触碰了哪些层；
* 是否引入了新实体名；
* 是否打破依赖方向；
* 是否遗漏了测试或文档同步。

---

## 14. Registry 设计

### 14.1 `entities.json`

记录：

* 核心实体白名单；
* 允许的技术对象命名模式；
* 禁止同义词。

### 14.2 `enums.json`

记录：

* 稳定 `status`；
* 稳定 `mode`；
* 稳定 `type`。

### 14.3 `layers.json`

记录：

* layer 名称；
* 目录映射；
* package 映射；
* 允许 import 边。

### 14.4 `docs-map.json`

记录：

* 问题类型到规范文档的映射；
* Agent 的最小阅读建议。

---

## 15. 脚本设计

### 15.1 `repo-report.mjs`

职责：

* 生成当前仓库状态摘要；
* 给 Agent 开工前快照；
* 输出推荐入口与缺口。

### 15.2 `verify-doc-links.mjs`

职责：

* 校验 `docs` 与 `harness` 的交叉链接是否断裂；
* 避免入口文档失效。

### 15.3 `verify-architecture.mjs`

职责：

* 校验 package 和目录层次；
* 校验 import 方向；
* 阻止 frontend / backend / agent-cli 越层耦合。

### 15.4 `verify-entity-naming.mjs`

职责：

* 校验核心实体白名单；
* 校验常用字段名；
* 校验命名禁忌词与同义词漂移。

### 15.5 `verify-boundary-parsing.mjs`

职责：

* 校验 route / CLI / persistence 边界是否做了解析与归一；
* 防止边界 shape 泄漏进内部业务层。

### 15.6 `verify-workflow-files.mjs`

职责：

* 校验 `AGENTS.md`、`ARCHITECTURE.md`、`WORKFLOW.md`、`harness/index.md` 等基础入口是否齐备；
* 防止仓库在演化中失去 Agent 入口。

---

## 16. 实施顺序

本节不仅描述项目实现顺序，也描述 harness 自身的演进顺序。

harness 的成熟度不应领先项目过多，否则会形成过度治理；也不应落后项目太多，否则会出现代码先膨胀、规则后补洞的情况。

合理目标是：

* harness 永远比当前代码成熟度领先半步；
* 在代码进入下一复杂度阶段前，先把对应约束补上；
* 让规则强化和项目演进同步发生。

### 16.1 Phase 0: Docs-to-Harness Baseline

第一阶段先建立最小闭环：

* `AGENTS.md`
* `ARCHITECTURE.md`
* `WORKFLOW.md`
* `harness/index.md`
* `harness/rules/*`
* `harness/registry/*`
* `repo-report.mjs`
* `verify-workflow-files.mjs`

目标：

* 让 Agent 一进入仓库就知道从哪里开始；
* 让团队先看到稳定的工程治理框架。
* 让 harness 从“口头约定”升级为“仓库入口与最小规则集合”。

### 16.2 Phase 1: Structural Checks

第二阶段补结构检查：

* `verify-doc-links.mjs`
* `verify-architecture.mjs`
* `verify-entity-naming.mjs`

目标：

* 把分层、命名、入口完整性从文档约定升级为机械反馈。
* 让 harness 从“能读”升级为“能发现明显偏离”。

### 16.3 Phase 2: Monorepo Integration

当 `apps/*`、`packages/*` scaffold 完成后，再补：

* `verify-boundary-parsing.mjs`
* `quality-score.md`
* 更细粒度的 layer checks

目标：

* 让实现层开始受同一套 harness 约束。
* 让 harness 从“静态入口”升级为“跟随代码增长的结构治理层”。

### 16.4 Phase 3: Task-Loop Hardening

最后补：

* `change-intake.md`
* `self-review.md`
* 变更影响报告
* 与 tests / visual QA / contract checks 的组合运行

目标：

* 让 Agent 每次改动都具备最小自检与回写能力。
* 让 harness 从“结构约束”升级为“持续反馈与协作约束系统”。

---

## 17. 对当前仓库的直接建议

基于当前仓库状态，建议下一步按以下顺序实施：

1. 先建立 harness baseline 文件，不急于实现所有脚本细节。
2. 先让 `repo-report` 能识别当前仓库为 `docs-only`。
3. 再建立 monorepo scaffold。
4. scaffold 完成后立刻接入 architecture 与 naming check。
5. 在首批代码实现前，先把核心实体 registry 固定下来。

这样可以保证：

* 代码一开始就长在稳定边界上；
* Agent 不会因为仓库还很空而自由发散；
* 后续每个 worker 都沿着同一套入口、命名和层次工作。

---

## 18. 结论

本项目的 harness engineering 应被视为“仓库级可执行治理层”，而不是额外的业务架构层。

它的核心作用是：

* 固定真相边界；
* 固定 Agent 入口；
* 固定层次、命名与复用规则；
* 提供最小但明确的机械反馈；
* 让 Agent 在渐进式披露下快速理解仓库并稳定推进实现。

对当前 `Blackboard` 项目而言，这种设计最适合当前 `docs-first` 阶段，也最能支撑后续 monorepo 与 Agent 协作实现。
