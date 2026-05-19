# Blackboard MVP Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current Blackboard project from prototype-complete to MVP-ready by fixing runtime blockers, review semantics, acceptance gates, and duplicated domain logic.

**Architecture:** Keep the current pnpm monorepo and HTTP command + SSE event model. Move shared pure document/review behavior into workspace packages, keep backend as business truth, and make frontend consume protocol snapshots/events without owning authoritative domain transitions.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright, Node HTTP server, pnpm workspaces, Codex host-adapter.

---

## Scope

This refactor is intentionally staged. Each phase should leave the repo in a passing, runnable state and should be committed separately.

Primary outcomes:

- Root verification commands reflect the documented acceptance gates.
- `@blackboard/host-adapter` tests pass and startup/runtime config behavior is deterministic.
- Review accept/reject semantics preserve previously rejected changes.
- Comment bullets carry exact same-unit anchors.
- Markdown and review pure functions have one implementation source.
- E2E can run reliably even when the default backend port is already occupied.

Non-goals:

- Rewriting UI visuals.
- Replacing the HTTP + SSE protocol.
- Adding multi-user or multi-agent collaboration.
- Adding persistence beyond the current in-memory store.

## File Structure

Create:

- `harness/index.md` - repository-local entry point for documented harness checks.
- `harness/rules/acceptance-gates.md` - maps formal acceptance layers to concrete commands.
- `harness/scripts/check.mjs` - runs the minimal automated gate suite used by `pnpm run harness:check`.
- `packages/document-model/package.json` - shared package for Markdown unit parsing and document edit helpers.
- `packages/document-model/tsconfig.json` - build config for the shared document model package.
- `packages/document-model/src/index.ts` - shared implementation of `documentUnitsFromMarkdown`, edit replacement, removal, title selection, and `applyChangeToMarkdown`.
- `packages/review-model/package.json` - shared package for review settlement and change application helpers.
- `packages/review-model/tsconfig.json` - build config for review-model package.
- `packages/review-model/src/index.ts` - pure helpers for applying pending/accepted/rejected review changes.

Modify:

- `package.json` - add root scripts for full test/build/harness commands.
- `pnpm-workspace.yaml` - ensure new `packages/*` packages are included if not already.
- `apps/backend/package.json` - depend on `@blackboard/document-model` and `@blackboard/review-model`.
- `apps/frontend/package.json` - depend on `@blackboard/document-model` and `@blackboard/review-model`.
- `apps/backend/src/markdownDocument.ts` - replace implementation with re-exports from `@blackboard/document-model`.
- `apps/frontend/src/app/markdownDocument.ts` - replace implementation with re-exports from `@blackboard/document-model`.
- `apps/backend/src/sessionModel.ts` - use shared review settlement helpers and fix bulk accept/reject semantics.
- `apps/frontend/src/app/sessionModel.ts` - use shared review settlement helpers for fixture mode only.
- `packages/schema/src/index.ts` - align `SessionStatus` with protocol and add anchor offsets to comment command payloads.
- `apps/frontend/src/app/commands.ts` - send comment anchor offsets.
- `apps/frontend/src/components/ReadingSurface.tsx` - enforce same-unit selection and compute offsets.
- `apps/backend/src/sessionModel.ts` - persist comment anchor offsets.
- `apps/backend/src/routes.ts` - include full snapshot payload for `working_set.rebased`; keep close/proceed dispatch behavior explicit.
- `apps/host-adapter/src/startup.ts` - make worker workspace env var consistent and testable.
- `apps/host-adapter/src/runtimeHost.ts` - allow tests to pass explicit worker config and make missing config error deterministic.
- `apps/host-adapter/src/__tests__/startup.test.ts` - update env expectations.
- `apps/host-adapter/src/__tests__/runtimeHost.test.ts` - create temp config or pass `workerConfigPath`.
- `apps/frontend/playwright.config.ts` - avoid hard failure when backend is already running.
- `docs/04-design/Acceptance-Matrix.md` - update evidence commands after harness scripts exist.
- `docs/05-agent/MVP-Runbook.md` - record remaining known gaps after this refactor.

