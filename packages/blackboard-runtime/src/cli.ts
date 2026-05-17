import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";

const distRoot = fileURLToPath(new URL("./", import.meta.url));
const frontendDistDir = path.join(distRoot, "frontend");
const backendEntry = path.join(distRoot, "backend/index.js");
const hostAdapterEntry = path.join(distRoot, "host-adapter/index.js");
const EXPECTED_RUNTIME_KIND = "blackboard-runtime";
const EXPECTED_RUNTIME_API_VERSION = 1;

interface RuntimeHealth {
  ok: boolean;
  runtimeKind?: string;
  runtimeApiVersion?: number;
  backendUrl?: string;
  frontendUrl?: string;
  frontendReachable?: boolean;
}

async function main(): Promise<void> {
  const [command = "up", ...rest] = process.argv.slice(2);

  if (rest.includes("--help") || rest.includes("-h")) {
    printUsage();
    return;
  }

  switch (command) {
    case "config":
      runConfig(rest);
      return;
    case "up":
      await runUp(rest);
      return;
    case "down":
      await runDown(rest);
      return;
    case "status":
      await runStatus(rest);
      return;
    case "adapter":
      await runAdapter(rest);
      return;
    case "start-session":
      await runStartSession(rest);
      return;
    case "create-session":
      await runCreateSession(rest);
      return;
    case "get-snapshot":
      await runGetSnapshot(rest);
      return;
    case "mark-bullet-ready":
      await runMarkBulletReady(rest);
      return;
    case "submit-review-candidate":
      await runSubmitReviewCandidate(rest);
      return;
    case "close-session":
      await runCloseSession(rest);
      return;
    case "info":
      printInfo();
      return;
    case "help":
    case "--help":
    case "-h":
      printUsage();
      return;
    default:
      printUsage();
      process.exit(1);
  }
}

async function runUp(args: string[]): Promise<void> {
  const port = readFlag(args, "--port") ?? "3001";
  if (args.includes("--no-build")) {
    console.warn("[blackboard-runtime] --no-build is ignored; runtime uses embedded build artifacts");
  }

  ensureEmbeddedArtifacts();

  if (!existsSync(frontendDistDir)) {
    throw new Error(`embedded frontend dist not found at ${frontendDistDir}`);
  }

  const backendUrl = `http://localhost:${port}`;
  const child = spawn("node", [backendEntry], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      BACKEND_URL: backendUrl,
      FRONTEND_URL: backendUrl,
      FRONTEND_DIST_DIR: frontendDistDir,
    },
  });

  console.log(`blackboard-runtime up`);
  console.log(`distRoot: ${distRoot}`);
  console.log(`backendUrl: ${backendUrl}`);
  console.log(`frontendUrl: ${backendUrl}`);
  console.log(`frontend session url pattern: ${backendUrl}?sessionId=<sessionId>`);

  await waitForChild(child);
}

async function runDown(args: string[]): Promise<void> {
  const port = readFlag(args, "--port") ?? "3001";
  const backendUrl = `http://localhost:${port}`;
  const health = await tryGetHealth(backendUrl);
  if (!health) {
    console.log(`[down] no runtime listening on ${backendUrl}`);
    return;
  }
  // Find and kill the process listening on this port
  const { execSync } = await import("node:child_process");
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    const pids = output.split("\n").filter(Boolean);
    for (const pid of pids) {
      process.kill(Number(pid), "SIGTERM");
    }
    console.log(`[down] killed ${pids.length} process(es) on port ${port}`);
  } catch {
    // lsof may not be available; try ss + kill
    try {
      const ssOutput = execSync(`ss -tlnp | grep :${port}`, { encoding: "utf-8" });
      const pidMatch = ssOutput.match(/pid=(\d+)/);
      if (pidMatch) {
        process.kill(Number(pidMatch[1]), "SIGTERM");
        console.log(`[down] killed process ${pidMatch[1]} on port ${port}`);
      } else {
        console.log(`[down] could not find process on port ${port}`);
      }
    } catch {
      console.log(`[down] could not find process on port ${port}`);
    }
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".blackboard");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface RuntimeConfig {
  port: string;
  logsDir: string;
  workerWorkspace: string;
  auditDir: string;
  eventsDir: string;
  debug: boolean;
  auditEnabled: boolean;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  port: "3001",
  logsDir: ".blackboard/runtime/logs",
  workerWorkspace: path.join(tmpdir(), "blackboard-worker"),
  auditDir: ".blackboard/audit",
  eventsDir: ".blackboard/events",
  debug: false,
  auditEnabled: true,
};

