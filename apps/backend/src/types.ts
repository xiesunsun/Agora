import type {
  BlackboardCommandPayload as SharedBlackboardCommandPayload,
  BlackboardErrorCode as SharedBlackboardErrorCode,
  Bullet,
  BulletCommentCreatePayload,
  Change,
  CloseResult as SharedCloseResult,
  DocumentUnit,
  DocumentUnitEditCommitPayload,
  HistoryRestoreVersionPayload,
  HistoryVersionPayload,
  ReviewChangeStatusChangedPayload,
  ReviewBulkPayload,
  ReviewChangePayload,
  ReviewChangeSet,
  ReviewResolvedPayload,
  SessionSnapshot as SharedSessionSnapshot,
  SessionStatus,
  SessionProceedPayload,
  VersionCreatedPayload,
  VersionSummaryItem as SharedVersionSummaryItem,
} from "@blackboard/schema";

export type {
  Bullet,
  BulletCommentCreatePayload,
  Change,
  SharedCloseResult as CloseResult,
  DocumentUnit,
  DocumentUnitEditCommitPayload,
  HistoryRestoreVersionPayload,
  HistoryVersionPayload,
  ReviewChangeStatusChangedPayload,
  ReviewBulkPayload,
  ReviewChangePayload,
  ReviewChangeSet,
  ReviewResolvedPayload,
  SessionStatus,
  SessionProceedPayload,
  VersionCreatedPayload,
};

export type ProceedingStage =
  | "resolving_bullets"
  | "synthesizing_changes"
  | "materializing_review";

export interface ProceedingState {
  stage: ProceedingStage;
  completed: number;
  total: number;
  progress: number;
}

export interface SessionSnapshot
  extends Omit<
    SharedSessionSnapshot,
    "activeReviewChangeSet" | "versionHistory"
  > {
  activeReviewChangeSet: ReviewChangeSet | null;
  proceeding: ProceedingState | null;
  versionHistory: VersionSummaryItem[];
  /** Persisted by the host after the subagent startup turn completes. */
  subagentThreadId?: string;
}

export interface VersionSummaryItem extends SharedVersionSummaryItem {
  label?: string;
}

export interface CommandEnvelope<TPayload = unknown> {
  commandId: string;
  type: string;
  sessionId: string;
  issuedAt: string;
  payload: TPayload;
}

export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  type: string;
  sessionId: string;
  occurredAt: string;
  payload: TPayload;
}

export type BlackboardErrorCode = SharedBlackboardErrorCode;

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: BlackboardErrorCode;
    message: string;
    recoverable: boolean;
  };
}

export interface CommandAcceptedEnvelope {
  ok: true;
  commandId: string;
  acceptedAt: string;
}

export type CommandResponse = CommandAcceptedEnvelope | ErrorEnvelope;

export type BlackboardCommandPayload = SharedBlackboardCommandPayload;

// ─── Dispatch queue ──────────────────────────────────────────────────────────

export type DispatchEventStatus = "pending" | "delivering" | "handled" | "failed";

export interface DispatchEvent {
  eventId: string;
  sessionId: string;
  eventType: string;
  /** Formatted turn message ready to deliver to the subagent thread. */
  message: string;
  occurredAt: string;
  status: DispatchEventStatus;
  failureReason?: string;
}
