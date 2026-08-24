import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateM58Operations } from '../scripts/validate-m5-8-operations.mjs';

const sources = await Promise.all([
  readFile('operations/m5-8/release-policy.json', 'utf8'),
  readFile('inputs.lock.json', 'utf8'),
  readFile('generated/licenses/software-dependencies.json', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('pnpm-lock.yaml', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('.github/workflows/deploy-pages.yml', 'utf8'),
  readFile('tests/fixtures/m5-8-operations-cases.json', 'utf8')
]);
const [policySource, lockSourceJson, inventorySource, packageSource, pnpmLockSource, ciSource, deploySource, fixtureSource] = sources;
const base = {
  policy: JSON.parse(policySource),
  lock: JSON.parse(lockSourceJson),
  inventory: JSON.parse(inventorySource),
  packageJson: JSON.parse(packageSource),
  lockSource: pnpmLockSource,
  ciSource,
  deploySource
};

function mutate(object, mutation) {
  const clone = structuredClone(object);
  if (!mutation) return clone;
  const parts = mutation.path.split('.');
  const key = parts.pop();
  const parent = parts.reduce((value, part) => value[part], clone);
  if (mutation.operation === 'pop') parent[key].pop();
  else parent[key] = mutation.value;
  return clone;
}

const fixture = JSON.parse(fixtureSource);
assert.equal(fixture.schema_version, 'p5-m5.8-operations-fixtures/v1');
for (const scenario of fixture.cases) {
  test(`M5.8 operations fixture: ${scenario.id}`, async () => {
    const input = { ...base, policy: mutate(base.policy, scenario.mutation) };
    if (scenario.expect === 'pass') await assert.doesNotReject(validateM58Operations(input));
    else await assert.rejects(validateM58Operations(input), new RegExp(scenario.message, 'u'));
  });
}

test('stale generated license inventory is rejected', async () => {
  const inventory = structuredClone(base.inventory);
  inventory.lockfile_sha256 = '0'.repeat(64);
  await assert.rejects(validateM58Operations({ ...base, inventory }), /software inventory lock hash drift/u);
});

test('unapproved installed license expression is rejected', async () => {
  const inventory = structuredClone(base.inventory);
  inventory.packages[0].license = 'UNDECLARED';
  await assert.rejects(validateM58Operations({ ...base, inventory }), /unapproved license expression/u);
});
