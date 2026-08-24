import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { ingest } from '../scripts/ingest-content.mjs';

const lock = JSON.parse(await readFile('inputs.lock.json', 'utf8'));
const source = resolve(process.env.CONTENT_INPUT_DIR ?? '.inputs/content');

async function fixture() {
  const target = await mkdtemp(resolve(tmpdir(), 'm56-ingest-'));
  for (const path of lock.consumed.content.validation_inputs) {
    await mkdir(dirname(resolve(target, path)), { recursive: true });
    await copyFile(resolve(source, path), resolve(target, path));
  }
  return target;
}

async function options(inputDir) {
  const output = await mkdtemp(resolve(tmpdir(), 'm54-output-'));
  return {
    inputDir,
    observedRevision: lock.consumed.content.revision,
    generatedDir: resolve(output, 'generated'),
    publicProvenancePath: resolve(output, 'public/input.json')
  };
}

test('qualified immutable content is ingested with provenance', async () => {
  const inputDir = await fixture();
  const config = await options(inputDir);
  const provenance = await ingest(config);
  assert.equal(provenance.consumed.revision, lock.consumed.content.revision);
  assert.equal(provenance.consumed.tree, lock.consumed.content.tree);
  assert.equal(provenance.consumed.selector_sha256, lock.consumed.content.selector_sha256);
  assert.equal(
    JSON.parse(await readFile(config.publicProvenancePath, 'utf8')).consumed.outputs['publication.json'].observed_sha256,
    lock.consumed.content.outputs['publication.json'].sha256
  );
  assert.equal(
    JSON.parse(await readFile(resolve(config.generatedDir, 'm5-6/publication.json'), 'utf8')).content.length,
    15
  );
});

test('missing manifest fails closed', async () => {
  const inputDir = await fixture();
  await rm(resolve(inputDir, lock.consumed.content.outputs['content-manifest.json'].path));
  await assert.rejects(ingest(await options(inputDir)), /ENOENT/);
});

test('stale checkout revision fails closed', async () => {
  const inputDir = await fixture();
  const config = await options(inputDir);
  config.observedRevision = '0'.repeat(40);
  await assert.rejects(ingest(config), /stale content checkout/);
});

test('incompatible manifest hash fails closed', async () => {
  const inputDir = await fixture();
  const path = resolve(inputDir, lock.consumed.content.outputs['content-manifest.json'].path);
  await writeFile(path, `${await readFile(path, 'utf8')}\n`);
  await assert.rejects(ingest(await options(inputDir)), /incompatible governed output hash/);
});
