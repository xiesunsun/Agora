/**
 * Session bootstrap flow.
 *
 * 1. Spawn a blackboard-worker subagent via host.spawnAgent()
 * 2. Wait for the worker's startup turn to complete
 * 3. The worker uses high-level Agora CLI commands to generate the
 *    first draft, create the session, and initialize the workspace
 * 4. Adapter writes back the subagentThreadId via the backend control route
 * 5. Return SessionInfo for the event loop
 *
 * Per Codex-Host-Adapter-Plan.md §8.1
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BackendClient } from "./backendClient.js";
import type { AgentTurnResult, HostControls, SessionInfo } from "./types.js";
import { resolveWorkerSessionWorkspace } from "./workerWorkspace.js";

function buildWorkerStartupPrompt(
  backendUrl: string,
  frontendUrl: string,
  startupArtifactsDir: string,
  agoraCliInvocation: string,
  handoffFilePath?: string,
): string {
  const createSessionResultFile = path.join(startupArtifactsDir, "create-session-result.json");
  const getSnapshotResultFile = path.join(startupArtifactsDir, "get-snapshot-result.json");
  if (handoffFilePath) {
    return `\
You are the dedicated blackboard-worker for this session.

## Runtime Context
- backendUrl: ${backendUrl}
- frontendUrl: ${frontendUrl}
- agoraCliInvocation: ${agoraCliInvocation}
- handoffFilePath: ${handoffFilePath}

## Startup Execution Contract
During this startup turn you must:
1. Read handoffFilePath before doing any drafting work.
2. Write the full handoff contents verbatim into mainAgentInfo.md.
3. Treat the handoff file's "## Initial Content" section as a drafting brief unless it already contains exact user-facing prose that must be preserved.
4. Write a discussion-ready sessionDocument.md from the handoff file contents. The visible document must contain only user-facing article content.
5. Use agoraCliInvocation exactly as the CLI prefix for all Agora commands in this turn.
6. Create the session with:
   ${agoraCliInvocation} create-session --backend-url ${backendUrl} --title "<document title>" --initial-content-file sessionDocument.md --json-out ${createSessionResultFile}
7. Read back the initial snapshot with:
   ${agoraCliInvocation} get-snapshot --backend-url ${backendUrl} --session-result-file ${createSessionResultFile} --write-current-content sessionDocument.md --json-out ${getSnapshotResultFile}

Startup is only complete after you return exactly:
sessionId: <sessionId>
frontendUrl: ${frontendUrl}?sessionId=<sessionId>
sessionStatus: active`;
  }

 return `\
你是一个 blackboard-worker subagent。

你的任务是：
1. 先写出一版可讨论的 sessionDocument.md
2. 使用以下精确 CLI 前缀执行 Agora 命令，不要自行在 PATH 里查找 agora 或 blackboard-runtime：
   ${agoraCliInvocation}
3. 使用 ${agoraCliInvocation} create-session 创建一个新的 blackboard session，并把结构化结果写到 ${createSessionResultFile}
4. 使用 ${agoraCliInvocation} get-snapshot 获取初始快照并写入 sessionDocument.md，并把结构化结果写到 ${getSnapshotResultFile}

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
  handoffFilePath?: string,
): Promise<SessionInfo> {
  const health = await client.getHealth();
  const startupArtifactsDir = getStartupArtifactsDir();
  const agoraCliInvocation = process.env.AGORA_CLI_INVOCATION ?? "agora";
  mkdirSync(startupArtifactsDir, { recursive: true });
  const prompt = buildWorkerStartupPrompt(
    health.backendUrl,
    health.frontendUrl,
    startupArtifactsDir,
    agoraCliInvocation,
    handoffFilePath,
  );

  console.log("[startup] spawning blackboard-worker subagent...");
  const { threadId: subagentThreadId } = await host.spawnAgent(prompt);
  console.log(`[startup] worker spawned, threadId=${subagentThreadId}`);

  // Wait for the startup turn (worker calls create_session during this turn)
  const startupTurn = await host.waitAgent(subagentThreadId);
  const startupOutputFile = path.join(startupArtifactsDir, "startup-turn-output.txt");
  writeFileSync(startupOutputFile, startupTurn.outputText);

  if (startupTurn.status !== "completed") {
    throw new Error(
      `worker startup turn did not complete successfully: ${startupTurn.status}; raw output saved to ${startupOutputFile}`,
    );
  }
  console.log("[startup] worker startup turn complete");

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
  const workerWorkspace = resolveWorkerSessionWorkspace();
  return path.join(workerWorkspace, "sessions", `startup-${Date.now()}`);
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
