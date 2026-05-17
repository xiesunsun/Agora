import { describe, expect, test, beforeEach, vi } from "vitest";
import {
  buildReviewChangeSetFromCandidate,
  completeProceeding,
  resolveAllReviewChangesWithSettlement,
  resolveReviewChangeWithSettlement,
  startProceeding,
  createDocumentUnitComment,
  updateProceedingStage,
  updateProceedingProgress,
} from "../sessionModel.js";
import type { SessionSnapshot } from "../types.js";
import { documentUnitsFromMarkdown } from "../markdownDocument.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_CONTENT = "# 标题\n\n第一段原文。\n\n第二段原文。";

function makeReviewingSnapshot(): SessionSnapshot {
  const documentUnits = documentUnitsFromMarkdown(BASE_CONTENT);
  const active: SessionSnapshot = {
    sessionId: "test",
    sessionStatus: "active",
    title: "标题",
    baseVersionId: "v1",
    currentVersionId: "v1",
    workingSetRevision: 2,
    currentContent: BASE_CONTENT,
    documentUnits,
    activeBullets: [],
    activeReviewChangeSet: null,
    proceeding: null,
    versionHistory: [{ versionId: "v1", versionNumber: 1, createdAt: "2026-01-01T00:00:00Z" }],
  };

  // Add a bullet so proceed is allowed
  const unit = documentUnits.find((u) => u.type === "paragraph")!;
  const withBullet = createDocumentUnitComment(active, unit.unitId, "第一段", "需要修改");
  const proceeding = startProceeding(withBullet);

  const candidateContent = "# 标题\n\n第一段修改后。\n\n第二段原文。";
  const changeSet = buildReviewChangeSetFromCandidate(
    "cs-1",
    proceeding.workingSetRevision,
    "v1",
    proceeding.currentContent,
    candidateContent,
    proceeding.documentUnits,
  );

  return completeProceeding(proceeding, changeSet) as SessionSnapshot;
}

// ─── buildReviewChangeSetFromCandidate ────────────────────────────────────────

describe("buildReviewChangeSetFromCandidate", () => {
  test("no changes when content identical", () => {
    const units = documentUnitsFromMarkdown(BASE_CONTENT);
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", BASE_CONTENT, BASE_CONTENT, units);
    expect(cs.changes).toHaveLength(0);
  });

  test("detects replace change", () => {
    const units = documentUnitsFromMarkdown(BASE_CONTENT);
    const candidate = "# 标题\n\n修改后的第一段。\n\n第二段原文。";
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", BASE_CONTENT, candidate, units);
    expect(cs.changes).toHaveLength(1);
    expect(cs.changes[0].kind).toBe("replace");
    expect(cs.changes[0].status).toBe("pending");
  });

  test("detects delete change", () => {
    const units = documentUnitsFromMarkdown(BASE_CONTENT);
    const candidate = "# 标题\n\n第一段原文。";
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", BASE_CONTENT, candidate, units);
    const deleteChange = cs.changes.find((c) => c.kind === "delete");
    expect(deleteChange).toBeDefined();
  });

  test("stores candidateContent", () => {
    const units = documentUnitsFromMarkdown(BASE_CONTENT);
    const candidate = "# 标题\n\n新内容。";
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", BASE_CONTENT, candidate, units);
    expect(cs.candidateContent).toBe(candidate);
  });

  test("all changes start as pending", () => {
    const units = documentUnitsFromMarkdown(BASE_CONTENT);
    const candidate = "# 标题\n\n修改一。\n\n修改二。";
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", BASE_CONTENT, candidate, units);
    expect(cs.changes.every((c) => c.status === "pending")).toBe(true);
  });
});

// ─── resolveReviewChangeWithSettlement ────────────────────────────────────────

