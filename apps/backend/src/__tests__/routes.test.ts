import { describe, expect, test } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import type { CommandEnvelope } from "../types.js";

function makeReq(method: string, path: string, body?: object): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage;
  emitter.method = method;
  emitter.url = path;
  emitter.headers = { host: "localhost" };
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
  const res = new EventEmitter() as ServerResponse & {
    _status: number;
    _body: string;
  };
  res._status = 200;
  res._body = "";
  res.writeHead = (status: number) => {
    res._status = status;
    return res;
  };
  res.end = (body?: unknown) => {
    res._body = String(body ?? "");
    return res;
  };
  res.getHeader = () => undefined;
  return res;
}

function makeSseRes(): ServerResponse & { _chunks: string[] } {
  const res = new EventEmitter() as ServerResponse & { _chunks: string[] };
  res._chunks = [];
  res.writeHead = () => res;
  res.write = (chunk: unknown) => {
    res._chunks.push(String(chunk));
    return true;
  };
  res.end = (body?: unknown) => {
    if (body !== undefined) res._chunks.push(String(body));
    return res;
  };
  res.getHeader = () => undefined;
  return res;
}

function makeCommand(
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
): CommandEnvelope {
  return {
    commandId: `cmd-${Date.now()}`,
    type,
    sessionId,
    issuedAt: new Date().toISOString(),
    payload,
  };
}

describe("session command routes", () => {
  test("edit bullets stay new instead of auto-advancing to processing", async () => {
    const { handleRequest } = await import("../routes.js");
    const { createSession, getSession } = await import("../sessionStore.js");

    const sessionId = `routes-edit-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Title\n\nParagraph.");
    const unit = snap.documentUnits.find((candidate) => candidate.type === "paragraph")!;

    const req = makeReq(
      "POST",
      `/api/sessions/${sessionId}/commands`,
      makeCommand(sessionId, "document_unit.edit.commit", {
        unitId: unit.unitId,
        markdown: "Updated paragraph.",
        workingSetRevision: snap.workingSetRevision,
      }),
    );
    const res = makeRes();
    handleRequest(req, res);

    await new Promise((resolve) => setTimeout(resolve, 450));

    const after = getSession(sessionId);
    expect(after?.activeBullets).toHaveLength(1);
    expect(after?.activeBullets[0]?.type).toBe("edit");
    expect(after?.activeBullets[0]?.status).toBe("new");
  });

  test("comment bullets auto-advance to processing before host dispatch", async () => {
    const { handleRequest } = await import("../routes.js");
    const { createSession, getSession } = await import("../sessionStore.js");

    const sessionId = `routes-comment-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Title\n\nParagraph.");
    const unit = snap.documentUnits.find((candidate) => candidate.type === "paragraph")!;

    const req = makeReq(
      "POST",
      `/api/sessions/${sessionId}/commands`,
      makeCommand(sessionId, "bullet.comment.create", {
        unitId: unit.unitId,
        anchorTextSnapshot: "Paragraph",
        content: "Please expand",
      }),
    );
    const res = makeRes();
    handleRequest(req, res);

    await new Promise((resolve) => setTimeout(resolve, 450));

    const after = getSession(sessionId);
    expect(after?.activeBullets).toHaveLength(1);
    expect(after?.activeBullets[0]?.type).toBe("comment");
    expect(after?.activeBullets[0]?.status).toBe("processing");
  });

  test("proceed is allowed even when comment bullets are not yet ready", async () => {
    const { handleRequest } = await import("../routes.js");
    const { createSession, getSession, setSession } = await import("../sessionStore.js");
    const { createDocumentUnitComment } = await import("../sessionModel.js");

    const sessionId = `routes-proceed-block-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Title\n\nParagraph.");
    const unit = snap.documentUnits.find((candidate) => candidate.type === "paragraph")!;
    const withComment = createDocumentUnitComment(
      snap,
      unit.unitId,
      "Paragraph",
      "Please expand",
    );
    setSession(sessionId, withComment);

    const req = makeReq(
      "POST",
      `/api/sessions/${sessionId}/commands`,
      makeCommand(sessionId, "session.proceed", {
        workingSetRevision: withComment.workingSetRevision,
      }),
    );
    const res = makeRes();
    handleRequest(req, res);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(res._status).toBe(200);
    const after = getSession(sessionId);
    expect(after?.sessionStatus).toBe("proceeding");
  });

  test("proceed waits in resolving_bullets until comment bullets are ready", async () => {
    delete process.env.ENABLE_PROCEED_MOCK;

    const { handleRequest } = await import("../routes.js");
    const { createSession, getSession, setSession } = await import("../sessionStore.js");
    const { createDocumentUnitComment } = await import("../sessionModel.js");

    const sessionId = `routes-proceed-real-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Title\n\nParagraph.");
    const unit = snap.documentUnits.find((candidate) => candidate.type === "paragraph")!;
    const withComment = createDocumentUnitComment(
      snap,
      unit.unitId,
      "Paragraph",
      "Please expand",
    );
    setSession(sessionId, {
      ...withComment,
      activeBullets: withComment.activeBullets.map((bullet) =>
        bullet.type === "comment" ? { ...bullet, status: "processing" as const } : bullet,
      ),
    });
    const readySnapshot = getSession(sessionId)!;

    const req = makeReq(
      "POST",
      `/api/sessions/${sessionId}/commands`,
      makeCommand(sessionId, "session.proceed", {
        workingSetRevision: readySnapshot.workingSetRevision,
      }),
    );
    const res = makeRes();
    handleRequest(req, res);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should be in proceeding, stage resolving_bullets (waiting for bullet to become ready)
    let after = getSession(sessionId);
    expect(after?.sessionStatus).toBe("proceeding");
    expect(after?.proceeding?.stage).toBe("resolving_bullets");

    // Now mark the bullet ready
    setSession(sessionId, {
      ...after!,
      activeBullets: after!.activeBullets.map((b) => ({ ...b, status: "ready" as const })),
    });

    // Wait for poll to detect it
    await new Promise((resolve) => setTimeout(resolve, 700));

    after = getSession(sessionId);
    expect(after?.proceeding?.stage).toBe("synthesizing_changes");
  });

  test("restore version broadcasts working_set.rebased with a full snapshot", async () => {
    const { handleRequest } = await import("../routes.js");
    const { createSession, saveHistoryVersion } = await import("../sessionStore.js");

    const sessionId = `routes-restore-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Title\n\nCurrent.");
    saveHistoryVersion(sessionId, {
      versionId: "v1",
      versionNumber: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      content: "# Title\n\nRestored.",
    });

    const eventsRes = makeSseRes();
    handleRequest(makeReq("GET", `/api/sessions/${sessionId}/events`), eventsRes);

    const req = makeReq(
      "POST",
      `/api/sessions/${sessionId}/commands`,
      makeCommand(sessionId, "history.restore_version", {
        versionId: "v1",
        workingSetRevision: snap.workingSetRevision,
      }),
    );
    const res = makeRes();
    handleRequest(req, res);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const envelopes = eventsRes._chunks
      .flatMap((chunk) => chunk.split("\n\n"))
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => JSON.parse(chunk.slice("data: ".length)) as { type: string; payload: Record<string, unknown> });
    const rebase = envelopes.find((envelope) => envelope.type === "working_set.rebased");

    expect(rebase?.payload.sessionId).toBe(sessionId);
    expect(rebase?.payload.currentContent).toBe("# Title\n\nRestored.");
    expect(Array.isArray(rebase?.payload.documentUnits)).toBe(true);
    expect(rebase?.payload.workingSetRevision).toBe(1);
  });
});
