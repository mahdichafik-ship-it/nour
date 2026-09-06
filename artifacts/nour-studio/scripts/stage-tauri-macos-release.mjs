import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const [target, architecture, releaseDirectoryArgument] = process.argv.slice(2);
if (!target || !['arm64', 'x64'].includes(architecture) || !releaseDirectoryArgument) {
  throw new Error(
    'Usage: stage-tauri-macos-release.mjs <rust-target> <arm64|x64> <release-directory>',
  );
}

const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const version = packageJson.version;
if (!version || version === '0.0.0') {
  throw new Error('Nour package.json must contain a release version');
}

const bundleDirectory = resolve('src-tauri', 'target', target, 'release', 'bundle');
const releaseDirectory = resolve(releaseDirectoryArgument);
await mkdir(releaseDirectory, { recursive: true });

async function findFile(directory, suffix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const entry = entries.find((candidate) => candidate.isFile() && candidate.name.endsWith(suffix));
  if (!entry) throw new Error(`No ${suffix} file found in ${directory}`);
  return resolve(directory, entry.name);
}

const sourceDmg = await findFile(resolve(bundleDirectory, 'dmg'), '.dmg');
const sourceArchive = await findFile(resolve(bundleDirectory, 'macos'), '.app.tar.gz');
const sourceSignature = `${sourceArchive}.sig`;
await readFile(sourceSignature, 'utf8');

const baseName = `Nour-${version}-${architecture}`;
const stagedDmg = resolve(releaseDirectory, `${baseName}.dmg`);
const stagedArchive = resolve(releaseDirectory, `${baseName}.app.tar.gz`);
const stagedSignature = `${stagedArchive}.sig`;

await Promise.all([
  cp(sourceDmg, stagedDmg),
  cp(sourceArchive, stagedArchive),
  cp(sourceSignature, stagedSignature),
]);

await writeFile(
  resolve(releaseDirectory, `manifest-${architecture}.json`),
  `${JSON.stringify(
    {
      architecture,
      rustTarget: target,
      version,
      files: [basename(stagedDmg), basename(stagedArchive), basename(stagedSignature)],
    },
    null,
    2,
  )}\n`,
);

console.log(`Staged Nour ${version} macOS ${architecture} release.`);