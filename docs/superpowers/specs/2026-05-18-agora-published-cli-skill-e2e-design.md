# Agora Published CLI + Skill E2E Design

## Goal

Make Agora usable as a real externally installable Codex collaboration product by shipping:

- a globally installable npm CLI for runtime startup and diagnostics
- a globally installable Codex skill for main-agent session startup
- a globally discoverable `blackboard-worker` agent config
- a strict end-to-end validation path that matches real user installation and usage

The immediate objective is not a full internal rename. The immediate objective is a publishable and testable product slice that lets external users install Agora, invoke the skill in Codex, open a live collaboration session, and complete the full document collaboration loop.

## Context

The repository already contains most of the functional runtime pieces:

- `packages/blackboard-runtime` already exposes an installable CLI entrypoint
- `apps/host-adapter` can spawn a dedicated `blackboard-worker` and bridge the session lifecycle
- `.agents/skills/blackboard-collaboration` already describes the intended main-agent startup behavior
- the backend already exposes `/cli/*` routes for runtime-facing session operations

The current gap is productization rather than basic capability. Naming is inconsistent across user-visible and internal surfaces, the current doctor command is too runtime-local for external users, and the installation story still assumes repo context rather than formal published distribution.

## Non-Goals

This phase does not attempt to:

- rename all internal packages from `@blackboard/*`
- rename all domain types, file names, or protocol symbols
- redesign the collaboration protocol
- support multiple agent hosts beyond the current Codex path
- introduce a custom skill metadata format beyond standard Codex skill files
- introduce a custom TOML schema beyond standard worker config structure

## Product Surfaces

Phase 1 publishes and validates three distinct assets:

1. `Agora` CLI
2. `blackboard-collaboration` global skill
3. global `blackboard-worker.toml`

These assets must remain independently installable and understandable, but they must work together as one supported product path.

## Naming Strategy

### User-visible naming

All user-visible product surfaces should prefer `Agora`:

- npm package name
- global executable name
- CLI help text
- install docs
- doctor output
- startup and failure messages
- frontend page title where practical

### Internal compatibility naming

Phase 1 keeps existing internal names where changing them would expand scope too much:

- repository directory may remain `whiteBoard`
- workspace packages may remain `@blackboard/*`
- internal files, types, and protocol terms may keep `blackboard`

### Compatibility and migration rule

User-visible entrypoints must not require users to understand the old names. Internal old names remain an implementation detail. Documentation should explicitly explain:

- product name: `Agora`
- historical repo name: `whiteBoard`
- current internal package namespace: `@blackboard/*`

## Distribution Model

### CLI distribution

Agora should be published as a normal npm package intended for global installation via:

```bash
npm install -g @xiesunsun/agora
```

or

```bash
pnpm add -g agora
```

The globally installed executable should be `agora`.

The existing runtime functionality from `packages/blackboard-runtime` should be preserved, but the primary documented command surface should become `agora`, not `blackboard-runtime`.

### Skill distribution

The skill should remain a standard Codex skill, distributed through GitHub-installable skill files and installed globally into:

`~/.codex/skills/blackboard-collaboration`

No private manifest should be added just for Agora versioning. The skill must remain compatible with standard Codex skill expectations.

### Worker config distribution

The worker config should remain a standard Codex agent config installed globally at:

`~/.codex/agents/blackboard-worker.toml`

No private schema field should be required for compatibility.

## Installation and Startup Flow

The intended user flow is:

1. Install Agora globally
2. Install the `blackboard-collaboration` skill globally
3. Install or generate global `blackboard-worker.toml`
4. Run `agora doctor`
5. Open Codex in any working directory
6. Invoke the collaboration skill from the main thread
7. Skill calls the global `agora` high-level startup entrypoint
8. CLI starts runtime services as needed, verifies health, boots the host adapter, and waits for the worker startup turn
9. CLI returns the real collaboration link
10. User edits, comments, proceeds, reviews, and closes in the page
11. Final summary returns to the same parent Codex thread

This flow must not depend on the source repository being the active working directory.

## CLI Surface

### Primary command

The product should expose `agora` as the public command.

### Required high-level commands

Phase 1 should support at least:

- `agora doctor`
- `agora init-codex`
- `agora start-session`

The low-level runtime operations may continue to exist, but they are secondary and should not be the first-install user path.

### `agora init-codex`

This command prepares the Codex-side global environment. It should:

