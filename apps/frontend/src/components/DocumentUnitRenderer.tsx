import type { ReactNode } from "react";
import type { DocumentUnit } from "../types/blackboard";
import { DocumentUnitEditor } from "./DocumentUnitEditor";

export interface CommentHighlight {
  activeKind?: "comment" | "edit";
  bulletId?: string;
  count: number;
  isActive?: boolean;
  isDraft: boolean;
  text: string;
}

interface DocumentUnitRendererProps {
  commentHighlights: CommentHighlight[];
  isActiveAnchor: boolean;
  isEditing: boolean;
  onHoverHighlightBullet: (bulletId: string | null) => void;
  onCancelEdit: () => void;
  onCommitEdit: (unitId: string, text: string) => void;
  onStartEdit: (unitId: string) => void;
  unit: DocumentUnit;
}

function renderInline(
  text: string,
  highlights: CommentHighlight[],
  onHoverHighlightBullet: (bulletId: string | null) => void,
) {
  if (highlights.length > 0) {
    return renderHighlightedText(text, highlights, onHoverHighlightBullet);
  }

  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }

    return part;
  });
}

function renderHighlightedText(
  text: string,
  highlights: CommentHighlight[],
  onHoverHighlightBullet: (bulletId: string | null) => void,
) {
  const validHighlights = highlights
    .filter(
      (highlight) => highlight.text.length > 0 && text.includes(highlight.text),
    )
    .sort((a, b) => b.text.length - a.text.length);
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextMatch = validHighlights.reduce<{
      highlight: CommentHighlight;
      index: number;
    } | null>((match, highlight) => {
      const index = text.indexOf(highlight.text, cursor);

      if (index === -1) {
        return match;
      }

      if (
        match === null ||
        index < match.index ||
        (index === match.index &&
          highlight.text.length > match.highlight.text.length)
      ) {
        return { highlight, index };
      }

      return match;
    }, null);

    if (nextMatch === null) {
      parts.push(text.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      parts.push(text.slice(cursor, nextMatch.index));
    }

    parts.push(
      <span
        className="comment-text-highlight"
        data-bullet-id={nextMatch.highlight.bulletId}
        data-highlight-count={Math.min(nextMatch.highlight.count || 1, 3)}
        data-highlight-state={highlightState(nextMatch.highlight)}
        key={`${nextMatch.index}-${nextMatch.highlight.text}`}
        onPointerEnter={() => {
          if (nextMatch.highlight.bulletId) {
            onHoverHighlightBullet(nextMatch.highlight.bulletId);
          }
        }}
        onPointerLeave={() => {
          if (nextMatch.highlight.bulletId) {
            onHoverHighlightBullet(null);
          }
        }}
      >
        {nextMatch.highlight.text}
      </span>,
    );
    cursor = nextMatch.index + nextMatch.highlight.text.length;
  }

  return parts;
}

function highlightState(highlight: CommentHighlight) {
  if (highlight.isDraft) {
    return "draft";
  }

  if (highlight.isActive && highlight.activeKind === "edit") {
    return "active-edit";
  }

  if (highlight.isActive) {
    return "active-comment";
  }

  return "saved";
}

function editableMarkdownForUnit(unit: DocumentUnit): string {
  return unit.markdown;
}

function renderEditor(
  unit: DocumentUnit,
  onCancelEdit: () => void,
  onCommitEdit: (unitId: string, text: string) => void,
) {
  return (
    <DocumentUnitEditor
      initialText={editableMarkdownForUnit(unit)}
      unit={unit}
      onCancel={onCancelEdit}
      onCommit={onCommitEdit}
    />
  );
}

export function DocumentUnitRenderer({
  commentHighlights,
  isActiveAnchor,
  isEditing,
  onHoverHighlightBullet,
  onCancelEdit,
  onCommitEdit,
  onStartEdit,
  unit,
}: DocumentUnitRendererProps) {
  const lineLabel = String(unit.order + 1).padStart(2, "0");
  const activeAnchor = isActiveAnchor ? "true" : undefined;
  const editing = isEditing;
  const highlightCount = commentHighlights.reduce(
    (count, highlight) => count + highlight.count,
    0,
  );
  const handleDoubleClick = () => {
    onStartEdit(unit.unitId);
  };

  switch (unit.type) {
    case "title":
      return (
        <section
          className="document-unit document-title"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-editing={editing ? "true" : undefined}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <h1>
              {renderInline(
                unit.text,
                commentHighlights,
                onHoverHighlightBullet,
              )}
            </h1>
          )}
        </section>
      );
    case "heading": {
      const HeadingTag = unit.level === 2 ? "h2" : "h3";
      return (
        <section
          className="document-unit document-heading"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-editing={editing ? "true" : undefined}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <HeadingTag>
              {renderInline(
                unit.text,
                commentHighlights,
                onHoverHighlightBullet,
              )}
            </HeadingTag>
          )}
        </section>
      );
    }
    case "paragraph":
      return (
        <section
          className="document-unit"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-drop-cap={unit.dropCap ? "true" : undefined}
          data-editing={editing ? "true" : undefined}
          data-tone={unit.tone}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <p>
              {renderInline(
                unit.text,
                commentHighlights,
                onHoverHighlightBullet,
              )}
            </p>
          )}
        </section>
      );
    case "list_item": {
      const ListTag = unit.listKind === "ordered" ? "ol" : "ul";
      return (
        <section
          className="document-unit document-list-item"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-editing={editing ? "true" : undefined}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <ListTag>
              <li>
                {renderInline(
                  unit.text,
                  commentHighlights,
                  onHoverHighlightBullet,
                )}
              </li>
            </ListTag>
          )}
        </section>
      );
    }
    case "blockquote":
      return (
        <section
          className="document-unit document-quote"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-editing={editing ? "true" : undefined}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <blockquote>
              {renderInline(
                unit.text,
                commentHighlights,
                onHoverHighlightBullet,
              )}
            </blockquote>
          )}
        </section>
      );
    case "table":
      return (
        <section
          className="document-unit document-table"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-editing={editing ? "true" : undefined}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <table>
              <thead>
                <tr>
                  {unit.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unit.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      );
    case "code_block":
      return (
        <section
          className="document-unit document-code"
          data-active-anchor={activeAnchor}
          data-comment-highlight-count={highlightCount || undefined}
          data-editing={editing ? "true" : undefined}
          data-unit-id={unit.unitId}
          onDoubleClick={handleDoubleClick}
        >
          <span className="line-number">{lineLabel}</span>
          {editing ? (
            renderEditor(unit, onCancelEdit, onCommitEdit)
          ) : (
            <pre>
              <code>{unit.code}</code>
            </pre>
          )}
        </section>
      );
    default:
      return null;
  }
}
