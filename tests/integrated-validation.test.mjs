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

test('one noindex fixture mounts preferences, representation and outline together without production claims', async () => {
  const page = await read('src/pages/validation/m5-5.astro');
  assert.equal((page.match(/<PreferenceControls \/>/g) ?? []).length, 1);
  assert.equal((page.match(/<MathematicalBlock /g) ?? []).length, 1);
  assert.equal((page.match(/<OutlineNavigator /g) ?? []).length, 1);
  assert.match(page, /<PreferenceProvider \/>/);
  assert.match(page, /noindex, nofollow/);
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
  assert.match(pkg.scripts.build, /build:astro && pnpm run test:browser && pnpm run build:search && pnpm run verify:artifact/);
  assert.match(workflow, /FMC_REQUIRE_BROWSER: '1'/);
  assert.match(workflow, /FMC_SOURCE_REVISION: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(workflow, /FMC_SKIP_BROWSER/);
  assert.doesNotMatch(workflow, /deploy-pages|pages: write|id-token: write/);
});

test('browser program has no silent CI skip and owns B01-B23 plus exact evidence outputs', async () => {
  const script = await read('scripts/validate-m5-5-browser.mjs');
  for (let id = 1; id <= 23; id += 1) {
    assert.match(script, new RegExp(`['\"]B${String(id).padStart(2, '0')}['\"]`));
  }
  assert.match(script, /FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1/);
  assert.match(script, /requires an identifiable Chrome executable/);
  assert.match(script, /p5-m5\.5-browser-qualification\/v1/);
  assert.match(script, /locator\('fmc-mathematical-block'\)/);
  assert.match(script, /locator\('fmc-outline-navigator'\)/);
  assert.match(script, /ariaSnapshot\(\)/);
  assert.match(script, /forcedColors: 'active'/);
  assert.match(script, /javaScriptEnabled: false/);
  assert.match(script, /viewport: \{ width: 320, height: 800 \}/);
  assert.match(script, /m5-5-report\.json/);
  assert.match(script, /m5-5-aria\.txt/);
  assert.match(script, /blockerFailures = failed\.filter/);
  assert.match(script, /coherent-candidate-with-known-findings/);
  assert.match(script, /blockerFailures\.length > 0/);
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
