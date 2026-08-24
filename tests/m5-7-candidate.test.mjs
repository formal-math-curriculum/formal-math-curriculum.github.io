import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => readFile(path, 'utf8');

test('MAT-377 freezes the exact integrated core and keeps audit selection deployment-inert', async () => {
  const candidate = JSON.parse(await read('validation/m5-7-candidate-v1.json'));
  const current = JSON.parse(await read('validation/m5-7-current.json'));
  assert.equal(candidate.schemaVersion, 'p5-m5.7-integrated-candidate/v1');
  assert.equal(candidate.issue, 'MAT-377');
  assert.equal(candidate.coreSubject.commit, '6adab87f4feaba4c957df189936fbe0dd1e726b8');
  assert.equal(candidate.coreSubject.tree, '01e0277a7996d39cc193cc603cc20f8a94946b8d');
  assert.equal(candidate.requiredEvidence.totalBrowserRows, 92);
  assert.equal(candidate.deploymentAuthorized, false);
  assert.equal(candidate.nextIssue, 'MAT-388');
  assert.equal(current.candidateRecord, 'validation/m5-7-candidate-v1.json');
  assert.equal(current.deploymentAuthorized, false);
});

test('MAT-377 candidate preserves exact model, scale and no-coverage boundaries', async () => {
  const candidate = JSON.parse(await read('validation/m5-7-candidate-v1.json'));
  assert.equal(candidate.models.searchFingerprint, 'sha256:a686c3c5b0c90eb643397c8db88ce23b4e1c719ce45cd1f705bc43a66e2578a5');
  assert.equal(candidate.models.relationFingerprint, 'sha256:5431b20b93dc0045933a74e92c9b1f9fbd74412be2bb556bd46c33f57cca67e8');
  assert.equal(candidate.scale.searchDocuments, 2_000);
  assert.equal(candidate.scale.relationDocuments, 2_000);
  assert.equal(candidate.scale.generatedInProductionArtifact, false);
  assert.equal(candidate.governed.portugueseRoutes, 0);
  assert.equal(candidate.governed.externalPayloads, 0);
});

test('integrated candidate gate requires executed reports and forbids core-product mutation', async () => {
  const [script, documentation, pkg] = await Promise.all([
    read('scripts/validate-m5-7-integrated-candidate.mjs'),
    read('docs/architecture/m5-7-candidate-validation.md'),
    read('package.json').then(JSON.parse)
  ]);
  assert.equal(pkg.scripts['validate:m5-7-candidate'], 'node scripts/validate-m5-7-integrated-candidate.mjs');
  assert.match(pkg.scripts.build, /validate:m5-6-artifact && pnpm run validate:m5-7-candidate && pnpm run verify:artifact/u);
  assert.match(script, /FMC_REQUIRE_BROWSER/u);
  assert.match(script, /candidate validation diff escaped allowed evidence paths/u);
  assert.match(script, /92/u);
  assert.match(documentation, /Source presence is not execution evidence/u);
  assert.match(documentation, /does not repair a core defect in place/u);
});

test('M5.7 candidate selector cannot authorize the existing production release gate', async () => {
  const [release, pipeline] = await Promise.all([
    read('scripts/prepare-release.mjs'),
    read('scripts/validate-pipeline.mjs')
  ]);
  assert.doesNotMatch(release, /m5-7-current/u);
  assert.match(pipeline, /prepare-release\.mjs validation\/m5-6-current\.json/u);
});
