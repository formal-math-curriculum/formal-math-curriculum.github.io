import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareRelease } from '../scripts/prepare-release.mjs';

const sourceRevision = '1111111111111111111111111111111111111111';

async function fixture(deploymentAuthorized) {
  const root = await mkdtemp(join(tmpdir(), 'm5-10-release-gate-'));
  await mkdir(join(root, 'validation'), { recursive: true });
  await mkdir(join(root, 'dist', 'validation', 'm5-5', 'collision'), { recursive: true });
  await mkdir(join(root, 'dist', 'validation', 'm5-6'), { recursive: true });
  await writeFile(join(root, 'validation', 'm5-10-current.json'), JSON.stringify({
    schemaVersion: 'p5-current-baseline-selector/v1',
    releaseRecord: 'validation/record.json'
  }));
  await writeFile(join(root, 'validation', 'record.json'), JSON.stringify({
    schemaVersion: 'p5-m5.10-public-release/v1',
    deploymentAuthorized,
    release: {
      version: '0.1.0',
      tag: 'p5-web-v0.1.0',
      canonicalRoot: 'https://formal-math-curriculum.github.io/',
      repository: 'formal-math-curriculum/formal-math-curriculum.github.io'
    },
    authority: {
      applicationCandidateRevision: 'cc137e0f47e324acbb8b864212a1dd4387c54d23',
      applicationCandidateTree: '99033aa8185141b7b5a5346ea70533086af2eb24',
      contentRevision: '3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828',
      contentTree: '59d0e0c49851b534bf528e46dd6ce74f46173c6c',
      leanRevision: '3f1a315f438af37a327eaf8b9b9c1dbc6f409394',
      leanCoreRevision: 'd8b18978322de05a8f3dba51ef03cf5461676c17',
      mathlibRevision: 'db584cd6d46c92f209a44c0f1c829460d327499d'
    },
    qualification: { workflowRunId: 32753029555 },
    acceptedAccessibilityRisk: {
      row: 'A10', status: 'blocked_manual_required', conformanceClaimAuthorized: false
    },
    unresolvedFindings: { Blocker: 0, Material: 0 }
  }));
  await writeFile(join(root, 'dist', 'validation', 'm5-5', 'index.html'), 'synthetic');
  await writeFile(join(root, 'dist', 'validation', 'm5-5', 'collision', 'index.html'), 'synthetic');
  await writeFile(join(root, 'dist', 'validation', 'm5-6', 'index.html'), 'synthetic');
  await writeFile(
    join(root, 'dist', 'sitemap-0.xml'),
    '<urlset><url><loc>https://formal-math-curriculum.github.io/</loc></url><url><loc>https://formal-math-curriculum.github.io/validation/m5-5/</loc></url><url><loc>https://formal-math-curriculum.github.io/validation/m5-5/collision/</loc></url><url><loc>https://formal-math-curriculum.github.io/validation/m5-6/</loc></url></urlset>'
  );
  return root;
}

test('M5.10 deployment fails closed when the release record denies authorization', async () => {
  const root = await fixture(false);
  await assert.rejects(() => prepareRelease({ root, sourceRevision }), /deployment is not authorized/u);
  assert.equal(await readFile(join(root, 'dist', 'validation', 'm5-5', 'index.html'), 'utf8'), 'synthetic');
});

test('M5.10 authorized release removes synthetic routes/evidence and records exact provenance', async () => {
  const root = await fixture(true);
  const provenance = await prepareRelease({ root, sourceRevision });
  const sitemap = await readFile(join(root, 'dist', 'sitemap-0.xml'), 'utf8');
  await assert.rejects(() => readFile(join(root, 'dist', 'validation', 'm5-5', 'index.html')), /ENOENT/u);
  assert.doesNotMatch(sitemap, /\/validation\//u);
  assert.deepEqual(provenance.syntheticRoutesRemoved, ['/validation/m5-5/', '/validation/m5-5/collision/', '/validation/m5-6/']);
  assert.equal(provenance.sourceRevision, sourceRevision);
  assert.equal(provenance.acceptedAccessibilityRisk.status, 'blocked_manual_required');
  assert.equal(provenance.acceptedAccessibilityRisk.conformanceClaimAuthorized, false);
});

test('M5.10 release selector and record cannot escape validation authority', async () => {
  const root = await fixture(true);
  await writeFile(join(root, 'validation', 'm5-10-current.json'), JSON.stringify({
    schemaVersion: 'p5-current-baseline-selector/v1',
    releaseRecord: '../outside.json'
  }));
  await assert.rejects(() => prepareRelease({ root, sourceRevision }), /release record must remain under validation/u);
});

test('M5.10 release preparation requires an exact runtime source revision', async () => {
  const root = await fixture(true);
  await assert.rejects(() => prepareRelease({ root }), /exact FMC_SOURCE_REVISION/u);
});
