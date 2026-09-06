import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = path.resolve(artifactDir, '../..');
const children = [];

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? workspaceDir,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
  children.push(child);
  return child;
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await sleep(500);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  stopChildren();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});
process.on('exit', stopChildren);

try {
  start('pnpm', ['--filter', '@workspace/api-server', 'run', 'dev'], {
    env: { PORT: '5000' },
  });
  start('pnpm', ['run', 'dev'], {
    cwd: artifactDir,
    env: {
      PORT: '1420',
      BASE_PATH: '/',
      VITE_API_BASE_URL: 'http://127.0.0.1:5000',
    },
  });

  await Promise.all([
    waitFor('http://127.0.0.1:5000/api/healthz', 'Nour API'),
    waitFor('http://127.0.0.1:1420', 'Nour frontend'),
  ]);

  const desktop = start(
    'cargo',
    ['run', '--manifest-path', path.join(artifactDir, 'src-tauri/Cargo.toml')],
    { cwd: artifactDir },
  );
  desktop.on('exit', (code) => {
    stopChildren();
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error);
  stopChildren();
  process.exit(1);
}