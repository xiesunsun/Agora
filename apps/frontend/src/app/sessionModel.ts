import type {
  Bullet,
  Change,
  DocumentUnit,
  ProceedingStage,
  ReviewChangeSet,
  ReviewMode,
  SessionSnapshot,
} from "../types/blackboard";

export function stripHeadingMarkdown(markdown: string): string {
  return markdown.replace(/^#{1,3}\s+/, "").trim();
}

export function stripListMarkdown(markdown: string): string {
  return markdown.replace(/^(\d+\.|-)\s+/, "").trim();
}

export function stripBlockquoteMarkdown(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}

export function parseCodeMarkdown(markdown: string): {
  code: string;
  language?: string;
} {
  const match = markdown.match(/^```([^\n`]*)\n?([\s\S]*?)\n?```$/);

  if (!match) {
    return { code: markdown };
  }

  return {
    language: match[1]?.trim() || undefined,
    code: match[2] ?? "",
  };
}

export function parseTableMarkdown(
  markdown: string,
): Pick<Extract<DocumentUnit, { type: "table" }>, "headers" | "rows"> | null {
  const lines = markdown
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  const parseRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const separator = parseRow(lines[1] ?? "");

  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return null;
  }

  return {
    headers: parseRow(lines[0] ?? ""),
    rows: lines.slice(2).map(parseRow),
  };
}

export function updateDocumentUnitMarkdown(
  unit: DocumentUnit,
  markdown: string,
): DocumentUnit {
  const trimmedMarkdown = markdown.trim();

  switch (unit.type) {
    case "title":
      return {
        ...unit,
        markdown: trimmedMarkdown,
        text: stripHeadingMarkdown(trimmedMarkdown),
      };
    case "heading":
      return {
        ...unit,
        markdown: trimmedMarkdown,
        text: stripHeadingMarkdown(trimmedMarkdown),
      };
    case "list_item":
      return {
        ...unit,
        markdown: trimmedMarkdown,
        text: stripListMarkdown(trimmedMarkdown),
      };
    case "blockquote":
      return {
        ...unit,
        markdown: trimmedMarkdown,
        text: stripBlockquoteMarkdown(trimmedMarkdown),
      };
    case "paragraph":
      return { ...unit, markdown: trimmedMarkdown, text: trimmedMarkdown };
    case "code_block": {
      const parsed = parseCodeMarkdown(trimmedMarkdown);

      return { ...unit, markdown: trimmedMarkdown, ...parsed };
    }
    case "table":
      return {
        ...unit,
        markdown: trimmedMarkdown,
        ...(parseTableMarkdown(trimmedMarkdown) ?? {}),
      };
  }
}

export function buildContent(units: DocumentUnit[]): string {
  return [...units]
    .sort((a, b) => a.order - b.order)
    .map((unit) => unit.markdown)
    .join("\n\n");
}

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

  if (!trimmedMarkdown || trimmedMarkdown === targetUnit.markdown.trim()) {
    return snapshot;
  }

  const documentUnits = snapshot.documentUnits.map((unit) =>
    unit.unitId === unitId
      ? updateDocumentUnitMarkdown(unit, trimmedMarkdown)
      : unit,
  );
  const editedUnit = documentUnits.find((unit) => unit.unitId === unitId)!;
  const nextRevision = snapshot.workingSetRevision + 1;
  const editBullet: Bullet = {
    bulletId: `b-edit-${nextRevision}-${unitId}`,
    kind: "edit",
    status: "new",
    anchorUnitId: unitId,
    anchorText: trimmedMarkdown.slice(0, 28),
    title: "Edit",
    body: "Local edit committed from the manuscript surface.",
    author: "You",
    railY: railYForUnit(editedUnit, documentUnits, snapshot.activeBullets),
  };

  return {
    ...snapshot,
    title: editedUnit.type === "title" ? editedUnit.text : snapshot.title,
    workingSetRevision: nextRevision,
    currentContent: buildContent(documentUnits),
    documentUnits,
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
  const commentBullet: Bullet = {
    bulletId: `b-comment-${nextRevision}-${unitId}`,
    kind: "comment",
    status: "new",
    anchorUnitId: unitId,
    anchorText: trimmedAnchorText.slice(0, 80),
    content: trimmedContent,
    title: "Comment",
    body: trimmedContent,
    author: "You",
    railY: railYForUnit(
      targetUnit,
      snapshot.documentUnits,
      snapshot.activeBullets,
    ),
  };

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
      buildDefaultReviewChangeSet(`changeset-${snapshot.workingSetRevision}`),
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
  const changeSet = snapshot.activeReviewChangeSet;

  if (!changeSet) {
    return snapshot;
  }

  const targetChange = changeSet.changes.find(
    (change) => change.changeId === changeId,
  );

  if (!targetChange || targetChange.status !== "pending") {
    return snapshot;
  }

  const documentUnits =
    status === "accepted"
      ? applyAcceptedChange(snapshot.documentUnits, targetChange)
      : snapshot.documentUnits;
  const changes = changeSet.changes.map((change) =>
    change.changeId === changeId ? { ...change, status } : change,
  );

  return resolveReviewIfSettled({
    ...snapshot,
    documentUnits,
    currentContent: buildContent(documentUnits),
    activeReviewChangeSet: {
      ...changeSet,
      changes,
      status: changes.some((change) => change.status === "pending")
        ? changeSet.status
        : "settled",
    },
  });
}

export function resolveAllReviewChanges(
  snapshot: SessionSnapshot,
  status: "accepted" | "rejected",
): SessionSnapshot {
  const changeSet = snapshot.activeReviewChangeSet;

  if (!changeSet) {
    return snapshot;
  }

  const pendingChanges = changeSet.changes.filter(
    (change) => change.status === "pending",
  );

  if (pendingChanges.length === 0) {
    return resolveReviewIfSettled(snapshot);
  }

  const documentUnits =
    status === "accepted"
      ? pendingChanges.reduce(
          (units, change) => applyAcceptedChange(units, change),
          snapshot.documentUnits,
        )
      : snapshot.documentUnits;
  const changes = changeSet.changes.map((change) =>
    change.status === "pending" ? { ...change, status } : change,
  );

  return resolveReviewIfSettled({
    ...snapshot,
    documentUnits,
    currentContent: buildContent(documentUnits),
    activeReviewChangeSet: {
      ...changeSet,
      changes,
      status: "settled",
    },
  });
}

export function applyAcceptedChange(
  documentUnits: DocumentUnit[],
  change: Change,
): DocumentUnit[] {
  if (change.kind !== "replace" || !change.before || !change.after) {
    return documentUnits;
  }

  return documentUnits.map((unit) => {
    if (
      unit.unitId !== change.unitId ||
      !unit.markdown.includes(change.before!)
    ) {
      return unit;
    }

    return updateDocumentUnitMarkdown(
      unit,
      unit.markdown.replace(change.before!, change.after!),
    );
  });
}

export function resolveReviewIfSettled(
  snapshot: SessionSnapshot,
): SessionSnapshot {
  const changeSet = snapshot.activeReviewChangeSet;

  if (
    !changeSet ||
    changeSet.changes.some((change) => change.status === "pending")
  ) {
    return snapshot;
  }

  const nextVersionNumber = snapshot.versionHistory.length + 1;
  const nextVersionId = `v${nextVersionNumber}`;

  return {
    ...snapshot,
    sessionStatus: "active",
    activeReviewChangeSet: null,
    activeBullets: [],
    currentVersionId: nextVersionId,
    workingSetRevision: snapshot.workingSetRevision + 1,
    versionHistory: [
      ...snapshot.versionHistory,
      {
        versionId: nextVersionId,
        label: nextVersionId,
        createdAt: new Date().toISOString(),
        summary: "审阅结算后生成的新版本。",
      },
    ],
  };
}

export function restoreVersionSnapshot(
  snapshot: SessionSnapshot,
  versionId: string,
  documentUnits: DocumentUnit[],
  content: string,
): SessionSnapshot {
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
  changeSetId: string,
): ReviewChangeSet {
  return {
    changeSetId,
    mode: "flow",
    status: "ready",
    changes: [
      {
        changeId: `${changeSetId}-change-1`,
        unitId: "u-posture",
        kind: "replace",
        status: "pending",
        before: "哪些地方需要追问",
        after: "哪些问题需要继续追问",
      },
    ],
  };
}
