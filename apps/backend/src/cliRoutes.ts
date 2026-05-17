import type { IncomingMessage, ServerResponse } from "node:http";
import * as http from "node:http";
import * as https from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlackboardErrorCode, ErrorEnvelope } from "./types.js";
import { broadcast } from "./sseManager.js";
import {
  createSession,
  getDispatchEvents,
  getSession,
  saveHistoryVersion,
  setSession,
  transitionDispatchEventStatus,
} from "./sessionStore.js";
import {
  buildReviewChangeSetFromCandidate,
  closeSession,
  completeProceeding,
  updateProceedingProgress,
  updateProceedingStage,
} from "./sessionModel.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const RUNTIME_KIND = "blackboard-runtime";
const RUNTIME_API_VERSION = 1;

export function handleCliRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  // GET /cli/health
  if (url.pathname === "/cli/health" && req.method === "GET") {
    probeFrontend(FRONTEND_URL).then((frontendReachable) => {
      sendJson(res, {
        ok: frontendReachable,
        runtimeKind: RUNTIME_KIND,
        runtimeApiVersion: RUNTIME_API_VERSION,
        backendUrl: getBackendUrl(req),
        frontendUrl: FRONTEND_URL,
        frontendReachable,
      });
    });
    return true;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] !== "cli" || segments[1] !== "sessions") {
    return false;
  }

  const sessionId = decodePathSegment(segments[2]);
  const resource = decodePathSegment(segments[3]);
  const resourceId = decodePathSegment(segments[4]);
  const action = decodePathSegment(segments[5]);

  // POST /cli/sessions — create_session
  if (!sessionId && req.method === "POST") {
    handleCreateSession(req, res);
    return true;
  }

  if (!sessionId) return false;

  // GET /cli/sessions/:id/snapshot — get_snapshot
  if (resource === "snapshot" && req.method === "GET") {
    handleGetSnapshot(sessionId, res);
    return true;
  }

  // POST /cli/sessions/:id/thread — persist subagentThreadId
  if (resource === "thread" && req.method === "POST") {
    handleSetThread(sessionId, req, res);
    return true;
  }

  // POST /cli/sessions/:id/bullets/:bulletId/ready — mark_bullet_ready
  if (resource === "bullets" && resourceId && action === "ready" && req.method === "POST") {
    handleMarkBulletReady(sessionId, resourceId, res);
    return true;
  }

  // POST /cli/sessions/:id/review-candidate — submit_review_candidate
  if (resource === "review-candidate" && req.method === "POST") {
    handleSubmitReviewCandidate(sessionId, req, res);
    return true;
  }

  // POST /cli/sessions/:id/close — close_session
  if (resource === "close" && req.method === "POST") {
    handleCloseSession(sessionId, res);
    return true;
  }

  // GET /cli/sessions/:id/dispatch-events — list events (filter by ?status=)
  if (resource === "dispatch-events" && !resourceId && req.method === "GET") {
    handleListDispatchEvents(sessionId, url, res);
    return true;
  }

  // POST /cli/sessions/:id/dispatch-events/:eventId/claim
  if (resource === "dispatch-events" && resourceId && action === "claim" && req.method === "POST") {
    handleDispatchEventAction(sessionId, resourceId, "pending", "delivering", res);
    return true;
  }

  // POST /cli/sessions/:id/dispatch-events/:eventId/complete
  if (resource === "dispatch-events" && resourceId && action === "complete" && req.method === "POST") {
    handleDispatchEventAction(sessionId, resourceId, "delivering", "handled", res);
    return true;
  }

  // POST /cli/sessions/:id/dispatch-events/:eventId/fail
  if (resource === "dispatch-events" && resourceId && action === "fail" && req.method === "POST") {
    handleDispatchEventFail(sessionId, resourceId, req, res);
    return true;
  }

  sendError(res, 404, "NOT_FOUND", "Unknown CLI route");
  return true;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function handleCreateSession(req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((body) => {
    const { title, initialContent } = JSON.parse(body) as { title: string; initialContent: string };
    if (!title || !initialContent) {
      sendError(res, 400, "INVALID_STATE", "title and initialContent are required");
      return;
    }
    const sessionId = `session-${Date.now()}`;
    const snapshot = createSession(sessionId, title, initialContent);
    saveHistoryVersion(sessionId, {
      versionId: "v0",
      versionNumber: 0,
      createdAt: snapshot.versionHistory[0]?.createdAt ?? new Date().toISOString(),
      content: initialContent,
    });
    broadcast(sessionId, "session.snapshot", snapshot);
    console.log(`  CLI create_session → ${sessionId}`);
    auditWrite(sessionId, "01-initialContent.md", initialContent);
    auditWrite(sessionId, "00-meta.json", JSON.stringify({ sessionId, title, createdAt: new Date().toISOString() }, null, 2));
    const frontendUrl = `${FRONTEND_URL}?sessionId=${sessionId}`;
    sendJson(res, { ok: true, sessionId, frontendUrl });
  }).catch(() => sendError(res, 400, "INTERNAL_ERROR", "Invalid request body"));
}

