import { describe, expect, it } from "vitest";
import {
  documentUnitsFromMarkdown,
  parseCodeMarkdown,
  parseTableMarkdown,
} from "../app/markdownDocument";

describe("markdown document derivation", () => {
  it("derives document units across the supported markdown profile", () => {
    const markdown = `# Title

## Heading

Paragraph text.

- First item
- Second item

> Quoted text

\`\`\`ts
const value = 1;
\`\`\`

| A | B |
| --- | --- |
| 1 | 2 |`;

    const units = documentUnitsFromMarkdown(markdown);

    expect(units.map((unit) => unit.type)).toEqual([
      "title",
      "heading",
      "paragraph",
      "list_item",
      "list_item",
      "blockquote",
      "code_block",
      "table",
    ]);
    expect(units[0]?.unitId).toBe("u-0-title");
    expect(units[3]).toMatchObject({
      type: "list_item",
      text: "First item",
    });
    expect(units[6]).toMatchObject({
      type: "code_block",
      language: "ts",
      code: "const value = 1;",
    });
    expect(units[7]).toMatchObject({
      type: "table",
      headers: ["A", "B"],
      rows: [["1", "2"]],
    });
  });

  it("keeps source ranges aligned to the markdown source", () => {
    const markdown = `# Title

Paragraph text.

- First item
- Second item`;

    const units = documentUnitsFromMarkdown(markdown);

    expect(units.length).toBeGreaterThan(0);

    for (const unit of units) {
      expect(markdown.slice(unit.sourceStart, unit.sourceEnd)).toBe(
        unit.markdown,
      );
    }
  });

  it("parses code fences and tables as standalone helpers", () => {
    expect(parseCodeMarkdown("```js\nconsole.log(1)\n```")).toEqual({
      language: "js",
      code: "console.log(1)",
    });

    expect(
      parseTableMarkdown(`| A | B |
| --- | --- |
| 1 | 2 |`),
    ).toEqual({
      headers: ["A", "B"],
      rows: [["1", "2"]],
    });
  });
});
