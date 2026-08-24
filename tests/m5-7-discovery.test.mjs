import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildDiscoveryModel,
  generateScaleSearchFixture,
  GLOBAL_JUDGMENTS,
  searchDiscoveryDocuments
} from '../src/lib/m5-7-discovery.mjs';
import { buildPagefindFilters, filterSearchRows, normalizeSearchToken, sortSearchRows } from '../src/lib/m5-7-search-client.mjs';
import { computeRelevanceMetrics, FROZEN_RELEVANCE_JUDGMENTS } from '../src/lib/m5-7-relevance.mjs';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';

const bundle = await loadSiteBundle();
const model = buildDiscoveryModel(bundle);

test('M5.7 discovery model owns exactly the governed learner corpus and seven filter dimensions', () => {
  assert.equal(model.documents.length, 15);
  assert.equal(model.byContentId.size, 15);
  assert.deepEqual(model.filters.map(({ id }) => id), [
    'content-kind',
    'editorial-state',
    'formal-state',
    'publication-state',
    'representation',
    'locale',
    'translation-state'
  ]);
  assert.match(model.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(buildDiscoveryModel(bundle).fingerprint, model.fingerprint);
  assert.ok(model.documents.every((document) => document.validationOnly === false));
  assert.doesNotMatch(JSON.stringify(model.documents), /urn:fmc:validation|FMC-M5[67]|fmc\.m5[67]/iu);
});

test('all production relevance judgments contain their required governed results and preserve empty-query behavior', () => {
  for (const judgment of GLOBAL_JUDGMENTS.filter(({ id }) => !['G15', 'G16', 'G17'].includes(id))) {
    const actual = searchDiscoveryDocuments(model.documents, judgment.query).map(({ contentId }) => contentId);
    for (const required of judgment.required) assert.ok(actual.includes(required), `${judgment.id}: missing ${required} from ${actual.join(', ')}`);
    if (judgment.required.length === 0) assert.deepEqual(actual, [], judgment.id);
  }
  assert.deepEqual(searchDiscoveryDocuments(model.documents, 'FART-P2-000010').map(({ contentId }) => contentId), ['cnt:p5m56:000006']);
});

test('search normalization treats mathematical notation and multiplication wording deterministically', () => {
  assert.equal(normalizeSearchToken('  7 * (4 + 3)  '), '7 4 3');
  assert.equal(normalizeSearchToken('Negative MULTIPLICATION'), 'negative times');
  const math = searchDiscoveryDocuments(model.documents, '7 * (4 + 3)').map(({ contentId }) => contentId);
  assert.ok(math.includes('cnt:p5m56:000005'));
  assert.ok(math.includes('cnt:p5m56:000006'));
  const signs = searchDiscoveryDocuments(model.documents, 'negative multiplication').map(({ contentId }) => contentId);
  assert.ok(signs.includes('cnt:p5m56:000009'));
  assert.ok(signs.includes('cnt:p5m56:000010'));
});

test('the deterministic 2,000-document scale fixture is validation-only and exercises reserved identifiers', () => {
  const fixture = generateScaleSearchFixture(model.documents);
  const second = generateScaleSearchFixture(model.documents);
  assert.equal(fixture.count, 2_000);
  assert.equal(fixture.documents.length, 2_000);
  assert.equal(fixture.fingerprint, second.fingerprint);
  assert.equal(fixture.productionIndexEligible, false);
  assert.equal(fixture.publicCoverage, false);
  assert.ok(fixture.documents.every((document) => document.validationOnly));
  assert.deepEqual(new Set(fixture.documents.map(({ coverageState }) => coverageState)), new Set([
    'mapped', 'partially_mapped', 'unmapped', 'not_applicable', 'needs_review'
  ]));
  for (const judgment of GLOBAL_JUDGMENTS.filter(({ id }) => ['G15', 'G16', 'G17'].includes(id))) {
    const actual = searchDiscoveryDocuments(fixture.documents, judgment.query).map(({ contentId }) => contentId);
    assert.ok(actual.includes(judgment.required[0]), `${judgment.id}: ${actual.join(', ')}`);
  }
  assert.throws(() => generateScaleSearchFixture([], 2_000), /requires base documents/u);
  assert.throws(() => generateScaleSearchFixture(model.documents, 2_001), /integer from 3 to 2000/u);
});

test('client ordering privileges exact identities and then uses stable score/URL ties', () => {
  const rows = [
    { url: '/z/', score: 99, meta: { title: 'Other', 'content-id': 'cnt:z', 'search-text': 'unrelated governed page' } },
    { url: '/b/', score: 1, meta: { title: 'Exact', 'content-id': 'FART-P2-000010', 'search-text': 'exact FART-P2-000010 proof' } },
    { url: '/a/', score: 1, meta: { title: 'Exact', aliases: 'FART-P2-000010', 'search-text': 'exact FART-P2-000010 example' } }
  ];
  assert.deepEqual(sortSearchRows(rows, 'FART-P2-000010').map(({ url }) => url), ['/a/', '/b/', '/z/']);
  assert.deepEqual(sortSearchRows(rows, 'no exact').map(({ url }) => url), ['/z/', '/a/', '/b/']);
  assert.deepEqual(filterSearchRows(rows, 'FART-P2-000010').map(({ url }) => url), ['/b/', '/a/']);
  assert.deepEqual(filterSearchRows(rows, 'math.NT'), []);
});

test('query-independent content-kind prior repairs graded ranking and exposes complete metrics', () => {
  const rows = [
    { url: '/content/p5m56c0010/negative-times-negative-example/', score: 27.31, meta: { 'content-id': 'cnt:p5m56:000010', 'content-kind': 'example' } },
    { url: '/content/p5m56c0009/sign-rules-for-products/', score: 16.10, meta: { 'content-id': 'cnt:p5m56:000009', 'content-kind': 'editorial_unit' } },
    { url: '/content/p5m56c0001/integers/', score: 11, meta: { 'content-id': 'cnt:p5m56:000001', 'content-kind': 'learning_path' } }
  ];
  const ordered = sortSearchRows(rows, 'negative multiplication').map(({ meta }) => meta['content-id']);
  assert.deepEqual(ordered, ['cnt:p5m56:000009', 'cnt:p5m56:000010', 'cnt:p5m56:000001']);
  assert.deepEqual(computeRelevanceMetrics(ordered, { 'cnt:p5m56:000009': 3, 'cnt:p5m56:000010': 2 }), {
    mrr: 1,
    recallAt5: 1,
    ndcgAt5: 1
  });
  assert.deepEqual(computeRelevanceMetrics([], {}), { mrr: null, recallAt5: null, ndcgAt5: null });
  assert.deepEqual(FROZEN_RELEVANCE_JUDGMENTS.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`));
});

test('client filters always retain the learner-content boundary', () => {
  const selects = [
    { dataset: { fmcGlobalFilter: 'content-kind' }, value: 'exercise' },
    { dataset: { fmcGlobalFilter: 'locale' }, value: '' }
  ];
  assert.deepEqual(buildPagefindFilters(selects), {
    'fmc-result-kind': 'learner-content',
    'content-kind': 'exercise'
  });
});

test('global search source uses the static Pagefind API and safe deterministic rendering', async () => {
  const [component, layout, route, css] = await Promise.all([
    readFile('src/components/GlobalSearch.astro', 'utf8'),
    readFile('src/layouts/CourseLayout.astro', 'utf8'),
    readFile('src/pages/content/[routeKey]/[slug].astro', 'utf8'),
    readFile('src/styles/custom.css', 'utf8')
  ]);
  assert.match(component, /\/pagefind\/pagefind\.js/u);
  assert.match(component, /pagefind\.search\(query \|\| null, \{ filters \}\)/u);
  assert.match(component, /buildPagefindFilters/u);
  assert.match(component, /sortSearchRows/u);
  assert.match(component, /MAX_PAGEFIND_CANDIDATES/u);
  assert.match(component, /MAX_RENDERED_SEARCH_RESULTS/u);
  assert.match(component, /replaceChildren/u);
  assert.match(component, /textContent/u);
  assert.doesNotMatch(component, /innerHTML|localStorage|sessionStorage/u);
  assert.match(component, /no cached or invented results are shown/u);
  assert.match(layout, /data-pagefind-filter/u);
  assert.match(layout, /fmc-result-kind/u);
  assert.match(layout, /data-pagefind-meta/u);
  assert.match(layout, /search-text/u);
  assert.match(layout, /data-pagefind-weight="5"/u);
  assert.match(route, /buildDiscoveryModel/u);
  assert.match(route, /currentSearchDocument/u);
  assert.match(css, /\.fmc-site-actions\s*\{[\s\S]*?flex-wrap: wrap;/u);
});

test('MAT-363 implementation record preserves the scale, privacy and deployment boundaries', async () => {
  const [record, documentation] = await Promise.all([
    readFile('validation/m5-7-search-implementation-v1.json', 'utf8').then(JSON.parse),
    readFile('docs/architecture/m5-7-static-search.md', 'utf8')
  ]);
  assert.equal(record.schemaVersion, 'p5-m5.7-static-search-implementation/v1');
  assert.equal(record.issue, 'MAT-363');
  assert.equal(record.discoveryModel.fingerprint, model.fingerprint);
  assert.equal(record.staticIndex.version, '1.5.2');
  assert.equal(record.staticIndex.filterDimensions.length, 7);
  assert.equal(record.scaleFixture.documents, 2_000);
  assert.equal(record.scaleFixture.validationOnly, true);
  assert.equal(record.scaleFixture.generatedInProductionArtifact, false);
  assert.equal(record.qualification.browserRows, 'D01-D20');
  assert.equal(record.boundaries.externalRuntimeRequests, false);
  assert.equal(record.boundaries.queryOrFilterPersistence, false);
  assert.equal(record.deploymentAuthorized, false);
  assert.equal(record.nextIssue, 'MAT-364');
  assert.match(documentation, /key\[content\]/u);
  assert.match(documentation, /no cached or invented results/u);
  assert.match(documentation, /does not authorize public deployment/u);
});
