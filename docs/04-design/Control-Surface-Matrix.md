# Blackboard Control Surface Matrix

## 1. Purpose

This document defines the current Blackboard control surface: the set of stable constraints that must stay protected while the MVP moves from partial implementation to a fully validated product slice.

It exists to connect four different governance layers that already exist in the repository:

* `docs/01-04`
  Stable product, model, contract, and design truth
* the checkbox implementation plan
  Implementation sequencing and execution gates
* `harness/`
  Repo-local guardrails and worker workflow
* acceptance artifacts
  The evidence that the current product shape still matches the intended MVP

## 2. How To Use This Matrix

Use this document before:

* changing frontend structure
* changing Markdown parsing or rendering
* changing review or history presentation
* changing Codex host execution semantics
* relaxing or strengthening acceptance requirements

For every stable constraint, answer:

1. what document currently defines it
2. what plan task currently protects it
3. what harness rule or workflow should catch drift
4. what automated or manual evidence proves it still holds

## 3. Control Surface

| Constraint | Stable truth source | Current plan protection | Harness protection target | Acceptance evidence | Current gap |
| --- | --- | --- | --- | --- | --- |
| The page must read as one document surface first, not a multi-panel tool shell. | `docs/04-design/UI-Structure.md` | Task `1A`, Task `6`, Task `7`, Task `9` | `harness/rules/document-surface.md` | shell screenshots, visual QA, manual sign-off | Was implicit in plan text, not yet a repo-local rule |
| Blackboard uses one fixed `document` template rather than arbitrary page composition. | `docs/02-models/Document-Presentation-Model.md` | Task `1A`, Task `6`, Task `7` | `harness/rules/document-surface.md` | fixture pages, shell screenshots, template contract review | No dedicated template contract existed |
| Markdown remains the only document truth and must pass the Blackboard Markdown Profile. | `docs/02-models/Document-Presentation-Model.md` | Task `3` | `harness/rules/rendering-contract.md` | parser tests, profile corpus, unit-derivation tests | Parser behavior existed, but acceptance framing was weak |
| `DocumentUnit[]` must be a derived structure with stable unit-local edit and diff behavior. | `docs/02-models/Document-Presentation-Model.md`, `docs/03-contracts/Frontend-Backend-Protocol.md` | Task `3`, Task `7`, Task `9` | `harness/rules/rendering-contract.md` | unit-derivation tests, edit reparse tests, diff locality tests | Not previously called out as an explicit rendering contract |
| `Flow Review` and `PR Review` must stay two views over one review object, not two pages. | `docs/01-product/Feature-Spec.md`, `docs/04-design/UI-Structure.md` | Task `9` | `harness/rules/document-surface.md`, `harness/rules/acceptance-gates.md` | review tests, review screenshots, manual review continuity check | Plan covered the feature, but not the anti-drift rule strongly enough |
| `history_preview` and `closed` must preserve the same manuscript language. | `docs/01-product/Feature-Spec.md`, `docs/04-design/UI-Structure.md` | Task `10`, Task `15` | `harness/rules/document-surface.md` | history/closed screenshots, runbook sign-off | No dedicated acceptance artifact yet |
| Codex V1 host execution uses one native `subagent`, one persisted `subagentThreadId`, and serialized `turn/start(threadId=...)`. | `docs/05-agent/Host-Execution-Design.md`, `docs/05-agent/Collaboration-Skill-Spec.md` | Task `11-14` | `harness/rules/host-execution.md` | adapter tests, dispatcher tests, real host validation | Partially documented, but not yet fully validated against the real host |
| MVP readiness requires both structural correctness and product-shape evidence. | This matrix, `docs/04-design/Acceptance-Matrix.md`, `docs/05-agent/MVP-Runbook.md` | Task `15` | `harness/rules/acceptance-gates.md` | `pnpm test`, `pnpm e2e`, runbook, sign-off checklist | Acceptance model previously collapsed into generic test completion |

## 4. Governance Boundaries

The following questions should be answered by different repository layers:

* `docs/01-04`
  What the Blackboard product must be
* the implementation plan
  What work order and gates are required to reach that state
* `harness/`
  What drift workers must actively avoid while making changes
* runbooks and acceptance matrices
  What proof is required before a task or release is considered complete

## 5. Current Repository Interpretation

At the current repository stage:

* frontend structure and editorial direction are already partially implemented
* Markdown derivation and review materialization already exist as code work
* host execution rules are becoming stable but are not fully validated
* acceptance is the weakest layer and must be expanded before the remaining tasks proceed

This means the next governance work should prioritize:

1. contract documents
2. harness product-shape rules
3. acceptance matrix and runbook
4. retrofit checks over already completed tasks
