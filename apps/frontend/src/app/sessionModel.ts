import type {
  Bullet,
  CommentBullet,
  Change,
  DocumentUnit,
  EditBullet,
  HistoryVersionPayload,
  ProceedingStage,
  ReviewChangeSet,
  ReviewMode,
  ReviewResolvedPayload,
  SessionSnapshot,
  VersionSummaryItem,
} from "../types/blackboard";
import {
  applyChangeToMarkdown,
  documentUnitsFromMarkdown,
  findUnitAtSourceOffset,
  removeUnitFromContent,
  replaceDocumentUnitMarkdown,
  selectDocumentTitle,
} from "./markdownDocument";

export function railYForUnit(
  unit: DocumentUnit,
  units: DocumentUnit[],
  occupiedBullets: Bullet[],
): number {
  const maxOrder = Math.max(...units.map((candidate) => candidate.order), 1);
  let railY = Math.min(88, Math.max(12, 18 + (unit.order / maxOrder) * 62));

  while (
    occupiedBullets.some((bullet) => Math.abs(bullet.railY - railY) < 4) &&
    railY < 88
  ) {
    railY += 4;
  }

  return railY;
}

function createBulletPresentation(
  bullet:
    | Pick<EditBullet, "type" | "beforeText" | "afterText">
    | Pick<CommentBullet, "type" | "content" | "anchorTextSnapshot">,
  railY: number,
): Pick<Bullet, "title" | "body" | "author" | "railY"> {
  if (bullet.type === "edit") {
    return {
      title: "Edit",
      body: `Edited from "${bullet.beforeText ?? ""}" to "${bullet.afterText ?? ""}".`,
      author: "You",
      railY,
    };
  }

  return {
    title: "Comment",
    body: bullet.content ?? bullet.anchorTextSnapshot ?? "",
    author: "You",
    railY,
  };
}

export function decorateBullet(
  bullet:
    | (Omit<EditBullet, "title" | "body" | "author" | "railY"> &
        Partial<Pick<EditBullet, "title" | "body" | "author" | "railY">>)
    | (Omit<CommentBullet, "title" | "body" | "author" | "railY"> &
        Partial<
          Pick<CommentBullet, "title" | "body" | "author" | "railY">
        >),
  units: DocumentUnit[],
  occupiedBullets: Bullet[],
): Bullet {
  const targetUnit = units.find((unit) => unit.unitId === bullet.unitId);
  const railY =
    bullet.railY ??
    (targetUnit ? railYForUnit(targetUnit, units, occupiedBullets) : 50);

  return {
    ...createBulletPresentation(bullet, railY),
    ...bullet,
    railY,
  } as Bullet;
}

export function normalizeReviewChangeSet(
  reviewChangeSet: ReviewChangeSet | null | undefined,
): ReviewChangeSet | null {
  if (!reviewChangeSet) {
    return null;
  }

  return {
    ...reviewChangeSet,
    mode: reviewChangeSet.mode ?? "flow",
  };
}

export function normalizeSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  const activeBullets: Bullet[] = [];

  for (const bullet of snapshot.activeBullets) {
    activeBullets.push(decorateBullet(bullet, snapshot.documentUnits, activeBullets));
  }

  return {
    ...snapshot,
    activeBullets,
    activeReviewChangeSet: normalizeReviewChangeSet(
      snapshot.activeReviewChangeSet,
    ),
    versionHistory: snapshot.versionHistory.map((version) => ({
      ...version,
      label: version.label ?? version.versionId,
    })),
  };
}

