import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { runEventLoop } from "../eventLoop.js";
import type { DispatchEvent, HostControls } from "../types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeEvent(overrides: Partial<DispatchEvent> = {}): DispatchEvent {
  return {
    eventId: "event-1",
    sessionId: "session-1",
    eventType: "session.close_requested",
    message: "close now",
    occurredAt: new Date().toISOString(),
    status: "pending",
    ...overrides,
  };
}

function makeRelayDiagnosticsFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "close-relay-diagnostics-"));
  tempDirs.push(dir);
  return path.join(dir, "close-relay-result.json");
}

function readRelayDiagnostic(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

describe("runEventLoop", () => {
  test("does not deliver an event when claim fails", async () => {
    const client = {
      getPendingEvents: vi
        .fn()
        .mockResolvedValueOnce([makeEvent()])
        .mockResolvedValueOnce([]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
      }),
      claimEvent: vi.fn().mockResolvedValue(false),
      hasOpenSessions: vi.fn().mockResolvedValue(true),
      completeEvent: vi.fn(),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn(),
      waitAgent: vi.fn(),
    };

    const onClose = vi.fn();
    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      onClose,
    });

    expect(host.sendInput).not.toHaveBeenCalled();
    expect(host.waitAgent).not.toHaveBeenCalled();
    expect(client.completeEvent).not.toHaveBeenCalled();
    expect(client.failEvent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        closeTurnOutput: "",
        shouldShutdownRuntime: false,
      }),
    );
  });

  test("relays close artifact paths to the main thread and shuts down when the final session closes", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
        closeResult: {
          summaryPath: "/tmp/summary.md",
          finalDocumentPath: "/tmp/final.md",
          closedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(false),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockResolvedValue(undefined),
      waitAgent: vi.fn().mockImplementation(async (threadId: string) => {
        if (threadId === "thread-1") {
          return {
            status: "completed" as const,
            outputText: "summary complete",
          };
        }

        return {
          status: "completed" as const,
          outputText: "main thread received close artifacts",
        };
      }),
    };
    const onClose = vi.fn();
    const onRuntimeShutdown = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      mainThreadId: "main-thread-1",
      relayDiagnosticsFilePath,
      onClose,
      onRuntimeShutdown,
    });

    expect(client.claimEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(host.sendInput).toHaveBeenCalledWith("thread-1", closeEvent.message);
    expect(host.sendInput).toHaveBeenCalledWith(
      "main-thread-1",
      expect.stringContaining("/tmp/summary.md"),
    );
    expect(host.sendInput).toHaveBeenCalledWith(
      "main-thread-1",
      expect.stringContaining("/tmp/final.md"),
    );
    expect(host.waitAgent).toHaveBeenNthCalledWith(1, "thread-1");
    expect(host.waitAgent).toHaveBeenNthCalledWith(2, "main-thread-1");
    expect(client.completeEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(client.hasOpenSessions).toHaveBeenCalledTimes(1);
    expect(onRuntimeShutdown).toHaveBeenCalledTimes(1);
    expect(client.failEvent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        closeTurnOutput: "summary complete",
        shouldShutdownRuntime: true,
      }),
    );
    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        mainThreadId: "main-thread-1",
        outcome: "relay_completed",
        relayTurnStatus: "completed",
      }),
    );
  });

  test("writes diagnostics when mainThreadId is missing and does not shut down when another session remains open", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
        closeResult: {
          summaryPath: "/tmp/summary.md",
          finalDocumentPath: "/tmp/final.md",
          closedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(true),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockResolvedValue(undefined),
      waitAgent: vi.fn().mockResolvedValue({
        status: "completed",
        outputText: "summary complete",
      }),
    };
    const onRuntimeShutdown = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      relayDiagnosticsFilePath,
      onRuntimeShutdown,
    });

    expect(host.sendInput).toHaveBeenCalledTimes(1);
    expect(onRuntimeShutdown).not.toHaveBeenCalled();
    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        mainThreadId: null,
        outcome: "mainThreadId_missing",
      }),
    );
  });

  test("waits for the main-thread close relay to settle before resolving", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
        closeResult: {
          summaryPath: "/tmp/summary.md",
          finalDocumentPath: "/tmp/final.md",
          closedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(false),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    let resolveMainThreadRelay: ((result: { status: "completed"; outputText: string }) => void) | undefined;
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockResolvedValue(undefined),
      waitAgent: vi.fn().mockImplementation((threadId: string) => {
        if (threadId === "thread-1") {
          return Promise.resolve({
            status: "completed" as const,
            outputText: "summary complete",
          });
        }

        return new Promise((resolve) => {
          resolveMainThreadRelay = resolve;
        });
      }),
    };
    const onRuntimeShutdown = vi.fn();

    let resolved = false;
    const loopPromise = runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      mainThreadId: "main-thread-1",
      relayDiagnosticsFilePath,
      onRuntimeShutdown,
    }).then(() => {
      resolved = true;
    });

    await vi.waitFor(() => {
      expect(host.sendInput).toHaveBeenCalledWith("main-thread-1", expect.any(String));
    });
    expect(resolved).toBe(false);
    expect(onRuntimeShutdown).not.toHaveBeenCalled();

    resolveMainThreadRelay?.({
      status: "completed",
      outputText: "main thread received close artifacts",
    });
    await loopPromise;

    expect(resolved).toBe(true);
    expect(onRuntimeShutdown).toHaveBeenCalledTimes(1);
    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        outcome: "relay_completed",
      }),
    );
  });

  test("writes diagnostics when main-thread sendInput fails but still shuts down deterministically", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
        closeResult: {
          summaryPath: "/tmp/summary.md",
          finalDocumentPath: "/tmp/final.md",
          closedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(false),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockImplementation(async (threadId: string) => {
        if (threadId === "thread-1") {
          return;
        }
        throw new Error("send_input exploded");
      }),
      waitAgent: vi.fn().mockImplementation(async () => ({
        status: "completed" as const,
        outputText: "summary complete",
      })),
    };
    const onRuntimeShutdown = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      mainThreadId: "main-thread-1",
      relayDiagnosticsFilePath,
      onRuntimeShutdown,
    });

    expect(client.completeEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(onRuntimeShutdown).toHaveBeenCalledTimes(1);
    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        outcome: "send_input_failed",
      }),
    );
  });

  test("writes diagnostics when main-thread waitAgent throws but still shuts down deterministically", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
        closeResult: {
          summaryPath: "/tmp/summary.md",
          finalDocumentPath: "/tmp/final.md",
          closedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(false),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockResolvedValue(undefined),
      waitAgent: vi.fn().mockImplementation(async (threadId: string) => {
        if (threadId === "thread-1") {
          return {
            status: "completed" as const,
            outputText: "summary complete",
          };
        }

        throw new Error("wait_agent exploded");
      }),
    };
    const onRuntimeShutdown = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      mainThreadId: "main-thread-1",
      relayDiagnosticsFilePath,
      onRuntimeShutdown,
    });

    expect(client.completeEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(onRuntimeShutdown).toHaveBeenCalledTimes(1);
    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        outcome: "wait_agent_failed",
      }),
    );
  });

  test("writes diagnostics when main-thread relay turn does not complete but still shuts down deterministically", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
        closeResult: {
          summaryPath: "/tmp/summary.md",
          finalDocumentPath: "/tmp/final.md",
          closedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(false),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockResolvedValue(undefined),
      waitAgent: vi.fn().mockImplementation(async (threadId: string) => {
        if (threadId === "thread-1") {
          return {
            status: "completed" as const,
            outputText: "summary complete",
          };
        }

        return {
          status: "timed_out" as const,
          outputText: "",
        };
      }),
    };
    const onRuntimeShutdown = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      mainThreadId: "main-thread-1",
      relayDiagnosticsFilePath,
      onRuntimeShutdown,
    });

    expect(client.completeEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(onRuntimeShutdown).toHaveBeenCalledTimes(1);
    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        outcome: "relay_turn_not_completed",
        relayTurnStatus: "timed_out",
      }),
    );
    errorSpy.mockRestore();
  });

  test("writes diagnostics when closeResult is missing", async () => {
    const relayDiagnosticsFilePath = makeRelayDiagnosticsFile();
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(false),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn().mockResolvedValue(undefined),
      waitAgent: vi.fn().mockResolvedValue({
        status: "completed",
        outputText: "summary complete",
      }),
    };
    const onRuntimeShutdown = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      mainThreadId: "main-thread-1",
      relayDiagnosticsFilePath,
      onRuntimeShutdown,
    });

    expect(readRelayDiagnostic(relayDiagnosticsFilePath)).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        outcome: "close_result_missing",
        closeResult: null,
      }),
    );
    expect(onRuntimeShutdown).toHaveBeenCalledTimes(1);
  });

  test("sends an obligation remediation message back to the same worker thread before completing", async () => {
    const commentEvent = makeEvent({
      eventType: "bullet.created",
      message: [
        "用户在 session session-1 创建了一条 comment bullet：",
        "- bulletId: b-comment-1",
        "- unitId: u-1",
        "- anchorText: title",
        "- content: simplify title",
        "",
        "请处理这条 bullet，完成后调用 mark_bullet_ready。",
      ].join("\n"),
    });
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([commentEvent]).mockResolvedValueOnce([]),
      getSnapshot: vi
        .fn()
        .mockResolvedValueOnce({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [{ bulletId: "b-comment-1", status: "processing" }],
        })
        .mockResolvedValueOnce({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [{ bulletId: "b-comment-1", status: "ready" }],
        })
        .mockResolvedValue({
          sessionId: "session-1",
          sessionStatus: "closed",
          activeBullets: [],
        }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(true),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
    };
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput,
      waitAgent: vi
        .fn()
        .mockResolvedValueOnce({
          status: "completed",
          outputText: "wrote resolution only",
        })
        .mockResolvedValueOnce({
          status: "completed",
          outputText: "mark_bullet_ready done",
        }),
    };

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
    });

    expect(sendInput).toHaveBeenCalledTimes(2);
    expect(sendInput).toHaveBeenNthCalledWith(1, "thread-1", commentEvent.message);
    expect(String(sendInput.mock.calls[1]?.[1])).toContain("obligationFailure:");
    expect(String(sendInput.mock.calls[1]?.[1])).toContain("当前事件仍然是同一条 bullet.created");
    expect(client.completeEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(client.failEvent).not.toHaveBeenCalled();
  });

  test("marks a failed event but keeps the loop alive instead of stopping the session", async () => {
    const commentEvent = makeEvent({
      eventType: "bullet.created",
      message: [
        "用户在 session session-1 创建了一条 comment bullet：",
        "- bulletId: b-comment-1",
        "- unitId: u-1",
        "- anchorText: title",
        "- content: simplify title",
        "",
        "请处理这条 bullet，完成后调用 mark_bullet_ready。",
      ].join("\n"),
    });
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([commentEvent]).mockResolvedValueOnce([]),
      getSnapshot: vi
        .fn()
        .mockResolvedValueOnce({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [{ bulletId: "b-comment-1", status: "processing" }],
        })
        .mockResolvedValueOnce({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [{ bulletId: "b-comment-1", status: "processing" }],
        })
        .mockResolvedValueOnce({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [{ bulletId: "b-comment-1", status: "processing" }],
        })
        .mockResolvedValue({
          sessionId: "session-1",
          sessionStatus: "closed",
          activeBullets: [],
        }),
      claimEvent: vi.fn().mockResolvedValue(true),
      hasOpenSessions: vi.fn().mockResolvedValue(true),
      completeEvent: vi.fn(),
      failEvent: vi.fn().mockResolvedValue(undefined),
    };
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput,
      waitAgent: vi.fn().mockResolvedValue({
        status: "completed",
        outputText: "still working",
      }),
    };
    const onClose = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      onClose,
    });

    expect(client.failEvent).toHaveBeenCalledWith(
      "session-1",
      "event-1",
      expect.stringContaining("obligation not satisfied after remediation turns"),
    );
    expect(client.completeEvent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
