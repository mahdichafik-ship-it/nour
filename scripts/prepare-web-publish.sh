#!/bin/sh
# Runs in the publishing build, not in the development workflow.
set -eu
cd "$(dirname "$0")/.."

# Native compiler output is not needed by the static website or Node API.
# Keep source, installed JS dependencies, and both production dist directories.
if [ "${1:-}" = "--dry-run" ]; then
  echo "Would remove generated desktop build output:"
  du -sh artifacts/nour-studio/src-tauri/target 2>/dev/null || true
  echo "Would prune the pnpm package cache."
  exit 0
fi

echo "Removing generated desktop build output from the web publishing image..."
rm -rf artifacts/nour-studio/src-tauri/target
pnpm store prune