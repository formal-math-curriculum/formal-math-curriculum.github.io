export const OUTLINE_SCHEMA_VERSION = 'p5-outline-manifest/v1';
export const OUTLINE_HISTORY_KEY = 'fmcOutline';

export const OUTLINE_PROJECTIONS = Object.freeze([
  Object.freeze({ id: 'course', label: 'Course', kind: 'course-pedagogy' }),
  Object.freeze({ id: 'ontomathpro', label: 'OntoMathPRO', kind: 'ontomathpro-polyhierarchy' }),
  Object.freeze({ id: 'msc2020', label: 'MSC 2020', kind: 'msc2020-classification' }),
  Object.freeze({ id: 'arxiv', label: 'arXiv', kind: 'arxiv-shallow-category' }),
  Object.freeze({ id: 'lean-mathlib', label: 'Lean / mathlib', kind: 'lean-content-drilldown' })
]);

export const USABLE_PROJECTION_STATES = Object.freeze(['current', 'stale-compatible']);
export const PROJECTION_STATES = Object.freeze([
  ...USABLE_PROJECTION_STATES,
  'unavailable',
  'incompatible',
  'integrity-invalid',
  'license-needs-review'
]);
export const PLACEMENT_STATES = Object.freeze([
  'mapped',
  'partially-mapped',
  'unmapped',
  'not-applicable',
  'needs-review'
]);
export const PLACEMENT_KINDS = Object.freeze([
  'group',
  'presentation-heading',
  'reference',
  'prerequisite',
  'artifact',
  'module',
  'declaration',
  'missing-state'
]);

const PROJECTION_RULES = Object.freeze({
  course: Object.freeze({
    allowedKinds: Object.freeze(['group', 'presentation-heading', 'reference', 'prerequisite', 'missing-state']),
    rootMode: 'pedagogical'
  }),
  ontomathpro: Object.freeze({
    allowedKinds: Object.freeze(['group', 'reference', 'missing-state']),
    rootMode: 'multiple-parents'
  }),
  msc2020: Object.freeze({
    allowedKinds: Object.freeze(['group', 'reference', 'missing-state']),
    rootMode: 'classification-codes'
  }),
  arxiv: Object.freeze({
    allowedKinds: Object.freeze(['group', 'reference', 'missing-state']),
    rootMode: 'shallow-categories',
    maxDepth: 3
  }),
  'lean-mathlib': Object.freeze({
    allowedKinds: Object.freeze(['group', 'artifact', 'module', 'declaration', 'reference', 'missing-state']),
    rootMode: 'content-centered',
    maxDepth: 5
  })
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeRoute(value) {
  return isNonEmptyString(value) && value.startsWith('/') && !value.startsWith('//') && !value.includes('#');
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .trim();
}

function cloneFilterSelection(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, tokens]) => Array.isArray(tokens))
      .map(([id, tokens]) => [id, [...tokens]])
  );
}

function schemaMap(schema) {
  return new Map(schema.map((group) => [group.id, group]));
}

