# Acceptance Matrix

## 1. Purpose

This matrix defines how Blackboard MVP work is accepted.

The repository already has tests and harness checks, but MVP correctness depends on five different evidence layers:

1. structure
2. rendering
3. interaction
4. presentation
5. runtime

No single layer is sufficient on its own.

## 2. Acceptance Layers

### 2.1 Structure

Purpose:

* protect repository boundaries
* prevent vocabulary and layering drift

Expected evidence:

* `npm run harness:report`
* `npm run harness:check`
* `npm run harness:arch`
* `npm run harness:naming`
* `npm run harness:boundary`

### 2.2 Rendering

Purpose:

* prove Markdown still flows through one rendering contract
* prove `DocumentUnit` derivation remains stable

Expected evidence:

* Markdown profile tests
* `DocumentUnit` derivation tests
* edit-reparse tests
* diff locality tests

### 2.3 Interaction

Purpose:

* prove state transitions and lifecycle semantics still hold

Expected evidence:

* session state tests
* review settlement tests
* bullet lifecycle tests
* restore and close flow tests
* e2e flow tests for the main manuscript loop

### 2.4 Presentation

Purpose:

* prove the product still looks and feels like the intended Blackboard

Expected evidence:

* desktop screenshots
* mobile screenshots
* typography and font-loading checks
* explicit comparison notes against the canonical assets in `docs/04-design/Visual-Reference.md`
* manual sign-off against `docs/04-design/Visual-QA-Checklist.md`
* human approval before presentation-affecting checklist tasks are called complete

### 2.5 Runtime

Purpose:

* prove the Codex host execution path works in the real environment

Expected evidence:

* adapter tests
* dispatcher tests
* host validation contract review
* agent-in-the-loop validation run

## 3. Acceptance By Constraint

| Constraint | Structure | Rendering | Interaction | Presentation | Runtime |
| --- | --- | --- | --- | --- | --- |
| document-first surface | optional | no | partial | required | no |
| fixed document template | partial | partial | no | required | no |
| Markdown truth and profile | optional | required | partial | partial | no |
| unit-local edit and diff behavior | optional | required | required | partial | no |
| shared review object across flow/pr | optional | partial | required | required | no |
| history and closed manuscript continuity | optional | no | required | required | no |
| Codex single-subagent execution path | partial | no | partial | no | required |
| end-to-end MVP loop | partial | partial | required | required | required |

## 4. Sign-Off Classes

Use the following sign-off classes when closing a task or release gate:

* `automated-pass`
  All required automated checks passed.
* `manual-pass`
  A human reviewed the visual or runtime behavior, including the stated prototype delta when relevant, and accepted it.
* `known-gap`
  The gap is understood, documented, and explicitly accepted for the current stage.
* `blocker`
  The gap prevents calling the task or release complete.

## 5. Release-Level Minimum

Before calling the MVP release path ready, the repository should have:

* all relevant structure checks passing
* rendering tests passing
* interaction tests passing
* approved desktop and mobile screenshots for each top-level page state
* recorded prototype comparison notes for each presentation-affecting page state
* one real Codex host validation run recorded against the active contract
* a reviewed runbook describing remaining accepted limitations

## 6. Related Documents

This matrix is the acceptance companion to:

* `docs/04-design/Control-Surface-Matrix.md`
* `docs/03-contracts/Document-Template-Contract.md`
* `docs/03-contracts/Markdown-Rendering-Contract.md`
* `docs/05-agent/Codex-Host-Validation-Contract.md`
* `docs/05-agent/MVP-Runbook.md`
* `harness/rules/acceptance-gates.md`
