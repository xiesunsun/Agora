import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  fixtureKeys,
  fixtures,
  reviewModeForFixture,
  viewModeForFixture,
  type FixtureKey,
} from "../fixtures";
import type {
  EventEnvelope,
  FrontendViewMode,
  HistoryVersionPayload,
  ReviewMode,
  SessionSnapshot,
} from "../types/blackboard";
import { ApiClient, getSessionIdFromLocation } from "./apiClient";
import {
  acceptAllRemainingCommand,
  acceptReviewChangeCommand,
  commitDocumentUnitEditCommand,
  createCommentCommand,
  proceedCommand,
  rejectAllRemainingCommand,
  rejectReviewChangeCommand,
  requestCloseCommand,
  restoreVersionCommand,
} from "./commands";
import { reduceSessionEvent } from "./eventReducer";
import { historyVersions } from "../fixtures/historyVersions";
import { subscribeToSessionEvents } from "./eventSourceClient";
import {
  closeSession,
  completeProceeding,
  commitDocumentUnitEdit,
  createDocumentUnitComment,
  resolveAllReviewChanges,
  resolveReviewChange,
  startProceeding,
  switchReviewMode,
} from "./sessionModel";

export interface SessionState {
  connectionStatus: "connecting" | "connected" | "offline";
  fixtureKey: FixtureKey;
  historyPreviewVersionId: string | null;
  lastEvent: EventEnvelope | null;
  reviewMode: ReviewMode;
  snapshot: SessionSnapshot;
  suspendedSnapshot: SessionSnapshot | null;
  viewMode: FrontendViewMode;
}

type SessionAction =
  | { type: "connection.connected" }
  | { type: "connection.offline" }
  | { type: "fixture.select"; fixtureKey: FixtureKey }
  | { type: "snapshot.replace"; snapshot: SessionSnapshot }
  | { type: "event.apply"; event: EventEnvelope }
  | { type: "history.preview_loaded"; version: HistoryVersionPayload }
  | { type: "history.back_to_active" }
  | { type: "history.restore_local" }
  | { type: "history.restore_started" }
  | { type: "review.mode.switch"; mode: ReviewMode }
  | { type: "fixture.session.close" }
  | { type: "fixture.session.proceed" }
  | { type: "fixture.session.proceed.complete" }
  | { type: "fixture.review.change.accept"; changeId: string }
  | { type: "fixture.review.change.reject"; changeId: string }
  | { type: "fixture.review.accept_all_remaining" }
  | { type: "fixture.review.reject_all_remaining" }
  | {
      type: "fixture.document_unit.edit.commit";
      unitId: string;
      text: string;
    }
  | {
      type: "fixture.document_unit.comment.create";
      anchorText: string;
      content: string;
      unitId: string;
    };

