import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { arch, platform } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const evidenceDirectory = join(dist, '_validation');
const fixturePath = join(dist, 'validation', 'm5-5', 'index.html');
const reportPath = join(evidenceDirectory, 'm5-5-report.json');
const ariaPath = join(evidenceDirectory, 'm5-5-aria.txt');
const storageKey = 'fmc:site-preferences:v1';
const requiredBrowser = process.env.FMC_REQUIRE_BROWSER === '1';
const explicitSkip = process.env.FMC_SKIP_BROWSER === '1';

if (explicitSkip && requiredBrowser) {
  throw new Error('FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1');
}

const chromeCandidates = [
  process.env.FMC_CHROME_EXECUTABLE,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const chromeExecutable = chromeCandidates.find((candidate) => existsSync(candidate));

if (!chromeExecutable) {
  if (explicitSkip && !requiredBrowser) {
    console.log('M5.5 browser qualification explicitly skipped: no Chrome executable in this local environment.');
    process.exit(0);
  }
  throw new Error('M5.5 browser qualification requires an identifiable Chrome executable');
}

if (!existsSync(fixturePath)) {
  throw new Error(`Integrated validation fixture is missing: ${fixturePath}`);
}

mkdirSync(evidenceDirectory, { recursive: true });

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

const server = createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relativePath = normalize(pathname).replace(/^([/\\])+/, '');
    const filePath = resolve(dist, relativePath);
    if (filePath !== dist && !filePath.startsWith(`${dist}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Loopback validation server has no port');
const origin = `http://127.0.0.1:${address.port}`;
const fixtureUrl = `${origin}/validation/m5-5/`;

const browser = await chromium.launch({
  executablePath: chromeExecutable,
  headless: true,
  args: ['--force-color-profile=srgb']
});
const browserVersion = browser.version();

const results = [];
const consoleFailures = [];

function safeActual(actual) {
  if (actual === undefined) return null;
  if (typeof actual === 'number' && !Number.isFinite(actual)) return String(actual);
  return actual;
}

async function row(id, severity, expected, execute) {
  try {
    const outcome = await execute();
    const structured = outcome && typeof outcome === 'object' && Object.hasOwn(outcome, 'pass')
      ? outcome
      : { pass: Boolean(outcome), actual: outcome };
    results.push({
      id,
      severity,
      expected,
      status: structured.pass ? 'pass' : 'fail',
      actual: safeActual(structured.actual),
      evidence: structured.evidence ?? null
    });
  } catch (error) {
    results.push({
      id,
      severity,
      expected,
      status: 'fail',
      actual: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      evidence: null
    });
  }
}

function observePage(page, name) {
  page.on('pageerror', (error) => consoleFailures.push({ page: name, type: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push({ page: name, type: 'console-error', text: message.text() });
  });
}

async function waitForEnhancement(page) {
  await page.waitForFunction(() => Boolean(
    window.FMCPreferenceStore
    && document.querySelector('fmc-mathematical-block')?.dataset.fmcEffectiveView
    && document.querySelector('fmc-outline-navigator')?.dataset.fmcEnhanced === 'true'
  ));
}

function parseColor(color) {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
  }
  const match = value.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i);
  if (!match) throw new Error(`Unsupported computed color: ${color}`);
  return match.slice(1, 4).map(Number);
}

function luminance(color) {
  const channels = parseColor(color).map((channel) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.04045
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(3));
}

async function rootTokens(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const names = ['--fmc-surface', '--fmc-surface-raised', '--fmc-text', '--fmc-text-muted', '--fmc-accent-strong', '--fmc-focus', '--fmc-border'];
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  });
}

