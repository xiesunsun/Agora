/**
 * Host Adapter entry point.
 *
 * Usage:
 *   # Start a new session with an explicit main-agent handoff
 *   node src/index.ts --handoff-file /path/to/handoff.md [--ready-file /path/to/session-ready.json]
 *
 *   # Start event loop for an existing session with a known subagent thread
 *   node src/index.ts --session <sessionId> --thread <subagentThreadId>
 *
 *   # Use the stub host (for local testing without a live Codex runtime)
 *   node src/index.ts --session demo --thread stub-thread --stub-host
 *
 * In production, the HostControls implementation is provided by the Codex
 * runtime environment (spawn_agent / send_input / wait_agent tools).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { BackendClient } from "./backendClient.js";
import { runEventLoop } from "./eventLoop.js";
import { bootstrapSession, bootstrapWithKnownSession } from "./startup.js";
import type { HostControls } from "./types.js";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

// ─── Stub host (for local testing) ──────────────────────────────────────────

/**
 * Stub HostControls that prints messages to stdout instead of calling Codex.
 * Useful for verifying the adapter's queue/obligation logic without a live runtime.
 */
const stubHost: HostControls = {
  async spawnAgent(prompt: string) {
    console.log("[stub-host] spawnAgent called");
    console.log("  prompt:", prompt.slice(0, 80) + "...");
    return { threadId: `stub-thread-${Date.now()}` };
  },

  async sendInput(subagentThreadId: string, message: string): Promise<void> {
    console.log(`\n[stub-host] send_input → thread=${subagentThreadId}`);
    console.log("─".repeat(60));
    console.log(message);
    console.log("─".repeat(60));
    console.log("[stub-host] (stub: no real subagent — obligation check will likely fail)");
  },

  async waitAgent(subagentThreadId: string) {
    console.log(`[stub-host] wait_agent → thread=${subagentThreadId} (stub: immediate)`);
    return {
      status: "completed" as const,
      outputText: [
        "sessionId: stub-session",
        "frontendUrl: http://localhost:5173?sessionId=stub-session",
        "sessionStatus: active",
      ].join("\n"),
    };
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<{ readyFile?: string }> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const sessionId = get("--session");
  const threadId = get("--thread");
  const handoffFile = get("--handoff-file");
  const readyFile = get("--ready-file");
  const useStub = has("--stub-host");

  if ((sessionId && !threadId) || (!sessionId && threadId)) {
    console.error("Usage: host-adapter [--handoff-file <path>] [--session <sessionId> --thread <subagentThreadId>] [--stub-host]");
    process.exit(1);
  }
  if (useStub && (!sessionId || !threadId)) {
    console.error("--stub-host requires --session and --thread because it does not create real sessions");
    process.exit(1);
  }

  const client = new BackendClient(BACKEND_URL);

  // Resolve host controls
  // In a real Codex environment, HostControls would be injected by the runtime.
  // For now, --stub-host uses the local stub; otherwise we expect the runtime to
  // provide the controls via environment or module injection.
  let host: HostControls;
  if (useStub) {
    console.log("[adapter] using stub host (no real Codex runtime)");
    host = stubHost;
  } else {
    // Attempt to load a runtime-provided host module
    // Use indirect import to avoid static analysis errors on a file that may not exist
    try {
      const modPath = new URL("./runtimeHost.js", import.meta.url).href;
      const mod = await import(/* @vite-ignore */ modPath) as { runtimeHost: HostControls };
      host = mod.runtimeHost;
      console.log("[adapter] using runtime host");
    } catch {
      console.warn("[adapter] runtimeHost.js not found — falling back to stub host");
      host = stubHost;
    }
  }

  const info = sessionId && threadId
    ? await bootstrapWithKnownSession(sessionId, threadId, client)
    : await bootstrapSession(
      client,
      host,
      handoffFile ? readFileSync(handoffFile, "utf8") : undefined,
    );

  if (readyFile) {
    writeReadyFileSuccess(readyFile, info, BACKEND_URL);
  }
  console.log(`[adapter] session=${info.sessionId} frontend=${info.frontendUrl}`);

  // Start the event loop
  await runEventLoop({
    sessionId: info.sessionId,
    subagentThreadId: info.subagentThreadId,
    client,
    host,
    onClose: () => {
      console.log("[adapter] session closed — exiting");
      shutdownRuntimeIfOwned();
      process.exit(0);
    },
  });

  return { readyFile };
}

interface ReadyFileSuccess {
  ok: true;
  sessionId: string;
  frontendUrl: string;
  subagentThreadId: string;
  backendUrl: string;
  writtenAt: string;
}

interface ReadyFileFailure {
  ok: false;
  error: { message: string; stack?: string };
  writtenAt: string;
}

function writeReadyFileSuccess(
  readyFile: string,
  info: { sessionId: string; frontendUrl: string; subagentThreadId: string },
  backendUrl: string,
): void {
  const payload: ReadyFileSuccess = {
    ok: true,
    sessionId: info.sessionId,
    frontendUrl: info.frontendUrl,
    subagentThreadId: info.subagentThreadId,
    backendUrl,
    writtenAt: new Date().toISOString(),
  };
  mkdirSync(path.dirname(readyFile), { recursive: true });
  writeFileSync(readyFile, JSON.stringify(payload));
}

function writeReadyFileFailure(readyFile: string, error: unknown): void {
  const payload: ReadyFileFailure = {
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    writtenAt: new Date().toISOString(),
  };
  try {
    mkdirSync(path.dirname(readyFile), { recursive: true });
    writeFileSync(readyFile, JSON.stringify(payload));
  } catch {
    // best-effort; the parent CLI will also see the non-zero exit code
  }
}

function readyFileFromArgs(): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--ready-file");
  return idx >= 0 ? args[idx + 1] : undefined;
}

function shutdownRuntimeIfOwned(): void {
  if (process.env.RUNTIME_STARTED_BY_COMMAND !== "true") return;
  const port = new URL(BACKEND_URL).port || "3001";
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    for (const pid of output.split("\n").filter(Boolean)) {
      try { process.kill(Number(pid), "SIGTERM"); } catch {}
    }
    console.log("[adapter] runtime shutdown (started by this session)");
  } catch {
    try {
      const ssOutput = execSync(`ss -tlnp | grep :${port}`, { encoding: "utf-8" });
      const m = ssOutput.match(/pid=(\d+)/);
      if (m) { try { process.kill(Number(m[1]), "SIGTERM"); } catch {} }
      console.log("[adapter] runtime shutdown (started by this session)");
    } catch {}
  }
}

main().catch((err) => {
  console.error("[adapter] fatal:", err);
  // Signal failure to the parent CLI via the same ready-file channel it is
  // polling. Without this, `blackboard-runtime start-session` would hang until
  // its timeout even though the adapter already knows startup failed.
  const readyFile = readyFileFromArgs();
  if (readyFile) {
    writeReadyFileFailure(readyFile, err);
  }
  process.exit(1);
});
