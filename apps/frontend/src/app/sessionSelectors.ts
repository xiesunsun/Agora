import type {
  Bullet,
  BulletVisualStatus,
  DocumentUnit,
  FrontendViewMode,
  PageStatus,
  ReviewMode,
  ReviewChangeSet,
  SessionSnapshot,
} from "../types/blackboard";

export function selectDocumentUnits(snapshot: SessionSnapshot): DocumentUnit[] {
  return [...snapshot.documentUnits].sort((a, b) => a.order - b.order);
}

export function selectActiveBullets(snapshot: SessionSnapshot): Bullet[] {
  return [...snapshot.activeBullets].sort((a, b) => a.railY - b.railY);
}

export function selectBulletVisualStatus(bullet: Bullet): BulletVisualStatus {
  if (bullet.status === "ready" || bullet.status === "applied") {
    return "processed";
  }

  return bullet.status;
}

export function selectActiveReviewChangeSet(
  snapshot: SessionSnapshot,
): ReviewChangeSet | null {
  return snapshot.activeReviewChangeSet;
}

export function selectRevisionLabel(snapshot: SessionSnapshot): string {
  return `${snapshot.currentVersionId} · r${snapshot.workingSetRevision}`;
}

export function selectPageStatus(
  snapshot: SessionSnapshot,
  viewMode: FrontendViewMode,
  reviewMode: ReviewMode,
): PageStatus {
  if (viewMode === "history_preview") {
    return "history_preview";
  }

  if (snapshot.sessionStatus === "reviewing") {
    return reviewMode === "pr" ? "reviewing_pr" : "reviewing_flow";
  }

  return snapshot.sessionStatus;
}
