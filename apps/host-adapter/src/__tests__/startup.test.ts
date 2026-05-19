import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { bootstrapSession } from "../startup.js";
import type { HostControls } from "../types.js";

describe("bootstrapSession", () => {
  function withWorkspace<T>(fn: (workerWorkspaceParent: string) => Promise<T>): Promise<T> {
    const workerWorkspaceParent = mkdtempSync(path.join(tmpdir(), "blackboard-startup-test-"));
    const previous = process.env.BLACKBOARD_WORKER_WORKSPACE;
    const previousSessionWorkspace = process.env.BLACKBOARD_SESSION_WORKSPACE;
    process.env.BLACKBOARD_WORKER_WORKSPACE = workerWorkspaceParent;
    delete process.env.BLACKBOARD_SESSION_WORKSPACE;
    return fn(workerWorkspaceParent).finally(() => {
      if (previous === undefined) {
        delete process.env.BLACKBOARD_WORKER_WORKSPACE;
      } else {
        process.env.BLACKBOARD_WORKER_WORKSPACE = previous;
      }
      if (previousSessionWorkspace === undefined) {
        delete process.env.BLACKBOARD_SESSION_WORKSPACE;
      } else {
        process.env.BLACKBOARD_SESSION_WORKSPACE = previousSessionWorkspace;
      }
      rmSync(workerWorkspaceParent, { recursive: true, force: true });
    });
  }

  test("spawns a worker, parses startup output, and persists threadId", async () => {
    await withWorkspace(async () => {
      const handoffFilePath = path.join(tmpdir(), `blackboard-handoff-${Date.now()}.md`);
      writeFileSync(
        handoffFilePath,
        [
          "## Role",
          "You are the Blackboard Subagent for this session.",
          "",
          "## Task Goal",
          "Deliver a polished draft.",
          "",
          "## Why Blackboard",
          "The user wants live collaboration.",
          "",
          "## Context",
          "Unique handoff context that should not be inlined.",
          "",
          "## Initial Content",
          "Draft from the brief.",
          "",
          "## Success Criteria",
          "A usable draft exists.",
          "",
          "## Startup Contract",
          "Create the session and return the URL.",
          "",
          "## Return Contract",
          "Return the final summary.",
        ].join("\n"),
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
          outputText: [
            "sessionId: session-123",
            "frontendUrl: http://localhost:5173?sessionId=session-123",
            "sessionStatus: active",
          ].join("\n"),
        }),
      };

      const info = await bootstrapSession(client as never, host, handoffFilePath);

      expect(info).toEqual({
        sessionId: "session-123",
        frontendUrl: "http://localhost:5173?sessionId=session-123",
        subagentThreadId: "thread-123",
      });
      expect(client.setThread).toHaveBeenCalledWith("session-123", "thread-123");
      expect(host.spawnAgent).toHaveBeenCalledWith(
        expect.stringContaining(
          `handoffFilePath: ${handoffFilePath}`,
        ),
      );
      expect(host.spawnAgent).toHaveBeenCalledWith(
        expect.stringContaining(
          "Read handoffFilePath before doing any drafting work.",
        ),
      );
      expect(host.spawnAgent).not.toHaveBeenCalledWith(
        expect.stringContaining("Unique handoff context that should not be inlined."),
      );
      rmSync(handoffFilePath, { force: true });
    });
  });

  test("falls back to structured create-session output when worker text omits sessionId", async () => {
    await withWorkspace(async () => {
      const client = {
        getHealth: vi.fn().mockResolvedValue({
          backendUrl: "http://localhost:3001",
          frontendUrl: "http://localhost:5173",
        }),
        setThread: vi.fn().mockResolvedValue(undefined),
      };
      const host: HostControls = {
        spawnAgent: vi.fn().mockImplementation(async (prompt: string) => {
          const match = /(\S*create-session-result\.json)/.exec(prompt);
          if (!match) throw new Error("prompt did not include create-session result path");
          mkdirSync(path.dirname(match[1]!), { recursive: true });
          writeFileSync(
            match[1]!,
            JSON.stringify({
              ok: true,
              sessionId: "session-structured",
              frontendUrl: "http://localhost:5173?sessionId=session-structured",
            }),
          );
          return { threadId: "thread-123" };
        }),
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
    await withWorkspace(async (workerWorkspaceParent) => {
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

      const [sessionWorkspace] = readdirSync(workerWorkspaceParent)
        .filter((entry) => entry.startsWith("session-"))
        .map((entry) => path.join(workerWorkspaceParent, entry));
      expect(sessionWorkspace).toBeDefined();
      const sessionsDir = path.join(sessionWorkspace!, "sessions");
      const [outputFile] = readdirSync(sessionsDir)
        .filter((entry) => entry.startsWith("startup-"))
        .map((entry) => path.join(sessionsDir, entry, "startup-turn-output.txt"));
      expect(outputFile).toBeDefined();
      expect(existsSync(outputFile!)).toBe(true);
      expect(readFileSync(outputFile!, "utf8")).toContain("frontendUrl:");
    });
  });

  test("does not create startup artifacts in the invoking cwd", async () => {
    await withWorkspace(async () => {
      const invokingCwd = mkdtempSync(path.join(tmpdir(), "blackboard-invoking-cwd-"));
      const previousCwd = process.cwd();
      try {
        process.chdir(invokingCwd);
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

        await bootstrapSession(client as never, host);

        expect(existsSync(path.join(invokingCwd, "sessions"))).toBe(false);
      } finally {
        process.chdir(previousCwd);
        rmSync(invokingCwd, { recursive: true, force: true });
      }
    });
  });

  test("falls back to the bootstrap-only prompt when no handoff file path is provided", async () => {
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

    await bootstrapSession(client as never, host);
    expect(host.spawnAgent).toHaveBeenCalledWith(
      expect.stringContaining("你是一个 blackboard-worker subagent。"),
    );
  });
});
