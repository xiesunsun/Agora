/**
 * Session bootstrap flow.
 *
 * 1. Spawn a blackboard-worker subagent via host.spawnAgent()
 * 2. Wait for the worker's startup turn to complete
 * 3. The worker uses high-level blackboard-runtime agent commands to generate the
 *    first draft, create the session, and initialize the workspace
 * 4. Adapter writes back the subagentThreadId via the backend control route
 * 5. Return SessionInfo for the event loop
 *
 * Per Codex-Host-Adapter-Plan.md §8.1
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { BackendClient } from "./backendClient.js";
import type { AgentTurnResult, HostControls, SessionInfo } from "./types.js";

const REQUIRED_HANDOFF_SECTIONS = [
  "## Role",
  "## Task Goal",
  "## Why Blackboard",
  "## Context",
  "## Initial Content",
  "## Success Criteria",
  "## Startup Contract",
  "## Return Contract",
];

function buildWorkerStartupPrompt(
  backendUrl: string,
  frontendUrl: string,
  startupArtifactsDir: string,
  handoffPrompt?: string,
): string {
  const createSessionResultFile = path.join(startupArtifactsDir, "create-session-result.json");
  const getSnapshotResultFile = path.join(startupArtifactsDir, "get-snapshot-result.json");
  if (handoffPrompt) {
    assertCompleteHandoff(handoffPrompt);
    return `${handoffPrompt.trim()}

## Runtime Context
- backendUrl: ${backendUrl}
- frontendUrl: ${frontendUrl}

## Startup Execution Contract
During this startup turn you must:
1. Treat the "## Initial Content" section as a drafting brief unless it already contains exact user-facing prose that must be preserved.
2. You own first-draft creation for this blackboard session. Before creating the session, produce a discussion-ready "sessionDocument.md" from the theme, goal, and context in the handoff when needed.
3. The visible document must contain only user-facing article content. Never copy control sections such as "Role", "Why Blackboard", "Success Criteria", "Startup Contract", "Return Contract", runtime metadata, or protocol instructions into "sessionDocument.md".
4. If the handoff includes both task metadata and drafting guidance, use the metadata to guide your writing, but only the actual article draft belongs in "sessionDocument.md".
5. Use the high-level CLI command:
   blackboard-runtime create-session --backend-url ${backendUrl} --title "<document title>" --initial-content-file sessionDocument.md --json-out ${createSessionResultFile}
6. Use the high-level CLI command:
   blackboard-runtime get-snapshot --backend-url ${backendUrl} --session-result-file ${createSessionResultFile} --write-current-content sessionDocument.md --json-out ${getSnapshotResultFile}

Startup is only complete after you return exactly:
sessionId: <sessionId>
frontendUrl: ${frontendUrl}?sessionId=<sessionId>
sessionStatus: active`;
  }

  return `\
你是一个 blackboard-worker subagent。

你的任务是：
1. 先写出一版可讨论的 sessionDocument.md
2. 使用 blackboard-runtime create-session 创建一个新的 blackboard session，并把结构化结果写到 ${createSessionResultFile}
3. 使用 blackboard-runtime get-snapshot 获取初始快照并写入 sessionDocument.md，并把结构化结果写到 ${getSnapshotResultFile}

创建 session 时使用以下参数：
- title: "Blackboard Session"
- initialContent: "# 新文稿\\n\\n请在前端编辑正文内容。"

完成后，必须只输出以下三行：
sessionId: <sessionId>
frontendUrl: ${frontendUrl}?sessionId=<sessionId>
sessionStatus: active
`;
}

export async function bootstrapSession(
  client: BackendClient,
  host: HostControls,
  handoffPrompt?: string,
): Promise<SessionInfo> {
  const health = await client.getHealth();
  const startupArtifactsDir = getStartupArtifactsDir();
  mkdirSync(startupArtifactsDir, { recursive: true });
  const prompt = buildWorkerStartupPrompt(
    health.backendUrl,
    health.frontendUrl,
    startupArtifactsDir,
    handoffPrompt,
  );

  console.log("[startup] spawning blackboard-worker subagent...");
  const { threadId: subagentThreadId } = await host.spawnAgent(prompt);
  console.log(`[startup] worker spawned, threadId=${subagentThreadId}`);

  // Wait for the startup turn (worker calls create_session during this turn)
  const startupTurn = await host.waitAgent(subagentThreadId);
  if (startupTurn.status !== "completed") {
    throw new Error(
      `worker startup turn did not complete successfully: ${startupTurn.status}`,
    );
  }
  console.log("[startup] worker startup turn complete");

  const startupOutputFile = path.join(startupArtifactsDir, "startup-turn-output.txt");
  writeFileSync(startupOutputFile, startupTurn.outputText);

  const startupInfo = parseStartupTurn(startupTurn, startupArtifactsDir, startupOutputFile);
  await client.setThread(startupInfo.sessionId, subagentThreadId);

  console.log(`[startup] session ready: ${startupInfo.frontendUrl}`);
  return {
    sessionId: startupInfo.sessionId,
    frontendUrl: startupInfo.frontendUrl,
    subagentThreadId,
  };
}

/**
 * V1 bootstrap: session already exists (created by the worker or pre-seeded).
 * Adapter just registers the subagentThreadId and starts the event loop.
 */
