import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SESSION_WORKSPACE_ENV = "BLACKBOARD_SESSION_WORKSPACE";
const WORKER_WORKSPACE_ENV = "BLACKBOARD_WORKER_WORKSPACE";

export function resolveWorkerSessionWorkspace(explicit?: string): string {
  if (explicit) {
    mkdirSync(explicit, { recursive: true });
    return explicit;
  }

  const existing = process.env[SESSION_WORKSPACE_ENV];
  if (existing) {
    mkdirSync(existing, { recursive: true });
    return existing;
  }

  const parent = process.env[WORKER_WORKSPACE_ENV] ?? join(tmpdir(), "blackboard-worker");
  const sessionWorkspace = join(parent, `session-${Date.now()}-${process.pid}`);
  mkdirSync(sessionWorkspace, { recursive: true });
  process.env[SESSION_WORKSPACE_ENV] = sessionWorkspace;
  return sessionWorkspace;
}
