import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const [releaseDirectoryArgument, expectedVersion] = process.argv.slice(2);
if (!releaseDirectoryArgument || !expectedVersion) {
  throw new Error(
    'Usage: validate-tauri-updater-metadata.mjs <release-directory> <version>',
  );
}

const releaseDirectory = resolve(releaseDirectoryArgument);
const entries = new Set(await readdir(releaseDirectory));
const expectedAssets = ['arm64', 'x64'].flatMap((architecture) => [
  `Nour-${expectedVersion}-${architecture}.dmg`,
  `Nour-${expectedVersion}-${architecture}.app.tar.gz`,
  `Nour-${expectedVersion}-${architecture}.app.tar.gz.sig`,
  `manifest-${architecture}.json`,
]);
expectedAssets.push('latest.json');

const missing = expectedAssets.filter((asset) => !entries.has(asset));
if (missing.length > 0) {
  throw new Error(`Missing Nour release assets: ${missing.join(', ')}`);
}

const metadata = JSON.parse(
  await readFile(resolve(releaseDirectory, 'latest.json'), 'utf8'),
);
if (metadata.version !== expectedVersion) {
  throw new Error(`latest.json version ${metadata.version} does not match ${expectedVersion}`);
}

for (const [architecture, platform] of [
  ['arm64', 'darwin-aarch64'],
  ['x64', 'darwin-x86_64'],
]) {
  const archive = `Nour-${expectedVersion}-${architecture}.app.tar.gz`;
  const platformMetadata = metadata.platforms?.[platform];
  if (!platformMetadata?.signature || !platformMetadata.url?.endsWith(`/${archive}`)) {
    throw new Error(`Invalid updater metadata for ${platform}`);
  }
  await access(resolve(releaseDirectory, archive));
}

console.log(`Validated ${expectedAssets.length} Nour ${expectedVersion} release assets.`);