export async function bootstrapWithKnownSession(
  sessionId: string,
  subagentThreadId: string,
  client: BackendClient,
): Promise<SessionInfo> {
  console.log(`[startup] registering threadId=${subagentThreadId} for session=${sessionId}`);
  await client.setThread(sessionId, subagentThreadId);

  const { frontendUrl: frontendBaseUrl } = await client.getHealth();
  const frontendUrl = `${frontendBaseUrl}?sessionId=${sessionId}`;
  console.log(`[startup] session ready: ${frontendUrl}`);

  return { sessionId, frontendUrl, subagentThreadId };
}

function parseStartupTurn(
  turn: AgentTurnResult,
  startupArtifactsDir: string,
  startupOutputFile: string,
): { sessionId: string; frontendUrl: string } {
  const structured = readCreateSessionResult(startupArtifactsDir);
  if (structured) {
    return structured;
  }

  const sessionIdMatch = /^\s*sessionId:\s*(\S+)\s*$/im.exec(turn.outputText);
  const frontendUrlMatch = /^\s*frontendUrl:\s*(\S+)\s*$/im.exec(turn.outputText);

  if (!sessionIdMatch) {
    throw new Error(
      `worker startup output did not include a parseable sessionId; raw output saved to ${startupOutputFile}`,
    );
  }
  if (!frontendUrlMatch) {
    throw new Error(
      `worker startup output did not include a parseable frontendUrl; raw output saved to ${startupOutputFile}`,
    );
  }

  return {
    sessionId: sessionIdMatch[1]!,
    frontendUrl: frontendUrlMatch[1]!,
  };
}

function getStartupArtifactsDir(): string {
  const workerWorkspace = process.env.BLACKBOARD_WORKER_WORKSPACE ?? path.join(tmpdir(), "blackboard-worker");
  return path.join(workerWorkspace, "sessions", "startup-temp");
}

function readCreateSessionResult(
  startupArtifactsDir: string,
): { sessionId: string; frontendUrl: string } | null {
  const createSessionResultFile = path.join(startupArtifactsDir, "create-session-result.json");
  if (!existsSync(createSessionResultFile)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(createSessionResultFile, "utf8")) as {
    sessionId?: string;
    frontendUrl?: string;
  };
  if (!parsed.sessionId || !parsed.frontendUrl) {
    return null;
  }

  return {
    sessionId: parsed.sessionId,
    frontendUrl: parsed.frontendUrl,
  };
}

function assertCompleteHandoff(handoffPrompt: string): void {
  const missing = REQUIRED_HANDOFF_SECTIONS.filter((section) => !handoffPrompt.includes(section));
  if (missing.length > 0) {
    throw new Error(
      `main-agent handoff is incomplete; missing required section(s): ${missing.join(", ")}`,
    );
  }
}