- create or update `~/.codex/agents/blackboard-worker.toml`
- install a standard current worker template
- explain or optionally automate the skill installation step
- avoid requiring repo-local paths

It should be safe to run repeatedly.

### `agora doctor`

This command becomes the main published diagnostic entrypoint. It is higher-level than the existing runtime doctor and should check the real user environment.

It should validate:

- the CLI runtime assets are present
- the expected global skill exists
- the expected global worker config exists
- the worker config can actually be loaded by the adapter
- the local Codex runtime prerequisites are available
- the selected runtime port is usable or explain conflicts
- the installed surfaces match the expected strict compatibility template

When possible, it should emit actionable repair instructions rather than generic failures.

### Runtime doctor layering

The current runtime-level doctor should remain as a lower-level asset check. `agora doctor` should wrap or extend it rather than replacing its implementation value.

## Strict Compatibility Policy

### Compatibility source of truth

The CLI is the compatibility authority.

Skill and worker config compatibility should be checked externally by the CLI rather than by adding private metadata to standard skill or TOML formats.

### Skill compatibility check

Compatibility should be determined by strict validation of the installed skill files, such as:

- required files exist
- critical prompt or config fragments are present
- installed content matches expected templates or signatures closely enough

The goal is to fail early when the global skill is stale, partially copied, or locally modified in a way that breaks the supported E2E flow.

### Worker config compatibility check

Compatibility should be determined by strict validation of the installed worker config, such as:

- file exists in the expected global location
- required sections and command references are present
- content matches the expected supported template closely enough
- the host adapter can parse and use it successfully

No custom version field is required.

### Strictness choice

Phase 1 should prefer strict failure over permissive ambiguity. If the installed skill or worker config diverges from what Agora supports, `agora doctor` should report it clearly and tell the user how to reinstall or refresh the asset.

## End-to-End Validation Contract

Phase 1 is only successful if the following real flow works from published assets:

1. User globally installs `agora`
2. User globally installs `blackboard-collaboration`
3. User generates or installs global `blackboard-worker.toml`
4. `agora doctor` passes
5. User opens Codex outside the source repo
6. User invokes the collaboration skill
7. Main thread starts a real session through the CLI
8. Worker returns real `sessionId` and `frontendUrl`
9. User performs page-side editing and comment interactions
10. Proceed triggers candidate generation
11. Review applies correctly
12. Close returns summary to the same parent thread

This flow should be captured in a published runbook for repeatable manual validation.

## Failure Model

Failures should be surfaced at the layer where the user can act:

- install failures: npm or skill install guidance
- config failures: `agora init-codex` or reinstall guidance
- runtime asset failures: CLI reinstall or republish guidance
- compatibility failures: explicit mismatch and refresh guidance
- startup failures: precise failed step such as backend unreachable, frontend unreachable, worker config missing, skill missing, or worker startup blocked

The product should not pretend that collaboration has started unless a real session URL is available.

## Phase 1 Implementation Scope

### In scope

- publishable public `Agora` CLI entrypoint
- user-visible naming cleanup
- global skill installation story
- global worker config installation story
- strict `agora doctor`
- `agora init-codex`
- published E2E validation documentation

### Out of scope

- full repository-wide rename
- internal package namespace migration
- custom skill manifest
- custom worker config schema
- protocol redesign
- multi-host support

## Risks

### Naming drift

Because internal names remain old while public names become `Agora`, some logs or internal errors may still leak `blackboard` or `whiteBoard`. This is acceptable in Phase 1 only if the primary user flow and docs stay coherent.

### Over-strict compatibility checks

Strict checks improve reliability, but they may reject intentional local edits. This is acceptable for the first published E2E-oriented product slice because predictable supportability is more important than hand-edited flexibility.

### Global environment coupling

Global installation increases realism but also increases risk of stale assets across repeated tests. This is exactly why `agora doctor` and `agora init-codex` must be first-class commands.

## Recommended Execution Order

1. Public CLI rename and entrypoint shaping
2. Global worker config initialization path
3. Global skill installation documentation and enforcement
4. Strict `agora doctor`
5. Published E2E runbook
6. Clean-environment validation against published-style assets

## Success Criteria

Phase 1 is successful when:

- an external user can install Agora globally without repo-local assumptions
- Codex can discover the globally installed skill and worker config
- `agora doctor` can reliably reject broken environments and explain why
- the real collaboration session can be started from the skill
- the full human edit/comment/proceed/review/close loop completes and returns to the parent thread
- the product is documented as `Agora` even while old internal names still exist
