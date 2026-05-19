# Agora Close Relay And Runtime Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining global E2E gaps so that closing an Agora session reliably returns close artifacts to the main agent, shuts down the runtime when the final real session closes, and avoids interactive workflow drift such as user-facing `--json-out` session files.

**Architecture:** Keep the existing Agora startup model and close-result metadata model. Tighten the close path by treating the main-agent relay as a real turn that must be awaited before adapter exit, make runtime shutdown depend on “real open sessions” instead of the always-seeded demo session, and align the published skill/runbook with the intended interactive behavior.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Vitest, Codex app-server host adapter, global Agora CLI, embedded Codex skills/templates.

---

## Scope

Primary outcomes:

- The adapter does not exit immediately after `host.sendInput(mainThreadId, ...)`; it waits for the main-agent close relay turn to complete or fail deterministically.
- Main-agent close relay failures are visible in logs/tests instead of being silently lost during adapter shutdown.
- Runtime auto-shutdown uses “real open collaboration sessions” and is not blocked forever by the seeded `demo` session.
- Interactive `blackboard-collaboration` guidance no longer steers the main agent toward user-facing `--json-out` startup files for ordinary session startup.
- Manual global E2E verification explicitly checks:
  - close artifacts arrive as a main-thread message
  - final session close takes down `localhost:3001`
  - no unexpected user-facing startup JSON file is required for ordinary flow

Non-goals:

- Redesigning startup handoff transport again
- Changing `closeResult` payload shape
- Removing internal adapter ready files used by `agora start-session`
- Redesigning frontend closed-session UX

## File Structure

Modify:

- `apps/host-adapter/src/eventLoop.ts` - await the main-agent relay turn before returning from `session.close_requested`, and make the close path log explicit success/failure.
- `apps/host-adapter/src/index.ts` - keep adapter lifetime aligned with the close relay and runtime-shutdown lifecycle; only exit after the relay/shutdown branch finishes.
- `apps/host-adapter/src/types.ts` - extend close callback payload only if needed for better relay/shutdown assertions.
- `apps/host-adapter/src/__tests__/eventLoop.test.ts` - cover “relay is awaited before exit” and “runtime shutdown only after real sessions are gone”.
- `apps/backend/src/index.ts` - stop seeding the demo session by default in published/runtime mode, or gate it behind an explicit environment flag.
- `apps/backend/src/sessionStore.ts` - if needed, add helper(s) that distinguish real collaboration sessions from demo-only state.
- `apps/backend/src/cliRoutes.ts` - if needed, refine `/cli/sessions?status=open` so it excludes demo-only state from runtime-shutdown decisions.
- `apps/backend/src/__tests__/cliRoutes.test.ts` - cover open-session enumeration without demo pollution.
- `apps/backend/src/__tests__/sessionStore.test.ts` or existing backend tests - cover the new demo/session filtering rule if direct store tests are clearer.
- `.agents/skills/blackboard-collaboration/SKILL.md` - remove ambiguity around interactive `--json-out` usage and reaffirm that close artifacts come back by main-thread message plus file paths.
- `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md` - sync embedded skill template.
- `packages/blackboard-runtime/README.md` - document the intended close relay behavior and clarify that startup JSON output is optional tooling, not the default human-facing flow.
- `docs/05-agent/Agora-Published-E2E-Runbook.md` - add the exact acceptance checks for close relay, runtime shutdown, and absence of workflow drift.

## Phase 1: Make Close Relay Durable

### Task 1.1: Reproduce The Missing Main-Agent Message In Tests

**Files:**
- Modify: `apps/host-adapter/src/__tests__/eventLoop.test.ts`

- [ ] **Step 1: Add a failing close-relay regression test**

Cover this sequence:

1. `session.close_requested` is claimed and completed
2. `snapshot.closeResult` exists
3. `mainThreadId` exists
4. `host.sendInput(mainThreadId, ...)` is called
5. the event loop must not resolve until the corresponding `host.waitAgent(mainThreadId)` settles

- [ ] **Step 2: Add a failure-path test**

Cover:

1. relay `sendInput` succeeds
2. relay `waitAgent(mainThreadId)` rejects or returns non-completed status
3. adapter logs the failure explicitly
4. adapter still reaches deterministic shutdown instead of silently dropping the relay

- [ ] **Step 3: Run the focused test to confirm current failure**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts
```

Expected: FAIL before implementation because close relay is fire-and-exit.

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "test: cover awaited close relay"
```

### Task 1.2: Await The Main-Agent Relay Before Adapter Exit

**Files:**
- Modify: `apps/host-adapter/src/eventLoop.ts`
- Modify: `apps/host-adapter/src/index.ts`

- [ ] **Step 1: Update close-event handling**

In `apps/host-adapter/src/eventLoop.ts`:

- after `host.sendInput(mainThreadId, closeResultMessage)`
- call `host.waitAgent(mainThreadId)`
- require a completed status before considering the relay successful
- keep the relay wrapped in explicit logging so failures are visible

- [ ] **Step 2: Keep adapter shutdown after relay**

In `apps/host-adapter/src/index.ts`:

- preserve the current “event loop returns, then process exits” model
- ensure adapter exit happens only after the awaited close relay and runtime-shutdown branch has finished

