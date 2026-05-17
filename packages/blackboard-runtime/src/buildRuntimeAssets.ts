import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const runtimeDistRoot = fileURLToPath(new URL("../dist/", import.meta.url));

function main(): void {
  const copies = [
    {
      label: "backend",
      from: path.join(repoRoot, "apps/backend/dist"),
      to: path.join(runtimeDistRoot, "backend"),
    },
    {
      label: "host-adapter",
      from: path.join(repoRoot, "apps/host-adapter/dist"),
      to: path.join(runtimeDistRoot, "host-adapter"),
    },
    {
      label: "frontend",
      from: path.join(repoRoot, "apps/frontend/dist"),
      to: path.join(runtimeDistRoot, "frontend"),
    },
  ];

  mkdirSync(runtimeDistRoot, { recursive: true });

  for (const copy of copies) {
    if (!existsSync(copy.from)) {
      throw new Error(`${copy.label} artifact not found: ${copy.from}`);
    }
    rmSync(copy.to, { recursive: true, force: true });
    cpSync(copy.from, copy.to, { recursive: true });
  }

  console.log(`[runtime-build] embedded backend, host-adapter, and frontend assets into ${runtimeDistRoot}`);
}

main();
