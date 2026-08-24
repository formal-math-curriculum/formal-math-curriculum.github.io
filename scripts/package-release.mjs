import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateM510Release } from './validate-m5-10-release.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (path) => sha256(await readFile(path));

export async function packageRelease(options = {}) {
  const root = resolve(options.root ?? repositoryRoot);
  const dist = resolve(root, options.dist ?? 'dist');
  const output = resolve(root, options.output ?? 'release-assets');
  const sourceRevision = options.sourceRevision ?? process.env.FMC_SOURCE_REVISION;
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision ?? '')) throw new Error('release packaging requires an exact FMC_SOURCE_REVISION');
  const validated = await validateM510Release({
    root,
    selector: options.selector ?? 'validation/m5-10-current.json',
    verifyGitBoundary: options.verifyGitBoundary
  });
  const provenance = JSON.parse(await readFile(resolve(dist, '_provenance/release.json'), 'utf8'));
  if (provenance.sourceRevision !== sourceRevision
    || provenance.releaseTag !== validated.record.release.tag
    || provenance.releaseRecordSha256 !== validated.recordSha256) {
    throw new Error('prepared public artifact provenance does not match the release tuple');
  }

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const copied = [
    ['generated/licenses/software-dependencies.json', 'software-dependencies.json'],
    ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
    ['THIRD_PARTY_LICENSES.txt', 'THIRD_PARTY_LICENSES.txt']
  ];
  for (const [source, name] of copied) await copyFile(resolve(root, source), resolve(output, name));

  const archivePath = resolve(output, 'site-dist.tar.zst');
  execFileSync('tar', [
    '--zstd', '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    '-cf', archivePath, '-C', dist, '.'
  ], { cwd: root, stdio: 'pipe' });

  const artifactManifestSha256 = await sha256File(resolve(dist, '_provenance/artifact.json'));
  const tuple = {
    schemaVersion: 'p5-m5.10-durable-release-tuple/v1',
    release: validated.record.release,
    siteRevision: sourceRevision,
    applicationCandidateRevision: validated.record.authority.applicationCandidateRevision,
    applicationCandidateTree: validated.record.authority.applicationCandidateTree,
    integratedM59Revision: validated.record.authority.integratedM59Revision,
    contentRevision: validated.record.authority.contentRevision,
    contentTree: validated.record.authority.contentTree,
    leanRevision: validated.record.authority.leanRevision,
    leanCoreRevision: validated.record.authority.leanCoreRevision,
    mathlibRevision: validated.record.authority.mathlibRevision,
    inputLockSha256: validated.record.authority.inputLockSha256,
    pnpmLockSha256: validated.record.authority.pnpmLockSha256,
    softwareInventorySha256: validated.record.authority.softwareInventorySha256,
    externalSnapshotPolicySha256: validated.record.authority.externalSnapshotPolicySha256,
    externalSnapshotSchemaSha256: validated.record.authority.externalSnapshotSchemaSha256,
    contentValidatorSha256: validated.record.authority.contentValidatorSha256,
    operationsValidatorSha256: validated.record.authority.operationsValidatorSha256,
    nodeVersion: '24.19.0',
    pnpmVersion: '11.23.0',
    runnerImage: 'ubuntu-24.04',
    selectorPath: validated.selectorPath,
    selectorSha256: validated.selectorSha256,
    releaseRecordPath: validated.recordPath,
    releaseRecordSha256: validated.recordSha256,
    artifactManifestSha256,
    siteDistSha256: await sha256File(archivePath),
    qualificationRunId: validated.record.qualification.workflowRunId,
    acceptedAccessibilityRisk: validated.record.acceptedAccessibilityRisk,
    conformanceClaims: validated.record.claims,
    rollback: validated.record.rollback
  };
  await writeFile(resolve(output, 'release-tuple.json'), `${JSON.stringify(tuple, null, 2)}\n`);

  const checksummed = [
    'site-dist.tar.zst',
    'release-tuple.json',
    'software-dependencies.json',
    'THIRD_PARTY_NOTICES.md',
    'THIRD_PARTY_LICENSES.txt'
  ];
  const checksums = [];
  for (const name of checksummed) checksums.push(`${await sha256File(resolve(output, name))}  ${name}`);
  await writeFile(resolve(output, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
  return { tuple, checksums };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await packageRelease({ selector: process.argv[2] });
  console.log(`packaged ${result.checksums.length + 1} durable release assets`);
}
