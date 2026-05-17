import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTurnResult, HostControls, SpawnAgentResult } from "./types.js";

type JsonRpcId = number;

interface JsonRpcResponse {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

interface BlackboardWorkerConfig {
  developerInstructions: string;
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
}

interface TrackedTurn {
  threadId: string;
  turnId: string;
  itemOrder: string[];
  itemTexts: Map<string, string>;
  resolve: (result: AgentTurnResult) => void;
  reject: (error: Error) => void;
  promise: Promise<AgentTurnResult>;
}

interface AppServerProcess extends EventEmitter {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(signal?: NodeJS.Signals | number): boolean;
}

interface CodexAppServerHostOptions {
  spawnProcess?: () => AppServerProcess;
  workspaceRoot?: string;
  workerConfigPath?: string;
  backendUrl?: string;
  frontendUrl?: string;
}

const DEFAULT_WORKER_CONFIG_PATHS = [
  join(
    process.env.BLACKBOARD_WORKSPACE_ROOT ?? process.cwd(),
    ".codex/agents/blackboard-worker.toml",
  ),
  fileURLToPath(new URL("../../../.codex/agents/blackboard-worker.toml", import.meta.url)),
  `${homedir()}/.codex/agents/blackboard-worker.toml`,
];
const DEBUG_RUNTIME_HOST = process.env.BLACKBOARD_HOST_DEBUG === "1";

export class CodexAppServerHost implements HostControls {
  private process: AppServerProcess | null = null;
  private initializePromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly activeTurnsByThread = new Map<string, TrackedTurn>();
  private readonly activeTurnsById = new Map<string, TrackedTurn>();
  private readonly bufferedNotificationsByTurnId = new Map<string, JsonRpcNotification[]>();
  private readonly completedTurnResultsByThread = new Map<string, AgentTurnResult>();
  private readonly resumedThreads = new Set<string>();
  private stdoutBuffer = "";
  private stderrBuffer = "";

  private readonly spawnProcessImpl: () => AppServerProcess;
  private readonly workspaceRoot: string;
  private readonly backendUrl: string;
  private readonly frontendUrl: string;
  private readonly workerConfig: BlackboardWorkerConfig;
  private readonly developerInstructions: string;

  constructor(options: CodexAppServerHostOptions = {}) {
    this.spawnProcessImpl = options.spawnProcess ?? defaultSpawnProcess;
    this.workspaceRoot = resolveWorkerWorkspace(options.workspaceRoot);
    this.backendUrl = options.backendUrl ?? process.env.BACKEND_URL ?? "http://localhost:3001";
    this.frontendUrl = options.frontendUrl ?? process.env.FRONTEND_URL ?? this.backendUrl;
    this.workerConfig = loadBlackboardWorkerConfig(options.workerConfigPath);
    this.workerConfig.sandboxMode = "danger-full-access";
    this.developerInstructions = buildDeveloperInstructions({
      baseInstructions: this.workerConfig.developerInstructions,
      backendUrl: this.backendUrl,
      frontendUrl: this.frontendUrl,
      workspaceRoot: this.workspaceRoot,
    });
  }

  async spawnAgent(prompt: string): Promise<SpawnAgentResult> {
    await this.ensureInitialized();
    debugLog("spawnAgent:start", { workspaceRoot: this.workspaceRoot });

    const threadStart = await this.sendRequest<{ thread: { id: string } }>("thread/start", {
      cwd: this.workspaceRoot,
      approvalPolicy: "never",
      sandbox: this.workerConfig.sandboxMode,
      developerInstructions: this.developerInstructions,
    });

    const threadId = threadStart.thread.id;
    debugLog("spawnAgent:thread-started", { threadId });
    this.resumedThreads.add(threadId);
    await this.startTurn(threadId, prompt);
    debugLog("spawnAgent:startup-turn-sent", { threadId });
    return { threadId };
  }

  async sendInput(subagentThreadId: string, message: string): Promise<void> {
    await this.ensureInitialized();
    await this.ensureThreadResumed(subagentThreadId);
    await this.startTurn(subagentThreadId, message);
    debugLog("sendInput:turn-sent", { threadId: subagentThreadId });
  }

  async waitAgent(subagentThreadId: string): Promise<AgentTurnResult> {
    const tracked = this.activeTurnsByThread.get(subagentThreadId);
    if (tracked) {
      debugLog("waitAgent:await-active", {
        threadId: subagentThreadId,
        turnId: tracked.turnId,
      });
      return tracked.promise;
    }

    const completed = this.completedTurnResultsByThread.get(subagentThreadId);
    if (completed) {
      debugLog("waitAgent:return-buffered", {
        threadId: subagentThreadId,
        status: completed.status,
      });
      this.completedTurnResultsByThread.delete(subagentThreadId);
      return completed;
    }

    throw new Error(`No active turn found for thread ${subagentThreadId}`);
  }

