import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const config = await readFile('astro.config.mjs', 'utf8');
const home = await readFile('src/content/docs/index.md', 'utf8');

test('runtime and package manager are exact', () => {
  assert.equal(pkg.engines.node, '24.19.0');
  assert.equal(pkg.packageManager, 'pnpm@11.23.0');
});

test('Astro, Starlight, and Pagefind are exact', () => {
  assert.deepEqual(pkg.dependencies, {
    '@astrojs/starlight': '0.41.7',
    astro: '7.2.4',
    pagefind: '1.5.2'
  });
});

test('organization-root URL has no base path', () => {
  assert.match(config, /site: 'https:\/\/formal-math-curriculum\.github\.io'/);
  assert.doesNotMatch(config, /\bbase\s*:/);
});

test('bootstrap does not overclaim a released corpus', () => {
  assert.match(home, /minimal M5\.4 platform bootstrap/);
  assert.match(home, /Missing external classifications and translations remain explicit/);
});

