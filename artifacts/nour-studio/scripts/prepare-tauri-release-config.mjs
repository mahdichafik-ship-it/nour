import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repository = process.env.GITHUB_REPOSITORY?.trim();
const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();

if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error('GITHUB_REPOSITORY must use the owner/repository format');
}

if (!publicKey) {
  throw new Error('TAURI_UPDATER_PUBLIC_KEY is required');
}

const configPath = resolve('src-tauri/tauri.conf.json');
const config = await readFile(configPath, 'utf8');
const prepared = config
  .replaceAll('__NOUR_GITHUB_REPOSITORY__', repository)
  .replaceAll('__NOUR_UPDATER_PUBLIC_KEY__', publicKey.replaceAll('\\n', '\n'));

if (prepared.includes('__NOUR_')) {
  throw new Error('Unresolved Nour release placeholders remain in tauri.conf.json');
}

JSON.parse(prepared);
await writeFile(configPath, prepared);
console.log(`Prepared Tauri updater configuration for ${repository}.`);