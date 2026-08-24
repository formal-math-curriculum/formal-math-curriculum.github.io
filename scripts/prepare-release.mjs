import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function inside(parent, child) {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

export async function prepareRelease(options = {}) {
  const root = resolve(options.root ?? repositoryRoot);
  const dist = resolve(root, options.dist ?? 'dist');
  const validationRoot = resolve(root, 'validation');
  const selectorPath = resolve(root, options.selector ?? 'validation/m5-5-current.json');
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
  if (record.unresolvedFindings?.Blocker !== 0 || record.unresolvedFindings?.Material !== 0) {
    throw new Error('deployment requires zero unresolved Blocker and Material findings');
  }

  const fixtureDirectory = resolve(dist, 'validation', 'm5-5');
  if (!inside(dist, fixtureDirectory)) throw new Error('invalid synthetic fixture path');
  await rm(fixtureDirectory, { recursive: true, force: true });

  const sitemapPath = resolve(dist, 'sitemap-0.xml');
  let sitemap = await readFile(sitemapPath, 'utf8');
  sitemap = sitemap.replace(
    /<url><loc>https:\/\/formal-math-curriculum\.github\.io\/validation\/m5-5\/[^<]*<\/loc><\/url>/gu,
    ''
  );
  if (sitemap.includes('/validation/m5-5/')) {
    throw new Error('synthetic M5.5 validation URL remains in the release sitemap');
  }
  await writeFile(sitemapPath, sitemap);

  const provenancePath = resolve(dist, '_provenance', 'release.json');
  await mkdir(dirname(provenancePath), { recursive: true });
  const provenance = {
    schemaVersion: 'p5-public-release-preparation/v1',
    selector: relative(root, selectorPath),
    releaseRecord: relative(root, recordPath),
    releaseRecordSchemaVersion: record.schemaVersion,
    syntheticRoutesRemoved: ['/validation/m5-5/']
  };
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareRelease({ selector: process.argv[2] });
  console.log('release authorization enforced and synthetic validation route removed');
}
