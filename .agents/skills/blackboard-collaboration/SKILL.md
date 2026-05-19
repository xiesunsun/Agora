---
name: blackboard-collaboration
description: >
  Use this skill when acting as the main agent and the user asks to start
  collaborative text editing with a human in an Agora session. Triggers on
  requests to open a blackboard, start a writing collaboration, create a shared
  document session, or work on a text with human-in-the-loop review cycles.
---

# Agora Collaboration Skill

## When to use this skill

Use this skill when:
- You are the main agent preparing or starting an Agora collaboration session
- The task requires creating or iterating on a document with human review
- The human wants to annotate, comment, or directly edit a shared text
- The task involves a Proceed → Review → Accept/Reject cycle
- A persistent, versioned collaborative writing session is needed

Do not use this skill for:
- One-shot text generation with no review loop
- Code editing tasks (use the worker agent instead)
- Tasks that don't require human-in-the-loop collaboration

## Your role as main agent

You are the **main agent**. Your job here is to:

1. Decide whether this task should enter blackboard collaboration
2. Provide the session theme, goal, context, constraints, and success criteria
3. Prepare the handoff for the blackboard worker subagent
4. Invoke the high-level runtime entrypoint to start the real session
5. Wait for the returned `sessionId`, `frontendUrl`, and `subagentThreadId`
6. Treat the returned worker thread as the durable session owner for later direct event delivery
7. Wait for the session to close and receive the summary
8. Continue the parent task based on the returned results

Main-agent boundary:
- Do not write the full article or full starting draft yourself unless the human explicitly asked for your exact wording
- Do not spend startup turns exploring repo implementation details for routine session startup
- Do not manually orchestrate low-level runtime steps when `agora start-session` can do it for you
- The subagent owns first-draft creation, session creation, and ongoing collaboration inside the blackboard

## Automatic startup policy

Use the high-level startup command first. Do not begin with low-level preflight or repo exploration.

Default behavior in a new folder should be:
1. Materialize the main-agent handoff into a local file
2. Treat that absolute handoff file path as the startup transport unit
3. Start the real session with `agora start-session --handoff-file {handoffFile}`
4. Wait for the command to return real `sessionId`, `frontendUrl`, and `subagentThreadId`
5. Only then tell the human that blackboard collaboration is ready

`--json-out` is optional tooling and debug plumbing. It is not part of the ordinary user-facing startup flow, and the main agent should not ask the human to manage startup JSON files just to begin collaboration.

Ordinary chat collaboration is a fallback path, not the default path.

`agora start-session` already owns runtime startup and health checking. Treat `status` and `up` as debugging or recovery commands unless the high-level command has already failed.

## Runtime gate

Before you claim that blackboard collaboration has started, verify these conditions:
- The live runtime health endpoint is reachable via `agora status` or `GET {backendUrl}/cli/health`
- Treat the returned `backendUrl` and `frontendUrl` as the source of truth for this session
- The spawned worker has completed the startup turn and returned a real `sessionId`
- The spawned worker has returned a real frontend URL in the form `{frontendUrl}?sessionId={sessionId}`

If these conditions are not met, do not pretend that a live blackboard session exists. Surface the exact blocker instead.

## Runtime startup commands

Use the global runtime command, not repo-local `pnpm` scripts:

```bash
agora start-session --handoff-file {handoffFile}
```

Operational rules:
- `agora start-session` is the preferred high-level entrypoint for main agents
- Do not require `--json-out` for ordinary interactive startup; reserve it for automation, diagnostics, or wrapper scripts
- `agora status`, `up`, and `adapter` are low-level debugging or manual-recovery commands; do not prefer them when `start-session` can be used
- The caller's current directory is only where the handoff file may live; do not treat it as the worker workspace root
- Worker-private files belong under the runtime-provided `workspaceRoot`, which `agora start-session` creates inside the configured worker workspace
- If `start-session` blocks for multiple minutes, keep waiting unless it has concretely failed or timed out
- Do not claim startup failure just because the worker startup turn is slow; session bootstrap may take several minutes
- If `start-session` returns `ok: false`, treat startup as blocked and surface that failure directly; do not drop into repo exploration, log archaeology, or manual `resume/send_input/wait` recovery inside the ordinary main-agent turn

