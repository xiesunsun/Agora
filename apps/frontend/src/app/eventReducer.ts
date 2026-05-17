import type {
  Bullet,
  BulletStatus,
  EventEnvelope,
  ProceedingStage,
  ReviewChangeStatusChangedPayload,
  ReviewChangeSet,
  ReviewResolvedPayload,
  SessionSnapshot,
  VersionCreatedPayload,
  VersionSummaryItem,
} from "../types/blackboard";
import {
  closeSession,
  completeProceeding,
  decorateBullet,
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

function appendVersionSummary(
  versions: VersionSummaryItem[],
  version: VersionSummaryItem,
): VersionSummaryItem[] {
  if (versions.some((candidate) => candidate.versionId === version.versionId)) {
    return versions;
  }

  return [...versions, version];
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
        activeBullets: [
          ...snapshot.activeBullets,
          decorateBullet(
            event.payload as Bullet,
            snapshot.documentUnits,
            snapshot.activeBullets,
          ),
        ],
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

      if (
        !snapshot.activeReviewChangeSet ||
        snapshot.activeReviewChangeSet.reviewChangeSetId !==
          payload.reviewChangeSetId
      ) {
        return snapshot;
      }

      return {
        ...snapshot,
        activeReviewChangeSet: {
          ...snapshot.activeReviewChangeSet,
          changes: snapshot.activeReviewChangeSet.changes.map((change) =>
            change.changeId === payload.changeId
              ? { ...change, status: payload.toStatus }
              : change,
          ),
        },
      };
    }
    case "review.resolved": {
      const payload = event.payload as ReviewResolvedPayload;

      if (
        !snapshot.activeReviewChangeSet ||
        snapshot.activeReviewChangeSet.reviewChangeSetId !==
          payload.reviewChangeSetId
      ) {
        return snapshot;
      }

      return {
        ...snapshot,
        sessionStatus: "active",
        activeBullets: [],
        activeReviewChangeSet: null,
        proceeding: null,
        baseVersionId:
          payload.resolution === "version_created"
            ? payload.versionId
            : snapshot.baseVersionId,
        currentVersionId:
          payload.resolution === "version_created"
            ? payload.versionId
            : snapshot.currentVersionId,
      };
    }
    case "version.created":
      return {
        ...snapshot,
        versionHistory: appendVersionSummary(
          snapshot.versionHistory,
          (event.payload as VersionCreatedPayload).version,
        ),
      };
    case "session.closed":
      return closeSession(snapshot);
    case "error.raised":
      return snapshot;
    default:
      return snapshot;
  }
}
