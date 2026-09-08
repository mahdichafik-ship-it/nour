import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, after } from 'node:test';

const scripts = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'nour-release-tests-'));
after(() => rmSync(root, { recursive: true, force: true }));
const env = { PATH: process.env.PATH, HOME: root, RUNNER_TEMP: root };
const keyPath = join(root, 'disposable');
const password = 'disposable-release-test-password';
const generated = spawnSync(process.execPath, [
  resolve(scripts, '../node_modules/@tauri-apps/cli/tauri.js'),
  'signer', 'generate', '--ci', '--password', password, '--write-keys', keyPath,
], { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
assert.equal(generated.status, 0, 'disposable key generation must succeed');
const credentials = {
  APPLE_CERTIFICATE: 'disposable-certificate',
  APPLE_CERTIFICATE_PASSWORD: 'disposable-certificate-password',
  APPLE_SIGNING_IDENTITY: 'disposable-identity',
  APPLE_ID: 'disposable@example.invalid',
  APPLE_PASSWORD: 'disposable-apple-password',
  APPLE_TEAM_ID: 'TESTTEAM01',
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8'),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
  TAURI_UPDATER_PUBLIC_KEY: readFileSync(`${keyPath}.pub`, 'utf8'),
};

// A local executable prevents tests from ever contacting Apple's real service.
const bin = join(root, 'bin');
mkdirSync(bin);
writeFileSync(join(bin, 'xcrun'), `#!${process.execPath}
process.stdout.write(JSON.stringify(process.argv));
process.stderr.write(JSON.stringify(process.argv));
process.exit(${0});
`, { mode: 0o700 });

function run(name, overrides = {}, cwd = root) {
  const result = spawnSync(process.execPath, [join(scripts, name)], {
    cwd,
    env: { ...env, ...credentials, PATH: `${bin}:${env.PATH}`, ...overrides },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  const output = `${result.stdout}${result.stderr}`;
  for (const value of Object.values(credentials)) assert.ok(!output.includes(value), 'secret leaked');
  assert.ok(!output.includes('--password'), 'sensitive command arguments leaked');
  assert.equal(result.error, undefined, 'script must complete');
  return { status: result.status, output };
}

test('entry point completes real updater signing and stubbed Apple auth without leaking args', () => {
  const result = run('preflight-release.mjs');
  assert.equal(result.status, 0);
  assert.match(result.output, /public-key verification passed/);
  assert.match(result.output, /no app submitted/);
});

test('entry point names missing secrets and exits before external tools', () => {
  const result = run('preflight-release.mjs', { APPLE_PASSWORD: '', TAURI_SIGNING_PRIVATE_KEY: '' });
  assert.equal(result.status, 1);
  assert.match(result.output, /Missing release secrets: APPLE_PASSWORD, TAURI_SIGNING_PRIVATE_KEY/);
  assert.ok(!result.output.includes('passed'));
});

test('entry point rejects malformed updater credentials with no Apple success', () => {
  const result = run('preflight-release.mjs', { TAURI_SIGNING_PRIVATE_KEY: 'not-a-base64-key' });
  assert.equal(result.status, 1);
  assert.match(result.output, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.ok(!result.output.includes('not-a-base64-key'));
  assert.ok(!result.output.includes('passed'));
});

test('configuration preparation uses the same validated public key without changing the template', () => {
  const source = readFileSync(resolve(scripts, '../src-tauri/tauri.conf.json'), 'utf8');
  mkdirSync(join(root, 'src-tauri'));
  const configPath = join(root, 'src-tauri/tauri.conf.json');
  writeFileSync(configPath, source);
  const result = run('prepare-tauri-release-config.mjs', { GITHUB_REPOSITORY: 'example/nour' });
  assert.equal(result.status, 0);
  const prepared = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(prepared.plugins.updater.pubkey, credentials.TAURI_UPDATER_PUBLIC_KEY.trim());
  assert.deepEqual(prepared.plugins.updater.endpoints, [
    'https://github.com/example/nour/releases/latest/download/latest.json',
  ]);
  assert.equal(readFileSync(resolve(scripts, '../src-tauri/tauri.conf.json'), 'utf8'), source);

  const saved = readFileSync(configPath, 'utf8');
  const invalid = run('prepare-tauri-release-config.mjs', {
    GITHUB_REPOSITORY: 'example/nour', TAURI_UPDATER_PUBLIC_KEY: 'broken-public-key',
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.output, /TAURI_UPDATER_PUBLIC_KEY/);
  assert.ok(!invalid.output.includes('broken-public-key'));
  assert.equal(readFileSync(configPath, 'utf8'), saved);

  writeFileSync(configPath, `{"secret":"${credentials.APPLE_PASSWORD}" BROKEN`);
  const malformed = run('prepare-tauri-release-config.mjs', { GITHUB_REPOSITORY: 'example/nour' });
  assert.equal(malformed.status, 1);
  assert.match(malformed.output, /raw diagnostics suppressed/);
});