---

## Phase 1: Restore Automated Acceptance Entrypoints

### Task 1.1: Add Root Verification Scripts

**Files:**
- Modify: `package.json`
- Test: command execution

- [ ] **Step 1: Add scripts**

Add these scripts:

```json
{
  "scripts": {
    "build:all": "pnpm --filter @blackboard/runtime build",
    "test:all": "pnpm test && pnpm test:backend && pnpm --filter @blackboard/host-adapter test",
    "typecheck:all": "pnpm --filter @blackboard/frontend lint && pnpm --filter @blackboard/backend build && pnpm --filter @blackboard/host-adapter typecheck",
    "harness:report": "node harness/scripts/check.mjs --report",
    "harness:check": "node harness/scripts/check.mjs",
    "harness:arch": "node harness/scripts/check.mjs --arch",
    "harness:naming": "node harness/scripts/check.mjs --naming",
    "harness:boundary": "node harness/scripts/check.mjs --boundary"
  }
}
```

- [ ] **Step 2: Run script discovery**

Run: `pnpm run`

Expected: output includes all `harness:*`, `test:all`, `typecheck:all`, and `build:all`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add root verification scripts"
```

### Task 1.2: Add Minimal Harness Files

**Files:**
- Create: `harness/index.md`
- Create: `harness/rules/acceptance-gates.md`
- Create: `harness/scripts/check.mjs`
- Modify: `docs/04-design/Acceptance-Matrix.md`

- [ ] **Step 1: Create harness script**

Implement `harness/scripts/check.mjs` with Node stdlib only. It should:

- verify required docs exist;
- verify required package scripts exist;
- verify expected package directories exist;
- support `--report`, `--arch`, `--naming`, `--boundary` flags as aliases over the same baseline checks for now;
- exit non-zero on missing entries.

Core check list:

```js
const requiredPaths = [
  "docs/01-product/PRD.md",
  "docs/01-product/Feature-Spec.md",
  "docs/03-contracts/Frontend-Backend-Protocol.md",
  "docs/04-design/Acceptance-Matrix.md",
  "docs/05-agent/MVP-Runbook.md",
  "apps/frontend/src/app/sessionStore.ts",
  "apps/backend/src/routes.ts",
  "apps/host-adapter/src/eventLoop.ts",
  "packages/schema/src/index.ts"
];
```

- [ ] **Step 2: Create harness docs**

`harness/index.md` should state that this is the executable companion to `docs/04-design/Acceptance-Matrix.md`.

`harness/rules/acceptance-gates.md` should map:

- Structure: `pnpm run harness:check`
- Rendering: frontend/backend Markdown tests
- Interaction: frontend/backend session/review tests
- Presentation: Playwright screenshots/manual QA
- Runtime: host-adapter tests and real Codex validation run

- [ ] **Step 3: Run harness**

Run: `pnpm run harness:check`

Expected: PASS with a short summary of checked paths/scripts.

- [ ] **Step 4: Commit**

```bash
git add harness docs/04-design/Acceptance-Matrix.md
git commit -m "chore: add baseline harness gates"
```

---

## Phase 2: Make Host Adapter Tests Deterministic

### Task 2.1: Fix Startup Workspace Env Drift

**Files:**
- Modify: `apps/host-adapter/src/startup.ts`
- Modify: `apps/host-adapter/src/__tests__/startup.test.ts`

- [ ] **Step 1: Write failing test for env resolution**

Add or update a test asserting that `BLACKBOARD_WORKER_WORKSPACE` determines `sessions/startup-temp`.

Run: `pnpm --filter @blackboard/host-adapter test -- startup.test.ts`

Expected before implementation: failure if the test still sets only `BLACKBOARD_WORKSPACE_ROOT`.

- [ ] **Step 2: Update tests**

Change `withWorkspace()` in `startup.test.ts` to set `BLACKBOARD_WORKER_WORKSPACE`, not `BLACKBOARD_WORKSPACE_ROOT`.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @blackboard/host-adapter test -- startup.test.ts`

