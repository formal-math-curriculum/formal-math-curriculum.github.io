import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFormalRecords, loadSiteBundle } from '../src/lib/m5-6-publication.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const formalRecords = buildFormalRecords(bundle);
const failures = [];
const pageHashes = {};

function invariant(condition, message) {
  if (!condition) failures.push(message);
}

function outputPath(route) {
  return route.endsWith('/') ? resolve(dist, `.${route}index.html`) : resolve(dist, `.${route}`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function validatePage(route, identity = null) {
  const path = outputPath(route);
  invariant(await exists(path), `missing generated route: ${route}`);
  if (!(await exists(path))) return '';
  const html = await readFile(path, 'utf8');
  invariant(html.includes(`href="https://formal-math-curriculum.github.io${route}"`), `canonical mismatch: ${route}`);
  invariant(html.includes('data-pagefind-body'), `Pagefind body missing: ${route}`);
  invariant((html.match(/data-fmc-search-text=/g) ?? []).length === 15, `global search corpus mismatch: ${route}`);
  if (identity) invariant(html.includes(`data-fmc-content-id="${identity}"`), `content identity mismatch: ${route}`);
  for (const reserved of ['urn:fmc:validation', 'FMC-M56-A', 'FMC-M56-B', 'fmc.m56']) {
    invariant(!html.includes(reserved), `validation fixture leaked into ${route}: ${reserved}`);
  }
  pageHashes[route] = createHash('sha256').update(html).digest('hex');
  return html;
}

for (const entity of bundle.publication.content) {
  const route = `/content/${entity.route_key}/${entity.slug}/`;
  await validatePage(route, entity.content_id);
}
for (const record of formalRecords) await validatePage(record.route);

const exerciseRoute = '/content/p5m56c0006/distribute-and-cancel-exercise/';
const exercise = await readFile(outputPath(exerciseRoute), 'utf8');
invariant(/data-fmc-exercise-solution(?![^>]*\sopen(?:\s|>|=))/u.test(exercise), 'exercise solution must be closed initially');
for (const checkpoint of ['7(4+3)=n', '7·4+7·3=n', 'n=49']) {
  invariant(exercise.includes(checkpoint), `exercise checkpoint missing: ${checkpoint}`);
}

const sitemap = await readFile(resolve(dist, 'sitemap-0.xml'), 'utf8');
invariant(!sitemap.includes('/pt/'), 'Portuguese route leaked into sitemap');
for (const route of bundle.manifest.routes.map((entry) => entry.path)) {
  invariant(sitemap.includes(`https://formal-math-curriculum.github.io${route}`), `content route missing from sitemap: ${route}`);
}

const htmlFiles = [];
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const entry = await stat(path);
    if (entry.isDirectory()) await walk(path);
    if (entry.isFile() && name.endsWith('.html')) htmlFiles.push(path);
  }
}
await walk(dist);

for (const path of htmlFiles) {
  if (path.includes(`${join('validation', 'm5-5')}`)) continue;
  const html = await readFile(path, 'utf8');
  for (const match of html.matchAll(/\shref="([^"]+)"/gu)) {
    const href = match[1].replaceAll('&amp;', '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = href.split(/[?#]/u)[0];
    if (!pathname) continue;
    const target = pathname.endsWith('/') ? resolve(dist, `.${pathname}index.html`) : resolve(dist, `.${pathname}`);
    invariant(await exists(target), `broken internal link ${pathname} in ${path.slice(dist.length)}`);
  }
}

invariant(htmlFiles.length === 45, `unexpected HTML page count: ${htmlFiles.length}`);
invariant(formalRecords.length === 20, `unexpected formal record count: ${formalRecords.length}`);

if (failures.length) throw new Error(`M5.6 artifact validation failed:\n${[...new Set(failures)].join('\n')}`);

const report = {
  schema_version: 'p5-m5.6-implementation-artifact/v1',
  source_identity: bundle.publication.source_identity,
  selector_sha256: bundle.manifest.freeze_selector_sha256,
  content_revision: '2da8fdb43074d00fea5fc6201d239e5f26a43250',
  content_pages: bundle.publication.content.length,
  formal_records: formalRecords.length,
  html_pages: htmlFiles.length,
  global_search_documents: bundle.search.documents.length,
  portuguese_routes: 0,
  external_payloads: bundle.publication.external_payloads.length,
  exercise_solution_initially_open: false,
  internal_links: 'resolved',
  page_sha256: Object.fromEntries(Object.entries(pageHashes).sort(([left], [right]) => left.localeCompare(right))),
  limitations: [
    'candidate_not_deployed',
    'not_full_course',
    'manual_screen_reader_and_cross_engine_qualification_pending_MAT-376'
  ]
};
await mkdir(resolve(dist, '_validation'), { recursive: true });
await writeFile(resolve(dist, '_validation/m5-6-implementation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`validated M5.6 artifact: ${report.content_pages} content pages, ${report.formal_records} formal records, ${report.html_pages} HTML pages`);
