import { useEffect, useState } from "react";
import type { useSessionStore } from "../app/sessionStore";
import {
  selectActiveBullets,
  selectDocumentUnits,
  selectPageStatus,
} from "../app/sessionSelectors";
import { ClosedStatePage } from "./ClosedStatePage";
import { FixtureSwitcher } from "./FixtureSwitcher";
import { HistoryPreviewPage } from "./HistoryPreviewPage";
import { PageChrome } from "./PageChrome";
import { ProceedingOverlay } from "./ProceedingOverlay";
import { ReadingSurface } from "./ReadingSurface";
import { ReviewPage } from "./ReviewPage";

interface BlackboardPageProps {
  session: ReturnType<typeof useSessionStore>;
}

export function BlackboardPage({ session }: BlackboardPageProps) {
  const { snapshot } = session.state;
  const documentUnits = selectDocumentUnits(snapshot);
  const bullets = selectActiveBullets(snapshot);
  const pageStatus = selectPageStatus(
    snapshot,
    session.state.viewMode,
    session.state.reviewMode,
  );
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const isInteractionLocked =
    editingUnitId !== null || pageStatus !== "active";

  useEffect(() => {
    if (
      pageStatus !== "proceeding" ||
      session.state.connectionStatus !== "offline"
    ) {
      return;
    }

    const timer = window.setTimeout(() => session.completeProceeding(), 1400);

    return () => window.clearTimeout(timer);
  }, [pageStatus, session]);

  function handleCommitEdit(unitId: string, text: string) {
    session.commitDocumentUnitEdit(unitId, text);
    setEditingUnitId(null);
  }

  function handleCreateComment(
    unitId: string,
    anchorText: string,
    content: string,
  ) {
    session.createDocumentUnitComment(unitId, anchorText, content);
  }

  return (
    <main className="blackboard-page" data-status={pageStatus}>
      {pageStatus === "history_preview" ? (
        <HistoryPreviewPage
          documentUnits={documentUnits}
          onBack={session.backToActive}
          onPreviewVersion={session.previewHistoryVersion}
          onRestore={session.restoreCurrentPreview}
          snapshot={snapshot}
        />
      ) : pageStatus === "closed" ? (
        <ClosedStatePage documentUnits={documentUnits} snapshot={snapshot} />
      ) : pageStatus === "reviewing_flow" || pageStatus === "reviewing_pr" ? (
        <ReviewPage
          documentUnits={documentUnits}
          onAcceptAll={session.acceptAllReviewChanges}
          onAcceptChange={session.acceptReviewChange}
          onRejectAll={session.rejectAllReviewChanges}
          onRejectChange={session.rejectReviewChange}
          onSwitchMode={session.switchReviewMode}
          reviewMode={session.state.reviewMode}
          snapshot={snapshot}
        />
      ) : (
        <>
          <PageChrome
            isInteractionLocked={isInteractionLocked}
            onClose={session.closeSession}
            onPreviewHistory={session.previewCurrentHistory}
            onProceed={session.proceedSession}
            snapshot={snapshot}
          />
          <ReadingSurface
            bullets={bullets}
            editingUnitId={editingUnitId}
            onCancelEdit={() => setEditingUnitId(null)}
            onCreateComment={handleCreateComment}
            onCommitEdit={handleCommitEdit}
            onStartEdit={setEditingUnitId}
            pageStatus={pageStatus}
            documentUnits={documentUnits}
          />
        </>
      )}
      {pageStatus === "proceeding" ? (
        <ProceedingOverlay
          proceeding={snapshot.proceeding}
        />
      ) : null}
      <FixtureSwitcher
        fixtureKey={session.state.fixtureKey}
        fixtureKeys={session.fixtureKeys}
        onSelect={session.selectFixture}
      />
    </main>
  );
}