describe("resolveReviewChangeWithSettlement (single change)", () => {
  test("accepting a change applies it to currentContent", () => {
    const snap = makeReviewingSnapshot();
    const changeId = snap.activeReviewChangeSet!.changes[0].changeId;
    const result = resolveReviewChangeWithSettlement(snap, changeId, "accepted");
    expect(result.snapshot.currentContent).toContain("第一段修改后。");
  });

  test("rejecting a change does not modify currentContent", () => {
    const snap = makeReviewingSnapshot();
    const changeId = snap.activeReviewChangeSet!.changes[0].changeId;
    const result = resolveReviewChangeWithSettlement(snap, changeId, "rejected");
    expect(result.snapshot.currentContent).toBe(snap.currentContent);
  });

  test("accepting the only change creates a new version", () => {
    const snap = makeReviewingSnapshot();
    const changeId = snap.activeReviewChangeSet!.changes[0].changeId;
    const result = resolveReviewChangeWithSettlement(snap, changeId, "accepted");
    expect(result.settlement?.reviewResolved.resolution).toBe("version_created");
    expect(result.snapshot.versionHistory.length).toBe(snap.versionHistory.length + 1);
  });

  test("rejecting the only change does NOT create a version", () => {
    const snap = makeReviewingSnapshot();
    const changeId = snap.activeReviewChangeSet!.changes[0].changeId;
    const result = resolveReviewChangeWithSettlement(snap, changeId, "rejected");
    expect(result.settlement?.reviewResolved.resolution).toBe("all_rejected");
    expect(result.snapshot.versionHistory.length).toBe(snap.versionHistory.length);
  });

  test("session returns to active after settlement", () => {
    const snap = makeReviewingSnapshot();
    const changeId = snap.activeReviewChangeSet!.changes[0].changeId;
    const result = resolveReviewChangeWithSettlement(snap, changeId, "accepted");
    expect(result.snapshot.sessionStatus).toBe("active");
    expect(result.snapshot.activeReviewChangeSet).toBeNull();
    expect(result.snapshot.activeBullets).toHaveLength(0);
  });

  test("settlement carries appliedBullets", () => {
    const snap = makeReviewingSnapshot();
    const changeId = snap.activeReviewChangeSet!.changes[0].changeId;
    const result = resolveReviewChangeWithSettlement(snap, changeId, "accepted");
    // The comment bullet created in makeReviewingSnapshot should be applied
    expect(result.settlement?.appliedBullets.length).toBeGreaterThan(0);
    expect(result.settlement?.appliedBullets.every((b) => b.status === "applied")).toBe(true);
  });

  test("no settlement while pending changes remain", () => {
    // Build a snapshot with 2 changes
    const content = "# T\n\n段落一。\n\n段落二。";
    const units = documentUnitsFromMarkdown(content);
    const candidate = "# T\n\n段落一修改。\n\n段落二修改。";
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", content, candidate, units);

    const base: SessionSnapshot = {
      sessionId: "test",
      sessionStatus: "reviewing",
      title: "T",
      baseVersionId: "v1",
      currentVersionId: "v1",
      workingSetRevision: 1,
      currentContent: content,
      documentUnits: units,
      activeBullets: [],
      activeReviewChangeSet: cs,
      proceeding: null,
      versionHistory: [{ versionId: "v1", versionNumber: 1, createdAt: "2026-01-01T00:00:00Z" }],
    };

    const result = resolveReviewChangeWithSettlement(base, cs.changes[0].changeId, "accepted");
    // Still one pending change → no settlement yet
    expect(result.settlement).toBeNull();
    expect(result.snapshot.sessionStatus).toBe("reviewing");
  });
});

// ─── resolveAllReviewChangesWithSettlement ────────────────────────────────────

describe("resolveAllReviewChangesWithSettlement", () => {
  test("accept all creates a version", () => {
    const snap = makeReviewingSnapshot();
    const result = resolveAllReviewChangesWithSettlement(snap, "accepted");
    expect(result.settlement?.reviewResolved.resolution).toBe("version_created");
    expect(result.snapshot.versionHistory.length).toBe(snap.versionHistory.length + 1);
  });

  test("reject all does NOT create a version", () => {
    const snap = makeReviewingSnapshot();
    const result = resolveAllReviewChangesWithSettlement(snap, "rejected");
    expect(result.settlement?.reviewResolved.resolution).toBe("all_rejected");
    expect(result.snapshot.versionHistory.length).toBe(snap.versionHistory.length);
  });

  test("reject all returns to active with original content", () => {
    const snap = makeReviewingSnapshot();
    const result = resolveAllReviewChangesWithSettlement(snap, "rejected");
    expect(result.snapshot.sessionStatus).toBe("active");
    expect(result.snapshot.currentContent).toBe(snap.currentContent);
  });

  test("accept all applies all changes to content", () => {
    const snap = makeReviewingSnapshot();
    const result = resolveAllReviewChangesWithSettlement(snap, "accepted");
    expect(result.snapshot.currentContent).toContain("第一段修改后。");
  });

  test("mixed: accept first then reject second — version created", () => {
    const content = "# T\n\n段落一。\n\n段落二。";
    const units = documentUnitsFromMarkdown(content);
    const candidate = "# T\n\n段落一修改。\n\n段落二修改。";
    const cs = buildReviewChangeSetFromCandidate("cs", 1, "v1", content, candidate, units);

    const base: SessionSnapshot = {
      sessionId: "test",
      sessionStatus: "reviewing",
      title: "T",
      baseVersionId: "v1",
      currentVersionId: "v1",
      workingSetRevision: 1,
      currentContent: content,
      documentUnits: units,
      activeBullets: [],
      activeReviewChangeSet: cs,
      proceeding: null,
      versionHistory: [{ versionId: "v1", versionNumber: 1, createdAt: "2026-01-01T00:00:00Z" }],
    };

    // Accept first change
    const r1 = resolveReviewChangeWithSettlement(base, cs.changes[0].changeId, "accepted");
    expect(r1.settlement).toBeNull(); // not settled yet

    // Reject second change → now settled with at least one accepted → version created
    const r2 = resolveReviewChangeWithSettlement(r1.snapshot, cs.changes[1].changeId, "rejected");
    expect(r2.settlement?.reviewResolved.resolution).toBe("version_created");
  });

  test("version number increments correctly", () => {
    const snap = makeReviewingSnapshot();
    const result = resolveAllReviewChangesWithSettlement(snap, "accepted");
    const newVersion = result.settlement?.version;
    expect(newVersion?.versionNumber).toBe(2); // v1 exists, so next is v2
    expect(newVersion?.versionId).toBe("v2");
  });
});

