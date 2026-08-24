import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateM510Release } from '../scripts/validate-m5-10-release.mjs';

const sourceRoot = new URL('../', import.meta.url);

async function fixture(mutator = value => value) {
  const root = await mkdtemp(join(tmpdir(), 'm5-10-authority-'));
  await mkdir(join(root, 'validation'), { recursive: true });
  const selector = JSON.parse(await readFile(new URL('validation/m5-10-current.json', sourceRoot), 'utf8'));
  const record = JSON.parse(await readFile(new URL('validation/m5-10-release-v1.json', sourceRoot), 'utf8'));
  await writeFile(join(root, 'validation', 'm5-10-current.json'), JSON.stringify(selector));
  await writeFile(join(root, 'validation', 'm5-10-release-v1.json'), JSON.stringify(mutator(record)));
  return root;
}

test('M5.10 accepts the exact frozen release tuple without relabeling A10', async () => {
  const root = await fixture();
  const result = await validateM510Release({ root, verifyGitBoundary: false });
  assert.equal(result.record.release.tag, 'p5-web-v0.1.0');
  assert.equal(result.record.acceptedAccessibilityRisk.status, 'blocked_manual_required');
  assert.equal(result.record.acceptedAccessibilityRisk.retainedAsPass, false);
  assert.equal(result.record.claims.wcagConformance, false);
});

test('M5.10 rejects stale, mixed and mandatory-failure release records', async () => {
  const stale = await fixture(record => ({ ...record, authority: { ...record.authority, contentRevision: '0'.repeat(40) } }));
  await assert.rejects(() => validateM510Release({ root: stale, verifyGitBoundary: false }), /contentRevision/u);
  const mixed = await fixture(record => ({ ...record, authority: { ...record.authority, applicationCandidateTree: '0'.repeat(40) } }));
  await assert.rejects(() => validateM510Release({ root: mixed, verifyGitBoundary: false }), /applicationCandidateTree/u);
  const failed = await fixture(record => ({ ...record, unresolvedFindings: { ...record.unresolvedFindings, Material: 1 } }));
  await assert.rejects(() => validateM510Release({ root: failed, verifyGitBoundary: false }), /mandatory findings/u);
});

test('M5.10 preserves the accepted accessibility risk as an explicit non-pass', async () => {
  const relabeled = await fixture(record => ({
    ...record,
    acceptedAccessibilityRisk: { ...record.acceptedAccessibilityRisk, status: 'pass', retainedAsPass: true }
  }));
  await assert.rejects(() => validateM510Release({ root: relabeled, verifyGitBoundary: false }), /A10 must remain explicitly unexecuted/u);
  const claim = await fixture(record => ({ ...record, claims: { ...record.claims, wcagConformance: true } }));
  await assert.rejects(() => validateM510Release({ root: claim, verifyGitBoundary: false }), /accessibility conformance claim drift/u);
});

test('M5.10 selector is fail-closed for incompatible, unauthorized and traversal states', async () => {
  const root = await fixture();
  const selectorPath = join(root, 'validation', 'm5-10-current.json');
  const selector = JSON.parse(await readFile(selectorPath, 'utf8'));
  await writeFile(selectorPath, JSON.stringify({ ...selector, deploymentAuthorized: false }));
  await assert.rejects(() => validateM510Release({ root, verifyGitBoundary: false }), /does not authorize/u);
  await writeFile(selectorPath, JSON.stringify({ ...selector, schemaVersion: 'future/v9' }));
  await assert.rejects(() => validateM510Release({ root, verifyGitBoundary: false }), /selector schema/u);
  await writeFile(selectorPath, JSON.stringify({ ...selector, releaseRecord: '../outside.json' }));
  await assert.rejects(() => validateM510Release({ root, verifyGitBoundary: false }), /unexpected record|remain under validation/u);
});
