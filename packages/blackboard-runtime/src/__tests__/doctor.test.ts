import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getEmbeddedSkillFiles,
  installWorkerConfig,
} from "../codexAssets.js";
import {
  runPublishedDoctor,
  type RuntimePaths,
} from "../doctor.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("published doctor", () => {
  it("fails when the global skill is missing", async () => {
    const fixture = createFixture();
    installWorkerConfig({ codexHome: fixture.codexHome, force: true });

    const result = await runPublishedDoctor({
      codexHome: fixture.codexHome,
      port: "39101",
      workerWorkspace: fixture.workerWorkspace,
      runtimePaths: fixture.runtimePaths,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "globalSkillFiles")?.ok).toBe(false);
  });

  it("fails when the worker config content diverges from the embedded template", async () => {
    const fixture = createFixture();
    installWorkerConfig({ codexHome: fixture.codexHome, force: true });
    installSkillFixture(fixture.codexHome);

    writeFileSync(
      path.join(fixture.codexHome, "agents", "blackboard-worker.toml"),
      'name = "blackboard-worker"\n# stale\n',
    );

    const result = await runPublishedDoctor({
      codexHome: fixture.codexHome,
      port: "39102",
      workerWorkspace: fixture.workerWorkspace,
      runtimePaths: fixture.runtimePaths,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "globalWorkerConfig")?.ok).toBe(false);
  });

  it("passes when skill and worker config match the embedded templates", async () => {
    const fixture = createFixture();
    installWorkerConfig({ codexHome: fixture.codexHome, force: true });
    installSkillFixture(fixture.codexHome);

    const result = await runPublishedDoctor({
      codexHome: fixture.codexHome,
      port: "39103",
      workerWorkspace: fixture.workerWorkspace,
      runtimePaths: fixture.runtimePaths,
    });

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });
});

function createFixture(): {
  codexHome: string;
  workerWorkspace: string;
  runtimePaths: RuntimePaths;
} {
  const root = mkdtempSync(path.join(tmpdir(), "agora-doctor-"));
  tempDirs.push(root);

  const codexHome = path.join(root, ".codex");
  const runtimeRoot = path.join(root, "runtime");
  const frontendDistDir = path.join(runtimeRoot, "frontend");
  const workerWorkspace = path.join(root, "workers", "session-cache");

  mkdirSync(path.join(runtimeRoot, "backend"), { recursive: true });
  mkdirSync(path.join(runtimeRoot, "host-adapter"), { recursive: true });
  mkdirSync(frontendDistDir, { recursive: true });
  mkdirSync(path.join(root, "workers"), { recursive: true });
  writeFileSync(path.join(runtimeRoot, "backend", "index.js"), "export {};\n");
  writeFileSync(path.join(runtimeRoot, "host-adapter", "index.js"), "export {};\n");

  return {
    codexHome,
    workerWorkspace,
    runtimePaths: {
      backendEntry: path.join(runtimeRoot, "backend", "index.js"),
      hostAdapterEntry: path.join(runtimeRoot, "host-adapter", "index.js"),
      frontendDistDir,
    },
  };
}

function installSkillFixture(codexHome: string): void {
  for (const file of getEmbeddedSkillFiles()) {
    const target = path.join(codexHome, ...file.relativePath.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}
