import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const required = ['index.html', '404.html', '_provenance/input.json'];

for (const path of required) await readFile(resolve(dist, path));

const files = [];
let bytes = 0;
async function walk(directory) {
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Pages artifact must not contain symlink: ${relative(dist, path)}`);
    if (stat.isDirectory()) await walk(path);
    if (stat.isFile()) {
      if (relative(dist, path) === '_provenance/artifact.json') continue;
      const content = await readFile(path);
      bytes += content.byteLength;
      files.push({ path: relative(dist, path), bytes: content.byteLength, sha256: createHash('sha256').update(content).digest('hex') });
    }
  }
}
await walk(dist);
if (files.length > 10000) throw new Error('bounded artifact file limit exceeded');
if (bytes > 1_000_000_000) throw new Error('bounded artifact byte limit exceeded');

const manifest = {
  artifact_manifest_version: 'm5.4-pages-artifact/v1',
  manifest_self_excluded: true,
  payload_files: files,
  payload_file_count: files.length,
  payload_total_bytes: bytes
};
await writeFile(resolve(dist, '_provenance/artifact.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`verified Pages artifact payload: ${files.length} files, ${bytes} bytes, plus this manifest`);
