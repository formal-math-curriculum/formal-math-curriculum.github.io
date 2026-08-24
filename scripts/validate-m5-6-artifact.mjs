import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFormalRecords, CONTENT_REVISION, CONTENT_TREE, loadSiteBundle } from '../src/lib/m5-6-publication.mjs';

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

async function readRoute(route) {
  const path = outputPath(route);
  invariant(await exists(path), `missing generated route: ${route}`);
  return await exists(path) ? readFile(path, 'utf8') : '';
}

async function validatePublishedPage(route, identity = null) {
  const html = await readRoute(route);
  if (!html) return html;
  invariant(html.includes(`href="https://formal-math-curriculum.github.io${route}"`), `canonical mismatch: ${route}`);
  invariant(html.includes('data-pagefind-body'), `Pagefind body missing: ${route}`);
  invariant(
    (html.match(/data-fmc-search-text=/g) ?? []).length === bundle.search.documents.length,
    `global search corpus mismatch: ${route}`
  );
  if (identity) invariant(html.includes(`data-fmc-content-id="${identity}"`), `content identity mismatch: ${route}`);
  for (const reserved of ['urn:fmc:validation', 'FMC-M56-A', 'FMC-M56-B', 'fmc.m56']) {
    invariant(!html.includes(reserved), `validation fixture leaked into ${route}: ${reserved}`);
  }
  pageHashes[route] = createHash('sha256').update(html).digest('hex');
  return html;
}

for (const entity of bundle.publication.content) {
  const route = `/content/${entity.route_key}/${entity.slug}/`;
  const html = await validatePublishedPage(route, entity.content_id);
  for (const block of entity.blocks ?? []) {
    invariant(html.includes('data-fmc-math-renderer="p5-latex-mathml-renderer/v1"'), `MathML renderer missing: ${entity.content_id}:${block.block_id}`);
    invariant(html.includes(`data-fmc-latex-source="${block.latex}"`), `exact rendered source missing: ${entity.content_id}:${block.block_id}`);
    invariant(html.includes(`<annotation encoding="application/x-tex">${block.latex}</annotation>`), `exact MathML annotation missing: ${entity.content_id}:${block.block_id}`);
  }
  for (const sourceId of entity.source_refs) {
    const source = bundle.publication.sources.find((candidate) => candidate.id === sourceId);
    if (source?.license_state) invariant(html.includes(source.license_state.replaceAll('_', ' ')), `license state missing: ${route}:${sourceId}`);
  }
}
for (const record of formalRecords) await validatePublishedPage(record.route);
for (const projection of bundle.outline.projections) await validatePublishedPage(`/outline/${projection.id}/`);

const fixture = bundle.validationFixture;
const fixtureHtml = await readRoute(fixture.route);
invariant(fixtureHtml.includes(`data-fmc-m5-6-validation="${fixture.fingerprint}"`), 'validation fixture fingerprint missing');
invariant(fixtureHtml.includes('content="noindex, nofollow"'), 'validation fixture noindex boundary missing');
invariant(!fixtureHtml.includes('rel="canonical"'), 'validation fixture must not emit canonical metadata');
invariant(!fixtureHtml.includes('<fmc-global-search'), 'validation fixture must not mount global search');
invariant(!fixtureHtml.includes('data-pagefind-body'), 'validation fixture must not enter Pagefind body');
for (const reserved of ['urn:fmc:validation:m5-6:onto:parent-a', 'urn:fmc:validation:m5-6:onto:parent-b', 'FMC-M56-A', 'FMC-M56-B', 'fmc.m56']) {
  invariant(fixtureHtml.includes(reserved), `validation fixture identifier missing: ${reserved}`);
}

const exercise = bundle.publication.content.find((entity) => entity.exercise);
invariant(Boolean(exercise), 'governed exercise missing');
if (exercise) {
  const exerciseRoute = `/content/${exercise.route_key}/${exercise.slug}/`;
  const exerciseHtml = await readFile(outputPath(exerciseRoute), 'utf8');
  invariant(/data-fmc-exercise-solution(?![^>]*\sopen(?:\s|>|=))/u.test(exerciseHtml), 'exercise solution must be closed initially');
  for (const checkpoint of exercise.exercise.checkpoints) {
    invariant(exerciseHtml.includes(checkpoint), `exercise checkpoint missing: ${checkpoint}`);
  }
}

const recovery = await readFile(resolve(dist, '404.html'), 'utf8');
invariant(!recovery.includes('rel="canonical"'), '404 recovery must not emit canonical metadata');
for (const entity of bundle.publication.content) {
  const route = `/content/${entity.route_key}/${entity.slug}/`;
  for (const locale of entity.locales.filter((candidate) => candidate.locale !== 'en' && candidate.translation_state === 'unavailable')) {
    invariant(recovery.includes(`/${locale.locale}${route}`), `locale recovery request missing: /${locale.locale}${route}`);
    invariant(recovery.includes(route), `locale recovery counterpart missing: ${route}`);
  }
}

