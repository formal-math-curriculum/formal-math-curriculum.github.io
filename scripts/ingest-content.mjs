import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (lock.lock_version !== 'p5-m5.6-site-input-lock/v1') throw new Error('unsupported input lock version');

  const content = lock.consumed?.content;
  if (!content || content.repository !== 'formal-math-curriculum/content') throw new Error('content authority mismatch');
  if (!/^[0-9a-f]{40}$/.test(content.revision)) throw new Error('content revision must be an immutable SHA');

  const actualRevision = observedRevision ?? exactRevision(inputDir);
  if (actualRevision !== content.revision) throw new Error(`stale content checkout: expected ${content.revision}, observed ${actualRevision}`);

  const validatorPath = resolve(inputDir, content.validator_path);
  const generatorPath = resolve(inputDir, content.generator_path);
  const validatorHash = await sha256(validatorPath);
  if (validatorHash !== content.validator_sha256) throw new Error('incompatible content validator hash');
  const generatorHash = await sha256(generatorPath);
  if (generatorHash !== content.generator_sha256) throw new Error('incompatible content generator hash');

  const observedOutputs = {};
  for (const [name, record] of Object.entries(content.outputs ?? {})) {
    const sourcePath = resolve(inputDir, record.path);
    const observedHash = await sha256(sourcePath);
    if (observedHash !== record.sha256) throw new Error(`incompatible governed output hash: ${name}`);
    const value = JSON.parse(await readFile(sourcePath, 'utf8'));
    const schemaVersion = value.schema_version ?? value.schemaVersion;
    if (schemaVersion !== record.schema_version) throw new Error(`content schema version mismatch: ${name}`);
    observedOutputs[name] = { ...record, observed_sha256: observedHash };
  }

  try {
    execFileSync(process.execPath, [validatorPath], { cwd: inputDir, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.stdout?.toString().trim() || error.message;
    throw new Error(`content validation failed: ${detail}`);
  }

  await rm(generatedDir, { recursive: true, force: true });
  const bundleDir = resolve(generatedDir, 'm5-6');
  await mkdir(bundleDir, { recursive: true });
  for (const [name, record] of Object.entries(content.outputs)) {
    await copyFile(resolve(inputDir, record.path), resolve(bundleDir, name));
  }

  const provenance = {
    provenance_version: 'p5-m5.6-build-input/v1',
    consumed: {
      repository: content.repository,
      revision: content.revision,
      tree: content.tree,
      source_identity: content.source_identity,
      selector_sha256: content.selector_sha256,
      formal_dependency_sha256: content.formal_dependency_sha256,
      validator_path: content.validator_path,
      validator_sha256: validatorHash,
      generator_path: content.generator_path,
      generator_sha256: generatorHash,
      outputs: observedOutputs
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
