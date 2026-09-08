import { spawnSync } from 'node:child_process';
import { ReleasePreflightError } from './release-preflight-error.mjs';

const credentials = 'APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID';

// Never forward notarytool's output or a spawn error: both can contain credentials.
export function verifyAppleCredentials(env, run = spawnSync) {
  for (const name of ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
    if (!env[name]?.trim()) throw new ReleasePreflightError(`${name} is required.`);
  }
  let result;
  try {
    result = run('xcrun', [
      'notarytool', 'history',
      '--apple-id', env.APPLE_ID,
      '--password', env.APPLE_PASSWORD,
      '--team-id', env.APPLE_TEAM_ID,
      '--output-format', 'json',
      '--no-progress',
    ], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: Object.fromEntries(
        ['PATH', 'HOME', 'TMPDIR', 'DEVELOPER_DIR'].filter((name) => env[name])
          .map((name) => [name, env[name]]),
      ),
    });
  } catch {
    throw new ReleasePreflightError(`Apple credential check could not run; check Xcode/notarytool and ${credentials}.`);
  }
  if (result.error || result.signal) {
    throw new ReleasePreflightError(`Apple credential check could not complete; check Xcode/notarytool, network access, and ${credentials}.`);
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (/\b(401|403)\b|unauthorized|forbidden|invalid credentials/i.test(output)) {
      throw new ReleasePreflightError(`Apple rejected ${credentials}; check the app-specific password and account/team pairing.`);
    }
    throw new ReleasePreflightError(`Apple credential check failed; check ${credentials}, network access, and Apple service availability. Raw diagnostics suppressed.`);
  }
}