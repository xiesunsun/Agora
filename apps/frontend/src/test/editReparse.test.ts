import { describe, expect, it } from "vitest";
import { documentUnitsFromMarkdown } from "../app/markdownDocument";
import {
  commitDocumentUnitEdit,
  resolveAllReviewChanges,
  resolveReviewChange,
} from "../app/sessionModel";
import type { SessionSnapshot } from "../types/blackboard";

function createSnapshot(currentContent: string): SessionSnapshot {
  return {
    sessionId: "test-session",
    sessionStatus: "active",
    title: "Draft",
    baseVersionId: "v1",
    currentVersionId: "v1",
    workingSetRevision: 0,
    currentContent,
    documentUnits: documentUnitsFromMarkdown(currentContent),
    activeBullets: [],
    activeReviewChangeSet: null,
    proceeding: null,
    versionHistory: [
      {
        versionId: "v1",
        versionNumber: 1,
        label: "v1",
        createdAt: "2026-05-07T12:00:00.000Z",
        summary: "Initial version.",
      },
    ],
  };
}

describe("edit commit reparses markdown truth", () => {
  it("replaces the source slice in currentContent and reparses all units", () => {
    const currentContent = `# Draft

First paragraph.

Second paragraph.`;
    const snapshot = createSnapshot(currentContent);
    const targetUnit = snapshot.documentUnits.find(
      (unit) => unit.markdown === "First paragraph.",
    );

    expect(targetUnit).toBeDefined();

    const next = commitDocumentUnitEdit(
      snapshot,
      targetUnit!.unitId,
      "Rewritten paragraph.",
    );

    expect(next.currentContent).toBe(`# Draft

Rewritten paragraph.

Second paragraph.`);
    expect(next.workingSetRevision).toBe(1);
    expect(next.documentUnits.map((unit) => unit.markdown)).toEqual([
      "# Draft",
      "Rewritten paragraph.",
      "Second paragraph.",
    ]);

    for (const unit of next.documentUnits) {
      expect(next.currentContent.slice(unit.sourceStart, unit.sourceEnd)).toBe(
        unit.markdown,
      );
    }
  });

  it("allows unit type transitions after reparse", () => {
    const currentContent = `# Draft

Plain paragraph.`;
    const snapshot = createSnapshot(currentContent);
    const targetUnit = snapshot.documentUnits.find(
      (unit) => unit.markdown === "Plain paragraph.",
    );

    const next = commitDocumentUnitEdit(
      snapshot,
      targetUnit!.unitId,
      "## Converted heading",
    );

    expect(next.documentUnits.map((unit) => unit.type)).toEqual([
      "title",
      "heading",
    ]);
    expect(next.documentUnits[1]).toMatchObject({
      type: "heading",
      text: "Converted heading",
    });
    expect(next.activeBullets[0]).toMatchObject({
      type: "edit",
      beforeText: "Plain paragraph.",
      afterText: "## Converted heading",
      unitId: next.documentUnits[1]?.unitId,
    });
  });

  it("can expand one source replacement into multiple units after reparse", () => {
    const currentContent = `# Draft

Single paragraph.`;
    const snapshot = createSnapshot(currentContent);
    const targetUnit = snapshot.documentUnits.find(
      (unit) => unit.markdown === "Single paragraph.",
    );

    const next = commitDocumentUnitEdit(
      snapshot,
      targetUnit!.unitId,
      "First block.\n\nSecond block.",
    );

    expect(next.documentUnits.map((unit) => unit.markdown)).toEqual([
      "# Draft",
      "First block.",
      "Second block.",
    ]);
    expect(next.currentContent).toBe(`# Draft

First block.

Second block.`);
  });

  it("reparses markdown truth when accepting a review change", () => {
    const currentContent = `# Draft

Plain paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const targetUnit = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "Plain paragraph.",
    );

    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-1",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

## Converted heading`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-1",
            unitId: targetUnit!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: targetUnit!.markdown.length,
            beforeText: targetUnit!.markdown,
            afterText: "## Converted heading",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveReviewChange(snapshot, "change-1", "accepted");

    expect(next.currentContent).toBe(`# Draft

## Converted heading`);
    expect(next.documentUnits.map((unit) => unit.type)).toEqual([
      "title",
      "heading",
    ]);
    expect(next.documentUnits[1]).toMatchObject({
      type: "heading",
      text: "Converted heading",
    });
  });

  it("supports insert changes by applying raw markdown at the anchored source position", () => {
    const currentContent = `# Draft

First paragraph.

Second paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const firstParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "First paragraph.",
    );

    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-insert",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

First paragraph.

Inserted paragraph.

Second paragraph.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-insert",
            unitId: firstParagraph!.unitId,
            kind: "insert",
            startOffset: firstParagraph!.markdown.length,
            endOffset: firstParagraph!.markdown.length,
            beforeText: "",
            afterText: "\n\nInserted paragraph.",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveReviewChange(snapshot, "change-insert", "accepted");

    expect(next.currentContent).toBe(`# Draft

First paragraph.

Inserted paragraph.

Second paragraph.`);
    expect(next.documentUnits.map((unit) => unit.markdown)).toEqual([
      "# Draft",
      "First paragraph.",
      "Inserted paragraph.",
      "Second paragraph.",
    ]);
  });

  it("supports delete changes by removing the anchored source slice and reparsing", () => {
    const currentContent = `# Draft

First paragraph.

Second paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const firstParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "First paragraph.",
    );

    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-delete",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

Second paragraph.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-delete",
            unitId: firstParagraph!.unitId,
            kind: "delete",
            startOffset: 0,
            endOffset: firstParagraph!.markdown.length,
            beforeText: firstParagraph!.markdown,
            afterText: "",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveReviewChange(snapshot, "change-delete", "accepted");

    expect(next.documentUnits.map((unit) => unit.markdown)).toEqual([
      "# Draft",
      "Second paragraph.",
    ]);
  });

  it("creates a new version when the last pending change is accepted", () => {
    const currentContent = `# Draft

Plain paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const targetUnit = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "Plain paragraph.",
    );
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-accept",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

Rewritten paragraph.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-accept",
            unitId: targetUnit!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: targetUnit!.markdown.length,
            beforeText: targetUnit!.markdown,
            afterText: "Rewritten paragraph.",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveReviewChange(snapshot, "change-accept", "accepted");

    expect(next.sessionStatus).toBe("active");
    expect(next.activeReviewChangeSet).toBeNull();
    expect(next.currentContent).toBe(`# Draft

Rewritten paragraph.`);
    expect(next.baseVersionId).toBe("v2");
    expect(next.currentVersionId).toBe("v2");
    expect(next.workingSetRevision).toBe(1);
    expect(next.versionHistory.map((version) => version.versionId)).toEqual([
      "v1",
      "v2",
    ]);
  });

  it("does not create a new version when the review is settled with only rejections", () => {
    const currentContent = `# Draft

Plain paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const targetUnit = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "Plain paragraph.",
    );
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-reject",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

Rewritten paragraph.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-reject",
            unitId: targetUnit!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: targetUnit!.markdown.length,
            beforeText: targetUnit!.markdown,
            afterText: "Rewritten paragraph.",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveReviewChange(snapshot, "change-reject", "rejected");

    expect(next.sessionStatus).toBe("active");
    expect(next.activeReviewChangeSet).toBeNull();
    expect(next.currentContent).toBe(currentContent);
    expect(next.baseVersionId).toBe("v1");
    expect(next.currentVersionId).toBe("v1");
    expect(next.workingSetRevision).toBe(1);
    expect(next.versionHistory.map((version) => version.versionId)).toEqual([
      "v1",
    ]);
  });

  it("accepts all remaining changes and creates one new version", () => {
    const currentContent = `# Draft

First paragraph.

Second paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const firstParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "First paragraph.",
    );
    const secondParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "Second paragraph.",
    );
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-accept-all",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

First rewrite.

Second rewrite.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-1",
            unitId: firstParagraph!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: firstParagraph!.markdown.length,
            beforeText: firstParagraph!.markdown,
            afterText: "First rewrite.",
            status: "pending",
          },
          {
            changeId: "change-2",
            unitId: secondParagraph!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: secondParagraph!.markdown.length,
            beforeText: secondParagraph!.markdown,
            afterText: "Second rewrite.",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveAllReviewChanges(snapshot, "accepted");

    expect(next.currentContent).toBe(`# Draft

First rewrite.

Second rewrite.`);
    expect(next.currentVersionId).toBe("v2");
    expect(next.versionHistory.map((version) => version.versionId)).toEqual([
      "v1",
      "v2",
    ]);
  });

  it("rejects all remaining changes without creating a new version", () => {
    const currentContent = `# Draft

First paragraph.

Second paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const firstParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "First paragraph.",
    );
    const secondParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "Second paragraph.",
    );
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-reject-all",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

