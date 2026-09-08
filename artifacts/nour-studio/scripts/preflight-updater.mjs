import { spawn } from 'node:child_process';
import {
  mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHash, createPublicKey, verify,
} from 'node:crypto';
import { ReleasePreflightError } from './release-preflight-error.mjs';

const cliPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../node_modules/@tauri-apps/cli/tauri.js',
);
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const publicKeyDiagnostic = 'TAURI_UPDATER_PUBLIC_KEY must be a strict base64-encoded minisign public key.';
const signerTimeoutMs = 90_000;

function fail(message) {
  throw new ReleasePreflightError(message);
}

function decodeBase64(value, diagnostic) {
  if (typeof value !== 'string' || !value || !base64Pattern.test(value)) fail(diagnostic);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) fail(diagnostic);
  return decoded;
}

function decodeUtf8(value, diagnostic) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    fail(diagnostic);
  }
}

export function parseUpdaterPublicKey(value) {
  // Tauri decodes this value directly, without trimming. Preserve its exact
  // representation so a preflight success is meaningful for the build.
  const envelope = value;
  const text = decodeUtf8(decodeBase64(envelope, publicKeyDiagnostic), publicKeyDiagnostic);
  // minisign accepts arbitrary untrusted comments; only the packet is trusted.
  const match = /^[^\r\n]*\n([A-Za-z0-9+/]+={0,2})\n?$/.exec(text);
  if (!match) fail(publicKeyDiagnostic);

  const packet = decodeBase64(match[1], publicKeyDiagnostic);
  if (packet.length !== 42 || packet.subarray(0, 2).toString('ascii') !== 'Ed') {
    fail(publicKeyDiagnostic);
  }
  return {
    envelope,
    keyId: packet.subarray(2, 10),
    publicKey: packet.subarray(10),
  };
}

function validatePrivateKey(value) {
  const diagnostic = 'TAURI_SIGNING_PRIVATE_KEY must be a strict base64-encoded Tauri encrypted signing key.';
  const envelope = value;
  const text = decodeUtf8(decodeBase64(envelope, diagnostic), diagnostic);
  const match = /^[^\r\n]*\n([A-Za-z0-9+/]+={0,2})\n?$/.exec(text);
  if (!match) fail(diagnostic);
  const packet = decodeBase64(match[1], diagnostic);
  if (packet.length !== 158 || packet.subarray(0, 6).toString('ascii') !== 'EdScB2') fail(diagnostic);
  return envelope;
}

function parseSignature(value) {
  const diagnostic = 'Updater credential check produced an invalid minisign signature; check TAURI_SIGNING_PRIVATE_KEY and the installed Tauri CLI.';
  const envelope = typeof value === 'string' ? value.trim() : value;
  const text = decodeUtf8(decodeBase64(envelope, diagnostic), diagnostic);
  const lines = text.split('\n');
  if (
    lines.length !== 5
    || !lines[0].startsWith('untrusted comment: ')
    || !lines[2].startsWith('trusted comment: ')
    || lines[4] !== ''
  ) fail(diagnostic);
  const signature = decodeBase64(lines[1], diagnostic);
  const globalSignature = decodeBase64(lines[3], diagnostic);
  if (
    signature.length !== 74
    || signature.subarray(0, 2).toString('ascii') !== 'ED'
    || globalSignature.length !== 64
  ) fail(diagnostic);
  return {
    keyId: signature.subarray(2, 10),
    signature: signature.subarray(10),
    globalSignature,
    trustedComment: lines[2].slice('trusted comment: '.length).trim(),
  };
}

function signPayload(payloadPath, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    let settled = false;
    let timeout;
    const complete = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    try {
      child = spawn(process.execPath, [cliPath, 'signer', 'sign', payloadPath], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...Object.fromEntries(
            ['PATH', 'HOME', 'TMPDIR', 'SystemRoot'].filter((name) => env[name])
              .map((name) => [name, env[name]]),
          ),
          TAURI_SIGNING_PRIVATE_KEY: env.TAURI_SIGNING_PRIVATE_KEY,
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
        },
      });
    } catch {
      complete(new ReleasePreflightError(
        'Updater credential check could not run; check the installed Tauri CLI, TAURI_SIGNING_PRIVATE_KEY, and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.',
      ));
      return;
    }
    timeout = setTimeout(() => {
      // The signer is a direct child, not a shell. Kill it to stop retaining
      // the private key/password environment after a bounded wait.
      child.kill('SIGKILL');
      complete(new ReleasePreflightError(
        'Updater credential check timed out; check the installed Tauri CLI, TAURI_SIGNING_PRIVATE_KEY, and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.',
      ));
    }, signerTimeoutMs);
    // Capture and discard all CLI output: it is never safe to include in diagnostics.
    child.stdout.resume();
    child.stderr.resume();
    child.once('error', () => complete(new ReleasePreflightError(
      'Updater credential check could not run; check the installed Tauri CLI, TAURI_SIGNING_PRIVATE_KEY, and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.',
    )));
    child.once('close', (status, signal) => {
      if (status === 0 && !signal) complete();
      else complete(new ReleasePreflightError(
        'Updater credential check failed to decrypt/sign; check TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.',
      ));
    });
  });
}

export async function verifyUpdaterCredentials(env) {
  let directory;
  try {
    for (const name of [
      'TAURI_SIGNING_PRIVATE_KEY',
      'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
      'TAURI_UPDATER_PUBLIC_KEY',
    ]) {
      if (!env?.[name]?.trim()) fail(`${name} is required.`);
    }

    const privateKey = validatePrivateKey(env.TAURI_SIGNING_PRIVATE_KEY);
    const publicKey = parseUpdaterPublicKey(env.TAURI_UPDATER_PUBLIC_KEY);
    directory = await mkdtemp(join(env.RUNNER_TEMP?.trim() || tmpdir(), 'nour-updater-preflight-'));
    const payloadPath = join(directory, 'payload');
    const payload = Buffer.from('Nour updater credential preflight\n');
    await writeFile(payloadPath, payload, { mode: 0o600 });
    await signPayload(payloadPath, {
      ...env,
      TAURI_SIGNING_PRIVATE_KEY: privateKey,
    });
    const signed = parseSignature(await readFile(`${payloadPath}.sig`, 'utf8'));

    const spki = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      publicKey.publicKey,
    ]);
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const digest = createHash('blake2b512').update(payload).digest();
    if (
      !signed.keyId.equals(publicKey.keyId)
      || !verify(null, digest, key, signed.signature)
      || !verify(
        null,
        Buffer.concat([signed.signature, Buffer.from(signed.trustedComment, 'utf8')]),
        key,
        signed.globalSignature,
      )
    ) {
      fail('Updater signature verification failed; TAURI_SIGNING_PRIVATE_KEY does not match TAURI_UPDATER_PUBLIC_KEY.');
    }
  } catch (error) {
    if (error instanceof ReleasePreflightError) throw error;
    throw new ReleasePreflightError(
      'Updater credential check could not complete; check the installed Tauri CLI, TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD, and TAURI_UPDATER_PUBLIC_KEY.',
    );
  } finally {
    if (directory) {
      try {
        await rm(directory, { recursive: true, force: true });
      } catch {
        throw new ReleasePreflightError(
          'Updater credential check could not securely clean up temporary signing data; check TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD, and TAURI_UPDATER_PUBLIC_KEY.',
        );
      }
    }
  }
}