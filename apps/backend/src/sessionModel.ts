import { diffArrays, diffWords } from "diff";
import type {
  Bullet,
  Change,
  CloseResult,
  DocumentUnit,
  HistoryVersionPayload,
  ProceedingStage,
  ReviewChangeSet,
  ReviewResolvedPayload,
  SessionSnapshot,
  VersionSummaryItem,
} from "./types.js";
import {
  acceptedChanges,
  applyAcceptedChange,
  applyAcceptedPendingChanges,
  hasPendingChanges,
  markReviewChanges,
} from "@blackboard/review-model";
import {
  findUnitAtSourceOffset,
  documentUnitsFromMarkdown,
  removeUnitFromContent,
  replaceDocumentUnitMarkdown,
  selectDocumentTitle,
} from "./markdownDocument.js";

export function commitDocumentUnitEdit(
  snapshot: SessionSnapshot,
  unitId: string,
  markdown: string,
): SessionSnapshot {
  const target = snapshot.documentUnits.find((u) => u.unitId === unitId);
  if (!target) return snapshot;
  const md = markdown.trim();
  if (md === target.markdown.trim()) return snapshot;

  // Empty markdown = delete the unit
  const isDelete = !md;
  const nextMarkdown = isDelete ? "" : md;
  const nextContent = isDelete
    ? removeUnitFromContent(snapshot.currentContent, target)
    : replaceDocumentUnitMarkdown(snapshot.currentContent, target, nextMarkdown).currentContent;
  const nextUnits = documentUnitsFromMarkdown(nextContent);
  const edited = isDelete ? (nextUnits[0] ?? target) : (findUnitAtSourceOffset(nextUnits, target.sourceStart) ?? nextUnits[0] ?? target);
  const nextRevision = snapshot.workingSetRevision + 1;
  const bullet: Bullet = {
    bulletId: `b-edit-${nextRevision}-${edited.unitId}`,
    type: "edit",
    status: "new",
    unitId: isDelete ? target.unitId : edited.unitId,
    queueOrder: snapshot.activeBullets.length,
    createdAt: new Date().toISOString(),
    beforeText: target.markdown,
    afterText: nextMarkdown,
  };

  return {
    ...snapshot,
    title: selectDocumentTitle(nextUnits, snapshot.title),
    workingSetRevision: nextRevision,
    currentContent: nextContent,
    documentUnits: nextUnits,
    activeBullets: [...snapshot.activeBullets, bullet],
  };
}

export function createDocumentUnitComment(
  snapshot: SessionSnapshot,
  unitId: string,
  anchorText: string,
  content: string,
  anchorStartOffset?: number,
  anchorEndOffset?: number,
): SessionSnapshot {
  const target = snapshot.documentUnits.find((u) => u.unitId === unitId);
  if (!target || !anchorText.trim() || !content.trim()) return snapshot;

  const nextRevision = snapshot.workingSetRevision + 1;
  const bullet: Bullet = {
    bulletId: `b-comment-${nextRevision}-${unitId}`,
    type: "comment",
    status: "new",
    unitId,
    queueOrder: snapshot.activeBullets.length,
    createdAt: new Date().toISOString(),
    anchorTextSnapshot: anchorText.trim().slice(0, 500),
    anchorStartOffset,
    anchorEndOffset,
    content: content.trim(),
  };

  return { ...snapshot, workingSetRevision: nextRevision, activeBullets: [...snapshot.activeBullets, bullet] };
}

