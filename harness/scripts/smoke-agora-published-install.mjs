#!/usr/bin/env node
import { cpSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimePackageJson = JSON.parse(
  readFileSync(path.join(repoRoot, "packages", "blackboard-runtime", "package.json"), "utf8"),
);
const tempRoot = mkdtempSync(path.join(tmpdir(), "agora-published-install-"));
const packDir = path.join(tempRoot, "pack");
const npmPrefix = path.join(tempRoot, "prefix");
const codexHome = path.join(tempRoot, ".codex");

mkdirSync(packDir, { recursive: true });
mkdirSync(npmPrefix, { recursive: true });
mkdirSync(codexHome, { recursive: true });

try {
  await run("pnpm", ["--filter", "./packages/blackboard-runtime", "build"]);
  await run("pnpm", [
    "--filter",
    "./packages/blackboard-runtime",
    "pack",
    "--pack-destination",
    packDir,
  ]);

  const tarball = path.join(packDir, `sunxie-agora-${runtimePackageJson.version}.tgz`);
  await run("npm", ["install", "-g", tarball], {
    env: { ...process.env, npm_config_prefix: npmPrefix },
  });

  const installedPackageRoot = path.join(npmPrefix, "lib", "node_modules", "@sunxie", "agora");
  const installedBinary = path.join(npmPrefix, "bin", "agora");
  const skillSource = path.join(
    installedPackageRoot,
    "dist",
    "codex",
    "skills",
    "blackboard-collaboration",
  );
  const skillTarget = path.join(codexHome, "skills", "blackboard-collaboration");

  mkdirSync(path.dirname(skillTarget), { recursive: true });
  cpSync(skillSource, skillTarget, { recursive: true });

  const initResult = await run(installedBinary, [
    "init-codex",
    "--codex-home",
    codexHome,
    "--force",
  ]);
  const doctorResult = await run(installedBinary, [
    "doctor",
    "--codex-home",
    codexHome,
  ]);
  const parsedDoctor = JSON.parse(doctorResult.stdout.trim());

  if (!parsedDoctor.ok) {
    throw new Error(`agora doctor failed: ${doctorResult.stdout}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tempRoot,
        tarball,
        initResult: JSON.parse(initResult.stdout.trim()),
        doctorResult: parsedDoctor,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`smoke:agora failed in ${tempRoot}`);
  throw error;
}

async function run(command, args, options = {}) {
  return await execFileAsync(command, args, {
    cwd: repoRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}
