import type { ViteDevServer } from "vite";
import { activeSnapshot } from "./src/fixtures/active";
import type {
  BlackboardErrorCode,
  Bullet,
  CommandAcceptedEnvelope,
  CommandEnvelope,
  ErrorEnvelope,
  EventEnvelope,
  ProceedingStage,
  SessionSnapshot,
} from "./src/types/blackboard";
import { historyVersions } from "./src/fixtures/historyVersions";
import {
  buildDefaultReviewChangeSet,
  closeSession,
  commitDocumentUnitEdit,
  completeProceeding,
  createDocumentUnitComment,
  resolveAllReviewChanges,
  resolveReviewChange,
  restoreVersionSnapshot,
  startProceeding,
  updateProceedingProgress,
  updateProceedingStage,
} from "./src/app/sessionModel";

type ServerResponse = {
  end: (body?: string) => void;
  setHeader: (name: string, value: string) => void;
  statusCode: number;
  write: (body: string) => void;
};

type ServerRequest = {
  method?: string;
  on: (event: string, callback: (chunk?: unknown) => void) => void;
  url?: string;
};

interface SseClient {
  id: string;
  response: ServerResponse;
  sessionId: string;
}

const clients = new Set<SseClient>();
const snapshots = new Map<string, SessionSnapshot>();
let eventCounter = 0;

export function blackboardMockProtocolPlugin() {
  return {
    name: "blackboard-mock-protocol",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request: ServerRequest, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const match = url.pathname.match(
          /^\/api\/sessions\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/,
        );

        if (!match) {
          next();
          return;
        }

        const sessionId = match[1] ?? "demo";
        const resource = match[2];
        const resourceId = match[3];

        if (resource === "events" && request.method === "GET") {
          openEventStream(sessionId, response as ServerResponse, request);
          return;
        }

        if (resource === "commands" && request.method === "POST") {
          handleCommand(sessionId, request, response as ServerResponse);
          return;
        }

        if (resource === "history" && resourceId && request.method === "GET") {
          sendJson(response as ServerResponse, historyVersions[resourceId]);
          return;
        }

        sendError(response as ServerResponse, 404, "NOT_FOUND", "Unknown route");
      });
    },
  };
}

function openEventStream(
  sessionId: string,
  response: ServerResponse,
  request: ServerRequest,
) {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache");
  response.setHeader("connection", "keep-alive");
  response.write("\n");

  const client = {
    id: `client-${++eventCounter}`,
    response,
    sessionId,
  };

  clients.add(client);
  sendEventToClient(client, "session.snapshot", getSnapshot(sessionId));
  request.on("close", () => clients.delete(client));
}

function handleCommand(
  sessionId: string,
  request: ServerRequest,
  response: ServerResponse,
) {
  readBody(request)
    .then((body) => {
      const command = JSON.parse(body) as CommandEnvelope;
      const error = validateCommand(command, getSnapshot(sessionId));

      if (error) {
        sendJson(response, error, 409);
        return;
      }

      const accepted: CommandAcceptedEnvelope = {
        ok: true,
        commandId: command.commandId,
        acceptedAt: new Date().toISOString(),
      };

      sendJson(response, accepted);
      windowlessSetTimeout(() => applyCommand(sessionId, command), 0);
    })
    .catch(() =>
      sendError(response, 400, "INTERNAL_ERROR", "Invalid command payload"),
    );
}

function validateCommand(
  command: CommandEnvelope,
  snapshot: SessionSnapshot,
): ErrorEnvelope | null {
  if (snapshot.sessionStatus === "closed") {
    return errorEnvelope("SESSION_CLOSED", "Session is already closed", false);
  }

  if (
    "workingSetRevision" in (command.payload as object) &&
    (command.payload as { workingSetRevision: number }).workingSetRevision !==
      snapshot.workingSetRevision
  ) {
    return errorEnvelope(
      "REVISION_MISMATCH",
      "Command was issued against an old working set revision",
      true,
    );
  }

  if (
    command.type === "session.proceed" &&
    snapshot.sessionStatus === "proceeding"
  ) {
    return errorEnvelope("PROCEED_IN_PROGRESS", "Proceed is already running", true);
  }

  return null;
}

