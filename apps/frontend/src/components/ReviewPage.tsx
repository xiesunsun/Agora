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
        {snapshot.title}...
      </div>
      <div className="review-mode-switch" aria-label="Review mode">
        <button
          className="review-mode-button"
          data-active={mode === "flow" ? "true" : undefined}
          onClick={() => onSwitchMode("flow")}
          type="button"
        >
          Flow Review
        </button>
        <button
          className="review-mode-button"
          data-active={mode === "pr" ? "true" : undefined}
          onClick={() => onSwitchMode("pr")}
          type="button"
        >
          PR Review
        </button>
      </div>
      <div className="review-chrome-actions">
        <button
          type="button"
          className="review-close-button"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </header>
  );
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
          <h1>{snapshot.title}</h1>
          <div>
            <span>{selectRevisionLabel(snapshot)}</span>
            <span>•</span>
            <span>最后编辑于 14:20</span>
          </div>
        </header>

        <div className="review-document">
          {documentUnits
            .filter((unit) => unit.type !== "title")
            .map((unit) => (
              <ReviewUnit
                change={changeForUnit(changeSet, unit.unitId)}
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
  const targetIndex = documentUnits.findIndex(
    (unit) => unit.unitId === focusedChange?.unitId,
  );
  const beforeUnits = contextualUnits(
    documentUnits.slice(0, targetIndex),
  ).slice(-2);
  const afterUnits = contextualUnits(
    documentUnits.slice(targetIndex + 1),
  ).slice(0, 2);
  const targetUnit = documentUnits[targetIndex];

  if (!focusedChange || !targetUnit) {
    return null;
  }

  return (
    <main className="pr-review-main">
      <section className="pr-review-column">
        <div className="pr-review-context" aria-label="Preceding manuscript">
          {beforeUnits.map((unit) => (
            <ReviewUnit key={unit.unitId} unit={unit} />
          ))}
        </div>

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

        <div className="pr-review-context" aria-label="Following manuscript">
          {afterUnits.map((unit) => (
            <ReviewUnit key={unit.unitId} unit={unit} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ReviewUnit({ change, unit }: { change?: Change; unit: DocumentUnit }) {
  const content = inlineReviewContent(textForUnit(unit), change);

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
  return changeSet.changes.find(
    (change) => change.unitId === unitId && change.status === "pending",
  );
}

function contextualUnits(units: DocumentUnit[]) {
  return units.filter((unit) =>
    ["paragraph", "list_item", "blockquote"].includes(unit.type),
  );
}

function inlineReviewContent(text: string, change?: Change): ReactNode {
  if (
    !change ||
    change.status !== "pending" ||
    change.kind !== "replace" ||
    !change.before ||
    !change.after ||
    !text.includes(change.before)
  ) {
    return text;
  }

  const [prefix, ...rest] = text.split(change.before);
  const suffix = rest.join(change.before);

  return (
    <>
      {prefix}
      <del>{change.before}</del>
      <ins>{change.after}</ins>
      {suffix}
    </>
  );
}

function textForUnit(unit: DocumentUnit): string {
  switch (unit.type) {
    case "code_block":
      return unit.code;
    case "table":
      return unit.markdown;
    default:
      return unit.text;
  }
}
