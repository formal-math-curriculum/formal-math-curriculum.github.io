import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => readFile(path, 'utf8');

test('MAT-377 freezes the exact integrated core and keeps audit selection deployment-inert', async () => {
  const candidate = JSON.parse(await read('validation/m5-7-candidate-v1.json'));
  const current = JSON.parse(await read('validation/m5-7-current-v1.json'));
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
  const [script, documentation, workflow, pkg] = await Promise.all([
    read('scripts/validate-m5-7-integrated-candidate.mjs'),
    read('docs/architecture/m5-7-candidate-validation.md'),
    read('.github/workflows/ci.yml'),
    read('package.json').then(JSON.parse)
  ]);
  assert.equal(pkg.scripts['validate:m5-7-candidate-v1'], 'node scripts/validate-m5-7-integrated-candidate.mjs');
  assert.match(script, /FMC_REQUIRE_BROWSER/u);
  assert.match(script, /candidate validation diff escaped allowed evidence paths/u);
  assert.match(script, /92/u);
  assert.match(documentation, /Source presence is not execution evidence/u);
  assert.match(documentation, /does not repair a core defect in place/u);
  assert.match(workflow, /fetch-depth: 0/u);
});

test('MAT-394 versions every immutable audit disposition and keeps the candidate deployment-inert', async () => {
  const [candidate, remediation, current] = await Promise.all([
    read('validation/m5-7-candidate-v2.json').then(JSON.parse),
    read('validation/m5-7-remediation-v2.json').then(JSON.parse),
    read('validation/m5-7-current.json').then(JSON.parse)
  ]);
  assert.equal(candidate.schemaVersion, 'p5-m5.7-remediated-candidate/v2');
  assert.equal(candidate.auditSubject.commit, '4b7e4e989ae4297ef2f09549e678f731fccfc1e7');
  assert.equal(candidate.auditSubject.tree, '264f78b5fbea33272096aab4b08dc24417690cd7');
  assert.equal(candidate.requiredEvidence.totalAcceptanceRows, 121);
  assert.equal(candidate.operationalGovernanceDecision.m5_8ReadyAfterSuccessfulRequiredCi, true);
  assert.equal(candidate.deploymentAuthorized, false);
  assert.equal(remediation.immutableAudit.preserved, true);
  assert.deepEqual(remediation.findingDispositions.map(({ id, disposition }) => ({ id, disposition })), [
    { id: 'M57-AUD-M01', disposition: 'remediated' },
    { id: 'M57-AUD-M02', disposition: 'remediated' },
    { id: 'M57-AUD-M03', disposition: 'remediated' },
    { id: 'M57-AUD-M04', disposition: 'remediated_by_versioned_policy' },
    { id: 'M57-AUD-M05', disposition: 'remediated' }
  ]);
  assert.deepEqual(remediation.unresolvedFindings, { Blocker: 0, Material: 0, Minor: 0 });
  assert.equal(current.candidateRecord, 'validation/m5-7-candidate-v2.json');
  assert.equal(current.deploymentAuthorized, false);
});

test('MAT-394 executes graded relevance, isolated scale and semantic reproducibility gates', async () => {
  const [browser, relevance, scale, gate, documentation, pkg, deploy] = await Promise.all([
    read('scripts/validate-m5-7-remediation-browser.mjs'),
    read('src/lib/m5-7-relevance.mjs'),
    read('scripts/validate-m5-7-scale-artifact.mjs'),
    read('scripts/validate-m5-7-remediated-candidate.mjs'),
    read('docs/architecture/m5-7-remediation-v2.md'),
    read('package.json').then(JSON.parse),
    read('.github/workflows/deploy-pages.yml')
  ]);
  assert.equal(pkg.scripts['validate:m5-7-candidate'], 'node scripts/validate-m5-7-remediated-candidate.mjs');
  assert.equal(pkg.scripts['build:astro'], 'node scripts/clean-build-output.mjs && ASTRO_TELEMETRY_DISABLED=1 astro build');
  assert.match(pkg.scripts.build, /build:m5-7-scale[\s\S]*test:m5-7-remediation-baseline[\s\S]*build:search[\s\S]*test:m5-7-remediation-final[\s\S]*validate:m5-7-scale-artifact[\s\S]*validate:m5-7-candidate/u);
  for (let id = 1; id <= 20; id += 1) assert.match(relevance, new RegExp(`G${String(id).padStart(2, '0')}`));
  assert.match(browser, /Network\.emulateNetworkConditions/u);
  assert.match(browser, /Emulation\.setCPUThrottlingRate/u);
  assert.match(browser, /meanNdcgAt5/u);
  assert.match(scale, /12 \* 1024 \* 1024/u);
  assert.match(scale, /8 \* 1024 \* 1024/u);
  assert.match(gate, /totalAcceptanceRows/u);
  assert.match(gate, /clean-build governed search semantics changed/u);
  assert.match(gate, /successorMode = inputLock\.lock_version === 'p5-m5\.8-site-input-lock\/v1'/u);
  assert.match(gate, /M5\.8 successor changed the governed M5\.6 publication bytes/u);
  assert.match(gate, /M5\.8 successor relation regeneration is nondeterministic/u);
  assert.match(documentation, /P5-M5\.7-PAGEFIND-REPRODUCIBILITY-v2/u);
  assert.match(documentation, /does not authorize public deployment/i);
  assert.match(deploy, /fetch-depth: 0/u);
});

test('M5.7 candidate selector cannot authorize the existing production release gate', async () => {
  const [release, pipeline] = await Promise.all([
    read('scripts/prepare-release.mjs'),
    read('scripts/validate-pipeline.mjs')
  ]);
  assert.doesNotMatch(release, /m5-7-current/u);
  assert.match(pipeline, /prepare-release\.mjs validation\/m5-6-current\.json/u);
});
