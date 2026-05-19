import { selectRevisionLabel } from "../app/sessionSelectors";
import type { DocumentUnit, SessionSnapshot } from "../types/blackboard";
import { DocumentView } from "./DocumentView";

interface ClosedStatePageProps {
  documentUnits: DocumentUnit[];
  snapshot: SessionSnapshot;
}

export function ClosedStatePage({
  documentUnits,
  snapshot,
}: ClosedStatePageProps) {
  return (
    <section className="closed-state-page" aria-label="Closed manuscript">
      <header className="closed-state-chrome">
        <div className="closed-state-title" title={snapshot.title}>
          {snapshot.title}
        </div>
        <div className="closed-state-status">当前会话已关闭 · 仅供阅读</div>
        <div className="closed-state-actions" />
      </header>

      <main className="closed-state-main">
        <div className="closed-state-notice">
          <span aria-hidden="true">i</span>
          <p>会话已关闭。你仍可阅读最终原稿，但不能继续编辑或推进。</p>
        </div>

        <article className="closed-state-paper">
          <DocumentView
            activeAnchorUnitId={null}
            commentHighlightsByUnit={{}}
            documentUnits={documentUnits}
            editingUnitId={null}
            onCancelEdit={() => undefined}
            onCommitEdit={() => undefined}
            onHoverHighlightBullet={() => undefined}
            onStartEdit={() => undefined}
          />
          <div className="closed-state-end-mark" aria-hidden="true" />
        </article>
      </main>
    </section>
  );
}
