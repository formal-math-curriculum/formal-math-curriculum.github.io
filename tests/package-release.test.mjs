import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { packageRelease } from '../scripts/package-release.mjs';

const sourceRoot = new URL('../', import.meta.url);
const revision = '2222222222222222222222222222222222222222';

async function fixture(provenanceRevision = revision) {
  const root = await mkdtemp(join(tmpdir(), 'm5-10-package-'));
  for (const path of ['validation', 'dist/_provenance', 'generated/licenses']) await mkdir(join(root, path), { recursive: true });
  const selectorBytes = await readFile(new URL('validation/m5-10-current.json', sourceRoot));
  const recordBytes = await readFile(new URL('validation/m5-10-release-v1.json', sourceRoot));
  await writeFile(join(root, 'validation/m5-10-current.json'), selectorBytes);
  await writeFile(join(root, 'validation/m5-10-release-v1.json'), recordBytes);
  const recordSha256 = (await import('node:crypto')).createHash('sha256').update(recordBytes).digest('hex');
  await writeFile(join(root, 'dist/_provenance/release.json'), JSON.stringify({
    sourceRevision: provenanceRevision,
    releaseTag: 'p5-web-v0.1.0',
    releaseRecordSha256: recordSha256
  }));
  await writeFile(join(root, 'dist/_provenance/artifact.json'), '{"artifact_manifest_version":"test"}\n');
  await writeFile(join(root, 'dist/index.html'), '<h1>test</h1>');
  await writeFile(join(root, 'generated/licenses/software-dependencies.json'), '{}\n');
  await writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), '# Notices\n');
  await writeFile(join(root, 'THIRD_PARTY_LICENSES.txt'), 'licenses\n');
  return root;
}

test('M5.10 packaging emits the complete durable tuple and verifiable checksums', async () => {
  const root = await fixture();
  const result = await packageRelease({ root, sourceRevision: revision, verifyGitBoundary: false });
  assert.equal(result.tuple.siteRevision, revision);
  assert.equal(result.tuple.acceptedAccessibilityRisk.status, 'blocked_manual_required');
  assert.equal(result.checksums.length, 5);
  const checksumFile = await readFile(join(root, 'release-assets/SHA256SUMS'), 'utf8');
  for (const name of ['site-dist.tar.zst', 'release-tuple.json', 'software-dependencies.json', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) {
    assert.match(checksumFile, new RegExp(`  ${name.replaceAll('.', '\\.')}$`, 'm'));
  }
});

test('M5.10 packaging refuses provenance from another deployed revision', async () => {
  const root = await fixture('3'.repeat(40));
  await assert.rejects(() => packageRelease({ root, sourceRevision: revision, verifyGitBoundary: false }), /provenance does not match/u);
});