Expected: all startup tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/__tests__/startup.test.ts apps/host-adapter/src/startup.ts
git commit -m "test: make adapter startup workspace deterministic"
```

### Task 2.2: Fix Runtime Host Config Dependency in Tests

**Files:**
- Modify: `apps/host-adapter/src/runtimeHost.ts`
- Modify: `apps/host-adapter/src/__tests__/runtimeHost.test.ts`

- [ ] **Step 1: Add temp config helper in tests**

In `runtimeHost.test.ts`, create a temp `blackboard-worker.toml`:

```toml
sandbox_mode = "workspace-write"
developer_instructions = """
You are a blackboard worker for tests.
"""
```

Pass it through `new CodexAppServerHost({ workerConfigPath, spawnProcess })`.

- [ ] **Step 2: Preserve production behavior**

Keep `runtimeHost.ts` production lookup:

- repo `.codex/agents/blackboard-worker.toml`
- global `~/.codex/agents/blackboard-worker.toml`
- explicit `workerConfigPath`

Do not silently invent config in production.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @blackboard/host-adapter test`

Expected: all host-adapter tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/host-adapter/src/runtimeHost.ts apps/host-adapter/src/__tests__/runtimeHost.test.ts
git commit -m "test: isolate runtime host config"
```

---

## Phase 3: Fix Review Settlement Semantics

### Task 3.1: Add Regression Tests for Mixed Accept/Reject

**Files:**
- Modify: `apps/backend/src/__tests__/reviewSettlement.test.ts`
- Modify: `apps/frontend/src/test/sessionSelectors.test.ts` or create focused fixture test if needed

- [ ] **Step 1: Backend failing test**

Add a test:

1. create a snapshot with two pending changes;
2. reject the first change;
3. accept all remaining;
4. assert final content contains only the second accepted change and preserves base text for the rejected first change.

Run: `pnpm test:backend -- reviewSettlement.test.ts`

Expected before fix: FAIL because bulk accept applies full `candidateContent`.

- [ ] **Step 2: Frontend fixture failing test**

Add the same scenario against `apps/frontend/src/app/sessionModel.ts` fixture settlement.

Run: `pnpm --filter @blackboard/frontend test -- src/test`

Expected before fix: FAIL if frontend fixture logic mirrors the backend bug.

- [ ] **Step 3: Commit tests**

```bash
git add apps/backend/src/__tests__/reviewSettlement.test.ts apps/frontend/src/test
git commit -m "test: cover mixed review settlement"
```

### Task 3.2: Implement Pending-Only Bulk Settlement

**Files:**
- Modify: `apps/backend/src/sessionModel.ts`
- Modify: `apps/frontend/src/app/sessionModel.ts`

- [ ] **Step 1: Fix backend `resolveAllReviewChangesWithSettlement`**

Replace the `status === "accepted" ? candidateContent : currentContent` shortcut. Apply each pending change to the current document in order:

```ts
let nextDocumentState = {
  currentContent: snapshot.currentContent,
  documentUnits: snapshot.documentUnits,
};

if (status === "accepted") {
  for (const change of pending) {
    nextDocumentState = applyAcceptedChange(
      nextDocumentState.currentContent,
      nextDocumentState.documentUnits,
      change,
    );
  }
}
```

- [ ] **Step 2: Apply same logic to frontend fixture model**

Keep fixture mode behavior consistent with backend.

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm test:backend
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/sessionModel.ts apps/frontend/src/app/sessionModel.ts
git commit -m "fix: preserve rejected changes during bulk review settlement"
```

---

## Phase 4: Make Comment Anchors Precise

### Task 4.1: Extend Schema and Commands

**Files:**
- Modify: `packages/schema/src/index.ts`
- Modify: `apps/frontend/src/app/commands.ts`
- Modify: `apps/backend/src/sessionModel.ts`

