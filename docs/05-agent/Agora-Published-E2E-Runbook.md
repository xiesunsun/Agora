# Agora Published E2E Runbook

This runbook validates the published-style install flow outside the source repository.

## 1. Install the CLI globally

```bash
npm install -g agora
```

## 2. Install the global skill

Copy the canonical skill directory into:

```text
~/.codex/skills/blackboard-collaboration
```

Expected files:

- `~/.codex/skills/blackboard-collaboration/SKILL.md`
- `~/.codex/skills/blackboard-collaboration/agents/openai.yaml`

## 3. Install or refresh the worker config

```bash
agora init-codex --force
```

Expected:

- `~/.codex/agents/blackboard-worker.toml` exists
- command output includes the installed path and skill guidance

## 4. Run strict diagnostics

```bash
agora doctor
```

Expected:

- JSON output contains `"ok": true`
- embedded runtime assets pass
- skill files match the canonical templates
- worker config matches the canonical template

## 5. Open Codex in an arbitrary folder

Choose a folder that is not this repository and open Codex there.

Expected:

- the flow does not depend on repo-local paths

## 6. Invoke the skill from the main thread

Prompt the main thread to use:

```text
$blackboard-collaboration
```

Expected:

- the main thread starts `agora start-session`
- a real `sessionId` and `frontendUrl` are returned
- the startup result also includes `relayDiagnosticsFile`
- no user-facing startup JSON file is required for the ordinary flow

## 7. Exercise the collaboration loop

In the collaboration page:

1. edit the document directly
2. add at least one comment bullet
3. click `Proceed`
4. review the candidate changes
5. accept or reject changes
6. close the session

Expected:

- edits and bullets flow through one worker thread
- Proceed produces a review candidate
- close returns a main-thread message containing absolute `summaryPath` and `finalDocumentPath`
- the close message arrives on the same main thread after the host waits for the relay turn to settle
- closing the final open session stops the runtime on `localhost:3001`

## 8. Verify the summary returns to the same Codex thread

Expected:

- the original main thread receives artifact paths, not an inlined final document body
- `summaryPath` points to the close summary markdown
- `finalDocumentPath` points to the authoritative final document
- no new replacement thread is spawned for the same session

## 9. Inspect close relay diagnostics

Inspect the `relayDiagnosticsFile` returned by `agora start-session`.

Expected:

- the file exists after the close attempt
- `outcome` is one of:
  - `close_result_missing`
  - `mainThreadId_missing`
  - `send_input_failed`
  - `wait_agent_failed`
  - `relay_turn_not_completed`
  - `relay_completed`
- if `outcome` is not `relay_completed`, the JSON contains enough stage/error detail to identify where relay broke

Triage:

- `close_result_missing`: inspect the backend close path and whether close metadata was persisted
- `mainThreadId_missing`: inspect CLI/adapter environment propagation for `MAIN_THREAD_ID`
- `send_input_failed`: inspect host thread resume / turn-start failures for the main thread
- `wait_agent_failed`: inspect host wait failure details for the main thread
- `relay_turn_not_completed`: inspect the returned relay turn status and main-thread behavior during that turn

## 10. Verify runtime shutdown after the final close

Run:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

Expected:

- if the just-closed session was the final real open session, no listener remains on `localhost:3001`
- a seeded `demo` session must not keep the runtime alive in the published flow

## Optional automated smoke

From the repository root:

```bash
pnpm run smoke:agora
```