const sitemap = await readFile(resolve(dist, 'sitemap-0.xml'), 'utf8');
invariant(!sitemap.includes('/pt/'), 'Portuguese route leaked into sitemap');
invariant(!sitemap.includes('/validation/'), 'synthetic validation route leaked into sitemap');
for (const route of [
  ...bundle.manifest.routes.map((entry) => entry.path),
  ...formalRecords.map((record) => record.route),
  ...bundle.outline.projections.map((projection) => `/outline/${projection.id}/`)
]) {
  invariant(sitemap.includes(`https://formal-math-curriculum.github.io${route}`), `published route missing from sitemap: ${route}`);
}

const htmlFiles = [];
async function walk(directory) {
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    const entry = await stat(path);
    if (entry.isDirectory()) await walk(path);
    if (entry.isFile() && name.endsWith('.html')) htmlFiles.push(path);
  }
}
await walk(dist);

for (const path of htmlFiles) {
  if (path.startsWith(`${resolve(dist, 'validation')}${sep}`)) continue;
  const html = await readFile(path, 'utf8');
  for (const match of html.matchAll(/\shref="([^"]+)"/gu)) {
    const href = match[1].replaceAll('&amp;', '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = href.split(/[?#]/u)[0];
    if (!pathname) continue;
    const target = pathname.endsWith('/') ? resolve(dist, `.${pathname}index.html`) : resolve(dist, `.${pathname}`);
    invariant(await exists(target), `broken internal link ${pathname} in ${relative(dist, path)}`);
  }
}

const browserReportPath = resolve(dist, '_validation/m5-6-requalification-v2-report.json');
let browserQualification = { required: process.env.FMC_REQUIRE_BROWSER === '1', present: false, passed: null };
if (await exists(browserReportPath)) {
  const browserReport = JSON.parse(await readFile(browserReportPath, 'utf8'));
  const requiredRows = [
    ...Array.from({ length: 15 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 5 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)
  ];
  const resultIds = new Set(browserReport.results?.map((result) => result.id));
  invariant(browserReport.schemaVersion === 'p5-m5.6-requalification-browser/v2', 'browser report schema mismatch');
  invariant(browserReport.candidate?.contentRevision === CONTENT_REVISION, 'browser/content revision mismatch');
  invariant(browserReport.candidate?.fixtureFingerprint === fixture.fingerprint, 'browser/fixture fingerprint mismatch');
  invariant(requiredRows.every((id) => resultIds.has(id)), 'browser report row coverage mismatch');
  invariant(browserReport.execution?.failed === 0, 'browser qualification contains failures');
  invariant(browserReport.execution?.passed === requiredRows.length, 'browser qualification pass count mismatch');
  browserQualification = { required: process.env.FMC_REQUIRE_BROWSER === '1', present: true, passed: browserReport.execution?.failed === 0 };
} else {
  invariant(process.env.FMC_REQUIRE_BROWSER !== '1', 'required M5.6 browser report is missing');
}

if (failures.length) throw new Error(`M5.6 artifact validation failed:\n${[...new Set(failures)].join('\n')}`);

const report = {
  schema_version: 'p5-m5.6-requalification-artifact/v2',
  source_identity: bundle.publication.source_identity,
  selector_sha256: bundle.manifest.freeze_selector_sha256,
  content_revision: CONTENT_REVISION,
  content_tree: CONTENT_TREE,
  fixture: {
    route: fixture.route,
    fingerprint: fixture.fingerprint,
    excluded_from_sitemap: true,
    excluded_from_global_search: true,
    excluded_from_canonical_metadata: true
  },
  governed_counts: {
    content_pages: bundle.publication.content.length,
    formal_records: formalRecords.length,
    projection_landings: bundle.outline.projections.length,
    search_documents: bundle.search.documents.length,
    represented_blocks: bundle.publication.content.reduce((total, entity) => total + (entity.blocks?.length ?? 0), 0)
  },
  observed_html_pages: htmlFiles.length,
  portuguese_routes: 0,
  external_payloads: bundle.publication.external_payloads.length,
  exercise_solution_initially_open: false,
  internal_links: 'resolved',
  mathml_derivation: 'exact-governed-latex',
  browser_qualification: browserQualification,
  page_sha256: Object.fromEntries(Object.entries(pageHashes).sort(([left], [right]) => left.localeCompare(right))),
  limitations: [
    'candidate_not_deployed',
    'representative_slice_not_full_course',
    'automated_chromium_does_not_replace_manual_screen_reader_or_cross_engine_qualification',
    'external_projection_fixture_is_synthetic_mechanics_only'
  ]
};
await mkdir(resolve(dist, '_validation'), { recursive: true });
await writeFile(resolve(dist, '_validation/m5-6-requalification-artifact-v2.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`validated governed M5.6 artifact: ${report.governed_counts.content_pages} content, ${report.governed_counts.formal_records} formal and ${report.governed_counts.projection_landings} projection pages`);
