#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/ssunxie/code/whiteBoard"
PACK_DIR="/tmp/agora-pack-test"

echo "==> [1/5] Building all packages..."
cd "$REPO_ROOT"
pnpm --filter ./packages/blackboard-runtime build

echo "==> [2/5] Removing old global install..."
npm uninstall -g agora 2>/dev/null || true
rm -rf ~/.codex/skills/blackboard-collaboration
rm -f ~/.codex/agents/blackboard-worker.toml

echo "==> [3/5] Packing and installing globally..."
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"
pnpm --filter ./packages/blackboard-runtime pack --pack-destination "$PACK_DIR"
npm install -g "$PACK_DIR"/agora-*.tgz

echo "==> [4/5] Installing Codex skill + worker config..."
agora init-codex --force

echo "==> [5/5] Running doctor..."
agora doctor

echo ""
echo "✅ Done. CLI + Skill + worker.toml are now synced with the repo."
