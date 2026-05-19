import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMBEDDED_CODEX_DIR,
  EMBEDDED_SKILL_DIR,
  EMBEDDED_WORKER_CONFIG_PATH,
  GLOBAL_WORKER_CONFIG_NAME,
  INSTALLED_SKILL_DIR,
} from "./publicMetadata.js";

export interface EmbeddedSkillFile {
  relativePath: string;
  content: string;
}

export interface InstallWorkerConfigOptions {
  codexHome?: string;
  force?: boolean;
}

export interface InstallWorkerConfigResult {
  installedPath: string;
  overwritten: boolean;
}

export interface InstallSkillFilesResult {
  installedPath: string;
  overwrittenFiles: string[];
}

export interface AssetComparisonResult {
  ok: boolean;
  path: string;
  detail?: string;
}

export function getEmbeddedWorkerTemplate(): string {
  return readEmbeddedAsset(EMBEDDED_WORKER_CONFIG_PATH);
}

export function getEmbeddedSkillFiles(): EmbeddedSkillFile[] {
  const skillRoot = path.join(resolveEmbeddedCodexRoot(), "skills", "blackboard-collaboration");
  return walkFiles(skillRoot).map((filePath) => ({
    relativePath: path.posix.join(
      INSTALLED_SKILL_DIR,
      path.relative(skillRoot, filePath).split(path.sep).join(path.posix.sep),
    ),
    content: readFileSync(filePath, "utf8"),
  }));
}

export function resolveCodexHome(explicit?: string): string {
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.resolve(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"));
}

export function installWorkerConfig(
  options: InstallWorkerConfigOptions = {},
): InstallWorkerConfigResult {
  const codexHome = resolveCodexHome(options.codexHome);
  const installedPath = path.join(codexHome, "agents", GLOBAL_WORKER_CONFIG_NAME);
  const template = getEmbeddedWorkerTemplate();
  const existing = existsSync(installedPath) ? readFileSync(installedPath, "utf8") : null;

  if (existing !== null && existing !== template && !options.force) {
    throw new Error(
      `refusing to overwrite existing worker config at ${installedPath}; rerun with --force`,
    );
  }

  mkdirSync(path.dirname(installedPath), { recursive: true });
  writeFileSync(installedPath, template);

  return {
    installedPath,
    overwritten: existing !== null && existing !== template,
  };
}

export function installSkillFiles(
  options: InstallWorkerConfigOptions = {},
): InstallSkillFilesResult {
  const codexHome = resolveCodexHome(options.codexHome);
  const skillRoot = path.join(codexHome, ...INSTALLED_SKILL_DIR.split("/"));
  const overwrittenFiles: string[] = [];

  for (const file of getEmbeddedSkillFiles()) {
    const installedPath = path.join(codexHome, ...file.relativePath.split("/"));
    const existing = existsSync(installedPath) ? readFileSync(installedPath, "utf8") : null;

    if (existing !== null && existing !== file.content && !options.force) {
      throw new Error(
        `refusing to overwrite existing skill file at ${installedPath}; rerun with --force`,
      );
    }

    mkdirSync(path.dirname(installedPath), { recursive: true });
    writeFileSync(installedPath, file.content);
    if (existing !== null && existing !== file.content) {
      overwrittenFiles.push(installedPath);
    }
  }

  return {
    installedPath: skillRoot,
    overwrittenFiles,
  };
}

export function compareInstalledWorkerConfig(codexHome?: string): AssetComparisonResult {
  const resolvedCodexHome = resolveCodexHome(codexHome);
  const installedPath = path.join(
    resolvedCodexHome,
    "agents",
    GLOBAL_WORKER_CONFIG_NAME,
  );

  if (!existsSync(installedPath)) {
    return {
      ok: false,
      path: installedPath,
      detail: "worker config is missing",
    };
  }

  const installed = readFileSync(installedPath, "utf8");
  const expected = getEmbeddedWorkerTemplate();
  if (installed !== expected) {
    return {
      ok: false,
      path: installedPath,
      detail: "worker config does not match the embedded Agora template",
    };
  }

  return { ok: true, path: installedPath };
}

export function compareInstalledSkillFiles(codexHome?: string): AssetComparisonResult {
  const resolvedCodexHome = resolveCodexHome(codexHome);

  for (const file of getEmbeddedSkillFiles()) {
    const installedPath = path.join(resolvedCodexHome, ...file.relativePath.split("/"));
    if (!existsSync(installedPath)) {
      return {
        ok: false,
        path: installedPath,
        detail: `skill file is missing: ${file.relativePath}`,
      };
    }
    if (readFileSync(installedPath, "utf8") !== file.content) {
      return {
        ok: false,
        path: installedPath,
        detail: `skill file does not match the embedded Agora template: ${file.relativePath}`,
      };
    }
  }

  const skillRoot = path.join(resolvedCodexHome, ...INSTALLED_SKILL_DIR.split("/"));
  return { ok: true, path: skillRoot };
}

function readEmbeddedAsset(relativePath: string): string {
  const assetPath = path.join(resolveEmbeddedCodexRoot(), ...relativePath.split("/").slice(1));
  if (!existsSync(assetPath)) {
    throw new Error(`embedded asset missing: ${assetPath}`);
  }
  return readFileSync(assetPath, "utf8");
}

function resolveEmbeddedCodexRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../assets/codex/", import.meta.url)),
    fileURLToPath(new URL("./codex/", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `embedded Codex assets not found; checked ${candidates.join(", ")} for ${EMBEDDED_CODEX_DIR}`,
  );
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) {
    throw new Error(`embedded asset directory missing: ${root}`);
  }

  const results: string[] = [];
  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      results.push(...walkFiles(entryPath));
      continue;
    }
    results.push(entryPath);
  }
  return results.sort();
}
