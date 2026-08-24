import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PREFERENCES,
  PREFERENCE_STORAGE_KEY,
  applyPreferencesToDocument,
  createPreferenceStore,
  getEffectivePreferences,
  parsePreferences,
  resolveThemePreference
} from '../src/lib/preferences.mjs';

function validPreferences(overrides = {}) {
  return {
    ...DEFAULT_PREFERENCES,
    ...overrides,
    typography: {
      ...DEFAULT_PREFERENCES.typography,
      ...(overrides.typography ?? {})
    }
  };
}

function createDocument() {
  return { documentElement: { dataset: {}, style: {} } };
}

function createMedia(initial = {}) {
  const records = new Map();
  return (query) => {
    if (!records.has(query)) {
      const listeners = new Set();
      records.set(query, {
        matches: Boolean(initial[query]),
        addEventListener: (_name, listener) => listeners.add(listener),
        removeEventListener: (_name, listener) => listeners.delete(listener),
        emit(value) {
          this.matches = value;
          for (const listener of listeners) listener({ matches: value });
        }
      });
    }
    return records.get(query);
  };
}

function createWindow(document) {
  const listeners = new Map();
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  return {
    document,
    CustomEvent: FakeCustomEvent,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    emit(name, event) {
      for (const listener of listeners.get(name) ?? []) listener(event);
    }
  };
}

function createStorage(initial = null) {
  const values = new Map();
  if (initial !== null) values.set(PREFERENCE_STORAGE_KEY, initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: () => values.get(PREFERENCE_STORAGE_KEY) ?? null
  };
}

test('defaults are the frozen MAT-345 defaults', () => {
  assert.deepEqual(DEFAULT_PREFERENCES, {
    schemaVersion: 1,
    themePreference: 'system',
    typography: { family: 'sans-serif', size: 'default', weight: 'regular' },
    representationDefault: 'rendered',
    outlineProjection: 'course'
  });
});

test('parser accepts one atomic valid object and strips unknown fields', () => {
  const parsed = parsePreferences({ ...validPreferences(), ignored: 'same-major optional' });
  assert.equal(parsed.ok, true);
  assert.equal('ignored' in parsed.value, false);
  assert.deepEqual(parsed.value, validPreferences());
});

test('parser rejects corrupt JSON, partial objects, invalid enums, and unknown majors', () => {
  for (const [input, reason] of [
    ['{', 'invalid-json'],
    [{}, 'incompatible-schema'],
    [{ ...validPreferences(), schemaVersion: 2 }, 'incompatible-schema'],
    [{ ...validPreferences(), typography: null }, 'invalid-typography'],
    [{ ...validPreferences(), outlineProjection: 'knowledge-map' }, 'invalid-enum']
  ]) {
    const parsed = parsePreferences(input);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.reason, reason);
    assert.deepEqual(parsed.value, DEFAULT_PREFERENCES);
  }
});

test('system theme resolves all four official theme outcomes', () => {
  const cases = [
    [{}, 'light'],
    [{ '(prefers-color-scheme: dark)': true }, 'dark'],
    [{ '(prefers-contrast: more)': true }, 'light-high-contrast'],
    [
      { '(prefers-color-scheme: dark)': true, '(prefers-contrast: more)': true },
      'dark-high-contrast'
    ]
  ];
  for (const [matches, expected] of cases) {
    assert.equal(resolveThemePreference('system', (query) => Boolean(matches[query])), expected);
  }
  assert.equal(resolveThemePreference('dark-high-contrast'), 'dark-high-contrast');
});

test('unqualified width families fall back visibly without changing requested schema value', () => {
  const requested = validPreferences({ typography: { family: 'condensed' } });
  const effective = getEffectivePreferences(requested);
  assert.equal(effective.typography.family, 'condensed');
  assert.equal(effective.typography.effectiveFamily, 'sans-serif');
});

