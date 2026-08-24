export const REPRESENTATION_BLOCK_SCHEMA_VERSION = 1;

export const REPRESENTATION_VIEWS = Object.freeze(['rendered', 'latex', 'lean']);

export const REPRESENTATION_AVAILABILITY = Object.freeze([
  'current',
  'unavailable',
  'pending',
  'stale',
  'incompatible',
  'withdrawn',
  'disputed'
]);

export const REPRESENTATION_CORRESPONDENCE = Object.freeze([
  'exact',
  'scoped',
  'related',
  'unreviewed',
  'unavailable',
  'stale',
  'disputed'
]);

export const RENDERER_KINDS = Object.freeze(['mathml', 'qualified-equivalent']);

export const REPRESENTATION_LABELS = Object.freeze({
  rendered: 'Rendered mathematics',
  latex: 'LaTeX source',
  lean: 'Lean source'
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOneOf(value, values) {
  return typeof value === 'string' && values.includes(value);
}

function cloneRepresentation(view, input, payloadAvailable) {
  const representation = {
    availability: input.availability,
    correspondence: input.correspondence,
    provenance: {
      subject: input.provenance.subject,
      revision: input.provenance.revision
    },
    payloadAvailable
  };

  if (view === 'rendered') representation.renderer = input.renderer ?? null;
  if (view !== 'rendered') representation.source = input.source ?? '';
  if (typeof input.note === 'string' && input.note.trim()) {
    representation.note = input.note.trim();
  }

  return representation;
}

export function validateRepresentationBlock(input, options = {}) {
  const errors = [];
  const hasRenderedContent = options.hasRenderedContent !== false;

  if (!isRecord(input)) {
    return { ok: false, value: null, errors: ['block must be an object'] };
  }

  if (input.schemaVersion !== REPRESENTATION_BLOCK_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1');
  }

  if (!isRecord(input.identity)) {
    errors.push('identity must be an object');
  } else {
    for (const field of ['contentId', 'blockId', 'revision']) {
      if (!isNonEmptyString(input.identity[field])) {
        errors.push(`identity.${field} must be a non-empty string`);
      }
    }
  }

  if (!isNonEmptyString(input.title)) errors.push('title must be a non-empty string');
  if (!isRecord(input.representations)) errors.push('representations must be an object');

  const normalizedRepresentations = {};

  for (const view of REPRESENTATION_VIEWS) {
    const representation = input.representations?.[view];
    const prefix = `representations.${view}`;

    if (!isRecord(representation)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    if (!isOneOf(representation.availability, REPRESENTATION_AVAILABILITY)) {
      errors.push(`${prefix}.availability is invalid`);
    }

    if (!isOneOf(representation.correspondence, REPRESENTATION_CORRESPONDENCE)) {
      errors.push(`${prefix}.correspondence is invalid`);
    }

    if (!isRecord(representation.provenance)) {
      errors.push(`${prefix}.provenance must be an object`);
    } else {
      if (!isNonEmptyString(representation.provenance.subject)) {
        errors.push(`${prefix}.provenance.subject must be a non-empty string`);
      }
      if (!isNonEmptyString(representation.provenance.revision)) {
        errors.push(`${prefix}.provenance.revision must be a non-empty string`);
      }
    }

    let payloadAvailable = false;
    if (view === 'rendered') {
      if (representation.renderer != null && !isOneOf(representation.renderer, RENDERER_KINDS)) {
        errors.push(`${prefix}.renderer is invalid`);
      }
      payloadAvailable =
        hasRenderedContent && isOneOf(representation.renderer, RENDERER_KINDS);
      if (representation.availability === 'current' && !payloadAvailable) {
        errors.push(`${prefix} is current but has no qualified rendered payload`);
      }
    } else {
      if (representation.source != null && typeof representation.source !== 'string') {
        errors.push(`${prefix}.source must be a string`);
      }
      payloadAvailable = isNonEmptyString(representation.source);
      if (representation.availability === 'current' && !payloadAvailable) {
        errors.push(`${prefix} is current but has no source payload`);
      }
    }

    if (
      isOneOf(representation.availability, REPRESENTATION_AVAILABILITY) &&
      isOneOf(representation.correspondence, REPRESENTATION_CORRESPONDENCE) &&
      isRecord(representation.provenance) &&
      isNonEmptyString(representation.provenance.subject) &&
      isNonEmptyString(representation.provenance.revision)
    ) {
      normalizedRepresentations[view] = cloneRepresentation(
        view,
        representation,
        payloadAvailable
      );
    }
  }

  if (errors.length > 0) return { ok: false, value: null, errors };

  return {
    ok: true,
    errors: [],
    value: {
      schemaVersion: REPRESENTATION_BLOCK_SCHEMA_VERSION,
      identity: {
        contentId: input.identity.contentId,
        blockId: input.identity.blockId,
        revision: input.identity.revision
      },
      title: input.title,
      representations: normalizedRepresentations
    }
  };
}

export function isRepresentationOperable(representation) {
  return representation?.availability === 'current' && representation.payloadAvailable === true;
}

export function getOperableViews(block) {
  return REPRESENTATION_VIEWS.filter((view) =>
    isRepresentationOperable(block?.representations?.[view])
  );
}

export function resolveEffectiveView(operableViews, globalDefault, override = null) {
  const allowed = REPRESENTATION_VIEWS.filter((view) => operableViews.includes(view));
  const safeGlobal = REPRESENTATION_VIEWS.includes(globalDefault) ? globalDefault : 'rendered';
  const safeOverride = REPRESENTATION_VIEWS.includes(override) ? override : null;
  const requestedView = safeOverride ?? safeGlobal;
  const effectiveView = allowed.includes(requestedView) ? requestedView : (allowed[0] ?? null);

  return {
    globalDefault: safeGlobal,
    override: safeOverride,
    requestedView,
    effectiveView,
    operableViews: allowed,
    fallbackReason:
      effectiveView !== null && effectiveView !== requestedView
        ? 'requested-unavailable'
        : effectiveView === null
          ? 'no-operable-view'
          : null
  };
}

export function createRepresentationController(operableViews, initialGlobal = 'rendered') {
  const allowed = REPRESENTATION_VIEWS.filter((view) => operableViews.includes(view));
  const listeners = new Set();
  let globalDefault = REPRESENTATION_VIEWS.includes(initialGlobal) ? initialGlobal : 'rendered';
  let override = null;

  function snapshot(source = 'snapshot', changed = false) {
    return {
      ...resolveEffectiveView(allowed, globalDefault, override),
      source,
      changed
    };
  }

  function notify(source, changed) {
    const detail = snapshot(source, changed);
    for (const listener of listeners) listener(detail);
    return detail;
  }

  return Object.freeze({
    getSnapshot: snapshot,
    select(view) {
      if (!allowed.includes(view)) return notify('invalid-selection', false);
      const changed = override !== view;
      override = view;
      return notify('override', changed);
    },
    updateGlobal(view, source = 'global') {
      if (!REPRESENTATION_VIEWS.includes(view)) return notify('invalid-global', false);
      const changed = globalDefault !== view;
      globalDefault = view;
      return notify(source, changed);
    },
    restoreGlobal() {
      const changed = override !== null;
      override = null;
      return notify('restore-global', changed);
    },
    reset(view = 'rendered') {
      const nextGlobal = REPRESENTATION_VIEWS.includes(view) ? view : 'rendered';
      const changed = override !== null || globalDefault !== nextGlobal;
      override = null;
      globalDefault = nextGlobal;
      return notify('reset', changed);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot('subscribe', false));
      return () => listeners.delete(listener);
    },
    destroy() {
      listeners.clear();
    }
  });
}

export function encodeSourcePayload(source) {
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeSourcePayload(payload) {
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createRepresentationDomId(identity) {
  const seed = `${identity.contentId}:${identity.blockId}:${identity.revision}`;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fmc-math-${(hash >>> 0).toString(36)}`;
}