- [ ] **Step 1: Add schema expectations**

Ensure `BulletCommentCreatePayload` includes:

```ts
anchorStartOffset?: number;
anchorEndOffset?: number;
```

These fields already exist on `CommentBullet`; the command payload must carry them too.

- [ ] **Step 2: Update frontend command**

Change `createCommentCommand` signature to:

```ts
export function createCommentCommand(
  apiClient: ApiClient,
  unitId: string,
  anchorText: string,
  content: string,
  anchorStartOffset?: number,
  anchorEndOffset?: number,
)
```

Send both offsets in the payload.

- [ ] **Step 3: Update backend model**

Change `createDocumentUnitComment()` to accept and persist offsets.

- [ ] **Step 4: Add unit tests**

Add backend test that creating a comment with offsets returns a bullet with the same offsets.

Run: `pnpm test:backend -- sessionModel.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/index.ts apps/frontend/src/app/commands.ts apps/backend/src/sessionModel.ts apps/backend/src/__tests__/sessionModel.test.ts
git commit -m "feat: carry precise comment anchors through protocol"
```

### Task 4.2: Enforce Same-Unit Selection in UI

**Files:**
- Modify: `apps/frontend/src/components/ReadingSurface.tsx`
- Modify: `apps/frontend/src/test` if component-level test utilities exist; otherwise cover through e2e later

- [ ] **Step 1: Implement selection validation**

In `handlePointerUp`, find both start and end unit elements:

```ts
const startUnit = startNode?.closest<HTMLElement>("[data-unit-id]");
const endNode =
  range.endContainer.nodeType === Node.ELEMENT_NODE
    ? (range.endContainer as Element)
    : range.endContainer.parentElement;
const endUnit = endNode?.closest<HTMLElement>("[data-unit-id]");

if (!startUnit || !endUnit || startUnit.dataset.unitId !== endUnit.dataset.unitId) {
  return;
}
```

- [ ] **Step 2: Compute offsets**

For V1 text units, calculate offsets against the unit visible text. If exact DOM offset mapping is too risky, use first occurrence of selected text in the target unit text and document the limitation:

```ts
const unit = documentUnits.find((candidate) => candidate.unitId === unitId);
const unitText = "text" in unit ? unit.text : unit.markdown;
const anchorStartOffset = unitText.indexOf(anchorText);
const anchorEndOffset =
  anchorStartOffset >= 0 ? anchorStartOffset + anchorText.length : undefined;
```

Only pass offsets when `anchorStartOffset >= 0`.

- [ ] **Step 3: Verify manual behavior**

Run: `pnpm dev` and select text inside one paragraph.

Expected: comment popover opens and created bullet has offsets in snapshot.

Try cross-unit selection.

Expected: no comment popover.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/ReadingSurface.tsx apps/frontend/src/app/sessionStore.ts
git commit -m "feat: constrain comments to single document units"
```

---

## Phase 5: Create Shared Document and Review Packages

### Task 5.1: Extract Shared Document Model

**Files:**
- Create: `packages/document-model/package.json`
- Create: `packages/document-model/tsconfig.json`
- Create: `packages/document-model/src/index.ts`
- Modify: `apps/backend/src/markdownDocument.ts`
- Modify: `apps/frontend/src/app/markdownDocument.ts`
- Modify: `apps/backend/package.json`
- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Create package**

Package name: `@blackboard/document-model`.

It should depend on `@blackboard/schema` only.

- [ ] **Step 2: Move shared implementation**

Move the canonical implementation from backend `markdownDocument.ts` into `packages/document-model/src/index.ts`.

Export:

- `documentUnitsFromMarkdown`
- `replaceDocumentUnitMarkdown`
- `removeUnitFromContent`
- `applyChangeToMarkdown`
- `findUnitAtSourceOffset`
- `selectDocumentTitle`
- parsing helper exports currently used by tests

- [ ] **Step 3: Re-export in app files**

Backend `apps/backend/src/markdownDocument.ts`:

```ts
export {
  applyChangeToMarkdown,
  documentUnitsFromMarkdown,
  findUnitAtSourceOffset,
  removeUnitFromContent,
  replaceDocumentUnitMarkdown,
  selectDocumentTitle,
} from "@blackboard/document-model";
```

Frontend `apps/frontend/src/app/markdownDocument.ts` should do the same, plus preserve any test-used helper aliases if needed.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test
pnpm test:backend
pnpm --filter @blackboard/runtime build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/document-model apps/backend apps/frontend package.json pnpm-lock.yaml
git commit -m "refactor: share markdown document model"
```

