import { EventEmitter } from "node:events";
import { Writable, PassThrough } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CodexAppServerHost } from "../runtimeHost.js";

class FakeAppServerProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly seenMethods: string[] = [];
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

  beforeEach(() => {
    fakeProcess = new FakeAppServerProcess();
  });

  test("spawnAgent starts a thread and waits for the startup turn", async () => {
    const host = new CodexAppServerHost({
      spawnProcess: () => fakeProcess,
      workspaceRoot: "/workspace",
      workerConfigPath: "/home/peter/workspace/blackBoard/.codex/agents/blackboard-worker.toml",
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

  test("sendInput resumes unknown threads before starting a turn", async () => {
    const host = new CodexAppServerHost({
      spawnProcess: () => fakeProcess,
      workspaceRoot: "/workspace",
      workerConfigPath: "/home/peter/workspace/blackBoard/.codex/agents/blackboard-worker.toml",
    });

    await host.sendInput("thr-existing", "process event");
    const result = await host.waitAgent("thr-existing");

    expect(result.status).toBe("completed");
    expect(result.outputText).toBe("reply for thr-existing");
    expect(fakeProcess.seenMethods).toEqual(["initialize", "initialized", "thread/resume", "turn/start"]);
  });
});
