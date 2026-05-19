# Agora Close Relay Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic diagnostics around Agora’s close-result relay so a real global E2E run can prove whether close artifacts failed to reach the main agent because `MAIN_THREAD_ID` was missing, the host could not resume/send to the main thread, or the relay turn failed after dispatch.

**Architecture:** Keep the current close protocol and main-thread relay behavior, but instrument it end-to-end. Emit a structured relay diagnostic artifact from the host adapter, persist it even when general debug logging is off, surface the same state in logs and tests, and document the exact triage flow for real global testing.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Vitest, global Agora CLI, Codex app-server host adapter.

---

## Post-Implementation Finding

This diagnostics plan successfully removed ambiguity from the original close-relay failure mode, but it also exposed a separate host/UI constraint:

- Agora can produce `relay_completed` outcomes and still fail to show the message immediately in the currently open Codex Desktop main thread.
- Real testing showed that the message may only become visible after restarting Codex Desktop.
- That means “relay succeeded” and “Desktop UI visibly refreshed” are not the same contract.

The follow-up work for that separate problem is tracked in:

- `docs/superpowers/plans/2026-05-19-agora-main-thread-visibility-app-server-reuse-plan.md`

This diagnostics plan remains authoritative for relay outcome capture, but it is no longer the right place to solve the Desktop live-visibility gap itself.

## Scope

Primary outcomes:

- Every close relay attempt produces a structured diagnostic record.
- The record distinguishes:
  - `close_result_missing`
  - `mainThreadId_missing`
  - `send_input_failed`
  - `wait_agent_failed`
  - `relay_turn_not_completed`
  - `relay_completed`
- The diagnostic artifact is written even when `--debug` is not enabled.
- Adapter logs include a stable correlation trail: session id, main thread id, relay stage, and final outcome.
- Global E2E verification has an explicit “read the relay diagnostic artifact” step.

Non-goals:

- Changing the close artifact protocol
- Changing the startup handoff protocol
- Replacing the main-thread relay with another delivery mechanism
- Solving the host-runtime limitation itself in this plan; this plan is for diagnosis first

## File Structure

Create:

- `apps/host-adapter/src/relayDiagnostics.ts` - data model and helpers for relay outcome capture and artifact writing.
- `apps/host-adapter/src/__tests__/relayDiagnostics.test.ts` - focused tests for artifact content and outcome classification.

Modify:

- `apps/host-adapter/src/eventLoop.ts` - produce explicit relay outcomes for every close path and call the diagnostics writer.
- `apps/host-adapter/src/index.ts` - pass a stable diagnostics directory / session-scoped diagnostics file path into the event loop.
- `apps/host-adapter/src/types.ts` - add typed relay outcome structures if shared across modules.
- `apps/host-adapter/src/runtimeHost.ts` - add more explicit error context around `thread/resume`, `turn/start`, and `waitAgent` for main-thread relay turns when possible.
- `packages/blackboard-runtime/src/cli.ts` - ensure adapter startup provides a durable diagnostics directory path and optionally print the relay diagnostic file path in structured output when available.
- `packages/blackboard-runtime/src/doctor.ts` or related docs helpers if needed - only if exposing the diagnostics location is useful to operators.
- `apps/host-adapter/src/__tests__/eventLoop.test.ts` - cover each relay outcome class.
- `packages/blackboard-runtime/README.md` - document where to look after a failed close relay.
- `docs/05-agent/Agora-Published-E2E-Runbook.md` - add the exact post-close diagnostic inspection steps.

## Diagnostic Contract

Every close attempt should produce a JSON artifact like:

```json
{
  "sessionId": "session-123",
  "mainThreadId": "019e...",
  "writtenAt": "2026-05-19T12:34:56.000Z",
  "outcome": "wait_agent_failed",
  "stages": {
    "hasCloseResult": true,
    "hasMainThreadId": true,
    "sendInputAttempted": true,
    "sendInputSucceeded": true,
    "waitAgentAttempted": true,
    "waitAgentCompleted": false
  },
  "relayTurnStatus": null,
  "closeResult": {
    "summaryPath": "/abs/path/summary.md",
    "finalDocumentPath": "/abs/path/sessionDocument.md",
    "closedAt": "2026-05-19T12:34:55.000Z"
  },
  "error": {
    "message": "No active turn found for thread ...",
    "stack": "..."
  }
}
```

