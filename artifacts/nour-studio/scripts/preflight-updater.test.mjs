import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { verifyUpdaterCredentials } from './preflight-updater.mjs';

const root = mkdtempSync(join(tmpdir(), 'nour-updater-tests-'));
const cli = resolve('node_modules/@tauri-apps/cli/tauri.js');
const password = 'disposable-password-that-must-never-appear';

function generate(name) {
  const keyPath = join(root, name);
  const result = spawnSync(process.execPath, [
    cli, 'signer', 'generate', '--ci', '--password', password, '--write-keys', keyPath,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // Never pass repository/workflow credentials to the disposable key tool.
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  assert.equal(result.status, 0, 'Tauri CLI must generate a disposable encrypted key');
  return {
    privateKey: readFileSync(keyPath, 'utf8'),
    publicKey: readFileSync(`${keyPath}.pub`, 'utf8'),
  };
}

const first = generate('first');
const second = generate('second');
const scratch = join(root, 'scratch');
const baseEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  RUNNER_TEMP: scratch,
  TAURI_SIGNING_PRIVATE_KEY: first.privateKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
  TAURI_UPDATER_PUBLIC_KEY: first.publicKey,
};

after(() => rmSync(root, { recursive: true, force: true }));

async function expectSafe(env, pattern) {
  await assert.rejects(verifyUpdaterCredentials(env), (error) => {
    assert.match(error.message, pattern);
    for (const secret of [
      env.TAURI_SIGNING_PRIVATE_KEY,
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
      env.TAURI_UPDATER_PUBLIC_KEY,
    ]) {
      if (secret) assert.ok(!error.message.includes(secret));
    }
    assert.equal(error.cause, undefined);
    return true;
  });
}

test('real disposable encrypted Tauri key signs and verifies, then cleans up', async () => {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(scratch));
  await verifyUpdaterCredentials(baseEnv);
  assert.deepEqual(readdirSync(scratch), []);
});

test('wrong private-key password is rejected with redacted output and cleanup', async () => {
  const wrongPassword = `${password}-wrong`;
  await expectSafe(
    { ...baseEnv, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: wrongPassword },
    /TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD/,
  );
  assert.deepEqual(readdirSync(scratch), []);
});

test('malformed private key is rejected before signing', async () => {
  await expectSafe(
    { ...baseEnv, TAURI_SIGNING_PRIVATE_KEY: `${first.privateKey.slice(0, -1)}!` },
    /TAURI_SIGNING_PRIVATE_KEY must be a strict base64-encoded/,
  );
});

test('valid-base64 private key with a malformed decoded packet is rejected', async () => {
  const malformed = Buffer.from(
    `arbitrary comment\n${Buffer.from('EdScB2', 'ascii').toString('base64')}\n`,
  ).toString('base64');
  await expectSafe(
    { ...baseEnv, TAURI_SIGNING_PRIVATE_KEY: malformed },
    /TAURI_SIGNING_PRIVATE_KEY must be a strict base64-encoded/,
  );
});

test('a valid public key with the private key ID exercises signature verification', async () => {
  const firstText = Buffer.from(first.publicKey, 'base64').toString('utf8').split('\n');
  const secondText = Buffer.from(second.publicKey, 'base64').toString('utf8').split('\n');
  const firstPacket = Buffer.from(firstText[1], 'base64');
  const wrongPacket = Buffer.from(secondText[1], 'base64');
  firstPacket.copy(wrongPacket, 2, 2, 10);
  const sameIdWrongPublicKey = Buffer.from(
    `any compatible public-key comment\n${wrongPacket.toString('base64')}\n`,
  ).toString('base64');
  await expectSafe(
    { ...baseEnv, TAURI_UPDATER_PUBLIC_KEY: sameIdWrongPublicKey },
    /does not match TAURI_UPDATER_PUBLIC_KEY/,
  );
  assert.deepEqual(readdirSync(scratch), []);
});

test('unexpected filesystem failures use a fixed safe diagnostic', async () => {
  const notDirectory = join(root, 'not-a-directory');
  writeFileSync(notDirectory, 'not a directory');
  await expectSafe(
    { ...baseEnv, RUNNER_TEMP: notDirectory },
    /Updater credential check could not complete/,
  );
});

test('malformed public key envelopes and decoded packets are rejected', async () => {
  await expectSafe(
    { ...baseEnv, TAURI_UPDATER_PUBLIC_KEY: `${first.publicKey}=junk` },
    /TAURI_UPDATER_PUBLIC_KEY must be a strict base64-encoded minisign public key/,
  );
  const malformedDecoded = Buffer.from(
    'untrusted comment: minisign public key: 0000000000000000\nAAAA\n',
  ).toString('base64');
  await expectSafe(
    { ...baseEnv, TAURI_UPDATER_PUBLIC_KEY: malformedDecoded },
    /TAURI_UPDATER_PUBLIC_KEY must be a strict base64-encoded minisign public key/,
  );
});

test('missing values use fixed diagnostics naming only the secret', async () => {
  for (const name of [
    'TAURI_SIGNING_PRIVATE_KEY',
    'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
    'TAURI_UPDATER_PUBLIC_KEY',
  ]) {
    await expectSafe({ ...baseEnv, [name]: '' }, new RegExp(`${name} is required`));
  }
});