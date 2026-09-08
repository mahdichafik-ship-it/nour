import { verifyAppleCredentials } from './preflight-apple.mjs';
import { verifyUpdaterCredentials } from './preflight-updater.mjs';
import { ReleasePreflightError } from './release-preflight-error.mjs';

const required = [
  'APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY',
  'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID',
  'TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'TAURI_UPDATER_PUBLIC_KEY',
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`::error::Missing release secrets: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  try {
    await verifyUpdaterCredentials(process.env);
    console.log('Tauri updater signing and public-key verification passed.');
    verifyAppleCredentials(process.env);
    console.log('Apple notarization account/team authentication passed (no app submitted).');
  } catch (error) {
    // Never print unexpected exceptions, stacks, causes, subprocess output or args.
    const message = error instanceof ReleasePreflightError
      ? error.message
      : 'Release credential preflight failed unexpectedly. Raw diagnostics suppressed; check runner tooling.';
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}