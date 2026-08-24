import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadSiteBundle, makePageOutline, makeValidationOutline } from '../src/lib/m5-6-publication.mjs';
import {
  buildRelationCorpus,
  generateScaleRelationFixture,
  makePageRelations,
  RELATION_SCHEMA_VERSION,
  RELATION_SYSTEMS,
  validateRelationCorpus
} from '../src/lib/m5-7-relations.mjs';

const bundle = await loadSiteBundle();
const corpus = buildRelationCorpus(bundle);
const byId = new Map(bundle.publication.content.map((entity) => [entity.content_id, entity]));

function page(contentId, outline = makePageOutline(bundle, byId.get(contentId))) {
  return makePageRelations(bundle, byId.get(contentId), { outline });
}

test('relation corpus preserves all eight systems and exact frozen authority', () => {
  assert.equal(corpus.schemaVersion, RELATION_SCHEMA_VERSION);
  assert.deepEqual(corpus.systems.map(({ id }) => id), RELATION_SYSTEMS.map(({ id }) => id));
  assert.equal(corpus.contentNodes.length, 15);
  assert.equal(corpus.course.edges.length, 15);
  assert.equal(corpus.course.placements.length, 16);
  assert.equal(corpus.readiness.authorities.length, 2);
  assert.equal(corpus.readiness.prerequisiteEdges.length, 3);
  assert.equal(corpus.readiness.downstreamEdges.length, 3);
  assert.equal(corpus.formal.records.length, 1);
  assert.equal(corpus.authority.contentRevision, '2da8fdb43074d00fea5fc6201d239e5f26a43250');
  assert.equal(corpus.authority.contentTree, 'd51b0c7cfe44feec2b6eb176fd6ce1825a8ab458');
  assert.equal(corpus.authority.mathlibRevision, 'db584cd6d46c92f209a44c0f1c829460d327499d');
  assert.match(corpus.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(buildRelationCorpus(bundle).fingerprint, corpus.fingerprint);
});

test('R01 keeps the out-of-slice prerequisite as an explicit boundary without a fabricated route', () => {
  const model = page('cnt:p5m56:000004');
  assert.equal(model.prerequisites.length, 1);
  const [{ edge, source }] = model.prerequisites;
  assert.equal(edge.relationId, 'READY-P1-000001');
  assert.equal(edge.state, 'external-boundary');
  assert.equal(source.candidateId, 'CAND-P1-000003');
  assert.equal(source.route, null);
  assert.equal(source.state, 'outside-bounded-release');
});

test('R02 prerequisite and downstream-use views agree while retaining distinct types and labels', () => {
  const prerequisitePage = page('cnt:p5m56:000009');
  const downstreamPage = page('cnt:p5m56:000004');
  assert.equal(prerequisitePage.prerequisites.length, 1);
  assert.equal(downstreamPage.downstreamUses.length, 1);
  const prerequisite = prerequisitePage.prerequisites[0].edge;
  const downstream = downstreamPage.downstreamUses[0].edge;
  assert.equal(prerequisite.relationId, 'READY-P1-000006');
  assert.equal(downstream.relationId, prerequisite.relationId);
  assert.equal(prerequisite.system, 'learner-prerequisite');
  assert.equal(downstream.system, 'downstream-use');
  assert.notEqual(prerequisite.label, downstream.label);
  assert.equal(prerequisite.from, downstream.from);
  assert.equal(prerequisite.to, downstream.to);
});

test('R03 Course multi-placement keeps one canonical identity and route', () => {
  const model = page('cnt:p5m56:000006');
  assert.deepEqual(model.course.placements.map(({ referenceId }) => referenceId), ['m56cr0005', 'm56cr0013']);
  assert.equal(new Set(model.course.placements.map(({ canonicalRoute }) => canonicalRoute)).size, 1);
  assert.ok(model.course.placements.every(({ canonicalRoute }) => canonicalRoute === model.currentContent.canonicalRoute));
});

test('Course root authority is preserved as the sixteenth exact placement', () => {
  const model = page('cnt:p5m56:000001');
  assert.equal(model.course.placements.length, 1);
  assert.deepEqual(model.course.placements[0], {
    referenceId: 'course-root:cnt:p5m56:000001',
    role: 'root',
    order: 0,
    parentContentId: null,
    canonicalRoute: '/content/p5m56c0001/arithmetic-to-algebra/',
    authorityPath: 'publication.course.root_content_id'
  });
});

test('R04 Course order with no readiness record does not manufacture a prerequisite', () => {
  const courseEdge = corpus.course.edges.find(({ from, to }) => from === 'content:cnt:p5m56:000001' && to === 'content:cnt:p5m56:000002');
  assert.ok(courseEdge);
  assert.equal(courseEdge.system, 'course-order');
  assert.equal(corpus.readiness.prerequisiteEdges.some(({ from, to }) => from === courseEdge.from && to === courseEdge.to), false);
  assert.equal(page('cnt:p5m56:000002').prerequisites.length, 0);
});

test('R05 exact generated chain remains content-centered and revision scoped', () => {
  const model = page('cnt:p5m56:000004');
  assert.equal(model.formalRecords.length, 1);
  const [record] = model.formalRecords;
  assert.deepEqual(record.nodes.map(({ label }) => label), [
    'Natural-number operation laws',
    'FART-P2-000005',
    'Mathlib.Algebra.Ring.Nat',
    'Nat.instDistrib'
  ]);
  assert.deepEqual(record.directEdges.map(({ relation }) => relation), ['representation-link', 'formal-locator', 'formal-declaration']);
  assert.deepEqual(record.transitivePaths.map(({ depth }) => depth), [2, 3]);
  assert.equal(record.fingerprint, 'f8c79c8d196952e4827c72d394039862935689b2e100f821697c41bad8cb1438');
  assert.equal(record.revisions.mathlib, 'db584cd6d46c92f209a44c0f1c829460d327499d');
});

test('R06 and R08 validation-only scale facts provide direct, transitive and unresolved cases deterministically', () => {
  const fixture = generateScaleRelationFixture(bundle);
  const second = generateScaleRelationFixture(bundle);
  assert.equal(fixture.fingerprint, second.fingerprint);
  assert.equal(fixture.documents.length, 2_000);
  assert.equal(fixture.placements.length, 2_200);
  assert.equal(fixture.prerequisite.nodes.length, 120);
  assert.equal(fixture.prerequisite.edges.length, 119);
  assert.equal(fixture.formal.directEdges.length, 150);
  assert.equal(fixture.formal.twoHopChains.length, 25);
  assert.equal(fixture.formal.unresolvedEdges.length, 10);
  assert.ok(fixture.formal.twoHopChains.every(({ nodes }) => nodes.length === 3));
  assert.ok(fixture.formal.unresolvedEdges.every(({ reason }) => reason === 'validation-only-unresolved-mapping'));
  assert.equal(fixture.productionEligible, false);
  assert.equal(fixture.publicCoverage, false);
  assert.ok(fixture.documents.every(({ validationOnly }) => validationOnly));
});

test('R07 a mismatched mathlib revision fails visibly instead of mixing formal inputs', () => {
  const stale = structuredClone(bundle);
  stale.publication.bases.mathlib = '0'.repeat(40);
  assert.throws(() => buildRelationCorpus(stale), /stale mathlib revision/u);

  const wrongFingerprint = structuredClone(bundle);
  wrongFingerprint.publication.generated_dependency.canonical_sha256 = '0'.repeat(64);
  assert.throws(() => buildRelationCorpus(wrongFingerprint), /formal dependency fingerprint mismatch/u);

  const staleProject = structuredClone(bundle);
  staleProject.publication.bases.lean = '0'.repeat(40);
  assert.throws(() => buildRelationCorpus(staleProject), /stale project formal revision/u);

  const staleCore = structuredClone(bundle);
  staleCore.publication.bases.lean_core = '0'.repeat(40);
  assert.throws(() => buildRelationCorpus(staleCore), /stale Lean core revision/u);
});

test('R09 and R10 self-edge and complete prerequisite cycle paths are rejected', () => {
  const selfEdge = structuredClone(bundle);
  selfEdge.publication.readiness[0].from_candidate_id = selfEdge.publication.readiness[0].to_candidate_id;
  assert.throws(() => buildRelationCorpus(selfEdge), /self-edge rejected/u);

  const cyclic = structuredClone(bundle);
  cyclic.publication.readiness.push({
    id: 'READY-VALIDATION-CYCLE',
    from_candidate_id: 'CAND-P1-000009',
    to_candidate_id: 'CAND-P1-000003',
    relation: 'strict',
    confidence: 'validation',
    scope: 'validation-only cycle',
    authority: 'validation-only'
  });
  assert.throws(() => buildRelationCorpus(cyclic), /CAND-P1-000003 -> CAND-P1-000004 -> CAND-P1-000009 -> CAND-P1-000003/u);
});

test('R11 dangling Course and readiness content references fail with the exact missing ID', () => {
  const danglingCourse = structuredClone(bundle);
  danglingCourse.publication.course.references[0].content_id = 'cnt:p5m56:999999';
  assert.throws(() => buildRelationCorpus(danglingCourse), /cnt:p5m56:999999/u);

  const danglingReadiness = structuredClone(bundle);
  const entity = danglingReadiness.publication.content.find(({ content_id }) => content_id === 'cnt:p5m56:000009');
  entity.prerequisite_disclosures[0].content_id = 'cnt:p5m56:888888';
  assert.throws(() => buildRelationCorpus(danglingReadiness), /cnt:p5m56:888888/u);
});

test('R12 external validation multi-parent placements round-trip to one canonical content identity', () => {
  const outline = makeValidationOutline(bundle);
  const model = page(bundle.validationFixture.subject_content_id, outline);
  const onto = model.externalSystems.find(({ projectionId }) => projectionId === 'ontomathpro');
  assert.equal(onto.state, 'current');
  assert.equal(onto.placements.length, 2);
  assert.equal(new Set(onto.placements.map(({ canonicalRoute }) => canonicalRoute)).size, 1);
  assert.ok(onto.placements.every(({ canonicalRoute }) => canonicalRoute === model.currentContent.canonicalRoute));
  assert.equal(new Set(onto.placements.map(({ referenceId }) => referenceId)).size, 2);
});

test('R13 projection switching is not part of relation identity, route or locale state', () => {
  const model = page('cnt:p5m56:000004');
  assert.equal(Object.hasOwn(model, 'activeProjection'), false);
  assert.equal(model.currentContent.canonicalRoute, '/content/p5m56c0004/natural-number-operation-laws/');
  assert.equal(model.currentContent.contentId, 'cnt:p5m56:000004');
  assert.equal(model.boundaries.relationStatePersistence, false);
  assert.equal(model.boundaries.progressTracking, false);
});

test('R14 Course/import/classification edge conversion to learner prerequisite is rejected', () => {
  const invalid = structuredClone(corpus);
  invalid.readiness.prerequisiteEdges[0].system = 'course-order';
  const result = validateRelationCorpus(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /learner prerequisite edge type conversion rejected/u);
});

test('technical import/build absence and external projection states remain explicit', () => {
  const model = page('cnt:p5m56:000004');
  assert.equal(model.technicalImportBuild.state, 'unavailable');
  assert.match(model.technicalImportBuild.reason, /No qualified module-import or build-dependency edge/u);
  assert.deepEqual(model.externalSystems.map(({ projectionId, state }) => [projectionId, state]), [
    ['ontomathpro', 'unavailable'],
    ['msc2020', 'license-needs-review'],
    ['arxiv', 'unavailable']
  ]);
});

test('relation component is complete static HTML with bounded progressive enhancement and no persistence', async () => {
  const [component, coursePage, route, css] = await Promise.all([
    readFile('src/components/RelationNavigator.astro', 'utf8'),
    readFile('src/components/CoursePage.astro', 'utf8'),
    readFile('src/pages/content/[routeKey]/[slug].astro', 'utf8'),
    readFile('src/styles/custom.css', 'utf8')
  ]);
  for (const text of ['Learner prerequisites', 'Downstream uses', 'Course path', 'External classification placements', 'Generated Lean / mathlib dependency drill-down', 'Lean import/build detail']) {
    assert.match(component, new RegExp(text.replaceAll('/', '\\/'), 'u'));
  }
  assert.match(component, /data-fmc-formal-direct-list/u);
  assert.match(component, /data-fmc-formal-transitive-list/u);
  assert.match(component, /Complete relation-system and release boundary/u);
  assert.match(component, /ordinary deep links remain available/u);
  assert.match(component, /--fmc-relation-zoom/u);
  assert.doesNotMatch(component, /localStorage|sessionStorage|innerHTML|fetch\(/u);
  assert.match(coursePage, /<RelationNavigator model=\{relations\}/u);
  assert.match(coursePage, /data-fmc-relation-search-boundary="pagefind-excluded"[\s\S]*data-pagefind-ignore/u);
  assert.match(route, /makePageRelations/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.fmc-relation-map__edges/u);
  assert.match(css, /@media \(max-width: 50rem\)[\s\S]*?\.fmc-relation-grid/u);
});

test('relation scale fixture cannot change cardinality or leak into production output', () => {
  assert.throws(() => generateScaleRelationFixture(bundle, 1_999), /exactly 2000/u);
  const serializedProduction = JSON.stringify(page('cnt:p5m56:000004'));
  assert.doesNotMatch(serializedProduction, /validation:m57|validation-formal|relation scale/u);
});
