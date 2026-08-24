import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createRepresentationController,
  createRepresentationDomId,
  decodeSourcePayload,
  encodeSourcePayload,
  getOperableViews,
  resolveEffectiveView,
  validateRepresentationBlock
} from '../src/lib/representation-block.mjs';

const componentPath = new URL('../src/components/MathematicalBlock.astro', import.meta.url);
const cssPath = new URL('../src/styles/custom.css', import.meta.url);

function blockFixture(overrides = {}) {
  const base = {
    schemaVersion: 1,
    identity: {
      contentId: 'content.definition.addition',
      blockId: 'block.addition.identity',
      revision: 'sha256:content-revision'
    },
    title: 'Addition identity',
    representations: {
      rendered: {
        availability: 'current',
        correspondence: 'exact',
        renderer: 'mathml',
        provenance: { subject: 'content:block', revision: 'sha256:rendered' }
      },
      latex: {
        availability: 'current',
        correspondence: 'exact',
        source: String.raw`x + 0 = x`,
        provenance: { subject: 'content:latex', revision: 'sha256:latex' }
      },
      lean: {
        availability: 'current',
        correspondence: 'scoped',
        source: 'theorem add_zero_exact (x : Nat) : x + 0 = x := by\n  simp',
        provenance: { subject: 'lean:Curriculum.Addition', revision: '3f1a315f' }
      }
    }
  };

  return {
    ...base,
    ...overrides,
    identity: { ...base.identity, ...(overrides.identity ?? {}) },
    representations: {
      ...base.representations,
      ...(overrides.representations ?? {})
    }
  };
}

function parsedBlock(input = blockFixture(), options) {
  const parsed = validateRepresentationBlock(input, options);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  return parsed.value;
}

test('R01 rendered global default selects current rendered view', () => {
  const views = getOperableViews(parsedBlock());
  const controller = createRepresentationController(views, 'rendered');
  assert.deepEqual(controller.getSnapshot(), {
    globalDefault: 'rendered',
    override: null,
    requestedView: 'rendered',
    effectiveView: 'rendered',
    operableViews: ['rendered', 'latex', 'lean'],
    fallbackReason: null,
    source: 'snapshot',
    changed: false
  });
});

test('R02 selecting LaTeX creates only a local override', () => {
  const controller = createRepresentationController(['rendered', 'latex', 'lean'], 'rendered');
  const selected = controller.select('latex');
  assert.equal(selected.override, 'latex');
  assert.equal(selected.effectiveView, 'latex');
  assert.equal(selected.globalDefault, 'rendered');
});

test('R03 Lean retains exact subject, revision, source and scoped correspondence', () => {
  const value = parsedBlock();
  assert.deepEqual(value.representations.lean, {
    availability: 'current',
    correspondence: 'scoped',
    provenance: { subject: 'lean:Curriculum.Addition', revision: '3f1a315f' },
    payloadAvailable: true,
    source: 'theorem add_zero_exact (x : Nat) : x + 0 = x := by\n  simp'
  });
});

test('R04 restore-global clears override and follows the current global value', () => {
  const controller = createRepresentationController(['rendered', 'latex', 'lean'], 'rendered');
  controller.select('lean');
  controller.updateGlobal('latex');
  const restored = controller.restoreGlobal();
  assert.equal(restored.override, null);
  assert.equal(restored.requestedView, 'latex');
  assert.equal(restored.effectiveView, 'latex');
});

test('R05 a global change updates a block without an override', () => {
  const controller = createRepresentationController(['rendered', 'latex', 'lean'], 'rendered');
  const changed = controller.updateGlobal('lean');
  assert.equal(changed.override, null);
  assert.equal(changed.effectiveView, 'lean');
  assert.equal(changed.changed, true);
});

test('R06 a global or storage change leaves an overridden block unchanged', () => {
  const controller = createRepresentationController(['rendered', 'latex', 'lean'], 'rendered');
  controller.select('latex');
  const changed = controller.updateGlobal('lean', 'storage');
  assert.equal(changed.globalDefault, 'lean');
  assert.equal(changed.override, 'latex');
  assert.equal(changed.effectiveView, 'latex');
  assert.equal(changed.source, 'storage');
});

test('R07 unavailable requested view falls back rendered then LaTeX then Lean without rewriting', () => {
  assert.deepEqual(resolveEffectiveView(['latex', 'lean'], 'rendered'), {
    globalDefault: 'rendered',
    override: null,
    requestedView: 'rendered',
    effectiveView: 'latex',
    operableViews: ['latex', 'lean'],
    fallbackReason: 'requested-unavailable'
  });
  assert.equal(resolveEffectiveView(['lean'], 'latex').effectiveView, 'lean');
  assert.equal(resolveEffectiveView([], 'lean').fallbackReason, 'no-operable-view');
});

test('R08 stale, incompatible, disputed and unreviewed correspondence never create a verified claim', async () => {
  for (const availability of ['stale', 'incompatible', 'disputed']) {
    const value = parsedBlock(blockFixture({
      representations: {
        ...blockFixture().representations,
        lean: {
          ...blockFixture().representations.lean,
          availability,
          correspondence: availability === 'incompatible' ? 'unreviewed' : availability
        }
      }
    }));
    assert.equal(getOperableViews(value).includes('lean'), false);
  }

  const component = await readFile(componentPath, 'utf8');
  assert.doesNotMatch(component, /verified|verification passed/i);
  assert.match(component, /availability/);
  assert.match(component, /correspondence/);
});

