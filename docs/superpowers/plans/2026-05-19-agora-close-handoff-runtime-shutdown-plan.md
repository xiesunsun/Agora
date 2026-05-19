# Agora Close Return, File Handoff, And Runtime Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the real E2E gaps discovered during Agora global testing by switching agent-to-agent large payload handoff to absolute file paths, making `agora close-session` persist close-result metadata, relaying close artifacts back to the main agent, and shutting down the runtime when the final active session closes.

**Architecture:** Preserve the current backend-as-session-truth model for collaboration state, history, diff, and review. Limit file-path transport to agent-to-agent large artifacts only: startup handoff, close summary, and final document. Extend the existing `agora close-session` command instead of adding a new close command, store only minimal `closeResult` metadata in backend truth, and let the host adapter use the current main thread id to send close artifact paths back to the main agent.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Codex app-server host adapter, Vitest, npm-installed Agora CLI.

---

## Scope

Primary outcomes:

- `agora start-session --handoff-file` passes an absolute handoff file path through the adapter-to-worker startup flow instead of embedding the full file contents into the worker prompt.
- `agora close-session` accepts `--summary-file` and `--final-document-file`.
- Backend snapshots include minimal `closeResult` metadata with absolute artifact paths and close timestamp.
- The adapter sends a close-result message with absolute artifact paths back to the main agent thread after close succeeds.
- The worker’s local `final-snapshot.json` file is renamed to `pre-close-snapshot.json`.
- If no open sessions remain after a successful close, the runtime/backend/frontend shell is shut down automatically.
- Tests cover the new CLI arguments, backend metadata, adapter close relay, and auto-shutdown behavior.

Non-goals:

- Moving review/history/version truth out of backend into local files.
- Adding a new `finalize-session` command.
- Adding `--final-snapshot-file` to `agora close-session`.
- Replacing current review/proceed/change-set behavior with file-only transport.
- Renaming every internal `blackboard` identifier.

## File/Interface Boundary Rules

### File-path transport is allowed for:

- main-agent handoff files
- worker-local `mainAgentInfo.md`
- close-time `summary.md`
- close-time final document file
- worker-local bullet resolution files
- worker-local candidate draft files
- worker-local `pre-close-snapshot.json`

### Backend truth must continue to own:

- `currentContent`
- `documentUnits`
- `activeBullets`
- `activeReviewChangeSet`
- `versionHistory`
- `currentVersionId`
- `baseVersionId`
- `sessionStatus`
- review/proceed state transitions

### Close metadata stored in backend should be minimal:

- `summaryPath`
- `finalDocumentPath`
- `closedAt`

Backend should not become the storage layer for the full summary markdown or the full final document body in this phase.

## File Structure

Modify:

- `packages/blackboard-runtime/src/cli.ts` - pass resolved `handoffFilePath`, carry `MAIN_THREAD_ID` into adapter env, extend `close-session` flags, and update usage/help text.
- `apps/host-adapter/src/index.ts` - stop reading the handoff file into memory, plumb the handoff path and main thread id through startup and close handling, and make runtime shutdown conditional on “no open sessions remain”.
- `apps/host-adapter/src/startup.ts` - build the worker startup prompt around an absolute `handoffFilePath` instead of injecting the entire handoff document text.
- `apps/host-adapter/src/eventLoop.ts` - preserve close-turn output, fetch close metadata after close, send the close artifact message to the main agent, and decide whether to stop the runtime.
- `apps/host-adapter/src/backendClient.ts` - support the richer close call plus any snapshot/session-open helper reads needed by the adapter.
- `apps/host-adapter/src/types.ts` - extend adapter-side snapshot types with `closeResult` and any event-loop callback payloads.
- `apps/backend/src/types.ts` - add backend-local `CloseResult` type and include it on `SessionSnapshot`.
- `packages/schema/src/index.ts` - add shared `CloseResult` type and expose it on the shared `SessionSnapshot`.
- `apps/backend/src/cliRoutes.ts` - parse `summaryPath`/`finalDocumentPath` in `POST /cli/sessions/:id/close`, persist `closeResult`, and return the closed snapshot metadata.
- `apps/backend/src/sessionModel.ts` - update `closeSession()` to accept close metadata and persist it while marking the session closed.
- `apps/backend/src/sessionStore.ts` - add session enumeration/open-session helpers for runtime shutdown decisions.
- `.codex/agents/blackboard-worker.toml` - update startup instructions to read the handoff file path and update close instructions to call `agora close-session --summary-file ... --final-document-file ...`; rename `final-snapshot.json` references to `pre-close-snapshot.json`.
- `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml` - keep the embedded template in sync.
- `.agents/skills/blackboard-collaboration/SKILL.md` - clarify that the handoff file path is the transport unit and that close artifacts are returned by path.
- `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md` - sync the embedded skill template.
- `apps/host-adapter/src/__tests__/startup.test.ts` - assert handoff path prompt behavior instead of full inline handoff text expectations.
- `apps/host-adapter/src/__tests__/eventLoop.test.ts` - cover close relay to main thread and runtime shutdown when the final session closes.
- `apps/backend/src/__tests__/cliRoutes.test.ts` - cover close metadata persistence and close-route validation errors.
- `apps/backend/src/__tests__/sessionModel.test.ts` - cover `closeResult` persistence in `closeSession()`.
- `packages/blackboard-runtime/README.md` - document the richer `close-session` semantics and the file-path transport boundary.
- `docs/05-agent/Agora-Published-E2E-Runbook.md` - add expected close return behavior and final-runtime-shutdown expectations.