First rewrite.

Second rewrite.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-1",
            unitId: firstParagraph!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: firstParagraph!.markdown.length,
            beforeText: firstParagraph!.markdown,
            afterText: "First rewrite.",
            status: "pending",
          },
          {
            changeId: "change-2",
            unitId: secondParagraph!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: secondParagraph!.markdown.length,
            beforeText: secondParagraph!.markdown,
            afterText: "Second rewrite.",
            status: "pending",
          },
        ],
      },
    };

    const next = resolveAllReviewChanges(snapshot, "rejected");

    expect(next.currentContent).toBe(currentContent);
    expect(next.currentVersionId).toBe("v1");
    expect(next.versionHistory.map((version) => version.versionId)).toEqual([
      "v1",
    ]);
  });

  it("settles mixed review outcomes into a version with only accepted changes applied", () => {
    const currentContent = `# Draft

First paragraph.

Second paragraph.`;
    const baseSnapshot = createSnapshot(currentContent);
    const firstParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "First paragraph.",
    );
    const secondParagraph = baseSnapshot.documentUnits.find(
      (unit) => unit.markdown === "Second paragraph.",
    );
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      sessionStatus: "reviewing",
      activeReviewChangeSet: {
        reviewChangeSetId: "rcs-mixed",
        sourceWorkingSetRevision: 0,
        candidateContent: `# Draft

First rewrite.

Second rewrite.`,
        status: "open",
        mode: "flow",
        changes: [
          {
            changeId: "change-1",
            unitId: firstParagraph!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: firstParagraph!.markdown.length,
            beforeText: firstParagraph!.markdown,
            afterText: "First rewrite.",
            status: "pending",
          },
          {
            changeId: "change-2",
            unitId: secondParagraph!.unitId,
            kind: "replace",
            startOffset: 0,
            endOffset: secondParagraph!.markdown.length,
            beforeText: secondParagraph!.markdown,
            afterText: "Second rewrite.",
            status: "pending",
          },
        ],
      },
    };

    const accepted = resolveReviewChange(snapshot, "change-1", "accepted");

    expect(accepted.sessionStatus).toBe("reviewing");
    expect(accepted.activeReviewChangeSet?.changes.map((change) => change.status))
      .toEqual(["accepted", "pending"]);
    expect(accepted.currentContent).toBe(`# Draft

First rewrite.

Second paragraph.`);
    expect(accepted.versionHistory.map((version) => version.versionId)).toEqual([
      "v1",
    ]);

    const settled = resolveReviewChange(accepted, "change-2", "rejected");

    expect(settled.sessionStatus).toBe("active");
    expect(settled.activeReviewChangeSet).toBeNull();
    expect(settled.currentContent).toBe(`# Draft

First rewrite.

Second paragraph.`);
    expect(settled.currentVersionId).toBe("v2");
    expect(settled.versionHistory.map((version) => version.versionId)).toEqual([
      "v1",
      "v2",
    ]);
  });
});