function validateFilterSchema(schema, path, errors) {
  if (!Array.isArray(schema)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const seen = new Set();
  for (const [index, group] of schema.entries()) {
    const at = `${path}[${index}]`;
    if (!isRecord(group)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(group.id) || seen.has(group.id)) {
      errors.push(`${at}.id must be unique and non-empty`);
    } else {
      seen.add(group.id);
    }
    if (!isNonEmptyString(group.label)) errors.push(`${at}.label must be non-empty`);
    if (group.mode !== 'multi') errors.push(`${at}.mode must be multi`);
    if (!Array.isArray(group.options) || group.options.length === 0) {
      errors.push(`${at}.options must be a non-empty array`);
      continue;
    }
    const optionIds = new Set();
    for (const [optionIndex, option] of group.options.entries()) {
      const optionAt = `${at}.options[${optionIndex}]`;
      if (!isRecord(option) || !isNonEmptyString(option.id) || !isNonEmptyString(option.label)) {
        errors.push(`${optionAt} must have non-empty id and label`);
      } else if (optionIds.has(option.id)) {
        errors.push(`${optionAt}.id must be unique in its group`);
      } else {
        optionIds.add(option.id);
      }
    }
  }
  return schema;
}

function validatePlacementTokens(tokens, filters, path, errors) {
  if (!isRecord(tokens)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const filtersById = schemaMap(filters);
  for (const [groupId, values] of Object.entries(tokens)) {
    const group = filtersById.get(groupId);
    if (!group) {
      errors.push(`${path}.${groupId} is not declared by its filter schema`);
      continue;
    }
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string')) {
      errors.push(`${path}.${groupId} must be a non-empty string array`);
      continue;
    }
    const allowed = new Set(group.options.map((option) => option.id));
    if (values.some((value) => !allowed.has(value))) {
      errors.push(`${path}.${groupId} contains an invalid token`);
    }
  }
}

function placementDepth(referenceId, byId, memo = new Map(), visiting = new Set()) {
  if (memo.has(referenceId)) return memo.get(referenceId);
  if (visiting.has(referenceId)) return Number.POSITIVE_INFINITY;
  visiting.add(referenceId);
  const placement = byId.get(referenceId);
  const depth = placement?.parentReferenceId
    ? placementDepth(placement.parentReferenceId, byId, memo, visiting) + 1
    : 0;
  visiting.delete(referenceId);
  memo.set(referenceId, depth);
  return depth;
}

export function validateOutlineManifest(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, value: null, errors: ['manifest must be an object'] };

  if (input.schemaVersion !== OUTLINE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${OUTLINE_SCHEMA_VERSION}`);
  }
  if (!isNonEmptyString(input.locale)) errors.push('locale must be non-empty');
  if (!isRecord(input.currentContent)) {
    errors.push('currentContent must be an object');
  } else {
    if (!isNonEmptyString(input.currentContent.contentId)) errors.push('currentContent.contentId must be non-empty');
    if (!isSafeRoute(input.currentContent.canonicalRoute)) errors.push('currentContent.canonicalRoute must be a root-relative route without fragments');
  }

  const universalFilters = validateFilterSchema(input.universalFilterSchema, 'universalFilterSchema', errors);
  if (!Array.isArray(input.projections) || input.projections.length !== OUTLINE_PROJECTIONS.length) {
    errors.push(`projections must contain exactly ${OUTLINE_PROJECTIONS.length} descriptors`);
  }

  const canonicalRoutes = new Map();
  const projections = Array.isArray(input.projections) ? input.projections : [];
  for (let projectionIndex = 0; projectionIndex < projections.length; projectionIndex += 1) {
    const descriptor = projections[projectionIndex];
    const expected = OUTLINE_PROJECTIONS[projectionIndex];
    const path = `projections[${projectionIndex}]`;
    if (!isRecord(descriptor)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (!expected || descriptor.id !== expected.id || descriptor.label !== expected.label || descriptor.kind !== expected.kind) {
      errors.push(`${path} must be ${expected?.id ?? 'absent'} with the exact label and kind`);
    }
    if (!PROJECTION_STATES.includes(descriptor.state)) errors.push(`${path}.state is invalid`);
    if (!isNonEmptyString(descriptor.fingerprint)) errors.push(`${path}.fingerprint must be non-empty`);
    if (!isSafeRoute(descriptor.landingRoute)) errors.push(`${path}.landingRoute must be a root-relative route`);

    const rules = PROJECTION_RULES[descriptor.id];
    if (rules && descriptor.rootMode !== rules.rootMode) {
      errors.push(`${path}.rootMode must equal ${rules.rootMode}`);
    }
    const structuralFilters = validateFilterSchema(descriptor.structuralFilterSchema, `${path}.structuralFilterSchema`, errors);
    if (!Array.isArray(descriptor.placements)) {
      errors.push(`${path}.placements must be an array`);
      continue;
    }
    if (USABLE_PROJECTION_STATES.includes(descriptor.state) && descriptor.placements.length === 0) {
      errors.push(`${path}.placements cannot be empty while projection is usable`);
    }
    if (!USABLE_PROJECTION_STATES.includes(descriptor.state) && descriptor.placements.length > 0) {
      errors.push(`${path}.placements must be empty while projection is unusable`);
    }

    const byId = new Map();
    for (const [placementIndex, placement] of descriptor.placements.entries()) {
      const at = `${path}.placements[${placementIndex}]`;
      if (!isRecord(placement)) {
        errors.push(`${at} must be an object`);
        continue;
      }
      if (!isNonEmptyString(placement.referenceId) || byId.has(placement.referenceId)) {
        errors.push(`${at}.referenceId must be unique and non-empty in its projection`);
      } else {
        byId.set(placement.referenceId, placement);
      }
      if (placement.parentReferenceId !== null && !isNonEmptyString(placement.parentReferenceId)) {
        errors.push(`${at}.parentReferenceId must be null or non-empty`);
      }
      if (!PLACEMENT_KINDS.includes(placement.kind) || (rules && !rules.allowedKinds.includes(placement.kind))) {
        errors.push(`${at}.kind is invalid for ${descriptor.id}`);
      }
      if (!PLACEMENT_STATES.includes(placement.state)) errors.push(`${at}.state is invalid`);
      if (!isNonEmptyString(placement.label)) errors.push(`${at}.label must be non-empty`);
      if (!Number.isSafeInteger(placement.order) || placement.order < 0) errors.push(`${at}.order must be a non-negative integer`);
      if (!Array.isArray(placement.aliases) || placement.aliases.some((alias) => !isNonEmptyString(alias))) {
        errors.push(`${at}.aliases must be a string array`);
      }
      validatePlacementTokens(placement.universalTokens, universalFilters, `${at}.universalTokens`, errors);
      validatePlacementTokens(placement.structuralTokens, structuralFilters, `${at}.structuralTokens`, errors);

      const hasIdentity = isNonEmptyString(placement.contentId);
      const hasRoute = isSafeRoute(placement.canonicalRoute);
      if (placement.kind === 'missing-state') {
        if (placement.contentId !== null || placement.canonicalRoute !== null) {
          errors.push(`${at} missing-state must use null contentId and canonicalRoute`);
        }
      } else if (!hasIdentity || !hasRoute) {
        errors.push(`${at} must identify one canonical contentId and route`);
      } else {
        const knownRoute = canonicalRoutes.get(placement.contentId);
        if (knownRoute && knownRoute !== placement.canonicalRoute) {
          errors.push(`${at} changes the canonical route for ${placement.contentId}`);
        } else {
          canonicalRoutes.set(placement.contentId, placement.canonicalRoute);
        }
      }
    }

    for (const placement of descriptor.placements) {
      if (!isRecord(placement) || !isNonEmptyString(placement.referenceId)) continue;
      if (placement.parentReferenceId !== null && !byId.has(placement.parentReferenceId)) {
        errors.push(`${path}.${placement.referenceId} has a dangling parent`);
      }
      const depth = placementDepth(placement.referenceId, byId);
      if (!Number.isFinite(depth)) errors.push(`${path}.${placement.referenceId} is in a cycle`);
      if (rules?.maxDepth !== undefined && depth > rules.maxDepth) {
        errors.push(`${path}.${placement.referenceId} exceeds the bounded depth ${rules.maxDepth}`);
      }
    }

    if (descriptor.activeReferenceId !== null) {
      const active = byId.get(descriptor.activeReferenceId);
      if (!active) {
        errors.push(`${path}.activeReferenceId is dangling`);
      } else if (active.contentId !== input.currentContent?.contentId || active.canonicalRoute !== input.currentContent?.canonicalRoute) {
        errors.push(`${path}.activeReferenceId does not resolve to currentContent`);
      }
    }
  }

  const course = projections[0];
  if (!course || course.id !== 'course' || !USABLE_PROJECTION_STATES.includes(course.state)) {
    errors.push('Course must be a usable fail-safe projection');
  }

  return errors.length > 0
    ? { ok: false, value: null, errors }
    : { ok: true, value: input, errors: [] };
}

export function getProjectionDescriptor(manifest, projectionId) {
  return manifest.projections.find((projection) => projection.id === projectionId) ?? null;
}

export function resolveEffectiveProjection(manifest, requestedProjection) {
  const requested = getProjectionDescriptor(manifest, requestedProjection);
  if (requested && USABLE_PROJECTION_STATES.includes(requested.state)) {
    return {
      requestedProjection,
      effectiveProjection: requestedProjection,
      retainedRequestedPreference: true,
      status: requested.state === 'stale-compatible'
        ? `${requested.label} uses a stale-compatible snapshot: ${requested.fingerprint}.`
        : ''
    };
  }
  const label = requested?.label ?? requestedProjection;
  const state = requested?.state ?? 'unknown';
  return {
    requestedProjection,
    effectiveProjection: 'course',
    retainedRequestedPreference: true,
    status: `${label} is ${state}. Showing Course without changing the saved request.`
  };
}

export function createEmptyOutlineContext() {
  return {
    query: '',
    universalFilters: {},
    structuralFilters: {},
    expandedReferenceIds: []
  };
}

export function validateOutlineContext(manifest, projectionId, input) {
  const descriptor = getProjectionDescriptor(manifest, projectionId);
  const value = createEmptyOutlineContext();
  const dropped = [];
  if (!descriptor || !isRecord(input)) return { value, dropped: ['context'] };

  value.query = typeof input.query === 'string' ? input.query.slice(0, 200) : '';
  const validateSelection = (candidate, schema, kind) => {
    const result = {};
    const groups = schemaMap(schema);
    for (const [groupId, tokens] of Object.entries(cloneFilterSelection(candidate))) {
      const group = groups.get(groupId);
      const allowed = new Set(group?.options.map((option) => option.id) ?? []);
      const valid = [...new Set(tokens)].filter((token) => allowed.has(token));
      if (!group || valid.length !== tokens.length) dropped.push(`${kind}:${groupId}`);
      if (group && valid.length > 0) result[groupId] = valid;
    }
    return result;
  };
  value.universalFilters = validateSelection(input.universalFilters, manifest.universalFilterSchema, 'universal');
  value.structuralFilters = validateSelection(input.structuralFilters, descriptor.structuralFilterSchema, 'structural');

  const placementIds = new Set(descriptor.placements.map((placement) => placement.referenceId));
  const groups = new Set(
    descriptor.placements
      .filter((placement) => descriptor.placements.some((candidate) => candidate.parentReferenceId === placement.referenceId))
      .map((placement) => placement.referenceId)
  );
  if (Array.isArray(input.expandedReferenceIds)) {
    value.expandedReferenceIds = [...new Set(input.expandedReferenceIds)]
      .filter((referenceId) => {
        const valid = typeof referenceId === 'string' && placementIds.has(referenceId) && groups.has(referenceId);
        if (!valid) dropped.push(`expanded:${referenceId}`);
        return valid;
      })
      .slice(0, 250);
  }
  return { value, dropped };
}

export function buildProjectionTree(descriptor) {
  const children = new Map();
  for (const placement of descriptor.placements) {
    const parent = placement.parentReferenceId ?? '__root__';
    const list = children.get(parent) ?? [];
    list.push(placement);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort((left, right) => left.order - right.order || left.referenceId.localeCompare(right.referenceId));
  }
  const visit = (parent) => (children.get(parent) ?? []).map((placement) => ({
    ...placement,
    children: visit(placement.referenceId)
  }));
  return visit('__root__');
}

function selectedGroupsMatch(tokens, selected) {
  return Object.entries(selected).every(([groupId, required]) => {
    if (required.length === 0) return true;
    const actual = tokens[groupId] ?? [];
    return required.some((token) => actual.includes(token));
  });
}

export function filterProjection(manifest, projectionId, inputContext) {
  const descriptor = getProjectionDescriptor(manifest, projectionId);
  if (!descriptor || !USABLE_PROJECTION_STATES.includes(descriptor.state)) {
    return { nodes: [], matchingReferenceIds: [], visibleReferenceIds: [], resultCount: 0, context: createEmptyOutlineContext(), dropped: [] };
  }
  const { value: context, dropped } = validateOutlineContext(manifest, projectionId, inputContext);
  const query = normalized(context.query);
  const ownMatches = new Set();
  const byId = new Map(descriptor.placements.map((placement) => [placement.referenceId, placement]));
  for (const placement of descriptor.placements) {
    const haystack = normalized([placement.label, ...placement.aliases, placement.contentId ?? ''].join(' '));
    const matches = (!query || haystack.includes(query))
      && selectedGroupsMatch(placement.universalTokens, context.universalFilters)
      && selectedGroupsMatch(placement.structuralTokens, context.structuralFilters);
    if (matches) ownMatches.add(placement.referenceId);
  }

  const visible = new Set(ownMatches);
  for (const referenceId of ownMatches) {
    let parent = byId.get(referenceId)?.parentReferenceId ?? null;
    while (parent) {
      visible.add(parent);
      parent = byId.get(parent)?.parentReferenceId ?? null;
    }
  }
  const filteredDescriptor = {
    ...descriptor,
    placements: descriptor.placements.filter((placement) => visible.has(placement.referenceId))
  };
  const resultKinds = new Set(['reference', 'prerequisite', 'declaration', 'missing-state']);
  const resultCount = [...ownMatches].filter((referenceId) => resultKinds.has(byId.get(referenceId)?.kind)).length;
  return {
    nodes: buildProjectionTree(filteredDescriptor),
    matchingReferenceIds: [...ownMatches],
    visibleReferenceIds: descriptor.placements.filter((placement) => visible.has(placement.referenceId)).map((placement) => placement.referenceId),
    resultCount,
    context,
    dropped
  };
}

export function getEligibleExpansionIds(nodes) {
  const ids = [];
  const visit = (node) => {
    if (node.children.length > 0) ids.push(node.referenceId);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

export function serializeOutlineHistory(manifest, projectionId, inputContext, activeReferenceId = null) {
  const descriptor = getProjectionDescriptor(manifest, projectionId);
  if (!descriptor) return null;
  const { value } = validateOutlineContext(manifest, projectionId, inputContext);
  const byId = new Map(descriptor.placements.map((placement) => [placement.referenceId, placement]));
  const trail = [];
  let cursor = typeof activeReferenceId === 'string' ? activeReferenceId : null;
  while (cursor && byId.has(cursor) && trail.length < 16) {
    trail.unshift(cursor);
    cursor = byId.get(cursor).parentReferenceId;
  }
  return {
    schemaVersion: 1,
    projectionId,
    fingerprint: descriptor.fingerprint,
    context: value,
    activeTrail: trail
  };
}

export function restoreOutlineHistory(manifest, historyState) {
  const payload = isRecord(historyState) && isRecord(historyState[OUTLINE_HISTORY_KEY])
    ? historyState[OUTLINE_HISTORY_KEY]
    : historyState;
  if (!isRecord(payload) || payload.schemaVersion !== 1 || typeof payload.projectionId !== 'string') {
    return { restored: false, projectionId: 'course', context: createEmptyOutlineContext(), activeReferenceId: null, status: '' };
  }
  const descriptor = getProjectionDescriptor(manifest, payload.projectionId);
  if (!descriptor || !USABLE_PROJECTION_STATES.includes(descriptor.state)) {
    return { restored: false, projectionId: 'course', context: createEmptyOutlineContext(), activeReferenceId: null, status: 'Remembered outline is unavailable. Showing Course.' };
  }
  const ids = new Set(descriptor.placements.map((placement) => placement.referenceId));
  const trail = Array.isArray(payload.activeTrail) ? payload.activeTrail.filter((id) => typeof id === 'string') : [];
  const activeReferenceId = [...trail].reverse().find((id) => ids.has(id)) ?? null;
  if (payload.fingerprint !== descriptor.fingerprint) {
    return {
      restored: false,
      projectionId: descriptor.id,
      context: createEmptyOutlineContext(),
      activeReferenceId,
      status: activeReferenceId
        ? 'The outline changed; context recovered to the nearest surviving reference.'
        : 'The outline changed; stale context was cleared.'
    };
  }
  const { value, dropped } = validateOutlineContext(manifest, descriptor.id, payload.context);
  return {
    restored: true,
    projectionId: descriptor.id,
    context: value,
    activeReferenceId,
    status: dropped.length > 0 ? 'Some invalid remembered outline state was cleared.' : ''
  };
}

export function encodeOutlinePayload(value) {
  return encodeURIComponent(JSON.stringify(value));
}

export function decodeOutlinePayload(value) {
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}
