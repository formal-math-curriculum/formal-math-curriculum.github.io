import { createHash } from 'node:crypto';
import {
  buildCourseModel,
  CONTENT_REVISION,
  CONTENT_TREE,
  FORMAL_DEPENDENCY_SHA256,
  LEAN_CORE_REVISION,
  LEAN_PROJECT_REVISION,
  MATHLIB_REVISION,
  SELECTOR_SHA256,
  SOURCE_IDENTITY
} from './m5-6-publication.mjs';
import { buildDiscoveryModel, SCALE_FIXTURE_ID, SCALE_FIXTURE_SEED } from './m5-7-discovery.mjs';

export const RELATION_SCHEMA_VERSION = 'p5-m5.7-relation-navigation/v1';
export const RELATION_FREEZE_DOCUMENT = 'd879fd37-8602-4cf2-b3a8-aa19d0a6e588';
export const RELATION_SYSTEMS = Object.freeze([
  Object.freeze({ id: 'course-order', label: 'Course path', authority: 'content-pedagogy' }),
  Object.freeze({ id: 'learner-prerequisite', label: 'Learner prerequisites', authority: 'project-1-readiness' }),
  Object.freeze({ id: 'downstream-use', label: 'Downstream uses', authority: 'project-1-readiness-inverse-view' }),
  Object.freeze({ id: 'ontomathpro-placement', label: 'OntoMathPRO placements', authority: 'content-alignment-snapshot' }),
  Object.freeze({ id: 'msc2020-placement', label: 'MSC 2020 placements', authority: 'content-alignment-snapshot' }),
  Object.freeze({ id: 'arxiv-placement', label: 'arXiv placements', authority: 'content-alignment-snapshot' }),
  Object.freeze({ id: 'generated-formal-dependency', label: 'Generated formal dependency', authority: 'exact-generated-formal-facts' }),
  Object.freeze({ id: 'technical-import-build', label: 'Lean import/build detail', authority: 'exact-generated-import-build-facts' })
]);

