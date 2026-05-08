# Codex Host Validation Contract

## 1. Purpose

This document defines how Blackboard validates Codex-native host execution claims.

The repository now treats Codex host execution as a stable design target, but not every part of that path can be guaranteed by repository code alone. This contract separates those guarantees so workers do not overstate what is already proven.

## 2. Responsibility Layers

### 2.1 Repo-Enforced

These guarantees can be established directly by repository code, tests, or local checks:

* adapter surface shape
* dispatcher serialization logic
* turn-end obligation checks
* file and docs alignment

### 2.2 Harness-Enforced

These guarantees come from repo-local governance and worker workflow:

* workers read the correct host execution docs
* workers classify claims correctly
* workers do not silently widen back to generic hosts
* plan, docs, and harness stay aligned when the path changes

### 2.3 Codex-Host-Provided

These guarantees depend on actual Codex runtime capabilities:

* native `subagent` startup returns a reusable thread handle
* that handle can be treated as `subagentThreadId`
* `thread/read` and `thread/resume` operate over that handle
* `turn/start(threadId=...)` can directly target the resumed thread

### 2.4 Skill-Enforced

These guarantees depend on stable prompt or skill contracts:

* `main agent` hands off the correct role and workspace contract
* `subagent` performs the required turn-end tool actions
* close summaries are written with the expected structure

### 2.5 Agent-Verified

These guarantees require real execution evidence:

* later blackboard events truly bypass `main agent`
* queue advancement is actually aligned with observed `turn/completed`
* the full create -> collaborate -> close loop works against the live host

## 3. Required Validation Scenarios

The active host path is not considered validated until the following scenarios are reviewed:

1. `main agent` starts a native `subagent`
2. the returned `agent_id` is persisted as `subagentThreadId`
3. `thread/read` can locate that thread later
4. `thread/resume` can reactivate it
5. `turn/start(threadId=...)` can drive the same thread directly
6. later blackboard events do not route back through `main agent`
7. queue advancement waits for both `turn/completed` and the task-specific obligation

## 4. Evidence Model

Record each claim using one of these labels:

* `repo-enforced`
* `harness-enforced`
* `codex-host-provided`
* `skill-enforced`
* `agent-verified`

Do not collapse them into one generic “supported” label.

## 5. Failure Interpretation

If validation fails:

* do not paper over the gap by silently rewriting docs
* do not treat a prompt workaround as repo-enforced behavior
* update the active plan and host execution docs first
* decide whether the gap is a blocker, a known limitation, or a design revision trigger

## 6. Related Documents

Use this contract together with:

* `docs/05-agent/Host-Execution-Design.md`
* `docs/05-agent/Collaboration-Skill-Spec.md`
* `harness/rules/host-execution.md`
* `docs/04-design/Acceptance-Matrix.md`
* `docs/05-agent/MVP-Runbook.md`
