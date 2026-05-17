/**
 * Event loop for a single blackboard session.
 *
 * Polls the backend dispatch queue, claims one pending event at a time,
 * delivers it to the subagent thread via send_input, waits for the turn
 * to complete, verifies obligations, then marks the event handled.
 *
 * Per Host-Execution-Design.md §5: strictly serial — only one in-flight
 * event per session at any time.
 */

import type { BackendClient } from "./backendClient.js";
import type { HostControls } from "./types.js";
import { verifyObligation } from "./obligationVerifier.js";

const POLL_INTERVAL_MS = 2000;
const MAX_OBLIGATION_REMEDIATION_TURNS = 2;

export interface EventLoopOptions {
  sessionId: string;
  subagentThreadId: string;
  client: BackendClient;
  host: HostControls;
  /** Called when the session is closed (close event handled). */
  onClose?: () => void;
}

export async function runEventLoop(opts: EventLoopOptions): Promise<void> {
  const { sessionId, subagentThreadId, client, host, onClose } = opts;
  console.log(`[event-loop] started for session=${sessionId} thread=${subagentThreadId}`);

  while (true) {
    const pending = await client.getPendingEvents(sessionId).catch((err: unknown) => {
      console.error(`[event-loop] poll error:`, err);
      return [];
    });

    if (pending.length === 0) {
      // Check if session is closed — if so, exit the loop
      const snapshot = await client.getSnapshot(sessionId).catch(() => null);
      if (snapshot?.sessionStatus === "closed") {
        console.log(`[event-loop] session ${sessionId} is closed, exiting`);
        onClose?.();
        return;
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const event = pending[0]!;
    console.log(`[event-loop] processing event ${event.eventId} (${event.eventType})`);

    // Claim the event (pending → delivering)
    const claimed = await client.claimEvent(sessionId, event.eventId).catch((err: unknown) => {
      console.error(`[event-loop] claim failed:`, err);
      return false;
    });
    if (!claimed) {
      console.warn(`[event-loop] event ${event.eventId} was already claimed by another worker`);
      continue;
    }

    // Deliver to subagent thread
    try {
      await host.sendInput(subagentThreadId, event.message);
      const turnResult = await host.waitAgent(subagentThreadId);
      if (turnResult.status !== "completed") {
        throw new Error(`worker turn ended with status=${turnResult.status}`);
      }
    } catch (err) {
      console.error(`[event-loop] delivery failed for ${event.eventId}:`, err);
      await client.failEvent(sessionId, event.eventId, String(err));
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // Verify obligations and, if needed, actively steer the same worker thread
    // to finish the missing required action for the current event.
    let obligationSatisfied = false;
    let lastFailureReason = "unknown obligation failure";
    let remediationAborted = false;
    for (let attempt = 0; attempt <= MAX_OBLIGATION_REMEDIATION_TURNS; attempt++) {
      const result = await verifyObligation(event, client);
      if (result.satisfied) {
        obligationSatisfied = true;
        break;
      }

      lastFailureReason = result.reason ?? lastFailureReason;
      console.warn(
        `[event-loop] obligation not satisfied (attempt ${attempt + 1}): ${lastFailureReason}`,
      );

      if (attempt >= MAX_OBLIGATION_REMEDIATION_TURNS) {
        break;
      }

      try {
        await host.sendInput(
          subagentThreadId,
          buildObligationRemediationMessage(event, lastFailureReason),
        );
        const remediationTurn = await host.waitAgent(subagentThreadId);
        if (remediationTurn.status !== "completed") {
          throw new Error(`worker remediation turn ended with status=${remediationTurn.status}`);
        }
      } catch (err) {
        console.error(`[event-loop] remediation failed for ${event.eventId}:`, err);
        await client.failEvent(sessionId, event.eventId, String(err));
        remediationAborted = true;
        break;
      }
    }

    if (remediationAborted) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (obligationSatisfied) {
      await client.completeEvent(sessionId, event.eventId);
      console.log(`[event-loop] event ${event.eventId} handled`);

      // If this was a close event, exit
      if (event.eventType === "session.close_requested") {
        onClose?.();
        return;
      }
    } else {
      await client.failEvent(
        sessionId,
        event.eventId,
        `obligation not satisfied after remediation turns — ${lastFailureReason}`,
      );
      console.error(
        `[event-loop] event ${event.eventId} failed obligation check — continuing loop`,
      );
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
  }
}

function buildObligationRemediationMessage(event: { eventType: string; eventId: string; message: string }, reason: string): string {
  return [
    `宿主检查发现刚才的事件尚未完成，当前事件仍然是同一条 ${event.eventType}。`,
    `eventId: ${event.eventId}`,
    `obligationFailure: ${reason}`,
    ``,
    `请不要开始新的任务；继续处理当前事件，并在本回合结束前补齐缺失的强制动作。`,
    `只有当 backend 正式状态已经推进后，这条事件才会被视为 handled。`,
    ``,
    `原始事件内容如下：`,
    event.message,
  ].join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
