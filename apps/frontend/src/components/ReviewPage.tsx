import type { ReactNode } from "react";
import { selectRevisionLabel } from "../app/sessionSelectors";
import type {
  Change,
  DocumentUnit,
  ReviewChangeSet,
  ReviewMode,
  SessionSnapshot,
} from "../types/blackboard";

interface ReviewPageProps {
  documentUnits: DocumentUnit[];
  onAcceptAll: () => void;
  onAcceptChange: (changeId: string) => void;
  onRejectAll: () => void;
  onRejectChange: (changeId: string) => void;
  onSwitchMode: (mode: ReviewChangeSet["mode"]) => void;
  reviewMode: ReviewMode;
  snapshot: SessionSnapshot;
}

export function ReviewPage({
  documentUnits,
  onAcceptAll,
  onAcceptChange,
  onRejectAll,
  onRejectChange,
  onSwitchMode,
  reviewMode,
  snapshot,
}: ReviewPageProps) {
  const changeSet = snapshot.activeReviewChangeSet;
  const mode = reviewMode;

  if (!changeSet) {
    return null;
  }

  return (
    <section className="review-page" data-review-mode={mode}>
      <ReviewChrome
        mode={mode}
        onSwitchMode={onSwitchMode}
        snapshot={snapshot}
      />
      {mode === "flow" ? (
        <FlowReview
          changeSet={changeSet}
          documentUnits={documentUnits}
          onAcceptAll={onAcceptAll}
          onRejectAll={onRejectAll}
          snapshot={snapshot}
        />
      ) : (
        <PrReview
          changeSet={changeSet}
          documentUnits={documentUnits}
          onAcceptChange={onAcceptChange}
          onRejectChange={onRejectChange}
        />
      )}
    </section>
  );
}

function ReviewChrome({
  mode,
  onSwitchMode,
  snapshot,
}: {
  mode: ReviewChangeSet["mode"];
  onSwitchMode: (mode: ReviewChangeSet["mode"]) => void;
  snapshot: SessionSnapshot;
}) {
  return (
    <header className="review-chrome">
      <div className="review-chrome-title" title={snapshot.title}>
        {snapshot.title}
      </div>
      <div className="review-mode-switch" aria-label="Review mode">
        <button
          className="review-mode-button"
          data-active={mode === "flow" ? "true" : undefined}
          onClick={() => onSwitchMode("flow")}
          type="button"
        >
          通篇审阅
        </button>
        <button
          className="review-mode-button"
          data-active={mode === "pr" ? "true" : undefined}
          onClick={() => onSwitchMode("pr")}
          type="button"
        >
          逐条审阅
        </button>
      </div>
      <div className="review-chrome-actions" />
    </header>
  );
}

