import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runM58Dogfood, validateBrowserEvidence } from '../scripts/run-m5-8-dogfood.mjs';

const candidate = JSON.parse(await readFile('validation/m5-8-dogfood-candidate-v2.json', 'utf8'));
const current = JSON.parse(await readFile('validation/m5-8-current.json', 'utf8'));
const matrix = JSON.parse(await readFile('validation/m5-8-dogfood-matrix-v2.json', 'utf8'));
const report = await runM58Dogfood({ write: false, requireBrowser: false });

test('MAT-396 remediated dogfood executes all durable cases and negative controls locally', () => {
  assert.equal(report.schemaVersion, 'p5-m5.8-dogfood-report/v2');
  assert.equal(report.status, 'local_structural_evidence_only');
  assert.deepEqual(report.execution, {
    total: 20,
    passed: 20,
    failed: 0,
    negativeControls: 12,
    hostedBrowserAcceptanceRows: 0
  });
  assert.ok(report.results.every(result => result.status === 'pass'));
  assert.deepEqual(report.results.filter(result => result.negativeControl).map(result => result.observed), Array(12).fill('reject'));
});

test('dogfood covers valid, invalid, missing, stale, incompatible, accessibility and boundary evidence', () => {
  assert.deepEqual(matrix.cases.map(entry => entry.id), Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`));
  for (const token of ['fresh contributor', 'stale', 'missing', 'incompatible', 'accessibility', 'boundary']) {
    assert.ok(matrix.cases.some(entry => entry.requirement.toLowerCase().includes(token)), `missing dogfood token: ${token}`);
  }
  assert.equal(report.results.find(result => result.id === 'D04').observed, 'reject');
  assert.match(report.results.find(result => result.id === 'D04').errors.join('\n'), /missing exact fart_id/u);
  assert.equal(report.results.find(result => result.id === 'D15').observed, 'reject');
  assert.match(report.results.find(result => result.id === 'D15').errors.join('\n'), /deployment is not authorized/u);
  assert.equal(report.results.find(result => result.id === 'D19').observed, 'reject');
  assert.match(report.results.find(result => result.id === 'D19').errors.join('\n'), /source revision mismatch/u);
  assert.equal(report.results.find(result => result.id === 'D20').observed, 'reject');
  assert.match(report.results.find(result => result.id === 'D20').errors.join('\n'), /schema is incompatible/u);
});

test('candidate, selector and audit handoff remain immutable and deployment-inert', () => {
  assert.equal(candidate.status, 'candidate_requires_required_ci_and_remediation_disposition');
  assert.equal(candidate.requiredEvidence.hostedBrowserAcceptanceRows, 121);
  assert.deepEqual(candidate.auditDisposition.materialFindings, ['MAT385-F01', 'MAT385-F02']);
  assert.equal(candidate.handoff.nextIssue, 'MAT-338');
  assert.equal(candidate.handoff.mutationPolicy, 'this_candidate_requires_new_version_after_qualification');
  assert.equal(candidate.deploymentAuthorized, false);
  assert.equal(current.candidateRecord, 'validation/m5-8-dogfood-candidate-v2.json');
  assert.equal(current.deploymentAuthorized, false);
  assert.equal(report.boundaries.deploymentAuthorized, false);
  assert.equal(report.boundaries.publicReleaseAuthorized, false);
  assert.equal(report.boundaries.translationCoverageClaimed, false);
  assert.equal(report.boundaries.externalTaxonomyCoverageClaimed, false);
});

test('fresh-process evidence is unique, procedural-only and deployment-inert', () => {
  const fresh = report.results.find(result => result.id === 'D01');
  assert.equal(fresh.status, 'pass');
  assert.equal(fresh.subject.processIsolation, 'separate_node_process');
  assert.equal(fresh.subject.organizationalIndependenceClaimed, false);
  assert.equal(fresh.subject.proceduralRoleSeparation, true);
  assert.match(fresh.subject.changeId, /^fresh-process-/u);
  assert.match(fresh.subject.packetSha256, /^[0-9a-f]{64}$/u);
});

test('hosted-browser evidence rejects stale, incompatible and incomplete reports', () => {
  const sourceRevision = 'a'.repeat(40);
  const valid = {
    schemaVersion: 'p5-m5.7-remediated-candidate-artifact/v2',
    candidate: { sourceRevision, deploymentAuthorized: false },
    execution: { requiredBrowser: true, legacyBrowserRows: 92, remediationBrowserRows: 29, totalAcceptanceRows: 121 },
    operationalGovernanceDecision: { m5_8Ready: true, successorMode: true },
    deploymentAuthorized: false
  };
  assert.deepEqual(validateBrowserEvidence(valid, sourceRevision), []);
  assert.match(validateBrowserEvidence({ ...valid, schemaVersion: 'p5-m5.7-remediated-candidate-artifact/v999' }, sourceRevision).join('\n'), /schema is incompatible/u);
  assert.match(validateBrowserEvidence({ ...valid, candidate: { ...valid.candidate, sourceRevision: '0'.repeat(40) } }, sourceRevision).join('\n'), /source revision mismatch/u);
  assert.match(validateBrowserEvidence({ ...valid, execution: { ...valid.execution, remediationBrowserRows: 28 } }, sourceRevision).join('\n'), /92\+29=121/u);
});

test('browser dogfood is structurally deferred locally rather than overclaimed', () => {
  const browser = report.results.find(result => result.id === 'D18');
  assert.equal(browser.status, 'pass');
  assert.equal(browser.subject.structurallyDeferred, true);
  assert.equal(report.exactSubject.browserRequired, false);
});
