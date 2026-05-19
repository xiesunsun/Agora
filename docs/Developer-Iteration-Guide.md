# Agora 快速迭代开发指南

> 面向开发者：如何根据用户反馈快速修改、构建、安装并交付可测试的新版本。

---

## 架构定位

Agora 的交付形态是 **CLI + Skill + Worker Config**，三者协同为 Codex Agent 提供协作能力：

| 组件 | 位置（全局安装后） | 作用 |
|------|-------------------|------|
| **CLI** (`agora`) | `$(npm prefix -g)/bin/agora` | 启动 runtime、管理 session、供 worker agent 调用 |
| **Skill** | `~/.codex/skills/blackboard-collaboration/` | 告诉 Codex 何时、如何调用协作能力 |
| **Worker Config** | `~/.codex/agents/blackboard-worker.toml` | 定义 worker agent 的行为规则和 CLI 用法 |

三者必须版本一致才能正常工作。`agora doctor` 会严格校验这一点。

---

## 源码与产物的对应关系

```
packages/blackboard-runtime/
├── src/cli.ts                → dist/cli.js (全局 agora 命令入口)
├── assets/codex/
│   ├── skills/blackboard-collaboration/
│   │   ├── SKILL.md          → 安装到 ~/.codex/skills/...
│   │   └── agents/openai.yaml
│   └── agents/
│       └── blackboard-worker.toml → 安装到 ~/.codex/agents/...
├── dist/
│   ├── backend/              ← apps/backend/dist 嵌入
│   ├── frontend/             ← apps/frontend/dist 嵌入
│   ├── host-adapter/         ← apps/host-adapter/dist 嵌入
│   ├── codex/                ← assets/codex 嵌入
│   └── node_modules/@blackboard/  ← workspace packages 嵌入
```

`pnpm --filter ./packages/blackboard-runtime build` 会：
1. 编译所有上游 workspace 包（document-model, review-model, backend, host-adapter, frontend）
2. 编译 runtime 自身 TypeScript
3. 执行 `buildRuntimeAssets.ts` 将所有产物嵌入 `dist/`

---

## 快速迭代流程

### 一键重装脚本

```bash
pnpm reinstall
# 等价于
bash /Users/ssunxie/code/whiteBoard/scripts/reinstall.sh
```

脚本执行以下步骤：

1. **Build** — 编译全部源码，嵌入产物到 `dist/`
2. **清理** — 卸载旧版全局 CLI，删除旧 skill 和 worker config
3. **Pack + Install** — 打包 tgz 并全局安装
4. **Init** — `agora init-codex --force` 安装最新 skill + worker config
5. **Doctor** — 验证全局环境与源码一致

### 迭代循环

```
用户反馈功能需求
    ↓
开发者修改源码（见下方"改什么改哪里"）
    ↓
pnpm reinstall
    ↓
开一个新的 Codex 工作目录进行测试
    ↓
用户测试 → 反馈 → 继续循环
```

---

## 改什么改哪里

| 用户反馈类型 | 修改文件 |
|-------------|---------|
| Agent 行为不对（不理解指令、流程出错） | `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml` |
| Agent 不触发协作 / 触发时机不对 | `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md` |
| Agent 显示名称 / 描述不对 | `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/agents/openai.yaml` |
| 前端 UI 交互问题 | `apps/frontend/src/` |
| 后端 session/review 逻辑 | `apps/backend/src/` |
| CLI 命令行为 / 参数 | `packages/blackboard-runtime/src/cli.ts` |
| Host adapter（Codex↔Backend 桥接） | `apps/host-adapter/src/` |
| 文档模型（Markdown 解析/编辑） | `packages/document-model/src/` |
| 审阅模型（diff/changeset） | `packages/review-model/src/` |

修改后统一执行 `pnpm reinstall` 即可生效。

---

## 测试验证

重装完成后，进入任意新目录启动 Codex 测试：

```bash
mkdir -p /tmp/agora-test-$(date +%s) && cd $_
# 在 Codex 中触发 blackboard-collaboration skill
# 或手动启动 session:
agora start-session --handoff-file <path>
```

验证要点：
- `agora doctor` 全部通过
- Codex 能识别并调用 skill
- 前端页面能打开、编辑、批注
- Agent 能响应 proceed、生成 review candidate
- close-session 能正常返回总结

---

## 注意事项

1. **每次修改后必须 `pnpm reinstall`**。全局安装的 CLI 是独立的 tgz 副本，不会自动跟踪源码变化。
2. **`agora doctor` 报 drift 说明全局安装与源码不一致**。重新运行 `pnpm reinstall` 即可修复。
3. **Skill 和 Worker Config 的源头是 `packages/blackboard-runtime/assets/codex/`**。不要只改 `~/.codex/` 下的文件，那样下次 reinstall 会被覆盖。
4. **仓库内的 `.agents/` 和 `.codex/` 是开发时的本地副本**，用于 `pnpm runtime:dev` 模式。发布安装用的是 `packages/blackboard-runtime/assets/codex/` 下的版本。两者应保持同步。
5. **如果只改了 Skill/TOML 没改代码**，仍需完整 reinstall，因为这些文件是嵌入到 `dist/` 中再安装的。

---

## 相关文件

- 重装脚本：`/Users/ssunxie/code/whiteBoard/scripts/reinstall.sh`
- Smoke 测试：`pnpm smoke:agora`（在临时目录验证打包安装，不影响全局环境）
- E2E Runbook：`docs/05-agent/Agora-Published-E2E-Runbook.md`
- CLI 完整命令：`agora help`
