import { activeSnapshot } from "./active";
import { historyVersions } from "./historyVersions";
import type {
  FrontendViewMode,
  ReviewChangeSet,
  ReviewMode,
  SessionSnapshot,
} from "../types/blackboard";

const reviewChangeSet: ReviewChangeSet = {
  changeSetId: "changeset-flow-1",
  mode: "flow",
  status: "ready",
  changes: [
    {
      changeId: "change-1",
      unitId: "u-posture",
      kind: "replace",
      status: "pending",
      before: "哪些地方需要追问",
      after: "哪些问题需要继续追问",
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
        kind: "edit",
        status: "new",
        anchorUnitId: "u-opening",
        anchorText: "注意力练习",
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
        kind: "comment",
        status: "new",
        anchorUnitId: "u-close",
        anchorText: "从阅读现场里拽走",
        title: "Selection",
        body: "选区批注的 fixture 状态。",
        author: "You",
        railY: 82,
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
    currentVersionId: "v2",
    workingSetRevision: 2,
    currentContent: historyVersions.v2.content,
    documentUnits: historyVersions.v2.documentUnits,
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
