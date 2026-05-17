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

Clarification:

* these capabilities belong to the **Codex host/runtime control plane**, not to the blackboard backend process itself
* the `subagent` does not autonomously expose a repo-local API for this; the host exposes the control surface around it
* in the current Codex environment, the practical equivalents may be host tools such as `spawn_agent`, `send_input`, `wait_agent`, and agent lifecycle notifications rather than a literal repo-local `turn/start(...)` function
* repository code can prepare messages, persist `subagentThreadId`, and serialize queue state, but it cannot by itself invoke Codex host controls from inside the backend process

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

## 7. Current Gaps To Close

The following gaps describe the current repository state. They must be classified accurately and closed in the host-adapter rollout. They are not all acceptable steady-state behavior.

### 7.1 Event dispatch is semi-automatic, not direct-to-thread

**Status**: `codex-host-provided` + `repo-missing-adapter`

The host dispatcher (`hostDispatcher.ts`) formats session events into turn messages and prints them to stdout + writes to `.blackboard/events/{sessionId}.jsonl`. The human host then relays these messages to the subagent thread manually.

True direct-to-thread delivery requires the Codex host control plane. In some platform descriptions this appears as `thread/read`, `thread/resume`, and `turn/start(threadId=...)`; in the current Codex tool surface the operational equivalents may be `spawn_agent` plus later `send_input` / wait flows.

The important boundary is:

* Codex **does** provide the subagent-control capability at the host/runtime layer
* the blackboard backend process in this repository does **not** directly own or expose that control plane
* therefore the repository still needs a host-side adapter/orchestrator implementation to complete the final hop

This gap is a **current implementation gap**, not a claim that Codex lacks the underlying capability. Per the host execution design, the intended project path is still direct host-to-thread delivery. Manual relay is only a temporary bootstrap fallback and must not be treated as the target V1 behavior.

### 7.2 subagentThreadId is in-memory only

**Status**: `repo-enforced` (stored in session state), not restart-safe

`POST /cli/sessions/:id/thread` persists `subagentThreadId` in the in-memory session store. This is intentional for V1 (no database). If the backend restarts, the threadId is lost and must be re-registered.

### 7.3 Proceed mock is opt-in

**Status**: `repo-enforced`

`ENABLE_PROCEED_MOCK=true` enables the simulated candidate. Default behavior waits for the real subagent to call `POST /cli/sessions/:id/review-candidate`. This is the correct default for live sessions.

### 7.4 /cli/health probes frontend but not backend internals

**Status**: `repo-enforced`

`GET /cli/health` performs a real HTTP probe of the frontend URL and returns `frontendReachable`. The backend itself is implicitly reachable if this endpoint responds. No deeper health checks (DB, session count, etc.) are implemented in V1.

### 7.5 MVP interpretation

The current document set should be read as follows:

* `Codex` already provides the host/runtime capability needed to control a long-lived `subagent thread`
* the missing piece in this repository is the **host adapter** that binds backend dispatch events to that Codex host control surface
* until that adapter exists, blackboard host execution is not considered fully implemented
