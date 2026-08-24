import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';
import { buildDiscoveryModel, generateScaleSearchFixture } from '../src/lib/m5-7-discovery.mjs';
import { generateScaleRelationFixture } from '../src/lib/m5-7-relations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = resolve(root, '.generated/validation/m5-7-scale');
const pagefind = resolve(generated, 'pagefind');
const relationPath = resolve(generated, 'relations.json');
const validationDirectory = resolve(root, 'dist/_validation');
const buildPath = resolve(validationDirectory, 'm5-7-scale-build-v2.json');
const browserPath = resolve(validationDirectory, 'm5-7-remediation-browser-v2-report.json');
const requiredBrowser = process.env.FMC_REQUIRE_BROWSER === '1';
const failures = [];

function invariant(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function digest(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function filesBelow(directory) {
  const files = [];
  async function walk(current) {
    for (const name of (await readdir(current)).sort()) {
      const path = join(current, name);
      const entry = await stat(path);
      if (entry.isDirectory()) await walk(path);
      if (entry.isFile()) files.push(path);
    }
  }
  await walk(directory);
  return files;
}

const [build, bundle] = await Promise.all([
  readFile(buildPath, 'utf8').then(JSON.parse),
  loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') })
]);
const searchScale = generateScaleSearchFixture(buildDiscoveryModel(bundle).documents);
const relationScale = generateScaleRelationFixture(bundle);

invariant(build.schemaVersion === 'p5-m5.7-scale-build/v2', 'scale build schema mismatch');
invariant(build.issue === 'MAT-394', 'scale build issue mismatch');
invariant(build.search?.fingerprint === searchScale.fingerprint, 'scale search fingerprint mismatch');
invariant(build.search?.documents === 2_000, 'scale search document count mismatch');
invariant(build.search?.pagefind?.indexedPages === 2_000, 'scale Pagefind indexed-page count mismatch');
invariant(build.search?.productionIndexEligible === false, 'scale search production boundary mismatch');
invariant(build.relations?.fingerprint === relationScale.fingerprint, 'scale relation fingerprint mismatch');
invariant(build.relations?.documents === 2_000 && build.relations?.placements === 2_200, 'scale relation counts mismatch');
invariant(build.relations?.productionEligible === false, 'scale relation production boundary mismatch');
invariant(build.search?.pagefind?.bytes <= 12 * 1024 * 1024, 'scale Pagefind byte envelope exceeded');
invariant(build.relations?.bytes <= 8 * 1024 * 1024, 'scale relation byte envelope exceeded');
invariant(build.boundaries?.generatedUnderDist === false && build.boundaries?.publicCoverage === false && build.boundaries?.releasePayload === false && build.boundaries?.deploymentAuthorized === false, 'scale artifact boundary mismatch');

const actualPagefind = new Map();
for (const path of await filesBelow(pagefind)) actualPagefind.set(relative(pagefind, path).replaceAll('\\', '/'), await digest(path));
const manifest = build.search?.pagefind?.manifest ?? [];
invariant(actualPagefind.size === manifest.length, 'scale Pagefind file-count manifest mismatch');
for (const expected of manifest) {
  const actual = actualPagefind.get(expected.path);
  invariant(Boolean(actual), `scale Pagefind manifest path missing: ${expected.path}`);
  invariant(actual?.bytes === expected.bytes && actual?.sha256 === expected.sha256, `scale Pagefind digest mismatch: ${expected.path}`);
}
const relationDigest = await digest(relationPath);
invariant(relationDigest.bytes === build.relations?.bytes && relationDigest.sha256 === build.relations?.sha256, 'scale relation digest mismatch');

const learnerHtml = await readFile(resolve(root, 'dist/content/p5m56c0004/natural-number-operation-laws/index.html'), 'utf8');
const searchClientPath = learnerHtml.match(/src="(\/_astro\/GlobalSearch[^"?]+\.js)"/u)?.[1];
invariant(Boolean(searchClientPath), 'production GlobalSearch client bundle reference missing');
if (searchClientPath) {
  const searchClient = await readFile(resolve(root, `dist${searchClientPath}`), 'utf8');
  for (const reserved of ['validation:m57:', '11A05', 'math.NT', 'urn:fmc:validation:m5-7:onto:parent-a']) {
    invariant(!searchClient.includes(reserved), `validation-only judgment leaked into production search client: ${reserved}`);
  }
}

let browser = null;
if (await exists(browserPath)) {
  browser = JSON.parse(await readFile(browserPath, 'utf8'));
  invariant(browser.schemaVersion === 'p5-m5.7-remediation-browser/v2' && browser.pass === 'final', 'scale browser schema/pass mismatch');
  invariant(browser.execution?.total === 29 && browser.execution?.passed === 29 && browser.execution?.failed === 0, 'scale browser qualification contains failures');
  invariant(browser.aggregate?.meanMrr >= 0.9 && browser.aggregate?.meanRecallAt5 >= 0.9 && browser.aggregate?.meanNdcgAt5 >= 0.9, 'aggregate relevance threshold not met');
  invariant(browser.boundaries?.publicCoverage === false && browser.boundaries?.releasePayload === false && browser.boundaries?.deploymentAuthorized === false, 'scale browser boundary mismatch');
} else {
  invariant(!requiredBrowser, 'required M5.7 remediation browser report is missing');
}

if (failures.length) throw new Error(`M5.7 scale artifact validation failed:\n${failures.join('\n')}`);
const report = {
  schemaVersion: 'p5-m5.7-scale-artifact/v2',
  issue: 'MAT-394',
  status: browser ? 'qualified' : 'local-structural-evidence-only',
  search: { fingerprint: searchScale.fingerprint, documents: searchScale.documents.length, pagefindFiles: actualPagefind.size, pagefindBytes: build.search.pagefind.bytes },
  relations: { fingerprint: relationScale.fingerprint, documents: relationScale.documents.length, placements: relationScale.placements.length, bytes: relationDigest.bytes },
  browser: browser ? { schemaVersion: browser.schemaVersion, rows: browser.execution.total, aggregate: browser.aggregate } : null,
  boundaries: build.boundaries,
  deploymentAuthorized: false
};
await writeFile(resolve(validationDirectory, 'm5-7-scale-artifact-v2.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`validated isolated M5.7 scale artifact: ${report.search.documents} search documents / ${report.relations.placements} relation placements`);
