import { describe, expect, test } from "vitest";
import {
  closeSession,
  commitDocumentUnitEdit,
  createDocumentUnitComment,
  startProceeding,
} from "../sessionModel.js";
import type { SessionSnapshot } from "../types.js";
import { documentUnitsFromMarkdown } from "../markdownDocument.js";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeSnapshot(content = "# 标题\n\n第一段。\n\n第二段。"): SessionSnapshot {
  const documentUnits = documentUnitsFromMarkdown(content);
  return {
    sessionId: "test",
    sessionStatus: "active",
    title: "标题",
    baseVersionId: "v1",
    currentVersionId: "v1",
    workingSetRevision: 0,
    currentContent: content,
    documentUnits,
    activeBullets: [],
    activeReviewChangeSet: null,
    proceeding: null,
    versionHistory: [{ versionId: "v1", versionNumber: 1, createdAt: "2026-01-01T00:00:00Z" }],
  };
}

// ─── commitDocumentUnitEdit ───────────────────────────────────────────────────

describe("commitDocumentUnitEdit", () => {
  test("creates an edit bullet", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits.find((u) => u.type === "paragraph")!;
    const next = commitDocumentUnitEdit(snap, unit.unitId, "修改后的段落。");
    expect(next.activeBullets).toHaveLength(1);
    expect(next.activeBullets[0].type).toBe("edit");
    expect(next.activeBullets[0].status).toBe("new");
  });

  test("increments workingSetRevision", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const next = commitDocumentUnitEdit(snap, unit.unitId, "新内容");
    expect(next.workingSetRevision).toBe(snap.workingSetRevision + 1);
  });

  test("updates currentContent", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits.find((u) => u.type === "paragraph")!;
    const next = commitDocumentUnitEdit(snap, unit.unitId, "新段落内容。");
    expect(next.currentContent).toContain("新段落内容。");
    expect(next.currentContent).not.toContain("第一段。");
  });

  test("no-op when content unchanged", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const next = commitDocumentUnitEdit(snap, unit.unitId, unit.markdown);
    expect(next).toBe(snap); // same reference
  });

  test("no-op for unknown unitId", () => {
    const snap = makeSnapshot();
    const next = commitDocumentUnitEdit(snap, "nonexistent", "内容");
    expect(next).toBe(snap);
  });
});

// ─── createDocumentUnitComment ────────────────────────────────────────────────

describe("createDocumentUnitComment", () => {
  test("creates a comment bullet", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits.find((u) => u.type === "paragraph")!;
    const next = createDocumentUnitComment(snap, unit.unitId, "第一段", "这里需要展开");
    expect(next.activeBullets).toHaveLength(1);
    expect(next.activeBullets[0].type).toBe("comment");
    expect(next.activeBullets[0].status).toBe("new");
  });

  test("increments workingSetRevision", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const next = createDocumentUnitComment(snap, unit.unitId, "锚点", "批注内容");
    expect(next.workingSetRevision).toBe(snap.workingSetRevision + 1);
  });

  test("does not change currentContent", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const next = createDocumentUnitComment(snap, unit.unitId, "锚点", "批注");
    expect(next.currentContent).toBe(snap.currentContent);
  });

  test("preserves precise anchor offsets", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const next = createDocumentUnitComment(snap, unit.unitId, "第一段", "批注", 0, 3);
    const bullet = next.activeBullets[0];
    expect(bullet.type).toBe("comment");
    if (bullet.type === "comment") {
      expect(bullet.anchorStartOffset).toBe(0);
      expect(bullet.anchorEndOffset).toBe(3);
    }
  });

  test("no-op for empty content", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const next = createDocumentUnitComment(snap, unit.unitId, "锚点", "");
    expect(next).toBe(snap);
  });

  test("no-op for unknown unitId", () => {
    const snap = makeSnapshot();
    const next = createDocumentUnitComment(snap, "nonexistent", "锚点", "批注");
    expect(next).toBe(snap);
  });
});

// ─── startProceeding ─────────────────────────────────────────────────────────

describe("startProceeding", () => {
  test("transitions to proceeding when bullets exist", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const withBullet = createDocumentUnitComment(snap, unit.unitId, "锚点", "批注");
    const next = startProceeding(withBullet);
    expect(next.sessionStatus).toBe("proceeding");
    expect(next.proceeding).not.toBeNull();
  });

  test("no-op when no bullets", () => {
    const snap = makeSnapshot();
    const next = startProceeding(snap);
    expect(next).toBe(snap);
  });

  test("no-op when already proceeding", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const withBullet = createDocumentUnitComment(snap, unit.unitId, "锚点", "批注");
    const proceeding = startProceeding(withBullet);
    const again = startProceeding(proceeding);
    expect(again).toBe(proceeding);
  });

  test("proceeding.total equals bullet count", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const s1 = createDocumentUnitComment(snap, unit.unitId, "a", "批注1");
    const unit2 = s1.documentUnits.find((u) => u.type === "paragraph" && u.unitId !== unit.unitId) ?? s1.documentUnits[1];
    const s2 = createDocumentUnitComment(s1, unit2.unitId, "b", "批注2");
    const next = startProceeding(s2);
    expect(next.proceeding?.total).toBe(2);
  });
});

// ─── closeSession ─────────────────────────────────────────────────────────────

describe("closeSession", () => {
  test("sets status to closed", () => {
    const snap = makeSnapshot();
    const next = closeSession(snap);
    expect(next.sessionStatus).toBe("closed");
  });

  test("clears activeBullets and proceeding", () => {
    const snap = makeSnapshot();
    const unit = snap.documentUnits[1];
    const withBullet = createDocumentUnitComment(snap, unit.unitId, "锚点", "批注");
    const next = closeSession(withBullet);
    expect(next.activeBullets).toHaveLength(0);
    expect(next.proceeding).toBeNull();
  });
});