export function startProceeding(snapshot: SessionSnapshot): SessionSnapshot {
  if (snapshot.sessionStatus !== "active" || snapshot.activeBullets.length === 0) return snapshot;
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

export function updateProceedingStage(snapshot: SessionSnapshot, stage: ProceedingStage): SessionSnapshot {
  if (snapshot.sessionStatus !== "proceeding" || !snapshot.proceeding) return snapshot;
  return { ...snapshot, proceeding: { ...snapshot.proceeding, stage } };
}

export function updateProceedingProgress(snapshot: SessionSnapshot, completed: number, total: number): SessionSnapshot {
  if (snapshot.sessionStatus !== "proceeding" || !snapshot.proceeding) return snapshot;
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

export function completeProceeding(snapshot: SessionSnapshot, changeSet: ReviewChangeSet): SessionSnapshot {
  if (snapshot.sessionStatus !== "proceeding") return snapshot;
  return {
    ...snapshot,
    sessionStatus: "reviewing",
    // Keep activeBullets alive through review; they are marked applied at settlement
    proceeding: null,
    activeReviewChangeSet: changeSet,
  };
}

export function closeSession(snapshot: SessionSnapshot, closeResult: CloseResult): SessionSnapshot {
  return {
    ...snapshot,
    sessionStatus: "closed",
    proceeding: null,
    activeBullets: [],
    closeResult,
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
  if (!changeSet) return { snapshot, settlement: null };
  const target = changeSet.changes.find((c) => c.changeId === changeId);
  if (!target || target.status !== "pending") return { snapshot, settlement: null };

  const nextDocumentState = status === "accepted"
    ? applyAcceptedChange(snapshot.currentContent, snapshot.documentUnits, target)
    : {
        currentContent: snapshot.currentContent,
        documentUnits: snapshot.documentUnits,
      };
  const changes = markReviewChanges(changeSet.changes, status, changeId);

  return resolveReviewIfSettled({
    ...snapshot,
    currentContent: nextDocumentState.currentContent,
    documentUnits: nextDocumentState.documentUnits,
    activeReviewChangeSet: {
      ...changeSet,
      changes,
      status: hasPendingChanges(changes) ? changeSet.status : "resolved",
    },
  });
}

export function resolveAllReviewChanges(snapshot: SessionSnapshot, status: "accepted" | "rejected"): SessionSnapshot {
  return resolveAllReviewChangesWithSettlement(snapshot, status).snapshot;
}

export function resolveAllReviewChangesWithSettlement(
  snapshot: SessionSnapshot,
  status: "accepted" | "rejected",
): ReviewSettlementResult {
  const changeSet = snapshot.activeReviewChangeSet;
  if (!changeSet) return { snapshot, settlement: null };

  const pending = changeSet.changes.filter((c) => c.status === "pending");
  if (pending.length === 0) return resolveReviewIfSettled(snapshot);

  const nextDocumentState = status === "accepted"
    ? applyAcceptedPendingChanges(snapshot.currentContent, snapshot.documentUnits, pending)
    : {
        currentContent: snapshot.currentContent,
        documentUnits: snapshot.documentUnits,
      };
  const changes = markReviewChanges(changeSet.changes, status);

  return resolveReviewIfSettled({
    ...snapshot,
    currentContent: nextDocumentState.currentContent,
    documentUnits: nextDocumentState.documentUnits,
    activeReviewChangeSet: { ...changeSet, changes, status: "resolved" },
  });
}

export interface ReviewSettlement {
  reviewResolved: ReviewResolvedPayload;
  historyVersion?: HistoryVersionPayload;
  version?: VersionSummaryItem;
  appliedBullets: Bullet[];
}

export interface ReviewSettlementResult {
  snapshot: SessionSnapshot;
  settlement: ReviewSettlement | null;
}

function resolveReviewIfSettled(snapshot: SessionSnapshot): ReviewSettlementResult {
  const changeSet = snapshot.activeReviewChangeSet;
  if (!changeSet || hasPendingChanges(changeSet)) {
    return { snapshot, settlement: null };
  }

  const acceptedReviewChanges = acceptedChanges(changeSet);
  const settledAt = new Date().toISOString();
  const appliedBullets = snapshot.activeBullets.map((b) => ({ ...b, status: "applied" as const }));
  const baseSnapshot = {
    ...snapshot,
    title: selectDocumentTitle(snapshot.documentUnits, snapshot.title),
    sessionStatus: "active" as const,
    activeReviewChangeSet: null,
    activeBullets: [],
    proceeding: null,
    workingSetRevision: snapshot.workingSetRevision + 1,
  };

  if (acceptedReviewChanges.length === 0) {
    return {
      snapshot: baseSnapshot,
      settlement: {
        reviewResolved: {
          reviewChangeSetId: changeSet.reviewChangeSetId,
          resolution: "all_rejected",
        },
        appliedBullets,
      },
    };
  }

  const nextNum =
    Math.max(0, ...snapshot.versionHistory.map((version) => version.versionNumber)) + 1;
  const nextId = `v${nextNum}`;
  const version: VersionSummaryItem = {
    versionId: nextId,
    versionNumber: nextNum,
    label: nextId,
    createdAt: settledAt,
    summary: "审阅结算后生成的新版本。",
  };
  const historyVersion: HistoryVersionPayload = {
    versionId: nextId,
    versionNumber: nextNum,
    createdAt: settledAt,
    content: snapshot.currentContent,
    summary: version.summary,
    acceptedChangeSetRef: changeSet.reviewChangeSetId,
  };

  return {
    snapshot: {
      ...baseSnapshot,
      baseVersionId: nextId,
      currentVersionId: nextId,
      versionHistory: [...snapshot.versionHistory, version],
    },
    settlement: {
      reviewResolved: {
        reviewChangeSetId: changeSet.reviewChangeSetId,
        resolution: "version_created",
        versionId: nextId,
      },
      historyVersion,
      version,
      appliedBullets,
    },
  };
}

export function restoreVersionSnapshot(
  snapshot: SessionSnapshot,
  versionId: string,
  content: string,
): SessionSnapshot {
  return {
    ...snapshot,
    baseVersionId: versionId,
    currentVersionId: versionId,
    sessionStatus: "active",
    workingSetRevision: snapshot.workingSetRevision + 1,
    currentContent: content,
    documentUnits: documentUnitsFromMarkdown(content),
    activeBullets: [],
    activeReviewChangeSet: null,
    proceeding: null,
  };
}

export function buildReviewChangeSetFromCandidate(
  reviewChangeSetId: string,
  sourceWorkingSetRevision: number,
  baseVersionId: string | undefined,
  currentContent: string,
  candidateContent: string,
  documentUnits: DocumentUnit[],
): ReviewChangeSet {
  const changes = computeChanges(
    reviewChangeSetId,
    currentContent,
    candidateContent,
    documentUnits,
  );
  return {
    reviewChangeSetId,
    sourceWorkingSetRevision,
    baseVersionId,
    candidateContent,
    status: "open",
    changes,
  };
}

function computeChanges(
  reviewChangeSetId: string,
  baseContent: string,
  candidateContent: string,
  baseUnits: DocumentUnit[],
): Change[] {
  if (baseContent === candidateContent) return [];

  const candidateUnits = documentUnitsFromMarkdown(candidateContent);
  const changes: Change[] = [];
  let changeIndex = 0;

  // Phase 1: paragraph-level Myers diff with similarity-based comparator
  const diffs = diffArrays(baseUnits, candidateUnits, {
    comparator: (a: DocumentUnit, b: DocumentUnit) => {
      if (a.type !== b.type) return false;
      return textSimilarity(a.markdown, b.markdown) >= 0.4;
    },
  });

  // Phase 2: walk the edit script, generate Changes
  let baseIdx = 0;
  let candIdx = 0;

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i];
    const count = part.count ?? 0;

    if (!part.added && !part.removed) {
      // Keep — but check if content actually differs (similarity match, not exact)
      for (let j = 0; j < count; j++) {
        const bUnit = baseUnits[baseIdx + j];
        const cUnit = candidateUnits[candIdx + j];
        if (bUnit && cUnit && bUnit.markdown !== cUnit.markdown) {
          const hunks = computeIntraUnitChanges(bUnit.markdown, cUnit.markdown);
          for (const hunk of hunks) {
            changes.push({
              changeId: `${reviewChangeSetId}-c${changeIndex++}`,
              unitId: bUnit.unitId,
              kind: "replace",
              startOffset: hunk.startOffset,
              endOffset: hunk.endOffset,
              beforeText: hunk.beforeText,
              afterText: hunk.afterText,
              status: "pending",
            });
          }
        }
      }
      baseIdx += count;
      candIdx += count;
    } else if (part.removed && !part.added) {
      // Check if next part is added (replace pair)
      const next = diffs[i + 1];
      if (next?.added) {
        // Replace: pair removed units with added units
        const removedCount = count;
        const addedCount = next.count ?? 0;
        const paired = Math.min(removedCount, addedCount);

        for (let j = 0; j < paired; j++) {
          const bUnit = baseUnits[baseIdx + j];
          const cUnit = candidateUnits[candIdx + j];
          if (bUnit && cUnit) {
            const hunks = computeIntraUnitChanges(bUnit.markdown, cUnit.markdown);
            for (const hunk of hunks) {
              changes.push({
                changeId: `${reviewChangeSetId}-c${changeIndex++}`,
                unitId: bUnit.unitId,
                kind: "replace",
                startOffset: hunk.startOffset,
                endOffset: hunk.endOffset,
                beforeText: hunk.beforeText,
                afterText: hunk.afterText,
                status: "pending",
              });
            }
          }
        }

        // Remaining removed units → delete
        for (let j = paired; j < removedCount; j++) {
          const bUnit = baseUnits[baseIdx + j];
          if (bUnit) {
            changes.push({
              changeId: `${reviewChangeSetId}-c${changeIndex++}`,
              unitId: bUnit.unitId,
              kind: "delete",
              startOffset: 0,
              endOffset: bUnit.markdown.length,
              beforeText: bUnit.markdown,
              afterText: "",
              status: "pending",
            });
          }
        }

        // Remaining added units → insert
        for (let j = paired; j < addedCount; j++) {
          const cUnit = candidateUnits[candIdx + j];
          const anchorUnit = baseUnits[baseIdx + removedCount - 1] ?? baseUnits[baseIdx - 1] ?? baseUnits[0];
          if (cUnit && anchorUnit) {
            changes.push({
              changeId: `${reviewChangeSetId}-c${changeIndex++}`,
              unitId: anchorUnit.unitId,
              kind: "insert",
              startOffset: anchorUnit.markdown.length,
              endOffset: anchorUnit.markdown.length,
              beforeText: "",
              afterText: `\n\n${cUnit.markdown}`,
              status: "pending",
            });
          }
        }

        baseIdx += removedCount;
        candIdx += addedCount;
        i++; // skip the added part we already consumed
      } else {
        // Pure delete
        for (let j = 0; j < count; j++) {
          const bUnit = baseUnits[baseIdx + j];
          if (bUnit) {
            changes.push({
              changeId: `${reviewChangeSetId}-c${changeIndex++}`,
              unitId: bUnit.unitId,
              kind: "delete",
              startOffset: 0,
              endOffset: bUnit.markdown.length,
              beforeText: bUnit.markdown,
              afterText: "",
              status: "pending",
            });
          }
        }
        baseIdx += count;
      }
    } else if (part.added) {
      // Pure insert (no preceding removed)
      for (let j = 0; j < count; j++) {
        const cUnit = candidateUnits[candIdx + j];
        const anchorUnit = baseUnits[baseIdx - 1] ?? baseUnits[0];
        if (cUnit && anchorUnit) {
          changes.push({
            changeId: `${reviewChangeSetId}-c${changeIndex++}`,
            unitId: anchorUnit.unitId,
            kind: "insert",
            startOffset: anchorUnit.markdown.length,
            endOffset: anchorUnit.markdown.length,
            beforeText: "",
            afterText: `\n\n${cUnit.markdown}`,
            status: "pending",
          });
        }
      }
      candIdx += count;
    }
  }

  return changes;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

interface IntraHunk {
  startOffset: number;
  endOffset: number;
  beforeText: string;
  afterText: string;
}

function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeIntraUnitChanges(baseText: string, candidateText: string): IntraHunk[] {
  if (baseText === candidateText) return [];

  const wordDiffs = diffWords(baseText, candidateText);
  const hunks: IntraHunk[] = [];
  let offset = 0;

  // Collect raw change spans
  const spans: Array<{ startOffset: number; endOffset: number; beforeText: string; afterText: string }> = [];

  for (const part of wordDiffs) {
    if (!part.added && !part.removed) {
      offset += part.value.length;
    } else if (part.removed) {
      const start = offset;
      const end = offset + part.value.length;
      // Check if next part is added (replace)
      spans.push({ startOffset: start, endOffset: end, beforeText: part.value, afterText: "" });
      offset += part.value.length;
    } else if (part.added) {
      // Attach to previous span if it was a remove (making it a replace)
      const prev = spans[spans.length - 1];
      if (prev && prev.afterText === "" && prev.endOffset === offset) {
        prev.afterText = part.value;
      } else {
        spans.push({ startOffset: offset, endOffset: offset, beforeText: "", afterText: part.value });
      }
    }
  }

  // Merge adjacent spans with small gaps (≤ 8 chars) into single hunks
  for (const span of spans) {
    const last = hunks[hunks.length - 1];
    if (last && span.startOffset - last.endOffset <= 8) {
      // Merge: include the gap text in both before and after
      const gap = baseText.slice(last.endOffset, span.startOffset);
      last.beforeText += gap + span.beforeText;
      last.afterText += gap + span.afterText;
      last.endOffset = span.endOffset;
    } else {
      hunks.push({ ...span });
    }
  }

  // If no hunks found but texts differ, fallback to whole-unit replace
  if (hunks.length === 0) {
    return [{ startOffset: 0, endOffset: baseText.length, beforeText: baseText, afterText: candidateText }];
  }

  return hunks;
}