Create:

- `apps/backend/src/__tests__/closeResult.test.ts` - focused tests for `closeResult` persistence if it keeps `cliRoutes` coverage cleaner.

---

## Phase 1: Convert Startup Handoff To Absolute File Path Transport

### Task 1.1: Extend Runtime And Adapter Plumbing For `handoffFilePath`

**Files:**
- Modify: `packages/blackboard-runtime/src/cli.ts`
- Modify: `apps/host-adapter/src/index.ts`
- Modify: `apps/host-adapter/src/startup.ts`
- Modify: `apps/host-adapter/src/__tests__/startup.test.ts`

- [ ] **Step 1: Write or update failing startup tests**

Adjust `apps/host-adapter/src/__tests__/startup.test.ts` to expect the worker prompt to contain:

```text
handoffFilePath: /absolute/path/to/handoff.md
```

and to no longer depend on the entire handoff document body being embedded into the startup prompt.

- [ ] **Step 2: Run the startup tests to confirm failure**

Run: `pnpm --filter @blackboard/host-adapter test -- startup.test.ts`

Expected: FAIL before implementation because the adapter still inlines the handoff contents.

- [ ] **Step 3: Pass resolved handoff path into the adapter**

In `packages/blackboard-runtime/src/cli.ts`:

- continue validating `--handoff-file`
- resolve it to an absolute path
- pass that absolute path to the adapter process

Recommended approach:

- keep `--handoff-file` on the adapter argv
- ensure it is absolute before spawning the adapter

- [ ] **Step 4: Stop reading the handoff file in adapter startup**

In `apps/host-adapter/src/index.ts` and `apps/host-adapter/src/startup.ts`:

- stop calling `readFileSync(handoffFile, "utf8")` as the startup transport
- change startup prompt generation to include `handoffFilePath`
- instruct the worker to read the file first, then write `mainAgentInfo.md`

