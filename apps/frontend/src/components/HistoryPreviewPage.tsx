import { useState } from "react";
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
  const [restoring, setRestoring] = useState(false);

  function handleRestore() {
    setRestoring(true);
    setTimeout(() => onRestore(), 1600);
  }

  return (
    <section className="history-preview-page" aria-label="History preview">
      {restoring && (
        <div className="restore-overlay">
          <div className="restore-status">
            <div className="proceeding-ink" aria-hidden="true">
              <span className="ink-drop" />
            </div>
            <p>正在恢复版本</p>
          </div>
        </div>
      )}
      <header className="history-preview-chrome">
        <div className="history-version-control" aria-label="History versions">
          {snapshot.versionHistory.map((version, index) => {
            const num = version.versionNumber ?? index;
            const cnLabels = ["原稿", "初稿", "二稿", "三稿", "四稿", "五稿", "六稿", "七稿", "八稿", "九稿", "十稿"];
            const displayLabel = num <= 10 ? cnLabels[num] : version.label ?? `第${num}稿`;
            return (
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
                {displayLabel}
              </button>
            );
          })}
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
            disabled={restoring}
            onClick={handleRestore}
          >
            恢复此版本为当前版本
          </button>
        </div>
      </footer>
    </section>
  );
}
