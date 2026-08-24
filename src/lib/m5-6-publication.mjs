import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LATEX_MATHML_RENDERER } from './latex-mathml.mjs';
import { validateOutlineManifest } from './outline-navigator.mjs';

const root = resolve(process.env.FMC_SITE_ROOT ?? process.cwd());
const inputLock = JSON.parse(await readFile(resolve(root, 'inputs.lock.json'), 'utf8'));
const contentLock = inputLock.consumed?.content ?? {};

export const CONTENT_REVISION = contentLock.revision;
export const CONTENT_TREE = contentLock.tree;
export const SOURCE_IDENTITY = contentLock.source_identity;
export const SELECTOR_SHA256 = contentLock.selector_sha256;
export const FORMAL_DEPENDENCY_SHA256 = contentLock.formal_dependency_sha256;
export const LEAN_PROJECT_REVISION = inputLock.recorded_not_consumed?.lean?.revision;
export const LEAN_CORE_REVISION = inputLock.recorded_not_consumed?.lean_core?.revision;
export const MATHLIB_REVISION = inputLock.recorded_not_consumed?.mathlib?.revision;

const bundleNames = [
  'content-manifest.json',
  'outline-manifest.json',
  'provenance.json',
  'publication.json',
  'search-index.json',
  'validation-fixture.json'
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function routeFor(entity) {
  return `/content/${entity.route_key}/${entity.slug}/`;
}

function contentKindToken(kind) {
  if (['learning_path', 'module', 'unit'].includes(kind)) return 'structure';
  return kind.replaceAll('_', '-');
}

function formalModuleRoute(module) {
  return `/formal/module/${module.split('.').map((part) => part.toLowerCase()).join('/')}/`;
}

function formalArtifactRoute(fartId) {
  return `/formal/${fartId.toLowerCase()}/`;
}

function universalTokens(entity, correspondence = 'unavailable') {
  return {
    coverage: ['mapped'],
    'content-kind': [contentKindToken(entity.kind)],
    formalization: entity.blocks?.length ? ['current'] : ['unavailable'],
    correspondence: [correspondence],
    translation: ['current', 'unavailable']
  };
}

export function validateSiteBundle(bundle) {
  const errors = [];
  const { manifest, outline, provenance, publication, search, validationFixture } = bundle ?? {};

  if (manifest?.schema_version !== 'p5-content-manifest/v1') errors.push('content manifest schema mismatch');
  if (outline?.schemaVersion !== 'p5-outline-manifest/v1') errors.push('outline manifest schema mismatch');
  if (provenance?.schema_version !== 'p5-m56-provenance/v1') errors.push('provenance schema mismatch');
  if (publication?.schema_version !== 'p5-m56-publication/v1') errors.push('publication schema mismatch');
  if (search?.schema_version !== 'p5-search-index/v1') errors.push('search schema mismatch');
  if (validationFixture?.schema_version !== 'p5-m56-validation-fixture/v1') errors.push('validation fixture schema mismatch');

  for (const record of [manifest, provenance, publication]) {
    if (record?.source_identity !== SOURCE_IDENTITY) errors.push('source identity mismatch');
  }
  if (manifest?.freeze_selector_sha256 !== SELECTOR_SHA256) errors.push('selector hash mismatch');
  if (provenance?.freeze_selector_sha256 !== SELECTOR_SHA256) errors.push('provenance selector hash mismatch');
  if (publication?.freeze?.selector_sha256 !== SELECTOR_SHA256) errors.push('publication selector hash mismatch');
  if (publication?.generated_dependency?.canonical_sha256 !== FORMAL_DEPENDENCY_SHA256) {
    errors.push('formal dependency hash mismatch');
  }

  const contentCount = publication?.content?.length ?? 0;
  if (contentCount === 0 || manifest?.routes?.length !== contentCount || search?.documents?.length !== contentCount) {
    errors.push('representative corpus cardinality mismatch');
  }

  const ids = new Set();
  const routes = new Set();
  for (const entity of publication?.content ?? []) {
    if (ids.has(entity.content_id)) errors.push(`duplicate content identity: ${entity.content_id}`);
    ids.add(entity.content_id);
    const route = routeFor(entity);
    if (routes.has(route)) errors.push(`duplicate content route: ${route}`);
    routes.add(route);
    const manifestRoute = manifest?.routes?.find((entry) => entry.content_id === entity.content_id);
    if (manifestRoute?.path !== route || manifestRoute?.locale !== 'en') {
      errors.push(`route authority mismatch: ${entity.content_id}`);
    }
    if (!entity.locales?.some((locale) => locale.locale === 'pt' && locale.translation_state === 'unavailable')) {
      errors.push(`Portuguese absence is not explicit: ${entity.content_id}`);
    }
  }

  if (!ids.has(publication?.course?.root_content_id)) errors.push('Course root content identity mismatch');
  if ((publication?.course?.references ?? []).length < Math.max(0, contentCount - 1)) errors.push('Course reference count mismatch');
  if (!Array.isArray(publication?.readiness)) errors.push('readiness authority records missing');
  const representedBlocks = (publication?.content ?? []).reduce((total, entity) => total + (entity.blocks?.length ?? 0), 0);
  if ((publication?.formal_bindings ?? []).length !== representedBlocks) errors.push('formal binding count mismatch');
  if ((publication?.external_payloads ?? []).length !== 0) errors.push('external payload leakage');
  if ((manifest?.routes ?? []).some((route) => route.path.startsWith('/pt/'))) errors.push('fabricated Portuguese route');

  if (
    validationFixture?.classification !== 'synthetic_contract_fixture'
    || validationFixture?.route !== '/validation/m5-6/'
    || validationFixture?.robots !== 'noindex'
    || validationFixture?.sitemap !== false
    || validationFixture?.global_search !== false
    || validationFixture?.canonical_publication_coverage !== false
    || validationFixture?.fingerprint !== 'synthetic-m5-6-v1'
    || !ids.has(validationFixture?.subject_content_id)
  ) errors.push('validation fixture boundary mismatch');

  const fixtureText = JSON.stringify(validationFixture ?? {});
  for (const required of ['urn:fmc:validation:m5-6:onto:parent-a', 'urn:fmc:validation:m5-6:onto:parent-b', 'FMC-M56-A', 'FMC-M56-B', 'fmc.m56']) {
    if (!fixtureText.includes(required)) errors.push(`validation fixture subject missing: ${required}`);
  }

  const serialized = JSON.stringify({ manifest, outline, provenance, publication, search });
  for (const reserved of ['urn:fmc:validation', 'FMC-M56-A', 'FMC-M56-B', 'fmc.m56']) {
    if (serialized.includes(reserved)) errors.push(`validation fixture leaked: ${reserved}`);
  }

  const outlineResult = validateOutlineManifest(outline);
  if (!outlineResult.ok) errors.push(...outlineResult.errors.map((error) => `outline: ${error}`));

  return errors.length ? { ok: false, value: null, errors } : { ok: true, value: bundle, errors: [] };
}

export async function loadSiteBundle({ bundleDir = resolve(root, '.generated/content/m5-6') } = {}) {
  const values = await Promise.all(bundleNames.map(async (name) => {
    const primary = resolve(bundleDir, name);
    try {
      return JSON.parse(await readFile(primary, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const governedPath = contentLock.outputs?.[name]?.path;
      if (!governedPath) throw error;
      return JSON.parse(await readFile(resolve(root, '.inputs/content', governedPath), 'utf8'));
    }
  }));
  const bundle = {
    manifest: values[0],
    outline: values[1],
    provenance: values[2],
    publication: values[3],
    search: values[4],
    validationFixture: values[5]
  };
  const result = validateSiteBundle(bundle);
  if (!result.ok) throw new Error(`M5.6 site bundle rejected:\n${result.errors.join('\n')}`);
  return result.value;
}

export function buildCourseModel(bundle) {
  const { publication } = bundle;
  const byId = new Map(publication.content.map((entity) => [entity.content_id, entity]));
  const routes = new Map(publication.content.map((entity) => [entity.content_id, routeFor(entity)]));
  const references = publication.course.references;
  const primaryChildren = new Map();

  for (const reference of references.filter((entry) => entry.role === 'primary')) {
    const rows = primaryChildren.get(reference.parent_content_id) ?? [];
    rows.push(reference);
    primaryChildren.set(reference.parent_content_id, rows);
  }
  for (const rows of primaryChildren.values()) rows.sort((left, right) => left.order - right.order || left.reference_id.localeCompare(right.reference_id));

  const traversal = [];
  const seen = new Set();
  const visit = (contentId) => {
    if (!seen.has(contentId)) {
      seen.add(contentId);
      traversal.push(contentId);
    }
    for (const reference of primaryChildren.get(contentId) ?? []) visit(reference.content_id);
  };
  visit(publication.course.root_content_id);

  return {
    byId,
    routes,
    traversal,
    context(contentId) {
      const entity = byId.get(contentId);
      if (!entity) throw new Error(`unknown content identity: ${contentId}`);
      const index = traversal.indexOf(contentId);
      const primaryParentReference = references.find((reference) => reference.content_id === contentId && reference.role === 'primary');
      const placements = references.filter((reference) => reference.content_id === contentId);
      return {
        entity,
        route: routes.get(contentId),
        parent: primaryParentReference ? byId.get(primaryParentReference.parent_content_id) : null,
        parentRoute: primaryParentReference ? routes.get(primaryParentReference.parent_content_id) : null,
        children: (primaryChildren.get(contentId) ?? []).map((reference) => ({
          reference,
          entity: byId.get(reference.content_id),
          route: routes.get(reference.content_id)
        })),
        placements,
        previous: index > 0 ? { entity: byId.get(traversal[index - 1]), route: routes.get(traversal[index - 1]) } : null,
        next: index >= 0 && index < traversal.length - 1 ? { entity: byId.get(traversal[index + 1]), route: routes.get(traversal[index + 1]) } : null
      };
    }
  };
}

export function getCourseRoot(bundle) {
  const contentId = bundle.publication.course.root_content_id;
  const entity = bundle.publication.content.find((candidate) => candidate.content_id === contentId);
  if (!entity) throw new Error(`Course root content identity missing: ${contentId}`);
  return { entity, route: routeFor(entity) };
}

export function toRepresentationBlock(entity, block) {
  const correspondence = block.formal_binding?.lean_state === 'exact' ? 'exact' : 'scoped';
  const renderedInputHash = fingerprint(block.latex);
  return {
    schemaVersion: 1,
    identity: {
      contentId: entity.content_id,
      blockId: block.block_id,
      revision: SOURCE_IDENTITY
    },
    title: block.title,
    representations: {
      rendered: {
        availability: 'current',
        correspondence,
        renderer: 'mathml',
        provenance: { subject: LATEX_MATHML_RENDERER, revision: `sha256:${renderedInputHash}` },
        note: `deterministically derived from exact governed LaTeX; content ${entity.content_id}:${block.block_id}`
      },
      latex: {
        availability: 'current',
        correspondence,
        source: block.latex,
        provenance: { subject: `${entity.content_id}:${block.block_id}:latex`, revision: SOURCE_IDENTITY }
      },
      lean: {
        availability: 'current',
        correspondence,
        source: block.lean.source,
        provenance: { subject: `${block.lean.repository}:${block.lean.module}`, revision: block.lean.revision },
        note: `${block.formal_binding.fart_id} / ${block.formal_binding.floc_id} / ${block.formal_binding.flink_id}; ${block.lean.source_kind}`
      }
    }
  };
}

function buildLeanProjection(base, entity, route) {
  if (!entity.blocks?.length) {
    return {
      ...base,
      state: 'unavailable',
      fingerprint: `site-m5.6:no-current-formal-binding:${entity.content_id}`,
      activeReferenceId: null,
      placements: []
    };
  }

  const correspondence = entity.blocks.some((block) => block.formal_binding.lean_state === 'exact') ? 'exact' : 'scoped';
  const tokens = universalTokens(entity, correspondence);
  const rootReference = `m56-site-lean-root-${entity.route_key}`;
  const placements = [{
    referenceId: rootReference,
    parentReferenceId: null,
    kind: 'group',
    label: entity.title,
    order: 0,
    state: 'mapped',
    contentId: entity.content_id,
    canonicalRoute: route,
    aliases: [entity.content_id, entity.route_key],
    universalTokens: tokens,
    structuralTokens: {}
  }];

  entity.blocks.forEach((block, blockIndex) => {
    const sourceKind = block.lean.repository === 'formal-math-curriculum/lean' ? 'project' : 'dependency';
    const artifactReference = `${rootReference}-artifact-${blockIndex + 1}`;
    const moduleReference = `${artifactReference}-module`;
    placements.push({
      referenceId: artifactReference,
      parentReferenceId: rootReference,
      kind: 'artifact',
      label: `${block.formal_binding.fart_id} — ${block.title}`,
      order: blockIndex,
      state: 'mapped',
      contentId: `formal:${block.formal_binding.fart_id}`,
      canonicalRoute: formalArtifactRoute(block.formal_binding.fart_id),
      aliases: [block.formal_binding.fart_id, block.formal_binding.flink_id],
      universalTokens: tokens,
      structuralTokens: { 'lean-level': ['artifact'], 'lean-source': [sourceKind] }
    });
    placements.push({
      referenceId: moduleReference,
      parentReferenceId: artifactReference,
      kind: 'module',
      label: block.lean.module,
      order: 0,
      state: 'mapped',
      contentId: `formal:module:${block.lean.module}`,
      canonicalRoute: formalModuleRoute(block.lean.module),
      aliases: [block.lean.module],
      universalTokens: tokens,
      structuralTokens: { 'lean-level': ['module'], 'lean-source': [sourceKind] }
    });
    block.lean.declarations.forEach((declaration, declarationIndex) => placements.push({
      referenceId: `${moduleReference}-declaration-${declarationIndex + 1}`,
      parentReferenceId: moduleReference,
      kind: 'declaration',
      label: declaration,
      order: declarationIndex,
      state: 'mapped',
      contentId: entity.content_id,
      canonicalRoute: route,
      aliases: [block.formal_binding.floc_id, declaration],
      universalTokens: tokens,
      structuralTokens: { 'lean-level': ['declaration'], 'lean-source': [sourceKind] }
    }));
  });

  return {
    ...base,
    state: 'current',
    fingerprint: `site-m5.6-lean/v1:${fingerprint(placements)}`,
    activeReferenceId: rootReference,
    placements
  };
}

export function makePageOutline(bundle, entity) {
  const manifest = structuredClone(bundle.outline);
  const route = routeFor(entity);
  manifest.currentContent = { contentId: entity.content_id, canonicalRoute: route };
  const course = manifest.projections.find((projection) => projection.id === 'course');
  course.activeReferenceId = course.placements.find((placement) => placement.contentId === entity.content_id)?.referenceId ?? null;
  const leanIndex = manifest.projections.findIndex((projection) => projection.id === 'lean-mathlib');
  manifest.projections[leanIndex] = buildLeanProjection(manifest.projections[leanIndex], entity, route);
  for (const projection of manifest.projections.filter((entry) => !['course', 'lean-mathlib'].includes(entry.id))) {
    projection.activeReferenceId = null;
  }
  const result = validateOutlineManifest(manifest);
  if (!result.ok) throw new Error(`page outline rejected for ${entity.content_id}: ${result.errors.join('; ')}`);
  return result.value;
}

function validationExternalProjection(base, fixture, entity, route) {
  const descriptor = fixture.projections.find((projection) => projection.id === base.id);
  if (!descriptor) throw new Error(`validation fixture projection missing: ${base.id}`);
  const tokens = universalTokens(entity, 'scoped');
  const placements = [];

  descriptor.placements.forEach((placement, index) => {
    const externalId = placement.external_id;
    const groupReference = `m56-validation-${base.id}-group-${index + 1}`;
    const contentReference = `m56-validation-${base.id}-content-${index + 1}`;
    placements.push({
      referenceId: groupReference,
      parentReferenceId: null,
      kind: 'group',
      label: `${externalId} — validation-only ${base.label} parent`,
      order: index,
      state: 'mapped',
      contentId: `validation:${base.id}:${index + 1}`,
      canonicalRoute: fixture.route,
      aliases: [externalId, fixture.fingerprint, 'validation only'],
      universalTokens: tokens,
      structuralTokens: {}
    });
    placements.push({
      referenceId: contentReference,
      parentReferenceId: groupReference,
      kind: 'reference',
      label: `${entity.title} — ${placement.relation}`,
      order: 0,
      state: placement.relation === 'related' ? 'partially-mapped' : 'mapped',
      contentId: entity.content_id,
      canonicalRoute: route,
      aliases: [externalId, placement.relation, entity.content_id],
      universalTokens: tokens,
      structuralTokens: {}
    });
  });

  return {
    ...base,
    state: 'current',
    fingerprint: `${fixture.fingerprint}:${base.id}:${fingerprint(descriptor.placements)}`,
    activeReferenceId: placements.find((placement) => placement.contentId === entity.content_id)?.referenceId ?? null,
    placements
  };
}

export function makeValidationOutline(bundle) {
  const fixture = bundle.validationFixture;
  const entity = bundle.publication.content.find((candidate) => candidate.content_id === fixture.subject_content_id);
  if (!entity) throw new Error(`validation fixture subject missing: ${fixture.subject_content_id}`);
  const route = routeFor(entity);
  const manifest = makePageOutline(bundle, entity);

  for (const projectionId of ['ontomathpro', 'msc2020', 'arxiv']) {
    const index = manifest.projections.findIndex((projection) => projection.id === projectionId);
    manifest.projections[index] = validationExternalProjection(manifest.projections[index], fixture, entity, route);
  }
  manifest.validation = {
    classification: fixture.classification,
    fingerprint: fixture.fingerprint,
    route: fixture.route,
    leakage_guards: fixture.leakage_guards
  };

  const result = validateOutlineManifest(manifest);
  if (!result.ok) throw new Error(`M5.6 validation outline rejected: ${result.errors.join('; ')}`);
  return result.value;
}

export function buildFormalRecords(bundle) {
  const records = new Map();
  for (const entity of bundle.publication.content) {
    const learnerRoute = routeFor(entity);
    for (const block of entity.blocks ?? []) {
      const artifactRoute = formalArtifactRoute(block.formal_binding.fart_id);
      const artifact = records.get(artifactRoute) ?? {
        kind: 'artifact',
        route: artifactRoute,
        title: block.formal_binding.fart_id,
        subject: block.formal_binding.fart_id,
        entries: []
      };
      artifact.entries.push({ entity, learnerRoute, block });
      records.set(artifactRoute, artifact);

      const moduleRoute = formalModuleRoute(block.lean.module);
      const module = records.get(moduleRoute) ?? {
        kind: 'module',
        route: moduleRoute,
        title: block.lean.module,
        subject: block.lean.module,
        entries: []
      };
      module.entries.push({ entity, learnerRoute, block });
      records.set(moduleRoute, module);
    }
  }
  return [...records.values()].sort((left, right) => left.route.localeCompare(right.route));
}

export function searchDocuments(documents, query) {
  const terms = query.toLocaleLowerCase('en').trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return documents;
  return documents.filter((document) => {
    const haystack = JSON.stringify(document).toLocaleLowerCase('en');
    return terms.every((term) => haystack.includes(term));
  });
}