- [ ] **Step 3: Re-run focused host-adapter coverage**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts
pnpm --filter @blackboard/host-adapter test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/eventLoop.ts apps/host-adapter/src/index.ts apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "fix: await close relay before adapter exit"
```

## Phase 2: Make Runtime Auto-Shutdown Ignore Demo Pollution

### Task 2.1: Reproduce The “Demo Session Keeps Runtime Alive” Failure

**Files:**
- Modify: `apps/backend/src/__tests__/cliRoutes.test.ts`
- Modify: `apps/backend/src/__tests__/sessionStore.test.ts` or existing backend tests

- [ ] **Step 1: Add a failing backend regression test**

Cover:

1. runtime boots with demo support enabled or previously seeded
2. a real collaboration session is created and later closed
3. `/cli/sessions?status=open` should not report `hasOpenSessions: true` solely because of `demo`

- [ ] **Step 2: Run targeted backend tests to confirm failure**

Run:

```bash
pnpm --filter @blackboard/backend test -- cliRoutes.test.ts
```

Expected: FAIL before implementation because `demo` is counted as open.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/__tests__/cliRoutes.test.ts
git commit -m "test: cover demo session shutdown pollution"
```

### Task 2.2: Gate Or Exclude The Demo Session In Runtime Mode

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/sessionStore.ts`
- Modify: `apps/backend/src/cliRoutes.ts`

- [ ] **Step 1: Pick the smallest safe rule**

Recommended rule:

- do not seed `demo` automatically in published/runtime mode
- gate demo seeding behind an explicit env flag such as `BLACKBOARD_ENABLE_DEMO_SESSION=true`

If that is too disruptive for existing local dev flows, fallback to:

- keep demo support
- but exclude `demo` from `/cli/sessions?status=open` and any runtime-shutdown decisions

- [ ] **Step 2: Implement the rule**

Update backend startup and/or session enumeration helpers so “open sessions” for shutdown means real collaboration sessions only.

- [ ] **Step 3: Re-run backend tests**

Run:

```bash
pnpm --filter @blackboard/backend test
pnpm test:backend
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/sessionStore.ts apps/backend/src/cliRoutes.ts apps/backend/src/__tests__/cliRoutes.test.ts
git commit -m "fix: exclude demo from runtime shutdown decisions"
```

## Phase 3: Remove Interactive Workflow Drift

### Task 3.1: Align Skill And Docs With The Intended Human-Facing Flow

**Files:**
- Modify: `.agents/skills/blackboard-collaboration/SKILL.md`
- Modify: `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md`
- Modify: `packages/blackboard-runtime/README.md`
- Modify: `docs/05-agent/Agora-Published-E2E-Runbook.md`

- [ ] **Step 1: Update the skill contract**

Clarify that for ordinary interactive startup:

- `agora start-session --handoff-file {handoffFile}` is the default
- `--json-out` is optional tooling/debug plumbing, not the default user-facing path
- session close completion is observed through a main-thread message carrying `summaryPath` and `finalDocumentPath`

- [ ] **Step 2: Sync embedded skill/docs**

Mirror the same behavior in embedded assets and published docs so global installs match repo-local behavior.

- [ ] **Step 3: Commit**

```bash
git add .agents/skills/blackboard-collaboration/SKILL.md packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md packages/blackboard-runtime/README.md docs/05-agent/Agora-Published-E2E-Runbook.md
git commit -m "docs: align interactive session flow with close relay behavior"
```

## Phase 4: Global E2E Verification

### Task 4.1: Rebuild, Reinstall, And Verify Published Behavior

**Files:**
- No source changes

- [ ] **Step 1: Rebuild and repack**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime build
pnpm --filter ./packages/blackboard-runtime pack --pack-destination /tmp/agora-pack-test
```

- [ ] **Step 2: Reinstall the global CLI and refresh the global skill**

Run:

```bash
npm install -g /tmp/agora-pack-test/agora-0.1.0.tgz
rm -rf ~/.codex/skills/blackboard-collaboration
mkdir -p ~/.codex/skills
cp -R /Users/ssunxie/code/whiteBoard/packages/blackboard-runtime/dist/codex/skills/blackboard-collaboration ~/.codex/skills/
agora init-codex --force
agora doctor
```

- [ ] **Step 3: Run real manual E2E**

Acceptance:

- start a session from a fresh non-repo workspace using the skill
- main agent receives the startup message with real `frontendUrl`
- collaborate and close the session from the frontend
- main agent receives a close message with:
  - `summaryPath`
  - `finalDocumentPath`
- no user-facing startup JSON file is required for the ordinary flow
- `lsof -nP -iTCP:3001 -sTCP:LISTEN` shows no listener after the final real session closes

- [ ] **Step 4: Record the result**

Add the exact observed behavior to the runbook or task log before closing the task.

## Notes

- The internal adapter `readyFile` remains valid implementation plumbing; the bug is not its existence, but that interactive skill behavior drifted toward exposing separate startup JSON files in user workspaces.
- The close relay should continue using absolute artifact paths. Do not move close document contents into backend truth as part of this fix.
- If awaiting the main-thread relay reveals app-server limitations around sending into the currently active top-level thread, capture that as a concrete host-runtime constraint rather than weakening the acceptance criteria silently.
