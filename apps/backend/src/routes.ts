import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  BlackboardErrorCode,
  CommandAcceptedEnvelope,
  CommandEnvelope,
  ErrorEnvelope,
  ProceedingStage,
  SessionSnapshot,
} from "./types.js";
import { broadcast, openSseStream, sendToClient } from "./sseManager.js";
import {
  getHistoryVersion,
  getOrCreateDemoSession,
  getSession,
  saveHistoryVersion,
  setSession,
} from "./sessionStore.js";
import { maybeDispatch } from "./hostDispatcher.js";
import {
  buildReviewChangeSetFromCandidate,
  closeSession,
  commitDocumentUnitEdit,
  completeProceeding,
  createDocumentUnitComment,
  resolveAllReviewChangesWithSettlement,
  resolveReviewChangeWithSettlement,
  type ReviewSettlementResult,
  restoreVersionSnapshot,
  startProceeding,
  updateProceedingProgress,
  updateProceedingStage,
} from "./sessionModel.js";

// ─── URL routing ────────────────────────────────────────────────────────────

const SESSION_RE = /^\/api\/sessions\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/;

export function handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  const m = SESSION_RE.exec(url.pathname);
  if (!m) return false;

  const sessionId = m[1]!;
  const resource = m[2];
  const resourceId = m[3];

  if (resource === "events" && req.method === "GET") {
    handleEvents(sessionId, req, res);
    return true;
  }
  if (resource === "snapshot" && req.method === "GET") {
    handleSnapshot(sessionId, res);
    return true;
  }
  if (resource === "commands" && req.method === "POST") {
    handleCommand(sessionId, req, res);
    return true;
  }
  if (resource === "history" && resourceId && req.method === "GET") {
    handleHistory(sessionId, resourceId, res);
    return true;
  }

  sendError(res, 404, "NOT_FOUND", "Unknown route");
  return true;
}

// ─── SSE events ─────────────────────────────────────────────────────────────

function handleEvents(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
  const snapshot =
    sessionId === "demo" ? getOrCreateDemoSession() : getSession(sessionId);

  if (!snapshot) {
    sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`);
    return;
  }

  const client = openSseStream(sessionId, res, () => {});
  sendToClient(client, "session.snapshot", snapshot);
}

// ─── History query ───────────────────────────────────────────────────────────

function handleSnapshot(sessionId: string, res: ServerResponse): void {
  const snapshot =
    sessionId === "demo" ? getOrCreateDemoSession() : getSession(sessionId);

  if (!snapshot) {
    sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`);
    return;
  }

  sendJson(res, snapshot);
}

function handleHistory(sessionId: string, versionId: string, res: ServerResponse): void {
  const version = getHistoryVersion(sessionId, versionId);
  if (!version) { sendError(res, 404, "NOT_FOUND", `Version ${versionId} not found`); return; }
  sendJson(res, version);
}

// ─── Command dispatch ────────────────────────────────────────────────────────

function handleCommand(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((body) => {
    const command = JSON.parse(body) as CommandEnvelope;
    const snapshot = getSession(sessionId);

    if (!snapshot) { sendError(res, 404, "NOT_FOUND", `Session ${sessionId} not found`); return; }

    const err = validateCommand(sessionId, command, snapshot);
    if (err) { sendJson(res, err, 409); return; }

    console.log(`  ↑ command [${sessionId}] ${command.type}`);
    const accepted: CommandAcceptedEnvelope = {
      ok: true,
      commandId: command.commandId,
      acceptedAt: new Date().toISOString(),
    };
    sendJson(res, accepted);
    setImmediate(() => applyCommand(sessionId, command));
  }).catch(() => sendError(res, 400, "INTERNAL_ERROR", "Invalid request body"));
}

