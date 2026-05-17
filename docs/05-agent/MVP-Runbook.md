# Blackboard MVP Runbook

## 1. Purpose

This runbook defines what must be checked before calling the Blackboard MVP loop ready for broader use.

It is not only a “how to run tests” file. It is the final convergence document for:

* acceptance evidence
* known limitations
* blocker decisions
* release-level sign-off

## 2. MVP Ready Definition

For the current repository stage, MVP ready means:

* the intended single-session Blackboard loop works end to end
* the page still reads as a manuscript-first surface
* Markdown remains the only document truth
* review and history behaviors stay inside the intended product shape
* the Codex host path has at least one real validation pass

## 3. Validation Order

Run validation in this order:

```bash
pnpm install
pnpm run harness:check
pnpm run test:all
pnpm run typecheck:all
pnpm run build:all
pnpm e2e
```

Then collect manual presentation evidence and runtime host validation evidence.

Do not start with runtime validation while earlier layers are already known broken.

## 4. Required Evidence

### 4.1 Structure

Record results for:

* `pnpm run harness:report`
* `pnpm run harness:check`
* `pnpm run harness:arch`
* `pnpm run harness:naming`
* `pnpm run harness:boundary`

### 4.2 Rendering

Record results for:

* `pnpm test`
* `pnpm test:backend`

### 4.3 Interaction

Record results for:

* `pnpm test`
* `pnpm test:backend`
* `pnpm e2e`

### 4.4 Presentation

Record evidence for:

* desktop screenshots
* mobile screenshots
* font loading behavior
* document width and spacing checks
* bullet restraint checks
* review continuity checks
* history and closed-state continuity checks
* per-state comparison notes against `docs/04-design/Visual-Reference.md`
* explicit human approval before a presentation-affecting checklist task is marked complete

Use `docs/04-design/Visual-QA-Checklist.md` as the manual review companion.

### 4.5 Runtime

Record evidence for:

* `pnpm --filter @blackboard/host-adapter test`
* dispatcher tests
* Codex host validation scenario results
* any known remaining host/runtime assumptions

Current known gap: a real Codex host validation run is not proven by automated tests. Mark this as `known-gap` until a human records an agent-in-the-loop validation pass against `docs/05-agent/Codex-Host-Validation-Contract.md`.

## 4.6 Prototype Comparison Protocol

For any frontend task that affects presentation:

1. the agent must open the relevant canonical reference asset or assets
2. the agent must compare the implemented state against those assets state-by-state
3. the agent must explain the remaining distance in plain language, including what still differs and why it is acceptable or not
4. the user must manually review that comparison before the task is marked complete in any checkbox-based plan

Rules:

* "looks close enough" is not sufficient without a written comparison
* screenshot capture alone is not sufficient without a judgment record
* if the user does not approve, the task remains open even if automated checks pass

## 4.7 Overlap With Completed Tasks

When a new refactor overlaps previously completed tasks:

* do not silently revoke the earlier completion record
* identify which completed task outputs are being relied on or touched
* add regression checks or comparison notes for those outputs
* only reopen an old task explicitly if the repository plan is intentionally changed to do so

## 5. Blockers

Treat the following as MVP blockers:

* the page drifts into a persistent multi-panel app layout
* Markdown truth is bypassed by local rendering truth
* review no longer behaves like one shared manuscript overlay
* history restore leaves stale bullets or stale local drafts semantically alive
* the close path does not leave the page in a true terminal state
* the Codex host execution path is described as working but has not been validated

## 6. Acceptable Known Limitations

The following may remain acceptable if documented explicitly:

* fixture-based screenshot updates that preserve the same contract
* implementation detail churn behind the same rendering and template contracts
* partial host-runtime uncertainty that is clearly labeled `codex-host-provided` or `agent-verified`

## 7. Sign-Off Record

Each MVP readiness pass should explicitly mark:

* `automated-pass`
* `manual-pass`
* `known-gap`
* `blocker`

against the five layers in `docs/04-design/Acceptance-Matrix.md`.

## 8. Related Documents

This runbook should be used with:

* `docs/04-design/Acceptance-Matrix.md`
* `docs/04-design/Visual-QA-Checklist.md`
* `docs/05-agent/Codex-Host-Validation-Contract.md`
* `docs/04-design/Control-Surface-Matrix.md`
