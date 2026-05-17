import {
  hasBlockingProceedBullets,
  selectRevisionLabel,
} from "../app/sessionSelectors";
import type { SessionSnapshot } from "../types/blackboard";

interface PageChromeProps {
  isInteractionLocked: boolean;
  onClose: () => void;
  onPreviewHistory: () => void;
  onProceed: () => void;
  snapshot: SessionSnapshot;
}

export function PageChrome({
  isInteractionLocked,
  onClose,
  onPreviewHistory,
  onProceed,
  snapshot,
}: PageChromeProps) {
  const statusLabel =
    snapshot.sessionStatus === "active" ? "协作中" : snapshot.sessionStatus;
  const canProceed =
    snapshot.sessionStatus === "active"
    && !isInteractionLocked
    && !hasBlockingProceedBullets(snapshot);
  const canPreviewHistory =
    snapshot.sessionStatus === "active" && !isInteractionLocked;

  return (
    <header className="page-chrome" aria-label="Blackboard session controls">
      <div className="chrome-left">
        <div className="chrome-title" title={snapshot.title}>
          {snapshot.title}
        </div>
      </div>
      <div className="chrome-center">
        {selectRevisionLabel(snapshot)} · {statusLabel}
      </div>
      <div className="chrome-actions">
        <button
          className="history-preview-button"
          disabled={!canPreviewHistory}
          onClick={onPreviewHistory}
          type="button"
        >
          History
        </button>
        <button
          className="proceed-button"
          disabled={!canProceed}
          onClick={onProceed}
          type="button"
        >
          {snapshot.sessionStatus === "proceeding" ? "Processing" : "Proceed"}
        </button>
        <button
          className="close-button"
          disabled={isInteractionLocked}
          onClick={onClose}
          type="button"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </header>
  );
}