- [ ] **Step 5: Re-run the focused tests**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- startup.test.ts
pnpm --filter @blackboard/host-adapter test -- runtimeHost.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/blackboard-runtime/src/cli.ts apps/host-adapter/src/index.ts apps/host-adapter/src/startup.ts apps/host-adapter/src/__tests__/startup.test.ts
git commit -m "feat: pass handoff to worker by absolute path"
```

---

## Phase 2: Extend `agora close-session` To Carry Close Artifact Paths

### Task 2.1: Add Shared `CloseResult` Types

**Files:**
- Modify: `packages/schema/src/index.ts`
- Modify: `apps/backend/src/types.ts`
- Modify: `apps/host-adapter/src/types.ts`

- [ ] **Step 1: Add the shared type**

In `packages/schema/src/index.ts`, add:

```ts
export interface CloseResult {
  summaryPath: string;
  finalDocumentPath: string;
  closedAt: string;
}
```

and expose it from `SessionSnapshot` as:

```ts
closeResult?: CloseResult;
```

- [ ] **Step 2: Thread the type through backend and adapter local types**

Update backend and host-adapter local `SessionSnapshot` types so `closeResult` is visible everywhere it is needed.

- [ ] **Step 3: Run typechecking on affected packages**

Run:

```bash
pnpm --filter @blackboard/backend build
pnpm --filter @blackboard/host-adapter typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/schema/src/index.ts apps/backend/src/types.ts apps/host-adapter/src/types.ts
git commit -m "feat: add shared close result metadata"
```

### Task 2.2: Extend The Close Route And Session Model

**Files:**
- Modify: `apps/backend/src/cliRoutes.ts`
- Modify: `apps/backend/src/sessionModel.ts`
- Modify: `apps/backend/src/__tests__/cliRoutes.test.ts`
- Modify: `apps/backend/src/__tests__/sessionModel.test.ts`

- [ ] **Step 1: Add failing backend tests**

Add tests covering:

- `POST /cli/sessions/:id/close` with valid `summaryPath` and `finalDocumentPath`
- missing `summaryPath` returns `400`
- missing `finalDocumentPath` returns `400`
- close persists `closeResult`

- [ ] **Step 2: Run targeted backend tests to verify failure**

Run:

```bash
pnpm --filter @blackboard/backend test -- cliRoutes.test.ts
pnpm --filter @blackboard/backend test -- sessionModel.test.ts
```

Expected: FAIL before implementation.

- [ ] **Step 3: Extend `closeSession()`**

Change `apps/backend/src/sessionModel.ts` so `closeSession()` accepts close metadata:

```ts
closeSession(snapshot, {
  summaryPath,
  finalDocumentPath,
  closedAt,
})
```

and persists:

- `sessionStatus: "closed"`
- `closeResult`
- clears `proceeding`
- clears `activeBullets`

- [ ] **Step 4: Extend `POST /cli/sessions/:id/close`**

In `apps/backend/src/cliRoutes.ts`:

- parse JSON body
- require non-empty `summaryPath`
- require non-empty `finalDocumentPath`
- call the new `closeSession(snapshot, closeResult)`
- return the new metadata in the response

- [ ] **Step 5: Re-run targeted backend tests**

Run:

```bash
pnpm --filter @blackboard/backend test -- cliRoutes.test.ts
pnpm --filter @blackboard/backend test -- sessionModel.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/cliRoutes.ts apps/backend/src/sessionModel.ts apps/backend/src/__tests__/cliRoutes.test.ts apps/backend/src/__tests__/sessionModel.test.ts
git commit -m "feat: persist close artifact paths in backend"
```

### Task 2.3: Extend CLI Close Arguments

**Files:**
- Modify: `packages/blackboard-runtime/src/cli.ts`

- [ ] **Step 1: Extend the CLI parser**

In `packages/blackboard-runtime/src/cli.ts`, make `runCloseSession()` require:

- `--summary-file`
- `--final-document-file`

and send:

```json
{
  "summaryPath": "/abs/path/to/summary.md",
  "finalDocumentPath": "/abs/path/to/final-document.md"
}
```

to `POST /cli/sessions/:id/close`.

- [ ] **Step 2: Update help text**

Update `printUsage()` so `close-session` documents the new required flags.

- [ ] **Step 3: Run a quick CLI regression**

Run:

```bash
node packages/blackboard-runtime/dist/cli.js help | rg "close-session|summary-file|final-document-file"
```

Expected: help text includes the new flags after rebuild.

- [ ] **Step 4: Commit**

```bash
git add packages/blackboard-runtime/src/cli.ts
git commit -m "feat: extend agora close-session with artifact paths"
```

---

## Phase 3: Relay Close Results Back To The Main Agent Thread

### Task 3.1: Capture The Main Thread Id At Startup

**Files:**
- Modify: `packages/blackboard-runtime/src/cli.ts`
- Modify: `apps/host-adapter/src/index.ts`

- [ ] **Step 1: Thread `CODEX_THREAD_ID` into the adapter env**

When `agora start-session` spawns the adapter, pass:

```text
MAIN_THREAD_ID=${process.env.CODEX_THREAD_ID ?? ""}
```

- [ ] **Step 2: Read the env in adapter startup**

In `apps/host-adapter/src/index.ts`, capture:

```ts
const mainThreadId = process.env.MAIN_THREAD_ID;
```

and retain it for close-time relay.

- [ ] **Step 3: Build and smoke typecheck**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime build
pnpm --filter @blackboard/host-adapter typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/blackboard-runtime/src/cli.ts apps/host-adapter/src/index.ts
git commit -m "feat: capture main thread id for close relay"
```

### Task 3.2: Send Close Artifact Paths Back To The Main Agent

**Files:**
- Modify: `apps/host-adapter/src/backendClient.ts`
- Modify: `apps/host-adapter/src/eventLoop.ts`
- Modify: `apps/host-adapter/src/index.ts`
- Modify: `apps/host-adapter/src/__tests__/eventLoop.test.ts`

