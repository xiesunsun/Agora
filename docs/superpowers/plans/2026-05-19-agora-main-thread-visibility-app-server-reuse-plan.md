# Agora Main-Thread Visibility And App-Server Reuse Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Codex Desktop visibility gap where Agora successfully writes close results into the main thread history but the user only sees the message after restarting Codex.

**Architecture:** Stop treating “relay completed” as equivalent to “Desktop UI updated live.” Preserve the current Agora close artifact model, but change the host-side delivery path so it prefers the same Codex app-server instance already used by the running Desktop app. Where possible, inject close results directly into the main thread history without creating a background relay turn. If first-party app-server reuse is not available through a stable supported socket, keep a documented fallback path and make the product expectation explicit.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Codex Desktop app, Codex CLI/app-server transport, Agora host adapter.

---

## Problem Statement

The current global E2E behavior is:

- Agora close relay diagnostics report success.
- Close artifacts are generated and persisted correctly.
- The final message is eventually visible in the main thread.
- The user often has to restart Codex Desktop before that message appears.

This means the problem is no longer “Agora failed to send the message.” The problem is “the current Desktop UI session did not reflect that background write live.”

## Confirmed Findings

These findings are already established by local testing and diagnostics:

- `apps/host-adapter/src/runtimeHost.ts` currently spawns a fresh process with:
  - `codex app-server --listen stdio://`
- The shell `codex` entrypoint is the npm-installed Codex CLI wrapper:
  - `/Users/ssunxie/.nvm/versions/node/v22.21.0/bin/codex`
- That wrapper in turn spawns a native `codex` binary.
- Codex Desktop itself also runs its own long-lived app-server process:
  - `/Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled`
- Therefore, Agora is not guaranteed to be talking to the same app-server instance currently backing the visible Desktop UI.
- Real close-relay diagnostics have already shown outcomes such as:
  - `relay_completed`
  - `sendInputSucceeded=true`
  - `waitAgentCompleted=true`
- Users can sometimes see worker threads in Codex Desktop when the worker workspace is visible to the app, but that does not prove main-thread live updates are driven through the same transport path.

## Supported Codex Capabilities

Official and local protocol evidence shows these supported capabilities:

- `thread/inject_items`
  - Appends prebuilt Responses API items to a loaded thread without starting a user turn.
- `thread/read`
  - Reads stored thread state by id.
- `thread/start`
  - Automatically subscribes the current connection to thread turn/item notifications.
- `codex app-server proxy`
  - Proxies stdio bytes to a running app-server control socket.
- `codex app-server --listen unix://...`
  - Indicates app-server supports non-stdio transports.

What is **not** currently documented or proven:

- A stable public Desktop control-socket discovery contract for third-party integrations.
- A guarantee that writing a thread from one app-server process will live-refresh another already-open Desktop UI session.
- A dedicated “show a visible message in the current Desktop main thread now” high-level command.

## Working Hypothesis

The most likely explanation for the restart requirement is:

1. Agora writes the main-thread update successfully.
2. That write is persisted into thread history.
3. The currently open Desktop UI does not receive a live update for that write because Agora used a different app-server instance or connection scope.
4. Restarting Codex causes the thread to reload from persisted history, making the message appear.

This hypothesis matches the observed combination of:

- successful relay diagnostics
- eventual message visibility
- lack of immediate UI refresh

## Product Decision

Agora should no longer rely on:

- “background relay turn completed” as the success criterion for a user-visible main-thread message

Agora should instead prefer:

1. reusing the running Codex Desktop app-server instance when available
2. using `thread/inject_items` for close summaries where possible
3. treating “immediate Desktop visibility” as a separately testable contract

## Scope

Primary outcomes:

- We can state with confidence whether Agora is using:
  - a fresh app-server instance
  - the running Desktop app-server instance
- We have a deterministic probe for whether same-instance reuse fixes live main-thread visibility.
- We have a documented recommendation for the close-result write path:
  - `thread/inject_items` preferred
  - background relay turn only as fallback