function validateCommand(sessionId: string, command: CommandEnvelope, snapshot: SessionSnapshot): ErrorEnvelope | null {
  if (command.sessionId !== sessionId) {
    return errEnvelope("INVALID_STATE", "Command sessionId does not match request path", false);
  }

  if (snapshot.sessionStatus === "closed")
    return errEnvelope("SESSION_CLOSED", "Session is already closed", false);

  const payload = command.payload as Record<string, unknown>;
  if (typeof payload.workingSetRevision === "number" && payload.workingSetRevision !== snapshot.workingSetRevision)
    return errEnvelope("REVISION_MISMATCH", "Command issued against an old working set revision", true);

  if (command.type === "session.proceed" && snapshot.sessionStatus === "proceeding")
    return errEnvelope("PROCEED_IN_PROGRESS", "Proceed is already running", true);

  if (command.type === "session.proceed" && snapshot.activeBullets.length === 0) {
    return errEnvelope(
      "INVALID_STATE",
      "Proceed requires at least one bullet",
      true,
    );
  }

  if (isReviewCommand(command.type)) {
    const changeSet = snapshot.activeReviewChangeSet;
    if (snapshot.sessionStatus !== "reviewing" || !changeSet) {
      return errEnvelope("REVIEW_NOT_OPEN", "Review is not open", false);
    }

    const reviewChangeSetId = payload.reviewChangeSetId;
    if (reviewChangeSetId !== changeSet.reviewChangeSetId) {
      return errEnvelope("INVALID_STATE", "Command does not target the active review change set", true);
    }

    if (command.type === "review.change.accept" || command.type === "review.change.reject") {
      const changeId = payload.changeId;
      const change = changeSet.changes.find((candidate) => candidate.changeId === changeId);

      if (!change) {
        return errEnvelope("NOT_FOUND", `Change ${String(changeId)} not found`, true);
      }

      if (change.status !== "pending") {
        return errEnvelope("INVALID_STATE", `Change is ${change.status}, expected pending`, true);
      }
    }
  }

  return null;
}

function applyCommand(sessionId: string, command: CommandEnvelope): void {
  const snapshot = getSession(sessionId);
  if (!snapshot) return;

  const payload = command.payload as Record<string, unknown>;

  switch (command.type) {
    case "document_unit.edit.commit": {
      const next = setSession(sessionId, commitDocumentUnitEdit(snapshot, payload.unitId as string, payload.markdown as string));
      const newBullet = next.activeBullets.find((b) => !snapshot.activeBullets.some((ob) => ob.bulletId === b.bulletId));
      broadcast(sessionId, "document_unit.updated", { currentContent: next.currentContent, documentUnits: next.documentUnits, workingSetRevision: next.workingSetRevision });
      if (newBullet) broadcast(sessionId, "bullet.created", newBullet);
      broadcast(sessionId, "session.snapshot", next);
      if (newBullet) dispatchBulletForHost(sessionId, newBullet);
      break;
    }
    case "bullet.comment.create": {
      const next = setSession(
        sessionId,
        createDocumentUnitComment(
          snapshot,
          payload.unitId as string,
          (payload.anchorTextSnapshot as string) ?? "",
          payload.content as string,
          typeof payload.anchorStartOffset === "number" ? payload.anchorStartOffset : undefined,
          typeof payload.anchorEndOffset === "number" ? payload.anchorEndOffset : undefined,
        ),
      );
      const newBullet = next.activeBullets.find((b) => !snapshot.activeBullets.some((ob) => ob.bulletId === b.bulletId));
      if (newBullet) broadcast(sessionId, "bullet.created", newBullet);
      broadcast(sessionId, "session.snapshot", next);
      if (newBullet) dispatchBulletForHost(sessionId, newBullet);
      break;
    }
    case "session.proceed":
      startProceedFlow(sessionId);
      break;
    case "review.change.accept":
      applyReviewCommand(sessionId, payload.changeId as string, "accepted");
      break;
    case "review.change.reject":
      applyReviewCommand(sessionId, payload.changeId as string, "rejected");
      break;
    case "review.accept_all_remaining": {
      const changeSet = snapshot.activeReviewChangeSet;
      const pendingChanges = changeSet?.changes.filter((change) => change.status === "pending") ?? [];
      const result = resolveAllReviewChangesWithSettlement(snapshot, "accepted");
      const next = setSession(sessionId, result.snapshot);
      broadcastBulkReviewStatusChanges(sessionId, changeSet?.reviewChangeSetId, pendingChanges, "accepted");
      const resolvedChanges = changeSet?.changes.map((c) => ({ ...c, status: c.status === "pending" ? "accepted" : c.status }));
      broadcastReviewSettlement(sessionId, result, { changes: resolvedChanges ?? [] });
      broadcast(sessionId, "session.snapshot", next);
      break;
    }
    case "review.reject_all_remaining": {
      const changeSet = snapshot.activeReviewChangeSet;
      const pendingChanges = changeSet?.changes.filter((change) => change.status === "pending") ?? [];
      const result = resolveAllReviewChangesWithSettlement(snapshot, "rejected");
      const next = setSession(sessionId, result.snapshot);
      broadcastBulkReviewStatusChanges(sessionId, changeSet?.reviewChangeSetId, pendingChanges, "rejected");
      const resolvedChanges = changeSet?.changes.map((c) => ({ ...c, status: c.status === "pending" ? "rejected" : c.status }));
      broadcastReviewSettlement(sessionId, result, { changes: resolvedChanges ?? [] });
      broadcast(sessionId, "session.snapshot", next);
      break;
    }
    case "history.restore_version": {
      const versionId = payload.versionId as string;
      const version = getHistoryVersion(sessionId, versionId);
      if (!version) { broadcast(sessionId, "error.raised", { code: "NOT_FOUND", message: "Version not found", recoverable: true }); return; }
      const next = setSession(sessionId, restoreVersionSnapshot(snapshot, versionId, version.content));
      broadcastAndDispatch(sessionId, "working_set.rebased", {});
      broadcast(sessionId, "session.snapshot", next);
      break;
    }
    case "session.request_close":
      // Only signals intent; actual close is done by subagent via POST /cli/:id/close
      broadcastAndDispatch(sessionId, "session.close_requested", {});
      broadcast(sessionId, "session.snapshot", snapshot);
      break;
    default:
      broadcast(sessionId, "error.raised", { code: "INVALID_STATE", message: `Unsupported command: ${command.type}`, recoverable: true });
  }
}