function loadConfig(): RuntimeConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: RuntimeConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

function runConfig(args: string[]): void {
  const sub = args[0];

  if (!sub || sub === "list") {
    const config = loadConfig();
    console.log(`blackboard-runtime config (${CONFIG_FILE})\n`);
    for (const [key, value] of Object.entries(config)) {
      const isDefault = JSON.stringify(value) === JSON.stringify((DEFAULT_CONFIG as unknown as Record<string, unknown>)[key]);
      console.log(`  ${key} = ${JSON.stringify(value)}${isDefault ? " (default)" : ""}`);
    }
    console.log(`\nUse 'blackboard-runtime config set <key> <value>' to change.`);
    console.log(`Use 'blackboard-runtime config reset' to restore defaults.`);
    return;
  }

  if (sub === "get") {
    const key = args[1];
    if (!key) { console.error("Usage: blackboard-runtime config get <key>"); process.exit(1); }
    const config = loadConfig();
    const value = (config as unknown as Record<string, unknown>)[key];
    if (value === undefined) { console.error(`Unknown config key: ${key}`); process.exit(1); }
    console.log(JSON.stringify(value));
    return;
  }

  if (sub === "set") {
    const key = args[1];
    const rawValue = args[2];
    if (!key || rawValue === undefined) { console.error("Usage: blackboard-runtime config set <key> <value>"); process.exit(1); }
    if (!(key in DEFAULT_CONFIG)) { console.error(`Unknown config key: ${key}\nAvailable: ${Object.keys(DEFAULT_CONFIG).join(", ")}`); process.exit(1); }
    const config = loadConfig();
    let value: unknown = rawValue;
    if (rawValue === "true") value = true;
    else if (rawValue === "false") value = false;
    else if (/^\d+$/.test(rawValue)) value = rawValue; // keep port as string
    (config as unknown as Record<string, unknown>)[key] = value;
    saveConfig(config);
    console.log(`Set ${key} = ${JSON.stringify(value)}`);
    return;
  }

  if (sub === "reset") {
    saveConfig({ ...DEFAULT_CONFIG });
    console.log(`Config reset to defaults. (${CONFIG_FILE})`);
    return;
  }

  if (sub === "path") {
    console.log(CONFIG_FILE);
    return;
  }

  console.error(`Unknown config subcommand: ${sub}\nUsage: blackboard-runtime config [list|get|set|reset|path]`);
  process.exit(1);
}

async function runStatus(args: string[]): Promise<void> {
  const port = readFlag(args, "--port") ?? "3001";
  const backendUrl = `http://localhost:${port}`;
  const res = await fetch(`${backendUrl}/cli/health`);
  if (!res.ok) {
    throw new Error(`health check failed: ${res.status}`);
  }
  const result = JSON.parse(await res.text()) as unknown;
  emitCommandResult(args, result);
}

async function runAdapter(args: string[]): Promise<void> {
  ensureEmbeddedArtifacts();

  const port = readFlag(args, "--port") ?? "3001";
  const backendUrl = readFlag(args, "--backend-url") ?? `http://localhost:${port}`;
  const forwardedArgs = stripFlags(args, ["--port", "--backend-url"]);

  const child = spawn("node", [hostAdapterEntry, ...forwardedArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      BACKEND_URL: backendUrl,
      BLACKBOARD_WORKSPACE_ROOT: process.cwd(),
    },
  });
  await waitForChild(child);
}

