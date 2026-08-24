import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildCourseModel,
  buildFormalRecords,
  CONTENT_REVISION,
  FORMAL_DEPENDENCY_SHA256,
  loadSiteBundle,
  makePageOutline,
  searchDocuments,
  SELECTOR_SHA256,
  toRepresentationBlock,
  validateSiteBundle
} from '../src/lib/m5-6-publication.mjs';
import { filterProjection, validateOutlineManifest } from '../src/lib/outline-navigator.mjs';
import { validateRepresentationBlock } from '../src/lib/representation-block.mjs';

const bundleDir = '.inputs/content/generated/m5-6';
const bundle = await loadSiteBundle({ bundleDir });
const model = buildCourseModel(bundle);

test('exact merged governed bundle is accepted without synthetic or locale leakage', () => {
  const result = validateSiteBundle(bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(CONTENT_REVISION, '2da8fdb43074d00fea5fc6201d239e5f26a43250');
  assert.equal(bundle.manifest.freeze_selector_sha256, SELECTOR_SHA256);
  assert.equal(bundle.publication.generated_dependency.canonical_sha256, FORMAL_DEPENDENCY_SHA256);
  assert.equal(bundle.publication.content.length, 15);
  assert.equal(bundle.publication.external_payloads.length, 0);
  assert.ok(bundle.manifest.routes.every((route) => route.locale === 'en' && !route.path.startsWith('/pt/')));
});

test('Course traversal has three deep branches and one canonical repeated exercise', () => {
  assert.equal(model.traversal.length, 15);
  assert.deepEqual(model.traversal.slice(0, 4), [
    'cnt:p5m56:000001',
    'cnt:p5m56:000002',
    'cnt:p5m56:000003',
    'cnt:p5m56:000004'
  ]);
  assert.ok(model.traversal.indexOf('cnt:p5m56:000011') < model.traversal.indexOf('cnt:p5m56:000007'));
  const exercise = model.context('cnt:p5m56:000006');
  assert.deepEqual(exercise.placements.map((placement) => placement.reference_id), ['m56cr0005', 'm56cr0013']);
  assert.equal(new Set(exercise.placements.map(() => exercise.route)).size, 1);
  assert.equal(exercise.entity.exercise.solution_initially_open, false);
});

test('all ten governed blocks adapt to validated rendered, LaTeX and exact Lean provenance', () => {
  const blocks = bundle.publication.content.flatMap((entity) =>
    entity.blocks.map((block) => ({ entity, block, adapted: toRepresentationBlock(entity, block) }))
  );
  assert.equal(blocks.length, 10);
  for (const { block, adapted } of blocks) {
    const result = validateRepresentationBlock(adapted, { hasRenderedContent: true });
    assert.equal(result.ok, true, `${block.block_id}: ${result.errors.join('; ')}`);
    assert.equal(result.value.representations.latex.source, block.latex);
    assert.equal(result.value.representations.lean.source, block.lean.source);
    assert.equal(result.value.representations.lean.provenance.revision, block.lean.revision);
  }
});

test('every learner page gets a valid current-content Course/Lean outline', () => {
  for (const entity of bundle.publication.content) {
    const outline = makePageOutline(bundle, entity);
    const result = validateOutlineManifest(outline);
    assert.equal(result.ok, true, `${entity.content_id}: ${result.errors.join('; ')}`);
    assert.equal(outline.currentContent.contentId, entity.content_id);
    assert.ok(outline.projections[0].placements.some((placement) => placement.contentId === entity.content_id));
    const lean = outline.projections[4];
    assert.equal(lean.state, entity.blocks.length ? 'current' : 'unavailable');
  }
});

test('outline demonstrates exercise-only and combined Module+Unit filtering', () => {
  const outline = makePageOutline(bundle, model.byId.get('cnt:p5m56:000006'));
  const exercises = filterProjection(outline, 'course', {
    query: '',
    universalFilters: { 'content-kind': ['exercise'] },
    structuralFilters: {},
    expandedReferenceIds: []
  });
  assert.equal(exercises.resultCount, 2);
  const exerciseRoutes = outline.projections[0].placements
    .filter((placement) => exercises.matchingReferenceIds.includes(placement.referenceId))
    .map((placement) => placement.canonicalRoute);
  assert.equal(new Set(exerciseRoutes).size, 1);

  const moduleAndUnit = filterProjection(outline, 'course', {
    query: '',
    universalFilters: {},
    structuralFilters: {
      module: ['natural-number-operations'],
      unit: ['distribute-and-cancel']
    },
    expandedReferenceIds: []
  });
  assert.ok(moduleAndUnit.resultCount >= 4);
  assert.ok(moduleAndUnit.matchingReferenceIds.includes('m56cr0002'));
  assert.ok(moduleAndUnit.matchingReferenceIds.includes('m56cr0005'));
});

test('every derived formal navigation route resolves to one bounded formal record', () => {
  const records = buildFormalRecords(bundle);
  const routes = new Set(records.map((record) => record.route));
  assert.equal(records.length, 20);
  for (const entity of bundle.publication.content) {
    const outline = makePageOutline(bundle, entity);
    for (const placement of outline.projections[4].placements) {
      if (placement.canonicalRoute.startsWith('/formal/')) assert.ok(routes.has(placement.canonicalRoute), placement.canonicalRoute);
    }
  }
});

test('global search is deterministic across titles, curriculum IDs and formal IDs', () => {
  assert.deepEqual(searchDocuments(bundle.search.documents, 'FART-P2-000010').map((item) => item.content_id), ['cnt:p5m56:000006']);
  assert.ok(searchDocuments(bundle.search.documents, 'distributive exercise').some((item) => item.content_id === 'cnt:p5m56:000006'));
  assert.deepEqual(searchDocuments(bundle.search.documents, 'no such governed page'), []);
  assert.equal(searchDocuments(bundle.search.documents, '').length, 15);
});

test('learner route sources expose required recovery, search, navigation and non-claim contracts', async () => {
  const [layout, page, route, recovery, artifactValidator] = await Promise.all([
    readFile('src/layouts/CourseLayout.astro', 'utf8'),
    readFile('src/components/CoursePage.astro', 'utf8'),
    readFile('src/pages/content/[routeKey]/[slug].astro', 'utf8'),
    readFile('src/pages/404.astro', 'utf8'),
    readFile('scripts/validate-m5-6-artifact.mjs', 'utf8')
  ]);
  assert.match(layout, /<GlobalSearch/);
  assert.match(layout, /<OutlineNavigator/);
  assert.match(layout, /data-pagefind-body/);
  assert.match(page, /data-fmc-exercise-solution/);
  assert.match(page, /localePortuguese\.translation_state/);
  assert.match(page, /no fabricated route or translation/);
  assert.match(page, /does not claim full-course coverage/);
  assert.match(route, /getStaticPaths/);
  assert.match(recovery, /will not invent a translation/);
  assert.match(artifactValidator, /broken internal link/);
  assert.match(artifactValidator, /Portuguese route leaked into sitemap/);
  assert.match(artifactValidator, /exercise solution must be closed initially/);
});

test('bundle validator rejects incompatible and leaking inputs', () => {
  const stale = structuredClone(bundle);
  stale.manifest.freeze_selector_sha256 = '0'.repeat(64);
  assert.match(validateSiteBundle(stale).errors.join('\n'), /selector hash mismatch/);
  const leaking = structuredClone(bundle);
  leaking.publication.content[0].summary = 'FMC-M56-A';
  assert.match(validateSiteBundle(leaking).errors.join('\n'), /validation fixture leaked/);
});

test('versioned MAT-361 candidate record retains the qualification and deployment boundary', async () => {
  const record = JSON.parse(await readFile('validation/m5-6-implementation-candidate.json', 'utf8'));
  assert.equal(record.schemaVersion, 'p5-m5.6-implementation-candidate/v1');
  assert.equal(record.content.revision, CONTENT_REVISION);
  assert.equal(record.expectedArtifact.learnerContentPages, 15);
  assert.equal(record.expectedArtifact.derivedFormalRecords, 20);
  assert.equal(record.expectedArtifact.projectionLandingPages, 5);
  assert.equal(record.expectedArtifact.portugueseRoutes, 0);
  assert.equal(record.implementationGates.nodeTests, 104);
  assert.equal(record.implementationGates.m5_6CleanInputQualification, 'owned_by_MAT-376');
  assert.equal(record.deploymentAuthorized, false);
  assert.equal(record.nextIssue, 'MAT-376');
});