function startProceedFlow(sessionId: string): void {
  let snapshot = getSession(sessionId);
  if (!snapshot) return;

  const next = setSession(sessionId, startProceeding(snapshot));
  if (next.sessionStatus !== "proceeding") {
    broadcast(sessionId, "error.raised", { code: "INVALID_STATE", message: "Proceed requires an active session with at least one bullet", recoverable: true });
    return;
  }

  broadcastAndDispatch(sessionId, "proceed.started", next.proceeding);
  broadcast(sessionId, "session.snapshot", next);

  // Stage 1: resolving_bullets — wait for all comment bullets to become ready
  // Poll every 500ms, broadcast progress as each bullet resolves
  const pollInterval = setInterval(() => {
    const s = getSession(sessionId);
    if (!s || s.sessionStatus !== "proceeding") {
      clearInterval(pollInterval);
      return;
    }

    const commentBullets = s.activeBullets.filter((b) => b.type === "comment");
    const readyCount = commentBullets.filter((b) => b.status === "ready" || b.status === "applied").length;
    const total = Math.max(1, s.activeBullets.length);
    // Edit bullets are always "resolved" (they don't need processing)
    const editCount = s.activeBullets.filter((b) => b.type === "edit").length;
    const completed = readyCount + editCount;

    // Update progress
    const updated = setSession(sessionId, updateProceedingProgress(s, completed, total));
    broadcast(sessionId, "proceed.progress_updated", { completed, total });

    // Check if all comment bullets are ready
    const allResolved = commentBullets.every((b) => b.status === "ready" || b.status === "applied");
    if (allResolved) {
      clearInterval(pollInterval);

      // Stage 2: synthesizing_changes
      let s2 = setSession(sessionId, updateProceedingStage(updated, "synthesizing_changes"));
      s2 = setSession(sessionId, updateProceedingProgress(s2, completed, total));
      broadcast(sessionId, "proceed.stage_changed", { stage: "synthesizing_changes" });
      broadcast(sessionId, "proceed.progress_updated", { completed, total });
      broadcast(sessionId, "session.snapshot", s2);

      // Now dispatch proceed_started to subagent (it can now safely get_snapshot and submit candidate)
      // The subagent was already notified via the initial broadcastAndDispatch above.
      // Stage 3 (materializing_review) happens when subagent calls submit_review_candidate.

      if (process.env.ENABLE_PROCEED_MOCK === "true") {
        runProceedMock(sessionId, total);
      } else {
        console.log("  [proceed] all bullets resolved — waiting for subagent to call /cli/.../review-candidate");
      }
    }
  }, 500);

  // Timeout: if bullets don't resolve in 5 minutes, dispatch anyway
  setTimeout(() => {
    clearInterval(pollInterval);
    const s = getSession(sessionId);
    if (!s || s.sessionStatus !== "proceeding") return;
    const total = Math.max(1, s.activeBullets.length);
    let s2 = setSession(sessionId, updateProceedingStage(s, "synthesizing_changes"));
    s2 = setSession(sessionId, updateProceedingProgress(s2, total, total));
    broadcast(sessionId, "proceed.stage_changed", { stage: "synthesizing_changes" });
    broadcast(sessionId, "proceed.progress_updated", { completed: total, total });
    broadcast(sessionId, "session.snapshot", s2);
    console.log("  [proceed] timeout — advancing to synthesizing_changes despite unresolved bullets");
  }, 300_000);
}

