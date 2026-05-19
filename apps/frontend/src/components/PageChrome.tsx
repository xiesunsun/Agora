import { useEffect, useState } from "react";
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const statusLabel =
    snapshot.sessionStatus === "active" ? "协作中" : snapshot.sessionStatus;
  const canProceed =
    snapshot.sessionStatus === "active"
    && !isInteractionLocked
    && !hasBlockingProceedBullets(snapshot);
  const canPreviewHistory =
    snapshot.sessionStatus === "active" && !isInteractionLocked;

  return (
    <header className="page-chrome" data-scrolled={scrolled ? "true" : undefined} aria-label="Blackboard session controls">
      <div className="chrome-left">
        <div className="chrome-title" title={snapshot.title}>
          {snapshot.title}
        </div>
        <div className="chrome-status-inline">
          {selectRevisionLabel(snapshot)} · {statusLabel}
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
          历史
        </button>
        <button
          className="proceed-button"
          disabled={!canProceed}
          onClick={onProceed}
          type="button"
        >
          {snapshot.sessionStatus === "proceeding" ? "润笔中" : "润笔"}
        </button>
        <button
          className="close-button"
          disabled={isInteractionLocked}
          onClick={onClose}
          type="button"
          aria-label="关闭会话"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
