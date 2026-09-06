#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Nour's signed macOS release must be built on a Mac."
  exit 1
fi

artifact_dir="$(cd "$(dirname "$0")/.." && pwd)"
workspace_dir="$(cd "$artifact_dir/../.." && pwd)"
cd "$workspace_dir"

for command in pnpm cargo rustup security; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command"
    exit 1
  fi
done

if ! cargo tauri --version >/dev/null 2>&1; then
  echo "Installing the Tauri 2 release CLI..."
  cargo install tauri-cli --version "^2" --locked
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  APPLE_SIGNING_IDENTITY="$(
    security find-identity -v -p codesigning |
      sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' |
      head -n 1
  )"
  export APPLE_SIGNING_IDENTITY
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "No 'Developer ID Application' certificate was found in the login keychain."
  echo "Install the certificate from Apple Developer, then run this command again."
  exit 1
fi

has_api_notary_credentials=false
if [[ -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
  has_api_notary_credentials=true
fi

has_apple_id_notary_credentials=false
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  has_apple_id_notary_credentials=true
fi

if [[ "$has_api_notary_credentials" != true && "$has_apple_id_notary_credentials" != true ]]; then
  echo "Apple notarization credentials are not configured."
  echo "Use either APPLE_API_ISSUER + APPLE_API_KEY + APPLE_API_KEY_PATH"
  echo "or APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID."
  exit 1
fi

echo "Preparing universal Apple Silicon + Intel targets..."
rustup target add aarch64-apple-darwin x86_64-apple-darwin

echo "Installing workspace dependencies..."
pnpm install

echo "Generating release icon assets..."
(
  cd "$artifact_dir"
  cargo tauri icon ./src-tauri/icons/nour-app-icon.svg
)

echo "Building Nour's production interface..."
PORT=1420 BASE_PATH=/ NODE_ENV=production VITE_API_BASE_URL= \
  pnpm --filter @workspace/nour-studio run build

echo "Building, signing, and notarizing Nour..."
(
  cd "$artifact_dir"
  cargo tauri build \
    --target universal-apple-darwin \
    --bundles app,dmg
)

bundle_dir="$artifact_dir/src-tauri/target/universal-apple-darwin/release/bundle"
echo
echo "Nour release complete:"
echo "  $bundle_dir/macos/Nour.app"
echo "  $bundle_dir/dmg/"
open "$bundle_dir"