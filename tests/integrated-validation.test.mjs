import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('candidate manifest freezes exact entry subjects, runtime and synthetic limitations', async () => {
  const manifest = JSON.parse(await read('validation/m5-5-candidate.json'));
  assert.equal(manifest.schemaVersion, 'p5-m5.5-candidate-qualification/v1');
  assert.equal(manifest.entryWebsiteRevision, '37346c7e77f80da6cbce4547c24e55de2c704f57');
  assert.equal(manifest.contentRevision, 'fb3df63b27ae54d4dc237a421dd241d4c59330e4');
  assert.equal(manifest.runtime.playwrightCore, '1.62.1');
  assert.equal(manifest.fixtureClassification, 'synthetic-integration-only');
  assert.equal(manifest.deploymentAuthorized, false);
  assert.deepEqual(manifest.knownAuditFindings.map(({ id, severity, remediationInMat375 }) => ({ id, severity, remediationInMat375 })), [
    { id: 'B18', severity: 'Material', remediationInMat375: false }
  ]);
  assert.equal(manifest.requiredEvidence.screenshots.length, 7);
  assert.deepEqual(manifest.requiredFrozenRows, {
    design: 'D01-D16',
    representation: 'R01-R16',
    outline: 'N01-N26',
    crossComponent: 'X01-X16'
  });
});

test('MAT-399 v2 record versions the audit dispositions and owns one-to-one D/R/N/X evidence', async () => {
  const manifest = JSON.parse(await read('validation/m5-5-requalification-v2.json'));
  const selector = JSON.parse(await read('validation/m5-5-current.json'));
  assert.equal(manifest.schemaVersion, 'p5-m5.5-requalification/v2');
  assert.equal(manifest.immutableAudit.mergeCommit, 'a071e58473646f00ea163b3f745c752228a0a8a2');
  assert.equal(manifest.runtime.runnerLabel, 'ubuntu-24.04');
  assert.equal(manifest.deploymentAuthorized, false);
  assert.deepEqual(manifest.unresolvedFindings, { Blocker: 0, Material: 0, Minor: 0 });
  assert.equal(Object.keys(manifest.evidenceMatrix.design).length, 16);
  assert.equal(Object.keys(manifest.evidenceMatrix.representation).length, 16);
  assert.equal(Object.keys(manifest.evidenceMatrix.outline).length, 26);
  assert.equal(Object.keys(manifest.evidenceMatrix.crossComponent).length, 16);
  assert.equal(manifest.findingDispositions.length, 7);
  assert.deepEqual(manifest.findingDispositions.slice(0, 4).map(({ id, disposition }) => ({ id, disposition })), [
    { id: 'F01', disposition: 'remediated' },
    { id: 'F02', disposition: 'remediated' },
    { id: 'F03', disposition: 'remediated' },
    { id: 'F04', disposition: 'remediated' }
  ]);
  assert.equal(selector.releaseRecord, 'validation/m5-5-requalification-v2.json');
  assert.equal(selector.deploymentAuthorized, false);
});

test('one noindex fixture mounts preferences, representation and outline together without production claims', async () => {
  const page = await read('src/pages/validation/m5-5.astro');
  assert.equal((page.match(/<PreferenceControls \/>/g) ?? []).length, 1);
  assert.equal((page.match(/<MathematicalBlock /g) ?? []).length, 1);
  assert.equal((page.match(/<OutlineNavigator /g) ?? []).length, 1);
  assert.match(page, /<PreferenceProvider \/>/);
  assert.match(page, /noindex, nofollow/);
  assert.doesNotMatch(page, /rel="canonical"/);
  assert.match(page, /data-fmc-validation-fixture="synthetic"/);
  assert.match(page, /makes no production content/);
  assert.match(page, /renderer: 'mathml'/);
  assert.match(page, /<math[\s\S]*slot="rendered"/);
  assert.match(page, /deliberately long source for local-overflow qualification/);
  assert.doesNotMatch(page, /verified by Lean|WCAG conformant|production mapping/i);
});