function applyCommand(sessionId: string, command: CommandEnvelope) {
  let snapshot = getSnapshot(sessionId);

  switch (command.type) {
    case "document_unit.edit.commit": {
      const before = snapshot.activeBullets;
      const payload = command.payload as { markdown: string; unitId: string };
      snapshot = setSnapshot(
        sessionId,
        commitDocumentUnitEdit(snapshot, payload.unitId, payload.markdown),
      );
      const createdBullet = findCreatedBullet(before, snapshot.activeBullets);

      broadcast(sessionId, "document_unit.updated", {
        currentContent: snapshot.currentContent,
        documentUnits: snapshot.documentUnits,
        title: snapshot.title,
        workingSetRevision: snapshot.workingSetRevision,
      });

      if (createdBullet) {
        broadcast(sessionId, "bullet.created", createdBullet);
      }

      broadcast(sessionId, "session.snapshot", snapshot);
      break;
    }
    case "bullet.comment.create": {
      const before = snapshot.activeBullets;
      const payload = command.payload as {
        anchorTextSnapshot?: string;
        content: string;
        unitId: string;
      };
      snapshot = setSnapshot(
        sessionId,
        createDocumentUnitComment(
          snapshot,
          payload.unitId,
          payload.anchorTextSnapshot ?? "",
          payload.content,
        ),
      );
      const createdBullet = findCreatedBullet(before, snapshot.activeBullets);

      if (createdBullet) {
        broadcast(sessionId, "bullet.created", createdBullet);
      }

      broadcast(sessionId, "session.snapshot", snapshot);
      break;
    }
    case "session.proceed":
      startProceedFlow(sessionId);
      break;
    case "review.change.accept":
      applyReviewCommand(sessionId, command, "accepted");
      break;
    case "review.change.reject":
      applyReviewCommand(sessionId, command, "rejected");
      break;
    case "review.accept_all_remaining":
      snapshot = setSnapshot(
        sessionId,
        resolveAllReviewChanges(snapshot, "accepted"),
      );
      broadcast(sessionId, "review.resolved", snapshot);
      broadcast(sessionId, "session.snapshot", snapshot);
      break;
    case "review.reject_all_remaining":
      snapshot = setSnapshot(
        sessionId,
        resolveAllReviewChanges(snapshot, "rejected"),
      );
      broadcast(sessionId, "review.resolved", snapshot);
      broadcast(sessionId, "session.snapshot", snapshot);
      break;
    case "history.restore_version": {
      const payload = command.payload as { versionId: string };
      const version = historyVersions[payload.versionId];

      if (!version) {
        broadcast(sessionId, "error.raised", {
          code: "NOT_FOUND",
          message: "History version not found",
          recoverable: true,
        });
        return;
      }

      snapshot = setSnapshot(
        sessionId,
        restoreVersionSnapshot(
          snapshot,
          version.versionId,
          version.documentUnits,
          version.content,
        ),
      );
      broadcast(sessionId, "working_set.rebased", snapshot);
      broadcast(sessionId, "session.snapshot", snapshot);
      break;
    }
    case "session.request_close":
      windowlessSetTimeout(() => {
        const snapshot = setSnapshot(sessionId, closeSession(getSnapshot(sessionId)));
        broadcast(sessionId, "session.closed", {});
        broadcast(sessionId, "session.snapshot", snapshot);
      }, 350);
      break;
    default:
      broadcast(sessionId, "error.raised", {
        code: "INVALID_STATE",
        message: `Unsupported command ${command.type}`,
        recoverable: true,
      });
  }
}