export function commitDocumentUnitEdit(
  snapshot: SessionSnapshot,
  unitId: string,
  markdown: string,
): SessionSnapshot {
  const targetUnit = snapshot.documentUnits.find(
    (unit) => unit.unitId === unitId,
  );

  if (!targetUnit) {
    return snapshot;
  }

  const trimmedMarkdown = markdown.trim();

  if (trimmedMarkdown === targetUnit.markdown.trim()) {
    return snapshot;
  }

  // Empty markdown = delete the unit
  const isDelete = !trimmedMarkdown;
  const nextContent = isDelete
    ? removeUnitFromContent(snapshot.currentContent, targetUnit)
    : replaceDocumentUnitMarkdown(snapshot.currentContent, targetUnit, trimmedMarkdown).currentContent;
  const nextUnits = documentUnitsFromMarkdown(nextContent);
  const editedUnit = isDelete
    ? (nextUnits[0] ?? targetUnit)
    : (findUnitAtSourceOffset(nextUnits, targetUnit.sourceStart) ?? nextUnits[0] ?? targetUnit);
  const nextRevision = snapshot.workingSetRevision + 1;
  const editBullet = decorateBullet({
    bulletId: `b-edit-${nextRevision}-${editedUnit.unitId}`,
    type: "edit",
    status: "new",
    unitId: isDelete ? targetUnit.unitId : editedUnit.unitId,
    queueOrder: snapshot.activeBullets.length,
    createdAt: new Date().toISOString(),
    beforeText: targetUnit.markdown,
    afterText: trimmedMarkdown,
  }, nextUnits, snapshot.activeBullets);

  return {
    ...snapshot,
    title: selectDocumentTitle(nextUnits, snapshot.title),
    workingSetRevision: nextRevision,
    currentContent: nextContent,
    documentUnits: nextUnits,
    activeBullets: [...snapshot.activeBullets, editBullet],
  };
}

export function createDocumentUnitComment(
  snapshot: SessionSnapshot,
  unitId: string,
  anchorText: string,
  content: string,
): SessionSnapshot {
  const targetUnit = snapshot.documentUnits.find(
    (unit) => unit.unitId === unitId,
  );
  const trimmedAnchorText = anchorText.trim();
  const trimmedContent = content.trim();

  if (!targetUnit || !trimmedAnchorText || !trimmedContent) {
    return snapshot;
  }

  const nextRevision = snapshot.workingSetRevision + 1;
  const commentBullet = decorateBullet({
    bulletId: `b-comment-${nextRevision}-${unitId}`,
    type: "comment",
    status: "new",
    unitId,
    queueOrder: snapshot.activeBullets.length,
    createdAt: new Date().toISOString(),
    anchorTextSnapshot: trimmedAnchorText.slice(0, 500),
    content: trimmedContent,
  }, snapshot.documentUnits, snapshot.activeBullets);

  return {
    ...snapshot,
    workingSetRevision: nextRevision,
    activeBullets: [...snapshot.activeBullets, commentBullet],
  };
}

export function startProceeding(snapshot: SessionSnapshot): SessionSnapshot {
  if (snapshot.sessionStatus !== "active" || snapshot.activeBullets.length === 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    sessionStatus: "proceeding",
    proceeding: {
      stage: "resolving_bullets",
      completed: 0,
      total: Math.max(1, snapshot.activeBullets.length),
      progress: 0,
    },
  };
}

export function updateProceedingStage(
  snapshot: SessionSnapshot,
  stage: ProceedingStage,
): SessionSnapshot {
  if (snapshot.sessionStatus !== "proceeding" || !snapshot.proceeding) {
    return snapshot;
  }

  return {
    ...snapshot,
    proceeding: {
      ...snapshot.proceeding,
      stage,
    },
  };
}

export function updateProceedingProgress(
  snapshot: SessionSnapshot,
  completed: number,
  total: number,
): SessionSnapshot {
  if (snapshot.sessionStatus !== "proceeding" || !snapshot.proceeding) {
    return snapshot;
  }

  const safeTotal = Math.max(1, total);

  return {
    ...snapshot,
    proceeding: {
      ...snapshot.proceeding,
      completed: Math.max(0, Math.min(completed, safeTotal)),
      total: safeTotal,
      progress: Math.round((Math.max(0, completed) / safeTotal) * 100),
    },
  };
}