function handleGetSnapshot(sessionId: string, res: ServerResponse): void {
  const snapshot = getSession(sessionId);
  if (!snapshot) { sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`); return; }
  auditSnapshotOnce(sessionId, snapshot);
  sendJson(res, snapshot);
}

const auditedSessions = new Set<string>();
function auditSnapshotOnce(sessionId: string, snapshot: { currentContent: string; activeBullets: unknown[] }): void {
  if (auditedSessions.has(sessionId)) return;
  auditedSessions.add(sessionId);
  auditWrite(sessionId, "01-snapshot-initial.json", JSON.stringify(snapshot, null, 2));
}

function handleSetThread(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((body) => {
    const { subagentThreadId } = JSON.parse(body) as { subagentThreadId: string };
    if (!subagentThreadId) { sendError(res, 400, "INVALID_STATE", "subagentThreadId is required"); return; }
    const snapshot = getSession(sessionId);
    if (!snapshot) { sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`); return; }
    setSession(sessionId, { ...snapshot, subagentThreadId });
    console.log(`  CLI set_thread → ${sessionId} threadId=${subagentThreadId}`);
    sendJson(res, { ok: true });
  }).catch(() => sendError(res, 400, "INTERNAL_ERROR", "Invalid request body"));
}

function handleMarkBulletReady(sessionId: string, bulletId: string, res: ServerResponse): void {
  const snapshot = getSession(sessionId);
  if (!snapshot) { sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`); return; }
  if (snapshot.sessionStatus === "closed") {
    sendError(res, 409, "SESSION_CLOSED", "Session is already closed");
    return;
  }

  const bullet = snapshot.activeBullets.find((b) => b.bulletId === bulletId);
  if (!bullet) { sendError(res, 404, "NOT_FOUND", `Bullet ${bulletId} not found`); return; }
  if (bullet.status !== "processing") {
    sendError(res, 409, "INVALID_STATE", `Bullet is ${bullet.status}, expected processing`);
    return;
  }

  const next = setSession(sessionId, {
    ...snapshot,
    activeBullets: snapshot.activeBullets.map((b) =>
      b.bulletId === bulletId ? { ...b, status: "ready" as const } : b,
    ),
  });

  broadcast(sessionId, "bullet.status_changed", { bulletId, status: "ready" });
  broadcast(sessionId, "session.snapshot", next);
  console.log(`  CLI mark_bullet_ready → ${bulletId}`);
  sendJson(res, { ok: true });
}

function handleSubmitReviewCandidate(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((body) => {
    const { candidateContent } = JSON.parse(body) as { candidateContent: string };
    if (!candidateContent) {
      sendError(res, 400, "INVALID_STATE", "candidateContent is required");
      return;
    }

    const snapshot = getSession(sessionId);
    if (!snapshot) { sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`); return; }
    if (snapshot.sessionStatus !== "proceeding") {
      sendError(res, 409, "INVALID_STATE", `Session is ${snapshot.sessionStatus}, expected proceeding`);
      return;
    }

    const total = snapshot.proceeding?.total ?? 1;

    // Emit stage progression so the frontend animation completes before review opens
    let s = setSession(sessionId, updateProceedingStage(snapshot, "synthesizing_changes"));
    s = setSession(sessionId, updateProceedingProgress(s, Math.ceil(total * 0.5), total));
    broadcast(sessionId, "proceed.stage_changed", { stage: "synthesizing_changes" });
    broadcast(sessionId, "proceed.progress_updated", { completed: Math.ceil(total * 0.5), total });

    s = setSession(sessionId, updateProceedingStage(s, "materializing_review"));
    s = setSession(sessionId, updateProceedingProgress(s, total, total));
    broadcast(sessionId, "proceed.stage_changed", { stage: "materializing_review" });
    broadcast(sessionId, "proceed.progress_updated", { completed: total, total });

    const reviewChangeSetId = `changeset-${s.workingSetRevision}`;
    const changeSet = buildReviewChangeSetFromCandidate(
      reviewChangeSetId,
      s.workingSetRevision,
      s.baseVersionId ?? s.currentVersionId,
      s.currentContent,
      candidateContent,
      s.documentUnits,
    );
    const next = setSession(sessionId, completeProceeding(s, changeSet));

    broadcast(sessionId, "review_change_set.created", changeSet);
    broadcast(sessionId, "session.snapshot", next);
    console.log(`  CLI submit_review_candidate → ${changeSet.changes.length} changes`);
    const round = snapshot.workingSetRevision;
    auditWrite(sessionId, `02-candidate-r${round}.md`, candidateContent);
    auditWrite(sessionId, `03-currentContent-r${round}.md`, snapshot.currentContent);
    auditWrite(sessionId, `04-changeSet-r${round}.json`, JSON.stringify(changeSet, null, 2));
    sendJson(res, {
      ok: true,
      reviewChangeSetId,
      changeCount: changeSet.changes.length,
    });
  }).catch(() => sendError(res, 400, "INTERNAL_ERROR", "Invalid request body"));
}

