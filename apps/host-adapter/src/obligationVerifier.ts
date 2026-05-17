/**
 * Obligation verifier.
 *
 * After a subagent turn completes, verify that the required tool actions
 * were actually performed by checking the backend snapshot.
 *
 * Per Host-Execution-Design.md §7:
 *   - comment bullet turn  → bullet.status must be "ready"
 *   - proceed turn         → session.sessionStatus must be "reviewing"
 *   - close turn           → session.sessionStatus must be "closed"
 *
 * Parameter extraction priority:
 *   1. Parse the `EVENT_DATA: { ... }` JSON block appended by hostDispatcher.
 *      This is the authoritative machine-readable source.
 *   2. Fall back to scraping the human-readable prose for bullet kind +
 *      `- bulletId: <id>` pattern. Kept for backward compatibility with any
 *      in-flight messages that predate the EVENT_DATA convention.
 */

import type { BackendClient } from "./backendClient.js";
import type { DispatchEvent } from "./types.js";

export interface ObligationResult {
  satisfied: boolean;
  reason?: string;
}

interface ParsedEventData {
  eventType?: string;
  bulletId?: string;
}

function parseEventData(message: string): ParsedEventData {
  // EVENT_DATA block is "EVENT_DATA:\n" followed by a JSON object. Match from
  // the first `{` to the last `}` non-greedily across lines.
  const match = /EVENT_DATA:\s*(\{[\s\S]*\})\s*$/.exec(message);
  if (!match) {
    return {};
  }
  try {
    const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
    return {
      eventType: typeof parsed.eventType === "string" ? parsed.eventType : undefined,
      bulletId: typeof parsed.bulletId === "string" ? parsed.bulletId : undefined,
    };
  } catch {
    return {};
  }
}

function extractBulletKindFromMessage(event: DispatchEvent): "comment" | "edit" | "unknown" {
  const data = parseEventData(event.message);
  if (data.eventType === "comment_bullet_created") return "comment";
  if (data.eventType === "edit_bullet_created") return "edit";
  // Legacy heuristic on prose.
  if (event.message.includes("直接编辑了正文")) return "edit";
  if (event.message.includes("comment bullet")) return "comment";
  return "unknown";
}

function extractBulletIdFromMessage(message: string): string | null {
  const fromEventData = parseEventData(message).bulletId;
  if (fromEventData) return fromEventData;
  const legacy = /- bulletId: (\S+)/.exec(message);
  return legacy ? legacy[1]! : null;
}

export async function verifyObligation(
  event: DispatchEvent,
  client: BackendClient,
): Promise<ObligationResult> {
  const snapshot = await client.getSnapshot(event.sessionId);

  switch (event.eventType) {
    case "bullet.created": {
      const kind = extractBulletKindFromMessage(event);
      if (kind === "edit") {
        // Edit bullets only inform the worker that the human changed the base text.
        // They do not require mark_bullet_ready before the turn can complete.
        return { satisfied: true };
      }

      if (kind !== "comment") {
        // Unknown dispatch shape — do not block the loop.
        return { satisfied: true };
      }

      const bulletId = extractBulletIdFromMessage(event.message);
      if (!bulletId) {
        return {
          satisfied: false,
          reason: "comment bullet dispatch did not include a parseable bulletId (checked EVENT_DATA and legacy prose)",
        };
      }
      const bullet = snapshot.activeBullets.find((b) => b.bulletId === bulletId);
      if (!bullet) {
        // Bullet may have been applied/removed — treat as satisfied
        return { satisfied: true };
      }
      if (bullet.status === "ready" || bullet.status === "applied") {
        return { satisfied: true };
      }
      return {
        satisfied: false,
        reason: `bullet ${bulletId} is still "${bullet.status}", expected "ready"`,
      };
    }

    case "proceed.started": {
      if (snapshot.sessionStatus === "reviewing" || snapshot.sessionStatus === "active") {
        // "active" means review was already settled — also acceptable
        return { satisfied: true };
      }
      return {
        satisfied: false,
        reason: `session is "${snapshot.sessionStatus}", expected "reviewing" after Proceed`,
      };
    }

    case "session.close_requested": {
      if (snapshot.sessionStatus === "closed") {
        return { satisfied: true };
      }
      return {
        satisfied: false,
        reason: `session is "${snapshot.sessionStatus}", expected "closed"`,
      };
    }

    case "working_set.rebased":
      // No hard obligation — subagent just needs to rebuild local workspace
      return { satisfied: true };

    default:
      return { satisfied: true };
  }
}
