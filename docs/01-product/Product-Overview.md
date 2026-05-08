# Agent 文本黑板会话 产品概述

## 产品定义

Agent 文本黑板会话（Agent Text Blackboard）是一个面向 Human-in-the-loop Agent 协作的轻量文本讨论空间。

Agent 通过 Skill 与 CLI 创建并管理黑板会话，人类通过 Agent 自动打开的 HTML 页面参与讨论、编辑、批注、审阅和推进。双方围绕同一份文本持续协作，使文本在一轮轮讨论中形成清晰、可追踪、可审阅的版本演进。

## 核心用户

| 用户类型 | 使用诉求 |
|---------|---------|
| 产品设计者 | 与 Agent 共同打磨产品定义、PRD、交互流程 |
| 开发者 / 技术负责人 | 审阅 Agent 生成的技术方案、实现计划、接口契约 |
| 内容创作者 | 与 Agent 共同修改文章、脚本、长文结构 |
| Prompt / Agent 设计者 | 迭代提示词、Agent 行为规则、任务流程 |
| 研究型用户 | 梳理问题、比较方案、沉淀分析结论 |

## 核心交互闭环

```
Agent 创建黑板 → 人类在网页中编辑与批注 → Agent 后台跟随
→ 人类点击 Proceed → Agent 生成待审阅改动集
→ 人类进行 Flow Review 或 PR Review → 审阅结算
→ 循环推进 → 人类关闭黑板 → Agent 总结结果
```

## 核心概念速查

| 概念 | 一句话定义 | 详见 |
|-----|----------|------|
| 黑板会话 | 一次由 Agent 创建、人类参与、围绕一份文本持续推进的协作过程 | [PRD §3.1](PRD.md) |
| 正文编辑 | 人类对文本内容的直接修改，代表明确判断 | [PRD §3.2](PRD.md) |
| 批注 | 人类针对具体文本片段提出的讨论性意见 | [PRD §3.3](PRD.md) |
| Proceed | 回合切换操作，触发 Agent 将理解落实为文本修改 | [PRD §3.4](PRD.md) |
| 版本 | Agent 的待审阅改动在审阅接受后形成的正式文本状态 | [PRD §3.5](PRD.md) |
| Diff | 展示 Agent 在本轮中对文本做出的具体修改 | [PRD §3.6](PRD.md) |
| Flow Review | 默认审阅模式，整篇文稿上的 inline tracked changes | [Feature-Spec §6.5](Feature-Spec.md) |
| PR Review | 高级审阅模式，逐 hunk 的语义审阅视图 | [Feature-Spec §6.6](Feature-Spec.md) |

## 核心领域对象

| 对象 | 职责 | 详见 |
|-----|------|------|
| BlackboardSession | 整场协作的聚合根，管理会话生命周期 | [Domain-Model §4](../02-models/Domain-Model.md) |
| WorkingSet | 当前工作现场，持有画布正文与活跃 bullet | [Domain-Model §5](../02-models/Domain-Model.md) |
| ReviewChangeSet | 一次 Proceed 的待审阅改动集 | [Domain-Model §6](../02-models/Domain-Model.md) |
| Version | 正式落版的历史文本快照 | [Domain-Model §7](../02-models/Domain-Model.md) |
| DocumentUnit | 正文的最小可交互结构化内容单元 | [Domain-Model §8](../02-models/Domain-Model.md) |
| Bullet | 用户输入被结构化后的事件对象 | [Domain-Model §9](../02-models/Domain-Model.md) |
| Change | ReviewChangeSet 中的最小可审改单元 | [Domain-Model §10](../02-models/Domain-Model.md) |

## 会话状态机

黑板会话有 5 个顶层交互状态：

- `active` — 正常工作态，唯一允许生产新输入的状态
- `proceeding` — Proceed 处理中，全屏锁屏
- `reviewing` — 待审阅态（内部区分 `flow` 与 `pr` 两种视图）
- `history_preview` — 历史版本只读浏览态
- `closed` — 会话终止态

详见：[Product-Interaction-State-Machine.md](Product-Interaction-State-Machine.md)

## MVP 范围

### 必须支持

| 模块 | 能力 |
|-----|------|
| Agent 入口 | Skill + CLI 打开黑板 |
| 页面打开 | Agent 自动打开 HTML 页面 |
| 文本主体 | Markdown 文本展示与编辑 |
| 批注 | 选区行内批注 |
| 后台跟随 | Agent 接收并理解人类修改和批注 |
| Agent 小人 | 展示 Agent 跟随状态 |
| Proceed | 人类触发 Agent 回应 |
| Agent 修改 | Proceed 后生成待审阅改动集 |
| 版本 | 审阅接受后生成新版本 |
| Diff | 展示版本间变化 |
| Flow Review | 默认审阅模式 |
| PR Review | 高级 hunk 审阅模式 |
| 关闭总结 | 关闭黑板后 Agent 总结 |

### 边界

- 仅支持单人类与单 Agent 的文本协作
- 文本格式以 Markdown 为主
- 以本地或单用户会话为优先形态

## 产品文档导航

| 文档 | 职责 |
|-----|------|
| [Product-Overview.md](Product-Overview.md) | 本文档 — 产品全局视图 |
| [PRD.md](PRD.md) | 完整产品需求文档 |
| [Feature-Spec.md](Feature-Spec.md) | 交互规格细化 |
| [Product-Interaction-State-Machine.md](Product-Interaction-State-Machine.md) | 产品交互状态机定义 |