test('browser validation is pinned, required in CI and runs before search/artifact verification', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const workflow = await read('.github/workflows/ci.yml');
  assert.equal(pkg.devDependencies['playwright-core'], '1.62.1');
  assert.equal(pkg.scripts['test:browser'], 'node scripts/validate-m5-5-browser.mjs');
  assert.match(pkg.scripts.build, /build:astro && pnpm run test:browser && pnpm run build:search && pnpm run test:m5-7-browser && pnpm run test:m5-7-relations-browser && pnpm run test:m5-6-browser[\s\S]*validate:m5-7-artifact[\s\S]*validate:m5-7-relations-artifact[\s\S]*validate:m5-6-artifact && pnpm run validate:m5-7-candidate && pnpm run validate:m5-8-dogfood && pnpm run verify:artifact/);
  assert.match(workflow, /FMC_REQUIRE_BROWSER: '1'/);
  assert.match(workflow, /FMC_SOURCE_REVISION: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /FMC_RUNNER_IMAGE_LABEL: ubuntu-24\.04/);
  assert.doesNotMatch(workflow, /FMC_SKIP_BROWSER/);
  assert.doesNotMatch(workflow, /deploy-pages|pages: write|id-token: write/);
});

test('v2 browser program has no silent CI skip and owns B01-B30 plus versioned evidence outputs', async () => {
  const script = await read('scripts/validate-m5-5-browser.mjs');
  for (let id = 1; id <= 30; id += 1) {
    assert.match(script, new RegExp(`['\"]B${String(id).padStart(2, '0')}['\"]`));
  }
  assert.match(script, /FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1/);
  assert.match(script, /requires an identifiable Chrome executable/);
  assert.match(script, /p5-m5\.5-requalification-browser\/v2/);
  assert.match(script, /locator\('fmc-mathematical-block'\)/);
  assert.match(script, /locator\('fmc-outline-navigator'\)/);
  assert.match(script, /ariaSnapshot\(\)/);
  assert.match(script, /forcedColors: 'active'/);
  assert.match(script, /javaScriptEnabled: false/);
  assert.match(script, /viewport: \{ width: 320, height: 800 \}/);
  assert.match(script, /m5-5-requalification-v2-report\.json/);
  assert.match(script, /m5-5-requalification-v2-aria\.txt/);
  assert.match(script, /blockerFailures = failed\.filter/);
  assert.match(script, /blockerFailures\.length > 0/);
  assert.match(script, /v2 requalification has \$\{failed\.length\} unresolved non-Blocker failure/);
});

test('browser dependency lock is exact and contains one dependency-free playwright-core snapshot', async () => {
  const lock = await read('pnpm-lock.yaml');
  assert.match(lock, /playwright-core:\n\s+specifier: 1\.62\.1\n\s+version: 1\.62\.1/);
  assert.match(lock, /playwright-core@1\.62\.1:/);
  assert.match(lock, /sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi\/rhDMjXGqHewDZ68nYZVw==/);
});

test('qualification documentation preserves the audit and release interpretation boundary', async () => {
  const documentation = await read('docs/architecture/m5-5-candidate-validation.md');
  assert.match(documentation, /MAT-386/);
  assert.match(documentation, /not production curriculum/i);
  assert.match(documentation, /not self-approved golden images/i);
  assert.match(documentation, /cross-engine behavior;[\s\S]*manual screen-reader usability/i);
  assert.match(documentation, /B18[\s\S]*forward `Tab` reaches `BODY`/);
  assert.match(documentation, /Material[\s\S]*does not erase an otherwise reproducible candidate/);
  assert.match(documentation, /must not be interpreted as a public curriculum route/i);
});

