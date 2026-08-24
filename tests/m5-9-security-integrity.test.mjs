import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = readFileSync(resolve(root, 'scripts/validate-m5-9-security-integrity.mjs'), 'utf8');
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const guide = readFileSync(resolve(root, 'docs/qualification/m5-9-security-integrity.md'), 'utf8');

test('M5.9 security qualification is bound to the exact frozen candidate', () => {
  for (const value of [
    '01c09041aaed77db164a060e6a1aecc889ab861f',
    'b7da7512ff507b86eab2e5953af4d28c7f27318e',
    '3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828',
    '59d0e0c49851b534bf528e46dd6ce74f46173c6c',
    '3f1a315f438af37a327eaf8b9b9c1dbc6f409394',
    'db584cd6d46c92f209a44c0f1c829460d327499d',
    'f8c79c8d196952e4827c72d394039862935689b2e100f821697c41bad8cb1438'
  ]) assert.match(validator, new RegExp(value));
  assert.match(validator, /git\('diff', '--name-only'/);
  assert.match(validator, /unexpectedChanges\.length === 0/);
});

test('the harness executes every frozen S01-S15 row exactly once', () => {
  const ids = [...validator.matchAll(/await row\('(S\d{2})'/g)].map((match) => match[1]);
  assert.deepEqual(ids, Array.from({ length: 15 }, (_, index) => `S${String(index + 1).padStart(2, '0')}`));
});

test('fresh audit, browser privacy, SEO, provenance and license blockers are fail closed', () => {
  assert.match(validator, /pnpm.*audit/);
  assert.match(validator, /await import\('playwright-core'\)/);
  assert.match(validator, /externalRequests\.length === 0/);
  assert.match(validator, /cookies\.length === 0/);
  assert.match(validator, /robotsValid/);
  assert.match(validator, /artifactFindings\.length === 0/);
  assert.match(validator, /required_metadata_only_count_for_public_release/);
  assert.match(validator, /fallbackFindings\.length === 0/);
  assert.match(validator, /eligible_for_human_review/);
  assert.match(validator, /if \(failingRows\.length > 0\) process\.exitCode = 1/);
});

test('missing, stale, incompatible, corrupt, evolution and Pagefind controls are named', () => {
  for (const control of ['missing', 'stale', 'incompatible', 'corrupt', 'evolution', 'pagefind-missing']) {
    assert.match(validator, new RegExp(`id: '${control}'`));
  }
});

test('CI preserves failed qualification evidence and then enforces the outcome', () => {
  assert.match(workflow, /id:\s*m59-security-integrity/);
  assert.match(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /steps\.m59-security-integrity\.outcome == 'failure'/);
  assert.match(workflow, /FMC_REQUIRE_M59:\s*'1'/);
});

test('operator guide states non-deployment and non-remediation boundaries', () => {
  assert.match(guide, /does not[^.]*deploy/i);
  assert.match(guide, /does not remediate/i);
  assert.match(guide, /S01–S15/);
  assert.match(guide, /Deployment remains unauthorized until M5\.10/i);
});
