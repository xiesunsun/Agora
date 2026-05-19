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

export function hasBlockingProceedBullets(snapshot: SessionSnapshot): boolean {
  return snapshot.activeBullets.length === 0;
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
  const version = snapshot.versionHistory.find(
    (v) => v.versionId === snapshot.currentVersionId,
  );
  const num = version?.versionNumber ?? snapshot.versionHistory.length;
  if (num === 0) return "原稿";
  const cnNum = ["", "初稿", "二稿", "三稿", "四稿", "五稿", "六稿", "七稿", "八稿", "九稿", "十稿"];
  return num <= 10 ? cnNum[num] : `第${num}稿`;
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
