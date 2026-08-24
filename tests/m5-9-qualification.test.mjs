import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../scripts/validate-m5-9-accessibility-browser.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const procedure = readFileSync(new URL('../docs/qualification/m5-9-accessibility-browser.md', import.meta.url), 'utf8');

test('M59-A01 qualification binds the exact candidate and source revisions', () => {
  for (const identity of [
    '23c76800ccd19dcc40f2b16c21297283fb2c7f20',
    '7060d821d216655d762019f15e1ba7a18d18d078',
    '3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828',
    '59d0e0c49851b534bf528e46dd6ce74f46173c6c',
    '3f1a315f438af37a327eaf8b9b9c1dbc6f409394',
    'db584cd6d46c92f209a44c0f1c829460d327499d'
  ]) assert.match(script, new RegExp(identity));
  assert.match(script, /applicationDrift/);
  assert.match(script, /p5-m5\.9-accessibility-browser-qualification\/v1/);
});

test('M59-A14 workflow installs every frozen browser engine and retains failed evidence', () => {
  assert.match(workflow, /playwright-core install --with-deps chromium firefox webkit/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(script, /151\.0\.7922\.34/);
  assert.match(script, /Firefox|firefox/);
  assert.match(script, /WebKit|webkit/);
  assert.match(script, /151\.0\.7922\.137/);
});

test('M59-A10 cannot be upgraded from browser automation to screen-reader evidence', () => {
  assert.match(script, /blocked_manual_required/);
  assert.match(script, /automatedSubstitutionAllowed: false/);
  assert.match(procedure, /NVDA 2026\.1\.1/);
  assert.match(procedure, /Playwright WebKit evidence is not a substitute/);
  assert.match(procedure, /A10 remains a Blocker/);
});

test('M59 negative and boundary fixtures remain explicit', () => {
  assert.match(script, /storage-denied/);
  assert.match(script, /zzzz-no-result-m59/);
  assert.match(script, /applicationDrift/);
  assert.match(script, /frozen branded Chrome executable is unavailable/);
  assert.match(script, /320x800-reduced/);
  assert.match(script, /forced-colors/);
  assert.match(script, /externalRequests/);
});