function formatEditTime(snapshot: SessionSnapshot): string {
  const lastVersion = snapshot.versionHistory[snapshot.versionHistory.length - 1];
  const date = lastVersion ? new Date(lastVersion.createdAt) : new Date();
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function FlowReview({
  changeSet,
  documentUnits,
  onAcceptAll,
  onRejectAll,
  snapshot,
}: {
  changeSet: ReviewChangeSet;
  documentUnits: DocumentUnit[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  snapshot: SessionSnapshot;
}) {
  return (
    <main className="flow-review-main">
      <article className="flow-review-paper">
        <header className="flow-review-heading">
          <div>
            <span>{selectRevisionLabel(snapshot)}</span>
            <span>•</span>
            <span>最后编辑于 {formatEditTime(snapshot)}</span>
          </div>
        </header>

        <div className="review-document">
          {documentUnits
            .map((unit) => (
              <ReviewUnit
                changes={changeForUnit(changeSet, unit.unitId)}
                key={unit.unitId}
                unit={unit}
              />
            ))}
        </div>

        <footer className="flow-review-actions">
          <p>请检视以上修订建议并选择操作</p>
          <div>
            <button type="button" onClick={onAcceptAll}>
              <span aria-hidden="true">✓</span>
              全部接受修订
            </button>
            <i aria-hidden="true" />
            <button type="button" onClick={onRejectAll}>
              <span aria-hidden="true">×</span>
              全部拒绝
            </button>
          </div>
        </footer>
      </article>
    </main>
  );
}

function PrReview({
  changeSet,
  documentUnits,
  onAcceptChange,
  onRejectChange,
}: {
  changeSet: ReviewChangeSet;
  documentUnits: DocumentUnit[];
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
}) {
  const pendingChanges = changeSet.changes.filter(
    (change) => change.status === "pending",
  );
  const focusedChange = pendingChanges[0] ?? changeSet.changes[0];
  // For insert changes, unitId refers to the new unit which may not exist in base documentUnits
  // Fall back to the nearest existing unit
  const targetIndex = documentUnits.findIndex(
    (unit) => unit.unitId === focusedChange?.unitId,
  );
  const resolvedIndex = targetIndex >= 0 ? targetIndex : documentUnits.length - 1;
  const targetUnit = documentUnits[resolvedIndex];

  if (!focusedChange || !targetUnit) {
    return null;
  }

  return (
    <main className="pr-review-main">
      <section className="pr-review-column">
        {resolvedIndex > 0 && (
          <div className="pr-review-context" aria-label="Preceding manuscript">
            {documentUnits.slice(0, resolvedIndex).map((unit) => (
              <ReviewUnit key={unit.unitId} unit={unit} />
            ))}
          </div>
        )}

        <article className="pr-review-hunk">
          <div className="pr-review-hunk-meta">
            <span aria-hidden="true" />第{" "}
            {changeSet.changes.indexOf(focusedChange) + 1} /{" "}
            {changeSet.changes.length} 处待处理
          </div>
          <ReviewUnit change={focusedChange} unit={targetUnit} />
          <div className="pr-review-actions">
            <button
              type="button"
              onClick={() => onAcceptChange(focusedChange.changeId)}
            >
              <span aria-hidden="true">✓</span>
              接受
            </button>
            <button
              type="button"
              onClick={() => onRejectChange(focusedChange.changeId)}
            >
              <span aria-hidden="true">×</span>
              拒绝
            </button>
          </div>
        </article>

        {resolvedIndex < documentUnits.length - 1 && (
          <div className="pr-review-context" aria-label="Following manuscript">
            {documentUnits.slice(resolvedIndex + 1).map((unit) => (
              <ReviewUnit key={unit.unitId} unit={unit} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ReviewUnit({ change, changes, unit }: { change?: Change; changes?: Change[]; unit: DocumentUnit }) {
  const allChanges = changes ?? (change ? [change] : []);
  const prefixLen = unit.type === "title" || unit.type === "heading" || unit.type === "list_item" || unit.type === "blockquote"
    ? unit.markdown.indexOf(unit.text)
    : 0;
  const displayMarkdown = prefixLen > 0 ? unit.markdown.slice(prefixLen) : unit.markdown;
  const adjustedChanges = prefixLen > 0
    ? allChanges.map((c) => ({ ...c, startOffset: c.startOffset - prefixLen, endOffset: c.endOffset - prefixLen })).filter((c) => c.startOffset >= 0)
    : allChanges;
  const content = inlineReviewContent(displayMarkdown, adjustedChanges);

  switch (unit.type) {
    case "title":
      return (
        <section className="review-unit review-title">
          <h1>{content}</h1>
        </section>
      );
    case "heading": {
      const HeadingTag = unit.level === 2 ? "h2" : "h3";
      return (
        <section className="review-unit review-heading">
          <HeadingTag>{content}</HeadingTag>
        </section>
      );
    }
    case "list_item":
      return (
        <section className="review-unit review-list-item">
          <ul>
            <li>{content}</li>
          </ul>
        </section>
      );
    case "blockquote":
      return (
        <section className="review-unit review-blockquote">
          <blockquote>{content}</blockquote>
        </section>
      );
    case "table":
      return (
        <section className="review-unit review-table">
          <table>
            <thead>
              <tr>
                {unit.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unit.rows.map((row, index) => (
                <tr key={`${unit.unitId}-${index}`}>
                  {row.map((cell) => (
                    <td key={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
    case "code_block":
      return (
        <section className="review-unit review-code">
          <pre>
            <code>{unit.code}</code>
          </pre>
        </section>
      );
    case "paragraph":
    default:
      return (
        <section className="review-unit">
          <p>{content}</p>
        </section>
      );
  }
}

function changeForUnit(changeSet: ReviewChangeSet, unitId: string) {
  return changeSet.changes.filter(
    (change) => change.unitId === unitId && change.status === "pending",
  );
}

function contextualUnits(units: DocumentUnit[]) {
  return units;
}

function inlineReviewContent(text: string, changes: Change[]): ReactNode {
  const pending = changes.filter(
    (c) => c.status === "pending" && (c.kind === "replace" || c.kind === "delete") && c.beforeText,
  );
  if (pending.length === 0) {
    // Check for insert-only changes
    const inserts = changes.filter((c) => c.status === "pending" && c.kind === "insert");
    if (inserts.length === 0) return text;
    // Show text + appended inserts
    return <>{text}{inserts.map((c) => <ins key={`ins-${c.changeId}`}>{c.afterText}</ins>)}</>;
  }

  const sorted = [...pending].sort((a, b) => a.startOffset - b.startOffset);

  // Validate offsets match beforeText — if any mismatch, fallback to whole-unit diff
  const offsetsValid = sorted.every(
    (c) => text.slice(c.startOffset, c.endOffset) === c.beforeText,
  );
  if (!offsetsValid) {
    // Fallback: show entire unit as del + ins with candidate text
    const fullAfter = sorted.reduce(
      (t, c) => t.replace(c.beforeText, c.afterText),
      text,
    );
    return <><del>{text}</del><ins>{fullAfter}</ins></>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const change of sorted) {
    const before = text.slice(cursor, change.startOffset);
    if (before) parts.push(before);
    parts.push(<del key={`del-${change.changeId}`}>{change.beforeText}</del>);
    if (change.afterText) {
      parts.push(<ins key={`ins-${change.changeId}`}>{change.afterText}</ins>);
    }
    cursor = change.endOffset;
  }

  const tail = text.slice(cursor);
  if (tail) parts.push(tail);

  // Append any insert changes at the end
  const inserts = changes.filter((c) => c.status === "pending" && c.kind === "insert");
  for (const ins of inserts) {
    parts.push(<ins key={`ins-${ins.changeId}`}>{ins.afterText}</ins>);
  }

  return <>{parts}</>;
}
