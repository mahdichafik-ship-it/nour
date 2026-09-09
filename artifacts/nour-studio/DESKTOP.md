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
- Desktop Export MP4 renders H.264/AAC with the bundled, pinned FFmpeg sidecar;
  the native save dialog writes a temporary `.partial` file and renames only
  after FFmpeg succeeds. Browser mode intentionally offers project JSON only.

The sidecar is prepared with `scripts/prepare-ffmpeg-sidecar.sh`. It downloads
the pinned eugeneware/ffmpeg-static b6.1.1 arm64 and x64 macOS binaries,
verifies their SHA256 digests, and names them for the exact Tauri target. A
successful local smoke check still does not constitute signed/notarized Mac
evidence; that evidence remains pending in the release workflow.

The Replit browser Preview remains available for interface work, but it cannot
replace testing the native window on macOS.

## Publish the distributable Mac release

Production desktop releases use `.github/workflows/nour-desktop-release.yml`.
The workflow follows the proven Volume Capture release strategy while keeping
Nour on Tauri:

1. One macOS preflight job validates release credentials before either native
   build can start (details below).
2. Native Apple-silicon and Intel runners build `aarch64-apple-darwin` and
   `x86_64-apple-darwin`, respectively.
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
- `TAURI_SIGNING_PRIVATE_KEY`: the complete base64-encoded contents of the
  existing Tauri signer private-key file, not a path, PEM key, or just its inner
  minisign line
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password for that private key
  (this release workflow requires a nonempty password)
- `TAURI_UPDATER_PUBLIC_KEY`: the complete base64-encoded contents of the
  matching Tauri signer `.pub` file, used in the shipped updater configuration

GitHub automatically supplies `GITHUB_TOKEN`.

### Credential preflight and safe failures

The `preflight` job must succeed before `build-mac` starts either architecture.
It does not compile Rust, submit an app to Apple, import a certificate, upload
artifacts, edit secrets, or publish a release.

- All nine required secrets are checked for presence. Certificate import and
  signing validation remain in the native build; presence does not establish
  certificate validity.
- The updater check validates the key envelopes, uses the installed Tauri signer
  to decode/decrypt the private key and sign a disposable payload, and verifies
  that signature with `TAURI_UPDATER_PUBLIC_KEY`, the public key prepared into
  the app's updater configuration. A malformed key, incorrect password, or
  mismatched pair fails before the Apple check and native compilation.
- `xcrun notarytool history` authenticates `APPLE_ID`, `APPLE_PASSWORD`, and
  `APPLE_TEAM_ID` together using a read-only request. Empty history is valid.
  A 401/403 reports the three secret names and asks you to check the app-specific
  password and account/team pairing. Network, timeout, and tool failures fail
  closed with a separate safe diagnostic; they do not prove credentials invalid.

Credential commands run without shell tracing. Sensitive arguments and tool
stdout/stderr are never forwarded to logs, including on failure. Updater
temporary files are restricted to a private temporary directory and removed on
success and failure; they are not release assets. Do not add debug output,
environment dumps, or artifact uploads of preflight temporary files.

If preflight fails, correct only the named secret's formatting or value through
GitHub's secret settings, then explicitly rerun the release when ready. Preserve
the existing updater key pair: replacing it can prevent installed apps from
accepting updates. No key rotation, secret changes, tag movement, workflow
dispatch, or publication is performed by the preflight tooling.

Run the regression checks without repository credentials:

```sh
pnpm --filter @workspace/nour-studio run desktop:test-preflight
```

These tests generate disposable keys and cover signing success, malformed
inputs, incorrect passwords, mismatched public keys, safe diagnostics, and
temporary-file cleanup. Apple success/rejection/network cases use a stubbed
command runner; a real Apple account check runs only in the macOS release
preflight with the explicitly configured secrets.

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