async function runStartSession(args: string[]): Promise<void> {
  ensureEmbeddedArtifacts();

  const port = readFlag(args, "--port") ?? "3001";
  const backendUrl = readFlag(args, "--backend-url") ?? `http://localhost:${port}`;
  const handoffFile = readFlag(args, "--handoff-file");
  const timeoutMs = Number(readFlag(args, "--timeout-ms") ?? "600000");

  if (!handoffFile) {
    throw new Error("start-session requires --handoff-file <path>");
  }
  if (!existsSync(handoffFile)) {
    throw new Error(`handoff file not found: ${handoffFile}`);
  }

  const runtimeDir = path.join(CONFIG_DIR, "runtime");
  const logsDir = path.join(CONFIG_DIR, "logs");
  const stateDir = path.join(tmpdir(), "blackboard-worker");
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  let health = await tryGetHealth(backendUrl);
  let runtimeStartedByCommand = false;
  if (health && !isCompatibleRuntimeHealth(health)) {
    throw new Error(
      `incompatible service already listening at ${backendUrl}; expected ${EXPECTED_RUNTIME_KIND} apiVersion=${EXPECTED_RUNTIME_API_VERSION}, got ${describeRuntimeHealth(health)}`,
    );
  }
  if (health === null) {
    const backendLogFile = path.join(logsDir, `backend-${Date.now()}.log`);
    startDetachedProcess({
      entry: backendEntry,
      args: [],
      env: {
        ...process.env,
        PORT: port,
        BACKEND_URL: backendUrl,
        FRONTEND_URL: backendUrl,
        FRONTEND_DIST_DIR: frontendDistDir,
      },
      logFile: backendLogFile,
    });
    runtimeStartedByCommand = true;
  }

  health = await waitForHealthyRuntime(backendUrl, timeoutMs);

  if (!health?.ok || !isCompatibleRuntimeHealth(health)) {
    throw new Error(`runtime did not become healthy and compatible at ${backendUrl}`);
  }

  const readyFile = path.join(stateDir, `session-ready-${Date.now()}.json`);
  const adapterLogFile = path.join(logsDir, `adapter-${Date.now()}.log`);
  startDetachedProcess({
    entry: hostAdapterEntry,
    args: ["--handoff-file", handoffFile, "--ready-file", readyFile],
    env: {
      ...process.env,
      BACKEND_URL: backendUrl,
      BLACKBOARD_WORKSPACE_ROOT: process.cwd(),
      RUNTIME_STARTED_BY_COMMAND: runtimeStartedByCommand ? "true" : "",
    },
    logFile: adapterLogFile,
  });

  const sessionInfo = await waitForReadyFile(readyFile, timeoutMs);
  if (!sessionInfo.ok) {
    // Adapter hit a fatal during startup (worker turn failed, codex app-server
    // unreachable, handoff invalid, etc). Surface a structured failure to the
    // main agent instead of letting it wait on a ready file that will never
    // arrive. The adapter process has already exited with a non-zero code.
    emitCommandResult(args, {
      ok: false,
      failedStep: "adapter_startup",
      error: sessionInfo.error,
      backendUrl,
      runtimeStartedByCommand,
      readyFile,
      adapterLogFile,
    });
    process.exit(1);
  }
  emitCommandResult(args, {
    ok: true,
    backendUrl,
    frontendUrl: sessionInfo.frontendUrl,
    sessionId: sessionInfo.sessionId,
    subagentThreadId: sessionInfo.subagentThreadId,
    runtimeStartedByCommand,
    readyFile,
    adapterLogFile,
  });
}

async function runCreateSession(args: string[]): Promise<void> {
  const backendUrl = getBackendUrlForAgentCommand(args);
  const title = readRequiredFlag(args, "--title");
  const initialContent = readRequiredTextInput(
    args,
    "--initial-content",
    "--initial-content-file",
  );

  const result = await postJson(`${backendUrl}/cli/sessions`, {
    title,
    initialContent,
  });
  emitCommandResult(args, result);
}

async function runGetSnapshot(args: string[]): Promise<void> {
  const backendUrl = getBackendUrlForAgentCommand(args);
  const sessionId = readRequiredSessionId(args);
  const writeCurrentContent = readFlag(args, "--write-current-content");

  const snapshot = await getJson<{ currentContent?: string }>(
    `${backendUrl}/cli/sessions/${sessionId}/snapshot`,
  );
  if (writeCurrentContent) {
    mkdirSync(path.dirname(writeCurrentContent), { recursive: true });
    writeFileSync(writeCurrentContent, String(snapshot.currentContent ?? ""));
  }
  emitCommandResult(args, snapshot);
}

async function runMarkBulletReady(args: string[]): Promise<void> {
  const backendUrl = getBackendUrlForAgentCommand(args);
  const sessionId = readRequiredSessionId(args);
  const bulletId = readRequiredFlag(args, "--bullet");

  const result = await postJson(
    `${backendUrl}/cli/sessions/${sessionId}/bullets/${bulletId}/ready`,
    {},
  );
  emitCommandResult(args, result);
}

async function runSubmitReviewCandidate(args: string[]): Promise<void> {
  const backendUrl = getBackendUrlForAgentCommand(args);
  const sessionId = readRequiredSessionId(args);
  const candidateContent = readRequiredTextInput(
    args,
    "--candidate-content",
    "--candidate-file",
  );

  const result = await postJson(
    `${backendUrl}/cli/sessions/${sessionId}/review-candidate`,
    { candidateContent },
  );
  emitCommandResult(args, result);
}