const SYSTEM_IDS = new Set(RELATION_SYSTEMS.map(({ id }) => id));
const EXTERNAL_PROJECTIONS = Object.freeze([
  Object.freeze({ projectionId: 'ontomathpro', systemId: 'ontomathpro-placement' }),
  Object.freeze({ projectionId: 'msc2020', systemId: 'msc2020-placement' }),
  Object.freeze({ projectionId: 'arxiv', systemId: 'arxiv-placement' })
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function routeFor(entity) {
  return `/content/${entity.route_key}/${entity.slug}/`;
}

function contentNode(entity) {
  return {
    id: `content:${entity.content_id}`,
    kind: 'content',
    contentId: entity.content_id,
    candidateId: entity.curriculum_candidate_id ?? null,
    label: entity.title,
    route: routeFor(entity),
    state: 'current'
  };
}

function boundaryNode(disclosure) {
  return {
    id: `candidate:${disclosure.from_candidate_id}`,
    kind: 'external-boundary',
    contentId: null,
    candidateId: disclosure.from_candidate_id,
    label: disclosure.label,
    route: null,
    state: 'outside-bounded-release'
  };
}

function findCycle(edges) {
  const children = new Map();
  for (const edge of edges) {
    const rows = children.get(edge.from) ?? [];
    rows.push(edge.to);
    children.set(edge.from, rows);
  }
  for (const rows of children.values()) rows.sort((left, right) => left.localeCompare(right, 'en'));
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const visit = (node) => {
    if (active.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) return null;
    visited.add(node);
    active.add(node);
    stack.push(node);
    for (const child of children.get(node) ?? []) {
      const cycle = visit(child);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(node);
    return null;
  };
  for (const node of [...children.keys()].sort((left, right) => left.localeCompare(right, 'en'))) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function buildReadiness(publication, entities) {
  const errors = [];
  const authorities = publication.readiness.map((record) => ({
    id: record.id,
    from: record.from_candidate_id,
    to: record.to_candidate_id,
    relation: record.relation,
    confidence: record.confidence,
    scope: record.scope,
    authority: record.authority
  })).sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const authorityById = new Map(authorities.map((record) => [record.id, record]));
  const authorityIds = new Set();
  for (const record of authorities) {
    if (authorityIds.has(record.id)) errors.push(`duplicate readiness relation: ${record.id}`);
    authorityIds.add(record.id);
    if (record.relation !== 'strict') errors.push(`invalid learner prerequisite relation type: ${record.id}:${record.relation}`);
    if (record.from === record.to) errors.push(`learner prerequisite self-edge rejected: ${record.id}:${record.from}`);
  }
  const cycle = findCycle(authorities);
  if (cycle) errors.push(`learner prerequisite cycle rejected: ${cycle.join(' -> ')}`);

  const nodes = new Map();
  const prerequisiteEdges = [];
  for (const entity of publication.content) {
    const target = contentNode(entity);
    nodes.set(target.id, target);
    for (const disclosure of entity.prerequisite_disclosures ?? []) {
      const authority = authorityById.get(disclosure.relation_id);
      if (!authority) {
        errors.push(`prerequisite disclosure has no readiness authority: ${entity.content_id}:${disclosure.relation_id}`);
        continue;
      }
      if (authority.from !== disclosure.from_candidate_id) {
        errors.push(`prerequisite source candidate mismatch: ${entity.content_id}:${disclosure.relation_id}`);
      }
      if (entity.curriculum_candidate_id !== authority.to) {
        errors.push(`prerequisite target candidate mismatch: ${entity.content_id}:${disclosure.relation_id}`);
      }
      let source;
      if (disclosure.published_in_slice) {
        const sourceEntity = entities.get(disclosure.content_id);
        if (!sourceEntity) {
          errors.push(`dangling in-slice learner prerequisite content ID: ${disclosure.content_id}`);
          continue;
        }
        if (sourceEntity.curriculum_candidate_id !== authority.from) {
          errors.push(`in-slice prerequisite content/candidate mismatch: ${disclosure.content_id}:${authority.from}`);
        }
        source = contentNode(sourceEntity);
      } else {
        if (disclosure.content_id) errors.push(`out-of-slice prerequisite must not claim a content page: ${disclosure.relation_id}`);
        source = boundaryNode(disclosure);
      }
      nodes.set(source.id, source);
      prerequisiteEdges.push({
        id: `${authority.id}:${target.contentId}`,
        system: 'learner-prerequisite',
        relationId: authority.id,
        from: source.id,
        to: target.id,
        label: 'is required before',
        state: source.state === 'current' ? 'resolved' : 'external-boundary',
        scope: disclosure.scope,
        confidence: authority.confidence,
        authority: authority.authority
      });
    }
  }
  prerequisiteEdges.sort((left, right) => left.relationId.localeCompare(right.relationId, 'en') || left.to.localeCompare(right.to, 'en'));
  const downstreamEdges = prerequisiteEdges.map((edge) => ({
    ...edge,
    id: `downstream:${edge.id}`,
    system: 'downstream-use',
    label: 'supports later study of',
    sourceEdgeId: edge.id
  }));
  return { authorities, nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id, 'en')), prerequisiteEdges, downstreamEdges, errors };
}

function buildCourse(publication, entities) {
  const errors = [];
  const seen = new Set();
  const edges = [];
  for (const reference of publication.course.references) {
    if (seen.has(reference.reference_id)) errors.push(`duplicate Course placement: ${reference.reference_id}`);
    seen.add(reference.reference_id);
    const parent = entities.get(reference.parent_content_id);
    const child = entities.get(reference.content_id);
    if (!parent) errors.push(`dangling Course parent content ID: ${reference.parent_content_id}`);
    if (!child) errors.push(`dangling Course target content ID: ${reference.content_id}`);
    if (!['primary', 'review'].includes(reference.role)) errors.push(`invalid Course placement role: ${reference.reference_id}:${reference.role}`);
    if (parent && child) edges.push({
      id: reference.reference_id,
      system: 'course-order',
      from: `content:${parent.content_id}`,
      to: `content:${child.content_id}`,
      label: reference.role === 'primary' ? 'next authored placement' : 'review placement',
      role: reference.role,
      order: reference.order,
      canonicalRoute: routeFor(child)
    });
  }
  edges.sort((left, right) => left.from.localeCompare(right.from, 'en') || left.order - right.order || left.id.localeCompare(right.id, 'en'));
  const root = entities.get(publication.course.root_content_id);
  if (!root) errors.push(`dangling Course root content ID: ${publication.course.root_content_id}`);
  const placements = [
    ...(root ? [{
      id: `course-root:${root.content_id}`,
      system: 'course-order',
      contentId: root.content_id,
      role: 'root',
      order: 0,
      parentContentId: null,
      canonicalRoute: routeFor(root),
      authorityPath: 'publication.course.root_content_id'
    }] : []),
    ...edges.map((edge) => ({
      id: edge.id,
      system: edge.system,
      contentId: edge.to.slice('content:'.length),
      role: edge.role,
      order: edge.order,
      parentContentId: edge.from.slice('content:'.length),
      canonicalRoute: edge.canonicalRoute,
      authorityPath: `publication.course.references.${edge.id}`
    }))
  ];
  return { rootContentId: publication.course.root_content_id, orderingSemantics: publication.course.ordering_semantics, placements, edges, errors };
}

function buildFormal(publication, entities) {
  const dependency = publication.generated_dependency;
  const errors = [];
  if (dependency?.schema_version !== 'p5-m56-formal-dependency-fixture/v1') errors.push('generated formal dependency schema mismatch');
  if (dependency?.canonical_sha256 !== FORMAL_DEPENDENCY_SHA256 || dependency?.expected_sha256 !== FORMAL_DEPENDENCY_SHA256) {
    errors.push('generated formal dependency fingerprint mismatch');
  }
  const entity = entities.get(dependency?.content_id);
  if (!entity) errors.push(`generated dependency has dangling content ID: ${dependency?.content_id}`);
  const block = entity?.blocks?.find((candidate) => candidate.formal_binding?.fart_id === dependency?.fart_id);
  if (!block) errors.push(`generated dependency has no exact FART binding: ${dependency?.fart_id}`);
  if (block?.formal_binding?.floc_id !== dependency?.floc_id) errors.push(`generated dependency FLOC mismatch: ${dependency?.floc_id}`);
  if (block?.formal_binding?.flink_id !== dependency?.flink_id) errors.push(`generated dependency FLINK mismatch: ${dependency?.flink_id}`);
  if (block?.lean?.module !== dependency?.module) errors.push(`generated dependency module mismatch: ${dependency?.module}`);
  if (JSON.stringify(block?.lean?.declarations ?? []) !== JSON.stringify(dependency?.declarations ?? [])) {
    errors.push(`generated dependency declaration set mismatch: ${dependency?.content_id}`);
  }
  if (publication.bases?.lean !== LEAN_PROJECT_REVISION) errors.push(`stale project formal revision: expected ${LEAN_PROJECT_REVISION}, received ${publication.bases?.lean}`);
  if (publication.bases?.lean_core !== LEAN_CORE_REVISION) errors.push(`stale Lean core revision: expected ${LEAN_CORE_REVISION}, received ${publication.bases?.lean_core}`);
  if (publication.bases?.mathlib !== MATHLIB_REVISION) errors.push(`stale mathlib revision: expected ${MATHLIB_REVISION}, received ${publication.bases?.mathlib}`);
  if (block?.lean?.revision !== MATHLIB_REVISION) errors.push(`stale dependency revision: expected ${MATHLIB_REVISION}, received ${block?.lean?.revision}`);

  const record = entity && block ? (() => {
    const content = contentNode(entity);
    const artifact = {
      id: `formal-artifact:${dependency.fart_id}`,
      kind: 'formal-artifact',
      label: dependency.fart_id,
      route: `/formal/${dependency.fart_id.toLowerCase()}/`,
      state: 'resolved'
    };
    const module = {
      id: `formal-module:${dependency.module}`,
      kind: 'formal-module',
      label: dependency.module,
      route: `/formal/module/${dependency.module.split('.').map((part) => part.toLowerCase()).join('/')}/`,
      state: 'resolved'
    };
    const declarations = dependency.declarations.map((declaration) => ({
      id: `formal-declaration:${declaration}`,
      kind: 'formal-declaration',
      label: declaration,
      route: content.route,
      state: 'resolved'
    }));
    const directEdges = [
      { id: `${dependency.flink_id}:representation`, system: 'generated-formal-dependency', from: content.id, to: artifact.id, label: 'governed representation link', relation: 'representation-link', direct: true },
      { id: `${dependency.floc_id}:locator`, system: 'generated-formal-dependency', from: artifact.id, to: module.id, label: 'exact formal locator', relation: 'formal-locator', direct: true },
      ...declarations.map((declaration, index) => ({ id: `${dependency.floc_id}:declaration:${index + 1}`, system: 'generated-formal-dependency', from: module.id, to: declaration.id, label: 'declares exact symbol', relation: 'formal-declaration', direct: true }))
    ];
    const transitivePaths = [
      { id: `${dependency.floc_id}:transitive:module`, from: content.id, to: module.id, via: [artifact.id], depth: 2, label: 'transitive locator path' },
      ...declarations.map((declaration, index) => ({ id: `${dependency.floc_id}:transitive:declaration:${index + 1}`, from: content.id, to: declaration.id, via: [artifact.id, module.id], depth: 3, label: 'transitive declaration path' }))
    ];
    return {
      id: `generated:${dependency.canonical_sha256}`,
      state: 'current',
      contentId: entity.content_id,
      schemaVersion: dependency.schema_version,
      generator: dependency.generator,
      fingerprint: dependency.canonical_sha256,
      revisions: {
        project: publication.bases.lean,
        leanCore: publication.bases.lean_core,
        mathlib: publication.bases.mathlib
      },
      nodes: [content, artifact, module, ...declarations],
      directEdges,
      transitivePaths,
      unresolved: []
    };
  })() : null;
  return { records: record ? [record] : [], errors };
}

function projectionPath(referenceId, byId) {
  const path = [];
  const visited = new Set();
  let current = byId.get(referenceId);
  while (current) {
    if (visited.has(current.referenceId)) return [];
    visited.add(current.referenceId);
    path.unshift(current.label);
    current = current.parentReferenceId ? byId.get(current.parentReferenceId) : null;
  }
  return path;
}

function externalForPage(outline, currentContent) {
  return EXTERNAL_PROJECTIONS.map(({ projectionId, systemId }) => {
    const descriptor = outline.projections.find((projection) => projection.id === projectionId);
    const byId = new Map((descriptor?.placements ?? []).map((placement) => [placement.referenceId, placement]));
    const placements = (descriptor?.placements ?? []).filter((placement) => placement.contentId === currentContent.contentId).map((placement) => ({
      referenceId: placement.referenceId,
      label: placement.label,
      state: placement.state,
      canonicalRoute: placement.canonicalRoute,
      parentReferenceId: placement.parentReferenceId,
      context: projectionPath(placement.referenceId, byId)
    }));
    for (const placement of placements) {
      if (placement.canonicalRoute !== currentContent.canonicalRoute) {
        throw new Error(`external placement canonical route drift: ${projectionId}:${placement.referenceId}`);
      }
    }
    return {
      systemId,
      projectionId,
      label: descriptor?.label ?? projectionId,
      state: descriptor?.state ?? 'unavailable',
      fingerprint: descriptor?.fingerprint ?? null,
      placements
    };
  });
}

export function validateRelationCorpus(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, value: null, errors: ['relation corpus must be an object'] };
  if (input.schemaVersion !== RELATION_SCHEMA_VERSION) errors.push(`schemaVersion must equal ${RELATION_SCHEMA_VERSION}`);
  if (input.authority?.sourceIdentity !== SOURCE_IDENTITY) errors.push('relation source identity mismatch');
  if (input.authority?.contentRevision !== CONTENT_REVISION) errors.push('relation content revision mismatch');
  if (input.authority?.contentTree !== CONTENT_TREE) errors.push('relation content tree mismatch');
  if (input.authority?.selectorSha256 !== SELECTOR_SHA256) errors.push('relation selector fingerprint mismatch');
  if (input.authority?.formalDependencySha256 !== FORMAL_DEPENDENCY_SHA256) errors.push('relation formal dependency fingerprint mismatch');
  if (input.authority?.projectRevision !== LEAN_PROJECT_REVISION) errors.push('relation project revision mismatch');
  if (input.authority?.leanCoreRevision !== LEAN_CORE_REVISION) errors.push('relation Lean core revision mismatch');
  if (input.authority?.mathlibRevision !== MATHLIB_REVISION) errors.push('relation mathlib revision mismatch');
  if (JSON.stringify(input.systems?.map(({ id }) => id)) !== JSON.stringify(RELATION_SYSTEMS.map(({ id }) => id))) errors.push('relation system order/type mismatch');
  for (const edge of [...(input.course?.edges ?? []), ...(input.readiness?.prerequisiteEdges ?? []), ...(input.readiness?.downstreamEdges ?? [])]) {
    if (!SYSTEM_IDS.has(edge.system)) errors.push(`unknown relation system: ${edge.id}:${edge.system}`);
  }
  if ((input.course?.edges ?? []).some((edge) => edge.system !== 'course-order')) errors.push('Course edge relabeled as another relation type');
  if ((input.readiness?.prerequisiteEdges ?? []).some((edge) => edge.system !== 'learner-prerequisite')) errors.push('learner prerequisite edge type conversion rejected');
  if ((input.readiness?.downstreamEdges ?? []).some((edge) => edge.system !== 'downstream-use')) errors.push('downstream-use edge type conversion rejected');
  const readinessCycle = findCycle(input.readiness?.authorities ?? []);
  if (readinessCycle) errors.push(`learner prerequisite cycle rejected: ${readinessCycle.join(' -> ')}`);
  for (const edge of input.readiness?.authorities ?? []) {
    if (edge.from === edge.to) errors.push(`learner prerequisite self-edge rejected: ${edge.id}:${edge.from}`);
    if (edge.relation !== 'strict') errors.push(`invalid learner prerequisite relation type: ${edge.id}:${edge.relation}`);
  }
  const nodeIds = new Set((input.contentNodes ?? []).map(({ id }) => id));
  for (const edge of input.course?.edges ?? []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`dangling Course edge rejected: ${edge.id}`);
  }
  const modelFingerprint = input.fingerprint;
  const candidate = structuredClone(input);
  delete candidate.fingerprint;
  if (modelFingerprint !== `sha256:${sha256(candidate)}`) errors.push('relation corpus fingerprint mismatch');
  return errors.length ? { ok: false, value: null, errors: [...new Set(errors)] } : { ok: true, value: input, errors: [] };
}

