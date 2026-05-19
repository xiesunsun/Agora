<p align="center">
  <img src=".github/assets/agora-logo.png" alt="Agora logo" width="640" />
</p>

<h1 align="center">Agora</h1>

<p align="center">
  <a href="./README.md">中文</a> · English
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-black" />
  <img alt="Node.js" src="https://img.shields.io/badge/node.js-22%2B-43853D" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-10.33.2-F69220" />
  <img alt="CI" src="https://github.com/xiesunsun/Agora/actions/workflows/ci.yml/badge.svg" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
</p>

> Agora is an open-source collaboration product natively designed for Agent–Human interaction. It redefines drafting, editing, annotating, and reviewing by bringing collaboration back to the content itself — out of the chat window.

Agora is not a tool that stuffs long documents back into a chat window for iterative rewriting. It organizes drafting, editing, annotation, proceeding, review, and closing into an interactive web-based collaboration experience that fits how humans actually write: users edit text, leave comments, and make decisions directly on the document page without re-packaging context into a dialog box; the Agent works continuously in the background around the current content and submits candidate changes through a review flow for user confirmation.

It is well suited for refining Specs, PRDs, technical designs, research notes, documentation, and any content that requires "multiple rounds of revision + human–machine joint judgment."

## A Better Way for Humans and Agents to Collaborate

### 1. Collaboration Lives on the Document, Not in the Chat Box

Many chat products offer canvas or artifacts features that still require users to reorganize new context and send it back through a dialog box. Agora puts collaboration back on the document itself: users can edit, annotate, and review directly on the page without shuttling context back and forth.

### 2. Leverage Existing Agent Capabilities Instead of Rebuilding a Weaker One

Agora currently prioritizes Codex integration. The tools, skills, workflows, and execution capabilities you have already configured in Codex can all be brought into this collaborative document pipeline — rather than falling back to a limited built-in chat Agent.

### 3. Independent Collaboration Threads That Don't Pollute the Main Task

Temporary discussions, draft iterations, and review decisions all happen in an independent worker thread. After collaboration ends, only the final result and summary are returned to the Main Agent, avoiding pollution of the main task context with the entire iteration process.

### 4. Delivered as CLI + Skill for Easy Install, Upgrade, and Customization

Agora is delivered through CLI and Skill, suitable for real installation and repeated testing. The project is fully open-source — users can extend it according to their own Agent host, skill system, and workflows.

## Key Features

- **Collaborate around the document itself**: Complete text editing, annotation, proceeding, and review through a web interaction pattern that fits human habits — not by stuffing collaboration back into a chat window.
- **Agent follows the current document state**: After the user edits content, the Agent can continue working around the latest state without relying on manually restated context.
- **Proceed → Review → Merge loop**: From generating candidates to reviewing proposed changes to merging into the document — the workflow is complete and controllable.
- **Independent collaboration threads**: Collaboration runs in an independent worker; results are returned to the Main Agent after completion.
- **Codex-first integration**: Currently integrated with Codex App / CLI workflows, directly connecting to users' existing Agent capabilities, toolchains, and skill systems.
- **Open-source and extensible**: Source code, CLI, and Skill are delivered together for easy secondary development and host adaptation.

## Quick Start

### Install the CLI

```bash
npm install -g @sunxie/agora
```

### Initialize Codex Assets

```bash
agora init-codex --force
agora doctor
```

### Start a Collaboration Session

Install and trigger the Agora collaboration Skill in Codex, or use the Agora CLI to launch the full collaboration pipeline.

For the complete installation and usage flow, refer to:

- [Agora Published E2E Runbook](./docs/05-agent/Agora-Published-E2E-Runbook.md)

### Local Development

```bash
corepack enable
pnpm install
pnpm build:all
pnpm dev
pnpm dev:backend
```

## Screenshots

### Main Collaboration Editor

The document, annotations, and collaboration track are laid out on the same page — users can continue editing and providing feedback around the current content.

![Agora Main Editor](./.github/assets/readme/agora-editor.png)

### Proceed / Processing View

After the user initiates the next round of proceeding, the page clearly shows the Agent is continuing to work, rather than hiding the waiting process in a chat window.

![Agora Proceed View](./.github/assets/readme/agora-proceeding.png)

### Flow Review

When collaboration enters the standard review flow, users can inspect candidate changes item by item and decide whether to accept them into the current document.

![Agora Flow Review](./.github/assets/readme/agora-flow-review.png)

### PR-Style Review

For change comparisons closer to a code review mental model, Agora also supports PR-style viewing and decision-making.

![Agora PR Review](./.github/assets/readme/agora-pr-review.png)

### History Preview

Version history formed during collaboration can be reviewed and compared, making it easy to trace each round of judgment and evolution.

![Agora History Review](./.github/assets/readme/agora-history-review.png)

### Closed Session

After the session closes, the document enters a read-only state. Users can still read the final result and review the closing status of the collaboration round.

![Agora Closed View](./.github/assets/readme/agora-closed.png)

## Use Cases

- Refine PRDs, Specs, and technical design documents together with an Agent
- Edit Agent drafts directly on the page and provide structured feedback
- Conduct temporary research discussions, solution convergence, and collaborative drafting
- Open independent collaboration threads without polluting the main task context
- Integrate a document-collaboration interaction layer into your own Agent system

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, TypeScript, HTTP + SSE
- **Agent Integration**: Codex App / CLI, Host Adapter, Worker Thread
- **Runtime Delivery**: npm CLI, Codex Skill, Embedded Runtime
- **Package Manager**: pnpm 10

## Project Structure

```text
apps/
  frontend/                 Collaboration frontend
  backend/                  Session state & review flow
  host-adapter/             Codex host bridge & worker dispatch

packages/
  blackboard-runtime/       Agora CLI implementation
  document-model/           Document structure model
  review-model/             Review & changeset model

docs/                       Product, architecture, contracts, runbooks
harness/                    Smoke & verification scripts
scripts/                    Local install & dev helper scripts
```

## Testing & Verification

```bash
pnpm test
pnpm test:backend
pnpm test:all
pnpm typecheck:all
pnpm build:all
pnpm run smoke:agora
```

## Roadmap

- [ ] Optimize worker Agent startup time
- [ ] Reduce session close latency
- [ ] Fix worker Agent return-to-Main-Agent display issues
- [ ] Support Claude Code, Pickle, and more Agents
- [ ] Support rich text and multimodal data collaboration
- [ ] Support custom collaboration page themes
- [ ] Support custom comment state icons
- [ ] Support comment state icons showing background Agent opinions in summary
- [ ] Support Git-like document version management
- [ ] Support multi-user collaboration
- [ ] Add in-page chat-to-worker Agent functionality

## Release Status

- **Current Version**: `0.1.0`
- **npm Package**: `@sunxie/agora`
- **GitHub Package**: `@xiesunsun/agora`
- **Global Command**: `agora`
- **License**: `Apache-2.0`

## License

This repository is licensed under [Apache-2.0](./LICENSE).