function runProceedMock(sessionId: string, total: number): void {
  setTimeout(() => {
    let s = getSession(sessionId);
    if (!s || s.sessionStatus !== "proceeding") return;
    s = setSession(sessionId, updateProceedingStage(s, "materializing_review"));
    s = setSession(sessionId, updateProceedingProgress(s, total, total));
    broadcast(sessionId, "proceed.stage_changed", { stage: "materializing_review" });
    broadcast(sessionId, "proceed.progress_updated", { completed: total, total });
  }, 400);

  setTimeout(() => {
    const s = getSession(sessionId);
    if (!s || s.sessionStatus !== "proceeding") return;
    const reviewChangeSetId = `changeset-${s.workingSetRevision}`;
    const firstParagraph = s.documentUnits.find((u) => u.type === "paragraph");
    const candidateContent = firstParagraph
      ? s.currentContent.replace(
          firstParagraph.markdown,
          firstParagraph.markdown + "（Agent 已根据批注完成修订。）",
        )
      : s.currentContent;
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
    console.log("  [mock] proceed completed with simulated candidate");
  }, 900);
}

function applyReviewCommand(sessionId: string, changeId: string, status: "accepted" | "rejected"): void {
  const snapshot = getSession(sessionId);
  if (!snapshot) return;
  const changeSet = snapshot.activeReviewChangeSet;
  const targetChange = changeSet?.changes.find((change) => change.changeId === changeId);
  const result = resolveReviewChangeWithSettlement(snapshot, changeId, status);
  const next = setSession(sessionId, result.snapshot);
  if (changeSet && targetChange) {
    broadcast(sessionId, "review.change_status_changed", {
      reviewChangeSetId: changeSet.reviewChangeSetId,
      changeId,
      fromStatus: targetChange.status,
      toStatus: status,
    });
  }
  broadcastReviewSettlement(sessionId, result, result.snapshot.activeReviewChangeSet === null
    ? { changes: changeSet?.changes.map((c) => c.changeId === changeId ? { ...c, status } : c) ?? [] }
    : undefined,
  );
  broadcast(sessionId, "session.snapshot", next);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isReviewCommand(type: string): boolean {
  return type === "review.change.accept"
    || type === "review.change.reject"
    || type === "review.accept_all_remaining"
    || type === "review.reject_all_remaining";
}

function broadcastReviewSettlement(
  sessionId: string,
  result: ReviewSettlementResult,
  resolvedChangeSet?: { changes: Array<{ changeId: string; status: string; beforeText: string; afterText: string }> },
): void {
  if (!result.settlement) {
    return;
  }

  for (const bullet of result.settlement.appliedBullets) {
    broadcast(sessionId, "bullet.status_changed", { bulletId: bullet.bulletId, status: "applied" });
  }

  if (result.settlement.historyVersion) {
    saveHistoryVersion(sessionId, result.settlement.historyVersion);
  }

  if (result.settlement.version) {
    broadcast(sessionId, "version.created", { version: result.settlement.version });
  }

  broadcast(sessionId, "review.resolved", result.settlement.reviewResolved);

  // Dispatch to subagent with accept/reject details for preference learning
  const changes = resolvedChangeSet?.changes ?? [];
  const acceptedChanges = changes
    .filter((c) => c.status === "accepted")
    .map((c) => ({ changeId: c.changeId, beforeText: c.beforeText, afterText: c.afterText }));
  const rejectedChanges = changes
    .filter((c) => c.status === "rejected")
    .map((c) => ({ changeId: c.changeId, beforeText: c.beforeText }));

  maybeDispatch(sessionId, "review.resolved", {
    ...result.settlement.reviewResolved,
    acceptedChanges,
    rejectedChanges,
  });
}

function broadcastBulkReviewStatusChanges(
  sessionId: string,
  reviewChangeSetId: string | undefined,
  pendingChanges: Array<{ changeId: string; status: "pending" | "accepted" | "rejected" }>,
  toStatus: "accepted" | "rejected",
): void {
  if (!reviewChangeSetId) {
    return;
  }

  for (const change of pendingChanges) {
    broadcast(sessionId, "review.change_status_changed", {
      reviewChangeSetId,
      changeId: change.changeId,
      fromStatus: change.status,
      toStatus,
    });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/** Broadcast an event and, for dispatchable event types, also notify the host dispatcher. */
function broadcastAndDispatch(sessionId: string, eventType: string, payload: unknown): void {
  broadcast(sessionId, eventType, payload);
  maybeDispatch(sessionId, eventType, payload);
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, code: BlackboardErrorCode, message: string): void {
  sendJson(res, errEnvelope(code, message, true), status);
}

function errEnvelope(code: BlackboardErrorCode, message: string, recoverable: boolean): ErrorEnvelope {
  return { ok: false, error: { code, message, recoverable } };
}

function dispatchBulletForHost(
  sessionId: string,
  bulletForDispatch: { bulletId: string; type: string },
): void {
  if (bulletForDispatch.type === "comment") {
    advanceCommentBulletToProcessing(sessionId, bulletForDispatch.bulletId, bulletForDispatch);
    return;
  }

  maybeDispatch(sessionId, "bullet.created", bulletForDispatch);
  console.log(`  bullet ${bulletForDispatch.bulletId} (${bulletForDispatch.type}) dispatched to host`);
}

function advanceCommentBulletToProcessing(sessionId: string, bulletId: string, bulletForDispatch: unknown): void {
  // new → processing happens automatically after a short delay.
  // Dispatch to host happens AFTER processing so mark_bullet_ready precondition is met.
  setTimeout(() => {
    const s = getSession(sessionId);
    if (!s) return;
    const bullet = s.activeBullets.find((b) => b.bulletId === bulletId);
    if (!bullet || bullet.status !== "new") return;
    const next = setSession(sessionId, {
      ...s,
      activeBullets: s.activeBullets.map((b) =>
        b.bulletId === bulletId ? { ...b, status: "processing" as const } : b,
      ),
    });
    broadcast(sessionId, "bullet.status_changed", { bulletId, status: "processing" });
    broadcast(sessionId, "session.snapshot", next);
    // Dispatch after processing so worker can immediately call mark_bullet_ready
    maybeDispatch(sessionId, "bullet.created", bulletForDispatch);
    console.log(`  bullet ${bulletId} → processing (dispatched to host)`);
  }, 300);
}
