import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function inside(parent, child) {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

export async function prepareRelease(options = {}) {
  const root = resolve(options.root ?? repositoryRoot);
  const dist = resolve(root, options.dist ?? 'dist');
  const validationRoot = resolve(root, 'validation');
  const selectorPath = resolve(root, options.selector ?? 'validation/m5-10-current.json');
  if (!inside(validationRoot, selectorPath)) throw new Error('release selector must remain under validation/');

  const selector = JSON.parse(await readFile(selectorPath, 'utf8'));
  if (selector.schemaVersion !== 'p5-current-baseline-selector/v1') {
    throw new Error('release selector schema is incompatible');
  }
  if (typeof selector.releaseRecord !== 'string') throw new Error('release selector has no releaseRecord');

  const recordPath = resolve(root, selector.releaseRecord);
  if (!inside(validationRoot, recordPath)) throw new Error('release record must remain under validation/');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  if (record.deploymentAuthorized !== true) {
    throw new Error(`deployment is not authorized by ${relative(root, recordPath)}`);
  }
  if (record.schemaVersion !== 'p5-m5.10-public-release/v1') {
    throw new Error('release record schema is incompatible');
  }
  if (record.unresolvedFindings?.Blocker !== 0 || record.unresolvedFindings?.Material !== 0) {
    throw new Error('deployment requires zero unresolved Blocker and Material findings');
  }
  const sourceRevision = options.sourceRevision ?? process.env.FMC_SOURCE_REVISION;
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision ?? '')) {
    throw new Error('release preparation requires an exact FMC_SOURCE_REVISION');
  }
  if (record.release?.tag !== 'p5-web-v0.1.0'
    || record.release?.canonicalRoot !== 'https://formal-math-curriculum.github.io/') {
    throw new Error('release identity is incompatible');
  }
  if (record.authority?.applicationCandidateRevision !== 'cc137e0f47e324acbb8b864212a1dd4387c54d23'
    || record.authority?.applicationCandidateTree !== '99033aa8185141b7b5a5346ea70533086af2eb24') {
    throw new Error('application candidate tuple is incompatible');
  }
  if (record.acceptedAccessibilityRisk?.row !== 'A10'
    || record.acceptedAccessibilityRisk?.status !== 'blocked_manual_required'
    || record.acceptedAccessibilityRisk?.conformanceClaimAuthorized !== false) {
    throw new Error('accessibility risk disposition is missing or misrepresented');
  }

  const fixtureDirectory = resolve(dist, 'validation');
  if (!inside(dist, fixtureDirectory)) throw new Error('invalid synthetic fixture path');
  const syntheticRoutesRemoved = [];
  async function collect(directory) {
    for (const name of await readdir(directory).catch(() => [])) {
      const path = resolve(directory, name);
      const entry = await stat(path);
      if (entry.isDirectory()) await collect(path);
      if (entry.isFile() && name === 'index.html') {
        const relativePath = relative(dist, dirname(path)).split(sep).join('/');
        syntheticRoutesRemoved.push(`/${relativePath}/`);
      }
    }
  }
  await collect(fixtureDirectory);
  await rm(fixtureDirectory, { recursive: true, force: true });
  const validationEvidenceDirectory = resolve(dist, '_validation');
  await rm(validationEvidenceDirectory, { recursive: true, force: true });

  const sitemapPath = resolve(dist, 'sitemap-0.xml');
  let sitemap = await readFile(sitemapPath, 'utf8');
  sitemap = sitemap.replace(
    /<url><loc>https:\/\/formal-math-curriculum\.github\.io\/validation\/[^<]*<\/loc><\/url>/gu,
    ''
  );
  if (sitemap.includes('/validation/')) {
    throw new Error('synthetic validation URL remains in the release sitemap');
  }
  await writeFile(sitemapPath, sitemap);

  const provenancePath = resolve(dist, '_provenance', 'release.json');
  await mkdir(dirname(provenancePath), { recursive: true });
  const provenance = {
    schemaVersion: 'p5-public-release-preparation/v1',
    releaseVersion: record.release.version,
    releaseTag: record.release.tag,
    canonicalRoot: record.release.canonicalRoot,
    sourceRepository: record.release.repository,
    sourceRevision,
    applicationCandidateRevision: record.authority.applicationCandidateRevision,
    applicationCandidateTree: record.authority.applicationCandidateTree,
    contentRevision: record.authority.contentRevision,
    contentTree: record.authority.contentTree,
    leanRevision: record.authority.leanRevision,
    leanCoreRevision: record.authority.leanCoreRevision,
    mathlibRevision: record.authority.mathlibRevision,
    selector: relative(root, selectorPath),
    selectorSha256: sha256(await readFile(selectorPath)),
    releaseRecord: relative(root, recordPath),
    releaseRecordSha256: sha256(await readFile(recordPath)),
    releaseRecordSchemaVersion: record.schemaVersion,
    qualificationRunId: record.qualification.workflowRunId,
    acceptedAccessibilityRisk: record.acceptedAccessibilityRisk,
    syntheticRoutesRemoved: syntheticRoutesRemoved.sort(),
    validationEvidenceRemoved: true
  };
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareRelease({ selector: process.argv[2] });
  console.log('M5.10 release authorization enforced and validation-only material removed');
}
