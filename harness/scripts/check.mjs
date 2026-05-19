#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mode = process.argv.find((arg) => arg.startsWith("--")) ?? "--check";

const requiredPaths = [
  "docs/01-product/PRD.md",
  "docs/01-product/Feature-Spec.md",
  "docs/03-contracts/Frontend-Backend-Protocol.md",
  "docs/04-design/Acceptance-Matrix.md",
  "docs/05-agent/MVP-Runbook.md",
  "apps/frontend/src/app/sessionStore.ts",
  "apps/backend/src/routes.ts",
  "apps/host-adapter/src/eventLoop.ts",
  "packages/schema/src/index.ts",
];

const requiredScripts = [
  "build:all",
  "test:all",
  "typecheck:all",
  "harness:report",
  "harness:check",
  "harness:arch",
  "harness:naming",
  "harness:boundary",
];

const requiredPackageDirs = [
  "apps/backend",
  "apps/frontend",
  "apps/host-adapter",
  "packages/blackboard-runtime",
  "packages/schema",
];

const missingPaths = requiredPaths.filter((path) => !existsSync(join(root, path)));
const missingPackageDirs = requiredPackageDirs.filter((path) => !existsSync(join(root, path, "package.json")));
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const missingScripts = requiredScripts.filter((script) => !rootPackage.scripts?.[script]);
const failures = [
  ...missingPaths.map((path) => `missing path: ${path}`),
  ...missingPackageDirs.map((path) => `missing package: ${path}`),
  ...missingScripts.map((script) => `missing script: ${script}`),
];

if (failures.length > 0) {
  console.error(`FAIL ${mode}`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`PASS ${mode}`);
console.log(`checked ${requiredPaths.length} paths, ${requiredPackageDirs.length} packages, ${requiredScripts.length} scripts`);
