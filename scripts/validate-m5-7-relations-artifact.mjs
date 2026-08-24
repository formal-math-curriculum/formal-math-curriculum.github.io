import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteBundle, makePageOutline } from '../src/lib/m5-6-publication.mjs';
import { buildRelationCorpus, generateScaleRelationFixture, makePageRelations, RELATION_SYSTEMS } from '../src/lib/m5-7-relations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
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

function outputPath(route) {
  return resolve(dist, `.${route}${route.endsWith('/') ? 'index.html' : ''}`);
}

const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const corpus = buildRelationCorpus(bundle);
const scale = generateScaleRelationFixture(bundle);
const learnerHtml = [];
for (const entity of bundle.publication.content) {
  const route = `/content/${entity.route_key}/${entity.slug}/`;
  const path = outputPath(route);
  invariant(await exists(path), `relation learner route missing: ${route}`);
  if (!(await exists(path))) continue;
  const html = await readFile(path, 'utf8');
  learnerHtml.push(html);
  const model = makePageRelations(bundle, entity, { outline: makePageOutline(bundle, entity) });
  invariant(html.includes(`data-fmc-relation-fingerprint="${model.fingerprint}"`), `relation page fingerprint mismatch: ${entity.content_id}`);
  invariant(html.includes(`data-fmc-relation-corpus-fingerprint="${corpus.fingerprint}"`), `relation corpus fingerprint mismatch: ${entity.content_id}`);
  invariant(html.includes(`data-fmc-current-content-id="${entity.content_id}"`), `relation current content mismatch: ${entity.content_id}`);
  invariant(html.includes('data-fmc-relation-search-boundary="pagefind-excluded"'), `relation search-index boundary missing: ${entity.content_id}`);
  for (const label of ['Learner prerequisites', 'Downstream uses', 'Course path', 'External classification placements', 'Generated Lean / mathlib dependency drill-down', 'Lean import/build detail']) {
    invariant(html.includes(label), `complete relation list heading missing: ${entity.content_id}:${label}`);
  }
  invariant(html.includes('Relation state persistence: false'), `relation persistence boundary missing: ${entity.content_id}`);
  invariant(html.includes('Progress tracking: false'), `progress-free boundary missing: ${entity.content_id}`);
  invariant(html.includes('Deployment authorized: false'), `relation deployment boundary missing: ${entity.content_id}`);
}

const combinedLearnerHtml = learnerHtml.join('\n');
for (const reserved of ['validation:m57:', 'validation-formal-', 'validation-ready-', 'P5-M5.7-SCALE-v1', 'relation scale']) {
  invariant(!combinedLearnerHtml.includes(reserved), `M5.7 relation scale fixture leaked into production HTML: ${reserved}`);
}
invariant(combinedLearnerHtml.includes('READY-P1-000001'), 'governed external-boundary readiness missing from learner HTML');
invariant(combinedLearnerHtml.includes('READY-P1-000006'), 'governed resolved readiness missing from learner HTML');
invariant(combinedLearnerHtml.includes('FART-P2-000005'), 'governed generated formal chain missing from learner HTML');
invariant(combinedLearnerHtml.includes('Mathlib.Algebra.Ring.Nat'), 'governed formal module missing from learner HTML');
invariant(combinedLearnerHtml.includes('Nat.instDistrib'), 'governed formal declaration missing from learner HTML');

const validationRoute = '/validation/m5-7-relations/';
const validationPath = outputPath(validationRoute);
invariant(await exists(validationPath), 'M5.7 relation validation route missing');
const validationHtml = await exists(validationPath) ? await readFile(validationPath, 'utf8') : '';
invariant(validationHtml.includes(`data-fmc-m5-7-relation-validation="${scale.fingerprint}"`), 'relation validation fingerprint mismatch');
invariant(validationHtml.includes('content="noindex, nofollow"'), 'relation validation route noindex boundary missing');
invariant(!validationHtml.includes('rel="canonical"'), 'relation validation route must not emit canonical metadata');
invariant(!validationHtml.includes('<fmc-global-search'), 'relation validation route must not mount global search');
invariant(!validationHtml.includes('data-pagefind-body'), 'relation validation route must not enter Pagefind body');
for (const [attribute, value] of [
  ['data-fmc-scale-documents', '2000'],
  ['data-fmc-scale-placements', '2200'],
  ['data-fmc-scale-prerequisite-nodes', '120'],
  ['data-fmc-scale-formal-direct', '150'],
  ['data-fmc-scale-formal-two-hop', '25'],
  ['data-fmc-scale-formal-unresolved', '10']
]) {
  invariant(new RegExp(`${attribute}[^>]*>${value}<`, 'u').test(validationHtml), `relation scale count missing: ${attribute}=${value}`);
}
for (const state of ['stale-revision', 'self-edge', 'cycle', 'dangling-edge', 'type-conversion']) {
  invariant(validationHtml.includes(`data-fmc-invalid-case="${state}"`), `relation failure state missing: ${state}`);
}
invariant((validationHtml.match(/data-fmc-unresolved-id=/gu) ?? []).length === 10, 'relation unresolved node count mismatch');

