# Agora Published CLI + Skill E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Blackboard runtime into a publishable `Agora` npm CLI plus globally installed Codex skill/config path that supports real end-to-end collaboration testing outside the repo.

**Architecture:** Keep the existing `packages/blackboard-runtime` folder as the implementation home, but convert it into the public `agora` npm package. Preserve the current embedded backend/frontend/host-adapter architecture, add explicit embedded Codex asset templates, layer a higher-level public command surface (`agora`, `init-codex`, strict `doctor`) over the current runtime commands, and add published-install smoke coverage plus a human E2E runbook.

**Tech Stack:** TypeScript, Node.js, pnpm workspaces, Vitest, Codex skills, Codex agent TOML configs, npm global installs.

---

## Scope

Primary outcomes:

- The existing runtime package becomes publishable as the public npm package `agora`.
- Global binaries prefer `agora`, while `blackboard-runtime` remains as a legacy alias.
- Canonical Codex skill and worker-config templates are embedded into the published CLI package.
- `agora init-codex` can install or refresh the global worker config and emit canonical skill-install guidance.
- `agora doctor` performs strict compatibility checks against the globally installed skill/config and runtime prerequisites.
- A published-install smoke path validates packaging and installation outside the repo.
- Docs explain the Agora product name while acknowledging internal `whiteBoard` / `blackboard` naming.

Non-goals:

- Renaming every internal `@blackboard/*` package.
- Renaming every protocol type, route, or source file.
- Redesigning the backend/host-adapter collaboration protocol.
- Adding a private manifest format to skills.
- Adding custom schema fields to `blackboard-worker.toml`.

## File Structure

Create:

- `packages/blackboard-runtime/src/publicMetadata.ts` - single source of truth for public product name, binary names, Codex asset paths, and install guidance text.
- `packages/blackboard-runtime/src/codexAssets.ts` - load embedded skill/config templates, install the worker config into Codex home, and compare installed files strictly.
- `packages/blackboard-runtime/src/doctor.ts` - high-level doctor checks and structured repair hints.
- `packages/blackboard-runtime/src/__tests__/publicMetadata.test.ts` - validates public command metadata and help surface.
- `packages/blackboard-runtime/src/__tests__/codexAssets.test.ts` - validates install/compare helpers with temp Codex homes.
- `packages/blackboard-runtime/src/__tests__/doctor.test.ts` - validates strict doctor results for missing, stale, and valid installs.
- `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md` - canonical published skill template copied into the package.
- `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/agents/openai.yaml` - canonical published skill agent template.
- `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml` - canonical published worker config template.
- `packages/blackboard-runtime/README.md` - npm package README focused on published install and E2E usage.
- `harness/scripts/smoke-agora-published-install.mjs` - packs the CLI, installs it into a temp global prefix, prepares temp Codex home assets, and runs smoke checks.
- `docs/05-agent/Agora-Published-E2E-Runbook.md` - manual runbook for real Codex-side installation and collaboration testing.

Modify:

- `package.json` - switch runtime-related root scripts to path filters and add a published-install smoke entrypoint.
- `packages/blackboard-runtime/package.json` - make the package publishable as `agora`, add `agora` and legacy `blackboard-runtime` bins, add repository metadata, add Vitest, and expose package docs.
- `packages/blackboard-runtime/src/cli.ts` - register `init-codex`, wrap strict doctor, swap user-visible strings to Agora, and delegate to helper modules.
- `packages/blackboard-runtime/src/buildRuntimeAssets.ts` - embed the canonical Codex skill/config assets into `dist`.
- `.agents/skills/blackboard-collaboration/SKILL.md` - update the public command examples from `blackboard-runtime` to `agora` and align wording to the published flow.
- `.agents/skills/blackboard-collaboration/agents/openai.yaml` - align display strings to Agora naming where user-visible.
- `.codex/agents/blackboard-worker.toml` - align command examples to `agora` while keeping standard TOML structure.
- `README.md` - document published install flow and the naming boundary between Agora and internal Blackboard names.
- `apps/frontend/index.html` - prefer the public product name in the page title.
- `docs/Developer-Guide.md` - point developers at the new public install and smoke commands where relevant.

