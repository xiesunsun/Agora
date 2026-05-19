import { describe, expect, test } from "vitest";
import { documentUnitsFromMarkdown } from "../app/markdownDocument";
import {
  resolveAllReviewChangesWithSettlement,
  resolveReviewChangeWithSettlement,
} from "../app/sessionModel";
import type { ReviewChangeSet, SessionSnapshot } from "../types/blackboard";

function makeReviewingSnapshot(): SessionSnapshot {
  const currentContent = "# T\n\nFirst paragraph.\n\nSecond paragraph.";
  const documentUnits = documentUnitsFromMarkdown(currentContent);
  const first = documentUnits.find((unit) => unit.markdown === "First paragraph.")!;
  const second = documentUnits.find((unit) => unit.markdown === "Second paragraph.")!;
  const activeReviewChangeSet: ReviewChangeSet = {
    reviewChangeSetId: "cs-fixture",
    sourceWorkingSetRevision: 1,
    baseVersionId: "v1",
    candidateContent: "# T\n\nFirst accepted.\n\nSecond accepted.",
    mode: "flow",
    status: "open",
    changes: [
      {
        changeId: "c1",
        kind: "replace",
        unitId: first.unitId,
        startOffset: 0,
        endOffset: first.markdown.length,
        beforeText: first.markdown,
        afterText: "First accepted.",
        status: "pending",
      },
      {
        changeId: "c2",
        kind: "replace",
        unitId: second.unitId,
        startOffset: 0,
        endOffset: second.markdown.length,
        beforeText: second.markdown,
        afterText: "Second accepted.",
        status: "pending",
      },
    ],
  };

  return {
    sessionId: "fixture-test",
    sessionStatus: "reviewing",
    title: "T",
    baseVersionId: "v1",
    currentVersionId: "v1",
    workingSetRevision: 1,
    currentContent,
    documentUnits,
    activeBullets: [],
    activeReviewChangeSet,
    proceeding: null,
    versionHistory: [
      {
        versionId: "v1",
        versionNumber: 1,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
  };
}

describe("fixture review settlement", () => {
  test("reject first then accept remaining preserves rejected content", () => {
    const snapshot = makeReviewingSnapshot();
    const rejected = resolveReviewChangeWithSettlement(snapshot, "c1", "rejected");
    const acceptedRemaining = resolveAllReviewChangesWithSettlement(
      rejected.snapshot,
      "accepted",
    );

    expect(acceptedRemaining.snapshot.currentContent).toContain("First paragraph.");
    expect(acceptedRemaining.snapshot.currentContent).not.toContain("First accepted.");
    expect(acceptedRemaining.snapshot.currentContent).toContain("Second accepted.");
    expect(acceptedRemaining.settlement?.reviewResolved.resolution).toBe("version_created");
  });
});
