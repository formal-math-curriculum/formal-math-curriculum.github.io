import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';
import { buildDiscoveryModel, generateScaleSearchFixture } from '../src/lib/m5-7-discovery.mjs';
import { generateScaleRelationFixture } from '../src/lib/m5-7-relations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = resolve(root, '.generated/validation/m5-7-scale');
const source = resolve(generated, 'source');
const pagefind = resolve(generated, 'pagefind');
const relationPath = resolve(generated, 'relations.json');
const reportPath = resolve(root, 'dist/_validation/m5-7-scale-build-v2.json');
const executable = resolve(root, 'node_modules/.bin', process.platform === 'win32' ? 'pagefind.cmd' : 'pagefind');

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
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
const discovery = buildDiscoveryModel(bundle);
const searchScale = generateScaleSearchFixture(discovery.documents);
const relationScale = generateScaleRelationFixture(bundle);

await rm(generated, { recursive: true, force: true });
await mkdir(source, { recursive: true });
for (const document of searchScale.documents) {
  const path = resolve(source, document.contentId.replaceAll(':', '-'), 'index.html');
  await mkdir(dirname(path), { recursive: true });
  const metadata = {
    title: document.title,
    'content-id': document.contentId,
    'content-kind': document.kind,
    summary: document.summary,
    identifiers: document.identifiers.join('|'),
    aliases: document.aliases.join('|'),
    'search-text': document.searchText
  };
  const filters = {
    'fmc-result-kind': 'learner-content',
    'content-kind': document.kind,
    'editorial-state': document.editorialState,
    'formal-state': document.formalState,
    'publication-state': document.publicationState,
    representation: document.representations,
    locale: document.locale,
    'translation-state': document.translationStates
  };
  const meta = Object.entries(metadata).map(([name, value]) => `<meta data-pagefind-meta="${name}[content]" content="${escapeHtml(value)}">`).join('');
  const filterMeta = Object.entries(filters).flatMap(([name, values]) => (Array.isArray(values) ? values : [values]).map((value) => `<meta data-pagefind-filter="${name}[content]" content="${escapeHtml(value)}">`)).join('');
  await writeFile(path, `<!doctype html><html lang="en"><head><meta charset="utf-8">${meta}${filterMeta}</head><body><main data-pagefind-body><h1>${escapeHtml(document.title)}</h1><p>${escapeHtml(document.searchText)}</p></main></body></html>\n`);
}

execFileSync(executable, ['--site', source, '--output-path', pagefind, '--quiet'], {
  cwd: root,
  env: { ...process.env, RAYON_NUM_THREADS: '1', SOURCE_DATE_EPOCH: '0' },
  stdio: 'inherit'
});
await rm(source, { recursive: true, force: true });
await writeFile(relationPath, `${JSON.stringify(relationScale)}\n`);

const pagefindFiles = await filesBelow(pagefind);
const pagefindEntry = JSON.parse(await readFile(resolve(pagefind, 'pagefind-entry.json'), 'utf8'));
let pagefindBytes = 0;
let pagefindGzipBytes = 0;
const manifest = [];
for (const path of pagefindFiles) {
  const content = await readFile(path);
  pagefindBytes += content.byteLength;
  pagefindGzipBytes += gzipSync(content, { level: 9, mtime: 0 }).byteLength;
  manifest.push({
    path: relative(pagefind, path).replaceAll('\\', '/'),
    bytes: content.byteLength,
    gzipBytes: gzipSync(content, { level: 9, mtime: 0 }).byteLength,
    sha256: createHash('sha256').update(content).digest('hex')
  });
}
const relationBytes = await readFile(relationPath);
const report = {
  schemaVersion: 'p5-m5.7-scale-build/v2',
  issue: 'MAT-394',
  search: {
    fingerprint: searchScale.fingerprint,
    documents: searchScale.documents.length,
    productionIndexEligible: searchScale.productionIndexEligible,
    pagefind: { version: '1.5.2', indexedPages: pagefindEntry.languages?.en?.page_count, files: pagefindFiles.length, bytes: pagefindBytes, gzipBytes: pagefindGzipBytes, manifest }
  },
  relations: {
    fingerprint: relationScale.fingerprint,
    documents: relationScale.documents.length,
    placements: relationScale.placements.length,
    bytes: relationBytes.byteLength,
    gzipBytes: gzipSync(relationBytes, { level: 9, mtime: 0 }).byteLength,
    sha256: createHash('sha256').update(relationBytes).digest('hex'),
    productionEligible: relationScale.productionEligible
  },
  boundaries: { generatedUnderDist: false, publicCoverage: false, releasePayload: false, deploymentAuthorized: false }
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`built isolated M5.7 T2 artifacts: ${report.search.documents} search documents / ${report.relations.placements} relation placements`);