async function runCloseSession(args: string[]): Promise<void> {
  const backendUrl = getBackendUrlForAgentCommand(args);
  const sessionId = readRequiredSessionId(args);

  const result = await postJson(`${backendUrl}/cli/sessions/${sessionId}/close`, {});
  emitCommandResult(args, result);
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function readRequiredFlag(args: string[], flag: string): string {
  const value = readFlag(args, flag);
  if (!value) {
    throw new Error(`missing required flag: ${flag}`);
  }
  return value;
}

function readRequiredSessionId(args: string[]): string {
  const inlineSessionId = readFlag(args, "--session");
  const sessionResultFile = readFlag(args, "--session-result-file");

  if (inlineSessionId && sessionResultFile) {
    throw new Error("use either --session or --session-result-file, not both");
  }

  if (inlineSessionId) {
    return inlineSessionId;
  }

  if (sessionResultFile) {
    if (!existsSync(sessionResultFile)) {
      throw new Error(`session result file not found: ${sessionResultFile}`);
    }
    const parsed = JSON.parse(readFileSync(sessionResultFile, "utf8")) as {
      sessionId?: string;
    };
    if (!parsed.sessionId) {
      throw new Error(`session result file did not include sessionId: ${sessionResultFile}`);
    }
    return parsed.sessionId;
  }

  throw new Error("missing required session identifier: --session or --session-result-file");
}

function readRequiredTextInput(
  args: string[],
  inlineFlag: string,
  fileFlag: string,
): string {
  const inlineValue = readFlag(args, inlineFlag);
  const fileValue = readFlag(args, fileFlag);

  if (inlineValue && fileValue) {
    throw new Error(`use either ${inlineFlag} or ${fileFlag}, not both`);
  }
  if (inlineValue) {
    return inlineValue;
  }
  if (fileValue) {
    if (!existsSync(fileValue)) {
      throw new Error(`file not found: ${fileValue}`);
    }
    return readFileSync(fileValue, "utf8");
  }
  throw new Error(`missing required input: ${inlineFlag} or ${fileFlag}`);
}

function stripFlags(args: string[], flags: string[]): string[] {
  const stripped: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (flags.includes(arg)) {
      i += 1;
      continue;
    }
    stripped.push(arg);
  }
  return stripped;
}

function emitCommandResult(args: string[], result: unknown): void {
  const json = JSON.stringify(result);
  const jsonOut = readFlag(args, "--json-out");
  if (jsonOut) {
    mkdirSync(path.dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, json);
  }
  console.log(json);
}

function ensureEmbeddedArtifacts(): void {
  for (const requiredPath of [backendEntry, hostAdapterEntry, frontendDistDir]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`embedded runtime artifact missing: ${requiredPath}. Rebuild @blackboard/runtime first.`);
    }
  }
}

function printUsage(): void {
  console.log(`blackboard-runtime — Blackboard collaboration runtime CLI

USAGE
  blackboard-runtime <command> [options]

LIFECYCLE COMMANDS
  up [--port 3001]                        Start the runtime (backend + frontend) in foreground
  down [--port 3001]                      Stop a running runtime on the given port
  status [--port 3001]                    Check runtime health and print connection info
  start-session --handoff-file <path>     Start a full session (runtime + adapter + subagent)
    [--port 3001] [--timeout-ms 600000]   Returns sessionId, frontendUrl, subagentThreadId

SESSION COMMANDS (used by subagent)
  create-session --title "..." (--initial-content "..." | --initial-content-file <path>)
  get-snapshot (--session <id> | --session-result-file <path>) [--write-current-content <path>]
  mark-bullet-ready --session <id> --bullet <bulletId>
  submit-review-candidate --session <id> (--candidate-content "..." | --candidate-file <path>)
  close-session --session <id>

DIAGNOSTICS
  info                                    Show runtime paths (logs, worker workspace, audit)
  config list                             Show all config values and defaults
  config get <key>                        Get a single config value
  config set <key> <value>                Set a config value (persisted to ~/.blackboard/config.json)
  config reset                            Reset all config to defaults
  config path                             Print config file path
  help                                    Show this help message

COMMON OPTIONS
  --backend-url <url>                     Backend URL (default: http://localhost:3001)
  --port <port>                           Shorthand for --backend-url http://localhost:<port>
  --json-out <path>                       Write structured JSON result to file

ENVIRONMENT VARIABLES
  BLACKBOARD_WORKER_WORKSPACE             Override subagent workspace directory
  BLACKBOARD_HOST_DEBUG=1                 Enable verbose host-adapter debug logging
  ENABLE_PROCEED_MOCK=true                Use mock proceed flow (local testing without subagent)
`);
}