- [ ] **Step 1: Add failing event-loop tests**

Cover:

- close event handled -> adapter sends a message to the main thread
- message contains:
  - `summaryPath`
  - `finalDocumentPath`
  - `sessionId`
- no main-thread relay attempted when `MAIN_THREAD_ID` is missing

- [ ] **Step 2: Run the focused event-loop tests to verify failure**

Run: `pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 3: Add backend client support as needed**

If `SessionSnapshot` now carries `closeResult`, `getSnapshot()` may already be enough. If not, add the smallest client helper required for retrieving close metadata.

- [ ] **Step 4: Relay close metadata**

In `apps/host-adapter/src/eventLoop.ts` / `index.ts`:

- after a close event is marked handled
- fetch latest snapshot
- read `snapshot.closeResult`
- if `mainThreadId` exists, call `host.sendInput(mainThreadId, closeResultMessage)`

Suggested message shape:

```text
Agora session closed.

Read these files for the final result:
- summary: /abs/path/to/summary.md
- final document: /abs/path/to/final-document.md

These files are the authoritative close artifacts for session session-xxx.
```

- [ ] **Step 5: Re-run focused host-adapter tests**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts
pnpm --filter @blackboard/host-adapter test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/host-adapter/src/backendClient.ts apps/host-adapter/src/eventLoop.ts apps/host-adapter/src/index.ts apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "feat: relay close artifact paths to main thread"
```

---

## Phase 4: Rename The Worker’s Close-Time Snapshot Artifact

### Task 4.1: Rename `final-snapshot.json` To `pre-close-snapshot.json`

**Files:**
- Modify: `.codex/agents/blackboard-worker.toml`
- Modify: `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml`
- Modify: docs or tests that mention `final-snapshot.json`

- [ ] **Step 1: Update worker instructions**

Change the close-turn local artifact reference from:

```text
final-snapshot.json
```

to:

```text
pre-close-snapshot.json
```

- [ ] **Step 2: Update any matching docs/tests**

Run:

```bash
rg -n "final-snapshot\\.json|pre-close-snapshot\\.json" .codex packages docs apps
```

and update all intended references.

- [ ] **Step 3: Commit**

```bash
git add .codex/agents/blackboard-worker.toml packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml
git commit -m "docs: rename close snapshot artifact"
```

---

## Phase 5: Stop The Runtime When The Final Open Session Closes

### Task 5.1: Add Open-Session Enumeration

**Files:**
- Modify: `apps/backend/src/sessionStore.ts`

- [ ] **Step 1: Add session enumeration helpers**

Add helpers such as:

```ts
export function listSessions(): SessionSnapshot[];
export function hasOpenSessions(): boolean;
```

Where “open” means at least:

- `active`
- `proceeding`
- `reviewing`

- [ ] **Step 2: Add or update tests if needed**