Minimum guaranteed fields:

- `sessionId`
- `mainThreadId`
- `writtenAt`
- `outcome`
- `stages`
- `closeResult`
- `error` when failure occurred

## Phase 1: Add Failing Diagnostic Coverage

### Task 1.1: Define Relay Outcome States In Tests

**Files:**
- Create: `apps/host-adapter/src/__tests__/relayDiagnostics.test.ts`
- Modify: `apps/host-adapter/src/__tests__/eventLoop.test.ts`

- [ ] **Step 1: Add focused artifact-shape tests**

Cover serialization for:

- `close_result_missing`
- `mainThreadId_missing`
- `send_input_failed`
- `wait_agent_failed`
- `relay_turn_not_completed`
- `relay_completed`

- [ ] **Step 2: Add event-loop regression coverage**

Extend close-path tests so they assert:

- a diagnostic artifact is written when `snapshot.closeResult` is absent
- a diagnostic artifact is written when `mainThreadId` is absent
- a diagnostic artifact is written when `host.sendInput(mainThreadId, ...)` throws
- a diagnostic artifact is written when `host.waitAgent(mainThreadId)` throws
- a diagnostic artifact is written when `waitAgent` returns a non-completed status
- a diagnostic artifact is written on successful relay

- [ ] **Step 3: Run focused tests to confirm failure**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- relayDiagnostics.test.ts
pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts
```

Expected: FAIL before implementation because no structured artifact exists yet.

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/__tests__/relayDiagnostics.test.ts apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "test: cover close relay diagnostics"
```

## Phase 2: Implement Session-Scoped Relay Diagnostics

### Task 2.1: Add Relay Diagnostics Helpers

**Files:**
- Create: `apps/host-adapter/src/relayDiagnostics.ts`
- Modify: `apps/host-adapter/src/types.ts`

- [ ] **Step 1: Define the types**

Add types for:

- `RelayDiagnosticOutcome`
- `RelayDiagnosticStages`
- `RelayDiagnosticRecord`

- [ ] **Step 2: Add a writer helper**

Implement a helper that:

- ensures the parent directory exists
- writes a stable JSON file such as `close-relay-result.json`
- never throws uncaught errors back into the close path
- returns the artifact path for logging

- [ ] **Step 3: Re-run focused tests**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- relayDiagnostics.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/relayDiagnostics.ts apps/host-adapter/src/types.ts apps/host-adapter/src/__tests__/relayDiagnostics.test.ts
git commit -m "feat: add close relay diagnostics model"
```

### Task 2.2: Instrument The Event Loop Close Path

**Files:**
- Modify: `apps/host-adapter/src/eventLoop.ts`
- Modify: `apps/host-adapter/src/index.ts`
- Modify: `packages/blackboard-runtime/src/cli.ts`

- [ ] **Step 1: Thread a diagnostics file path from the CLI into the event loop**

The published CLI already owns artifact policy, so the relay diagnostics path should be derived there once and passed explicitly into the adapter. Do not recompute state/cache policy independently inside `apps/host-adapter/src/index.ts`.

In `packages/blackboard-runtime/src/cli.ts`, compute a session-scoped path under the existing state policy, for example:

```text
<stateDir>/relay/session-<id>/close-relay-result.json
```

If the exact session id is not known until after startup, use the returned `sessionId` to finalize the path before starting the event loop, then pass it to the adapter through an explicit env var or flag.

- [ ] **Step 2: Instrument every relay branch**

In `apps/host-adapter/src/eventLoop.ts`:

- when `snapshot.closeResult` is missing, write `close_result_missing`
- when `mainThreadId` is missing, write `mainThreadId_missing`
- before `host.sendInput`, mark `sendInputAttempted`
- after successful send, mark `sendInputSucceeded`
- before `host.waitAgent`, mark `waitAgentAttempted`
- on successful completed turn, mark `relay_completed`
- on thrown error or non-completed turn, classify and write the matching failure outcome

- [ ] **Step 3: Preserve log visibility**

Add consistent logs:

- `sessionId`
- `mainThreadId`
- diagnostics file path
- final outcome

- [ ] **Step 4: Re-run host-adapter coverage**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts
pnpm --filter @blackboard/host-adapter test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/host-adapter/src/eventLoop.ts apps/host-adapter/src/index.ts packages/blackboard-runtime/src/cli.ts apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "feat: persist close relay diagnostics"
```

