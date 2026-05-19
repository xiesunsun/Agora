import { existsSync } from "node:fs";
import path from "node:path";
import {
  compareInstalledSkillFiles,
  compareInstalledWorkerConfig,
  resolveCodexHome,
} from "./codexAssets.js";
import { PRIMARY_BINARY } from "./publicMetadata.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail?: string;
  repairHint?: string;
  path?: string;
}

export interface RuntimePaths {
  backendEntry: string;
  hostAdapterEntry: string;
  frontendDistDir: string;
}

export interface RunPublishedDoctorOptions {
  codexHome?: string;
  backendUrl?: string;
  port?: string;
  workerWorkspace?: string;
  runtimePaths: RuntimePaths;
}

export async function runPublishedDoctor(
  options: RunPublishedDoctorOptions,
): Promise<{ ok: boolean; codexHome: string; backendUrl: string; checks: DoctorCheck[] }> {
  const codexHome = resolveCodexHome(options.codexHome);
  const backendUrl = options.backendUrl ?? `http://localhost:${options.port ?? "3001"}`;
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "embeddedBackend",
    ok: existsSync(options.runtimePaths.backendEntry),
    path: options.runtimePaths.backendEntry,
    detail: existsSync(options.runtimePaths.backendEntry)
      ? undefined
      : "embedded backend entry is missing",
    repairHint: existsSync(options.runtimePaths.backendEntry)
      ? undefined
      : "rebuild the runtime package before publishing or running doctor",
  });
  checks.push({
    name: "embeddedAdapter",
    ok: existsSync(options.runtimePaths.hostAdapterEntry),
    path: options.runtimePaths.hostAdapterEntry,
    detail: existsSync(options.runtimePaths.hostAdapterEntry)
      ? undefined
      : "embedded host adapter entry is missing",
    repairHint: existsSync(options.runtimePaths.hostAdapterEntry)
      ? undefined
      : "rebuild the runtime package before publishing or running doctor",
  });
  checks.push({
    name: "embeddedFrontend",
    ok: existsSync(options.runtimePaths.frontendDistDir),
    path: options.runtimePaths.frontendDistDir,
    detail: existsSync(options.runtimePaths.frontendDistDir)
      ? undefined
      : "embedded frontend assets are missing",
    repairHint: existsSync(options.runtimePaths.frontendDistDir)
      ? undefined
      : "rebuild the runtime package before publishing or running doctor",
  });

  try {
    const skillComparison = compareInstalledSkillFiles(codexHome);
    checks.push({
      name: "globalSkillFiles",
      ok: skillComparison.ok,
      path: skillComparison.path,
      detail: skillComparison.detail,
      repairHint: skillComparison.ok
        ? undefined
        : `reinstall the blackboard-collaboration skill into ${path.join(codexHome, "skills")}`,
    });
  } catch (error) {
    checks.push({
      name: "embeddedSkillTemplates",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      repairHint: "rebuild the runtime package so the embedded Codex skill templates are included",
    });
  }

  try {
    const workerComparison = compareInstalledWorkerConfig(codexHome);
    checks.push({
      name: "globalWorkerConfig",
      ok: workerComparison.ok,
      path: workerComparison.path,
      detail: workerComparison.detail,
      repairHint: workerComparison.ok
        ? undefined
        : `rerun ${PRIMARY_BINARY} init-codex --codex-home ${codexHome} --force`,
    });
  } catch (error) {
    checks.push({
      name: "globalWorkerConfig",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      repairHint: `rerun ${PRIMARY_BINARY} init-codex --codex-home ${codexHome} --force`,
    });
  }

  const workerWorkspace = options.workerWorkspace ?? path.join(codexHome, "workers");
  checks.push({
    name: "workerWorkspaceParent",
    ok: existsSync(path.dirname(workerWorkspace)),
    path: workerWorkspace,
    detail: existsSync(path.dirname(workerWorkspace))
      ? undefined
      : "worker workspace parent directory does not exist",
    repairHint: existsSync(path.dirname(workerWorkspace))
      ? undefined
      : `create ${path.dirname(workerWorkspace)} or configure a valid --worker-workspace path`,
  });

  const health = await tryGetHealth(backendUrl);
  checks.push(
    health === null
      ? {
          name: "runtimeCompatibility",
          ok: true,
          detail: `no runtime currently listening at ${backendUrl}`,
          repairHint: `start ${PRIMARY_BINARY} only if you want a local runtime running before session startup`,
        }
      : {
          name: "runtimeCompatibility",
          ok: health.runtimeKind === "blackboard-runtime" && health.runtimeApiVersion === 1,
          detail: `detected runtimeKind=${health.runtimeKind ?? "unknown"} runtimeApiVersion=${health.runtimeApiVersion ?? "unknown"}`,
          repairHint: health.runtimeKind === "blackboard-runtime" && health.runtimeApiVersion === 1
            ? undefined
            : `stop the incompatible runtime on ${backendUrl} or rerun ${PRIMARY_BINARY} doctor with --debug`,
        },
  );

  const ok = checks.every((check) => check.ok);
  return { ok, codexHome, backendUrl, checks };
}

interface RuntimeHealth {
  ok?: boolean;
  runtimeKind?: string;
  runtimeApiVersion?: number;
}

async function tryGetHealth(backendUrl: string): Promise<RuntimeHealth | null> {
  try {
    const response = await fetch(`${backendUrl}/cli/health`);
    if (!response.ok) {
      return null;
    }
    return await response.json() as RuntimeHealth;
  } catch {
    return null;
  }
}
