import type { DispatchEvent, DispatchEventStatus, HistoryVersionPayload, SessionSnapshot } from "./types.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { documentUnitsFromMarkdown } from "./markdownDocument.js";

const sessions = new Map<string, SessionSnapshot>();
const historyVersions = new Map<string, Map<string, HistoryVersionPayload>>();

const V1_CONTENT = `# 批评作为一种同行写作

批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读眼前的作品。

一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留。

当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。

## 阅读时的基本姿态

好的协作从不急于替作者完成所有句子。它先辨认文本已经建立的节奏，再决定哪些地方需要追问。

- 先确认作品真正想解决的问题。
- 再检查论证是否跟得上这个问题。

> 一份原稿最需要的不是被快速改写，而是被准确地看见。`;

const V2_CONTENT = `# 批评作为一种同行写作

批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读，并在善意中重新接近眼前的作品。

一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留，也让那些还在犹疑的部分获得继续生长的方向。

当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。我们尝试指出一条更清晰的路径。

## 阅读时的基本姿态

好的协作从不急于替作者完成所有句子。它先辨认文本已经建立的节奏，再决定哪些地方需要追问，哪些地方需要安静。

- 先确认作品真正想解决的问题。
- 再检查论证是否跟得上这个问题。
- 最后才讨论语气、删改和结构。

> 一份原稿最需要的不是被快速改写，而是被准确地看见。

## 工作中的判断

| 维度 | 关注点 | 页面表达 |
| --- | --- | --- |
| 节奏 | 段落是否自然推进 | 保持连续文稿 |
| 精度 | 批注是否指向具体文本 | 附着在纸面边缘 |`;

export function getSession(sessionId: string): SessionSnapshot | undefined {
  return sessions.get(sessionId);
}

export function createSession(sessionId: string, title: string, initialContent: string): SessionSnapshot {
  const content = initialContent;
  const documentUnits = documentUnitsFromMarkdown(content);
  const snapshot: SessionSnapshot = {
    sessionId,
    sessionStatus: "active",
    title,
    baseVersionId: "v0",
    currentVersionId: "v0",
    workingSetRevision: 0,
    currentContent: content,
    documentUnits,
    activeBullets: [],
    activeReviewChangeSet: null,
    proceeding: null,
    versionHistory: [
      {
        versionId: "v0",
        versionNumber: 0,
        label: "v0",
        createdAt: new Date().toISOString(),
        summary: "初始会话内容。",
      },
    ],
  };
  sessions.set(sessionId, snapshot);
  return snapshot;
}

export function setSession(sessionId: string, snapshot: SessionSnapshot): SessionSnapshot {
  const s = { ...snapshot, sessionId };
  sessions.set(sessionId, s);
  return s;
}

export function getOrCreateDemoSession(): SessionSnapshot {
  if (!getSession("demo")) {
    const snapshot: SessionSnapshot = {
      sessionId: "demo",
      sessionStatus: "active",
      title: "批评作为一种同行写作",
      baseVersionId: "v1",
      currentVersionId: "v2",
      workingSetRevision: 0,
      currentContent: V2_CONTENT,
      documentUnits: documentUnitsFromMarkdown(V2_CONTENT),
      activeBullets: [],
      activeReviewChangeSet: null,
      proceeding: null,
      versionHistory: [
        {
          versionId: "v1",
          versionNumber: 1,
          label: "v1",
          createdAt: "2026-05-04T09:00:00.000Z",
          summary: "初稿",
        },
        {
          versionId: "v2",
          versionNumber: 2,
          label: "v2",
          createdAt: "2026-05-04T10:30:00.000Z",
          summary: "第二稿",
        },
      ],
    };
    sessions.set("demo", snapshot);
    // Seed history versions
    saveHistoryVersion("demo", {
      versionId: "v1",
      versionNumber: 1,
      createdAt: "2026-05-04T09:00:00.000Z",
      content: V1_CONTENT,
    });
    saveHistoryVersion("demo", {
      versionId: "v2",
      versionNumber: 2,
      createdAt: "2026-05-04T10:30:00.000Z",
      content: V2_CONTENT,
    });
    return snapshot;
  }
  return getSession("demo")!;
}

export function getHistoryVersion(sessionId: string, versionId: string): HistoryVersionPayload | undefined {
  return historyVersions.get(sessionId)?.get(versionId);
}

export function saveHistoryVersion(sessionId: string, payload: HistoryVersionPayload): void {
  if (!historyVersions.has(sessionId)) historyVersions.set(sessionId, new Map());
  historyVersions.get(sessionId)!.set(payload.versionId, payload);
}

// ─── Dispatch queue ──────────────────────────────────────────────────────────

const dispatchQueues = new Map<string, DispatchEvent[]>();
const DISPATCH_EVENTS_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".blackboard",
  "events",
);

export function enqueueDispatchEvent(event: DispatchEvent): void {
  if (!dispatchQueues.has(event.sessionId)) dispatchQueues.set(event.sessionId, []);
  dispatchQueues.get(event.sessionId)!.push(event);
}

export function getDispatchEvents(sessionId: string, status?: DispatchEventStatus): DispatchEvent[] {
  const queue = dispatchQueues.get(sessionId) ?? [];
  return status ? queue.filter((e) => e.status === status) : queue;
}

export interface DispatchEventTransitionResult {
  ok: boolean;
  reason?: "not_found" | "invalid_transition";
  currentStatus?: DispatchEventStatus;
  event?: DispatchEvent;
}

export function transitionDispatchEventStatus(
  sessionId: string,
  eventId: string,
  expectedStatus: DispatchEventStatus,
  nextStatus: DispatchEventStatus,
  failureReason?: string,
): DispatchEventTransitionResult {
  const queue = dispatchQueues.get(sessionId);
  if (!queue) return { ok: false, reason: "not_found" };
  const event = queue.find((e) => e.eventId === eventId);
  if (!event) return { ok: false, reason: "not_found" };
  if (event.status !== expectedStatus) {
    return {
      ok: false,
      reason: "invalid_transition",
      currentStatus: event.status,
      event,
    };
  }

  const fromStatus = event.status;
  event.status = nextStatus;
  if (failureReason) {
    event.failureReason = failureReason;
  } else {
    delete event.failureReason;
  }
  appendDispatchStatusChange(event, fromStatus, nextStatus);

  return { ok: true, event };
}

function appendDispatchStatusChange(
  event: DispatchEvent,
  fromStatus: DispatchEventStatus,
  toStatus: DispatchEventStatus,
): void {
  try {
    mkdirSync(DISPATCH_EVENTS_DIR, { recursive: true });
    const file = join(DISPATCH_EVENTS_DIR, `${event.sessionId}.jsonl`);
    appendFileSync(
      file,
      JSON.stringify({
        type: "dispatch.status_changed",
        eventId: event.eventId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        fromStatus,
        toStatus,
        failureReason: event.failureReason,
        occurredAt: new Date().toISOString(),
      }) + "\n",
    );
  } catch {
    // Debug mirror only; queue state remains authoritative.
  }
}
