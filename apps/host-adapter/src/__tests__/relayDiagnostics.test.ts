import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createEmptyRelayDiagnosticStages,
  createRelayDiagnosticRecord,
  writeRelayDiagnosticRecord,
} from "../relayDiagnostics.js";
import type { RelayDiagnosticOutcome } from "../types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("relayDiagnostics", () => {
  test.each<RelayDiagnosticOutcome>([
    "close_result_missing",
    "mainThreadId_missing",
    "send_input_failed",
    "wait_agent_failed",
    "relay_turn_not_completed",
    "relay_completed",
  ])("creates a serializable record for outcome=%s", (outcome) => {
    const stages = createEmptyRelayDiagnosticStages();
    stages.hasCloseResult = outcome !== "close_result_missing";
    stages.hasMainThreadId = outcome !== "mainThreadId_missing";
    stages.sendInputAttempted = outcome !== "close_result_missing" && outcome !== "mainThreadId_missing";
    stages.sendInputSucceeded = outcome === "wait_agent_failed"
      || outcome === "relay_turn_not_completed"
      || outcome === "relay_completed";
    stages.waitAgentAttempted = outcome === "wait_agent_failed"
      || outcome === "relay_turn_not_completed"
      || outcome === "relay_completed";
    stages.waitAgentCompleted = outcome === "relay_completed";

    const record = createRelayDiagnosticRecord({
      sessionId: "session-123",
      mainThreadId: outcome === "mainThreadId_missing" ? undefined : "main-thread-1",
      outcome,
      stages,
      relayTurnStatus: outcome === "relay_turn_not_completed" ? "timed_out" : null,
      closeResult: outcome === "close_result_missing"
        ? null
        : {
            summaryPath: "/tmp/summary.md",
            finalDocumentPath: "/tmp/final.md",
            closedAt: "2026-05-19T12:34:55.000Z",
          },
      error: outcome === "relay_completed" ? undefined : new Error(`failure:${outcome}`),
    });

    expect(record).toEqual(
      expect.objectContaining({
        sessionId: "session-123",
        mainThreadId: outcome === "mainThreadId_missing" ? null : "main-thread-1",
        outcome,
        stages,
        relayTurnStatus: outcome === "relay_turn_not_completed" ? "timed_out" : null,
      }),
    );
    if (outcome === "relay_completed") {
      expect(record.error).toBeUndefined();
    } else {
      expect(record.error).toEqual(
        expect.objectContaining({
          message: `failure:${outcome}`,
        }),
      );
    }
  });

  test("writes a stable JSON diagnostics artifact", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "relay-diagnostics-"));
    tempDirs.push(tempDir);
    const diagnosticsFile = path.join(tempDir, "session-123", "close-relay-result.json");
    const record = createRelayDiagnosticRecord({
      sessionId: "session-123",
      mainThreadId: "main-thread-1",
      outcome: "relay_completed",
      stages: {
        hasCloseResult: true,
        hasMainThreadId: true,
        sendInputAttempted: true,
        sendInputSucceeded: true,
        waitAgentAttempted: true,
        waitAgentCompleted: true,
      },
      relayTurnStatus: "completed",
      closeResult: {
        summaryPath: "/tmp/summary.md",
        finalDocumentPath: "/tmp/final.md",
        closedAt: "2026-05-19T12:34:55.000Z",
      },
    });

    const writtenPath = writeRelayDiagnosticRecord(diagnosticsFile, record);

    expect(writtenPath).toBe(diagnosticsFile);
    expect(JSON.parse(readFileSync(diagnosticsFile, "utf8"))).toEqual(record);
  });
});
