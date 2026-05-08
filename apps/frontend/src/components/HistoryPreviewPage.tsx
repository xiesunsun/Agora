import type { DocumentUnit, SessionSnapshot } from "../types/blackboard";
import { DocumentView } from "./DocumentView";

interface HistoryPreviewPageProps {
  documentUnits: DocumentUnit[];
  onBack: () => void;
  onPreviewVersion: (versionId: string) => void;
  onRestore: () => void;
  snapshot: SessionSnapshot;
}

export function HistoryPreviewPage({
  documentUnits,
  onBack,
  onPreviewVersion,
  onRestore,
  snapshot,
}: HistoryPreviewPageProps) {
  return (
    <section className="history-preview-page" aria-label="History preview">
      <header className="history-preview-chrome">
        <div className="history-version-control" aria-label="History versions">
          {snapshot.versionHistory.map((version) => (
            <button
              className="history-version-button"
              data-active={
                version.versionId === snapshot.currentVersionId
                  ? "true"
                  : undefined
              }
              key={version.versionId}
              onClick={() => onPreviewVersion(version.versionId)}
              type="button"
            >
              {version.label}
            </button>
          ))}
        </div>
      </header>
      <div className="history-preview-paper">
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
      </div>
      <footer className="history-preview-actions">
        <div className="history-preview-actions-inner">
          <button
            type="button"
            className="history-back-button"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
            返回当前工作区
          </button>
          <button
            type="button"
            className="history-restore-button"
            onClick={onRestore}
          >
            恢复此版本为当前版本
          </button>
        </div>
      </footer>
    </section>
  );
}
