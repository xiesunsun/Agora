# Agora CLI

`agora` is the published CLI for the collaboration runtime that lives in this repository.
It keeps the existing embedded backend, frontend, and host-adapter architecture, but exposes a public install flow that works outside the repo.

## Install

```bash
npm install -g agora
```

The package also ships the legacy `blackboard-runtime` binary as a compatibility alias, but the primary documented command is `agora`.

## Install Codex Assets

1. Install or refresh the global worker config and skill:

```bash
agora init-codex --force
```

This writes:

```text
~/.codex/agents/blackboard-worker.toml
~/.codex/skills/blackboard-collaboration
```

The canonical files are embedded in the package under:

```text
dist/codex/agents/blackboard-worker.toml
dist/codex/skills/blackboard-collaboration
```

2. Verify the full install:

```bash
agora doctor
```

## Minimal Usage

```bash
agora start-session --handoff-file ./handoff.md
```

The command will start the embedded runtime as needed, wait for the worker startup turn to finish, and return structured JSON with:

- `sessionId`
- `frontendUrl`
- `subagentThreadId`
- `relayDiagnosticsFile`

`relayDiagnosticsFile` is `null` by default. It is only populated when `--debug` is enabled, because close-relay diagnostics are treated as part of CLI debug behavior rather than a standard runtime artifact.

The startup handoff is transported to the worker by absolute file path. Large handoff bodies are not inlined into the worker prompt.
For ordinary interactive use, `agora start-session --handoff-file ...` is the default flow. `--json-out` remains available for automation and debugging, but humans should not need a startup JSON file just to open a session.

## Close A Session

```bash
agora close-session --session session-123 --summary-file /abs/path/to/summary.md --final-document-file /abs/path/to/sessionDocument.md
```

`close-session` persists only minimal close metadata in backend truth:

- `summaryPath`
- `finalDocumentPath`
- `closedAt`

Review state, version history, and current content remain backend-owned. The summary markdown and final document body stay in local files and are relayed back to the main agent by absolute path after close succeeds.
The host adapter waits for that main-thread relay turn to complete or fail before it exits, so close artifacts are not silently dropped during shutdown.

If the closed session was the final real open session, the runtime shuts down automatically. The optional seeded `demo` session does not keep the published runtime alive unless explicitly enabled.

## Close Relay Diagnostics

Close relay diagnostics are disabled by default. When `--debug` is enabled, each close relay attempt writes a JSON diagnostic artifact. In published installs, the location is:

```text
~/.local/state/blackboard/relay/<sessionId>/close-relay-result.json
```

If `XDG_STATE_HOME` is set, the path moves under that state root instead. When debug is enabled, the `agora start-session` result also includes `relayDiagnosticsFile`, which points to the exact file for that session. Without `--debug`, no relay diagnostics file is created.

Key outcomes:

- `close_result_missing`
- `mainThreadId_missing`
- `send_input_failed`
- `wait_agent_failed`
- `relay_turn_not_completed`
- `relay_completed`

## Common Commands

```bash
agora info
agora doctor --codex-home /tmp/codex-home
agora init-codex --codex-home /tmp/codex-home --force
agora status --port 3001
agora start-session --handoff-file ./handoff.md --debug
```

## Development

From the repo root:

```bash
pnpm --filter ./packages/blackboard-runtime test
pnpm --filter ./packages/blackboard-runtime build
pnpm run smoke:agora
```