export function buildRelationCorpus(bundle) {
  const entities = new Map(bundle.publication.content.map((entity) => [entity.content_id, entity]));
  const contentNodes = bundle.publication.content.map(contentNode).sort((left, right) => left.route.localeCompare(right.route, 'en'));
  const course = buildCourse(bundle.publication, entities);
  const readiness = buildReadiness(bundle.publication, entities);
  const formal = buildFormal(bundle.publication, entities);
  const errors = [...course.errors, ...readiness.errors, ...formal.errors];
  if (errors.length) throw new Error(`M5.7 relation corpus rejected:\n${[...new Set(errors)].join('\n')}`);
  const corpus = {
    schemaVersion: RELATION_SCHEMA_VERSION,
    freezeDocument: RELATION_FREEZE_DOCUMENT,
    authority: {
      sourceIdentity: SOURCE_IDENTITY,
      contentRevision: CONTENT_REVISION,
      contentTree: CONTENT_TREE,
      selectorSha256: SELECTOR_SHA256,
      formalDependencySha256: FORMAL_DEPENDENCY_SHA256,
      projectRevision: bundle.publication.bases.lean,
      leanCoreRevision: bundle.publication.bases.lean_core,
      mathlibRevision: bundle.publication.bases.mathlib
    },
    systems: RELATION_SYSTEMS,
    contentNodes,
    course: { rootContentId: course.rootContentId, orderingSemantics: course.orderingSemantics, placements: course.placements, edges: course.edges },
    readiness: {
      authorities: readiness.authorities,
      nodes: readiness.nodes,
      prerequisiteEdges: readiness.prerequisiteEdges,
      downstreamEdges: readiness.downstreamEdges
    },
    formal,
    boundaries: {
      externalPayloads: bundle.publication.external_payloads.length,
      externalProjectionStates: bundle.outline.projections.filter(({ id }) => ['ontomathpro', 'msc2020', 'arxiv'].includes(id)).map(({ id, state, fingerprint }) => ({ id, state, fingerprint })),
      technicalImportBuildState: 'no-qualified-edges-in-bounded-input',
      relationStatePersistence: false,
      progressTracking: false,
      deploymentAuthorized: false
    }
  };
  corpus.fingerprint = `sha256:${sha256(corpus)}`;
  const result = validateRelationCorpus(corpus);
  if (!result.ok) throw new Error(`M5.7 relation corpus rejected:\n${result.errors.join('\n')}`);
  return result.value;
}

