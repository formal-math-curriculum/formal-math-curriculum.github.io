import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runM58Dogfood } from '../scripts/run-m5-8-dogfood.mjs';

const candidate = JSON.parse(await readFile('validation/m5-8-dogfood-candidate-v1.json', 'utf8'));
const current = JSON.parse(await readFile('validation/m5-8-current.json', 'utf8'));
const matrix = JSON.parse(await readFile('validation/m5-8-dogfood-matrix-v1.json', 'utf8'));
const report = await runM58Dogfood({ write: false, requireBrowser: false });

test('MAT-379 dogfood executes all durable cases and negative controls locally', () => {
  assert.equal(report.schemaVersion, 'p5-m5.8-dogfood-report/v1');
  assert.equal(report.status, 'local_structural_evidence_only');
  assert.deepEqual(report.execution, {
    total: 18,
    passed: 18,
    failed: 0,
    negativeControls: 10,
    hostedBrowserAcceptanceRows: 0
  });
  assert.ok(report.results.every(result => result.status === 'pass'));
  assert.deepEqual(report.results.filter(result => result.negativeControl).map(result => result.observed), Array(10).fill('reject'));
});

test('dogfood covers valid, invalid, missing, stale, incompatible, accessibility and boundary evidence', () => {
  assert.deepEqual(matrix.cases.map(entry => entry.id), Array.from({ length: 18 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`));
  for (const token of ['fresh contributor', 'stale', 'missing', 'incompatible', 'accessibility', 'boundary']) {
    assert.ok(matrix.cases.some(entry => entry.requirement.toLowerCase().includes(token)), `missing dogfood token: ${token}`);
  }
  assert.equal(report.results.find(result => result.id === 'D04').observed, 'reject');
  assert.match(report.results.find(result => result.id === 'D04').errors.join('\n'), /missing exact fart_id/u);
  assert.equal(report.results.find(result => result.id === 'D15').observed, 'reject');
  assert.match(report.results.find(result => result.id === 'D15').errors.join('\n'), /deployment is not authorized/u);
});

test('candidate, selector and audit handoff remain immutable and deployment-inert', () => {
  assert.equal(candidate.status, 'candidate_requires_required_ci');
  assert.equal(candidate.requiredEvidence.hostedBrowserAcceptanceRows, 121);
  assert.equal(candidate.auditHandoff.nextIssue, 'MAT-385');
  assert.equal(candidate.auditHandoff.remediationIssue, 'MAT-396');
  assert.equal(candidate.auditHandoff.mutationPolicy, 'candidate_and_executed_evidence_are_immutable_during_audit');
  assert.equal(candidate.deploymentAuthorized, false);
  assert.equal(current.candidateRecord, 'validation/m5-8-dogfood-candidate-v1.json');
  assert.equal(current.deploymentAuthorized, false);
  assert.equal(report.boundaries.deploymentAuthorized, false);
  assert.equal(report.boundaries.publicReleaseAuthorized, false);
  assert.equal(report.boundaries.translationCoverageClaimed, false);
  assert.equal(report.boundaries.externalTaxonomyCoverageClaimed, false);
});

test('browser dogfood is structurally deferred locally rather than overclaimed', () => {
  const browser = report.results.find(result => result.id === 'D18');
  assert.equal(browser.status, 'pass');
  assert.equal(browser.subject.structurallyDeferred, true);
  assert.equal(report.exactSubject.browserRequired, false);
});
