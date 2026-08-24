import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePipeline } from '../scripts/validate-pipeline.mjs';

const ciSource = await readFile('.github/workflows/ci.yml', 'utf8');
const deploySource = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
const lock = JSON.parse(await readFile('inputs.lock.json', 'utf8'));

test('workflow contract validator passes', () => {
  assert.match(execFileSync(process.execPath, ['scripts/validate-pipeline.mjs'], { encoding: 'utf8' }), /semantically validated ingestion/);
});

test('recorded Lean input is explicitly not consumed', async () => {
  assert.equal(lock.recorded_not_consumed.lean.revision, '3f1a315f438af37a327eaf8b9b9c1dbc6f409394');
  assert.equal(lock.recorded_not_consumed.mathlib.revision, 'db584cd6d46c92f209a44c0f1c829460d327499d');
});

test('production event mutation is rejected semantically', () => {
  assert.throws(() => validatePipeline({ ciSource, deploySource: deploySource.replace('workflow_dispatch:', 'push:'), lock }), /sole manual gate/);
});

test('job-level permission shadowing is rejected', () => {
  const mutated = deploySource.replace('      contents: read\n      id-token: write\n      attestations: write', '      contents: write\n      id-token: write\n      attestations: write');
  assert.throws(() => validatePipeline({ ciSource, deploySource: mutated, lock }), /build attestation authority drift/);
});

test('mutable action tag is rejected', () => {
  const mutated = deploySource.replace('actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128', 'actions/deploy-pages@v5');
  assert.throws(() => validatePipeline({ ciSource, deploySource: mutated, lock }), /mutable or malformed action ref/);
});

test('content reference drift is rejected', () => {
  const mutated = ciSource.replace(lock.consumed.content.revision, '0'.repeat(40));
  assert.throws(() => validatePipeline({ ciSource: mutated, deploySource, lock }), /workflow\/content lock drift/);
});

test('source-owned favicon exists', async () => {
  await access('public/favicon.svg');
});
