import type {
  BlackboardCommandPayload as SharedBlackboardCommandPayload,
  BlackboardErrorCode as SharedBlackboardErrorCode,
  BulletCommentCreatePayload,
  BulletStatus,
  BulletType,
  CodeBlockUnit as SharedCodeBlockUnit,
  CommentBullet as SharedCommentBullet,
  Change,
  ChangeKind,
  ChangeStatus,
  DocumentUnitEditCommitPayload,
  DocumentUnitType,
  EditBullet as SharedEditBullet,
  HeadingUnit as SharedHeadingUnit,
  HistoryRestoreVersionPayload,
  HistoryVersionPayload as SharedHistoryVersionPayload,
  ListItemUnit as SharedListItemUnit,
  ParagraphUnit as SharedParagraphUnit,
  ReviewBulkPayload,
  ReviewChangeStatusChangedPayload,
  ReviewChangePayload,
  ReviewChangeSet as SharedReviewChangeSet,
  ReviewResolvedPayload,
  SessionSnapshot as SharedSessionSnapshot,
  SessionStatus,
  SessionProceedPayload,
  TableUnit as SharedTableUnit,
  TitleUnit as SharedTitleUnit,
  VersionCreatedPayload,
  VersionSummaryItem as SharedVersionSummaryItem,
  BlockquoteUnit as SharedBlockquoteUnit,
} from "@blackboard/schema";

export type {
  BulletCommentCreatePayload,
  BulletStatus,
  BulletType,
  Change,
  ChangeKind,
  ChangeStatus,
  DocumentUnitEditCommitPayload,
  DocumentUnitType,
  HistoryRestoreVersionPayload,
  ReviewChangeStatusChangedPayload,
  ReviewResolvedPayload,
  SessionProceedPayload,
  SessionStatus,
  VersionCreatedPayload,
};

export type FrontendViewMode = "workspace" | "history_preview";
export type ReviewMode = "flow" | "pr";

export type PageStatus =
  | "active"
  | "proceeding"
  | "reviewing_flow"
  | "reviewing_pr"
  | "history_preview"
  | "closed";

export type BulletVisualStatus = "new" | "processing" | "processed";

export interface BulletPresentation {
  title: string;
  body: string;
  author: string;
  railY: number;
}

export interface TitleUnit extends SharedTitleUnit {}

export interface HeadingUnit extends SharedHeadingUnit {}

export interface ParagraphUnit extends SharedParagraphUnit {
  tone?: "normal" | "muted";
  dropCap?: boolean;
}

export interface ListItemUnit extends SharedListItemUnit {}

export interface TableUnit extends SharedTableUnit {}

export interface CodeBlockUnit extends SharedCodeBlockUnit {}

export interface BlockquoteUnit extends SharedBlockquoteUnit {}

export type DocumentUnit =
  | TitleUnit
  | HeadingUnit
  | ParagraphUnit
  | ListItemUnit
  | TableUnit
  | CodeBlockUnit
  | BlockquoteUnit;

export interface EditBullet extends SharedEditBullet, BulletPresentation {}

export interface CommentBullet
  extends SharedCommentBullet, BulletPresentation {}

export type Bullet = EditBullet | CommentBullet;

export interface ReviewChangeSet extends SharedReviewChangeSet {
  mode: ReviewMode;
}

export interface VersionSummaryItem extends SharedVersionSummaryItem {
  label?: string;
}

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
    "activeBullets" | "activeReviewChangeSet" | "versionHistory"
  > {
  activeBullets: Bullet[];
  activeReviewChangeSet: ReviewChangeSet | null;
  proceeding: ProceedingState | null;
  versionHistory: VersionSummaryItem[];
}

export type HistoryVersionPayload = SharedHistoryVersionPayload;

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