  private async startTurn(threadId: string, message: string): Promise<void> {
    if (this.activeTurnsByThread.has(threadId)) {
      throw new Error(`Thread ${threadId} already has an in-flight turn`);
    }

    debugLog("startTurn:request", {
      threadId,
      preview: previewText(message),
    });

    const turnStart = await this.sendRequest<{ turn: { id: string } }>("turn/start", {
      threadId,
      input: [{ type: "text", text: message, text_elements: [] }],
      cwd: this.workspaceRoot,
      approvalPolicy: "never",
      sandboxPolicy: buildSandboxPolicy(this.workerConfig.sandboxMode, this.workspaceRoot),
    });

    const turnId = turnStart.turn.id;
    debugLog("startTurn:response", { threadId, turnId });
    let resolveTurn!: (result: AgentTurnResult) => void;
    let rejectTurn!: (error: Error) => void;
    const promise = new Promise<AgentTurnResult>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });

    const tracked: TrackedTurn = {
      threadId,
      turnId,
      itemOrder: [],
      itemTexts: new Map(),
      resolve: resolveTurn,
      reject: rejectTurn,
      promise,
    };

    this.activeTurnsByThread.set(threadId, tracked);
    this.activeTurnsById.set(turnId, tracked);
    this.flushBufferedNotifications(turnId);
  }

  private async ensureThreadResumed(threadId: string): Promise<void> {
    if (this.resumedThreads.has(threadId)) {
      return;
    }
    debugLog("thread:resume", { threadId });
    await this.sendRequest("thread/resume", {
      threadId,
      cwd: this.workspaceRoot,
      approvalPolicy: "never",
      sandbox: this.workerConfig.sandboxMode,
      developerInstructions: this.developerInstructions,
    });
    this.resumedThreads.add(threadId);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      const child = this.spawnProcessImpl();
      this.process = child;

      child.stdout.setEncoding?.("utf8");
      child.stderr.setEncoding?.("utf8");

      child.stdout.on("data", (chunk: string | Buffer) => {
        this.stdoutBuffer += chunk.toString();
        this.processStdoutLines();
      });
      child.stderr.on("data", (chunk: string | Buffer) => {
        this.stderrBuffer += chunk.toString();
        this.stderrBuffer = this.stderrBuffer.slice(-4000);
        debugLog("app-server:stderr", chunk.toString());
      });
      child.on("exit", (code, signal) => {
        const detail = `codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
        this.failAllPending(new Error(`${detail}\n${this.stderrBuffer}`.trim()));
      });
      child.on("error", (error) => {
        this.failAllPending(error instanceof Error ? error : new Error(String(error)));
      });

      await this.sendRequest("initialize", {
        clientInfo: {
          name: "blackboard-host-adapter",
          title: "Blackboard Host Adapter",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
        },
      });
      // Per codex app-server README: after a successful `initialize` response,
      // the client MUST emit an `initialized` notification before issuing any
      // further request on the connection; otherwise subsequent requests may
      // be rejected or handled inconsistently.
      this.sendNotification("initialized");
      debugLog("app-server:initialized");
    })();

    return this.initializePromise;
  }

  private processStdoutLines(): void {
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      let payload: JsonRpcResponse | JsonRpcNotification;
      try {
        payload = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
      } catch (error) {
        console.warn("[runtime-host] failed to parse app-server output:", line, error);
        continue;
      }

      if ("id" in payload && typeof payload.id === "number") {
        const pending = this.pendingRequests.get(payload.id);
        if (!pending) {
          continue;
        }
        this.pendingRequests.delete(payload.id);
        debugLog("rpc:response", {
          id: payload.id,
          ok: !payload.error,
          error: payload.error?.message,
        });
        if (payload.error) {
          pending.reject(new Error(payload.error.message));
        } else {
          pending.resolve(payload.result);
        }
        continue;
      }

      if ("method" in payload && typeof payload.method === "string") {
        debugLog("rpc:notification", summarizeNotification(payload));
        this.handleNotification(payload);
      }
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case "item/agentMessage/delta": {
        const params = notification.params as {
          threadId: string;
          turnId: string;
          itemId: string;
          delta: string;
        };
        const tracked = this.activeTurnsById.get(params.turnId);
        if (!tracked) {
          this.bufferTurnNotification(params.turnId, notification);
          return;
        }
        ensureItemTracked(tracked, params.itemId);
        tracked.itemTexts.set(params.itemId, (tracked.itemTexts.get(params.itemId) ?? "") + params.delta);
        return;
      }

      case "item/completed": {
        const params = notification.params as {
          threadId: string;
          turnId: string;
          item: { type: string; id: string; text?: string };
        };
        const tracked = this.activeTurnsById.get(params.turnId);
        if (!tracked) {
          this.bufferTurnNotification(params.turnId, notification);
          return;
        }
        if (params.item.type === "agentMessage") {
          ensureItemTracked(tracked, params.item.id);
          tracked.itemTexts.set(params.item.id, params.item.text ?? tracked.itemTexts.get(params.item.id) ?? "");
        }
        return;
      }

      case "turn/completed": {
        const params = notification.params as {
          threadId: string;
          turn: {
            id: string;
            status: "completed" | "failed" | "interrupted" | "inProgress";
            error?: { message?: string } | null;
            items?: Array<{ type: string; id: string; text?: string }>;
          };
        };
        const tracked = this.activeTurnsById.get(params.turn.id);
        if (!tracked) {
          this.bufferTurnNotification(params.turn.id, notification);
          return;
        }

        for (const item of params.turn.items ?? []) {
          if (item.type === "agentMessage") {
            ensureItemTracked(tracked, item.id);
            tracked.itemTexts.set(item.id, item.text ?? tracked.itemTexts.get(item.id) ?? "");
          }
        }

        const outputText = tracked.itemOrder
          .map((itemId) => tracked.itemTexts.get(itemId) ?? "")
          .filter(Boolean)
          .join("\n\n")
          .trim();

        const result: AgentTurnResult = {
          status:
            params.turn.status === "completed"
              ? "completed"
              : params.turn.status === "failed"
                ? "failed"
                : "timed_out",
          outputText:
            outputText || params.turn.error?.message || "",
        };
        tracked.resolve(result);
        debugLog("turn:completed", {
          threadId: params.threadId,
          turnId: params.turn.id,
          status: result.status,
          outputPreview: previewText(result.outputText),
        });
        this.completedTurnResultsByThread.set(params.threadId, result);
        this.activeTurnsById.delete(params.turn.id);
        this.activeTurnsByThread.delete(params.threadId);
        return;
      }

      default:
        return;
    }
  }

  private bufferTurnNotification(turnId: string, notification: JsonRpcNotification): void {
    if (!this.bufferedNotificationsByTurnId.has(turnId)) {
      this.bufferedNotificationsByTurnId.set(turnId, []);
    }
    this.bufferedNotificationsByTurnId.get(turnId)!.push(notification);
  }

  private flushBufferedNotifications(turnId: string): void {
    const buffered = this.bufferedNotificationsByTurnId.get(turnId);
    if (!buffered) {
      return;
    }
    this.bufferedNotificationsByTurnId.delete(turnId);
    for (const notification of buffered) {
      this.handleNotification(notification);
    }
  }

  private async sendRequest<TResult>(method: string, params: unknown): Promise<TResult> {
    await this.ensureProcessReady();

    const id = this.nextRequestId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
    debugLog("rpc:request", { id, method });

    const response = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
      });
    });

    const child = this.process!;
    child.stdin.write(`${payload}\n`);
    return response;
  }

  /**
   * Send a JSON-RPC notification (no `id`, no response expected).
   *
   * Used for the `initialized` handshake per the codex app-server protocol:
   *   1. sendRequest("initialize", ...)  → await response
   *   2. sendNotification("initialized") → fire-and-forget
   *
   * The process must already be spawned and ready to accept input. Callers
   * inside `ensureInitialized` can rely on that because the process is set
   * before the first sendRequest runs.
   */
  private sendNotification(method: string, params?: unknown): void {
    const child = this.process;
    if (!child) {
      throw new Error(`cannot send notification "${method}" before app-server is ready`);
    }
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params: params ?? {},
    });
    debugLog("rpc:notification-out", { method });
    child.stdin.write(`${payload}\n`);
  }

  private async ensureProcessReady(): Promise<void> {
    if (!this.process) {
      await this.ensureInitialized();
    }
  }

  private failAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();

    for (const tracked of this.activeTurnsById.values()) {
      tracked.reject(error);
    }
    this.activeTurnsById.clear();
    this.activeTurnsByThread.clear();
    this.bufferedNotificationsByTurnId.clear();
    this.completedTurnResultsByThread.clear();
    this.resumedThreads.clear();
    this.process = null;
    this.initializePromise = null;
  }
}

export const runtimeHost: HostControls = new CodexAppServerHost();

function defaultSpawnProcess(): AppServerProcess {
  return spawn("codex", ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
}

function resolveWorkerWorkspace(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.BLACKBOARD_WORKER_WORKSPACE) return process.env.BLACKBOARD_WORKER_WORKSPACE;
  const dir = join(tmpdir(), "blackboard-worker", `session-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureItemTracked(tracked: TrackedTurn, itemId: string): void {
  if (!tracked.itemTexts.has(itemId)) {
    tracked.itemOrder.push(itemId);
    tracked.itemTexts.set(itemId, "");
  }
}

function buildSandboxPolicy(
  sandboxMode: BlackboardWorkerConfig["sandboxMode"],
  repoRoot: string,
): Record<string, unknown> {
  switch (sandboxMode) {
    case "read-only":
      return { type: "readOnly", networkAccess: true };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    case "workspace-write":
    default:
      return {
        type: "workspaceWrite",
        writableRoots: [repoRoot],
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
  }
}

function loadBlackboardWorkerConfig(workerConfigPath?: string): BlackboardWorkerConfig {
  const configPath = workerConfigPath
    ? workerConfigPath
    : DEFAULT_WORKER_CONFIG_PATHS.find((candidate) => existsSync(candidate));

  if (!configPath) {
    throw new Error("blackboard-worker.toml not found in repo or global Codex home");
  }

  const content = readFileSync(configPath, "utf8");
  const sandboxModeMatch = /^sandbox_mode\s*=\s*"([^"]+)"\s*$/m.exec(content);
  const instructionsMatch = /developer_instructions\s*=\s*"""\n?([\s\S]*?)\n?"""/m.exec(content);

  if (!sandboxModeMatch) {
    throw new Error(`sandbox_mode missing from ${configPath}`);
  }
  if (!instructionsMatch) {
    throw new Error(`developer_instructions missing from ${configPath}`);
  }

  const sandboxMode = sandboxModeMatch[1] as BlackboardWorkerConfig["sandboxMode"];
  if (!["read-only", "workspace-write", "danger-full-access"].includes(sandboxMode)) {
    throw new Error(`Unsupported sandbox_mode in ${configPath}: ${sandboxMode}`);
  }

  return {
    sandboxMode,
    developerInstructions: instructionsMatch[1].trim(),
  };
}

function buildDeveloperInstructions({
  baseInstructions,
  backendUrl,
  frontendUrl,
  workspaceRoot,
}: {
  baseInstructions: string;
  backendUrl: string;
  frontendUrl: string;
  workspaceRoot: string;
}): string {
  return [
    "## Runtime Context",
    `For this session, use backendUrl=${backendUrl} for all CLI HTTP calls.`,
    `For this session, use frontendUrl=${frontendUrl} as the collaboration page base URL.`,
    `For this session, use workspaceRoot=${workspaceRoot} as the local session workspace root.`,
    "These runtime values are authoritative and override any hardcoded defaults mentioned elsewhere.",
    "",
    baseInstructions,
  ].join("\n");
}

function debugLog(label: string, data?: unknown): void {
  if (!DEBUG_RUNTIME_HOST) {
    return;
  }
  if (data === undefined) {
    console.log(`[runtime-host] ${label}`);
    return;
  }
  console.log(`[runtime-host] ${label}`, data);
}

function previewText(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 120);
}

function summarizeNotification(notification: JsonRpcNotification): Record<string, unknown> {
  const summary: Record<string, unknown> = { method: notification.method };
  const params = notification.params as Record<string, unknown> | undefined;
  if (!params) {
    return summary;
  }
  if (typeof params.threadId === "string") {
    summary.threadId = params.threadId;
  }
  if (typeof params.turnId === "string") {
    summary.turnId = params.turnId;
  }
  if (typeof params.itemId === "string") {
    summary.itemId = params.itemId;
  }
  if (typeof params.delta === "string") {
    summary.deltaPreview = previewText(params.delta);
  }
  if (params.turn && typeof params.turn === "object") {
    const turn = params.turn as Record<string, unknown>;
    if (typeof turn.id === "string") {
      summary.turnId = turn.id;
    }
    if (typeof turn.status === "string") {
      summary.turnStatus = turn.status;
    }
  }
  if (params.item && typeof params.item === "object") {
    const item = params.item as Record<string, unknown>;
    if (typeof item.id === "string") {
      summary.itemId = item.id;
    }
    if (typeof item.type === "string") {
      summary.itemType = item.type;
    }
  }
  return summary;
}
