export const PREFERENCE_STORAGE_KEY = 'fmc:site-preferences:v1';

export const PREFERENCE_VALUES = Object.freeze({
  themePreference: Object.freeze([
    'system',
    'light',
    'light-high-contrast',
    'dark',
    'dark-high-contrast'
  ]),
  typographyFamily: Object.freeze(['sans-serif', 'serif', 'condensed', 'expanded']),
  qualifiedTypographyFamily: Object.freeze(['sans-serif', 'serif']),
  typographySize: Object.freeze(['small', 'default', 'large']),
  typographyWeight: Object.freeze(['regular', 'medium']),
  representationDefault: Object.freeze(['rendered', 'latex', 'lean']),
  outlineProjection: Object.freeze([
    'course',
    'ontomathpro',
    'msc2020',
    'arxiv',
    'lean-mathlib'
  ])
});

export const DEFAULT_PREFERENCES = Object.freeze({
  schemaVersion: 1,
  themePreference: 'system',
  typography: Object.freeze({
    family: 'sans-serif',
    size: 'default',
    weight: 'regular'
  }),
  representationDefault: 'rendered',
  outlineProjection: 'course'
});

function cloneDefaults() {
  return {
    ...DEFAULT_PREFERENCES,
    typography: { ...DEFAULT_PREFERENCES.typography }
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf(value, values) {
  return typeof value === 'string' && values.includes(value);
}

export function parsePreferences(input) {
  let candidate = input;

  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input);
    } catch {
      return { ok: false, value: cloneDefaults(), reason: 'invalid-json' };
    }
  }

  if (!isRecord(candidate)) {
    return { ok: false, value: cloneDefaults(), reason: 'invalid-object' };
  }

  if (candidate.schemaVersion !== 1) {
    return { ok: false, value: cloneDefaults(), reason: 'incompatible-schema' };
  }

  if (!isRecord(candidate.typography)) {
    return { ok: false, value: cloneDefaults(), reason: 'invalid-typography' };
  }

  const valid =
    isOneOf(candidate.themePreference, PREFERENCE_VALUES.themePreference) &&
    isOneOf(candidate.typography.family, PREFERENCE_VALUES.typographyFamily) &&
    isOneOf(candidate.typography.size, PREFERENCE_VALUES.typographySize) &&
    isOneOf(candidate.typography.weight, PREFERENCE_VALUES.typographyWeight) &&
    isOneOf(candidate.representationDefault, PREFERENCE_VALUES.representationDefault) &&
    isOneOf(candidate.outlineProjection, PREFERENCE_VALUES.outlineProjection);

  if (!valid) {
    return { ok: false, value: cloneDefaults(), reason: 'invalid-enum' };
  }

  return {
    ok: true,
    reason: null,
    value: {
      schemaVersion: 1,
      themePreference: candidate.themePreference,
      typography: {
        family: candidate.typography.family,
        size: candidate.typography.size,
        weight: candidate.typography.weight
      },
      representationDefault: candidate.representationDefault,
      outlineProjection: candidate.outlineProjection
    }
  };
}

export function resolveThemePreference(themePreference, matches = () => false) {
  if (themePreference !== 'system') return themePreference;

  const dark = Boolean(matches('(prefers-color-scheme: dark)'));
  const highContrast = Boolean(matches('(prefers-contrast: more)'));

  if (dark && highContrast) return 'dark-high-contrast';
  if (dark) return 'dark';
  if (highContrast) return 'light-high-contrast';
  return 'light';
}

export function getEffectiveTypographyFamily(family) {
  return PREFERENCE_VALUES.qualifiedTypographyFamily.includes(family)
    ? family
    : DEFAULT_PREFERENCES.typography.family;
}

export function getEffectivePreferences(preferences, matches = () => false) {
  return {
    ...preferences,
    resolvedTheme: resolveThemePreference(preferences.themePreference, matches),
    typography: {
      ...preferences.typography,
      effectiveFamily: getEffectiveTypographyFamily(preferences.typography.family)
    }
  };
}