If `sessionStore.ts` lacks direct tests, cover the behavior through `cliRoutes` or adapter tests.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/sessionStore.ts
git commit -m "feat: add open session helpers"
```

### Task 5.2: Make Adapter Shutdown Conditional On Remaining Open Sessions

**Files:**
- Modify: `apps/host-adapter/src/index.ts`
- Modify: `apps/host-adapter/src/backendClient.ts`
- Modify: `apps/host-adapter/src/__tests__/eventLoop.test.ts`

- [ ] **Step 1: Add failing tests for final-session shutdown**

Cover:

- closing the only open session -> runtime shutdown is triggered
- closing one session while another open session exists -> runtime shutdown is not triggered

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 3: Implement the shutdown policy**

In adapter close handling:

- after close is handled
- query whether open sessions remain
- if none remain, call runtime shutdown
- otherwise leave runtime alive

Preserve `agora down` as the manual fallback.

- [ ] **Step 4: Re-run targeted tests**

Run:

```bash
pnpm --filter @blackboard/host-adapter test -- eventLoop.test.ts
pnpm --filter @blackboard/host-adapter test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/host-adapter/src/index.ts apps/host-adapter/src/backendClient.ts apps/host-adapter/src/__tests__/eventLoop.test.ts
git commit -m "feat: stop runtime when final session closes"
```

---

## Phase 6: Update Worker/Skill Prompts And Docs

### Task 6.1: Align Worker Prompt Contract

**Files:**
- Modify: `.codex/agents/blackboard-worker.toml`
- Modify: `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml`

- [ ] **Step 1: Update startup turn instructions**

Worker startup turn should now explicitly:

- read `handoffFilePath`
- write that content to `mainAgentInfo.md`
- derive the initial session document from the handoff file contents

- [ ] **Step 2: Update close turn instructions**

Worker close turn should now explicitly:

- write `summary.md`
- write `pre-close-snapshot.json`
- call:

```bash
agora close-session --backend-url {backendUrl} --session {sessionId} --summary-file /abs/path/to/summary.md --final-document-file /abs/path/to/sessionDocument.md
```

- [ ] **Step 3: Commit**

```bash
git add .codex/agents/blackboard-worker.toml packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml
git commit -m "docs: align worker prompt with file-path close flow"
```

### Task 6.2: Align Skill And Public Docs

**Files:**
- Modify: `.agents/skills/blackboard-collaboration/SKILL.md`
- Modify: `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md`
- Modify: `packages/blackboard-runtime/README.md`
- Modify: `docs/05-agent/Agora-Published-E2E-Runbook.md`

- [ ] **Step 1: Update the skill**

Clarify:

- startup handoff is delivered by absolute file path
- close results are returned to the main agent by absolute file path

- [ ] **Step 2: Update published docs**

Document:

- `agora close-session` now requires `--summary-file` and `--final-document-file`
- closing the final open session stops the runtime
- history/review remain backend truth and are not replaced by file-path transport

- [ ] **Step 3: Verify documentation consistency**

Run:

```bash
rg -n "summary-file|final-document-file|handoffFilePath|pre-close-snapshot|final session closes|history/review" .agents packages docs
```

Expected: all public references align with the new behavior.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/blackboard-collaboration/SKILL.md packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md packages/blackboard-runtime/README.md docs/05-agent/Agora-Published-E2E-Runbook.md
git commit -m "docs: update Agora file-path transport guidance"
```

---

## Phase 7: Final Verification

### Task 7.1: Run The Focused Automated Matrix

**Files:**
- No code changes expected unless regressions are found

- [ ] **Step 1: Run backend tests**

Run: `pnpm test:backend`

Expected: PASS

- [ ] **Step 2: Run host-adapter tests**

Run: `pnpm --filter @blackboard/host-adapter test`

Expected: PASS

- [ ] **Step 3: Rebuild the published runtime**

Run: `pnpm --filter ./packages/blackboard-runtime build`

Expected: PASS

- [ ] **Step 4: Re-run published-install smoke**

Run: `pnpm run smoke:agora`

Expected: PASS

- [ ] **Step 5: Commit only if docs or fixtures change during verification**

```bash
git add docs packages .agents .codex
git commit -m "test: finalize Agora close-return flow verification"
```

### Task 7.2: Manual Global E2E Validation

**Files:**
- No code changes expected

- [ ] **Step 1: Repack and reinstall globally**

Run:

```bash
mkdir -p /tmp/agora-pack-test
pnpm --filter ./packages/blackboard-runtime pack --pack-destination /tmp/agora-pack-test
npm install -g /tmp/agora-pack-test/xiesunsun-agora-*.tgz
```

- [ ] **Step 2: Refresh global Codex assets**

Run:

```bash
rm -rf ~/.codex/skills/blackboard-collaboration
mkdir -p ~/.codex/skills
cp -R /Users/ssunxie/code/whiteBoard/packages/blackboard-runtime/dist/codex/skills/blackboard-collaboration ~/.codex/skills/
agora init-codex --force
agora doctor
```

Expected: `agora doctor` returns `"ok": true`.

- [ ] **Step 3: Run a real session outside the repo**

Validate:

- session starts from a handoff file path
- user can edit/comment/proceed/review/close
- close returns a main-thread message containing absolute `summaryPath` and `finalDocumentPath`
- the final open session closing stops `localhost:3001`

- [ ] **Step 4: Confirm runtime shutdown**

Run:

```bash
agora status
```

Expected: failure or “no runtime listening” behavior after the final session closes.

---

## Notes For Execution

- Do not move review/history/version truth into file-only transport.
- Keep backend metadata small: store close artifact paths, not large document bodies.
- Prefer `MAIN_THREAD_ID` derived from `CODEX_THREAD_ID` over hand-carrying main-thread identity through the handoff file.
- Use absolute file paths everywhere in worker close and startup contracts.
- Preserve backward compatibility only where required for the immediate published E2E flow; do not over-engineer transitional fallbacks in this phase.