export function completeProceeding(
  snapshot: SessionSnapshot,
  changeSet?: ReviewChangeSet,
): SessionSnapshot {
  if (snapshot.sessionStatus !== "proceeding") {
    return snapshot;
  }

  return {
    ...snapshot,
    sessionStatus: "reviewing",
    activeBullets: [],
    proceeding: null,
    activeReviewChangeSet:
      changeSet ??
      buildDefaultReviewChangeSet(
        `changeset-${snapshot.workingSetRevision}`,
        snapshot.workingSetRevision,
        snapshot.baseVersionId ?? snapshot.currentVersionId,
      ),
  };
}

export function closeSession(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    sessionStatus: "closed",
    proceeding: null,
    activeBullets: [],
  };
}

export function switchReviewMode(
  snapshot: SessionSnapshot,
  mode: ReviewMode,
): SessionSnapshot {
  if (
    !snapshot.activeReviewChangeSet ||
    snapshot.sessionStatus !== "reviewing"
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    activeReviewChangeSet: {
      ...snapshot.activeReviewChangeSet,
      mode,
    },
  };
}

export function resolveReviewChange(
  snapshot: SessionSnapshot,
  changeId: string,
  status: "accepted" | "rejected",
): SessionSnapshot {
  return resolveReviewChangeWithSettlement(snapshot, changeId, status).snapshot;
}

export function resolveReviewChangeWithSettlement(
  snapshot: SessionSnapshot,
  changeId: string,
  status: "accepted" | "rejected",
): ReviewSettlementResult {
  const changeSet = snapshot.activeReviewChangeSet;

  if (!changeSet) {
    return { snapshot, settlement: null };
  }

  const targetChange = changeSet.changes.find(
    (change) => change.changeId === changeId,
  );

  if (!targetChange || targetChange.status !== "pending") {
    return { snapshot, settlement: null };
  }

  const nextDocumentState =
    status === "accepted"
      ? applyAcceptedChange(snapshot.currentContent, snapshot.documentUnits, targetChange)
      : {
          currentContent: snapshot.currentContent,
          documentUnits: snapshot.documentUnits,
        };
  const changes = changeSet.changes.map((change) =>
    change.changeId === changeId ? { ...change, status } : change,
  );

  return resolveReviewIfSettled({
    ...snapshot,
    currentContent: nextDocumentState.currentContent,
    documentUnits: nextDocumentState.documentUnits,
    activeReviewChangeSet: {
      ...changeSet,
      changes,
      status: changes.some((change) => change.status === "pending")
        ? changeSet.status
        : "resolved",
    },
  });
}

export function resolveAllReviewChanges(
  snapshot: SessionSnapshot,
  status: "accepted" | "rejected",
): SessionSnapshot {
  return resolveAllReviewChangesWithSettlement(snapshot, status).snapshot;
}

export function resolveAllReviewChangesWithSettlement(
  snapshot: SessionSnapshot,
  status: "accepted" | "rejected",
): ReviewSettlementResult {
  const changeSet = snapshot.activeReviewChangeSet;

  if (!changeSet) {
    return { snapshot, settlement: null };
  }

  const pendingChanges = changeSet.changes.filter(
    (change) => change.status === "pending",
  );

  if (pendingChanges.length === 0) {
    return resolveReviewIfSettled(snapshot);
  }

  let nextDocumentState = {
    currentContent: snapshot.currentContent,
    documentUnits: snapshot.documentUnits,
  };

  if (status === "accepted") {
    for (const change of pendingChanges) {
      nextDocumentState = applyAcceptedChange(
        nextDocumentState.currentContent,
        nextDocumentState.documentUnits,
        change,
      );
    }
  }
  const changes = changeSet.changes.map((change) =>
    change.status === "pending" ? { ...change, status } : change,
  );

  return resolveReviewIfSettled({
    ...snapshot,
    currentContent: nextDocumentState.currentContent,
    documentUnits: nextDocumentState.documentUnits,
    activeReviewChangeSet: {
      ...changeSet,
      changes,
      status: "resolved",
    },
  });
}

