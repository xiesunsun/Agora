import path from "node:path";

export const PRODUCT_NAME = "Agora";
export const PRIMARY_BINARY = "agora";
export const LEGACY_BINARY = "blackboard-runtime";
export const GLOBAL_SKILL_NAME = "blackboard-collaboration";
export const GLOBAL_WORKER_CONFIG_NAME = "blackboard-worker.toml";
export const EMBEDDED_CODEX_DIR = "codex";
export const EMBEDDED_SKILL_DIR = path.posix.join(
  EMBEDDED_CODEX_DIR,
  "skills",
  GLOBAL_SKILL_NAME,
);
export const INSTALLED_SKILL_DIR = path.posix.join("skills", GLOBAL_SKILL_NAME);
export const EMBEDDED_WORKER_CONFIG_PATH = path.posix.join(
  EMBEDDED_CODEX_DIR,
  "agents",
  GLOBAL_WORKER_CONFIG_NAME,
);

export function getSkillInstallGuidance(codexHome: string): string {
  const targetDir = path.join(codexHome, "skills", GLOBAL_SKILL_NAME);
  return [
    `${PRIMARY_BINARY} init-codex installs or refreshes the ${GLOBAL_SKILL_NAME} skill at ${targetDir}.`,
    `Canonical packaged files are embedded under ${EMBEDDED_SKILL_DIR}; rerun ${PRIMARY_BINARY} doctor after local edits.`,
  ].join(" ");
}
