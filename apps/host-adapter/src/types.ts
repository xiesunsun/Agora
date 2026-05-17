/**
 * Types for the host adapter layer.
 *
 * The adapter bridges the backend dispatch queue and the Codex host control
 * surface (spawn_agent / send_input / wait_agent).
 */

export interface DispatchEvent {
  eventId: string;
  sessionId: string;
  eventType: string;
  message: string;
  occurredAt: string;
  status: "pending" | "delivering" | "handled" | "failed";
  failureReason?: string;
}

export interface SessionInfo {
  sessionId: string;
  frontendUrl: string;
  subagentThreadId: string;
}

/** Minimal snapshot fields the adapter needs for obligation verification. */
export interface SessionSnapshot {
  sessionId: string;
  sessionStatus: string;
  activeBullets: Array<{ bulletId: string; status: string }>;
}

export interface SpawnAgentResult {
  threadId: string;
}

export interface AgentTurnResult {
  status: "completed" | "failed" | "timed_out";
  outputText: string;
}

/** Codex host control surface — implemented by the runtime environment. */
export interface HostControls {
  /**
   * Start a new subagent worker.
   * Returns an agent_id that serves as the subagentThreadId.
   */
  spawnAgent(prompt: string): Promise<SpawnAgentResult>;

  /**
   * Send a message to an existing subagent thread.
   * Equivalent to turn/start(threadId=...) in the design docs.
   */
  sendInput(subagentThreadId: string, message: string): Promise<void>;

  /**
   * Wait for the current turn of a subagent thread to complete.
   * Returns the turn outcome and any user-facing text emitted by the worker.
   */
  waitAgent(subagentThreadId: string): Promise<AgentTurnResult>;
}
