import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function exactRevision(inputDir) {
  return execFileSync('git', ['-C', inputDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

export async function ingest({
  lockPath = resolve(root, 'inputs.lock.json'),
  inputDir = resolve(root, process.env.CONTENT_INPUT_DIR ?? '.inputs/content'),
  observedRevision = process.env.CONTENT_INPUT_REVISION,
  generatedDir = resolve(root, '.generated/content'),
  publicProvenancePath = resolve(root, 'public/_provenance/input.json')
} = {}) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock.lock_version !== 'm5.4-input-lock/v1') throw new Error('unsupported input lock version');

  const content = lock.consumed?.content;
  if (!content || content.repository !== 'formal-math-curriculum/content') throw new Error('content authority mismatch');
  if (!/^[0-9a-f]{40}$/.test(content.revision)) throw new Error('content revision must be an immutable SHA');

  const actualRevision = observedRevision ?? exactRevision(inputDir);
  if (actualRevision !== content.revision) throw new Error(`stale content checkout: expected ${content.revision}, observed ${actualRevision}`);

  const manifestPath = resolve(inputDir, content.manifest_path);
  const validatorPath = resolve(inputDir, content.validator_path);
  const manifestHash = await sha256(manifestPath);
  const validatorHash = await sha256(validatorPath);
  if (manifestHash !== content.manifest_sha256) throw new Error('incompatible content manifest hash');
  if (validatorHash !== content.validator_sha256) throw new Error('incompatible content validator hash');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== content.schema_version) throw new Error('content schema version mismatch');
  const validator = await import(`${pathToFileURL(validatorPath).href}?sha=${validatorHash}`);
  const errors = await validator.loadAndValidate(manifestPath);
  if (errors.length) throw new Error(`content validation failed:\n${errors.join('\n')}`);

  await rm(generatedDir, { recursive: true, force: true });
  await mkdir(generatedDir, { recursive: true });
  await copyFile(manifestPath, resolve(generatedDir, 'manifest.json'));

  const provenance = {
    provenance_version: 'm5.4-build-input/v1',
    consumed: {
      repository: content.repository,
      revision: content.revision,
      manifest_path: content.manifest_path,
      manifest_sha256: manifestHash,
      validator_path: content.validator_path,
      validator_sha256: validatorHash,
      schema_version: content.schema_version
    },
    recorded_not_consumed: lock.recorded_not_consumed
  };
  const serialized = `${JSON.stringify(provenance, null, 2)}\n`;
  await writeFile(resolve(generatedDir, 'provenance.json'), serialized);
  await mkdir(dirname(publicProvenancePath), { recursive: true });
  await writeFile(publicProvenancePath, serialized);
  return provenance;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const provenance = await ingest();
  console.log(`ingested ${provenance.consumed.repository}@${provenance.consumed.revision}`);
}