- We have explicit product behavior for the unsupported case.

Non-goals:

- Redesigning Agora close artifacts
- Reworking handoff-file transport again
- Changing collaboration-state truth in backend
- Solving all Codex Desktop workspace discovery behavior

## File Structure

Modify:

- `apps/host-adapter/src/runtimeHost.ts`
  - add a transport mode that can connect through `codex app-server proxy` instead of always spawning a fresh `app-server --listen stdio://`
- `apps/host-adapter/src/eventLoop.ts`
  - switch close-result delivery toward `thread/inject_items` when supported
- `apps/host-adapter/src/types.ts`
  - add explicit transport/visibility diagnostics if needed
- `apps/host-adapter/src/__tests__/runtimeHost.test.ts`
  - cover transport selection and proxy-mode behavior
- `apps/host-adapter/src/__tests__/eventLoop.test.ts`
  - cover injected close-result path
- `packages/blackboard-runtime/src/cli.ts`
  - pass through explicit Desktop control-socket / transport selection options if needed
- `packages/blackboard-runtime/README.md`
  - document the visibility contract and fallback behavior
- `.agents/skills/blackboard-collaboration/SKILL.md`
  - align user-visible expectations if live main-thread refresh cannot be guaranteed
- `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md`
  - sync embedded skill template

Create if useful:

- `apps/host-adapter/src/desktopTransport.ts`
  - transport resolution for `spawn fresh app-server` vs `proxy to running Desktop app-server`
- `apps/host-adapter/src/visibilityDiagnostics.ts`
  - record which transport path was used for a given session

## Phase 1: Make The Current Constraint Explicit

### Task 1.1: Record The Real Transport Topology

**Files:**
- Modify: `packages/blackboard-runtime/README.md`
- Modify: `docs/05-agent/Agora-Published-E2E-Runbook.md` if present and still authoritative

- [ ] **Step 1: Document the current spawn behavior**

State clearly:

- Agora currently spawns a fresh app-server transport process.
- This is not the same as opening a visible new Codex Desktop window.
- This is not equivalent to guaranteeing live updates in the currently open Desktop thread.

- [ ] **Step 2: Document the observed user-facing symptom**

State clearly:

- close relay can succeed
- the user may still need to restart Codex Desktop to see the appended main-thread message

- [ ] **Step 3: Commit**

```bash
git add packages/blackboard-runtime/README.md
git commit -m "docs: clarify current Codex visibility constraint"
```

## Phase 2: Add A Same-Instance Transport Probe

### Task 2.1: Add A Configurable Desktop-App-Server Proxy Mode

**Files:**
- Modify: `apps/host-adapter/src/runtimeHost.ts`
- Modify: `apps/host-adapter/src/__tests__/runtimeHost.test.ts`
- Modify: `packages/blackboard-runtime/src/cli.ts`

- [ ] **Step 1: Add an explicit transport selector**

Introduce a host transport mode such as:

- `spawnFreshAppServer`
- `proxyDesktopAppServer`

Do not silently replace the current behavior without a probe path.

- [ ] **Step 2: Add proxy-mode process spawning**

Support spawning:

```text
codex app-server proxy --sock <socket-path>
```

instead of:

```text
codex app-server --listen stdio://
```

- [ ] **Step 3: Thread the socket path from CLI/env into the adapter**

Use an explicit flag or env var so E2E runs can choose proxy mode intentionally before making it the default.

- [ ] **Step 4: Add tests**

Cover:

- fresh app-server mode still behaves unchanged
- proxy mode builds the expected process invocation
- missing socket path fails loudly

- [ ] **Step 5: Commit**

```bash
git add apps/host-adapter/src/runtimeHost.ts apps/host-adapter/src/__tests__/runtimeHost.test.ts packages/blackboard-runtime/src/cli.ts
git commit -m "feat: add desktop app-server proxy transport mode"
```

### Task 2.2: Determine Whether Desktop Control Socket Discovery Is Stable

