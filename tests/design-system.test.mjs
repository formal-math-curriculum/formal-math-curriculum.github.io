import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile('astro.config.mjs', 'utf8');
const css = await readFile('src/styles/custom.css', 'utf8');
const provider = await readFile('src/components/PreferenceProvider.astro', 'utf8');
const controls = await readFile('src/components/PreferenceControls.astro', 'utf8');
const store = await readFile('src/lib/preferences.mjs', 'utf8');

test('uses documented lower-level Starlight override surfaces', () => {
  assert.match(config, /ThemeProvider: '.\/src\/components\/PreferenceProvider\.astro'/);
  assert.match(config, /ThemeSelect: '.\/src\/components\/PreferenceControls\.astro'/);
  assert.doesNotMatch(config, /PageFrame:|Header:/);
});

test('defines exactly the four official token theme selectors', () => {
  const selectors = [...css.matchAll(/:root\[data-fmc-theme='([^']+)'\]/g)].map((match) => match[1]);
  assert.deepEqual(selectors, [
    'light',
    'light-high-contrast',
    'dark',
    'dark-high-contrast'
  ]);
});

test('includes focus, target-size, forced-colors and reduced-motion contracts', () => {
  assert.match(css, /--fmc-control-min-size: 2\.75rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /forced-color-adjust: auto/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /forced-color-adjust:\s*none/);
});

test('keeps body, code and math typography boundaries separate', () => {
  assert.match(css, /--fmc-font-sans/);
  assert.match(css, /--fmc-font-serif/);
  assert.match(css, /--fmc-font-code/);
  assert.match(css, /math,\s*\.katex,\s*\.MathJax/);
  assert.match(css, /font-synthesis: none/);
});

test('pre-paint provider and module store share the one exact key', () => {
  for (const source of [provider, store]) {
    assert.match(source, /fmc:site-preferences:v1|PREFERENCE_STORAGE_KEY/);
  }
  assert.doesNotMatch(provider + controls + store, /starlight-theme/);
  assert.doesNotMatch(controls, /localStorage/);
});

test('preference controls use native labels, bounded choices, disabled unqualified widths, and reset', () => {
  assert.equal((controls.match(/<label>/g) ?? []).length, 5);
  assert.match(controls, /value="condensed" disabled/);
  assert.match(controls, /value="expanded" disabled/);
  assert.match(controls, /data-fmc-reset/);
  assert.match(controls, /role="status" aria-live="polite"/);
  assert.match(controls, /<noscript>/);
  assert.doesNotMatch(controls, /role="switch"/);
});

test('store excludes transient outline state and reading history', () => {
  assert.doesNotMatch(store, /filterEnabled|selectedKinds|expandedCanonical|readingHistory|menuQuery/);
  assert.match(store, /outlineProjection/);
  assert.match(store, /representationDefault/);
});

