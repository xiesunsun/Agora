export type SessionStatus =
  | "active"
  | "proceeding"
  | "reviewing"
  | "closed";

export type DocumentUnitType =
  | "title"
  | "heading"
  | "paragraph"
  | "list_item"
  | "table"
  | "code_block"
  | "blockquote";

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
}

export interface ListItemUnit extends DocumentUnitBase {
  type: "list_item";
  listKind: "ordered" | "unordered";
  depth: 0 | 1;
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

export interface BlockquoteUnit extends DocumentUnitBase {
  type: "blockquote";
  text: string;
}

export type DocumentUnit =
  | TitleUnit
  | HeadingUnit
  | ParagraphUnit
  | ListItemUnit
  | TableUnit
  | CodeBlockUnit
  | BlockquoteUnit;

export type BulletType = "edit" | "comment";
export type BulletStatus = "new" | "processing" | "ready" | "applied";

export interface BulletBase {
  bulletId: string;
  type: BulletType;
  status: BulletStatus;
  unitId: string;
  queueOrder: number;
  createdAt: string;
}

export interface EditBullet extends BulletBase {
  type: "edit";
  beforeText: string;
  afterText: string;
}

export interface CommentBullet extends BulletBase {
  type: "comment";
  content: string;
  anchorTextSnapshot: string;
  anchorStartOffset?: number;
  anchorEndOffset?: number;
}

export type Bullet = EditBullet | CommentBullet;

export type ChangeKind = "insert" | "delete" | "replace";
export type ChangeStatus = "pending" | "accepted" | "rejected";

export interface Change {
  changeId: string;
  kind: ChangeKind;
  unitId: string;
  startOffset: number;
  endOffset: number;
  beforeText: string;
  afterText: string;
  status: ChangeStatus;
}

export type ReviewChangeSetStatus = "open" | "resolved";

export interface ReviewChangeSet {
  reviewChangeSetId: string;
  sourceWorkingSetRevision: number;
  baseVersionId?: string;
  candidateContent: string;
  changes: Change[];
  status: ReviewChangeSetStatus;
}

export interface VersionSummaryItem {
  versionId: string;
  versionNumber: number;
  summary?: string;
  createdAt: string;
}

export interface SessionSnapshot {
  sessionId: string;
  sessionStatus: SessionStatus;
  title: string;
  baseVersionId?: string;
  currentVersionId?: string;
  workingSetRevision: number;
  currentContent: string;
  documentUnits: DocumentUnit[];
  activeBullets: Bullet[];
  activeReviewChangeSet?: ReviewChangeSet;
  versionHistory: VersionSummaryItem[];
}

export interface HistoryVersionPayload {
  versionId: string;
  versionNumber: number;
  content: string;
  summary?: string;
  acceptedChangeSetRef?: string;
  createdAt: string;
}

export interface ReviewChangeStatusChangedPayload {
  reviewChangeSetId: string;
  changeId: string;
  fromStatus: ChangeStatus;
  toStatus: ChangeStatus;
}

export interface ReviewResolvedPayload {
  reviewChangeSetId: string;
  resolution: "version_created" | "all_rejected";
  versionId?: string;
}

export interface VersionCreatedPayload {
  version: VersionSummaryItem;
}

export interface DocumentUnitEditCommitPayload {
  unitId: string;
  markdown: string;
  workingSetRevision: number;
}

export interface BulletCommentCreatePayload {
  unitId: string;
  content: string;
  anchorTextSnapshot: string;
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

export type BlackboardErrorCode =
  | "INVALID_STATE"
  | "REVISION_MISMATCH"
  | "NOT_FOUND"
  | "PROCEED_IN_PROGRESS"
  | "REVIEW_NOT_OPEN"
  | "SESSION_CLOSED"
  | "INTERNAL_ERROR";