### Task 5.2: Extract Shared Review Model

**Files:**
- Create: `packages/review-model/package.json`
- Create: `packages/review-model/tsconfig.json`
- Create: `packages/review-model/src/index.ts`
- Modify: `apps/backend/src/sessionModel.ts`
- Modify: `apps/frontend/src/app/sessionModel.ts`
- Modify: `apps/backend/package.json`
- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Create package**

Package name: `@blackboard/review-model`.

It should depend on:

- `@blackboard/schema`
- `@blackboard/document-model`

- [ ] **Step 2: Extract pure helpers**

Export:

- `applyAcceptedChange`
- `applyAcceptedPendingChanges`
- `markReviewChanges`
- `hasPendingChanges`
- `acceptedChanges`

Keep session-specific version creation in backend/frontend app models for now.

- [ ] **Step 3: Use shared helpers**

Update backend and frontend fixture session models to call shared functions.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test
pnpm test:backend
pnpm --filter @blackboard/runtime build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/review-model apps/backend apps/frontend pnpm-lock.yaml
git commit -m "refactor: share review settlement helpers"
```

---

## Phase 6: Align Protocol Types and Events

### Task 6.1: Align `SessionStatus`

**Files:**
- Modify: `packages/schema/src/index.ts`
- Modify: `apps/frontend/src/types/blackboard.ts`
- Modify: tests referencing status

- [ ] **Step 1: Remove backend-only drift**

Change shared schema:

```ts
export type SessionStatus =
  | "active"
  | "proceeding"
  | "reviewing"
  | "closed";
```

Keep frontend `FrontendViewMode = "workspace" | "history_preview"`.

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck:all`

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/schema/src/index.ts apps/frontend/src/types/blackboard.ts
git commit -m "fix: align session status with protocol"
```

### Task 6.2: Fix `working_set.rebased` Event Payload

**Files:**
- Modify: `apps/backend/src/routes.ts`
- Modify: `apps/frontend/src/app/eventReducer.ts`
- Modify: `apps/frontend/src/test/eventReducer.test.ts`
- Modify: `apps/backend/src/__tests__/routes.test.ts`

- [ ] **Step 1: Add reducer regression test**

Test that receiving `working_set.rebased` with a snapshot replaces the local snapshot and clears history preview state through `sessionStore`.

- [ ] **Step 2: Broadcast full snapshot**

Change backend restore route:

```ts
broadcastAndDispatch(sessionId, "working_set.rebased", next);
broadcast(sessionId, "session.snapshot", next);
```

- [ ] **Step 3: Make reducer defensive**

In frontend reducer, if payload is missing or malformed, keep current snapshot and rely on following `session.snapshot`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test
pnpm test:backend
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes.ts apps/frontend/src/app/eventReducer.ts apps/frontend/src/test/eventReducer.test.ts apps/backend/src/__tests__/routes.test.ts
git commit -m "fix: send snapshot with working set rebase events"
```

---

## Phase 7: Stabilize E2E and Close Flow

### Task 7.1: Make Playwright Port Handling Practical

**Files:**
- Modify: `apps/frontend/playwright.config.ts`

- [ ] **Step 1: Enable backend reuse**

Set backend webServer `reuseExistingServer: true`.

Keep frontend strict port false or choose a fixed unused test port.

- [ ] **Step 2: Run e2e**

Run: `pnpm e2e`