test('document attributes preserve Starlight light/dark and exact FMC state', () => {
  const document = createDocument();
  applyPreferencesToDocument(
    document,
    validPreferences({
      themePreference: 'dark-high-contrast',
      typography: { family: 'serif', size: 'large', weight: 'medium' },
      representationDefault: 'lean',
      outlineProjection: 'msc2020'
    })
  );
  assert.deepEqual(document.documentElement.dataset, {
    theme: 'dark',
    fmcTheme: 'dark-high-contrast',
    fmcThemePreference: 'dark-high-contrast',
    fmcFontFamily: 'serif',
    fmcTextSize: 'large',
    fmcTextWeight: 'medium',
    fmcRepresentation: 'lean',
    fmcProjection: 'msc2020'
  });
  assert.equal(document.documentElement.style.colorScheme, 'dark');
});

test('store loads, writes one atomic key, and resets with one event', () => {
  const storage = createStorage(JSON.stringify(validPreferences({ outlineProjection: 'arxiv' })));
  const document = createDocument();
  const window = createWindow(document);
  const media = createMedia();
  let resetEvents = 0;
  window.addEventListener('fmc:preferences-reset', () => resetEvents++);
  const store = createPreferenceStore({ storage, document, window, matchMedia: media });

  assert.equal(store.getSnapshot().preferences.outlineProjection, 'arxiv');
  store.set({ representationDefault: 'latex' });
  assert.equal(JSON.parse(storage.value()).representationDefault, 'latex');
  store.reset();
  assert.equal(storage.value(), null);
  assert.deepEqual(store.getSnapshot().preferences, DEFAULT_PREFERENCES);
  assert.equal(resetEvents, 1);
  store.destroy();
});

test('unavailable storage keeps a coherent in-memory store', () => {
  const document = createDocument();
  const window = createWindow(document);
  const store = createPreferenceStore({ storage: null, document, window, matchMedia: createMedia() });
  const detail = store.set({ themePreference: 'dark' }, 'control');
  assert.equal(store.getSnapshot().preferences.themePreference, 'dark');
  assert.equal(detail.persisted, false);
  assert.equal(detail.persistenceAvailable, false);
  assert.match(detail.status, /cannot be saved|could not be saved/);
  store.destroy();
});

test('write failure applies the choice in memory and reports non-persistence', () => {
  const storage = createStorage();
  storage.setItem = () => {
    throw new Error('quota');
  };
  const document = createDocument();
  const window = createWindow(document);
  const store = createPreferenceStore({ storage, document, window, matchMedia: createMedia() });
  const detail = store.set({ representationDefault: 'lean' }, 'control');
  assert.equal(store.getSnapshot().preferences.representationDefault, 'lean');
  assert.equal(detail.persisted, false);
  assert.match(detail.status, /could not be saved/);
  store.destroy();
});

test('valid storage event updates atomically and invalid event is ignored', () => {
  const storage = createStorage();
  const document = createDocument();
  const window = createWindow(document);
  const store = createPreferenceStore({ storage, document, window, matchMedia: createMedia() });
  window.emit('storage', {
    key: PREFERENCE_STORAGE_KEY,
    newValue: JSON.stringify(validPreferences({ outlineProjection: 'lean-mathlib' }))
  });
  assert.equal(store.getSnapshot().preferences.outlineProjection, 'lean-mathlib');

  window.emit('storage', { key: PREFERENCE_STORAGE_KEY, newValue: '{' });
  assert.equal(store.getSnapshot().preferences.outlineProjection, 'lean-mathlib');
  assert.match(store.getSnapshot().status, /ignored/);
  store.destroy();
});

test('system media change reapplies only while system mode is requested', () => {
  const storage = createStorage();
  const document = createDocument();
  const window = createWindow(document);
  const media = createMedia();
  const store = createPreferenceStore({ storage, document, window, matchMedia: media });
  media('(prefers-color-scheme: dark)').emit(true);
  assert.equal(document.documentElement.dataset.fmcTheme, 'dark');
  store.set({ themePreference: 'light' });
  media('(prefers-color-scheme: dark)').emit(false);
  media('(prefers-color-scheme: dark)').emit(true);
  assert.equal(document.documentElement.dataset.fmcTheme, 'light');
  store.destroy();
});