function nodeById(corpus) {
  return new Map([...corpus.contentNodes, ...corpus.readiness.nodes, ...corpus.formal.records.flatMap(({ nodes }) => nodes)].map((node) => [node.id, node]));
}

export function makePageRelations(bundle, entity, { outline } = {}) {
  const corpus = buildRelationCorpus(bundle);
  const courseModel = buildCourseModel(bundle);
  const context = courseModel.context(entity.content_id);
  const currentId = `content:${entity.content_id}`;
  const nodes = nodeById(corpus);
  const prerequisites = corpus.readiness.prerequisiteEdges.filter(({ to }) => to === currentId).map((edge) => ({ edge, source: nodes.get(edge.from), target: nodes.get(edge.to) }));
  const downstreamUses = corpus.readiness.downstreamEdges.filter(({ from }) => from === currentId).map((edge) => ({ edge, source: nodes.get(edge.from), target: nodes.get(edge.to) }));
  const formalRecords = corpus.formal.records.filter(({ contentId }) => contentId === entity.content_id);
  const actualOutline = outline ?? bundle.outline;
  const currentContent = { contentId: entity.content_id, canonicalRoute: routeFor(entity), label: entity.title };
  const externalSystems = externalForPage(actualOutline, currentContent);
  const visualNodes = new Map([[currentId, nodes.get(currentId)]]);
  const visualEdges = [];
  for (const item of prerequisites) {
    visualNodes.set(item.source.id, item.source);
    visualEdges.push(item.edge);
  }
  for (const item of downstreamUses) {
    visualNodes.set(item.target.id, item.target);
    visualEdges.push(item.edge);
  }
  for (const record of formalRecords) {
    for (const node of record.nodes) visualNodes.set(node.id, node);
    visualEdges.push(...record.directEdges);
  }
  const page = {
    schemaVersion: RELATION_SCHEMA_VERSION,
    corpusFingerprint: corpus.fingerprint,
    currentContent,
    prerequisites,
    downstreamUses,
    course: {
      orderingSemantics: corpus.course.orderingSemantics,
      root: { contentId: courseModel.traversal[0], route: courseModel.routes.get(courseModel.traversal[0]), label: courseModel.byId.get(courseModel.traversal[0]).title },
      previous: context.previous ? { contentId: context.previous.entity.content_id, route: context.previous.route, label: context.previous.entity.title } : null,
      next: context.next ? { contentId: context.next.entity.content_id, route: context.next.route, label: context.next.entity.title } : null,
      placements: corpus.course.placements.filter(({ contentId }) => contentId === entity.content_id).map((placement) => ({
        referenceId: placement.id,
        role: placement.role,
        order: placement.order,
        parentContentId: placement.parentContentId,
        canonicalRoute: placement.canonicalRoute,
        authorityPath: placement.authorityPath
      }))
    },
    externalSystems,
    formalRecords,
    technicalImportBuild: {
      state: 'unavailable',
      reason: 'No qualified module-import or build-dependency edge exists in this bounded generated input. Module paths are not treated as inferred imports.'
    },
    visual: {
      nodes: [...visualNodes.values()],
      edges: visualEdges,
      currentNodeId: currentId,
      ordering: 'prerequisite-then-current-then-downstream-then-formal-direct-path'
    },
    authority: corpus.authority,
    boundaries: corpus.boundaries
  };
  page.fingerprint = `sha256:${sha256(page)}`;
  return page;
}

