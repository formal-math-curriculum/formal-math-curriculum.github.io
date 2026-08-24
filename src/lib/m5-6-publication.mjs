import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateOutlineManifest } from './outline-navigator.mjs';

export const CONTENT_REVISION = '2da8fdb43074d00fea5fc6201d239e5f26a43250';
export const CONTENT_TREE = 'd51b0c7cfe44feec2b6eb176fd6ce1825a8ab458';
export const SOURCE_IDENTITY = 'P5-M5.6-CONTENT-v1';
export const SELECTOR_SHA256 = '280ad055d9235077b398d26dd6abb40c9d13ae089ad6d5a8fd0b11baed805aaf';
export const FORMAL_DEPENDENCY_SHA256 = 'f8c79c8d196952e4827c72d394039862935689b2e100f821697c41bad8cb1438';

const root = resolve(process.env.FMC_SITE_ROOT ?? process.cwd());
const bundleNames = [
  'content-manifest.json',
  'outline-manifest.json',
  'provenance.json',
  'publication.json',
  'search-index.json'
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
  const { manifest, outline, provenance, publication, search } = bundle ?? {};

  if (manifest?.schema_version !== 'p5-content-manifest/v1') errors.push('content manifest schema mismatch');
  if (outline?.schemaVersion !== 'p5-outline-manifest/v1') errors.push('outline manifest schema mismatch');
  if (provenance?.schema_version !== 'p5-m56-provenance/v1') errors.push('provenance schema mismatch');
  if (publication?.schema_version !== 'p5-m56-publication/v1') errors.push('publication schema mismatch');
  if (search?.schema_version !== 'p5-search-index/v1') errors.push('search schema mismatch');

  for (const record of [manifest, provenance, publication]) {
    if (record?.source_identity !== SOURCE_IDENTITY) errors.push('source identity mismatch');
  }
  if (manifest?.freeze_selector_sha256 !== SELECTOR_SHA256) errors.push('selector hash mismatch');
  if (provenance?.freeze_selector_sha256 !== SELECTOR_SHA256) errors.push('provenance selector hash mismatch');
  if (publication?.freeze?.selector_sha256 !== SELECTOR_SHA256) errors.push('publication selector hash mismatch');
  if (publication?.generated_dependency?.canonical_sha256 !== FORMAL_DEPENDENCY_SHA256) {
    errors.push('formal dependency hash mismatch');
  }

  if (publication?.content?.length !== 15 || manifest?.routes?.length !== 15 || search?.documents?.length !== 15) {
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

  if ((publication?.course?.references ?? []).length !== 15) errors.push('Course reference count mismatch');
  if ((publication?.readiness ?? []).length !== 2) errors.push('readiness authority count mismatch');
  if ((publication?.formal_bindings ?? []).length !== 10) errors.push('formal binding count mismatch');
  if ((publication?.external_payloads ?? []).length !== 0) errors.push('external payload leakage');
  if ((manifest?.routes ?? []).some((route) => route.path.startsWith('/pt/'))) errors.push('fabricated Portuguese route');

  const serialized = JSON.stringify(bundle);
  for (const reserved of ['urn:fmc:validation', 'FMC-M56-A', 'FMC-M56-B', 'fmc.m56']) {
    if (serialized.includes(reserved)) errors.push(`validation fixture leaked: ${reserved}`);
  }

  const outlineResult = validateOutlineManifest(outline);
  if (!outlineResult.ok) errors.push(...outlineResult.errors.map((error) => `outline: ${error}`));

  return errors.length ? { ok: false, value: null, errors } : { ok: true, value: bundle, errors: [] };
}

export async function loadSiteBundle({ bundleDir = resolve(root, '.generated/content/m5-6') } = {}) {
  const values = await Promise.all(bundleNames.map(async (name) => JSON.parse(await readFile(resolve(bundleDir, name), 'utf8'))));
  const bundle = {
    manifest: values[0],
    outline: values[1],
    provenance: values[2],
    publication: values[3],
    search: values[4]
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

export function toRepresentationBlock(entity, block) {
  const correspondence = block.formal_binding?.lean_state === 'exact' ? 'exact' : 'scoped';
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
        renderer: 'qualified-equivalent',
        provenance: { subject: `${entity.content_id}:${block.block_id}:rendered`, revision: SOURCE_IDENTITY }
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
