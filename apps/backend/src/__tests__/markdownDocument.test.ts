import { describe, expect, test } from "vitest";
import {
  documentUnitsFromMarkdown,
  replaceDocumentUnitMarkdown,
} from "../markdownDocument.js";

// ─── documentUnitsFromMarkdown ────────────────────────────────────────────────

describe("documentUnitsFromMarkdown", () => {
  test("parses title, paragraph, heading", () => {
    const md = "# 标题\n\n第一段。\n\n## 小节";
    const units = documentUnitsFromMarkdown(md);
    expect(units).toHaveLength(3);
    expect(units[0].type).toBe("title");
    expect(units[1].type).toBe("paragraph");
    expect(units[2].type).toBe("heading");
  });

  test("assigns sequential order starting at 0", () => {
    const units = documentUnitsFromMarkdown("# T\n\nA\n\nB");
    expect(units.map((u) => u.order)).toEqual([0, 1, 2]);
  });

  test("sourceStart and sourceEnd cover the unit markdown", () => {
    const md = "# 标题\n\n第一段。";
    const units = documentUnitsFromMarkdown(md);
    for (const unit of units) {
      expect(md.slice(unit.sourceStart, unit.sourceEnd)).toBe(unit.markdown);
    }
  });

  test("sourceStart/sourceEnd are non-overlapping and cover full content", () => {
    const md = "# T\n\nPara one.\n\nPara two.";
    const units = documentUnitsFromMarkdown(md);
    // Each unit's range must not overlap with the next
    for (let i = 0; i < units.length - 1; i++) {
      expect(units[i].sourceEnd).toBeLessThanOrEqual(units[i + 1].sourceStart);
    }
  });

  test("parses blockquote", () => {
    const md = "> 引用内容";
    const units = documentUnitsFromMarkdown(md);
    expect(units[0].type).toBe("blockquote");
  });

  test("parses code block as single unit", () => {
    const md = "```ts\nconst x = 1;\n```";
    const units = documentUnitsFromMarkdown(md);
    expect(units).toHaveLength(1);
    expect(units[0].type).toBe("code_block");
  });

  test("parses list items as separate units", () => {
    const md = "- 项目一\n- 项目二\n- 项目三";
    const units = documentUnitsFromMarkdown(md);
    expect(units).toHaveLength(3);
    expect(units.every((u) => u.type === "list_item")).toBe(true);
  });

  test("empty string returns empty array", () => {
    expect(documentUnitsFromMarkdown("")).toHaveLength(0);
  });

  test("unitId is stable for same content at same position", () => {
    const md = "# 标题\n\n段落";
    const a = documentUnitsFromMarkdown(md);
    const b = documentUnitsFromMarkdown(md);
    expect(a[0].unitId).toBe(b[0].unitId);
    expect(a[1].unitId).toBe(b[1].unitId);
  });
});

// ─── replaceDocumentUnitMarkdown ──────────────────────────────────────────────

describe("replaceDocumentUnitMarkdown", () => {
  test("replaces a paragraph and re-parses correctly", () => {
    const md = "# 标题\n\n第一段。\n\n第二段。";
    const units = documentUnitsFromMarkdown(md);
    const para = units.find((u) => u.type === "paragraph")!;

    const result = replaceDocumentUnitMarkdown(md, para, "修改后的第一段。");

    const newUnits = result.documentUnits;
    expect(newUnits.find((u) => u.type === "paragraph")?.markdown).toBe("修改后的第一段。");
    // Second paragraph still present
    expect(newUnits.filter((u) => u.type === "paragraph")).toHaveLength(2);
  });

  test("sourceStart/sourceEnd correct after replacement", () => {
    const md = "# T\n\nOld paragraph.\n\nSecond.";
    const units = documentUnitsFromMarkdown(md);
    const para = units[1];

    const result = replaceDocumentUnitMarkdown(md, para, "New paragraph.");

    for (const unit of result.documentUnits) {
      expect(result.currentContent.slice(unit.sourceStart, unit.sourceEnd)).toBe(unit.markdown);
    }
  });

  test("replacing title updates currentContent correctly", () => {
    const md = "# 旧标题\n\n段落";
    const units = documentUnitsFromMarkdown(md);
    const title = units[0];

    const result = replaceDocumentUnitMarkdown(md, title, "# 新标题");

    expect(result.currentContent).toContain("# 新标题");
    expect(result.currentContent).not.toContain("# 旧标题");
  });

  test("unit type can change after replacement", () => {
    // Replace a paragraph with a heading — type should change
    const md = "# T\n\n普通段落";
    const units = documentUnitsFromMarkdown(md);
    const para = units[1];

    const result = replaceDocumentUnitMarkdown(md, para, "## 变成小节");

    const newPara = result.documentUnits[1];
    expect(newPara.type).toBe("heading");
  });

  test("no-op replacement returns equivalent content", () => {
    const md = "# T\n\n段落内容";
    const units = documentUnitsFromMarkdown(md);
    const para = units[1];

    const result = replaceDocumentUnitMarkdown(md, para, para.markdown);

    expect(result.currentContent).toBe(md);
  });
});
