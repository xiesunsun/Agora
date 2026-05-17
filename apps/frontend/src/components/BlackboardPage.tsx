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
import { MissingSessionPage } from "./MissingSessionPage";
import { PageChrome } from "./PageChrome";
import { ProceedingOverlay } from "./ProceedingOverlay";
import { ReadingSurface } from "./ReadingSurface";
import { ReviewPage } from "./ReviewPage";

interface BlackboardPageProps {
  session: ReturnType<typeof useSessionStore>;
}

export function BlackboardPage({ session }: BlackboardPageProps) {
  if (session.state.runtimeMode.kind === "missing") {
    return <MissingSessionPage />;
  }

  const { snapshot } = session.state;
  const documentUnits = selectDocumentUnits(snapshot);
  const bullets = selectActiveBullets(snapshot);
  const pageStatus = selectPageStatus(
    snapshot,
    session.state.viewMode,
    session.state.reviewMode,
  );
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [closeState, setCloseState] = useState<
    "idle" | "confirming" | "requested"
  >("idle");
  const [closeTimedOut, setCloseTimedOut] = useState(false);
  const hasUnsavedWork =
    bullets.length > 0 ||
    (snapshot.currentVersionId !== undefined &&
      snapshot.baseVersionId !== undefined &&
      snapshot.currentVersionId !== snapshot.baseVersionId);
  const isInteractionLocked =
    editingUnitId !== null || pageStatus !== "active" || closeState !== "idle";

  useEffect(() => {
    if (pageStatus === "closed") {
      setCloseState("idle");
      setCloseTimedOut(false);
    }
  }, [pageStatus]);

  useEffect(() => {
    if (closeState !== "requested") {
      return;
    }

    const timer = window.setTimeout(() => setCloseTimedOut(true), 60_000);

    return () => window.clearTimeout(timer);
  }, [closeState]);

  useEffect(() => {
    if (
      pageStatus !== "proceeding" ||
      session.state.connectionStatus !== "offline" ||
      session.state.runtimeMode.kind !== "fixture"
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
    anchorStartOffset?: number,
    anchorEndOffset?: number,
  ) {
    session.createDocumentUnitComment(
      unitId,
      anchorText,
      content,
      anchorStartOffset,
      anchorEndOffset,
    );
  }

  function requestClose() {
    setCloseState("requested");
    setCloseTimedOut(false);
    session.closeSession();
  }

  function handleClose() {
    if (editingUnitId !== null) {
      return;
    }

    if (hasUnsavedWork) {
      setCloseState("confirming");
      return;
    }

    requestClose();
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
            onClose={handleClose}
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
      {closeState === "confirming" && pageStatus !== "closed" ? (
        <section className="close-confirmation-overlay" aria-label="Close session confirmation">
          <div className="close-confirmation">
            <h2>关闭本次协作？</h2>
            <p>当前还有未结算的批注、编辑或版本变化。关闭会请求 Agent 做收尾处理。</p>
            <div className="close-confirmation-actions">
              <button
                type="button"
                onClick={() => setCloseState("idle")}
              >
                Cancel
              </button>
              <button type="button" onClick={requestClose}>
                Close session
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {closeState === "requested" && pageStatus !== "closed" ? (
        <section className="proceeding-overlay" aria-label="Closing session">
          <div className="proceeding-status">
            <div className="proceeding-orbit" aria-hidden="true">
              <span className="orbit-line orbit-line-a" />
              <span className="orbit-line orbit-line-b" />
              <span className="orbit-line orbit-line-c" />
              <span className="orbit-dot orbit-dot-a" />
              <span className="orbit-dot orbit-dot-b" />
              <span className="orbit-core" />
            </div>
            <h2>正在关闭会话</h2>
            <p>
              {closeTimedOut
                ? "关闭请求仍未完成。你可以返回继续协作，稍后再试。"
                : "Agent 正在整理本次协作成果并完成收尾总结。"}
            </p>
            {closeTimedOut ? (
              <button
                className="close-recovery-button"
                type="button"
                onClick={() => {
                  setCloseState("idle");
                  setCloseTimedOut(false);
                }}
              >
                Return to session
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {session.state.runtimeMode.kind === "fixture" ? (
        <FixtureSwitcher
          fixtureKey={session.state.fixtureKey}
          fixtureKeys={session.fixtureKeys}
          onSelect={session.selectFixture}
        />
      ) : null}
    </main>
  );
}