---

## Phase 1: Make The Runtime Package Publishable As `agora`

### Task 1.1: Add Runtime Package Test Coverage For Public Surface

**Files:**
- Modify: `packages/blackboard-runtime/package.json`
- Create: `packages/blackboard-runtime/src/__tests__/publicMetadata.test.ts`

- [ ] **Step 1: Add failing runtime package test support**

Update `packages/blackboard-runtime/package.json` to add:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "3.1.4"
  }
}
```

- [ ] **Step 2: Write a failing public metadata test**

Create `packages/blackboard-runtime/src/__tests__/publicMetadata.test.ts` with coverage for:

```ts
import { describe, expect, it } from "vitest";
import { PRIMARY_BINARY, LEGACY_BINARY, PRODUCT_NAME } from "../publicMetadata.js";

describe("public metadata", () => {
  it("prefers Agora as the public product name", () => {
    expect(PRODUCT_NAME).toBe("Agora");
    expect(PRIMARY_BINARY).toBe("agora");
    expect(LEGACY_BINARY).toBe("blackboard-runtime");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter ./packages/blackboard-runtime test -- publicMetadata.test.ts`

Expected: FAIL because `publicMetadata.ts` does not exist yet.

- [ ] **Step 4: Commit**

```bash
git add packages/blackboard-runtime/package.json packages/blackboard-runtime/src/__tests__/publicMetadata.test.ts
git commit -m "test: add public runtime metadata coverage"
```

### Task 1.2: Publish The Existing Runtime Package As `agora`

**Files:**
- Create: `packages/blackboard-runtime/src/publicMetadata.ts`
- Modify: `packages/blackboard-runtime/package.json`
- Modify: `package.json`
- Modify: `packages/blackboard-runtime/src/cli.ts`

- [ ] **Step 1: Add public metadata constants**

Create `packages/blackboard-runtime/src/publicMetadata.ts`:

```ts
export const PRODUCT_NAME = "Agora";
export const PRIMARY_BINARY = "agora";
export const LEGACY_BINARY = "blackboard-runtime";
export const GLOBAL_SKILL_NAME = "blackboard-collaboration";
export const GLOBAL_WORKER_CONFIG_NAME = "blackboard-worker.toml";
```

- [ ] **Step 2: Make the runtime package publishable**

Update `packages/blackboard-runtime/package.json` to:

```json
{
  "name": "@xiesunsun/agora",
  "private": false,
  "version": "0.1.0",
  "files": ["dist", "README.md"],
  "bin": {
    "agora": "dist/cli.js",
    "blackboard-runtime": "dist/cli.js"
  }
}
```

Also add real `repository`, `homepage`, and `bugs` fields pointing at the eventual public GitHub repo.

- [ ] **Step 3: Decouple root scripts from the package name**

Change root scripts that currently use `--filter @blackboard/runtime` to use the package path instead:

```json
{
  "scripts": {
    "build:all": "pnpm --filter ./packages/blackboard-runtime build",
    "runtime": "pnpm --filter ./packages/blackboard-runtime start",
    "runtime:dev": "pnpm --filter ./packages/blackboard-runtime dev"
  }
}
```

- [ ] **Step 4: Update CLI help and info output to prefer Agora**

In `packages/blackboard-runtime/src/cli.ts`, replace user-visible text such as:

- `blackboard-runtime — Blackboard collaboration runtime CLI`
- `blackboard-runtime info`
- `blackboard-runtime up`

with Agora-first text while keeping the command behavior unchanged.

- [ ] **Step 5: Run tests and pack verification**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime test -- publicMetadata.test.ts
pnpm --filter ./packages/blackboard-runtime pack --pack-destination /tmp/agora-pack-test
tar -tf /tmp/agora-pack-test/xiesunsun-agora-0.1.0.tgz | rg "dist/cli.js|README.md|package.json"
```

Expected:

- `publicMetadata.test.ts` passes
- tarball name is `xiesunsun-agora-0.1.0.tgz`
- tarball contains `dist/cli.js`

- [ ] **Step 6: Commit**

```bash
git add package.json packages/blackboard-runtime/package.json packages/blackboard-runtime/src/publicMetadata.ts packages/blackboard-runtime/src/cli.ts
git commit -m "feat: publish runtime as agora"
```

---

## Phase 2: Embed Canonical Codex Skill And Worker Templates

### Task 2.1: Add Canonical Embedded Codex Assets

**Files:**
- Create: `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md`
- Create: `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/agents/openai.yaml`
- Create: `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml`
- Modify: `.agents/skills/blackboard-collaboration/SKILL.md`
- Modify: `.agents/skills/blackboard-collaboration/agents/openai.yaml`
- Modify: `.codex/agents/blackboard-worker.toml`

- [ ] **Step 1: Align repo source templates to the Agora command surface**

Update the repo-local skill and worker config so public-facing command examples use:

```text
agora start-session --handoff-file {handoffFile}
agora create-session ...
agora get-snapshot ...
agora mark-bullet-ready ...
agora submit-review-candidate ...
agora close-session ...
```

while preserving the existing standard file formats.

- [ ] **Step 2: Copy the canonical templates into package assets**

Copy the repo-local canonical skill and worker config into:

- `packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/...`
- `packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml`

Do not introduce a private manifest file.

- [ ] **Step 3: Run a diff check**

Run:

```bash
diff -u .agents/skills/blackboard-collaboration/SKILL.md packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/SKILL.md
diff -u .agents/skills/blackboard-collaboration/agents/openai.yaml packages/blackboard-runtime/assets/codex/skills/blackboard-collaboration/agents/openai.yaml
diff -u .codex/agents/blackboard-worker.toml packages/blackboard-runtime/assets/codex/agents/blackboard-worker.toml
```

Expected: no diff output.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/blackboard-collaboration .codex/agents/blackboard-worker.toml packages/blackboard-runtime/assets/codex
git commit -m "feat: add canonical Agora Codex asset templates"
```

### Task 2.2: Embed Codex Assets Into `dist` And Add Helper APIs

**Files:**
- Create: `packages/blackboard-runtime/src/codexAssets.ts`
- Create: `packages/blackboard-runtime/src/__tests__/codexAssets.test.ts`
- Modify: `packages/blackboard-runtime/src/buildRuntimeAssets.ts`

- [ ] **Step 1: Write a failing codex-assets test**

Create `packages/blackboard-runtime/src/__tests__/codexAssets.test.ts` covering:

```ts
import { describe, expect, it } from "vitest";
import { getEmbeddedWorkerTemplate } from "../codexAssets.js";

describe("embedded codex assets", () => {
  it("loads the embedded worker template", () => {
    expect(getEmbeddedWorkerTemplate()).toContain('name = "blackboard-worker"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter ./packages/blackboard-runtime test -- codexAssets.test.ts`

Expected: FAIL because `codexAssets.ts` does not exist yet.

- [ ] **Step 3: Implement the asset loader and embed assets into dist**

Create helper APIs in `packages/blackboard-runtime/src/codexAssets.ts`:

```ts
export function getEmbeddedWorkerTemplate(): string;
export function getEmbeddedSkillFiles(): Array<{ relativePath: string; content: string }>;
export function resolveCodexHome(explicit?: string): string;
```

Update `packages/blackboard-runtime/src/buildRuntimeAssets.ts` to copy:

- `assets/codex/skills/...` -> `dist/codex/skills/...`
- `assets/codex/agents/...` -> `dist/codex/agents/...`

- [ ] **Step 4: Re-run tests and build**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime test -- codexAssets.test.ts
pnpm --filter ./packages/blackboard-runtime build
find packages/blackboard-runtime/dist/codex -maxdepth 4 -type f | sort
```

Expected:

- `codexAssets.test.ts` passes
- `dist/codex/skills/blackboard-collaboration/...` exists
- `dist/codex/agents/blackboard-worker.toml` exists

- [ ] **Step 5: Commit**

```bash
git add packages/blackboard-runtime/src/codexAssets.ts packages/blackboard-runtime/src/__tests__/codexAssets.test.ts packages/blackboard-runtime/src/buildRuntimeAssets.ts
git commit -m "feat: embed codex assets into runtime dist"
```

---

## Phase 3: Implement `agora init-codex`

### Task 3.1: Install Or Refresh The Global Worker Config

**Files:**
- Modify: `packages/blackboard-runtime/src/cli.ts`
- Modify: `packages/blackboard-runtime/src/codexAssets.ts`
- Modify: `packages/blackboard-runtime/src/__tests__/codexAssets.test.ts`

- [ ] **Step 1: Extend the failing tests for install behavior**

Add a temp-home install test:

```ts
it("installs blackboard-worker.toml into a target Codex home", () => {
  // arrange temp dir
  // call installWorkerConfig({ codexHome, force: true })
  // assert ~/.codex/agents/blackboard-worker.toml content matches template
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter ./packages/blackboard-runtime test -- codexAssets.test.ts`

Expected: FAIL because no install helper exists yet.

- [ ] **Step 3: Implement install helper and CLI command**

Add helper(s):

```ts
export function installWorkerConfig(options: {
  codexHome?: string;
  force?: boolean;
}): { installedPath: string; overwritten: boolean };
```

Register a new command in `packages/blackboard-runtime/src/cli.ts`:

```text
agora init-codex [--codex-home <path>] [--force]
```

Behavior:

- creates `~/.codex/agents` if missing
- installs the canonical embedded worker config
- refuses to overwrite unless `--force`
- prints the installed path
- prints canonical skill-install guidance for `blackboard-collaboration`

- [ ] **Step 4: Re-run tests and manual command validation**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime test -- codexAssets.test.ts
node packages/blackboard-runtime/dist/cli.js init-codex --codex-home /tmp/agora-codex-home --force
test -f /tmp/agora-codex-home/agents/blackboard-worker.toml
```

Expected:

- tests pass
- the worker config is written under the provided Codex home

- [ ] **Step 5: Commit**

```bash
git add packages/blackboard-runtime/src/cli.ts packages/blackboard-runtime/src/codexAssets.ts packages/blackboard-runtime/src/__tests__/codexAssets.test.ts
git commit -m "feat: add agora init-codex"
```

---

## Phase 4: Implement Strict `agora doctor`

### Task 4.1: Add Strict Doctor Result Modeling

**Files:**
- Create: `packages/blackboard-runtime/src/doctor.ts`
- Create: `packages/blackboard-runtime/src/__tests__/doctor.test.ts`
- Modify: `packages/blackboard-runtime/src/cli.ts`

- [ ] **Step 1: Write failing doctor tests**

Create `packages/blackboard-runtime/src/__tests__/doctor.test.ts` covering at least:

```ts
it("fails when the global skill is missing", async () => {});
it("fails when the worker config content diverges from the embedded template", async () => {});
it("passes when skill and worker config match the embedded templates", async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./packages/blackboard-runtime test -- doctor.test.ts`

Expected: FAIL because `doctor.ts` does not exist yet.

- [ ] **Step 3: Implement strict doctor helpers**

Create structured helpers such as:

```ts
export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail?: string;
  repairHint?: string;
}

export async function runPublishedDoctor(options: {
  codexHome?: string;
  backendUrl?: string;
  port?: string;
}): Promise<{ ok: boolean; checks: DoctorCheck[] }>;
```

Required checks:

- embedded backend exists
- embedded adapter exists
- embedded frontend exists
- embedded skill templates exist
- global skill files exist at expected paths
- global skill contents strictly match embedded canonical files
- global worker config exists
- global worker config strictly matches the embedded canonical template
- worker workspace parent path is valid
- if a runtime is already listening, it must be a compatible runtime

- [ ] **Step 4: Replace the current doctor path in the CLI**

Update `packages/blackboard-runtime/src/cli.ts` so `doctor` delegates to `runPublishedDoctor()` and still exits non-zero on failure.

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter ./packages/blackboard-runtime test -- doctor.test.ts
pnpm --filter ./packages/blackboard-runtime test
```

Expected:

- `doctor.test.ts` passes
- the runtime package test suite passes

- [ ] **Step 6: Commit**

```bash
git add packages/blackboard-runtime/src/doctor.ts packages/blackboard-runtime/src/__tests__/doctor.test.ts packages/blackboard-runtime/src/cli.ts
git commit -m "feat: add strict agora doctor"
```

### Task 4.2: Support Testable Codex-Home Overrides And Repair Guidance

**Files:**
- Modify: `packages/blackboard-runtime/src/doctor.ts`
- Modify: `packages/blackboard-runtime/src/codexAssets.ts`
- Modify: `packages/blackboard-runtime/src/cli.ts`

- [ ] **Step 1: Add explicit override support**

Support:

- `--codex-home <path>` for `init-codex`
- `--codex-home <path>` for `doctor`

so published-install smoke tests do not mutate the real user home.

- [ ] **Step 2: Add clear repair hints**

Ensure failed checks return repair guidance such as:

- rerun `agora init-codex --force`
- reinstall the `blackboard-collaboration` skill
- rerun with `--debug`
- stop the incompatible runtime on the configured port

- [ ] **Step 3: Verify JSON output remains structured**

Run:

```bash
node packages/blackboard-runtime/dist/cli.js doctor --codex-home /tmp/agora-empty-home | jq .
```

Expected: a machine-readable JSON object with `ok: false`, named checks, and repair hints.

- [ ] **Step 4: Commit**

```bash
git add packages/blackboard-runtime/src/doctor.ts packages/blackboard-runtime/src/codexAssets.ts packages/blackboard-runtime/src/cli.ts
git commit -m "feat: add doctor repair guidance"
```

---

## Phase 5: Finalize Public Naming And Published Docs

### Task 5.1: Align User-Visible Skill, Worker, And Page Naming

**Files:**
- Modify: `.agents/skills/blackboard-collaboration/SKILL.md`
- Modify: `.agents/skills/blackboard-collaboration/agents/openai.yaml`
- Modify: `.codex/agents/blackboard-worker.toml`
- Modify: `apps/frontend/index.html`

- [ ] **Step 1: Update user-visible product labels**

Replace obvious user-facing `Blackboard` labels with `Agora` where they describe the product rather than internal roles.

Keep internal identifiers such as:

- `blackboard-worker`
- `blackboard-collaboration`
- `@blackboard/*`

unless changing them is required for correctness.

- [ ] **Step 2: Validate the frontend title**

Run:

```bash
rg -n "<title>|Agora|Blackboard" apps/frontend/index.html .agents/skills/blackboard-collaboration .codex/agents/blackboard-worker.toml
```

Expected: user-facing product mentions prefer `Agora`, while compatibility identifiers remain intact.

- [ ] **Step 3: Commit**

```bash
git add .agents/skills/blackboard-collaboration .codex/agents/blackboard-worker.toml apps/frontend/index.html
git commit -m "docs: align public naming to Agora"
```

### Task 5.2: Publish Install And E2E Documentation

**Files:**
- Create: `packages/blackboard-runtime/README.md`
- Create: `docs/05-agent/Agora-Published-E2E-Runbook.md`
- Modify: `README.md`
- Modify: `docs/Developer-Guide.md`

- [ ] **Step 1: Write the npm package README**

Document:

- global install command
- `agora init-codex`
- skill-install path
- `agora doctor`
- minimal Codex usage example

- [ ] **Step 2: Write the manual runbook**

Create `docs/05-agent/Agora-Published-E2E-Runbook.md` with:

1. clean global install
2. global skill install
3. `agora init-codex`
4. `agora doctor`
5. open Codex in arbitrary folder
6. invoke skill
7. edit/comment/proceed/review/close
8. verify summary returns to the same thread

- [ ] **Step 3: Update top-level docs**

Ensure the root `README.md` explains:

- product name is `Agora`
- repo name remains `whiteBoard`
- internal package namespace remains `@blackboard/*`
- published install path uses `agora`

- [ ] **Step 4: Verify link coverage**

Run:

```bash
rg -n "agora init-codex|agora doctor|npm install -g @xiesunsun/agora|whiteBoard|@blackboard" README.md packages/blackboard-runtime/README.md docs/05-agent/Agora-Published-E2E-Runbook.md docs/Developer-Guide.md
```

Expected: the published install flow is documented consistently.

- [ ] **Step 5: Commit**

```bash
git add packages/blackboard-runtime/README.md docs/05-agent/Agora-Published-E2E-Runbook.md README.md docs/Developer-Guide.md
git commit -m "docs: add Agora published install runbook"
```

---

## Phase 6: Add Published-Install Smoke Coverage

### Task 6.1: Simulate A Clean Global Install In CI-Friendly Temp Directories

**Files:**
- Create: `harness/scripts/smoke-agora-published-install.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a root smoke script**

Update root `package.json`:

```json
{
  "scripts": {
    "smoke:agora": "node harness/scripts/smoke-agora-published-install.mjs"
  }
}
```

- [ ] **Step 2: Implement the smoke script**

The script should:

1. pack the current `agora` package
2. install it globally into a temp prefix
3. create a temp Codex home
4. copy the canonical skill files into the temp Codex home
5. run `agora init-codex --codex-home <temp> --force`
6. run `agora doctor --codex-home <temp>`

Pseudo-structure:

```js
await exec("pnpm --filter ./packages/blackboard-runtime pack --pack-destination ...");
await exec("npm install -g ...", { env: { npm_config_prefix: tempPrefix } });
await copySkillFixture(tempCodexHome);
await exec(`${tempPrefix}/bin/agora init-codex --codex-home ${tempCodexHome} --force`);
await exec(`${tempPrefix}/bin/agora doctor --codex-home ${tempCodexHome}`);
```

- [ ] **Step 3: Run the smoke script**

Run: `pnpm run smoke:agora`

Expected:

- pack succeeds
- temp global install succeeds
- `init-codex` succeeds
- `doctor` returns success in the temp environment

- [ ] **Step 4: Commit**

```bash
git add harness/scripts/smoke-agora-published-install.mjs package.json
git commit -m "test: add published install smoke coverage"
```

---

## Phase 7: Final Verification

### Task 7.1: Run The Full Local Verification Matrix

**Files:**
- No file changes expected unless verification exposes regressions

- [ ] **Step 1: Run runtime package tests**

Run: `pnpm --filter ./packages/blackboard-runtime test`

Expected: PASS

- [ ] **Step 2: Rebuild the embedded runtime**

Run: `pnpm --filter ./packages/blackboard-runtime build`

Expected: PASS

- [ ] **Step 3: Run repo-wide smoke commands that exercise the new public flow**

Run:

```bash
pnpm run smoke:agora
pnpm test:backend
pnpm --filter @blackboard/host-adapter test
```

Expected: PASS

- [ ] **Step 4: Perform the manual published-style runbook once**

Follow `docs/05-agent/Agora-Published-E2E-Runbook.md` using:

- a real global install
- a real global skill install
- a real `agora doctor`
- a real Codex session

Expected: the full edit/comment/proceed/review/close loop completes and returns to the same main thread.

- [ ] **Step 5: Commit any verification-only doc adjustments**

```bash
git add docs/05-agent/Agora-Published-E2E-Runbook.md README.md packages/blackboard-runtime/README.md
git commit -m "docs: finalize Agora published verification steps"
```

---

## Notes For Execution

- Prefer exact-content comparison for strict skill/config compatibility in Phase 1. Do not invent custom skill manifests or TOML fields.
- Keep `blackboard-runtime` available as a legacy binary alias even after `agora` becomes the primary command.
- Use `--codex-home` overrides everywhere needed for automated smoke coverage so local user config is never mutated during tests.
- Do not touch the user's unrelated working tree changes while implementing this plan.
