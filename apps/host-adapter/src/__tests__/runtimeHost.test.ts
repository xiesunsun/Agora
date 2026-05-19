import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable, PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CodexAppServerHost } from "../runtimeHost.js";

class FakeAppServerProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly seenMethods: string[] = [];
  readonly requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  private turnCounter = 0;

  readonly stdin = new Writable({
    write: (chunk, _encoding, callback) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        this.handleRequest(JSON.parse(line) as { id?: number; method: string; params: Record<string, unknown> });
      }
      callback();
    },
  });

  kill(): boolean {
    this.emit("exit", 0, null);
    return true;
  }

  private handleRequest(request: { id?: number; method: string; params: Record<string, unknown> }): void {
    this.seenMethods.push(request.method);
    this.requests.push({ method: request.method, params: request.params });

    // JSON-RPC notifications have no `id` and do not expect a response.
    if (request.id === undefined) {
      return;
    }

    switch (request.method) {
      case "initialize":
        this.respond(request.id, { userAgent: "fake", codexHome: "/tmp", platformFamily: "unix", platformOs: "linux" });
        return;

      case "thread/start":
        this.respond(request.id, { thread: { id: "thr-1" } });
        return;

      case "thread/resume":
        this.respond(request.id, { thread: { id: request.params.threadId } });
        return;

      case "turn/start": {
        this.turnCounter += 1;
        const turnId = `turn-${this.turnCounter}`;
        this.respond(request.id, {
          turn: { id: turnId, status: "inProgress", items: [], error: null },
        });
        queueMicrotask(() => {
          this.notify("item/agentMessage/delta", {
            threadId: request.params.threadId,
            turnId,
            itemId: "msg-1",
            delta: `reply for ${request.params.threadId}`,
          });
          this.notify("turn/completed", {
            threadId: request.params.threadId,
            turn: {
              id: turnId,
              status: "completed",
              items: [{ type: "agentMessage", id: "msg-1", text: `reply for ${request.params.threadId}` }],
              error: null,
            },
          });
        });
        return;
      }

      default:
        this.respondError(request.id, `unsupported method: ${request.method}`);
    }
  }

  private respond(id: number, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  private respondError(id: number, message: string): void {
    this.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -1, message } })}\n`);
  }

  private notify(method: string, params: unknown): void {
    this.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

describe("CodexAppServerHost", () => {
  let fakeProcess: FakeAppServerProcess;
  let tempDir: string;
  let workerConfigPath: string;
  let previousWorkerWorkspace: string | undefined;
  let previousSessionWorkspace: string | undefined;

  beforeEach(() => {
    fakeProcess = new FakeAppServerProcess();
    previousWorkerWorkspace = process.env.BLACKBOARD_WORKER_WORKSPACE;
    previousSessionWorkspace = process.env.BLACKBOARD_SESSION_WORKSPACE;
    delete process.env.BLACKBOARD_WORKER_WORKSPACE;
    delete process.env.BLACKBOARD_SESSION_WORKSPACE;
    tempDir = mkdtempSync(join(tmpdir(), "blackboard-runtime-host-test-"));
    workerConfigPath = join(tempDir, "blackboard-worker.toml");
    writeFileSync(
      workerConfigPath,
      [
        'sandbox_mode = "workspace-write"',
        'developer_instructions = """',
        "You are a blackboard worker for tests.",
        '"""',
        "",
      ].join("\n"),
    );
  });

  afterEach(() => {
    if (previousWorkerWorkspace === undefined) {
      delete process.env.BLACKBOARD_WORKER_WORKSPACE;
    } else {
      process.env.BLACKBOARD_WORKER_WORKSPACE = previousWorkerWorkspace;
    }
    if (previousSessionWorkspace === undefined) {
      delete process.env.BLACKBOARD_SESSION_WORKSPACE;
    } else {
      process.env.BLACKBOARD_SESSION_WORKSPACE = previousSessionWorkspace;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("spawnAgent starts a thread and waits for the startup turn", async () => {
    const host = new CodexAppServerHost({
      spawnProcess: () => fakeProcess,
      workspaceRoot: join(tempDir, "workspace"),
      workerConfigPath,
    });

    const { threadId } = await host.spawnAgent("start blackboard");
    const result = await host.waitAgent(threadId);

    expect(threadId).toBe("thr-1");
    expect(result).toEqual({
      status: "completed",
      outputText: "reply for thr-1",
    });
    expect(fakeProcess.seenMethods).toEqual(["initialize", "initialized", "thread/start", "turn/start"]);
  });

  test("uses a per-session child directory under BLACKBOARD_WORKER_WORKSPACE", async () => {
    const workerWorkspaceParent = join(tempDir, "worker-parent");
    process.env.BLACKBOARD_WORKER_WORKSPACE = workerWorkspaceParent;

    const host = new CodexAppServerHost({
      spawnProcess: () => fakeProcess,
      workerConfigPath,
    });

    await host.spawnAgent("start blackboard");

    const threadStart = fakeProcess.requests.find((request) => request.method === "thread/start");
    expect(threadStart?.params.cwd).toEqual(expect.stringMatching(
      new RegExp(`^${escapeRegExp(workerWorkspaceParent)}/session-`),
    ));
    expect(existsSync(threadStart?.params.cwd as string)).toBe(true);
    expect(threadStart?.params.cwd).not.toBe(workerWorkspaceParent);
    expect(threadStart?.params.developerInstructions).toEqual(expect.stringContaining(
      `workspaceRoot=${threadStart?.params.cwd}`,
    ));
  });

  test("sendInput resumes unknown threads before starting a turn", async () => {
    const host = new CodexAppServerHost({
      spawnProcess: () => fakeProcess,
      workspaceRoot: join(tempDir, "workspace"),
      workerConfigPath,
    });

    await host.sendInput("thr-existing", "process event");
    const result = await host.waitAgent("thr-existing");

    expect(result.status).toBe("completed");
    expect(result.outputText).toBe("reply for thr-existing");
    expect(fakeProcess.seenMethods).toEqual(["initialize", "initialized", "thread/resume", "turn/start"]);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
