import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { bootstrapSession } from "../startup.js";
import type { HostControls } from "../types.js";

describe("bootstrapSession", () => {
  function withWorkspace<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "blackboard-startup-test-"));
    const previous = process.env.BLACKBOARD_WORKER_WORKSPACE;
    process.env.BLACKBOARD_WORKER_WORKSPACE = workspaceRoot;
    return fn(workspaceRoot).finally(() => {
      if (previous === undefined) {
        delete process.env.BLACKBOARD_WORKER_WORKSPACE;
      } else {
        process.env.BLACKBOARD_WORKER_WORKSPACE = previous;
      }
      rmSync(workspaceRoot, { recursive: true, force: true });
    });
  }

  test("spawns a worker, parses startup output, and persists threadId", async () => {
    await withWorkspace(async () => {
      const client = {
        getHealth: vi.fn().mockResolvedValue({
          backendUrl: "http://localhost:3001",
          frontendUrl: "http://localhost:5173",
        }),
        setThread: vi.fn().mockResolvedValue(undefined),
      };
      const host: HostControls = {
        spawnAgent: vi.fn().mockResolvedValue({ threadId: "thread-123" }),
        sendInput: vi.fn(),
        waitAgent: vi.fn().mockResolvedValue({
          status: "completed",
          outputText: [
            "sessionId: session-123",
            "frontendUrl: http://localhost:5173?sessionId=session-123",
            "sessionStatus: active",
          ].join("\n"),
        }),
      };

      const info = await bootstrapSession(client as never, host);

      expect(info).toEqual({
        sessionId: "session-123",
        frontendUrl: "http://localhost:5173?sessionId=session-123",
        subagentThreadId: "thread-123",
      });
      expect(client.setThread).toHaveBeenCalledWith("session-123", "thread-123");
      expect(host.spawnAgent).toHaveBeenCalledWith(
        expect.stringContaining(
          "使用 blackboard-runtime create-session 创建一个新的 blackboard session",
        ),
      );
      expect(host.spawnAgent).toHaveBeenCalledWith(
        expect.stringContaining(
          "使用 blackboard-runtime get-snapshot 获取初始快照并写入 sessionDocument.md",
        ),
      );
      expect(host.spawnAgent).toHaveBeenCalledWith(
        expect.stringContaining("frontendUrl: http://localhost:5173?sessionId=<sessionId>"),
      );
    });
  });

  test("falls back to structured create-session output when worker text omits sessionId", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const startupArtifactsDir = path.join(workspaceRoot, "sessions", "startup-temp");
      const createSessionResultFile = path.join(startupArtifactsDir, "create-session-result.json");
      mkdirSync(startupArtifactsDir, { recursive: true });
      writeFileSync(
        createSessionResultFile,
        JSON.stringify({
          ok: true,
          sessionId: "session-structured",
          frontendUrl: "http://localhost:5173?sessionId=session-structured",
        }),
      );

      const client = {
        getHealth: vi.fn().mockResolvedValue({
          backendUrl: "http://localhost:3001",
          frontendUrl: "http://localhost:5173",
        }),
        setThread: vi.fn().mockResolvedValue(undefined),
      };
      const host: HostControls = {
        spawnAgent: vi.fn().mockResolvedValue({ threadId: "thread-123" }),
        sendInput: vi.fn(),
        waitAgent: vi.fn().mockResolvedValue({
          status: "completed",
          outputText: "Blackboard session ready.",
        }),
      };

      const info = await bootstrapSession(client as never, host);
      expect(info).toEqual({
        sessionId: "session-structured",
        frontendUrl: "http://localhost:5173?sessionId=session-structured",
        subagentThreadId: "thread-123",
      });
      expect(client.setThread).toHaveBeenCalledWith("session-structured", "thread-123");
    });
  });

  test("fails when the worker output does not include sessionId and persists raw startup output", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const client = {
        getHealth: vi.fn().mockResolvedValue({
          backendUrl: "http://localhost:3001",
          frontendUrl: "http://localhost:5173",
        }),
        setThread: vi.fn().mockResolvedValue(undefined),
      };
      const host: HostControls = {
        spawnAgent: vi.fn().mockResolvedValue({ threadId: "thread-123" }),
        sendInput: vi.fn(),
        waitAgent: vi.fn().mockResolvedValue({
          status: "completed",
          outputText: "frontendUrl: http://localhost:5173?sessionId=session-123",
        }),
      };

      await expect(bootstrapSession(client as never, host)).rejects.toThrow(
        /raw output saved to/,
      );
      expect(client.setThread).not.toHaveBeenCalled();

      const outputFile = path.join(
        workspaceRoot,
        "sessions",
        "startup-temp",
        "startup-turn-output.txt",
      );
      expect(existsSync(outputFile)).toBe(true);
      expect(readFileSync(outputFile, "utf8")).toContain("frontendUrl:");
    });
  });

  test("rejects incomplete main-agent handoff prompts", async () => {
    const client = {
      getHealth: vi.fn().mockResolvedValue({
        backendUrl: "http://localhost:3001",
        frontendUrl: "http://localhost:5173",
      }),
      setThread: vi.fn().mockResolvedValue(undefined),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn(),
      waitAgent: vi.fn(),
    };

    await expect(
      bootstrapSession(client as never, host, "## Role\nOnly one section"),
    ).rejects.toThrow(/missing required section/);
    expect(host.spawnAgent).not.toHaveBeenCalled();
  });
});