test('MAT-398 release workflow advances to the corrected selector before Pages upload', async () => {
  const workflow = await read('.github/workflows/deploy-pages.yml');
  const gate = await read('scripts/prepare-release.mjs');
  const documentation = await read('docs/architecture/m5-6-requalification-v2.md');
  assert.match(workflow, /prepare-release\.mjs validation\/m5-6-current\.json/);
  assert.ok(workflow.indexOf('prepare-release.mjs') < workflow.indexOf('actions/upload-pages-artifact'));
  assert.match(gate, /deploymentAuthorized !== true/);
  assert.match(gate, /unresolvedFindings\?\.Blocker !== 0/);
  assert.match(gate, /validation.+m5-6/u);
  assert.match(documentation, /deploymentAuthorized=false/);
  assert.match(documentation, /does not authorize public deployment/i);
});

test('MAT-398 versions all immutable audit dispositions and makes only a bounded M5.7 readiness decision', async () => {
  const record = JSON.parse(await read('validation/m5-6-requalification-v2.json'));
  const selector = JSON.parse(await read('validation/m5-6-current.json'));
  assert.equal(record.schemaVersion, 'p5-m5.6-requalification/v2');
  assert.equal(record.immutableAudit.linearDocumentId, 'cecc72c7-49de-4c24-8ed9-5b0b22a58a31');
  assert.equal(record.immutableAudit.preserved, true);
  assert.deepEqual(record.findingDispositions.map(({ id, severity, disposition }) => ({ id, severity, disposition })), [
    { id: 'A01', severity: 'Blocker', disposition: 'remediated' },
    { id: 'A02', severity: 'Material', disposition: 'remediated' },
    { id: 'A03', severity: 'Material', disposition: 'remediated' },
    { id: 'A04', severity: 'Material', disposition: 'remediated' },
    { id: 'A05', severity: 'Material', disposition: 'remediated' },
    { id: 'A06', severity: 'Material', disposition: 'remediated' },
    { id: 'A07', severity: 'Material', disposition: 'remediated' },
    { id: 'A08', severity: 'Minor', disposition: 'remediated' }
  ]);
  assert.deepEqual(record.unresolvedFindings, { Blocker: 0, Material: 0, Minor: 0 });
  assert.equal(record.deploymentAuthorized, false);
  assert.equal(record.downstreamDecision.m5_7DiscoveryExpansionReady, true);
  assert.ok(record.downstreamDecision.excludedClaims.includes('public deployment authorization'));
  assert.equal(selector.releaseRecord, 'validation/m5-6-requalification-v2.json');
  assert.equal(selector.deploymentAuthorized, false);
});

test('M5.6 browser requalification owns all behavior, regression and performance rows without CI skip', async () => {
  const script = await read('scripts/validate-m5-6-browser.mjs');
  const pkg = JSON.parse(await read('package.json'));
  for (let id = 1; id <= 15; id += 1) assert.match(script, new RegExp(`['"]M${String(id).padStart(2, '0')}['"]`));
  for (let id = 1; id <= 5; id += 1) assert.match(script, new RegExp(`['"]P${String(id).padStart(2, '0')}['"]`));
  assert.equal(pkg.scripts['test:m5-6-browser'], 'node scripts/validate-m5-6-browser.mjs');
  assert.match(script, /p5-m5\.6-requalification-browser\/v2/);
  assert.match(script, /FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1/);
  assert.match(script, /requires an identifiable Chrome executable/);
  assert.match(script, /Network\.emulateNetworkConditions/);
  assert.match(script, /Emulation\.setCPUThrottlingRate/);
  assert.match(script, /documentBytes: 120_000/);
  assert.match(script, /totalBytes: 520_000/);
  assert.match(script, /failed\.length/);
});

