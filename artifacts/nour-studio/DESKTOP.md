# Nour Desktop

Nour Desktop uses Tauri so the existing React editor can run in a native macOS
window while local-only capabilities live in Rust. The bundled Express API stays
behind the existing `/api` contract.

## Run on a Mac

Requirements:

- macOS 12 or newer
- Xcode Command Line Tools
- Node.js 24 and pnpm
- Rust stable

From the repository root:

```sh
pnpm install
pnpm --filter @workspace/nour-studio run desktop:dev
```

That single command starts:

1. The Nour API at `http://127.0.0.1:5000`
2. The React frontend at `http://127.0.0.1:1420`
3. The native Tauri window

## What is native in this first milestone

- The interface detects whether it is running in the desktop shell.
- Export Project writes a `.nourproject` file into the macOS app-data folder.
- The desktop process uses the same `/api/healthz` contract as the web app.
- Imported media remains local and previews directly from its local object URL.

The Replit browser Preview remains available for interface work, but it cannot
replace testing the native window on macOS.

## Publish the distributable Mac release

Production desktop releases use `.github/workflows/nour-desktop-release.yml`.
The workflow follows the proven Volume Capture release strategy while keeping
Nour on Tauri:

1. A native Apple-silicon runner builds `aarch64-apple-darwin`.
2. A native Intel runner builds `x86_64-apple-darwin`.
3. Tauri signs, notarizes, and creates an architecture-specific DMG and updater
   archive on each runner.
4. Both outputs are verified with `codesign`, Gatekeeper, and `stapler`.
5. The updater archives are merged into one `latest.json`.
6. The complete set is uploaded to a draft GitHub Release, checked, then
   published as the latest release.

The release is triggered by a version tag such as `v0.1.0`. The tag must match
the versions in `package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml`.

Required GitHub Actions secrets:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`: Apple app-specific password
- `APPLE_TEAM_ID`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `TAURI_UPDATER_PUBLIC_KEY`

GitHub automatically supplies `GITHUB_TOKEN`.

Expected release files for version `0.1.0`:

```text
Nour-0.1.0-arm64.dmg
Nour-0.1.0-arm64.app.tar.gz
Nour-0.1.0-arm64.app.tar.gz.sig
Nour-0.1.0-x64.dmg
Nour-0.1.0-x64.app.tar.gz
Nour-0.1.0-x64.app.tar.gz.sig
latest.json
```