Expected: no early abort due existing backend on `127.0.0.1:3001`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/playwright.config.ts
git commit -m "test: allow e2e to reuse backend server"
```

### Task 7.2: Add Close Flow Guardrails

**Files:**
- Modify: `apps/frontend/src/components/BlackboardPage.tsx`
- Modify: `apps/frontend/src/components/PageChrome.tsx`
- Modify: `apps/backend/src/routes.ts`
- Test: frontend reducer/store tests or e2e flow

- [ ] **Step 1: Define close states**

Keep `session.request_close` as request-only. Add frontend local state:

- `idle`
- `confirming`
- `requested`

- [ ] **Step 2: Add confirmation when unsaved work exists**

Before calling `session.closeSession()`, check:

- `editingUnitId !== null`: refuse and keep user in editor.
- `activeBullets.length > 0` or `currentVersionId !== baseVersionId`: show confirm UI.

- [ ] **Step 3: Add timeout/failure recovery**

If page remains closing for 60 seconds, show a recoverable message and allow returning to active view.

- [ ] **Step 4: Run e2e**

Add/extend Playwright smoke:

- start demo;
- edit unit;
- attempt close;
- verify confirmation appears;
- cancel and continue editing.

Run: `pnpm e2e`

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/BlackboardPage.tsx apps/frontend/src/components/PageChrome.tsx apps/frontend/tests/e2e
git commit -m "feat: add close flow guardrails"
```

---

## Phase 8: Final Gate and Documentation

### Task 8.1: Update Runbook and Acceptance Matrix

**Files:**
- Modify: `docs/04-design/Acceptance-Matrix.md`
- Modify: `docs/05-agent/MVP-Runbook.md`
- Modify: `docs/Developer-Guide.md`

- [ ] **Step 1: Update command table**

Document final expected commands:

```bash
pnpm install
pnpm run harness:check
pnpm run test:all
pnpm run typecheck:all
pnpm run build:all
pnpm e2e
```

- [ ] **Step 2: Record known gaps**

If real Codex validation has not been manually run, mark it as `known-gap` or `blocker`; do not imply automated tests prove it.

- [ ] **Step 3: Commit**

```bash
git add docs/04-design/Acceptance-Matrix.md docs/05-agent/MVP-Runbook.md docs/Developer-Guide.md
git commit -m "docs: update mvp acceptance workflow"
```

### Task 8.2: Run Final Verification

**Files:**
- No source edits unless failures require fixes.

- [ ] **Step 1: Run full verification**

```bash
pnpm run harness:check
pnpm run test:all
pnpm run typecheck:all
pnpm run build:all
pnpm e2e
```

Expected:

- harness passes;
- frontend tests pass;
- backend tests pass;
- host-adapter tests pass;
- runtime build passes;
- e2e does not fail on port reuse.

- [ ] **Step 2: Record result**

Append a short dated verification note to `docs/05-agent/MVP-Runbook.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/05-agent/MVP-Runbook.md
git commit -m "docs: record mvp refactor verification"
```

---

## Execution Order

Recommended order:

1. Phase 2 first if the team wants immediate red-to-green test repair.
2. Phase 3 next because it fixes a user-visible correctness bug.
3. Phase 1 before declaring any acceptance progress.
4. Phase 4 and Phase 6 to align protocol semantics.
5. Phase 5 after tests are green, because shared extraction is safer with regression coverage.
6. Phase 7 and Phase 8 at the end.

For most teams, execute in numbered order unless host-adapter test failures are blocking CI today.

## Success Criteria

The refactor is complete when:

- `pnpm run harness:check` exists and passes.
- `pnpm run test:all` passes.
- `pnpm run typecheck:all` passes.
- `pnpm run build:all` passes.
- `pnpm e2e` runs without port-collision aborts.
- Backend and frontend fixture review settlement both preserve rejected changes.
- Comment bullets include same-unit anchor offsets.
- Markdown document parsing has one shared implementation.
- `SessionStatus` no longer mixes backend lifecycle and frontend view mode.

