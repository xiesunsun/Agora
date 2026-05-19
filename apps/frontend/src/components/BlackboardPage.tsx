import { useEffect, useRef, useState } from "react";
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

  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (
      pageStatus !== "proceeding" ||
      sessionRef.current.state.connectionStatus !== "offline" ||
      sessionRef.current.state.runtimeMode.kind !== "fixture"
    ) {
      return;
    }

    const s = sessionRef.current;
    const evt = (type: string, payload: unknown) => ({
      eventId: `fixture-${Date.now()}-${Math.random()}`,
      type,
      sessionId: "fixture",
      occurredAt: new Date().toISOString(),
      payload,
    });

    const timers: ReturnType<typeof setTimeout>[] = [];

    // 阶段 1: resolving_bullets, 0-33%
    let t = 0;
    for (let p = 0; p <= 33; p += 4) {
      const pp = p;
      timers.push(setTimeout(() => {
        s.applyEvent(evt("proceed.progress_updated", { completed: pp, total: 100 }));
      }, t));
      t += 180;
    }

    // 阶段 2: synthesizing_changes, 33-66%
    timers.push(setTimeout(() => {
      s.applyEvent(evt("proceed.stage_changed", { stage: "synthesizing_changes" }));
    }, t));
    for (let p = 34; p <= 66; p += 4) {
      const pp = p;
      timers.push(setTimeout(() => {
        s.applyEvent(evt("proceed.progress_updated", { completed: pp, total: 100 }));
      }, t));
      t += 180;
    }

    // 阶段 3: materializing_review, 66-95%
    timers.push(setTimeout(() => {
      s.applyEvent(evt("proceed.stage_changed", { stage: "materializing_review" }));
    }, t));
    for (let p = 67; p <= 95; p += 4) {
      const pp = p;
      timers.push(setTimeout(() => {
        s.applyEvent(evt("proceed.progress_updated", { completed: pp, total: 100 }));
      }, t));
      t += 180;
    }

    // 完成 → review
    timers.push(setTimeout(() => s.completeProceeding(), t + 300));

    return () => timers.forEach(clearTimeout);
  }, [pageStatus]);

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
    if (session.state.runtimeMode.kind === "fixture") {
      setTimeout(() => sessionRef.current.closeSession(), 2000);
    } else {
      session.closeSession();
    }
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
                取消
              </button>
              <button type="button" onClick={requestClose}>
                确认关闭
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {closeState === "requested" && pageStatus !== "closed" ? (
        <section className="proceeding-overlay" aria-label="Closing session">
          <div className="proceeding-status">
            <div className="proceeding-ink" aria-hidden="true">
              <span className="ink-drop" />
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
                返回会话
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
