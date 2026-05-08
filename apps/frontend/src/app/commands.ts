import type { ApiClient } from "./apiClient";
import type { ReviewChangeSet, SessionSnapshot } from "../types/blackboard";

export function commitDocumentUnitEditCommand(
  apiClient: ApiClient,
  snapshot: SessionSnapshot,
  unitId: string,
  markdown: string,
) {
  return apiClient.sendCommand("document_unit.edit.commit", {
    unitId,
    markdown,
    workingSetRevision: snapshot.workingSetRevision,
  });
}

export function createCommentCommand(
  apiClient: ApiClient,
  unitId: string,
  anchorText: string,
  content: string,
) {
  return apiClient.sendCommand("bullet.comment.create", {
    unitId,
    content,
    anchorTextSnapshot: anchorText,
  });
}

export function proceedCommand(
  apiClient: ApiClient,
  snapshot: SessionSnapshot,
) {
  return apiClient.sendCommand("session.proceed", {
    workingSetRevision: snapshot.workingSetRevision,
  });
}

export function acceptReviewChangeCommand(
  apiClient: ApiClient,
  reviewChangeSetId: string,
  changeId: string,
) {
  return apiClient.sendCommand("review.change.accept", {
    reviewChangeSetId,
    changeId,
  });
}

export function rejectReviewChangeCommand(
  apiClient: ApiClient,
  reviewChangeSetId: string,
  changeId: string,
) {
  return apiClient.sendCommand("review.change.reject", {
    reviewChangeSetId,
    changeId,
  });
}

export function acceptAllRemainingCommand(
  apiClient: ApiClient,
  reviewChangeSetId: string,
) {
  return apiClient.sendCommand("review.accept_all_remaining", {
    reviewChangeSetId,
  });
}

export function rejectAllRemainingCommand(
  apiClient: ApiClient,
  reviewChangeSetId: string,
) {
  return apiClient.sendCommand("review.reject_all_remaining", {
    reviewChangeSetId,
  });
}

export function restoreVersionCommand(apiClient: ApiClient, versionId: string) {
  return apiClient.sendCommand("history.restore_version", {
    versionId,
  });
}

export function requestCloseCommand(apiClient: ApiClient) {
  return apiClient.sendCommand("session.request_close", {});
}

export function reviewChangeSetId(
  changeSet: ReviewChangeSet | null,
): string | null {
  return changeSet?.changeSetId ?? null;
}