## Spawn rules

When starting the dedicated worker:
- Spawn the custom `blackboard-worker` agent by setting `agent_type: "blackboard-worker"`
- Do **not** set `fork_context: true` when spawning that custom agent
- Pass the required task context entirely through the handoff message
- Treat the returned `agent_id` as the durable `subagentThreadId` for later direct event delivery

The worker startup turn is not complete until it has created the backend session and returned the live collaboration link.
The main agent owns goal-setting and handoff quality. Later blackboard event delivery belongs to the host adapter or equivalent host control loop, not to ordinary main-agent chat turns.
The main agent should expect startup to take minutes rather than seconds for non-trivial writing sessions.

## How to spawn the blackboard worker

Spawn the `blackboard-worker` agent with a handoff message structured as follows.
All sections below are required for a real collaboration session:

`## Initial Content` is special:
- It must contain only the user-visible starting document content in Markdown
- Do not append meta scaffolding such as `Discussion Prompts`, `Success Criteria`, workflow notes, or internal instructions unless the human explicitly wants those strings to appear in the document itself
- Do not instruct the subagent to include story outlines, skeleton headings, "possible directions", discussion questions, or any writing-workshop scaffolding in the visible document. The initial document must read as the actual deliverable (article, story, essay), not a planning artifact.
- Keep collaboration prompts and control metadata in the other handoff sections, not in the initial document body
- For most sessions, the main agent should use this section to give a brief drafting directive, not a polished article body
- Preferred pattern: tell the subagent to create the first discussion-ready draft from the theme, goal, and context
- Only provide a full initial draft here if the human explicitly wants the main agent's exact wording preserved

```
## Role
You are the Blackboard Subagent for this session. See your developer instructions for the full protocol.

## Task Goal
{What this blackboard session should produce}

## Why Blackboard
{Why this task needs a collaborative blackboard session}

## Context
{Relevant background, constraints, prior decisions}

## Initial Content
{Usually a brief instruction telling the subagent what initial draft to generate. Use a full Markdown body only when exact starting text is intentionally provided.}

## Success Criteria
{What "done" looks like for this session}

## Startup Contract
During the startup turn you must:
- create the blackboard session through the CLI
- read back the initial snapshot
- return the real `sessionId`
- return the real frontend URL `{frontendUrl}?sessionId={sessionId}`

## Return Contract
When the session closes, return a summary including:
- Final document state
- Key changes made
- Any unresolved items for the main agent
```

## After worker startup

Once `agora start-session` returns `sessionId` and `frontendUrl`:

1. Treat the returned `subagentThreadId` as the durable worker thread for this session
2. Share the `frontendUrl` with the human so they can open the collaboration page
3. Do not respawn another worker for the same session unless recovery is explicitly required

## After the session

When the blackboard worker returns its summary:
- Expect the close completion to arrive on the original main thread as a normal message after the host waits for that relay turn to finish
- Read the returned `summaryPath` and `finalDocumentPath` files; those absolute paths are the authoritative close artifacts
- Incorporate the final document content into the parent task
- Address any unresolved items flagged by the worker
- Continue the parent task flow

## Live collaboration contract

This skill is for real blackboard collaboration, not offline drafting.

Required behavior:
- The first worker reply must establish a live session, not just produce a Markdown draft
- The main agent should provide a brief, not preempt the subagent by writing the whole document unless explicitly required by the human
- The main agent should relay the returned frontend URL to the human so collaboration can happen in the page
- Later blackboard events should go to the same worker thread through the host adapter, not be reinterpreted by the main agent as ordinary chat work
- For real task work, the main agent must provide the complete handoff structure above; a bootstrap-only prompt is not sufficient
- When a worker turn ends without satisfying its required backend-visible action, the host should send the obligation failure reason back to the same worker thread so it can continue the same event and finish the missing action
- A single obligation failure must not be treated as a reason to stop the entire session runtime

Failure handling:
- If `agora start-session` fails, report that the session startup is blocked
- If the worker cannot obtain a `sessionId`, do not claim that collaboration has started
- Only fall back to ordinary chat after `start-session` has failed in a concrete and user-visible way
