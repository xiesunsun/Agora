import type {
  Bullet,
  BulletStatus,
  EventEnvelope,
  ProceedingStage,
  ReviewChangeSet,
  SessionSnapshot,
  VersionSummaryItem,
} from "../types/blackboard";
import {
  closeSession,
  completeProceeding,
  resolveReviewChange,
  updateProceedingProgress,
  updateProceedingStage,
} from "./sessionModel";

interface DocumentUnitUpdatedPayload {
  currentContent: SessionSnapshot["currentContent"];
  documentUnits: SessionSnapshot["documentUnits"];
  title?: SessionSnapshot["title"];
  workingSetRevision: SessionSnapshot["workingSetRevision"];
}

interface BulletStatusChangedPayload {
  bulletId: string;
  status: BulletStatus;
}

interface ProceedStageChangedPayload {
  stage: ProceedingStage;
}

interface ProceedProgressUpdatedPayload {
  completed: number;
  total: number;
}

interface ReviewChangeStatusChangedPayload {
  changeId: string;
  status: "accepted" | "rejected";
}

export function reduceSessionEvent(
  snapshot: SessionSnapshot,
  event: EventEnvelope,
): SessionSnapshot {
  switch (event.type) {
    case "session.snapshot":
      return event.payload as SessionSnapshot;
    case "document_unit.updated": {
      const payload = event.payload as DocumentUnitUpdatedPayload;

      return {
        ...snapshot,
        title: payload.title ?? snapshot.title,
        currentContent: payload.currentContent,
        documentUnits: payload.documentUnits,
        workingSetRevision: payload.workingSetRevision,
      };
    }
    case "bullet.created":
      return {
        ...snapshot,
        activeBullets: [...snapshot.activeBullets, event.payload as Bullet],
      };
    case "bullet.status_changed": {
      const payload = event.payload as BulletStatusChangedPayload;

      return {
        ...snapshot,
        activeBullets: snapshot.activeBullets.map((bullet) =>
          bullet.bulletId === payload.bulletId
            ? { ...bullet, status: payload.status }
            : bullet,
        ),
      };
    }
    case "working_set.rebased":
      return event.payload as SessionSnapshot;
    case "proceed.started":
      return {
        ...snapshot,
        sessionStatus: "proceeding",
        proceeding:
          (event.payload as SessionSnapshot["proceeding"]) ??
          snapshot.proceeding,
      };
    case "proceed.stage_changed":
      return updateProceedingStage(
        snapshot,
        (event.payload as ProceedStageChangedPayload).stage,
      );
    case "proceed.progress_updated": {
      const payload = event.payload as ProceedProgressUpdatedPayload;

      return updateProceedingProgress(snapshot, payload.completed, payload.total);
    }
    case "review_change_set.created":
      return completeProceeding(snapshot, event.payload as ReviewChangeSet);
    case "review.change_status_changed": {
      const payload = event.payload as ReviewChangeStatusChangedPayload;

      return resolveReviewChange(snapshot, payload.changeId, payload.status);
    }
    case "review.resolved":
      return "sessionStatus" in (event.payload as object)
        ? (event.payload as SessionSnapshot)
        : snapshot;
    case "version.created":
      return {
        ...snapshot,
        versionHistory: [
          ...snapshot.versionHistory,
          event.payload as VersionSummaryItem,
        ],
      };
    case "session.closed":
      return closeSession(snapshot);
    case "error.raised":
      return snapshot;
    default:
      return snapshot;
  }
}
