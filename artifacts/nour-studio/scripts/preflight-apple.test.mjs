import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAppleCredentials } from './preflight-apple.mjs';

const env = {
  APPLE_ID: 'disposable@example.invalid',
  APPLE_PASSWORD: 'disposable-password',
  APPLE_TEAM_ID: 'TESTTEAM01',
  TAURI_SIGNING_PRIVATE_KEY: 'must-not-be-inherited',
  PATH: '/usr/bin',
};

test('Apple check only reads history and captures sensitive arguments/output', () => {
  verifyAppleCredentials(env, (command, args, options) => {
    assert.equal(command, 'xcrun');
    assert.deepEqual(args.slice(0, 2), ['notarytool', 'history']);
    assert.equal(args[args.indexOf('--password') + 1], env.APPLE_PASSWORD);
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(options.shell, false);
    assert.equal(options.timeout, 90_000);
    assert.equal(options.env.TAURI_SIGNING_PRIVATE_KEY, undefined);
    return { status: 0, stdout: '{"history":[]}' };
  });
});

for (const [label, result, diagnostic] of [
  ['bad account/password/team', { status: 1, stderr: `HTTP 401 ${env.APPLE_PASSWORD}` }, /Apple rejected/],
  ['forbidden team', { status: 1, stderr: 'HTTP 403' }, /Apple rejected/],
  ['network failure', { status: 1, stderr: env.APPLE_ID }, /service availability/],
  ['timeout', { status: null, signal: 'SIGTERM' }, /could not complete/],
  ['missing tool', { error: new Error(env.APPLE_PASSWORD) }, /could not complete/],
]) {
  test(`Apple ${label} uses only safe diagnostics`, () => {
    assert.throws(() => verifyAppleCredentials(env, () => result), (error) => {
      assert.match(error.message, diagnostic);
      for (const name of ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
        assert.match(error.message, new RegExp(name));
        assert.ok(!error.message.includes(env[name]));
      }
      return true;
    });
  });
}

test('missing credentials fail without invoking Apple', () => {
  for (const name of ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
    assert.throws(() => verifyAppleCredentials({ ...env, [name]: '' }, () => {
      assert.fail('must not run');
    }), new RegExp(`${name} is required`));
  }
});

test('thrown subprocess errors never expose command arguments', () => {
  assert.throws(() => verifyAppleCredentials(env, () => {
    throw new Error(env.APPLE_PASSWORD);
  }), (error) => !error.message.includes(env.APPLE_PASSWORD));
});