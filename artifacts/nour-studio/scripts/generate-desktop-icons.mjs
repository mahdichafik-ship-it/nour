import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = mkdtempSync(join(tmpdir(), 'nour-icons-'));
try {
  // Use Tauri's encoder: 8-bit RGBA PNGs and a real macOS ICNS container.
  const result = spawnSync('pnpm', [
    'exec', 'tauri', 'icon', 'src-tauri/icons/nour-app-icon.svg', '--output', output,
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Tauri icon generation failed: ${result.status}`);
  for (const file of ['icon.png', '32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns']) {
    copyFileSync(join(output, file), join(root, 'src-tauri/icons', file));
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}