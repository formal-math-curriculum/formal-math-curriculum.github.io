import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';
import { buildDiscoveryModel } from '../src/lib/m5-7-discovery.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const pagefindDirectory = resolve(dist, 'pagefind');
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

const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const model = buildDiscoveryModel(bundle);
const learnerHtml = [];
for (const document of model.documents) {
  const path = resolve(dist, `.${document.canonicalRoute}index.html`);
  invariant(await exists(path), `learner search page missing: ${document.canonicalRoute}`);
  if (!(await exists(path))) continue;
  const html = await readFile(path, 'utf8');
  learnerHtml.push(html);
  invariant(html.includes(`data-pagefind-meta="content-id[content]" content="${document.contentId}"`), `search content identity missing: ${document.contentId}`);
  invariant(html.includes('data-pagefind-meta="search-text[content]"'), `governed search text metadata missing: ${document.contentId}`);
  invariant(html.includes('data-pagefind-filter="fmc-result-kind[content]" content="learner-content"'), `learner result boundary missing: ${document.contentId}`);
  invariant(html.includes(`data-fmc-search-fingerprint="${model.fingerprint}"`), `discovery fingerprint mismatch: ${document.contentId}`);
  invariant(!html.includes('data-fmc-search-text='), `embedded corpus leaked: ${document.contentId}`);
}

const combinedLearnerHtml = learnerHtml.join('\n');
for (const key of ['content-kind', 'editorial-state', 'formal-state', 'publication-state', 'representation', 'locale', 'translation-state']) {
  invariant(combinedLearnerHtml.includes(`data-pagefind-filter="${key}[content]"`), `Pagefind filter dimension missing: ${key}`);
}
for (const reserved of ['validation:m57:', 'urn:fmc:validation:m5-7', 'validation-scale-', '11A05', 'math.NT']) {
  invariant(!combinedLearnerHtml.includes(reserved), `M5.7 validation fixture leaked into production HTML: ${reserved}`);
}

invariant(await exists(pagefindDirectory), 'Pagefind directory missing');
const pagefindFiles = await filesBelow(pagefindDirectory);
const entryPath = resolve(pagefindDirectory, 'pagefind-entry.json');
invariant(await exists(entryPath), 'Pagefind entry manifest missing');
const entry = await exists(entryPath) ? JSON.parse(await readFile(entryPath, 'utf8')) : null;
invariant(entry?.version === '1.5.2', 'Pagefind version mismatch');
invariant(entry?.languages?.en?.page_count === 42, 'Pagefind indexed page count mismatch');
invariant(pagefindFiles.some((path) => path.endsWith('pagefind.js')), 'Pagefind search API bundle missing');
invariant(pagefindFiles.some((path) => path.endsWith('wasm.en.pagefind')), 'Pagefind English WASM missing');

let pagefindBytes = 0;
const treeHash = createHash('sha256');
for (const path of pagefindFiles) {
  const content = await readFile(path);
  const name = relative(pagefindDirectory, path).replaceAll('\\', '/');
  pagefindBytes += content.byteLength;
  treeHash.update(`${name}\0${content.byteLength}\0`);
  treeHash.update(createHash('sha256').update(content).digest('hex'));
  treeHash.update('\n');
}
invariant(pagefindFiles.length <= 90, 'Pagefind file-count envelope exceeded');
invariant(pagefindBytes <= 800_000, 'Pagefind byte envelope exceeded');

const browserReportPath = resolve(dist, '_validation/m5-7-search-browser-v1-report.json');
let browserQualification = { required: process.env.FMC_REQUIRE_BROWSER === '1', present: false, passed: null };
if (await exists(browserReportPath)) {
  const browser = JSON.parse(await readFile(browserReportPath, 'utf8'));
  invariant(browser.schemaVersion === 'p5-m5.7-static-search-browser/v1', 'M5.7 browser report schema mismatch');
  invariant(browser.candidate?.discoveryFingerprint === model.fingerprint, 'M5.7 browser/model fingerprint mismatch');
  invariant(browser.execution?.failed === 0, 'M5.7 browser qualification contains failures');
  browserQualification = { required: process.env.FMC_REQUIRE_BROWSER === '1', present: true, passed: browser.execution?.failed === 0 };
} else {
  invariant(process.env.FMC_REQUIRE_BROWSER !== '1', 'required M5.7 browser report is missing');
}

if (failures.length) throw new Error(`M5.7 search artifact validation failed:\n${[...new Set(failures)].join('\n')}`);

const report = {
  schemaVersion: 'p5-m5.7-static-search-artifact/v1',
  discoveryFingerprint: model.fingerprint,
  freezeDocument: model.freezeDocument,
  governedLearnerDocuments: model.documents.length,
  indexedPages: entry.languages.en.page_count,
  filterDimensions: model.filters.map(({ id }) => id),
  pagefind: {
    version: entry.version,
    files: pagefindFiles.length,
    bytes: pagefindBytes,
    treeSha256: treeHash.digest('hex'),
    integrity: 'actual_path_byte_sha256_manifest_at_packaging'
  },
  scaleFixture: {
    deterministicDocuments: 2_000,
    generatedInProductionArtifact: false
  },
  browserQualification,
  deploymentAuthorized: false,
  limitations: [
    'representative_slice_not_full_course',
    'scale_fixture_is_validation_only',
    'automated_chromium_does_not_replace_manual_screen_reader_or_cross_engine_qualification'
  ]
};
await mkdir(resolve(dist, '_validation'), { recursive: true });
await writeFile(resolve(dist, '_validation/m5-7-search-artifact-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`validated M5.7 static search artifact: ${report.governedLearnerDocuments} learner documents, ${report.filterDimensions.length} filters, ${report.pagefind.files} Pagefind files`);