function startProceedFlow(sessionId: string) {
  let snapshot = setSnapshot(sessionId, startProceeding(getSnapshot(sessionId)));

  if (snapshot.sessionStatus !== "proceeding") {
    broadcast(sessionId, "error.raised", {
      code: "INVALID_STATE",
      message: "Proceed requires an active session with at least one bullet",
      recoverable: true,
    });
    return;
  }

  broadcast(sessionId, "proceed.started", snapshot.proceeding);
  broadcast(sessionId, "session.snapshot", snapshot);

  const total = snapshot.proceeding?.total ?? 1;
  const stages: Array<[number, ProceedingStage, number]> = [
    [260, "resolving_bullets", 1],
    [720, "synthesizing_changes", Math.max(1, Math.ceil(total * 0.66))],
    [1180, "materializing_review", total],
  ];

  for (const [delay, stage, completed] of stages) {
    windowlessSetTimeout(() => {
      let snapshot = setSnapshot(
        sessionId,
        updateProceedingStage(getSnapshot(sessionId), stage),
      );
      snapshot = setSnapshot(
        sessionId,
        updateProceedingProgress(snapshot, completed, total),
      );
      broadcast(sessionId, "proceed.stage_changed", { stage });
      broadcast(sessionId, "proceed.progress_updated", { completed, total });
    }, delay);
  }

  windowlessSetTimeout(() => {
    const snapshot = getSnapshot(sessionId);
    const changeSet = buildDefaultReviewChangeSet(
      `changeset-${snapshot.workingSetRevision}`,
    );
    const nextSnapshot = setSnapshot(
      sessionId,
      completeProceeding(snapshot, changeSet),
    );
    broadcast(sessionId, "review_change_set.created", changeSet);
    broadcast(sessionId, "session.snapshot", nextSnapshot);
  }, 1550);
}

function applyReviewCommand(
  sessionId: string,
  command: CommandEnvelope,
  status: "accepted" | "rejected",
) {
  const payload = command.payload as { changeId: string };
  const snapshot = setSnapshot(
    sessionId,
    resolveReviewChange(getSnapshot(sessionId), payload.changeId, status),
  );

  broadcast(sessionId, "review.change_status_changed", {
    changeId: payload.changeId,
    status,
  });

  if (snapshot.sessionStatus === "active") {
    broadcast(sessionId, "review.resolved", snapshot);
  }

  broadcast(sessionId, "session.snapshot", snapshot);
}

function broadcast(sessionId: string, type: string, payload: unknown) {
  const event: EventEnvelope = {
    eventId: `evt-${++eventCounter}`,
    type,
    sessionId,
    occurredAt: new Date().toISOString(),
    payload,
  };

  for (const client of clients) {
    if (client.sessionId === sessionId) {
      sendEventToClient(client, type, payload, event);
    }
  }
}

function sendEventToClient(
  client: SseClient,
  type: string,
  payload: unknown,
  event?: EventEnvelope,
) {
  const envelope =
    event ??
    ({
      eventId: `evt-${++eventCounter}`,
      type,
      sessionId: client.sessionId,
      occurredAt: new Date().toISOString(),
      payload,
    } satisfies EventEnvelope);

  client.response.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

function findCreatedBullet(before: Bullet[], after: Bullet[]): Bullet | null {
  const beforeIds = new Set(before.map((bullet) => bullet.bulletId));

  return after.find((bullet) => !beforeIds.has(bullet.bulletId)) ?? null;
}

function withSessionId(
  sourceSnapshot: SessionSnapshot,
  sessionId: string,
): SessionSnapshot {
  return {
    ...structuredClone(sourceSnapshot),
    sessionId,
  };
}

function getSnapshot(sessionId: string): SessionSnapshot {
  const snapshot = snapshots.get(sessionId);

  if (snapshot) {
    return snapshot;
  }

  return setSnapshot(sessionId, activeSnapshot);
}

function setSnapshot(
  sessionId: string,
  sourceSnapshot: SessionSnapshot,
): SessionSnapshot {
  const snapshot = withSessionId(sourceSnapshot, sessionId);
  snapshots.set(sessionId, snapshot);
  return snapshot;
}

function readBody(request: ServerRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    request.on("data", (chunk) => chunks.push(String(chunk ?? "")));
    request.on("end", () => resolve(chunks.join("")));
    request.on("error", () => reject(new Error("request failed")));
  });
}

function sendJson(
  response: ServerResponse,
  body: unknown,
  statusCode = body ? 200 : 404,
) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body ?? errorEnvelope("NOT_FOUND", "Not found", true)));
}

function sendError(
  response: ServerResponse,
  statusCode: number,
  code: BlackboardErrorCode,
  message: string,
) {
  sendJson(response, errorEnvelope(code, message, true), statusCode);
}

function errorEnvelope(
  code: BlackboardErrorCode,
  message: string,
  recoverable: boolean,
): ErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      message,
      recoverable,
    },
  };
}

function windowlessSetTimeout(callback: () => void, delay: number) {
  setTimeout(callback, delay);
}