test('M5.6 fixture and artifact validators enforce noindex, leakage and exact MathML derivation', async () => {
  const [page, artifact, config, search] = await Promise.all([
    read('src/pages/validation/m5-6.astro'),
    read('scripts/validate-m5-6-artifact.mjs'),
    read('astro.config.mjs'),
    read('scripts/build-search.mjs')
  ]);
  assert.match(page, /noindex, nofollow/);
  assert.match(page, /data-pagefind-ignore="all"/);
  assert.match(page, /makeValidationOutline/);
  assert.match(page, /Reserved OntoMathPRO/);
  assert.doesNotMatch(page, /<GlobalSearch/);
  assert.match(config, /startsWith\('\/validation\/'\)/);
  assert.match(artifact, /validation fixture identifier missing/);
  assert.match(artifact, /exact MathML annotation missing/);
  assert.match(artifact, /license state missing/);
  assert.match(artifact, /required M5\.6 browser report is missing/);
  assert.match(search, /rm\(output/);
  assert.match(search, /RAYON_NUM_THREADS: '1'/);
});

test('M5.7 static search owns 20 browser rows, required CI execution and a separate artifact gate', async () => {
  const [script, artifact, pkg, workflow] = await Promise.all([
    read('scripts/validate-m5-7-search-browser.mjs'),
    read('scripts/validate-m5-7-search-artifact.mjs'),
    read('package.json').then(JSON.parse),
    read('.github/workflows/ci.yml')
  ]);
  for (let id = 1; id <= 20; id += 1) assert.match(script, new RegExp(`['"]D${String(id).padStart(2, '0')}['"]`));
  assert.equal(pkg.scripts['test:m5-7-browser'], 'node scripts/validate-m5-7-search-browser.mjs');
  assert.equal(pkg.scripts['validate:m5-7-artifact'], 'node scripts/validate-m5-7-search-artifact.mjs');
  assert.match(script, /p5-m5\.7-static-search-browser\/v1/u);
  assert.match(script, /FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1/u);
  assert.match(script, /requires an identifiable Chrome executable/u);
  assert.match(script, /validationScaleDocumentsInProduction: 0/u);
  assert.match(artifact, /p5-m5\.7-static-search-artifact\/v1/u);
  assert.match(artifact, /generatedInProductionArtifact: false/u);
  assert.match(workflow, /FMC_REQUIRE_BROWSER: '1'/u);
  assert.doesNotMatch(workflow, /FMC_SKIP_BROWSER/u);
});

test('MAT-364 relation navigation owns typed systems, 22 browser rows and a separate artifact gate', async () => {
  const [script, artifact, record, documentation, pkg] = await Promise.all([
    read('scripts/validate-m5-7-relations-browser.mjs'),
    read('scripts/validate-m5-7-relations-artifact.mjs'),
    read('validation/m5-7-relations-implementation-v1.json').then(JSON.parse),
    read('docs/architecture/m5-7-relation-navigation.md'),
    read('package.json').then(JSON.parse)
  ]);
  for (let id = 1; id <= 14; id += 1) assert.match(script, new RegExp(`['"]R${String(id).padStart(2, '0')}['"]`));
  for (let id = 1; id <= 8; id += 1) assert.match(script, new RegExp(`['"]A${String(id).padStart(2, '0')}['"]`));
  assert.equal(pkg.scripts['test:m5-7-relations-browser'], 'node scripts/validate-m5-7-relations-browser.mjs');
  assert.equal(pkg.scripts['validate:m5-7-relations-artifact'], 'node scripts/validate-m5-7-relations-artifact.mjs');
  assert.match(script, /p5-m5\.7-relations-browser\/v1/u);
  assert.match(script, /FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1/u);
  assert.match(artifact, /p5-m5\.7-relations-artifact\/v1/u);
  assert.match(artifact, /generatedInProductionArtifact: false/u);
  assert.equal(record.schemaVersion, 'p5-m5.7-relations-implementation/v1');
  assert.equal(record.relationModel.systems.length, 8);
  assert.equal(record.scaleFixture.documents, 2000);
  assert.equal(record.deploymentAuthorized, false);
  assert.match(documentation, /Course order is not readiness authority/u);
  assert.match(documentation, /ordinary HTML lists and links/u);
});
