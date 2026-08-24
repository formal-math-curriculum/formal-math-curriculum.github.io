import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareRelease } from '../scripts/prepare-release.mjs';

async function fixture(deploymentAuthorized) {
  const root = await mkdtemp(join(tmpdir(), 'm5-6-release-gate-'));
  await mkdir(join(root, 'validation'), { recursive: true });
  await mkdir(join(root, 'dist', 'validation', 'm5-5', 'collision'), { recursive: true });
  await mkdir(join(root, 'dist', 'validation', 'm5-6'), { recursive: true });
  await writeFile(join(root, 'validation', 'm5-6-current.json'), JSON.stringify({
    schemaVersion: 'p5-current-baseline-selector/v1',
    releaseRecord: 'validation/record.json'
  }));
  await writeFile(join(root, 'validation', 'record.json'), JSON.stringify({
    schemaVersion: 'test-record/v1',
    deploymentAuthorized,
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

test('MAT-398 deployment fails closed while the current M5.6 record denies authorization', async () => {
  const root = await fixture(false);
  await assert.rejects(() => prepareRelease({ root }), /deployment is not authorized/u);
  assert.equal(await readFile(join(root, 'dist', 'validation', 'm5-5', 'index.html'), 'utf8'), 'synthetic');
});

test('MAT-398 authorized release removes every synthetic route and sitemap entry', async () => {
  const root = await fixture(true);
  const provenance = await prepareRelease({ root });
  const sitemap = await readFile(join(root, 'dist', 'sitemap-0.xml'), 'utf8');
  await assert.rejects(() => readFile(join(root, 'dist', 'validation', 'm5-5', 'index.html')), /ENOENT/u);
  assert.doesNotMatch(sitemap, /\/validation\//u);
  assert.deepEqual(provenance.syntheticRoutesRemoved, ['/validation/m5-5/', '/validation/m5-5/collision/', '/validation/m5-6/']);
});

test('MAT-398 release selector and record cannot escape validation authority', async () => {
  const root = await fixture(true);
  await writeFile(join(root, 'validation', 'm5-6-current.json'), JSON.stringify({
    schemaVersion: 'p5-current-baseline-selector/v1',
    releaseRecord: '../outside.json'
  }));
  await assert.rejects(() => prepareRelease({ root }), /release record must remain under validation/u);
});