test('R09 enhanced tabs implement horizontal automatic APG keyboard behavior', async () => {
  const component = await readFile(componentPath, 'utf8');
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter']) {
    assert.match(component, new RegExp(`event\\.key === '${key}'`));
  }
  assert.match(component, /event\.key === ' '/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.doesNotMatch(component, /ArrowUp|ArrowDown/);
});

test('R10 tablist, tab and tabpanel relations are installed together after enhancement', async () => {
  const component = await readFile(componentPath, 'utf8');
  assert.match(component, /setAttribute\('role', 'tablist'\)/);
  assert.match(component, /setAttribute\('aria-orientation', 'horizontal'\)/);
  assert.match(component, /setAttribute\('role', 'tab'\)/);
  assert.match(component, /setAttribute\('aria-selected'/);
  assert.match(component, /setAttribute\('aria-controls'/);
  assert.match(component, /setAttribute\('role', 'tabpanel'\)/);
  assert.match(component, /setAttribute\('aria-labelledby'/);
});

test('R11 rendered current input requires a qualified renderer and named rendered slot', async () => {
  const missingSlot = validateRepresentationBlock(blockFixture(), { hasRenderedContent: false });
  assert.equal(missingSlot.ok, false);
  assert.match(missingSlot.errors.join('; '), /qualified rendered payload/);

  const invalidRenderer = blockFixture({
    representations: {
      ...blockFixture().representations,
      rendered: { ...blockFixture().representations.rendered, renderer: 'raw-html' }
    }
  });
  assert.equal(validateRepresentationBlock(invalidRenderer).ok, false);

  const component = await readFile(componentPath, 'utf8');
  assert.match(component, /Astro\.slots\.has\('rendered'\)/);
  assert.match(component, /<slot name="rendered" \/>/);
  assert.doesNotMatch(component, /set:html|<img[^>]+data-fmc-rendered/i);
});

test('R12 exact UTF-8 source copy round-trips and both clipboard outcomes are announced', async () => {
  const source = 'theorem α (x : ℕ) : x + 0 = x := by\n  simpa\n';
  assert.equal(decodeSourcePayload(encodeSourcePayload(source)), source);

  const component = await readFile(componentPath, 'utf8');
  assert.match(component, /navigator\.clipboard\?\.writeText/);
  assert.match(component, /await navigator\.clipboard\.writeText\(source\)/);
  assert.match(component, /copied exactly/);
  assert.match(component, /could not be copied/);
  assert.doesNotMatch(component, /execCommand|\.trim\(\).*clipboard|clipboard.*replace/);
});

test('R13 long math and source use local logical overflow and bounded reflow', async () => {
  const css = await readFile(cssPath, 'utf8');
  assert.match(css, /fmc-mathematical-block[\s\S]*max-inline-size: 100%/);
  assert.match(css, /\.fmc-math-block__rendered,[\s\S]*overflow-x: auto/);
  assert.match(css, /\.fmc-source-shell pre,[\s\S]*overflow-x: auto/);
  assert.match(css, /@media \(max-width: 40rem\)/);
  assert.match(css, /flex-direction: column/);
});

test('R14 no-JavaScript output keeps ordinary rendered and source sections visible', async () => {
  const component = await readFile(componentPath, 'utf8');
  assert.match(component, /<section[\s\S]*data-fmc-panel="rendered"/);
  assert.match(component, /<pre tabindex="0"><code>/);
  assert.match(component, /<noscript>/);
  assert.match(component, /interactive tabs require JavaScript/);
  assert.doesNotMatch(component, /data-fmc-panel="rendered"[^>]*hidden/);
  assert.match(component, /data-fmc-tabs[\s\S]*hidden/);
});

test('R15 full reset clears mounted override and restores rendered global default', () => {
  const controller = createRepresentationController(['rendered', 'latex', 'lean'], 'lean');
  controller.select('latex');
  const reset = controller.reset('rendered');
  assert.equal(reset.override, null);
  assert.equal(reset.globalDefault, 'rendered');
  assert.equal(reset.effectiveView, 'rendered');
  assert.equal(reset.source, 'reset');
});

test('R16 identity is stable and component state cannot manufacture route or locale', async () => {
  const identity = blockFixture().identity;
  assert.equal(createRepresentationDomId(identity), createRepresentationDomId({ ...identity }));
  assert.notEqual(createRepresentationDomId(identity), createRepresentationDomId({ ...identity, revision: 'next' }));

  const component = await readFile(componentPath, 'utf8');
  assert.doesNotMatch(component, /localStorage|sessionStorage/);
  assert.doesNotMatch(component, /location\.|history\.|document\.documentElement\.lang\s*=/);
  assert.match(component, /data-fmc-content-id/);
  assert.match(component, /data-fmc-revision/);
});

test('validator rejects missing identity, missing records and incompatible schema majors', () => {
  assert.equal(validateRepresentationBlock({}).ok, false);
  assert.equal(validateRepresentationBlock(blockFixture({ schemaVersion: 2 })).ok, false);
  assert.equal(validateRepresentationBlock(blockFixture({ identity: { contentId: '' } })).ok, false);
  assert.equal(validateRepresentationBlock(blockFixture({ representations: { lean: null } })).ok, false);
});

test('controller rejects unavailable selection and invalid global values without corrupting state', () => {
  const controller = createRepresentationController(['rendered', 'latex'], 'rendered');
  const invalidSelection = controller.select('lean');
  assert.equal(invalidSelection.changed, false);
  assert.equal(invalidSelection.override, null);
  assert.equal(invalidSelection.effectiveView, 'rendered');

  const invalidGlobal = controller.updateGlobal('future-view');
  assert.equal(invalidGlobal.changed, false);
  assert.equal(invalidGlobal.globalDefault, 'rendered');
});
