import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseUpdaterPublicKey } from './preflight-updater.mjs';
import { ReleasePreflightError } from './release-preflight-error.mjs';

try {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();

  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new ReleasePreflightError('GITHUB_REPOSITORY must use the owner/repository format');
  }

  if (!publicKey) {
    throw new ReleasePreflightError('TAURI_UPDATER_PUBLIC_KEY is required');
  }
  const validatedPublicKey = parseUpdaterPublicKey(publicKey).envelope;

  const configPath = resolve('src-tauri/tauri.conf.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const updater = config.plugins?.updater;
  if (!updater || !Array.isArray(updater.endpoints)) {
    throw new ReleasePreflightError('Tauri updater configuration is missing');
  }
  updater.endpoints = updater.endpoints.map((endpoint) => (
    endpoint.replaceAll('__NOUR_GITHUB_REPOSITORY__', repository)
  ));
  updater.pubkey = validatedPublicKey;
  const prepared = `${JSON.stringify(config, null, 2)}\n`;

  if (prepared.includes('__NOUR_')) {
    throw new ReleasePreflightError('Unresolved Nour release placeholders remain in tauri.conf.json');
  }

  await writeFile(configPath, prepared);
  console.log(`Prepared Tauri updater configuration for ${repository}.`);
} catch (error) {
  // JSON parsing and filesystem errors can include configuration contents.
  console.error(error instanceof ReleasePreflightError
    ? error.message
    : 'Unable to prepare Tauri updater configuration; raw diagnostics suppressed.');
  process.exitCode = 1;
}