export function generateScaleRelationFixture(bundle, count = 2_000) {
  if (!Number.isInteger(count) || count !== 2_000) throw new Error('M5.7 relation scale fixture requires exactly 2000 documents');
  const discovery = buildDiscoveryModel(bundle);
  const documents = Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(6, '0');
    const template = discovery.documents[index % discovery.documents.length];
    return { id: `validation:m57:${ordinal}`, label: `${template.title} — relation scale ${ordinal}`, route: `/validation/m5-7/scale/${ordinal}/`, validationOnly: true };
  });
  const projectionIds = ['course', 'ontomathpro', 'msc2020', 'arxiv', 'lean-mathlib'];
  const placements = documents.flatMap((document, index) => {
    const primary = { id: `placement:${String(index + 1).padStart(6, '0')}:a`, documentId: document.id, projectionId: projectionIds[index % projectionIds.length], validationOnly: true };
    const duplicate = index % 10 === 0 ? [{ id: `placement:${String(index + 1).padStart(6, '0')}:b`, documentId: document.id, projectionId: projectionIds[(index + 1) % projectionIds.length], validationOnly: true }] : [];
    return [primary, ...duplicate];
  });
  const prerequisiteNodes = documents.slice(0, 120).map(({ id }) => id);
  const prerequisiteEdges = prerequisiteNodes.slice(1).map((to, index) => ({ id: `validation-ready-${String(index + 1).padStart(4, '0')}`, from: prerequisiteNodes[index], to, relation: 'strict', validationOnly: true }));
  const directFormalEdges = Array.from({ length: 150 }, (_, index) => ({ id: `validation-formal-direct-${String(index + 1).padStart(4, '0')}`, from: documents[index].id, to: `validation:formal:${String(index + 1).padStart(4, '0')}`, relation: 'generated-formal-dependency', validationOnly: true }));
  const twoHopChains = Array.from({ length: 25 }, (_, index) => ({
    id: `validation-formal-chain-${String(index + 1).padStart(4, '0')}`,
    nodes: [documents[index].id, `validation:formal:middle:${String(index + 1).padStart(4, '0')}`, `validation:formal:target:${String(index + 1).padStart(4, '0')}`],
    relations: ['generated-formal-dependency', 'generated-formal-dependency'],
    validationOnly: true
  }));
  const unresolvedEdges = Array.from({ length: 10 }, (_, index) => ({ id: `validation-formal-unresolved-${String(index + 1).padStart(4, '0')}`, from: documents[index + 150].id, unresolvedTarget: `missing:formal:${String(index + 1).padStart(4, '0')}`, reason: 'validation-only-unresolved-mapping', validationOnly: true }));
  const fixture = {
    schemaVersion: 'p5-m5.7-scale-relation-fixture/v1',
    fixtureId: SCALE_FIXTURE_ID,
    seed: SCALE_FIXTURE_SEED,
    documents,
    placements,
    prerequisite: { nodes: prerequisiteNodes, edges: prerequisiteEdges },
    formal: { directEdges: directFormalEdges, twoHopChains, unresolvedEdges },
    invalidFixtures: {
      selfEdge: { from: prerequisiteNodes[0], to: prerequisiteNodes[0], relation: 'strict' },
      danglingEdge: { from: prerequisiteNodes[0], to: 'validation:m57:missing', relation: 'strict' },
      cycle: [
        { from: prerequisiteNodes[0], to: prerequisiteNodes[1], relation: 'strict' },
        { from: prerequisiteNodes[1], to: prerequisiteNodes[2], relation: 'strict' },
        { from: prerequisiteNodes[2], to: prerequisiteNodes[0], relation: 'strict' }
      ],
      invalidTypeConversion: { from: prerequisiteNodes[0], to: prerequisiteNodes[1], relation: 'course-order-as-prerequisite' }
    },
    productionEligible: false,
    publicCoverage: false
  };
  return { ...fixture, fingerprint: `sha256:${sha256(fixture)}` };
}
