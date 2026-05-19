import { applyChangeToMarkdown } from "@blackboard/document-model";
import type {
  Change,
  ChangeStatus,
  DocumentUnit,
  ReviewChangeSet,
} from "@blackboard/schema";

export interface DocumentState {
  currentContent: string;
  documentUnits: DocumentUnit[];
}

export function applyAcceptedChange(
  currentContent: string,
  documentUnits: DocumentUnit[],
  change: Change,
): DocumentState {
  return applyChangeToMarkdown(currentContent, documentUnits, change);
}

export function applyAcceptedPendingChanges(
  currentContent: string,
  documentUnits: DocumentUnit[],
  changes: Change[],
): DocumentState {
  let nextState: DocumentState = { currentContent, documentUnits };

  for (const change of changes) {
    if (change.status !== "pending") {
      continue;
    }

    nextState = applyAcceptedChange(
      nextState.currentContent,
      nextState.documentUnits,
      change,
    );
  }

  return nextState;
}

export function markReviewChanges(
  changes: Change[],
  status: Exclude<ChangeStatus, "pending">,
  changeId?: string,
): Change[] {
  return changes.map((change) => {
    const shouldMark = changeId
      ? change.changeId === changeId
      : change.status === "pending";
    return shouldMark ? { ...change, status } : change;
  });
}

export function hasPendingChanges(source: ReviewChangeSet | Change[]): boolean {
  return changesFrom(source).some((change) => change.status === "pending");
}

export function acceptedChanges(source: ReviewChangeSet | Change[]): Change[] {
  return changesFrom(source).filter((change) => change.status === "accepted");
}

function changesFrom(source: ReviewChangeSet | Change[]): Change[] {
  return Array.isArray(source) ? source : source.changes;
}