export function applyPreferencesToDocument(documentObject, preferences, matches = () => false) {
  if (!documentObject?.documentElement) return;

  const effective = getEffectivePreferences(preferences, matches);
  const root = documentObject.documentElement;
  const dark = effective.resolvedTheme.startsWith('dark');

  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.fmcTheme = effective.resolvedTheme;
  root.dataset.fmcThemePreference = preferences.themePreference;
  root.dataset.fmcFontFamily = effective.typography.effectiveFamily;
  root.dataset.fmcTextSize = preferences.typography.size;
  root.dataset.fmcTextWeight = preferences.typography.weight;
  root.dataset.fmcRepresentation = preferences.representationDefault;
  root.dataset.fmcProjection = preferences.outlineProjection;
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function createPreferenceStore(options = {}) {
  const windowObject = options.window ?? globalThis.window;
  const documentObject = options.document ?? windowObject?.document;
  const media = options.matchMedia ?? ((query) => windowObject?.matchMedia?.(query));
  const matches = (query) => Boolean(media?.(query)?.matches);
  const listeners = new Set();
  const mediaQueries = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'];
  let storage = null;
  let persistenceAvailable = true;
  let status = '';
  let state = cloneDefaults();

  try {
    storage = Object.hasOwn(options, 'storage') ? options.storage : windowObject?.localStorage;
    if (!storage) throw new Error('storage-unavailable');

    const raw = storage.getItem(PREFERENCE_STORAGE_KEY);
    if (raw !== null) {
      const parsed = parsePreferences(raw);
      if (parsed.ok) {
        state = parsed.value;
      } else {
        storage.removeItem(PREFERENCE_STORAGE_KEY);
        status = 'Saved preferences were incompatible and were reset safely.';
      }
    }
  } catch {
    storage = null;
    persistenceAvailable = false;
    status = 'Preferences work for this page but cannot be saved in this browser.';
  }

  function snapshot() {
    return {
      preferences: {
        ...state,
        typography: { ...state.typography }
      },
      effective: getEffectivePreferences(state, matches),
      persistenceAvailable,
      status
    };
  }

  function notify(source, persisted = persistenceAvailable) {
    const detail = { ...snapshot(), source, persisted };
    for (const listener of listeners) listener(detail);
    return detail;
  }

  function apply() {
    applyPreferencesToDocument(documentObject, state, matches);
  }

  function persist() {
    if (!storage) return false;
    try {
      storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(state));
      persistenceAvailable = true;
      status = '';
      return true;
    } catch {
      persistenceAvailable = false;
      status = 'Your choice is active for this page but could not be saved.';
      return false;
    }
  }

  function set(patch, source = 'local') {
    const candidate = {
      ...state,
      ...patch,
      typography: {
        ...state.typography,
        ...(isRecord(patch?.typography) ? patch.typography : {})
      }
    };
    const parsed = parsePreferences(candidate);

    if (!parsed.ok) {
      status = 'The requested preference was invalid and was not applied.';
      return notify('invalid', false);
    }

    state = parsed.value;
    apply();
    const persisted = persist();
    return notify(source, persisted);
  }

  function reset(source = 'reset') {
    state = cloneDefaults();
    let persisted = true;

    if (storage) {
      try {
        storage.removeItem(PREFERENCE_STORAGE_KEY);
        persistenceAvailable = true;
        status = '';
      } catch {
        persistenceAvailable = false;
        status = 'Defaults are active for this page but could not be saved.';
        persisted = false;
      }
    } else {
      persisted = false;
    }

    apply();
    const detail = notify(source, persisted);
    windowObject?.dispatchEvent?.(
      new windowObject.CustomEvent('fmc:preferences-reset', { detail })
    );
    return detail;
  }

  function onStorage(event) {
    if (event.key !== PREFERENCE_STORAGE_KEY) return;

    if (event.newValue === null) {
      state = cloneDefaults();
      status = '';
    } else {
      const parsed = parsePreferences(event.newValue);
      if (!parsed.ok) {
        status = 'An invalid preference update from another tab was ignored.';
        notify('storage-invalid', false);
        return;
      }
      state = parsed.value;
      status = '';
    }

    apply();
    notify('storage', true);
  }

  function onSystemPreferenceChange() {
    if (state.themePreference !== 'system') return;
    apply();
    notify('system', persistenceAvailable);
  }

  windowObject?.addEventListener?.('storage', onStorage);
  for (const query of mediaQueries) {
    media?.(query)?.addEventListener?.('change', onSystemPreferenceChange);
  }

  apply();

  return Object.freeze({
    getSnapshot: snapshot,
    set,
    reset,
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...snapshot(), source: 'subscribe', persisted: persistenceAvailable });
      return () => listeners.delete(listener);
    },
    destroy() {
      windowObject?.removeEventListener?.('storage', onStorage);
      for (const query of mediaQueries) {
        media?.(query)?.removeEventListener?.('change', onSystemPreferenceChange);
      }
      listeners.clear();
    }
  });
}
