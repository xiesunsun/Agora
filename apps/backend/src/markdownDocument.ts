import type { Change, DocumentUnit } from "./types.js";

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

export function replaceDocumentUnitMarkdown(
  currentContent: string,
  targetUnit: Pick<DocumentUnit, "sourceStart" | "sourceEnd">,
  nextMarkdown: string,
): {
  currentContent: string;
  documentUnits: DocumentUnit[];
} {
  const normalizedMarkdown = nextMarkdown.trim();
  const nextContent =
    currentContent.slice(0, targetUnit.sourceStart) +
    normalizedMarkdown +
    currentContent.slice(targetUnit.sourceEnd);

  return {
    currentContent: nextContent,
    documentUnits: documentUnitsFromMarkdown(nextContent),
  };
}

export function removeUnitFromContent(
  currentContent: string,
  targetUnit: Pick<DocumentUnit, "sourceStart" | "sourceEnd">,
): string {
  // Remove the unit and any trailing blank lines
  let end = targetUnit.sourceEnd;
  while (end < currentContent.length && currentContent[end] === "\n") end++;
  let start = targetUnit.sourceStart;
  // Also remove leading blank line if present
  if (start > 0 && currentContent[start - 1] === "\n") start--;
  if (start > 0 && currentContent[start - 1] === "\n") start--;
  return (currentContent.slice(0, Math.max(0, start)) + (start > 0 ? "\n\n" : "") + currentContent.slice(end)).replace(/\n{3,}/g, "\n\n").trim();
}

export function applyChangeToMarkdown(
  currentContent: string,
  documentUnits: DocumentUnit[],
  change: Change,
): {
  currentContent: string;
  documentUnits: DocumentUnit[];
} {
  const targetUnit = documentUnits.find((unit) => unit.unitId === change.unitId);

  if (!targetUnit) {
    return {
      currentContent,
      documentUnits,
    };
  }

  const absoluteStart = targetUnit.sourceStart + change.startOffset;
  const absoluteEnd = targetUnit.sourceStart + change.endOffset;
  const nextContent =
    currentContent.slice(0, absoluteStart) +
    change.afterText +
    currentContent.slice(absoluteEnd);

  return {
    currentContent: nextContent,
    documentUnits: documentUnitsFromMarkdown(nextContent),
  };
}

export function findUnitAtSourceOffset(
  units: DocumentUnit[],
  offset: number,
): DocumentUnit | null {
  return (
    units.find((unit) => unit.sourceStart <= offset && offset < unit.sourceEnd) ??
    units.find((unit) => unit.sourceStart >= offset) ??
    units[units.length - 1] ??
    null
  );
}

export function selectDocumentTitle(
  units: DocumentUnit[],
  fallbackTitle: string,
): string {
  return units.find((unit) => unit.type === "title")?.text ?? fallbackTitle;
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
    if (value) blocks.push({ markdown: value, start: currentStart });
    current = [];
  }

  for (const line of lines) {
    const lineStart = offset;
    const isFence = line.trim().startsWith("```");
    if (current.length === 0 && line.trim()) currentStart = lineStart;
    if (isFence) inCodeBlock = !inCodeBlock;
    if (!inCodeBlock && !line.trim()) flush();
    else current.push(line);
    offset += line.length + 1;
  }

  flush();
  return blocks;
}

function documentUnitFromBlock(markdown: string, order: number, sourceStart: number): DocumentUnit {
  const base = {
    unitId: `u-${order}-${slug(markdown)}`,
    markdown,
    order,
    sourceStart,
    sourceEnd: sourceStart + markdown.length,
  };

  if (/^#\s+/.test(markdown)) {
    return { ...base, type: "title", text: stripHeading(markdown) };
  }
  if (/^#{2,3}\s+/.test(markdown)) {
    return { ...base, type: "heading", level: markdown.startsWith("###") ? 3 : 2, text: stripHeading(markdown) };
  }
  if (/^>\s?/.test(markdown)) {
    return { ...base, type: "blockquote", text: stripBlockquote(markdown) };
  }
  if (/^```/.test(markdown)) {
    return { ...base, type: "code_block", ...parseCode(markdown) };
  }
  const table = parseTable(markdown);
  if (table) return { ...base, type: "table", ...table };
  if (/^(\d+\.|-)\s+/.test(markdown)) {
    return { ...base, type: "list_item", listKind: /^\d+\.\s+/.test(markdown) ? "ordered" : "unordered", depth: 0, text: stripList(markdown) };
  }
  return { ...base, type: "paragraph", text: markdown };
}

function splitListItems(markdown: string, sourceStart: number) {
  const lines = markdown.split("\n");
  if (!lines.every((line) => /^(\d+\.|-)\s+/.test(line.trim()))) {
    return [{ markdown, start: sourceStart }];
  }
  let offset = sourceStart;
  return lines.map((line) => {
    const item = { markdown: line.trim(), start: offset + line.search(/\S/) };
    offset += line.length + 1;
    return item;
  });
}

export function stripHeading(markdown: string): string {
  return markdown.replace(/^#{1,3}\s+/, "").trim();
}

export function stripList(markdown: string): string {
  return markdown.replace(/^(\d+\.|-)\s+/, "").trim();
}

export function stripBlockquote(markdown: string): string {
  return markdown.split("\n").map((line) => line.replace(/^>\s?/, "")).join("\n").trim();
}

export function parseCode(markdown: string): { code: string; language?: string } {
  const match = markdown.match(/^```([^\n`]*)\n?([\s\S]*?)\n?```$/);
  if (!match) return { code: markdown };
  return { language: match[1]?.trim() || undefined, code: match[2] ?? "" };
}

export function parseTable(markdown: string): { headers: string[]; rows: string[][] } | null {
  const lines = markdown.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const parseRow = (line: string) =>
    line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const sep = parseRow(lines[1] ?? "");
  if (!sep.every((c) => /^:?-{3,}:?$/.test(c))) return null;
  return { headers: parseRow(lines[0] ?? ""), rows: lines.slice(2).map(parseRow) };
}

function slug(markdown: string): string {
  return markdown.replace(/^#+\s+/, "").replace(/[`|>#*_]/g, "").trim().slice(0, 12).replace(/\s+/g, "-").toLowerCase();
}