const sitemap = await readFile(resolve(dist, 'sitemap-0.xml'), 'utf8');
invariant(!sitemap.includes('/validation/'), 'relation validation route leaked into sitemap');

const browserReportPath = resolve(dist, '_validation/m5-7-relations-browser-v1-report.json');
let browserQualification = { required: process.env.FMC_REQUIRE_BROWSER === '1', present: false, passed: null };
if (await exists(browserReportPath)) {
  const browser = JSON.parse(await readFile(browserReportPath, 'utf8'));
  const requiredRows = [
    ...Array.from({ length: 14 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 8 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`)
  ];
  const resultIds = new Set(browser.results?.map(({ id }) => id));
  invariant(browser.schemaVersion === 'p5-m5.7-relations-browser/v1', 'M5.7 relation browser report schema mismatch');
  invariant(browser.candidate?.relationCorpusFingerprint === corpus.fingerprint, 'relation browser/corpus fingerprint mismatch');
  invariant(browser.candidate?.scaleFixtureFingerprint === scale.fingerprint, 'relation browser/scale fingerprint mismatch');
  invariant(requiredRows.every((id) => resultIds.has(id)), 'relation browser report row coverage mismatch');
  invariant(browser.execution?.total === requiredRows.length, 'relation browser report total mismatch');
  invariant(browser.execution?.failed === 0, 'relation browser qualification contains failures');
  browserQualification = { required: process.env.FMC_REQUIRE_BROWSER === '1', present: true, passed: browser.execution?.failed === 0 };
} else {
  invariant(process.env.FMC_REQUIRE_BROWSER !== '1', 'required M5.7 relation browser report is missing');
}

if (failures.length) throw new Error(`M5.7 relation artifact validation failed:\n${[...new Set(failures)].join('\n')}`);

const report = {
  schemaVersion: 'p5-m5.7-relations-artifact/v1',
  issue: 'MAT-364',
  relationCorpusFingerprint: corpus.fingerprint,
  scaleFixtureFingerprint: scale.fingerprint,
  authority: corpus.authority,
  relationSystems: RELATION_SYSTEMS.map(({ id }) => id),
  governed: {
    learnerPages: bundle.publication.content.length,
    coursePlacements: corpus.course.placements.length,
    courseReferenceEdges: corpus.course.edges.length,
    readinessAuthorities: corpus.readiness.authorities.length,
    prerequisitePageEdges: corpus.readiness.prerequisiteEdges.length,
    generatedFormalRecords: corpus.formal.records.length,
    externalPayloads: corpus.boundaries.externalPayloads
  },
  scaleFixture: {
    documents: scale.documents.length,
    placements: scale.placements.length,
    prerequisiteNodes: scale.prerequisite.nodes.length,
    directFormalEdges: scale.formal.directEdges.length,
    twoHopChains: scale.formal.twoHopChains.length,
    unresolvedEdges: scale.formal.unresolvedEdges.length,
    generatedInProductionArtifact: false,
    publicCoverage: false
  },
  validationRoute: { route: validationRoute, noindex: true, sitemap: false, pagefind: false, canonical: false },
  browserQualification,
  boundaries: { relationStatePersistence: false, progressTracking: false, relationNavigationInSearchIndex: false, deploymentAuthorized: false },
  limitations: [
    'representative_slice_not_full_course',
    'external_classification_payloads_unavailable_or_license_needs_review',
    'generated_formal_dependency_is_one_bounded_content_centered_chain',
    'no_qualified_raw_import_build_edges',
    'automated_chromium_not_manual_screen_reader_or_cross_engine_conformance'
  ]
};
await mkdir(resolve(dist, '_validation'), { recursive: true });
await writeFile(resolve(dist, '_validation/m5-7-relations-artifact-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`validated M5.7 relation artifact: ${report.governed.learnerPages} learner pages, ${report.relationSystems.length} relation systems, ${report.scaleFixture.documents} validation documents`);