## Phase 3: Improve Host Error Context

### Task 3.1: Annotate Runtime-Host Failures

**Files:**
- Modify: `apps/host-adapter/src/runtimeHost.ts`

- [ ] **Step 1: Add better contextual errors**

When relay operations fail around:

- `thread/resume`
- `turn/start`
- `waitAgent`

include context such as:

- target thread id
- whether a completed buffered turn existed
- whether the failure happened during `thread/resume`, `turn/start`, or `waitAgent`

If caller-level role labels such as “main thread” vs “worker thread” are desired, attach them in `eventLoop.ts` or another higher-level wrapper that actually knows the thread role. Do not guess thread role inside `runtimeHost.ts`.

- [ ] **Step 2: Keep behavior unchanged**

Do not redesign host control behavior in this task; improve only the diagnostic value of thrown errors and debug logs.

- [ ] **Step 3: Run host-adapter tests**

Run:

```bash
pnpm --filter @blackboard/host-adapter test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/runtimeHost.ts
git commit -m "chore: improve relay host error context"
```

## Phase 4: Surface Diagnostics Through The CLI And Docs

### Task 4.1: Expose Where Operators Should Look

**Files:**
- Modify: `packages/blackboard-runtime/src/cli.ts`
- Modify: `packages/blackboard-runtime/README.md`
- Modify: `docs/05-agent/Agora-Published-E2E-Runbook.md`

- [ ] **Step 1: Make diagnostics discoverable**

Update CLI-side structured output or progress output so operators can find the relay diagnostics location after a session run.

Recommended minimum:

- document the parent state directory used for relay diagnostics
- include the precomputed relay diagnostics path in startup result JSON once `sessionId` is known

Constraint:

- `agora start-session` returns when the session is ready, not when it later closes
- therefore the diagnostics path must be deterministically known up front; do not design this around a post-close callback that mutates startup output later

- [ ] **Step 2: Update the runbook**

Add a post-close triage section:

1. inspect close-relay-result.json
2. read `outcome`
3. map outcome to next debugging step

- [ ] **Step 3: Commit**

```bash
git add packages/blackboard-runtime/src/cli.ts packages/blackboard-runtime/README.md docs/05-agent/Agora-Published-E2E-Runbook.md
git commit -m "docs: expose close relay diagnostics flow"
```

## Phase 5: Global E2E Verification

### Task 5.1: Rebuild, Reinstall, And Run A Diagnostic Close Test

**Files:**
- No source changes

- [ ] **Step 1: Rebuild and repack**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime build
pnpm --filter ./packages/blackboard-runtime pack --pack-destination /tmp/agora-pack-test
```

- [ ] **Step 2: Reinstall the global CLI and refresh the skill**

Run:

```bash
npm install -g /tmp/agora-pack-test/xiesunsun-agora-0.1.0.tgz
rm -rf ~/.codex/skills/blackboard-collaboration
mkdir -p ~/.codex/skills
cp -R /Users/ssunxie/code/whiteBoard/packages/blackboard-runtime/dist/codex/skills/blackboard-collaboration ~/.codex/skills/
agora init-codex --force
agora doctor
```

- [ ] **Step 3: Run a real close cycle**

Acceptance:

- start a real session from a fresh workspace
- close it from the frontend
- inspect the relay diagnostic artifact
- verify the outcome is one of the explicit classes above, not “silent absence”

- [ ] **Step 4: Record the exact observed outcome**

Capture:

- the diagnostics file path
- the `outcome`
- the raw error message if not `relay_completed`

This observed result becomes the next-fix input.

## Notes

- The purpose of this plan is to remove ambiguity. A failed relay after this work is acceptable only if it fails transparently with enough detail to identify the host/runtime boundary that broke.
- Keep the artifact small and human-readable; it should be inspectable during a live debugging session without extra tooling.
