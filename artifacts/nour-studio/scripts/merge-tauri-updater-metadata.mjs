import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [releaseDirectoryArgument, version] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY?.trim();

if (!releaseDirectoryArgument || !version || !repository) {
  throw new Error(
    'Usage: GITHUB_REPOSITORY=owner/repo merge-tauri-updater-metadata.mjs <release-directory> <version>',
  );
}

const releaseDirectory = resolve(releaseDirectoryArgument);
const platforms = {};

for (const [architecture, platform] of [
  ['arm64', 'darwin-aarch64'],
  ['x64', 'darwin-x86_64'],
]) {
  const archive = `Nour-${version}-${architecture}.app.tar.gz`;
  const signature = (await readFile(resolve(releaseDirectory, `${archive}.sig`), 'utf8')).trim();
  if (!signature) throw new Error(`Updater signature is empty for ${archive}`);

  platforms[platform] = {
    signature,
    url: `https://github.com/${repository}/releases/download/v${version}/${archive}`,
  };
}

const metadata = {
  version,
  notes: `Nour ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

await writeFile(
  resolve(releaseDirectory, 'latest.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
console.log(`Generated Tauri updater metadata for Nour ${version}.`);