function handleCloseSession(sessionId: string, res: ServerResponse): void {
  const snapshot = getSession(sessionId);
  if (!snapshot) { sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`); return; }

  const next = setSession(sessionId, closeSession(snapshot));
  broadcast(sessionId, "session.closed", {});
  broadcast(sessionId, "session.snapshot", next);
  console.log(`  CLI close_session → ${sessionId}`);
  sendJson(res, { ok: true });
}

// ─── Dispatch queue handlers ─────────────────────────────────────────────────

function handleListDispatchEvents(sessionId: string, url: URL, res: ServerResponse): void {
  const status = url.searchParams.get("status") ?? undefined;
  const events = getDispatchEvents(sessionId, status as Parameters<typeof getDispatchEvents>[1]);
  sendJson(res, { events });
}

function handleDispatchEventAction(
  sessionId: string,
  eventId: string,
  expectedStatus: "pending" | "delivering",
  nextStatus: "delivering" | "handled",
  res: ServerResponse,
): void {
  const transition = transitionDispatchEventStatus(sessionId, eventId, expectedStatus, nextStatus);
  if (!transition.ok) {
    if (transition.reason === "not_found") {
      sendError(res, 404, "NOT_FOUND", `Dispatch event ${eventId} not found`);
      return;
    }
    sendError(
      res,
      409,
      "INVALID_STATE",
      `Dispatch event ${eventId} is ${transition.currentStatus}, expected ${expectedStatus}`,
    );
    return;
  }
  console.log(`  CLI dispatch-event ${eventId} → ${nextStatus}`);
  sendJson(res, { ok: true, eventId, status: nextStatus });
}

function handleDispatchEventFail(sessionId: string, eventId: string, req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((body) => {
    const { reason } = body ? (JSON.parse(body) as { reason?: string }) : {};
    const transition = transitionDispatchEventStatus(
      sessionId,
      eventId,
      "delivering",
      "failed",
      reason ?? "unknown",
    );
    if (!transition.ok) {
      if (transition.reason === "not_found") {
        sendError(res, 404, "NOT_FOUND", `Dispatch event ${eventId} not found`);
        return;
      }
      sendError(
        res,
        409,
        "INVALID_STATE",
        `Dispatch event ${eventId} is ${transition.currentStatus}, expected delivering`,
      );
      return;
    }
    console.log(`  CLI dispatch-event ${eventId} → failed: ${reason ?? "unknown"}`);
    sendJson(res, { ok: true, eventId, status: "failed" });
  }).catch(() => sendError(res, 400, "INTERNAL_ERROR", "Invalid request body"));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, code: BlackboardErrorCode, message: string): void {
  const envelope: ErrorEnvelope = { ok: false, error: { code, message, recoverable: true } };
  sendJson(res, envelope, status);
}

function probeFrontend(frontendUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(frontendUrl);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(frontendUrl, { timeout: 2000 }, (res) => {
      resolve((res.statusCode ?? 0) < 500);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function decodePathSegment(segment: string | undefined): string | undefined {
  if (segment === undefined) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function getBackendUrl(req: IncomingMessage): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host = req.headers.host;
  if (host) {
    return `${proto ?? "http"}://${host}`;
  }
  return process.env.BACKEND_URL ?? "http://localhost:3001";
}

// ─── Audit logging ───────────────────────────────────────────────────────────

const AUDIT_DIR = join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".blackboard", "audit");

function auditWrite(sessionId: string, filename: string, content: string): void {
  try {
    const dir = join(AUDIT_DIR, sessionId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content, "utf-8");
  } catch {
    // Non-fatal
  }
}
