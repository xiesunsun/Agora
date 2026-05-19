import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareInstalledWorkerConfig,
  getEmbeddedSkillFiles,
  getEmbeddedWorkerTemplate,
  installSkillFiles,
  installWorkerConfig,
} from "../codexAssets.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("embedded codex assets", () => {
  it("loads the embedded worker template", () => {
    expect(getEmbeddedWorkerTemplate()).toContain('name = "blackboard-worker"');
  });

  it("installs blackboard-worker.toml into a target Codex home", () => {
    const codexHome = registerTempDir();

    const result = installWorkerConfig({ codexHome, force: true });
    const installed = readFileSync(result.installedPath, "utf8");

    expect(installed).toBe(getEmbeddedWorkerTemplate());
    expect(result.overwritten).toBe(false);
  });

  it("reports divergence when the installed worker config drifts", () => {
    const codexHome = registerTempDir();
    const installResult = installWorkerConfig({ codexHome, force: true });

    writeFileSync(installResult.installedPath, `${getEmbeddedWorkerTemplate()}\n# local edit\n`);

    expect(compareInstalledWorkerConfig(codexHome)).toMatchObject({
      ok: false,
      path: installResult.installedPath,
    });
  });

  it("installs the embedded skill files into a target Codex home", () => {
    const codexHome = registerTempDir();

    const result = installSkillFiles({ codexHome, force: true });

    expect(result.installedPath).toBe(path.join(codexHome, "skills", "blackboard-collaboration"));
    expect(result.overwrittenFiles).toEqual([]);
    for (const file of getEmbeddedSkillFiles()) {
      expect(readFileSync(path.join(codexHome, ...file.relativePath.split("/")), "utf8")).toBe(file.content);
    }
  });

  it("returns the canonical embedded skill file list", () => {
    const files = getEmbeddedSkillFiles();

    expect(files.map((file) => file.relativePath)).toEqual([
      "skills/blackboard-collaboration/SKILL.md",
      "skills/blackboard-collaboration/agents/openai.yaml",
    ]);
  });

  it("keeps worker artifacts under runtime-managed workspaceRoot", () => {
    const skill = getEmbeddedSkillFiles().find((file) => file.relativePath.endsWith("SKILL.md"));
    const workerTemplate = getEmbeddedWorkerTemplate();

    expect(skill?.content).not.toContain("current working directory as the worker workspace root");
    expect(skill?.content).toContain("runtime-provided `workspaceRoot`");
    expect(skill?.content).toContain("Use this skill when acting as the main agent");
    expect(workerTemplate).toContain("workspaceRoot/sessions/{sessionId}/");
    expect(workerTemplate).toContain("Do not create session cache files in the main agent's invoking directory");
  });
});

function registerTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "agora-codex-assets-"));
  tempDirs.push(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}
