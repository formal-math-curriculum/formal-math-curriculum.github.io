import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildProjectionTree,
  createEmptyOutlineContext,
  decodeOutlinePayload,
  encodeOutlinePayload,
  filterProjection,
  getEligibleExpansionIds,
  OUTLINE_HISTORY_KEY,
  OUTLINE_PROJECTIONS,
  resolveEffectiveProjection,
  restoreOutlineHistory,
  serializeOutlineHistory,
  validateOutlineContext,
  validateOutlineManifest
} from '../src/lib/outline-navigator.mjs';

const fixtureUrl = new URL('./fixtures/outline-manifest.json', import.meta.url);
const componentUrl = new URL('../src/components/OutlineNavigator.astro', import.meta.url);
const listUrl = new URL('../src/components/OutlineList.astro', import.meta.url);
const cssUrl = new URL('../src/styles/custom.css', import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const componentSource = readFileSync(componentUrl, 'utf8');
const listSource = readFileSync(listUrl, 'utf8');
const cssSource = readFileSync(cssUrl, 'utf8');
const clone = (value = fixture) => structuredClone(value);
const projection = (manifest, id) => manifest.projections.find((item) => item.id === id);

test('manifest fixture is explicitly synthetic and passes the exact v1 boundary', () => {
  assert.equal(validateOutlineManifest(fixture).ok, true);
  assert.ok(fixture.projections.every((item) => item.fingerprint.startsWith('synthetic-')));
});

test('N01 fresh/reset state is Course and exact projection order/labels are frozen', () => {
  assert.deepEqual(
    OUTLINE_PROJECTIONS.map(({ id, label }) => ({ id, label })),
    [
      { id: 'course', label: 'Course' },
      { id: 'ontomathpro', label: 'OntoMathPRO' },
      { id: 'msc2020', label: 'MSC 2020' },
      { id: 'arxiv', label: 'arXiv' },
      { id: 'lean-mathlib', label: 'Lean / mathlib' }
    ]
  );
  assert.equal(resolveEffectiveProjection(fixture, 'course').effectiveProjection, 'course');
  assert.match(componentSource, /source === 'reset'[\s\S]*createEmptyOutlineContext/);
});

test('N02 each other current projection is an effective explicit selection', () => {
  for (const id of ['ontomathpro', 'msc2020', 'arxiv', 'lean-mathlib']) {
    const result = resolveEffectiveProjection(fixture, id);
    assert.equal(result.effectiveProjection, id);
    assert.equal(result.retainedRequestedPreference, true);
  }
  assert.match(componentSource, /store\?\.set\(\{ outlineProjection: selector\.value \}, 'outline-projection'\)/);
});

test('N03 projection runtime never owns canonical identity, pathname, link or locale', () => {
  const encoded = encodeOutlinePayload(fixture);
  assert.deepEqual(decodeOutlinePayload(encoded).currentContent, fixture.currentContent);
  assert.doesNotMatch(componentSource, /location\.(assign|replace)|history\.pushState|canonicalLink\s*=/);
  assert.match(componentSource, /history\.replaceState\([\s\S]*location\.href/);
  assert.match(componentSource, /Canonical route remains/);
});

test('N04 one entity through multiple references retains one route and one active traversal', () => {
  const references = fixture.projections.flatMap((item) => item.placements)
    .filter((item) => item.contentId === fixture.currentContent.contentId);
  assert.ok(references.length > 5);
  assert.deepEqual(new Set(references.map((item) => item.canonicalRoute)), new Set([fixture.currentContent.canonicalRoute]));
  for (const descriptor of fixture.projections) {
    assert.equal(descriptor.placements.filter((item) => item.referenceId === descriptor.activeReferenceId).length, 1);
  }
});

test('N05 OntoMathPRO multiple parents are reference placements rather than content clones', () => {
  const onto = projection(fixture, 'ontomathpro');
  const refs = onto.placements.filter((item) => item.contentId === fixture.currentContent.contentId);
  assert.deepEqual(refs.map((item) => item.parentReferenceId).sort(), ['onto:algebra', 'onto:structures']);
  assert.equal(new Set(refs.map((item) => item.referenceId)).size, 2);
  assert.equal(new Set(refs.map((item) => item.canonicalRoute)).size, 1);
});

test('N06 MSC exposes exact code levels and multiple external alignments', () => {
  const msc = projection(fixture, 'msc2020');
  assert.deepEqual(msc.structuralFilterSchema[0].options.map((item) => item.id), ['18', '20']);
  const refs = msc.placements.filter((item) => item.contentId === fixture.currentContent.contentId);
  assert.deepEqual(refs.map((item) => item.structuralTokens['msc-section'][0]).sort(), ['18', '20']);
  assert.ok(refs.some((item) => item.state === 'needs-review'));
});

test('N07 arXiv remains a shallow exact category structure', () => {
  const arxiv = projection(fixture, 'arxiv');
  assert.equal(arxiv.rootMode, 'shallow-categories');
  assert.deepEqual(arxiv.structuralFilterSchema[0].options.map((item) => item.id), ['math.GR', 'math.CT']);
  const tree = buildProjectionTree(arxiv);
  assert.equal(tree[0].children[0].children[0].referenceId, 'arxiv:gr:group');
  assert.ok(tree[0].children.every((node) => node.children.every((leaf) => leaf.children.length === 0)));
});

test('N08 Lean/mathlib starts content-centered and uses a bounded drilldown', () => {
  const lean = projection(fixture, 'lean-mathlib');
  assert.equal(lean.rootMode, 'content-centered');
  assert.equal(lean.placements[0].contentId, fixture.currentContent.contentId);
  assert.deepEqual(lean.placements.map((item) => item.kind), ['group', 'artifact', 'module', 'declaration']);
  assert.equal(validateOutlineManifest(fixture).ok, true);
});

test('N09 Course pedagogy and prerequisite placements remain separately typed', () => {
  const course = projection(fixture, 'course');
  assert.equal(course.rootMode, 'pedagogical');
  assert.ok(course.placements.some((item) => item.kind === 'presentation-heading'));
  assert.ok(course.placements.some((item) => item.kind === 'prerequisite'));
});

test('N10 universal filters work across projections while structural filters stay local', () => {
  const universal = { coverage: ['mapped'] };
  for (const id of ['course', 'ontomathpro', 'msc2020', 'arxiv', 'lean-mathlib']) {
    const result = filterProjection(fixture, id, { ...createEmptyOutlineContext(), universalFilters: universal });
    assert.ok(result.visibleReferenceIds.length > 0);
  }
  const checked = validateOutlineContext(fixture, 'course', {
    ...createEmptyOutlineContext(),
    structuralFilters: { 'msc-section': ['20'] }
  });
  assert.deepEqual(checked.value.structuralFilters, {});
  assert.deepEqual(checked.dropped, ['structural:msc-section']);
});

test('N11 filter groups use AND, tokens within a group use OR and source ordering is deterministic', () => {
  const result = filterProjection(fixture, 'msc2020', {
    ...createEmptyOutlineContext(),
    universalFilters: { coverage: ['mapped', 'review'], 'content-kind': ['definition'] },
    structuralFilters: { 'msc-section': ['18', '20'] }
  });
  assert.equal(result.resultCount, 2);
  assert.deepEqual(result.nodes.map((node) => node.referenceId), ['msc:18', 'msc:20']);
  assert.deepEqual(result.nodes.flatMap((node) => node.children).map((node) => node.referenceId), ['msc:18:group', 'msc:20:group']);
});

test('N12 switching validation drops invalid structural tokens and retains valid universal tokens', () => {
  const context = validateOutlineContext(fixture, 'arxiv', {
    ...createEmptyOutlineContext(),
    universalFilters: { coverage: ['mapped'], unknown: ['x'] },
    structuralFilters: { 'msc-section': ['20'], 'arxiv-category': ['math.GR', 'bogus'] }
  });
  assert.deepEqual(context.value.universalFilters, { coverage: ['mapped'] });
  assert.deepEqual(context.value.structuralFilters, { 'arxiv-category': ['math.GR'] });
  assert.deepEqual(context.dropped.sort(), ['structural:arxiv-category', 'structural:msc-section', 'universal:unknown']);
});

test('N13 query/filter context is ephemeral, no-result recovery exists and local reset is one action', () => {
  const result = filterProjection(fixture, 'course', { ...createEmptyOutlineContext(), query: 'does not exist' });
  assert.equal(result.resultCount, 0);
  assert.deepEqual(createEmptyOutlineContext(), { query: '', universalFilters: {}, structuralFilters: {}, expandedReferenceIds: [] });
  assert.match(componentSource, /data-fmc-clear-results/);
  assert.match(componentSource, /data-fmc-local-reset/);
  assert.doesNotMatch(componentSource, /localStorage|sessionStorage/);
});

test('N14 expand/collapse targets only visible groups in the active filtered projection', () => {
  const result = filterProjection(fixture, 'msc2020', {
    ...createEmptyOutlineContext(),
    structuralFilters: { 'msc-section': ['20'] }
  });
  assert.deepEqual(getEligibleExpansionIds(result.nodes), ['msc:20']);
  assert.doesNotMatch(componentSource, /document\.querySelectorAll/);
});

test('N15 disclosure buttons and adjacent links use native list/document keyboard semantics', () => {
  assert.match(listSource, /<ul class="fmc-outline-list"/);
  assert.match(listSource, /<li data-fmc-reference-id/);
  assert.match(listSource, /<button[\s\S]*aria-expanded="true"[\s\S]*aria-controls=/);
  assert.match(listSource, /<a href=/);
  assert.doesNotMatch(componentSource + listSource, /role=["']tree|ArrowLeft|ArrowRight|ArrowUp|ArrowDown/);
});

test('N16 wide sidebar and narrow drawer are the same logical dialog/nav data source', () => {
  assert.equal((componentSource.match(/<dialog/g) ?? []).length, 1);
  assert.equal((componentSource.match(/<nav /g) ?? []).length, 1);
  assert.match(cssSource, /position: static/);
  assert.match(cssSource, /@media \(max-width: 50rem\)[\s\S]*position: fixed/);
});

test('N17 narrow modal uses showModal, native cancel, explicit close and trigger focus restoration', () => {
  assert.match(componentSource, /dialog\.showModal\(\)/);
  assert.match(componentSource, /addEventListener\('cancel'/);
  assert.match(componentSource, /data-fmc-outline-close/);
  assert.match(componentSource, /lastTrigger\?\.focus\(\)/);
  assert.match(componentSource, /event\.target === dialog/);
});

test('N18 all mapping states have explicit placement presentation paths', () => {
  const states = new Set(fixture.projections.flatMap((item) => item.placements.map((placement) => placement.state)));
  assert.deepEqual([...states].sort(), ['mapped', 'needs-review', 'partially-mapped', 'unmapped']);
  const mutated = clone();
  mutated.projections[0].placements[4].state = 'not-applicable';
  assert.equal(validateOutlineManifest(mutated).ok, true);
  assert.match(componentSource + listSource, /state\.replaceAll\('-', ' '\)/);
});

test('N19 missing, stale-compatible, incompatible and integrity-invalid manifests fail exactly', () => {
  const unavailable = clone();
  const onto = projection(unavailable, 'ontomathpro');
  onto.state = 'unavailable';
  onto.placements = [];
  onto.activeReferenceId = null;
  assert.equal(validateOutlineManifest(unavailable).ok, true);
  assert.equal(resolveEffectiveProjection(unavailable, 'ontomathpro').effectiveProjection, 'course');

  const stale = clone();
  projection(stale, 'msc2020').state = 'stale-compatible';
  assert.match(resolveEffectiveProjection(stale, 'msc2020').status, /stale-compatible/);

  const incompatible = clone();
  const arxiv = projection(incompatible, 'arxiv');
  arxiv.state = 'incompatible';
  arxiv.placements = [];
  arxiv.activeReferenceId = null;
  assert.equal(validateOutlineManifest(incompatible).ok, true);
  assert.equal(resolveEffectiveProjection(incompatible, 'arxiv').effectiveProjection, 'course');

  const badIntegrity = clone();
  projection(badIntegrity, 'course').placements[0].parentReferenceId = 'course:groups';
  assert.equal(validateOutlineManifest(badIntegrity).ok, false);
});

test('N20 valid remembered but unavailable projection falls back without rewriting the request', () => {
  const manifest = clone();
  const lean = projection(manifest, 'lean-mathlib');
  lean.state = 'unavailable';
  lean.placements = [];
  lean.activeReferenceId = null;
  const result = resolveEffectiveProjection(manifest, 'lean-mathlib');
  assert.equal(result.requestedProjection, 'lean-mathlib');
  assert.equal(result.effectiveProjection, 'course');
  assert.equal(result.retainedRequestedPreference, true);
  assert.match(result.status, /without changing the saved request/);
});

test('N21 changed fingerprints clear stale context and recover the nearest surviving reference', () => {
  const context = { ...createEmptyOutlineContext(), query: 'group', expandedReferenceIds: ['course:foundations', 'course:groups'] };
  const payload = serializeOutlineHistory(fixture, 'course', context, 'course:groups:def');
  const next = clone();
  const course = projection(next, 'course');
  course.fingerprint = 'synthetic-course-v2';
  course.placements = course.placements.filter((item) => item.referenceId !== 'course:groups:def');
  course.activeReferenceId = null;
  const restored = restoreOutlineHistory(next, { [OUTLINE_HISTORY_KEY]: payload });
  assert.equal(restored.restored, false);
  assert.equal(restored.activeReferenceId, 'course:groups');
  assert.deepEqual(restored.context, createEmptyOutlineContext());
  assert.match(restored.status, /nearest surviving reference/);
});

test('N22 CSS covers reflow, system forced colors, reduced motion, focus and 44px targets', () => {
  assert.match(cssSource, /--fmc-control-min-size: 2\.75rem/);
  assert.match(cssSource, /@media \(max-width: 50rem\)/);
  assert.match(cssSource, /@media \(forced-colors: active\)/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cssSource, /:focus-visible/);
  assert.match(cssSource, /inline-size: min\(30rem, 100vw\)/);
});

test('N23 no-JavaScript output keeps Course hierarchy and ordinary projection/content links', () => {
  assert.match(componentSource, /<OutlineList[\s\S]*nodes=\{courseTree\}/);
  assert.match(componentSource, /Projection switching, search and filters require JavaScript/);
  assert.match(componentSource, /fmc-outline-projection-links/);
  assert.match(listSource, /href=\{node\.canonicalRoute\}/);
});

test('N24 locale and canonical route are manifest-owned and preferences never redirect', () => {
  assert.equal(fixture.locale, 'en');
  assert.match(componentSource, /lang=\{value\.locale\}/);
  assert.match(componentSource, /data-fmc-canonical-route/);
  assert.doesNotMatch(componentSource, /window\.location\s*=|location\.pathname\s*=|location\.href\s*=/);
});

test('N25 complete disclosure list exposes every placement, parent edge, state and link action', () => {
  assert.match(componentSource, /Complete projection reference list/);
  assert.match(componentSource, /descriptor\.placements/);
  assert.match(componentSource, /parentReferenceId \?\? 'root'/);
  assert.match(componentSource, /placement\.canonicalRoute/);
});

test('N26 current projection/entity/traversal and concise result updates have explicit semantics', () => {
  assert.match(componentSource, /role="status" aria-live="polite"/);
  assert.match(componentSource + listSource, /aria-current/);
  assert.match(componentSource + listSource, /current entity, alternate placement/);
  assert.match(componentSource, /matching navigation/);
});

test('invalid wrong order, duplicate references, dangling parents and route mutation are rejected', () => {
  const wrongOrder = clone();
  [wrongOrder.projections[0], wrongOrder.projections[1]] = [wrongOrder.projections[1], wrongOrder.projections[0]];
  assert.equal(validateOutlineManifest(wrongOrder).ok, false);

  const duplicate = clone();
  projection(duplicate, 'course').placements[1].referenceId = 'course:foundations';
  assert.equal(validateOutlineManifest(duplicate).ok, false);

  const dangling = clone();
  projection(dangling, 'msc2020').placements[1].parentReferenceId = 'msc:absent';
  assert.equal(validateOutlineManifest(dangling).ok, false);

  const routeMutation = clone();
  projection(routeMutation, 'arxiv').placements[2].canonicalRoute = '/a-second-route-for-the-same-content/';
  assert.equal(validateOutlineManifest(routeMutation).ok, false);
});

test('invalid tokens, active traversal, projection state payload and Lean over-depth are rejected', () => {
  const token = clone();
  projection(token, 'course').placements[0].structuralTokens.stage = ['unknown'];
  assert.equal(validateOutlineManifest(token).ok, false);

  const active = clone();
  projection(active, 'course').activeReferenceId = 'course:groups:prerequisite';
  assert.equal(validateOutlineManifest(active).ok, false);

  const unusableWithPayload = clone();
  projection(unusableWithPayload, 'arxiv').state = 'integrity-invalid';
  assert.equal(validateOutlineManifest(unusableWithPayload).ok, false);

  const deep = clone();
  const lean = projection(deep, 'lean-mathlib');
  let parentReferenceId = 'lean:declaration:group';
  for (let index = 0; index < 3; index += 1) {
    const referenceId = `lean:extra:${index}`;
    lean.placements.push({
      referenceId,
      parentReferenceId,
      kind: index % 2 === 0 ? 'artifact' : 'module',
      label: `Extra ${index}`,
      order: 0,
      state: 'mapped',
      contentId: `lean:extra:${index}`,
      canonicalRoute: `/formal/extra/${index}/`,
      aliases: [],
      universalTokens: { coverage: ['mapped'], 'content-kind': ['context'] },
      structuralTokens: { 'lean-level': [index % 2 === 0 ? 'artifact' : 'module'] }
    });
    parentReferenceId = referenceId;
  }
  assert.ok(validateOutlineManifest(deep).errors.some((error) => error.includes('exceeds the bounded depth')));
});

test('X03/X05/X07–X12/X14 ownership stays within the shared store and ephemeral component state', () => {
  assert.doesNotMatch(componentSource, /createPreferenceStore|localStorage|sessionStorage/);
  assert.match(componentSource, /detail\.source === 'reset'/);
  assert.match(componentSource, /outlineProjection/);
  assert.match(componentSource, /Preferences reset\. Course outline restored/);
  assert.match(componentSource, /Projection unchanged/);
  assert.match(componentSource, /location\.href/);
  assert.match(componentSource, /<noscript>/);
});