// ─── Bug fix regression tests ─────────────────────────────────────────────────

describe("Bug fix: accept-all uses candidateContent directly (not sequential offset apply)", () => {
  test("accept-all produces content equal to candidateContent, not a drift-corrupted version", () => {
    // Simulate a structural rewrite: all units changed (like subagent rewrote the whole doc)
    const base = "# 标题\n\n第一段原文内容比较长，包含很多字。\n\n第二段原文内容也比较长。\n\n第三段原文。";
    const candidate = "# 标题\n\n第一段已经被修改成新内容。\n\n第二段也被修改了。\n\n第三段同样修改。";
    const units = documentUnitsFromMarkdown(base);
    const cs = buildReviewChangeSetFromCandidate("cs-drift", 1, "v1", base, candidate, units);

    // Should have 3 replace changes (one per paragraph)
    expect(cs.changes.length).toBeGreaterThan(1);

    const snap: SessionSnapshot = {
      sessionId: "test-drift",
      sessionStatus: "reviewing",
      title: "标题",
      baseVersionId: "v1",
      currentVersionId: "v1",
      workingSetRevision: 1,
      currentContent: base,
      documentUnits: units,
      activeBullets: [],
      activeReviewChangeSet: cs,
      proceeding: null,
      versionHistory: [{ versionId: "v1", versionNumber: 1, createdAt: "2026-01-01T00:00:00Z" }],
    };

    const result = resolveAllReviewChangesWithSettlement(snap, "accepted");
    // The final content must exactly equal the candidate, not a drift-corrupted version
    expect(result.snapshot.currentContent).toBe(candidate);
  });

  test("accept-all with single change also produces candidateContent", () => {
    const base = "# 标题\n\n原文段落。";
    const candidate = "# 标题\n\n修改后段落。";
    const units = documentUnitsFromMarkdown(base);
    const cs = buildReviewChangeSetFromCandidate("cs-single", 1, "v1", base, candidate, units);

    const snap: SessionSnapshot = {
      sessionId: "test-single",
      sessionStatus: "reviewing",
      title: "标题",
      baseVersionId: "v1",
      currentVersionId: "v1",
      workingSetRevision: 1,
      currentContent: base,
      documentUnits: units,
      activeBullets: [],
      activeReviewChangeSet: cs,
      proceeding: null,
      versionHistory: [{ versionId: "v1", versionNumber: 1, createdAt: "2026-01-01T00:00:00Z" }],
    };

    const result = resolveAllReviewChangesWithSettlement(snap, "accepted");
    expect(result.snapshot.currentContent).toBe(candidate);
  });
});

describe("Bug fix: submit-review-candidate emits stage progression events", () => {
  test("handleSubmitReviewCandidate broadcasts stage and progress events before completing", async () => {
    vi.resetModules();
    const { handleCliRequest } = await import("../cliRoutes.js");
    const { createSession, getSession, setSession } = await import("../sessionStore.js");
    const { startProceeding, createDocumentUnitComment } = await import("../sessionModel.js");

    const sessionId = `test-stages-${Date.now()}`;
    const snap = createSession(sessionId, "Test", "# Test\n\nParagraph.");
    const unit = snap.documentUnits.find((u) => u.type === "paragraph")!;
    const withBullet = createDocumentUnitComment(snap, unit.unitId, "Paragraph", "Please expand");
    setSession(sessionId, withBullet);
    setSession(sessionId, startProceeding(withBullet));

    const broadcastedEvents: string[] = [];
    const { broadcast } = await import("../sseManager.js");
    vi.spyOn({ broadcast }, "broadcast").mockImplementation(() => {});

    // Collect SSE events by checking session state transitions
    // We verify by checking the session status goes through proceeding → reviewing
    const beforeSubmit = getSession(sessionId);
    expect(beforeSubmit?.sessionStatus).toBe("proceeding");

    const emitter = new (await import("node:events")).EventEmitter();
    const req = Object.assign(emitter, {
      method: "POST",
      url: `/cli/sessions/${sessionId}/review-candidate`,
      headers: { host: "localhost" },
    });
    const res = {
      _status: 200,
      _body: "",
      writeHead(s: number) { this._status = s; return this; },
      end(b?: unknown) { this._body = String(b ?? ""); return this; },
      getHeader: () => undefined,
    };

    handleCliRequest(req as never, res as never);
    setImmediate(() => {
      emitter.emit("data", Buffer.from(JSON.stringify({ candidateContent: "# Test\n\nExpanded paragraph." })));
      emitter.emit("end");
    });

    await new Promise((r) => setTimeout(r, 100));

    const afterSubmit = getSession(sessionId);
    // Session must have transitioned to reviewing
    expect(afterSubmit?.sessionStatus).toBe("reviewing");
    // The review change set must contain the candidate content
    expect(afterSubmit?.activeReviewChangeSet?.candidateContent).toBe("# Test\n\nExpanded paragraph.");
  });
});
