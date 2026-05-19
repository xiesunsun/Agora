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
import {
  createEmptyRelayDiagnosticStages,
  createRelayDiagnosticRecord,
  writeRelayDiagnosticRecord,
} from "./relayDiagnostics.js";
import type {
  AgentTurnResult,
  CloseResult,
  HostControls,
  RelayDiagnosticOutcome,
  SessionSnapshot,
} from "./types.js";
import { verifyObligation } from "./obligationVerifier.js";

const POLL_INTERVAL_MS = 2000;
const MAX_OBLIGATION_REMEDIATION_TURNS = 2;

export interface EventLoopOptions {
  sessionId: string;
  subagentThreadId: string;
  client: BackendClient;
  host: HostControls;
  mainThreadId?: string;
  relayDiagnosticsFilePath?: string;
  onRuntimeShutdown?: () => Promise<void> | void;
  /** Called when the session is closed (close event handled). */
  onClose?: (result: CloseEventResult) => Promise<void> | void;
}

export interface CloseEventResult {
  sessionId: string;
  closeTurnOutput: string;
  snapshot: SessionSnapshot;
  shouldShutdownRuntime: boolean;
}

export async function runEventLoop(opts: EventLoopOptions): Promise<void> {
  const {
    sessionId,
    subagentThreadId,
    client,
    host,
    mainThreadId,
    relayDiagnosticsFilePath,
    onRuntimeShutdown,
    onClose,
  } = opts;
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
        await onClose?.({
          sessionId,
          closeTurnOutput: "",
          snapshot,
          shouldShutdownRuntime: false,
        });
        return;
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const event = pending[0]!;
    console.log(`[event-loop] processing event ${event.eventId} (${event.eventType})`);
    let closeTurnOutput = "";

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
      closeTurnOutput = turnResult.outputText;
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
        const snapshot = await client.getSnapshot(sessionId);
        await relayCloseResultToMainThread({
          host,
          sessionId,
          mainThreadId,
          closeResult: snapshot.closeResult,
          relayDiagnosticsFilePath,
        });
        const shouldShutdownRuntime = await shouldShutdownAfterClose(client);
        if (shouldShutdownRuntime) {
          try {
            await onRuntimeShutdown?.();
          } catch (error) {
            console.error("[event-loop] runtime shutdown callback failed:", error);
          }
        }
        await onClose?.({
          sessionId,
          closeTurnOutput,
          snapshot,
          shouldShutdownRuntime,
        });
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

async function shouldShutdownAfterClose(client: BackendClient): Promise<boolean> {
  try {
    return !(await client.hasOpenSessions());
  } catch (error) {
    console.error("[event-loop] failed to query open session state:", error);
    return false;
  }
}

function buildCloseResultMessage(sessionId: string, closeResult: CloseResult): string {
  return [
    "Agora session closed.",
    "",
    "Read these files for the final result:",
    `- summary: ${closeResult.summaryPath}`,
    `- final document: ${closeResult.finalDocumentPath}`,
    "",
    `These files are the authoritative close artifacts for session ${sessionId}.`,
  ].join("\n");
}

async function relayCloseResultToMainThread(
  options: {
    host: HostControls;
    mainThreadId?: string;
    sessionId: string;
    closeResult?: CloseResult;
    relayDiagnosticsFilePath?: string;
  },
): Promise<void> {
  const {
    host,
    mainThreadId,
    sessionId,
    closeResult,
    relayDiagnosticsFilePath,
  } = options;
  const stages = createEmptyRelayDiagnosticStages();
  stages.hasCloseResult = Boolean(closeResult);
  stages.hasMainThreadId = Boolean(mainThreadId);
  let outcome: RelayDiagnosticOutcome;
  let relayTurnStatus: AgentTurnResult["status"] | null = null;
  let relayError: unknown;

  try {
    if (!closeResult) {
      outcome = "close_result_missing";
      return;
    }
    if (!mainThreadId) {
      outcome = "mainThreadId_missing";
      return;
    }

    stages.sendInputAttempted = true;
    console.log(
      `[event-loop] close relay session=${sessionId} mainThreadId=${mainThreadId} stage=send_input diagnostics=${formatDiagnosticsPath(relayDiagnosticsFilePath)}`,
    );
    await host.sendInput(
      mainThreadId,
      buildCloseResultMessage(sessionId, closeResult),
    );
    stages.sendInputSucceeded = true;
    stages.waitAgentAttempted = true;
    const relayTurn = await host.waitAgent(mainThreadId);
    relayTurnStatus = relayTurn.status;
    if (relayTurn.status !== "completed") {
      outcome = "relay_turn_not_completed";
      relayError = new Error(`main-thread close relay ended with status=${relayTurn.status}`);
      return;
    }
    stages.waitAgentCompleted = true;
    outcome = "relay_completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (stages.waitAgentAttempted && !stages.waitAgentCompleted) {
      outcome = "wait_agent_failed";
      relayError = new Error(message);
    } else {
      outcome = "send_input_failed";
      relayError = new Error(message);
    }
  } finally {
    const record = createRelayDiagnosticRecord({
      sessionId,
      mainThreadId,
      outcome: outcome!,
      stages,
      relayTurnStatus,
      closeResult,
      error: relayError,
    });
    const diagnosticsPath = relayDiagnosticsFilePath
      ? writeRelayDiagnosticRecord(relayDiagnosticsFilePath, record)
      : null;
    const diagnosticsLabel = formatDiagnosticsPath(diagnosticsPath ?? relayDiagnosticsFilePath);

    if (record.outcome === "relay_completed") {
      console.log(
        `[event-loop] close relay session=${sessionId} mainThreadId=${mainThreadId} outcome=${record.outcome} diagnostics=${diagnosticsLabel}`,
      );
      return;
    }

    const message = [
      `[event-loop] close relay session=${sessionId}`,
      `mainThreadId=${mainThreadId ?? "(missing)"}`,
      `outcome=${record.outcome}`,
      `diagnostics=${diagnosticsLabel}`,
    ].join(" ");
    if (record.error) {
      console.error(message, new Error(record.error.message));
      return;
    }
    console.warn(message);
  }
}

function formatDiagnosticsPath(relayDiagnosticsFilePath?: string | null): string {
  return relayDiagnosticsFilePath ?? "(disabled)";
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
