import type { DocumentUnit } from "../types/blackboard";
import {
  parseCodeMarkdown,
  parseTableMarkdown,
  stripBlockquoteMarkdown,
  stripHeadingMarkdown,
  stripListMarkdown,
} from "./sessionModel";

export function documentUnitsFromMarkdown(markdown: string): DocumentUnit[] {
  const blocks = splitMarkdownBlocks(markdown);
  let order = 0;
  const units: DocumentUnit[] = [];

  for (const block of blocks) {
    const listItems = splitListItems(block.markdown, block.start);

    for (const item of listItems) {
      units.push(documentUnitFromBlock(item.markdown, order, item.start));
      order += 1;
    }
  }

  return units;
}

function splitMarkdownBlocks(markdown: string) {
  const blocks: Array<{ markdown: string; start: number }> = [];
  const lines = markdown.split("\n");
  let current: string[] = [];
  let currentStart = 0;
  let offset = 0;
  let inCodeBlock = false;

  function flush() {
    const value = current.join("\n").trim();

    if (value) {
      blocks.push({ markdown: value, start: currentStart });
    }

    current = [];
  }

  for (const line of lines) {
    const lineStart = offset;
    const isFence = line.trim().startsWith("```");

    if (current.length === 0 && line.trim()) {
      currentStart = lineStart;
    }

    if (isFence) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && !line.trim()) {
      flush();
    } else {
      current.push(line);
    }

    offset += line.length + 1;
  }

  flush();
  return blocks;
}

function documentUnitFromBlock(
  markdown: string,
  order: number,
  sourceStart: number,
): DocumentUnit {
  const base = {
    unitId: `u-${order}-${slug(markdown)}`,
    markdown,
    order,
    sourceStart,
    sourceEnd: sourceStart + markdown.length,
  };

  if (/^#\s+/.test(markdown)) {
    return {
      ...base,
      type: "title",
      text: stripHeadingMarkdown(markdown),
    };
  }

  if (/^#{2,3}\s+/.test(markdown)) {
    const level = markdown.startsWith("###") ? 3 : 2;

    return {
      ...base,
      type: "heading",
      level,
      text: stripHeadingMarkdown(markdown),
    };
  }

  if (/^>\s?/.test(markdown)) {
    return {
      ...base,
      type: "blockquote",
      text: stripBlockquoteMarkdown(markdown),
    };
  }

  if (/^```/.test(markdown)) {
    return {
      ...base,
      type: "code_block",
      ...parseCodeMarkdown(markdown),
    };
  }

  const table = parseTableMarkdown(markdown);

  if (table) {
    return {
      ...base,
      type: "table",
      ...table,
    };
  }

  if (/^(\d+\.|-)\s+/.test(markdown)) {
    return {
      ...base,
      type: "list_item",
      listKind: /^\d+\.\s+/.test(markdown) ? "ordered" : "unordered",
      depth: 0,
      text: stripListMarkdown(markdown),
    };
  }

  return {
    ...base,
    type: "paragraph",
    text: markdown,
  };
}

function splitListItems(markdown: string, sourceStart: number) {
  const lines = markdown.split("\n");

  if (!lines.every((line) => /^(\d+\.|-)\s+/.test(line.trim()))) {
    return [{ markdown, start: sourceStart }];
  }

  let offset = sourceStart;

  return lines.map((line) => {
    const item = {
      markdown: line.trim(),
      start: offset + line.search(/\S/),
    };

    offset += line.length + 1;
    return item;
  });
}

function slug(markdown: string): string {
  return markdown
    .replace(/^#+\s+/, "")
    .replace(/[`|>#*_]/g, "")
    .trim()
    .slice(0, 12)
    .replace(/\s+/g, "-")
    .toLowerCase();
}
