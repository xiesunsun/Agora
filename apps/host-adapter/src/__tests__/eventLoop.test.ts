import { describe, expect, test, vi } from "vitest";
import { runEventLoop } from "../eventLoop.js";
import type { DispatchEvent, HostControls } from "../types.js";

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
      completeEvent: vi.fn(),
      failEvent: vi.fn(),
    };
    const host: HostControls = {
      spawnAgent: vi.fn(),
      sendInput: vi.fn(),
      waitAgent: vi.fn(),
    };

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
    });

    expect(host.sendInput).not.toHaveBeenCalled();
    expect(host.waitAgent).not.toHaveBeenCalled();
    expect(client.completeEvent).not.toHaveBeenCalled();
    expect(client.failEvent).not.toHaveBeenCalled();
  });

  test("completes a close event after a successful worker turn", async () => {
    const closeEvent = makeEvent();
    const client = {
      getPendingEvents: vi.fn().mockResolvedValueOnce([closeEvent]),
      getSnapshot: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        sessionStatus: "closed",
        activeBullets: [],
      }),
      claimEvent: vi.fn().mockResolvedValue(true),
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
    const onClose = vi.fn();

    await runEventLoop({
      sessionId: "session-1",
      subagentThreadId: "thread-1",
      client: client as never,
      host,
      onClose,
    });

    expect(client.claimEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(host.sendInput).toHaveBeenCalledWith("thread-1", closeEvent.message);
    expect(client.completeEvent).toHaveBeenCalledWith("session-1", "event-1");
    expect(client.failEvent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
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