function printInfo(): void {
  const logsDir = path.join(CONFIG_DIR, "logs");
  const workerWs = process.env.BLACKBOARD_WORKER_WORKSPACE ?? path.join(tmpdir(), "blackboard-worker");
  const auditDir = path.join(CONFIG_DIR, "audit");
  const eventsDir = path.join(CONFIG_DIR, "events");

  console.log(`blackboard-runtime info

Paths:
  Config file:        ${CONFIG_FILE}
  Runtime logs:       ${logsDir}
  Dispatch events:    ${eventsDir}
  Worker workspace:   ${workerWs}
  Audit trail:        ${auditDir}

Configuration:
  Backend entry:      ${backendEntry}
  Adapter entry:      ${hostAdapterEntry}
  Frontend dist:      ${frontendDistDir}
  Worker config:      ~/.codex/agents/blackboard-worker.toml

Tips:
  View latest backend log:   tail -f ${logsDir}/backend-*.log
  View latest adapter log:   tail -f ${logsDir}/adapter-*.log
  View dispatch events:      cat ${eventsDir}/session-<id>.jsonl
  View audit for a session:  ls ${auditDir}/session-<id>/
  View subagent workspace:   ls ${workerWs}/session-*/
`);
}

async function waitForChild(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`child exited with code=${code ?? "null"} signal=${signal ?? "null"}`));
    });
    child.on("error", reject);
  });
}

async function tryGetHealth(backendUrl: string): Promise<RuntimeHealth | null> {
  try {
    const res = await fetch(`${backendUrl}/cli/health`);
    if (!res.ok) return null;
    return await res.json() as RuntimeHealth;
  } catch {
    return null;
  }
}

function getBackendUrlForAgentCommand(args: string[]): string {
  return readFlag(args, "--backend-url")
    ?? (() => {
      const port = readFlag(args, "--port") ?? "3001";
      return `http://localhost:${port}`;
    })();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`request failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`request failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as T;
}

async function waitForHealthyRuntime(
  backendUrl: string,
  timeoutMs: number,
): Promise<RuntimeHealth | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const health = await tryGetHealth(backendUrl);
    if (health && !isCompatibleRuntimeHealth(health)) {
      return health;
    }
    if (health?.ok && isCompatibleRuntimeHealth(health)) {
      return health;
    }
    await sleep(500);
  }
  return null;
}

function isCompatibleRuntimeHealth(health: RuntimeHealth): boolean {
  return health.runtimeKind === EXPECTED_RUNTIME_KIND
    && health.runtimeApiVersion === EXPECTED_RUNTIME_API_VERSION;
}

function describeRuntimeHealth(health: RuntimeHealth): string {
  const kind = health.runtimeKind ?? "unknown";
  const version = health.runtimeApiVersion ?? "unknown";
  return `runtimeKind=${kind}, runtimeApiVersion=${version}`;
}

function startDetachedProcess(options: {
  entry: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  logFile: string;
}): void {
  const stdoutFd = openSync(options.logFile, "a");
  const child = spawn("node", [options.entry, ...options.args], {
    cwd: path.dirname(path.dirname(options.entry)),
    detached: true,
    stdio: ["ignore", stdoutFd, stdoutFd],
    env: options.env,
  });
  child.unref();
}

type ReadyFileResult =
  | {
      ok: true;
      sessionId: string;
      frontendUrl: string;
      subagentThreadId: string;
    }
  | {
      ok: false;
      error: { message: string; stack?: string };
    };

async function waitForReadyFile(
  readyFile: string,
  timeoutMs: number,
): Promise<ReadyFileResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(readyFile)) {
      const raw = readFileSync(readyFile, "utf8");
      if (!raw.trim()) {
        await sleep(100);
        continue;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Explicit failure envelope from the adapter.
      if (parsed.ok === false) {
        const err = (parsed.error ?? {}) as { message?: string; stack?: string };
        return {
          ok: false,
          error: {
            message: typeof err.message === "string" ? err.message : "adapter startup failed",
            stack: typeof err.stack === "string" ? err.stack : undefined,
          },
        };
      }
      // Either explicit success envelope, or legacy payload (pre-ok field).
      if (
        typeof parsed.sessionId === "string" &&
        typeof parsed.frontendUrl === "string" &&
        typeof parsed.subagentThreadId === "string"
      ) {
        return {
          ok: true,
          sessionId: parsed.sessionId,
          frontendUrl: parsed.frontendUrl,
          subagentThreadId: parsed.subagentThreadId,
        };
      }
      return {
        ok: false,
        error: { message: `adapter ready-file missing required fields: ${raw}` },
      };
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for adapter ready file: ${readyFile}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[blackboard-runtime] fatal:", error);
  process.exit(1);
});
