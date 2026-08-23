import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('workflow contract validator passes', () => {
  assert.match(execFileSync(process.execPath, ['scripts/validate-pipeline.mjs'], { encoding: 'utf8' }), /validated ingestion/);
});

test('recorded Lean input is explicitly not consumed', async () => {
  const lock = JSON.parse(await readFile('inputs.lock.json', 'utf8'));
  assert.equal(lock.recorded_not_consumed.lean.revision, '3f1a315f438af37a327eaf8b9b9c1dbc6f409394');
  assert.equal(lock.recorded_not_consumed.mathlib.revision, 'db584cd6d46c92f209a44c0f1c829460d327499d');
});