const sourceRevision = process.env.FMC_SOURCE_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const candidateManifest = JSON.parse(readFileSync(join(root, 'validation', 'm5-5-candidate.json'), 'utf8'));

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    contrast: 'no-preference',
    reducedMotion: 'reduce',
    locale: 'en-US'
  });
  await desktopContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await desktopContext.newPage();
  observePage(page, 'desktop');
  await page.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await waitForEnhancement(page);

  const preferences = page.locator('details.fmc-preferences');
  await preferences.locator('summary').click();
  const mathBlock = page.locator('fmc-mathematical-block');
  const outline = page.locator('fmc-outline-navigator');
  const outlineNav = outline.getByRole('navigation');

  await row('B01', 'Blocker', 'All three M5.5 surfaces mount once against one shared store', async () => {
    const counts = {
      preferences: await page.locator('fmc-preference-controls').count(),
      representation: await mathBlock.count(),
      outline: await outline.count(),
      store: await page.evaluate(() => Boolean(window.FMCPreferenceStore))
    };
    return { pass: counts.preferences === 1 && counts.representation === 1 && counts.outline === 1 && counts.store, actual: counts };
  });

  await row('B02', 'Material', 'Fresh integrated defaults are system/rendered/Course with no block override', async () => {
    const actual = await page.evaluate(() => ({
      snapshot: window.FMCPreferenceStore.getSnapshot().preferences,
      blockView: document.querySelector('fmc-mathematical-block').dataset.fmcEffectiveView,
      projection: document.documentElement.dataset.fmcProjection
    }));
    return {
      pass: actual.snapshot.themePreference === 'system'
        && actual.snapshot.representationDefault === 'rendered'
        && actual.snapshot.outlineProjection === 'course'
        && actual.blockView === 'rendered'
        && actual.projection === 'course',
      actual
    };
  });

  await row('B03', 'Material', 'Representation tabs expose exact APG relationships and automatic horizontal keys', async () => {
    const tablist = mathBlock.getByRole('tablist');
    const rendered = mathBlock.getByRole('tab', { name: 'Rendered mathematics' });
    await rendered.focus();
    await page.keyboard.press('ArrowRight');
    const afterRight = await mathBlock.getAttribute('data-fmc-effective-view');
    const latexSelected = await mathBlock.getByRole('tab', { name: 'LaTeX source' }).getAttribute('aria-selected');
    await page.keyboard.press('Home');
    const homeSelected = await rendered.getAttribute('aria-selected');
    await page.keyboard.press('End');
    const endSelected = await mathBlock.getByRole('tab', { name: 'Lean source' }).getAttribute('aria-selected');
    const beforeUp = await mathBlock.getAttribute('data-fmc-effective-view');
    await page.keyboard.press('ArrowUp');
    const afterUp = await mathBlock.getAttribute('data-fmc-effective-view');
    const aria = await tablist.ariaSnapshot();
    return {
      pass: afterRight === 'latex' && latexSelected === 'true' && homeSelected === 'true' && endSelected === 'true' && beforeUp === afterUp && /tab "Lean source" \[selected\]/.test(aria),
      actual: { afterRight, latexSelected, homeSelected, endSelected, upPreserved: beforeUp === afterUp, aria }
    };
  });

  await page.evaluate(() => window.FMCPreferenceStore.reset());
  await row('B04', 'Material', 'Global default, local override and restore-global remain independently owned', async () => {
    await preferences.locator('select[data-fmc-field="representationDefault"]').selectOption('latex');
    const globalLatex = await mathBlock.getAttribute('data-fmc-effective-view');
    await mathBlock.getByRole('tab', { name: 'Lean source' }).click();
    await preferences.locator('select[data-fmc-field="representationDefault"]').selectOption('rendered');
    const overrideLean = await mathBlock.getAttribute('data-fmc-effective-view');
    const restore = mathBlock.locator('[data-fmc-restore-global]');
    const restoreLabel = await restore.textContent();
    await restore.click();
    const restored = await mathBlock.getAttribute('data-fmc-effective-view');
    return {
      pass: globalLatex === 'latex' && overrideLean === 'lean' && /Rendered mathematics/.test(restoreLabel ?? '') && restored === 'rendered',
      actual: { globalLatex, overrideLean, restoreLabel, restored }
    };
  });

  await row('B05', 'Blocker', 'Projection switching preserves URL, canonical metadata, content identity and active block override', async () => {
    await mathBlock.getByRole('tab', { name: 'Lean source' }).click();
    const before = await page.evaluate(() => ({
      href: location.href,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      blockId: document.querySelector('fmc-mathematical-block')?.dataset.fmcBlockId,
      contentId: document.querySelector('fmc-mathematical-block')?.dataset.fmcContentId
    }));
    const selector = outline.locator('[data-fmc-projection]');
    await selector.focus();
    await selector.selectOption('ontomathpro');
    const after = await page.evaluate(() => ({
      href: location.href,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      blockId: document.querySelector('fmc-mathematical-block')?.dataset.fmcBlockId,
      contentId: document.querySelector('fmc-mathematical-block')?.dataset.fmcContentId,
      blockView: document.querySelector('fmc-mathematical-block')?.dataset.fmcEffectiveView,
      requestedProjection: window.FMCPreferenceStore.getSnapshot().preferences.outlineProjection,
      selectorFocused: document.activeElement === document.querySelector('[data-fmc-projection]')
    }));
    return {
      pass: JSON.stringify(before) === JSON.stringify({ href: after.href, canonical: after.canonical, blockId: after.blockId, contentId: after.contentId })
        && after.blockView === 'lean'
        && after.requestedProjection === 'ontomathpro'
        && after.selectorFocused,
      actual: { before, after }
    };
  });

  await row('B06', 'Material', 'OntoMathPRO exposes multiple references to one route with one active traversal and an alternate cue', async () => {
    await outline.locator('[data-fmc-expand-all]').click();
    const currentLinks = outlineNav.locator('a[aria-current="page"]');
    const alternateCues = outlineNav.getByText('current entity, alternate placement', { exact: true });
    const groupRoutes = await outlineNav.getByRole('link', { name: 'Group', exact: true }).evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    return {
      pass: await currentLinks.count() === 1 && await alternateCues.count() >= 1 && groupRoutes.length === 2 && new Set(groupRoutes).size === 1,
      actual: { currentLinks: await currentLinks.count(), alternateCues: await alternateCues.count(), groupRoutes }
    };
  });

  await row('B07', 'Material', 'Projection-local query/filter uses deterministic no-result focus recovery and one-action reset', async () => {
    await outline.locator('[data-fmc-projection]').selectOption('course');
    await outline.locator('[data-fmc-expand-all]').click();
    const activeRowLink = outlineNav.getByRole('link', { name: 'Definition of a group', exact: true }).first();
    await activeRowLink.focus();
    const query = outline.locator('[data-fmc-outline-query]');
    await query.evaluate((input) => {
      input.value = 'no-such-outline-result';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const focusRecovered = await page.evaluate(() => document.activeElement?.hasAttribute('data-fmc-outline-results'));
    const noResultsVisible = await outline.locator('[data-fmc-no-results]').isVisible();
    await outline.locator('[data-fmc-clear-results]').click();
    const after = await page.evaluate(() => ({
      projection: window.FMCPreferenceStore.getSnapshot().preferences.outlineProjection,
      query: document.querySelector('[data-fmc-outline-query]')?.value,
      representation: window.FMCPreferenceStore.getSnapshot().preferences.representationDefault
    }));
    return {
      pass: focusRecovered && noResultsVisible && after.projection === 'course' && after.query === '' && after.representation === 'rendered',
      actual: { focusRecovered, noResultsVisible, after }
    };
  });

  await row('B08', 'Material', 'Full reset clears mounted component context and restores Course/rendered without a route change', async () => {
    const href = page.url();
    await mathBlock.getByRole('tab', { name: 'Lean source' }).click();
    await outline.locator('[data-fmc-projection]').selectOption('msc2020');
    await outline.locator('[data-fmc-outline-query]').fill('group');
    await preferences.locator('[data-fmc-reset]').click();
    const actual = await page.evaluate(() => ({
      href: location.href,
      preferences: window.FMCPreferenceStore.getSnapshot().preferences,
      blockView: document.querySelector('fmc-mathematical-block')?.dataset.fmcEffectiveView,
      projectionValue: document.querySelector('[data-fmc-projection]')?.value,
      query: document.querySelector('[data-fmc-outline-query]')?.value
    }));
    return {
      pass: actual.href === href
        && actual.preferences.outlineProjection === 'course'
        && actual.preferences.representationDefault === 'rendered'
        && actual.blockView === 'rendered'
        && actual.projectionValue === 'course'
        && actual.query === '',
      actual
    };
  });

  await row('B09', 'Material', 'Valid storage events update atomically and invalid events preserve the last coherent state', async () => {
    const actual = await page.evaluate((key) => {
      const initial = window.FMCPreferenceStore.getSnapshot().preferences;
      const valid = {
        ...initial,
        themePreference: 'dark',
        representationDefault: 'latex',
        outlineProjection: 'arxiv'
      };
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(valid) }));
      const afterValid = window.FMCPreferenceStore.getSnapshot().preferences;
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: '{invalid-json' }));
      const afterInvalid = window.FMCPreferenceStore.getSnapshot().preferences;
      return { afterValid, afterInvalid };
    }, storageKey);
    return {
      pass: actual.afterValid.themePreference === 'dark'
        && actual.afterValid.representationDefault === 'latex'
        && actual.afterValid.outlineProjection === 'arxiv'
        && JSON.stringify(actual.afterValid) === JSON.stringify(actual.afterInvalid),
      actual
    };
  });

  await page.evaluate(() => window.FMCPreferenceStore.reset());
  await row('B10', 'Material', 'Exact LaTeX bytes copy successfully and clipboard rejection is announced without focus theft', async () => {
    const latexSource = String.raw`\forall x \in G,\quad e \cdot x = x = x \cdot e\qquad\text{(synthetic integration fixture with deliberately long source for local-overflow qualification)}`;
    await mathBlock.getByRole('tab', { name: 'LaTeX source' }).click();
    const latexCopy = mathBlock.locator('[data-fmc-copy="latex"]');
    await latexCopy.click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const successStatus = await mathBlock.locator('[data-fmc-block-status]').textContent();
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async () => { throw new Error('validation rejection'); }
      });
    });
    const leanCopy = mathBlock.locator('[data-fmc-copy="lean"]');
    await mathBlock.getByRole('tab', { name: 'Lean source' }).click();
    await leanCopy.click();
    const failureStatus = await mathBlock.locator('[data-fmc-block-status]').textContent();
    const focusPreserved = await leanCopy.evaluate((button) => document.activeElement === button);
    return {
      pass: copied === latexSource && /copied exactly/.test(successStatus ?? '') && /could not be copied/.test(failureStatus ?? '') && focusPreserved,
      actual: { exactBytes: copied === latexSource, successStatus, failureStatus, focusPreserved }
    };
  });

  const tabAria = await mathBlock.getByRole('tablist').ariaSnapshot();
  const outlineAria = await outlineNav.ariaSnapshot();
  writeFileSync(ariaPath, `# Representation tablist\n${tabAria}\n\n# Outline navigation\n${outlineAria}\n`, 'utf8');
  await row('B11', 'Material', 'ARIA snapshot exposes tab selection, named navigation, disclosures, current traversal and live status', async () => ({
    pass: /tablist/.test(tabAria)
      && /tab "Lean source" \[selected\]/.test(tabAria)
      && /navigation "Synthetic course outline"/.test(outlineAria)
      && /button "(Expand|Collapse)/.test(outlineAria)
      && /link .*current/.test(outlineAria),
    actual: { tabAriaLines: tabAria.split('\n').length, outlineAriaLines: outlineAria.split('\n').length },
    evidence: '_validation/m5-5-aria.txt'
  }));

  await row('B12', 'Material', 'Every visible standalone project control is at least 44×44 CSS pixels and checkbox labels are 44px tall', async () => {
    const actual = await page.evaluate(() => {
      const selectors = [
        'button[data-fmc-control]',
        'summary[data-fmc-control]',
        'select[data-fmc-control]',
        'input[type="search"][data-fmc-control]'
      ];
      const controls = [...document.querySelectorAll(selectors.join(','))]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName, width: rect.width, height: rect.height };
        });
      const checkboxLabels = [...document.querySelectorAll('.fmc-outline-filters label')]
        .filter((label) => label.getBoundingClientRect().height > 0)
        .map((label) => ({ name: label.textContent?.trim(), height: label.getBoundingClientRect().height }));
      return { controls, checkboxLabels };
    });
    const undersized = actual.controls.filter((item) => item.width < 43.5 || item.height < 43.5);
    const shortLabels = actual.checkboxLabels.filter((item) => item.height < 43.5);
    return { pass: actual.controls.length > 10 && undersized.length === 0 && shortLabels.length === 0, actual: { measured: actual.controls.length, undersized, shortLabels } };
  });

  await row('B13', 'Material', 'Keyboard focus has a nonzero visible outline and intersects the viewport', async () => {
    await preferences.locator('summary').focus();
    const actual = await preferences.locator('summary').evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        visible: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
      };
    });
    return { pass: actual.outlineStyle !== 'none' && Number.parseFloat(actual.outlineWidth) > 0 && actual.visible, actual };
  });

  const themes = ['light', 'light-high-contrast', 'dark', 'dark-high-contrast'];
  const themeMeasurements = [];
  await preferences.evaluate((details) => { details.open = false; });
  for (const theme of themes) {
    await page.evaluate((nextTheme) => window.FMCPreferenceStore.set({ themePreference: nextTheme }, 'validation-theme'), theme);
    await page.waitForFunction((nextTheme) => document.documentElement.dataset.fmcTheme === nextTheme, theme);
    const tokens = await rootTokens(page);
    const ratios = {
      textSurface: contrast(tokens['--fmc-text'], tokens['--fmc-surface']),
      textRaised: contrast(tokens['--fmc-text'], tokens['--fmc-surface-raised']),
      mutedSurface: contrast(tokens['--fmc-text-muted'], tokens['--fmc-surface']),
      accentSurface: contrast(tokens['--fmc-accent-strong'], tokens['--fmc-surface']),
      focusSurface: contrast(tokens['--fmc-focus'], tokens['--fmc-surface']),
      borderSurface: contrast(tokens['--fmc-border'], tokens['--fmc-surface'])
    };
    themeMeasurements.push({ theme, tokens, ratios });
    await page.screenshot({ path: join(evidenceDirectory, `m5-5-theme-${theme}.png`), fullPage: true });
  }
  await row('B14', 'Blocker', 'All four official computed themes pass text/focus 4.5:1 and border 3:1 gates', async () => {
    const failures = themeMeasurements.flatMap((measurement) => {
      const textFailures = Object.entries(measurement.ratios)
        .filter(([name, ratio]) => name === 'borderSurface' ? ratio < 3 : ratio < 4.5)
        .map(([name, ratio]) => ({ theme: measurement.theme, name, ratio }));
      return textFailures;
    });
    return { pass: failures.length === 0 && themeMeasurements.length === 4, actual: { measurements: themeMeasurements, failures } };
  });

  await row('B15', 'Material', 'Every qualified typography family/size/weight combination applies while code and math boundaries stay stable', async () => {
    const combinations = [];
    for (const family of ['sans-serif', 'serif']) {
      for (const size of ['small', 'default', 'large']) {
        for (const weight of ['regular', 'medium']) {
          combinations.push(await page.evaluate(({ family, size, weight }) => {
            window.FMCPreferenceStore.set({ typography: { family, size, weight } }, 'validation-type');
            const body = getComputedStyle(document.body);
            const code = getComputedStyle(document.querySelector('code'));
            const math = getComputedStyle(document.querySelector('math'));
            return {
              requested: { family, size, weight },
              root: {
                family: document.documentElement.dataset.fmcFontFamily,
                size: document.documentElement.dataset.fmcTextSize,
                weight: document.documentElement.dataset.fmcTextWeight
              },
              body: { family: body.fontFamily, size: body.fontSize, weight: body.fontWeight },
              codeFamily: code.fontFamily,
              mathWeight: math.fontWeight
            };
          }, { family, size, weight }));
        }
      }
    }
    const codeFamilies = new Set(combinations.map((item) => item.codeFamily));
    const valid = combinations.every((item) => JSON.stringify(item.requested) === JSON.stringify(item.root) && item.body.family && item.body.size && item.body.weight);
    return { pass: combinations.length === 12 && valid && codeFamilies.size === 1 && combinations.every((item) => item.mathWeight === '400' || item.mathWeight === 'normal'), actual: combinations };
  });

  await desktopContext.close();

  const corruptContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await corruptContext.addInitScript(({ key }) => localStorage.setItem(key, '{corrupt-json'), { key: storageKey });
  const corruptPage = await corruptContext.newPage();
  observePage(corruptPage, 'corrupt-storage');
  await corruptPage.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await waitForEnhancement(corruptPage);
  await row('B16', 'Material', 'Corrupt persisted state is discarded atomically to fresh defaults', async () => {
    const actual = await corruptPage.evaluate((key) => ({
      snapshot: window.FMCPreferenceStore.getSnapshot().preferences,
      stored: localStorage.getItem(key)
    }), storageKey);
    return { pass: actual.snapshot.representationDefault === 'rendered' && actual.snapshot.outlineProjection === 'course' && actual.stored === null, actual };
  });
  await corruptContext.close();

  const deniedContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await deniedContext.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Denied by validation fixture', 'SecurityError'); }
    });
  });
  const deniedPage = await deniedContext.newPage();
  observePage(deniedPage, 'denied-storage');
  await deniedPage.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await waitForEnhancement(deniedPage);
  await row('B17', 'Material', 'Denied Web Storage keeps all three surfaces coherent and operable in memory', async () => {
    const selector = deniedPage.locator('[data-fmc-projection]');
    await selector.selectOption('msc2020');
    await deniedPage.locator('fmc-mathematical-block').getByRole('tab', { name: 'Lean source' }).click();
    const actual = await deniedPage.evaluate(() => ({
      persistence: window.FMCPreferenceStore.getSnapshot().persistenceAvailable,
      projection: window.FMCPreferenceStore.getSnapshot().preferences.outlineProjection,
      block: document.querySelector('fmc-mathematical-block')?.dataset.fmcEffectiveView
    }));
    return { pass: actual.persistence === false && actual.projection === 'msc2020' && actual.block === 'lean', actual };
  });
  await deniedContext.close();

  const narrowContext = await browser.newContext({
    viewport: { width: 320, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'reduce'
  });
  const narrowPage = await narrowContext.newPage();
  observePage(narrowPage, 'narrow');
  await narrowPage.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await waitForEnhancement(narrowPage);
  const trigger = narrowPage.locator('[data-fmc-outline-open]');
  const dialog = narrowPage.locator('[data-fmc-outline-dialog]');
  await trigger.click();
  await row('B18', 'Material', 'The same narrow dialog is modal, contains sequential focus, closes on Escape and restores trigger focus', async () => {
    const modal = await dialog.evaluate((element) => element.matches(':modal'));
    let contained = true;
    for (let index = 0; index < 24; index += 1) {
      await narrowPage.keyboard.press('Tab');
      contained &&= await dialog.evaluate((element) => element.contains(document.activeElement));
    }
    await narrowPage.screenshot({ path: join(evidenceDirectory, 'm5-5-narrow-modal.png'), fullPage: true });
    await narrowPage.keyboard.press('Escape');
    await narrowPage.waitForFunction(() => !document.querySelector('[data-fmc-outline-dialog]')?.open);
    const restored = await trigger.evaluate((button) => document.activeElement === button);
    return { pass: modal && contained && restored, actual: { modal, contained, restored } };
  });

  await row('B19', 'Material', '320px/400% proxy and 200% text reflow avoid page-wide overflow while source overflow stays local', async () => {
    const math = narrowPage.locator('fmc-mathematical-block');
    await math.getByRole('tab', { name: 'LaTeX source' }).click();
    await narrowPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const actual = await narrowPage.evaluate(() => {
      const root = document.documentElement;
      const pre = document.querySelector('.fmc-source-shell pre');
      return {
        viewport: innerWidth,
        pageClientWidth: root.clientWidth,
        pageScrollWidth: root.scrollWidth,
        pageOverflow: root.scrollWidth - root.clientWidth,
        sourceClientWidth: pre?.clientWidth ?? 0,
        sourceScrollWidth: pre?.scrollWidth ?? 0,
        sourceLocalOverflow: Boolean(pre && pre.scrollWidth > pre.clientWidth)
      };
    });
    return { pass: actual.viewport === 320 && actual.pageOverflow <= 1 && actual.sourceLocalOverflow, actual };
  });
  await narrowContext.close();

  const forcedContext = await browser.newContext({
    viewport: { width: 1000, height: 800 },
    forcedColors: 'active',
    reducedMotion: 'reduce'
  });
  const forcedPage = await forcedContext.newPage();
  observePage(forcedPage, 'forced-colors');
  await forcedPage.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await waitForEnhancement(forcedPage);
  await forcedPage.locator('details.fmc-preferences summary').focus();
  await forcedPage.screenshot({ path: join(evidenceDirectory, 'm5-5-forced-colors.png'), fullPage: true });
  await row('B20', 'Material', 'Forced colors and reduced motion media are active with visible system-color focus and effectively zero motion', async () => {
    const actual = await forcedPage.evaluate(() => {
      const focus = document.querySelector('details.fmc-preferences summary');
      const disclosure = document.querySelector('.fmc-outline-disclosure');
      const focusStyle = getComputedStyle(focus);
      const motionStyle = getComputedStyle(disclosure);
      return {
        forcedColors: matchMedia('(forced-colors: active)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        outlineStyle: focusStyle.outlineStyle,
        outlineWidth: focusStyle.outlineWidth,
        outlineColor: focusStyle.outlineColor,
        transitionDuration: motionStyle.transitionDuration,
        animationDuration: motionStyle.animationDuration
      };
    });
    const motion = Math.max(...actual.transitionDuration.split(',').map((value) => Number.parseFloat(value) || 0), ...actual.animationDuration.split(',').map((value) => Number.parseFloat(value) || 0));
    return { pass: actual.forcedColors && actual.reducedMotion && actual.outlineStyle !== 'none' && Number.parseFloat(actual.outlineWidth) > 0 && motion <= 0.01, actual: { ...actual, maximumDurationSeconds: motion } };
  });
  await forcedContext.close();

  const noJsContext = await browser.newContext({ viewport: { width: 320, height: 800 }, javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();
  observePage(noJsPage, 'no-javascript');
  await noJsPage.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await noJsPage.screenshot({ path: join(evidenceDirectory, 'm5-5-no-javascript.png'), fullPage: true });
  await row('B21', 'Blocker', 'No-JavaScript output retains Course navigation, ordinary links, all representation sections and provenance', async () => {
    const actual = await noJsPage.evaluate(() => ({
      courseLists: document.querySelectorAll('[data-fmc-static-outline]').length,
      projectionLinks: document.querySelectorAll('.fmc-outline-projection-links a').length,
      representationSections: document.querySelectorAll('[data-fmc-panel]').length,
      provenanceRows: document.querySelectorAll('[data-fmc-representation-state]').length,
      enhancementHidden: document.querySelector('[data-fmc-outline-enhancement]')?.hasAttribute('hidden'),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      noscriptText: document.body.textContent?.includes('Projection switching, search and filters require JavaScript')
    }));
    return {
      pass: actual.courseLists >= 1
        && actual.projectionLinks === 5
        && actual.representationSections === 3
        && actual.provenanceRows === 3
        && actual.enhancementHidden
        && actual.pageOverflow <= 1
        && actual.noscriptText,
      actual
    };
  });
  await noJsContext.close();

  await row('B22', 'Blocker', 'No browser page or console errors occurred in any executed scenario', async () => ({
    pass: consoleFailures.length === 0,
    actual: consoleFailures
  }));
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const evidenceNames = [
  'm5-5-aria.txt',
  'm5-5-theme-light.png',
  'm5-5-theme-light-high-contrast.png',
  'm5-5-theme-dark.png',
  'm5-5-theme-dark-high-contrast.png',
  'm5-5-narrow-modal.png',
  'm5-5-forced-colors.png',
  'm5-5-no-javascript.png'
];
const missingEvidence = evidenceNames.filter((name) => !existsSync(join(evidenceDirectory, name)));
results.push({
  id: 'B23',
  severity: 'Blocker',
  expected: 'The ARIA snapshot and all seven required screenshots exist before artifact verification',
  status: missingEvidence.length === 0 ? 'pass' : 'fail',
  actual: { required: evidenceNames.length, missing: missingEvidence },
  evidence: null
});
const evidenceFiles = evidenceNames.filter((name) => existsSync(join(evidenceDirectory, name))).map((name) => {
  const path = join(evidenceDirectory, name);
  const bytes = readFileSync(path);
  return {
    path: `_validation/${name}`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
});

const failed = results.filter((result) => result.status === 'fail');
const report = {
  schemaVersion: 'p5-m5.5-browser-qualification/v1',
  candidate: {
    sourceRevision,
    entryWebsiteRevision: candidateManifest.entryWebsiteRevision,
    contentRevision: candidateManifest.contentRevision,
    fixtureClassification: candidateManifest.fixtureClassification,
    deploymentAuthorized: false
  },
  environment: {
    node: process.version,
    pnpm: packageManifest.packageManager,
    playwrightCore: packageManifest.devDependencies['playwright-core'],
    browser: browserVersion,
    executable: chromeExecutable,
    platform: platform(),
    architecture: arch()
  },
  execution: {
    requiredBrowser,
    skipped: false,
    viewports: ['1440x1000', '1000x800', '320x800'],
    media: ['light', 'dark', 'contrast-more token themes', 'forced-colors-active', 'reduced-motion-reduce'],
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length
  },
  results,
  evidenceFiles,
  limitations: candidateManifest.limitations
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (failed.length > 0) {
  const summary = failed.map((result) => `${result.id}: ${result.actual}`).join('\n');
  throw new Error(`M5.5 browser qualification failed ${failed.length}/${results.length} rows:\n${summary}`);
}

console.log(`M5.5 browser qualification passed ${results.length}/${results.length} rows on ${report.environment.browser}`);
console.log(`M5.5 evidence: ${reportPath}`);
