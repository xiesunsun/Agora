/**
 * Host Dispatcher
 *
 * Formats backend session events into turn messages and enqueues them
 * in the per-session dispatch queue (in-memory, status-tracked).
 *
 * The host adapter (apps/host-adapter/) polls this queue, claims events,
 * delivers them to the subagent thread via send_input, and marks them handled.
 *
 * stdout printing is kept as a debug mirror only.
 */

import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getSession, enqueueDispatchEvent } from "./sessionStore.js";

const QUEUE_DIR = join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".blackboard", "events");

export type DispatchableEventType =
  | "bullet.created"
  | "proceed.started"
  | "review.resolved"
  | "working_set.rebased"
  | "session.close_requested";

const DISPATCHABLE = new Set<string>([
  "bullet.created",
  "proceed.started",
  "review.resolved",
  "working_set.rebased",
  "session.close_requested",
]);

export function maybeDispatch(sessionId: string, eventType: string, payload: unknown): void {
  if (!DISPATCHABLE.has(eventType)) return;

  const message = formatTurnMessage(sessionId, eventType, payload);
  if (!message) return;

  const snapshot = getSession(sessionId);
  const subagentThreadId = snapshot?.subagentThreadId;

  // Enqueue in formal dispatch queue
  const event = {
    eventId: randomUUID(),
    sessionId,
    eventType,
    message,
    occurredAt: new Date().toISOString(),
    status: "pending" as const,
  };
  enqueueDispatchEvent(event);

  // Debug mirror to stdout
  console.log("\n─── HOST DISPATCH ───────────────────────────────────");
  console.log(`  session:  ${sessionId}`);
  if (subagentThreadId) console.log(`  threadId: ${subagentThreadId}`);
  console.log(`  event:    ${eventType} (${event.eventId})`);
  console.log("─────────────────────────────────────────────────────\n");

  // Persist to jsonl file (debug mirror)
  appendToFile(sessionId, { ...event, subagentThreadId });
}

function formatTurnMessage(sessionId: string, eventType: string, payload: unknown): string | null {
  const p = payload as Record<string, unknown>;

  switch (eventType) {
    case "bullet.created": {
      const type = p.type as string;
      if (type === "comment") {
        return appendEventData(
          [
            `用户在 session ${sessionId} 创建了一条 comment bullet：`,
            `- bulletId: ${p.bulletId}`,
            `- unitId: ${p.unitId}`,
            `- anchorText: ${p.anchorTextSnapshot ?? ""}`,
            `- content: ${p.content}`,
            ``,
            `请处理这条 bullet，完成后调用 mark_bullet_ready。`,
          ].join("\n"),
          {
            eventType: "comment_bullet_created",
            sessionId,
            bulletId: p.bulletId,
            unitId: p.unitId,
            anchorText: p.anchorTextSnapshot ?? "",
            content: p.content,
          },
        );
      }
      if (type === "edit") {
        return appendEventData(
          [
            `用户在 session ${sessionId} 直接编辑了正文：`,
            `- bulletId: ${p.bulletId}`,
            `- unitId: ${p.unitId}`,
            `- beforeText: ${p.beforeText}`,
            `- afterText: ${p.afterText}`,
            ``,
            `请理解这个编辑事实，更新本地 sessionDocument.md。`,
          ].join("\n"),
          {
            eventType: "edit_bullet_created",
            sessionId,
            bulletId: p.bulletId,
            unitId: p.unitId,
            beforeText: p.beforeText,
            afterText: p.afterText,
          },
        );
      }
      return null;
    }

    case "proceed.started": {
      const snapshot = getSession(sessionId);
      const bulletCount = snapshot?.activeBullets.length ?? 0;
      return appendEventData(
        [
          `用户在 session ${sessionId} 点击了 Proceed。`,
          `sessionStatus 已变为 "proceeding"。`,
          `activeBullets 中有 ${bulletCount} 条 bullet。`,
          ``,
          `请执行 Proceed 统合并提交候选正文。`,
        ].join("\n"),
        {
          eventType: "proceed_started",
          sessionId,
          activeBulletCount: bulletCount,
        },
      );
    }

    case "working_set.rebased":
      return appendEventData(
        [
          `用户在 session ${sessionId} 恢复了历史版本。`,
          `当前工作基底已重置，旧的本地草稿已失效。`,
          ``,
          `请重建本地工作区。`,
        ].join("\n"),
        {
          eventType: "working_set_rebased",
          sessionId,
        },
      );

    case "session.close_requested":
      return appendEventData(
        [
          `用户在 session ${sessionId} 请求关闭会话。`,
          ``,
          `请完成收尾并正式关闭。`,
        ].join("\n"),
        {
          eventType: "session_close_requested",
          sessionId,
        },
      );

    case "review.resolved": {
      const resolution = p.resolution as string;
      const reviewChangeSetId = p.reviewChangeSetId as string;
      const versionId = p.versionId as string | undefined;
      const snapshot = getSession(sessionId);
      const acceptedChanges = (p.acceptedChanges ?? []) as Array<{ changeId: string; beforeText: string; afterText: string }>;
      const rejectedChanges = (p.rejectedChanges ?? []) as Array<{ changeId: string; beforeText: string }>;

      const lines = [
        `session ${sessionId} 的审阅已结算。`,
        `- reviewChangeSetId: ${reviewChangeSetId}`,
        `- resolution: ${resolution}`,
      ];
      if (versionId) lines.push(`- newVersionId: ${versionId}`);
      if (acceptedChanges.length > 0) {
        lines.push(`- 用户接受了 ${acceptedChanges.length} 处修改`);
      }
      if (rejectedChanges.length > 0) {
        lines.push(`- 用户拒绝了 ${rejectedChanges.length} 处修改`);
      }
      lines.push(
        ``,
        `请根据用户的接受/拒绝反馈更新 preferences.md，记录用户的偏好倾向。`,
        `不要修改 sessionDocument.md 或调用任何 CLI 命令。`,
      );

      return appendEventData(lines.join("\n"), {
        eventType: "review_resolved",
        sessionId,
        reviewChangeSetId,
        resolution,
        versionId: versionId ?? null,
        acceptedChanges,
        rejectedChanges,
      });
    }

    default:
      return null;
  }
}

/**
 * Append a canonical machine-parseable block to a turn message.
 *
 * Subagents must prefer this JSON block over regex-extracting parameters from
 * the human-readable prose. See docs/05-agent/subagent-prompt.md and
 * .codex/agents/blackboard-worker.toml for the parsing contract.
 */
function appendEventData(prose: string, data: Record<string, unknown>): string {
  return `${prose}\n\nEVENT_DATA:\n${JSON.stringify(data, null, 2)}`;
}

function appendToFile(sessionId: string, entry: object): void {
  try {
    mkdirSync(QUEUE_DIR, { recursive: true });
    const file = join(QUEUE_DIR, `${sessionId}.jsonl`);
    appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch {
    // Non-fatal
  }
}
