import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist', 'pagefind');
const executable = resolve(root, 'node_modules', '.bin', process.platform === 'win32' ? 'pagefind.cmd' : 'pagefind');

await rm(output, { recursive: true, force: true });
execFileSync(executable, ['--site', 'dist'], {
  cwd: root,
  env: {
    ...process.env,
    RAYON_NUM_THREADS: '1',
    SOURCE_DATE_EPOCH: '0'
  },
  stdio: 'inherit'
});