**Files:**
- Modify: `packages/blackboard-runtime/README.md`
- Create optional discovery helper only if justified

- [ ] **Step 1: Evaluate whether a stable socket discovery rule exists**

Possible sources:

- documented CLI behavior
- stable filesystem location
- Desktop-provided environment or config

- [ ] **Step 2: Reject undocumented heuristics as default behavior**

If socket discovery depends on temp-dir scraping or unstable naming, do not make it the default product path without a guardrail.

- [ ] **Step 3: Write the finding down**

One of:

- “Stable supported discovery exists; use it.”
- “Only heuristic discovery exists; keep proxy mode opt-in.”

- [ ] **Step 4: Commit**

```bash
git add packages/blackboard-runtime/README.md
git commit -m "docs: record desktop control socket discovery constraints"
```

## Phase 3: Change Close Delivery To `thread/inject_items`

### Task 3.1: Replace Main-Thread Close Relay Turn With Item Injection

**Files:**
- Modify: `apps/host-adapter/src/runtimeHost.ts`
- Modify: `apps/host-adapter/src/eventLoop.ts`
- Modify: `apps/host-adapter/src/__tests__/eventLoop.test.ts`

- [ ] **Step 1: Add a host primitive for `thread/inject_items`**

Expose a helper that appends an assistant-style message to the target thread without starting a new turn.

- [ ] **Step 2: Use injected items for close-result delivery**

For close-result delivery, prefer an injected assistant message that includes:

- session id
- summary path
- final document path
- clear operator instructions

- [ ] **Step 3: Preserve current relay path as fallback**

If injection is unavailable or rejected, keep the current relay-turn path only as a fallback and record which path was used.

- [ ] **Step 4: Add tests**

Cover:

- successful item injection
- fallback to relay turn on injection failure
- recorded transport/delivery mode in diagnostics

- [ ] **Step 5: Commit**

```bash
git add apps/host-adapter/src/runtimeHost.ts apps/host-adapter/src/eventLoop.ts apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "feat: inject close results into main thread"
```

## Phase 4: Validate Desktop Live Visibility

### Task 4.1: Run Real Codex Desktop E2E In Both Modes

**Files:**
- Modify: `docs/05-agent/Agora-Published-E2E-Runbook.md` if present and still authoritative
- Modify: `packages/blackboard-runtime/README.md`

- [ ] **Step 1: Validate fresh-app-server mode**

Record whether the message:

- appears only after restart
- appears after manual thread reopen
- appears live

- [ ] **Step 2: Validate proxy-to-Desktop mode**

Repeat the same test while targeting the running Desktop app-server instance.

- [ ] **Step 3: Decide the default**

If proxy mode reliably enables immediate visibility and uses a stable supported socket path:

- make proxy mode the default

If not:

- keep proxy mode opt-in
- document that immediate visible delivery is not guaranteed by current host integration

- [ ] **Step 4: Commit**

```bash
git add packages/blackboard-runtime/README.md
git commit -m "docs: finalize Codex desktop visibility contract"
```

## Acceptance Criteria

- The team can state exactly whether Agora is talking to:
  - a fresh Codex app-server instance
  - the same running Desktop app-server instance
- There is a tested host path for `thread/inject_items`.
- The behavior of main-thread close-result visibility is verified in real Codex Desktop, not inferred from diagnostics alone.
- If immediate live visibility is unsupported in the supported transport modes, the product documents that limitation explicitly and does not pretend the problem is solved.

## Notes

- The earlier close-relay diagnostics plan succeeded in its intended job: it proved that “relay completed” does not necessarily imply “Desktop UI visibly updated.”
- Worker-thread visibility and main-thread live-message visibility are related but not identical:
  - a worker thread may show up in the app because it is a discoverable thread in a visible workspace
  - that does not prove background writes into an already-open main thread will live-refresh the current Desktop UI session
- This plan should be treated as the follow-up to:
  - `docs/superpowers/plans/2026-05-19-agora-close-relay-diagnostics-plan.md`
