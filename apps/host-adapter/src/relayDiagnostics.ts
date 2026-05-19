import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AgentTurnResult,
  CloseResult,
  RelayDiagnosticRecord,
  RelayDiagnosticStages,
} from "./types.js";

export interface CreateRelayDiagnosticRecordOptions {
  sessionId: string;
  mainThreadId?: string;
  outcome: RelayDiagnosticRecord["outcome"];
  stages: RelayDiagnosticStages;
  relayTurnStatus?: AgentTurnResult["status"] | null;
  closeResult?: CloseResult | null;
  error?: unknown;
}

export function createEmptyRelayDiagnosticStages(): RelayDiagnosticStages {
  return {
    hasCloseResult: false,
    hasMainThreadId: false,
    sendInputAttempted: false,
    sendInputSucceeded: false,
    waitAgentAttempted: false,
    waitAgentCompleted: false,
  };
}

export function createRelayDiagnosticRecord(
  options: CreateRelayDiagnosticRecordOptions,
): RelayDiagnosticRecord {
  return {
    sessionId: options.sessionId,
    mainThreadId: options.mainThreadId ?? null,
    writtenAt: new Date().toISOString(),
    outcome: options.outcome,
    stages: { ...options.stages },
    relayTurnStatus: options.relayTurnStatus ?? null,
    closeResult: options.closeResult ?? null,
    error: options.error ? serializeRelayDiagnosticError(options.error) : undefined,
  };
}

export function writeRelayDiagnosticRecord(
  diagnosticsFilePath: string,
  record: RelayDiagnosticRecord,
): string | null {
  try {
    mkdirSync(path.dirname(diagnosticsFilePath), { recursive: true });
    writeFileSync(diagnosticsFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return diagnosticsFilePath;
  } catch (error) {
    console.error(
      `[relay-diagnostics] failed to write diagnostics file ${diagnosticsFilePath}:`,
      error,
    );
    return null;
  }
}

function serializeRelayDiagnosticError(error: unknown): RelayDiagnosticRecord["error"] {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}
