import { activeSnapshot } from "./active";
import { historyVersions } from "./historyVersions";
import type {
  FrontendViewMode,
  ReviewChangeSet,
  ReviewMode,
  SessionSnapshot,
} from "../types/blackboard";
import { documentUnitsFromMarkdown } from "../app/markdownDocument";

const reviewChangeSet: ReviewChangeSet = {
  reviewChangeSetId: "changeset-flow-1",
  sourceWorkingSetRevision: 7,
  candidateContent: activeSnapshot.currentContent,
  mode: "flow",
  status: "open",
  changes: [
    {
      changeId: "change-1",
      unitId: "u-posture",
      kind: "replace",
      startOffset: 0,
      endOffset: "哪些地方需要追问".length,
      beforeText: "哪些地方需要追问",
      afterText: "哪些问题需要继续追问",
      status: "pending",
    },
  ],
};

export const fixtures = {
  active: activeSnapshot,
  "active-editing": {
    ...activeSnapshot,
    workingSetRevision: 4,
    activeBullets: [
      ...activeSnapshot.activeBullets,
      {
        bulletId: "b-editing",
        type: "edit",
        status: "new",
        unitId: "u-opening",
        queueOrder: activeSnapshot.activeBullets.length,
        createdAt: "2026-05-04T11:24:00.000Z",
        beforeText: "注意力练习",
        afterText: "注意力训练",
        title: "Edit draft",
        body: "本地编辑中的 mock bullet。",
        author: "You",
        railY: 23,
      },
    ],
  },
  "active-selection": {
    ...activeSnapshot,
    workingSetRevision: 5,
    activeBullets: [
      ...activeSnapshot.activeBullets,
      {
        bulletId: "b-selection",
        type: "comment",
        status: "new",
        unitId: "u-close",
        queueOrder: activeSnapshot.activeBullets.length,
        createdAt: "2026-05-04T11:25:00.000Z",
        anchorTextSnapshot: "从阅读现场里拽走",
        title: "Selection",
        body: "选区批注的 fixture 状态。",
        author: "You",
        railY: 82,
        content: "选区批注的 fixture 状态。",
      },
    ],
  },
  proceeding: {
    ...activeSnapshot,
    sessionStatus: "proceeding",
    workingSetRevision: 6,
  },
  "reviewing-flow": {
    ...activeSnapshot,
    sessionStatus: "reviewing",
    workingSetRevision: 7,
    activeReviewChangeSet: reviewChangeSet,
  },
  "reviewing-pr": {
    ...activeSnapshot,
    sessionStatus: "reviewing",
    workingSetRevision: 8,
    activeReviewChangeSet: { ...reviewChangeSet, mode: "pr" },
  },
  "history-preview": {
    ...activeSnapshot,
    sessionStatus: "active",
    currentVersionId: "v3",
    workingSetRevision: 3,
    currentContent: historyVersions.v3.content,
    documentUnits: documentUnitsFromMarkdown(historyVersions.v3.content),
    activeBullets: [],
  },
  closed: {
    ...activeSnapshot,
    sessionStatus: "closed",
    workingSetRevision: 9,
    activeBullets: [],
  },
} satisfies Record<string, SessionSnapshot>;

export type FixtureKey = keyof typeof fixtures;

export const fixtureKeys = Object.keys(fixtures) as FixtureKey[];

export function viewModeForFixture(fixtureKey: FixtureKey): FrontendViewMode {
  return fixtureKey === "history-preview" ? "history_preview" : "workspace";
}

export function reviewModeForFixture(fixtureKey: FixtureKey): ReviewMode {
  return fixtureKey === "reviewing-pr" ? "pr" : "flow";
}