function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "connection.connected":
      return { ...state, connectionStatus: "connected" };
    case "connection.offline":
      return { ...state, connectionStatus: "offline" };
    case "fixture.select":
      return {
        ...state,
        fixtureKey: action.fixtureKey,
        historyPreviewVersionId: null,
        lastEvent: null,
        reviewMode: reviewModeForFixture(action.fixtureKey),
        snapshot: fixtures[action.fixtureKey],
        suspendedSnapshot: null,
        viewMode: viewModeForFixture(action.fixtureKey),
      };
    case "snapshot.replace":
      return { ...state, snapshot: action.snapshot };
    case "event.apply": {
      const snapshot = reduceSessionEvent(state.snapshot, action.event);

      return {
        ...state,
        connectionStatus:
          action.event.type === "session.snapshot"
            ? "connected"
            : state.connectionStatus,
        historyPreviewVersionId:
          action.event.type === "working_set.rebased" ||
          action.event.type === "session.snapshot"
            ? null
            : state.historyPreviewVersionId,
        lastEvent: action.event,
        reviewMode:
          snapshot.activeReviewChangeSet?.mode ?? state.reviewMode,
        snapshot,
        suspendedSnapshot:
          action.event.type === "working_set.rebased" ||
          action.event.type === "session.snapshot"
            ? null
            : state.suspendedSnapshot,
        viewMode:
          action.event.type === "working_set.rebased" ||
          action.event.type === "session.snapshot"
            ? "workspace"
            : state.viewMode,
      };
    }
    case "history.preview_loaded":
      return {
        ...state,
        historyPreviewVersionId: action.version.versionId,
        snapshot: {
          ...state.snapshot,
          currentVersionId: action.version.versionId,
          currentContent: action.version.content,
          documentUnits: action.version.documentUnits,
          activeBullets: [],
          activeReviewChangeSet: null,
          proceeding: null,
        },
        suspendedSnapshot: state.suspendedSnapshot ?? state.snapshot,
        viewMode: "history_preview",
      };
    case "history.back_to_active":
      return state.suspendedSnapshot
        ? {
            ...state,
            historyPreviewVersionId: null,
            snapshot: state.suspendedSnapshot,
            suspendedSnapshot: null,
            viewMode: "workspace",
          }
        : state;
    case "history.restore_local":
      return {
        ...state,
        historyPreviewVersionId: null,
        snapshot: {
          ...state.snapshot,
          baseVersionId:
            state.historyPreviewVersionId ?? state.snapshot.currentVersionId,
          sessionStatus: "active",
          activeBullets: [],
        },
        suspendedSnapshot: null,
        viewMode: "workspace",
      };
    case "history.restore_started":
      return {
        ...state,
        historyPreviewVersionId: null,
        suspendedSnapshot: null,
        viewMode: "workspace",
      };
    case "review.mode.switch":
      return {
        ...state,
        reviewMode: action.mode,
        snapshot: switchReviewMode(state.snapshot, action.mode),
      };
    case "fixture.session.close":
      return {
        ...state,
        snapshot: closeSession(state.snapshot),
      };
    case "fixture.session.proceed":
      return {
        ...state,
        snapshot: startProceeding(state.snapshot),
      };
    case "fixture.session.proceed.complete":
      return {
        ...state,
        snapshot: completeProceeding(state.snapshot),
      };
    case "fixture.review.change.accept":
      return {
        ...state,
        snapshot: resolveReviewChange(
          state.snapshot,
          action.changeId,
          "accepted",
        ),
      };
    case "fixture.review.change.reject":
      return {
        ...state,
        snapshot: resolveReviewChange(
          state.snapshot,
          action.changeId,
          "rejected",
        ),
      };
    case "fixture.review.accept_all_remaining":
      return {
        ...state,
        snapshot: resolveAllReviewChanges(state.snapshot, "accepted"),
      };
    case "fixture.review.reject_all_remaining":
      return {
        ...state,
        snapshot: resolveAllReviewChanges(state.snapshot, "rejected"),
      };
    case "fixture.document_unit.edit.commit":
      return {
        ...state,
        snapshot: commitDocumentUnitEdit(
          state.snapshot,
          action.unitId,
          action.text,
        ),
      };
    case "fixture.document_unit.comment.create":
      return {
        ...state,
        snapshot: createDocumentUnitComment(
          state.snapshot,
          action.unitId,
          action.anchorText,
          action.content,
        ),
      };
    default:
      return state;
  }
}

function shouldUseProtocol(): boolean {
  return new URLSearchParams(window.location.search).get("transport") !==
    "fixture";
}

