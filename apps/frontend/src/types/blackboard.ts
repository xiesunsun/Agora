export type SessionStatus =
  | "active"
  | "proceeding"
  | "reviewing"
  | "closed";

export type FrontendViewMode = "workspace" | "history_preview";

export type ReviewMode = "flow" | "pr";

export type PageStatus =
  | "active"
  | "proceeding"
  | "reviewing_flow"
  | "reviewing_pr"
  | "history_preview"
  | "closed";

export type DocumentUnitType =
  | "title"
  | "heading"
  | "paragraph"
  | "list_item"
  | "blockquote"
  | "table"
  | "code_block";

export interface DocumentUnitBase {
  unitId: string;
  type: DocumentUnitType;
  markdown: string;
  order: number;
  sourceStart: number;
  sourceEnd: number;
}

export interface TitleUnit extends DocumentUnitBase {
  type: "title";
  text: string;
}

export interface HeadingUnit extends DocumentUnitBase {
  type: "heading";
  level: 2 | 3;
  text: string;
}

export interface ParagraphUnit extends DocumentUnitBase {
  type: "paragraph";
  text: string;
  tone?: "normal" | "muted";
  dropCap?: boolean;
}

export interface ListItemUnit extends DocumentUnitBase {
  type: "list_item";
  listKind: "ordered" | "unordered";
  depth: 0 | 1;
  text: string;
}

export interface BlockquoteUnit extends DocumentUnitBase {
  type: "blockquote";
  text: string;
}

export interface TableUnit extends DocumentUnitBase {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface CodeBlockUnit extends DocumentUnitBase {
  type: "code_block";
  language?: string;
  code: string;
}

export type DocumentUnit =
  | TitleUnit
  | HeadingUnit
  | ParagraphUnit
  | ListItemUnit
  | BlockquoteUnit
  | TableUnit
  | CodeBlockUnit;

export type BulletKind = "edit" | "comment";
export type BulletStatus = "new" | "processing" | "ready" | "applied";
export type BulletVisualStatus = "new" | "processing" | "processed";

export interface Bullet {
  bulletId: string;
  kind: BulletKind;
  status: BulletStatus;
  anchorUnitId: string;
  anchorText?: string;
  content?: string;
  title: string;
  body: string;
  author: string;
  railY: number;
}

export interface Change {
  changeId: string;
  unitId: string;
  kind: "insert" | "delete" | "replace";
  status: "pending" | "accepted" | "rejected";
  before?: string;
  after?: string;
}

export interface ReviewChangeSet {
  changeSetId: string;
  mode: ReviewMode;
  status: "draft" | "ready" | "settled";
  changes: Change[];
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

export interface VersionSummaryItem {
  versionId: string;
  label: string;
  createdAt: string;
  summary: string;
}

export interface SessionSnapshot {
  sessionId: string;
  sessionStatus: SessionStatus;
  title: string;
  baseVersionId: string;
  currentVersionId: string;
  workingSetRevision: number;
  currentContent: string;
  documentUnits: DocumentUnit[];
  activeBullets: Bullet[];
  activeReviewChangeSet: ReviewChangeSet | null;
  proceeding: ProceedingState | null;
  versionHistory: VersionSummaryItem[];
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

export type BlackboardErrorCode =
  | "INVALID_STATE"
  | "REVISION_MISMATCH"
  | "NOT_FOUND"
  | "PROCEED_IN_PROGRESS"
  | "REVIEW_NOT_OPEN"
  | "SESSION_CLOSED"
  | "INTERNAL_ERROR";

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

export interface HistoryVersionPayload {
  versionId: string;
  versionNumber: number;
  content: string;
  createdAt: string;
  documentUnits: DocumentUnit[];
}

export interface DocumentUnitEditCommitPayload {
  unitId: string;
  markdown: string;
  workingSetRevision: number;
}

export interface BulletCommentCreatePayload {
  unitId: string;
  content: string;
  anchorTextSnapshot?: string;
  anchorStartOffset?: number;
  anchorEndOffset?: number;
}

export interface BulletUpdatePayload {
  bulletId: string;
  content: string;
}

export interface SessionProceedPayload {
  workingSetRevision: number;
}

export interface ReviewChangePayload {
  reviewChangeSetId: string;
  changeId: string;
}

export interface ReviewBulkPayload {
  reviewChangeSetId: string;
}

export interface HistoryRestoreVersionPayload {
  versionId: string;
}

export type BlackboardCommandPayload =
  | DocumentUnitEditCommitPayload
  | BulletCommentCreatePayload
  | BulletUpdatePayload
  | SessionProceedPayload
  | ReviewChangePayload
  | ReviewBulkPayload
  | HistoryRestoreVersionPayload
  | Record<string, never>;