export function applyAcceptedChange(
  currentContent: string,
  documentUnits: DocumentUnit[],
  change: Change,
): {
  currentContent: string;
  documentUnits: DocumentUnit[];
} {
  return applyChangeToMarkdown(currentContent, documentUnits, change);
}

export function resolveReviewIfSettled(
  snapshot: SessionSnapshot,
): ReviewSettlementResult {
  const changeSet = snapshot.activeReviewChangeSet;

  if (
    !changeSet ||
    changeSet.changes.some((change) => change.status === "pending")
  ) {
    return { snapshot, settlement: null };
  }

  const acceptedChanges = changeSet.changes.filter(
    (change) => change.status === "accepted",
  );
  const settledAt = new Date().toISOString();
  const baseSnapshot: SessionSnapshot = {
    ...snapshot,
    title: selectDocumentTitle(snapshot.documentUnits, snapshot.title),
    sessionStatus: "active",
    activeReviewChangeSet: null,
    activeBullets: [],
    proceeding: null,
    workingSetRevision: snapshot.workingSetRevision + 1,
  };

  if (acceptedChanges.length === 0) {
    return {
      snapshot: baseSnapshot,
      settlement: {
        reviewResolved: {
          reviewChangeSetId: changeSet.reviewChangeSetId,
          resolution: "all_rejected",
        },
      },
    };
  }

  const nextVersionNumber =
    Math.max(
      0,
      ...snapshot.versionHistory.map((version) => version.versionNumber),
    ) + 1;
  const nextVersionId = `v${nextVersionNumber}`;
  const version: VersionSummaryItem = {
    versionId: nextVersionId,
    versionNumber: nextVersionNumber,
    label: nextVersionId,
    createdAt: settledAt,
    summary: "审阅结算后生成的新版本。",
  };
  const historyVersion: HistoryVersionPayload = {
    versionId: nextVersionId,
    versionNumber: nextVersionNumber,
    createdAt: settledAt,
    content: snapshot.currentContent,
    summary: version.summary,
    acceptedChangeSetRef: changeSet.reviewChangeSetId,
  };

  return {
    snapshot: {
      ...baseSnapshot,
      baseVersionId: nextVersionId,
      currentVersionId: nextVersionId,
      versionHistory: [...snapshot.versionHistory, version],
    },
    settlement: {
      reviewResolved: {
        reviewChangeSetId: changeSet.reviewChangeSetId,
        resolution: "version_created",
        versionId: nextVersionId,
      },
      historyVersion,
      version,
    },
  };
}

export function restoreVersionSnapshot(
  snapshot: SessionSnapshot,
  versionId: string,
  content: string,
): SessionSnapshot {
  const documentUnits = documentUnitsFromMarkdown(content);

  return {
    ...snapshot,
    baseVersionId: versionId,
    currentVersionId: versionId,
    sessionStatus: "active",
    workingSetRevision: snapshot.workingSetRevision + 1,
    currentContent: content,
    documentUnits,
    activeBullets: [],
    activeReviewChangeSet: null,
    proceeding: null,
  };
}

export function buildDefaultReviewChangeSet(
  reviewChangeSetId: string,
  sourceWorkingSetRevision: number,
  baseVersionId?: string,
): ReviewChangeSet {
  return {
    reviewChangeSetId,
    sourceWorkingSetRevision,
    candidateContent: "",
    baseVersionId,
    mode: "flow",
    status: "open",
    changes: [
      {
        changeId: `${reviewChangeSetId}-change-1`,
        unitId: "u-posture",
        kind: "replace",
        startOffset: 0,
        endOffset: "哪些地方需要追问".length,
        beforeText: "哪些地方需要追问",
        afterText: "哪些问题需要继续追问",
        status: "pending",
      },
    ],
  };
}

export interface ReviewSettlement {
  reviewResolved: ReviewResolvedPayload;
  historyVersion?: HistoryVersionPayload;
  version?: VersionSummaryItem;
}

export interface ReviewSettlementResult {
  snapshot: SessionSnapshot;
  settlement: ReviewSettlement | null;
}