export function useSessionStore(initialFixture: FixtureKey = "active") {
  const useProtocol = shouldUseProtocol();
  const sessionId = getSessionIdFromLocation(window.location);
  const apiClientRef = useRef<ApiClient | null>(null);
  const [state, dispatch] = useReducer(sessionReducer, {
    connectionStatus: useProtocol ? "connecting" : "offline",
    fixtureKey: initialFixture,
    historyPreviewVersionId: null,
    lastEvent: null,
    reviewMode: reviewModeForFixture(initialFixture),
    snapshot: fixtures[initialFixture],
    suspendedSnapshot: null,
    viewMode: viewModeForFixture(initialFixture),
  });

  if (!apiClientRef.current) {
    apiClientRef.current = new ApiClient(sessionId);
  }

  useEffect(() => {
    if (!useProtocol) {
      return;
    }

    return subscribeToSessionEvents(
      sessionId,
      (event) => dispatch({ type: "event.apply", event }),
      () => dispatch({ type: "connection.offline" }),
    );
  }, [sessionId, useProtocol]);

  function runCommand(
    protocolCommand: () => Promise<unknown>,
    fixtureAction: SessionAction,
  ) {
    if (!useProtocol) {
      dispatch(fixtureAction);
      return;
    }

    protocolCommand().catch(() => dispatch({ type: "connection.offline" }));
  }

  function loadHistoryPreview(versionId: string) {
    if (!useProtocol) {
      const version = historyVersions[versionId];

      if (version) {
        dispatch({ type: "history.preview_loaded", version });
      }

      return;
    }

    apiClientRef
      .current!.getHistoryVersion(versionId)
      .then((version) =>
        dispatch({ type: "history.preview_loaded", version }),
      )
      .catch(() => dispatch({ type: "connection.offline" }));
  }

  return useMemo(
    () => ({
      state,
      fixtureKeys,
      selectFixture: (fixtureKey: FixtureKey) =>
        dispatch({ type: "fixture.select", fixtureKey }),
      replaceSnapshot: (snapshot: SessionSnapshot) =>
        dispatch({ type: "snapshot.replace", snapshot }),
      applyEvent: (event: EventEnvelope) =>
        dispatch({ type: "event.apply", event }),
      closeSession: () =>
        runCommand(
          () => requestCloseCommand(apiClientRef.current!),
          { type: "fixture.session.close" },
        ),
      proceedSession: () =>
        runCommand(
          () => proceedCommand(apiClientRef.current!, state.snapshot),
          { type: "fixture.session.proceed" },
        ),
      completeProceeding: () =>
        dispatch({ type: "fixture.session.proceed.complete" }),
      previewCurrentHistory: () => {
        const currentVersionIndex = state.snapshot.versionHistory.findIndex(
          (version) => version.versionId === state.snapshot.currentVersionId,
        );
        const versionId =
          state.snapshot.versionHistory[Math.max(0, currentVersionIndex - 1)]
            ?.versionId ?? state.snapshot.currentVersionId;

        loadHistoryPreview(versionId);
      },
      previewHistoryVersion: loadHistoryPreview,
      backToActive: () => dispatch({ type: "history.back_to_active" }),
      restoreCurrentPreview: () => {
        const versionId = state.historyPreviewVersionId;

        if (!versionId) {
          return;
        }

        if (!useProtocol) {
          dispatch({ type: "history.restore_local" });
          return;
        }

        dispatch({ type: "history.restore_started" });

        runCommand(
          () => restoreVersionCommand(apiClientRef.current!, versionId),
          { type: "history.back_to_active" },
        );
      },
      switchReviewMode: (mode: ReviewMode) =>
        dispatch({ type: "review.mode.switch", mode }),
      acceptReviewChange: (changeId: string) => {
        const changeSetId = state.snapshot.activeReviewChangeSet?.changeSetId;

        if (!changeSetId) {
          return;
        }

        runCommand(
          () =>
            acceptReviewChangeCommand(
              apiClientRef.current!,
              changeSetId,
              changeId,
            ),
          { type: "fixture.review.change.accept", changeId },
        );
      },
      rejectReviewChange: (changeId: string) => {
        const changeSetId = state.snapshot.activeReviewChangeSet?.changeSetId;

        if (!changeSetId) {
          return;
        }

        runCommand(
          () =>
            rejectReviewChangeCommand(
              apiClientRef.current!,
              changeSetId,
              changeId,
            ),
          { type: "fixture.review.change.reject", changeId },
        );
      },
      acceptAllReviewChanges: () => {
        const changeSetId = state.snapshot.activeReviewChangeSet?.changeSetId;

        if (!changeSetId) {
          return;
        }

        runCommand(
          () => acceptAllRemainingCommand(apiClientRef.current!, changeSetId),
          { type: "fixture.review.accept_all_remaining" },
        );
      },
      rejectAllReviewChanges: () => {
        const changeSetId = state.snapshot.activeReviewChangeSet?.changeSetId;

        if (!changeSetId) {
          return;
        }

        runCommand(
          () => rejectAllRemainingCommand(apiClientRef.current!, changeSetId),
          { type: "fixture.review.reject_all_remaining" },
        );
      },
      commitDocumentUnitEdit: (unitId: string, text: string) =>
        runCommand(
          () =>
            commitDocumentUnitEditCommand(
              apiClientRef.current!,
              state.snapshot,
              unitId,
              text,
            ),
          { type: "fixture.document_unit.edit.commit", unitId, text },
        ),
      createDocumentUnitComment: (
        unitId: string,
        anchorText: string,
        content: string,
      ) =>
        runCommand(
          () =>
            createCommentCommand(
              apiClientRef.current!,
              unitId,
              anchorText,
              content,
            ),
          {
            type: "fixture.document_unit.comment.create",
            unitId,
            anchorText,
            content,
          },
        ),
    }),
    [state, useProtocol],
  );
}
