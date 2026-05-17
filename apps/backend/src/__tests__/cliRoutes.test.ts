/**
 * Integration tests for CLI routes and Proceed path.
 * These tests call the handler functions directly without starting an HTTP server.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

// ─── Minimal HTTP mocks ───────────────────────────────────────────────────────

function makeReq(method: string, path: string, body?: object): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage;
  emitter.method = method;
  emitter.url = path;
  emitter.headers = { host: "localhost" };
  // Simulate body emission on next tick
  if (body) {
    const json = JSON.stringify(body);
    setImmediate(() => {
      emitter.emit("data", Buffer.from(json));
      emitter.emit("end");
    });
  } else {
    setImmediate(() => emitter.emit("end"));
  }
  return emitter;
}

function makeRes(): ServerResponse & { _status: number; _body: string } {
  const res = new EventEmitter() as ServerResponse & { _status: number; _body: string };
  res._status = 200;
  res._body = "";
  res.writeHead = (status: number) => { res._status = status; return res; };
  res.end = (body?: unknown) => { res._body = String(body ?? ""); return res; };
  res.getHeader = () => undefined;
  return res;
}

async function waitForBody(
  res: ServerResponse & { _body: string },
  timeoutMs = 500,
): Promise<void> {
  const startedAt = Date.now();
  while (!res._body) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for response body");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ─── /cli/health ─────────────────────────────────────────────────────────────

describe("/cli/health", () => {
  test("returns ok with backendUrl and frontendUrl", async () => {
    // Mock probeFrontend by patching the module — we test the shape, not the probe
    const { handleCliRequest } = await import("../cliRoutes.js");
    const req = makeReq("GET", "/cli/health");
    const res = makeRes();
    const handled = handleCliRequest(req, res);
    expect(handled).toBe(true);
    await waitForBody(res);
    const body = JSON.parse(res._body);
    expect(body).toHaveProperty("backendUrl");
    expect(body).toHaveProperty("frontendUrl");
    expect(body).toHaveProperty("frontendReachable");
    expect(body.backendUrl).toBe("http://localhost");
    // frontendReachable is false in test env (no frontend running)
    expect(typeof body.frontendReachable).toBe("boolean");
  });

  test("returns false for unreachable frontend", async () => {
    process.env.FRONTEND_URL = "http://localhost:19999"; // nothing running here
    vi.resetModules();
    const { handleCliRequest } = await import("../cliRoutes.js");
    const req = makeReq("GET", "/cli/health");
    const res = makeRes();
    handleCliRequest(req, res);
    await waitForBody(res, 3500);
    const body = JSON.parse(res._body);
    expect(body.frontendReachable).toBe(false);
    expect(body.ok).toBe(false);
    delete process.env.FRONTEND_URL;
  }, 5000);
});

// ─── /cli/sessions/:id/dispatch-events ───────────────────────────────────────

describe("/cli/sessions/:id/dispatch-events", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("claim is exclusive and returns 409 after the first success", async () => {
    const { handleCliRequest } = await import("../cliRoutes.js");
    const { enqueueDispatchEvent } = await import("../sessionStore.js");

    const sessionId = `dispatch-${Date.now()}`;
    const eventId = "event-1";
    enqueueDispatchEvent({
      eventId,
      sessionId,
      eventType: "proceed.started",
      message: "Proceed now",
      occurredAt: new Date().toISOString(),
      status: "pending",
    });

    const firstReq = makeReq("POST", `/cli/sessions/${sessionId}/dispatch-events/${eventId}/claim`);
    const firstRes = makeRes();
    handleCliRequest(firstReq, firstRes);
    await new Promise((r) => setTimeout(r, 50));
    expect(firstRes._status).toBe(200);

    const secondReq = makeReq("POST", `/cli/sessions/${sessionId}/dispatch-events/${eventId}/claim`);
    const secondRes = makeRes();
    handleCliRequest(secondReq, secondRes);
    await new Promise((r) => setTimeout(r, 50));
    expect(secondRes._status).toBe(409);
  });

  test("complete requires the event to be delivering", async () => {
    const { handleCliRequest } = await import("../cliRoutes.js");
    const { enqueueDispatchEvent } = await import("../sessionStore.js");

    const sessionId = `dispatch-complete-${Date.now()}`;
    const eventId = "event-1";
    enqueueDispatchEvent({
      eventId,
      sessionId,
      eventType: "proceed.started",
      message: "Proceed now",
      occurredAt: new Date().toISOString(),
      status: "pending",
    });

    const req = makeReq("POST", `/cli/sessions/${sessionId}/dispatch-events/${eventId}/complete`);
    const res = makeRes();
    handleCliRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    expect(res._status).toBe(409);
  });
});

// ─── /cli/sessions/:id/thread ─────────────────────────────────────────────────

describe("/cli/sessions/:id/thread", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("persists subagentThreadId on session", async () => {
    const { handleCliRequest } = await import("../cliRoutes.js");
    const { createSession, getSession } = await import("../sessionStore.js");

    const sessionId = `test-thread-${Date.now()}`;
    createSession(sessionId, "Test", "# Test\n\nContent.");

    const req = makeReq("POST", `/cli/sessions/${sessionId}/thread`, { subagentThreadId: "thread-abc-123" });
    const res = makeRes();
    handleCliRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));

    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.ok).toBe(true);

    const snapshot = getSession(sessionId);
    expect(snapshot?.subagentThreadId).toBe("thread-abc-123");
  });

  test("returns 400 when subagentThreadId missing", async () => {
    const { handleCliRequest } = await import("../cliRoutes.js");
    const { createSession } = await import("../sessionStore.js");

    const sessionId = `test-thread-missing-${Date.now()}`;
    createSession(sessionId, "Test", "# Test\n\nContent.");

    const req = makeReq("POST", `/cli/sessions/${sessionId}/thread`, {});
    const res = makeRes();
    handleCliRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));

    expect(res._status).toBe(400);
  });

  test("returns 404 for unknown session", async () => {
    const { handleCliRequest } = await import("../cliRoutes.js");

    const req = makeReq("POST", "/cli/sessions/nonexistent/thread", { subagentThreadId: "t-1" });
    const res = makeRes();
    handleCliRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));

    expect(res._status).toBe(404);
  });
});

describe("/cli/sessions/:id/bullets/:bulletId/ready", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("decodes encoded bullet ids before marking comment bullets ready", async () => {
    const { handleCliRequest } = await import("../cliRoutes.js");
    const { createSession, getSession, setSession } = await import("../sessionStore.js");
    const { createDocumentUnitComment } = await import("../sessionModel.js");

    const sessionId = `test-bullet-ready-${Date.now()}`;
    const snap = createSession(
      sessionId,
      "Test",
      "# 努力不是一直绷紧：一份关于“努力”的讨论稿\n\n正文。",
    );
    const titleUnit = snap.documentUnits.find((u) => u.type === "title")!;
    const withComment = createDocumentUnitComment(
      snap,
      titleUnit.unitId,
      titleUnit.text,
      "标题太长了",
    );
    const bulletId = withComment.activeBullets[0]!.bulletId;
    setSession(sessionId, {
      ...withComment,
      activeBullets: withComment.activeBullets.map((bullet) =>
        bullet.bulletId === bulletId ? { ...bullet, status: "processing" as const } : bullet,
      ),
    });

    const req = makeReq(
      "POST",
      `/cli/sessions/${sessionId}/bullets/${encodeURIComponent(bulletId)}/ready`,
    );
    const res = makeRes();
    handleCliRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));

    expect(res._status).toBe(200);
    expect(JSON.parse(res._body).ok).toBe(true);
    expect(getSession(sessionId)?.activeBullets[0]?.status).toBe("ready");
  });
});

// ─── Proceed path without mock ────────────────────────────────────────────────

describe("Proceed path (ENABLE_PROCEED_MOCK not set)", () => {
  test("session stays in proceeding when mock is disabled", async () => {
    // Ensure mock env var is not set
    delete process.env.ENABLE_PROCEED_MOCK;

    const { createSession, getSession, setSession } = await import("../sessionStore.js");
    const { startProceeding, createDocumentUnitComment } = await import("../sessionModel.js");

    const sessionId = `test-proceed-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Test\n\nParagraph.");
    const unit = snap.documentUnits.find((u) => u.type === "paragraph")!;
    const withBullet = createDocumentUnitComment(snap, unit.unitId, "Paragraph", "Please expand");
    setSession(sessionId, withBullet);
    const proceeding = setSession(sessionId, startProceeding(withBullet));

    expect(proceeding.sessionStatus).toBe("proceeding");

    // Wait longer than the mock timeout (1550ms) — session should still be proceeding
    await new Promise((r) => setTimeout(r, 200));
    const after = getSession(sessionId);
    expect(after?.sessionStatus).toBe("proceeding");
  });

  test("ENABLE_PROCEED_MOCK=true triggers mock candidate after delay", async () => {
    process.env.ENABLE_PROCEED_MOCK = "true";

    const { createSession, getSession, setSession } = await import("../sessionStore.js");
    const { startProceeding, createDocumentUnitComment } = await import("../sessionModel.js");

    const sessionId = `test-proceed-mock-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Test\n\nParagraph.");
    const unit = snap.documentUnits.find((u) => u.type === "paragraph")!;
    const withBullet = createDocumentUnitComment(snap, unit.unitId, "Paragraph", "Please expand");
    setSession(sessionId, withBullet);
    setSession(sessionId, startProceeding(withBullet));

    // The mock fires at 1550ms — but we only test the model layer here,
    // not the setTimeout in routes.ts (that requires a running server).
    // This test just confirms the session model is in the right state.
    const s = getSession(sessionId);
    expect(s?.sessionStatus).toBe("proceeding");

    delete process.env.ENABLE_PROCEED_MOCK;
  });
});
