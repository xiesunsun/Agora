import { describe, expect, test } from "vitest";
import { buildReviewChangeSetFromCandidate } from "../sessionModel.js";
import { documentUnitsFromMarkdown } from "../markdownDocument.js";

function changes(base: string, candidate: string) {
  const units = documentUnitsFromMarkdown(base);
  return buildReviewChangeSetFromCandidate("cs", 1, "v1", base, candidate, units).changes;
}

describe("computeChanges (Myers paragraph-level + diffWords intra-paragraph)", () => {
  test("identical content produces no changes", () => {
    const text = "# Title\n\nParagraph one.\n\nParagraph two.";
    expect(changes(text, text)).toHaveLength(0);
  });

  test("single word change produces a replace with precise offset", () => {
    const base = "# Title\n\nThe quick brown fox.";
    const candidate = "# Title\n\nThe slow brown fox.";
    const result = changes(base, candidate);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("replace");
    expect(result[0].beforeText).toContain("quick");
    expect(result[0].afterText).toContain("slow");
    // Offset should not be 0 (not whole-unit replace)
    expect(result[0].startOffset).toBeGreaterThan(0);
  });

  test("paragraph delete produces a delete change", () => {
    const base = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const candidate = "# Title\n\nFirst paragraph.\n\nThird paragraph.";
    const result = changes(base, candidate);
    const deletes = result.filter((c) => c.kind === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].beforeText).toBe("Second paragraph.");
  });

  test("paragraph insert produces an insert change", () => {
    const base = "# Title\n\nFirst paragraph.\n\nThird paragraph.";
    const candidate = "# Title\n\nFirst paragraph.\n\nNew paragraph.\n\nThird paragraph.";
    const result = changes(base, candidate);
    const inserts = result.filter((c) => c.kind === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].afterText).toContain("New paragraph.");
  });

  test("mixed delete + modify + insert", () => {
    const base = "# Title\n\nDelete me.\n\nModify this sentence.\n\nKeep this.";
    const candidate = "# Title\n\nModify that sentence.\n\nKeep this.\n\nAdded new.";
    const result = changes(base, candidate);
    const deletes = result.filter((c) => c.kind === "delete");
    const replaces = result.filter((c) => c.kind === "replace");
    const inserts = result.filter((c) => c.kind === "insert");
    expect(deletes.length).toBeGreaterThanOrEqual(1);
    expect(replaces.length).toBeGreaterThanOrEqual(1);
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    // The replace should target the word "this" → "that"
    const replaceChange = replaces.find((c) => c.beforeText.includes("this") && c.afterText.includes("that"));
    expect(replaceChange).toBeDefined();
  });

  test("full rewrite falls back to whole-unit replaces", () => {
    const base = "# Old Title\n\nCompletely different content here.";
    const candidate = "# New Title\n\n完全不同的中文内容。";
    const result = changes(base, candidate);
    // Should still produce changes (not crash)
    expect(result.length).toBeGreaterThan(0);
    // All changes should be valid
    for (const c of result) {
      expect(c.status).toBe("pending");
      expect(["insert", "delete", "replace"]).toContain(c.kind);
    }
  });

  test("title change produces precise intra-unit diff", () => {
    const base = "# 努力：不是证明自己，而是回应现实\n\nContent.";
    const candidate = "# 努力\n\nContent.";
    const result = changes(base, candidate);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const titleChange = result[0];
    expect(titleChange.kind).toBe("replace");
    expect(titleChange.beforeText).toContain("：不是证明自己，而是回应现实");
  });

  test("multiple paragraphs deleted at once", () => {
    const base = "# Title\n\nA.\n\nB.\n\nC.\n\nD.\n\nE.";
    const candidate = "# Title\n\nA.\n\nE.";
    const result = changes(base, candidate);
    const deletes = result.filter((c) => c.kind === "delete");
    expect(deletes).toHaveLength(3); // B, C, D deleted
  });

  test("reordered paragraphs are detected as delete+insert", () => {
    const base = "# Title\n\nAlpha paragraph.\n\nBeta paragraph.\n\nGamma paragraph.";
    const candidate = "# Title\n\nGamma paragraph.\n\nAlpha paragraph.\n\nBeta paragraph.";
    const result = changes(base, candidate);
    // Myers will detect this as some combination of insert/delete
    expect(result.length).toBeGreaterThan(0);
  });
});
