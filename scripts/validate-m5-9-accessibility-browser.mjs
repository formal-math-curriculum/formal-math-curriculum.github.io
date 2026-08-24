import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { platform, arch } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium, firefox, webkit } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const evidenceDirectory = join(dist, '_validation', 'm5-9-accessibility-v1');
const reportPath = join(evidenceDirectory, 'report.json');
const manifestPath = join(evidenceDirectory, 'manifest.json');
const candidateRevision = process.env.FMC_M59_CANDIDATE_REVISION
  ?? '23c76800ccd19dcc40f2b16c21297283fb2c7f20';
const expectedCandidateTree = '7060d821d216655d762019f15e1ba7a18d18d078';
const expectedContentRevision = '3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828';
const expectedContentTree = '59d0e0c49851b534bf528e46dd6ce74f46173c6c';
const expectedLeanRevision = '3f1a315f438af37a327eaf8b9b9c1dbc6f409394';
const expectedMathlibRevision = 'db584cd6d46c92f209a44c0f1c829460d327499d';
const harnessRevision = process.env.FMC_M59_HARNESS_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const requiredBrowser = process.env.FMC_REQUIRE_BROWSER === '1';
const allowNoBrowser = process.env.FMC_M59_ALLOW_NO_BROWSER === '1' && !requiredBrowser;
const primaryRoute = '/content/p5m56c0004/natural-number-operation-laws/';
const fixtureRoute = '/validation/m5-6/';
const expectedBrowserVersions = {
  chromium: '151.0.7922.34',
  firefox: '153.0',
  webkit: '26.5',
  chrome: '151.0.7922.137'
};
const budgets = {
  distBytes: 3_200_000,
  distFiles: 150,
  pagefindBytes: 900_000,
  htmlBytes: 112_000,
  scriptBytes: 112_000,
  styleBytes: 77_000,
  gzipHtmlBytes: 20_000,
  gzipUiCoreBytes: 32_000,
  gzipPrimaryCssBytes: 14_000,
  documentTransferBytes: 120_000,
  scriptTransferBytes: 190_000,
  styleTransferBytes: 150_000,
  totalTransferBytes: 520_000,
  domContentLoadedMs: 2_500,
  loadMs: 3_500,
  lcpMs: 2_500,
  inpMs: 200,
  cls: 0.1
};

mkdirSync(evidenceDirectory, { recursive: true });

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function filesBelow(directory, excludedPrefix = null) {
  const files = [];
  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (excludedPrefix && (path === excludedPrefix || path.startsWith(`${excludedPrefix}${sep}`))) continue;
      const entry = statSync(path);
      if (entry.isDirectory()) walk(path);
      if (entry.isFile()) files.push(path);
    }
  }
  walk(directory);
  return files;
}

function directoryStats(directory) {
  const files = filesBelow(directory);
  return {
    files: files.length,
    bytes: files.reduce((sum, path) => sum + statSync(path).size, 0)
  };
}

function record(rows, id, severity, expected, pass, actual) {
  rows.push({ id, severity, expected, status: pass ? 'pass' : 'fail', actual });
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortValue(nested)]));
  }
  return value;
}

function stableDigest(value) {
  return sha256(JSON.stringify(sortValue(value)));
}

const inputLock = JSON.parse(readFileSync(join(root, 'inputs.lock.json'), 'utf8'));
const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const browserManifest = JSON.parse(readFileSync(join(root, 'node_modules/playwright-core/browsers.json'), 'utf8'));
const currentSelector = JSON.parse(readFileSync(join(root, 'validation/m5-8-current.json'), 'utf8'));
const candidateRecordBytes = readFileSync(join(root, 'validation/m5-8-dogfood-candidate-v2.json'));
const matrixBytes = readFileSync(join(root, 'validation/m5-8-dogfood-matrix-v2.json'));
const selectorBytes = readFileSync(join(root, 'validation/m5-8-current.json'));
const candidateTree = git('rev-parse', `${candidateRevision}^{tree}`);
const harnessChangedPaths = git('diff', '--name-only', candidateRevision, harnessRevision).split('\n').filter(Boolean);
const allowedHarnessPaths = new Set([
  '.github/workflows/ci.yml',
  'docs/qualification/m5-9-accessibility-browser.md',
  'scripts/validate-m5-9-accessibility-browser.mjs',
  'tests/m5-9-qualification.test.mjs'
]);
const applicationDrift = harnessChangedPaths.filter((path) => !allowedHarnessPaths.has(path));
const bundledBrowsers = Object.fromEntries(browserManifest.browsers
  .filter(({ name }) => ['chromium', 'firefox', 'webkit'].includes(name))
  .map(({ name, revision, browserVersion }) => [name, { revision, browserVersion }]));

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('M5.9 accessibility qualification requires an already built dist subject');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function safeFile(pathname) {
  const relativePath = normalize(pathname).replace(/^([/\\])+/, '');
  const file = resolve(dist, relativePath);
  return file === dist || file.startsWith(`${dist}${sep}`) ? file : null;
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let file = safeFile(pathname);
    let status = 200;
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      file = join(dist, '404.html');
      status = 404;
    }
    const size = statSync(file).size;
    const immutableAsset = pathname.startsWith('/_astro/') && /\.[A-Za-z0-9_-]{8,}\./u.test(pathname);
    response.writeHead(status, {
      'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream',
      'content-length': String(size),
      'cache-control': immutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('M5.9 loopback server has no port');
const origin = `http://127.0.0.1:${address.port}`;

const rows = [];
const consoleFailures = [];
const externalRequests = [];
const engineEvidence = {};

record(rows, 'A01', 'Blocker', 'exact frozen subject and harness-only diff',
  candidateTree === expectedCandidateTree
    && applicationDrift.length === 0
    && inputLock.consumed.content.revision === expectedContentRevision
    && inputLock.consumed.content.tree === expectedContentTree
    && inputLock.recorded_not_consumed.lean.revision === expectedLeanRevision
    && inputLock.recorded_not_consumed.mathlib.revision === expectedMathlibRevision
    && packageManifest.engines.node === '24.19.0'
    && packageManifest.packageManager === 'pnpm@11.23.0'
    && packageManifest.devDependencies['playwright-core'] === '1.62.1'
    && currentSelector.candidateId === 'P5-M5.8-CANDIDATE-v2'
    && currentSelector.deploymentAuthorized === false,
  {
    candidateRevision,
    candidateTree,
    expectedCandidateTree,
    harnessRevision,
    harnessChangedPaths,
    applicationDrift,
    inputs: {
      contentRevision: inputLock.consumed.content.revision,
      contentTree: inputLock.consumed.content.tree,
      leanRevision: inputLock.recorded_not_consumed.lean.revision,
      mathlibRevision: inputLock.recorded_not_consumed.mathlib.revision
    },
    hashes: {
      selector: sha256(selectorBytes),
      candidateRecord: sha256(candidateRecordBytes),
      matrix: sha256(matrixBytes)
    },
    bundledBrowsers
  });

function observe(page, engine) {
  page.on('pageerror', (error) => consoleFailures.push({ engine, type: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push({ engine, type: 'console-error', text: message.text() });
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== origin) externalRequests.push({ engine, url: request.url(), resourceType: request.resourceType() });
  });
}

async function waitForCourse(page) {
  await page.waitForSelector('fmc-outline-navigator[data-fmc-enhanced="true"]');
  await page.waitForSelector('fmc-mathematical-block[data-fmc-effective-view]');
}

async function semanticAudit(page) {
  return page.evaluate(() => {
    const visible = (element) => element.getClientRects().length > 0;
    const nameOf = (element) => element.getAttribute('aria-label')
      || (element.labels?.length ? [...element.labels].map((label) => label.textContent?.trim()).join(' ') : '')
      || element.textContent?.trim()
      || element.getAttribute('title')
      || '';
    const controls = [...document.querySelectorAll('button, input, select, summary, [role="tab"]')].filter(visible);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const unnamedControls = controls.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 180));
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const tabPanels = [...document.querySelectorAll('[role="tabpanel"]')];
    const invalidTabs = tabs.filter((tab) => {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      return !panel || panel.getAttribute('role') !== 'tabpanel' || !['true', 'false'].includes(tab.getAttribute('aria-selected') ?? '');
    }).length;
    const math = [...document.querySelectorAll('math')];
    const mathWithoutTextAlternative = math.filter((node) => !node.querySelector('annotation[encoding="application/x-tex"]') && !node.getAttribute('aria-label')).length;
    return {
      landmarks: {
        main: document.querySelectorAll('main').length,
        nav: document.querySelectorAll('nav').length,
        header: document.querySelectorAll('header').length,
        footer: document.querySelectorAll('footer').length
      },
      headingOneCount: document.querySelectorAll('h1').length,
      duplicateIds,
      unnamedControls,
      statusRegions: document.querySelectorAll('[role="status"][aria-live]').length,
      tabs: tabs.length,
      tabPanels: tabPanels.length,
      invalidTabs,
      mathCount: math.length,
      mathWithoutTextAlternative,
      currentPageCount: document.querySelectorAll('[aria-current="page"]').length
    };
  });
}

async function projectionAndFilterAudit(page) {
  const before = await page.evaluate(() => ({
    pathname: location.pathname,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    contentId: document.querySelector('fmc-outline-navigator')?.getAttribute('data-fmc-current-content-id')
  }));
  const selector = page.locator('select[data-fmc-projection]').first();
  const options = await selector.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, disabled: node.disabled })));
  const usable = options.filter(({ disabled }) => !disabled).map(({ value }) => value);
  for (const projection of usable) await selector.selectOption(projection);
  const after = await page.evaluate(() => ({
    pathname: location.pathname,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    contentId: document.querySelector('fmc-outline-navigator')?.getAttribute('data-fmc-current-content-id'),
    effectiveProjection: document.querySelector('fmc-outline-navigator')?.effectiveProjection,
    context: document.querySelector('[data-fmc-outline-context]')?.textContent?.trim()
  }));

  await page.goto(`${origin}${fixtureRoute}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('fmc-outline-navigator[data-fmc-enhanced="true"]');
  const fixtureSelector = page.locator('select[data-fmc-projection]').first();
  const fixtureOptions = await fixtureSelector.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, disabled: node.disabled })));
  const switched = [];
  for (const option of fixtureOptions) {
    if (option.disabled) continue;
    await fixtureSelector.selectOption(option.value);
    switched.push(await page.evaluate(() => ({
      requested: document.querySelector('select[data-fmc-projection]')?.value,
      effective: document.querySelector('fmc-outline-navigator')?.effectiveProjection,
      pathname: location.pathname,
      referenceCount: document.querySelectorAll('[data-fmc-outline-tree] [data-fmc-reference-id]').length
    })));
  }

  await fixtureSelector.selectOption('course');
  const contentKind = page.locator('[data-fmc-filter-family="universal"]', { hasText: 'Content kind' });
  const exercise = contentKind.getByText('Exercise', { exact: true }).locator('input');
  await exercise.check();
  const exerciseState = await page.evaluate(() => ({
    result: document.querySelector('[data-fmc-outline-results]')?.textContent?.trim(),
    exerciseChecked: [...document.querySelectorAll('[data-fmc-filter-family="universal"] label')]
      .find((label) => label.textContent?.trim() === 'Exercise')?.querySelector('input')?.checked ?? false,
    kinds: [...document.querySelectorAll('[data-fmc-outline-tree] [data-fmc-kind]')].map((node) => node.getAttribute('data-fmc-kind')),
    status: document.querySelector('[data-fmc-outline-status]')?.textContent?.trim()
  }));
  await exercise.uncheck();
  const structuralFieldsets = page.locator('[data-fmc-filter-family="structural"]');
  const structuralCount = await structuralFieldsets.count();
  const selectedStructural = [];
  for (let index = 0; index < structuralCount; index += 1) {
    const fieldset = structuralFieldsets.nth(index);
    const legend = (await fieldset.locator('legend').textContent())?.trim() ?? '';
    if (!/Module|Unit/u.test(legend)) continue;
    const first = fieldset.locator('input[type="checkbox"]').first();
    if (await first.count()) {
      selectedStructural.push({ legend, value: await first.getAttribute('value') });
      await first.check();
    }
  }
  const combinedState = await page.evaluate(() => ({
    result: document.querySelector('[data-fmc-outline-results]')?.textContent?.trim(),
    status: document.querySelector('[data-fmc-outline-status]')?.textContent?.trim(),
    visibleReferences: document.querySelectorAll('[data-fmc-outline-tree] [data-fmc-reference-id]').length
  }));
  const multiParent = await page.evaluate(() => ({
    alternatePlacementCues: document.querySelectorAll('.fmc-outline-current-entity').length,
    completeReferenceIds: [...document.querySelectorAll('[data-fmc-complete-list] li')].map((node) => node.textContent?.trim()).filter(Boolean)
  }));
  return { before, after, options, usable, fixtureOptions, switched, exerciseState, selectedStructural, combinedState, multiParent };
}

async function searchAudit(page) {
  await page.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  await waitForCourse(page);
  await page.locator('fmc-global-search summary').click();
  const input = page.locator('[data-fmc-global-query]');
  await input.fill('distributive');
  await page.waitForFunction(() => /matching governed learner/u.test(document.querySelector('[data-fmc-global-status]')?.textContent ?? ''));
  const result = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll('[data-fmc-search-item] a')].map((node) => node.getAttribute('href')),
    ids: [...document.querySelectorAll('[data-fmc-search-item]')].map((node) => node.getAttribute('data-fmc-content-id')),
    status: document.querySelector('[data-fmc-global-status]')?.textContent?.trim()
  }));
  await input.fill('zzzz-no-result-m59');
  await page.waitForFunction(() => !document.querySelector('[data-fmc-global-empty]')?.hasAttribute('hidden'));
  const empty = await page.evaluate(() => ({
    resultCount: document.querySelectorAll('[data-fmc-search-item]').length,
    emptyVisible: !document.querySelector('[data-fmc-global-empty]')?.hasAttribute('hidden'),
    status: document.querySelector('[data-fmc-global-status]')?.textContent?.trim()
  }));
  return { result, empty };
}

async function preferenceAudit(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  observe(page, engineName);
  await page.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  await waitForCourse(page);
  await page.locator('fmc-preference-controls summary').click();
  await page.locator('[data-fmc-field="themePreference"]').selectOption('dark-high-contrast');
  await page.locator('select[data-fmc-projection]').first().selectOption('lean-mathlib');
  await page.reload({ waitUntil: 'networkidle' });
  await waitForCourse(page);
  const restored = await page.evaluate(() => ({
    theme: document.documentElement.dataset.fmcTheme,
    projection: window.FMCPreferenceStore?.getSnapshot().preferences.outlineProjection,
    persistenceAvailable: window.FMCPreferenceStore?.getSnapshot().persistenceAvailable
  }));
  await page.locator('fmc-preference-controls summary').click();
  await page.locator('[data-fmc-reset]').click();
  const reset = await page.evaluate(() => ({
    theme: window.FMCPreferenceStore?.getSnapshot().preferences.themePreference,
    representation: window.FMCPreferenceStore?.getSnapshot().preferences.representationDefault,
    projection: window.FMCPreferenceStore?.getSnapshot().preferences.outlineProjection,
    status: document.querySelector('[data-fmc-status]')?.textContent?.trim()
  }));
  await context.close();

  const denied = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await denied.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied by M5.9 fixture', 'SecurityError'); } });
  });
  const deniedPage = await denied.newPage();
  observe(deniedPage, `${engineName}-storage-denied`);
  await deniedPage.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  await waitForCourse(deniedPage);
  await deniedPage.locator('fmc-preference-controls summary').click();
  await deniedPage.locator('[data-fmc-field="themePreference"]').selectOption('dark');
  const unavailable = await deniedPage.evaluate(() => ({
    persistenceAvailable: window.FMCPreferenceStore?.getSnapshot().persistenceAvailable,
    theme: window.FMCPreferenceStore?.getSnapshot().preferences.themePreference,
    status: document.querySelector('[data-fmc-status]')?.textContent?.trim()
  }));
  await denied.close();
  return { restored, reset, unavailable };
}

async function drawerAndReflowAudit(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  observe(page, engineName);
  await page.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  await waitForCourse(page);
  const trigger = page.locator('[data-fmc-outline-open]');
  await trigger.click();
  const opened = await page.evaluate(() => ({
    modal: document.querySelector('[data-fmc-outline-dialog]')?.matches(':modal'),
    active: document.activeElement?.getAttribute('data-fmc-outline-close') !== null,
    dialogRole: document.querySelector('[data-fmc-outline-dialog]')?.tagName,
    hasAccessibleName: (() => {
      const dialog = document.querySelector('[data-fmc-outline-dialog]');
      const label = dialog?.getAttribute('aria-label')?.trim();
      const labelledBy = dialog?.getAttribute('aria-labelledby')?.trim();
      return Boolean(label || (labelledBy && document.getElementById(labelledBy)?.textContent?.trim()));
    })()
  }));
  const focusTrail = [];
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press('Tab');
    focusTrail.push(await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      inside: Boolean(document.querySelector('[data-fmc-outline-dialog]')?.contains(document.activeElement)),
      text: document.activeElement?.textContent?.trim().slice(0, 80)
    })));
  }
  const disclosure = page.locator('[data-fmc-outline-tree] .fmc-outline-disclosure').first();
  await disclosure.focus();
  const beforeExpanded = await disclosure.getAttribute('aria-expanded');
  await page.keyboard.press('Enter');
  const afterExpanded = await disclosure.getAttribute('aria-expanded');
  const disclosureFocusRetained = await disclosure.evaluate((node) => document.activeElement === node);
  const targets = await page.evaluate(() => {
    const selectors = [
      '[data-fmc-outline-open]', '[data-fmc-outline-close]', '.fmc-outline-actions button',
      '.fmc-outline-disclosure', 'fmc-global-search > details > summary',
      'fmc-preference-controls > details > summary', '[role="tab"]'
    ];
    return [...document.querySelectorAll(selectors.join(','))]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { selector: node.outerHTML.slice(0, 100), width: box.width, height: box.height };
      });
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-fmc-outline-dialog]')?.open);
  const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
  const reflow = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animated: [...document.querySelectorAll('*')].filter((node) => {
      const style = getComputedStyle(node);
      return style.animationName !== 'none' && style.animationDuration !== '0s';
    }).slice(0, 20).map((node) => node.outerHTML.slice(0, 100))
  }));
  await page.screenshot({ path: join(evidenceDirectory, `${engineName}-320x800-reduced.png`), fullPage: true, animations: 'disabled' });
  await context.close();

  const wide = await browser.newContext({ viewport: { width: 640, height: 800 } });
  const widePage = await wide.newPage();
  observe(widePage, `${engineName}-200-percent-equivalent`);
  await widePage.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  const reflow200 = await widePage.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  await wide.close();

  const forced = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active', reducedMotion: 'reduce' });
  const forcedPage = await forced.newPage();
  observe(forcedPage, `${engineName}-forced-colors`);
  await forcedPage.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  await waitForCourse(forcedPage);
  const forcedState = await forcedPage.evaluate(() => {
    const current = document.querySelector('[aria-current="page"]');
    const focusable = document.querySelector('[data-fmc-outline-tree] .fmc-outline-disclosure');
    focusable?.focus();
    const currentStyle = current ? getComputedStyle(current) : null;
    const focusStyle = focusable ? getComputedStyle(focusable) : null;
    return {
      active: matchMedia('(forced-colors: active)').matches,
      currentPage: current?.textContent?.trim(),
      currentOutline: currentStyle?.outlineStyle,
      currentColor: currentStyle?.color,
      focusOutline: focusStyle?.outlineStyle,
      focusOutlineWidth: focusStyle?.outlineWidth
    };
  });
  await forcedPage.screenshot({ path: join(evidenceDirectory, `${engineName}-forced-colors.png`), fullPage: false, animations: 'disabled' });
  await forced.close();
  return { opened, focusTrail, beforeExpanded, afterExpanded, disclosureFocusRetained, targets, focusReturned, reflow, reflow200, forcedState };
}

async function runEngine(engineName, browserType, launchOptions = {}) {
  const browser = await browserType.launch({ headless: true, ...launchOptions });
  const version = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observe(page, engineName);
  await page.goto(`${origin}${primaryRoute}`, { waitUntil: 'networkidle' });
  await waitForCourse(page);
  const semantic = await semanticAudit(page);
  const projection = await projectionAndFilterAudit(page);
  const search = await searchAudit(page);
  await context.close();
  const preferences = await preferenceAudit(browser, engineName);
  const drawer = await drawerAndReflowAudit(browser, engineName);
  await browser.close();
  return { engineName, version, semantic, projection, search, preferences, drawer };
}

function enginePasses(evidence) {
  const allFixtureProjections = evidence.projection.switched.length === 5
    && evidence.projection.switched.every(({ requested, effective, pathname, referenceCount }) => requested === effective && pathname === fixtureRoute && referenceCount > 0);
  const projectionIdentity = JSON.stringify(evidence.projection.before) === JSON.stringify({
    pathname: evidence.projection.after.pathname,
    canonical: evidence.projection.after.canonical,
    contentId: evidence.projection.after.contentId
  });
  const searchPass = evidence.search.result.hrefs.length > 0
    && evidence.search.result.hrefs.every((href) => href?.startsWith('/content/'))
    && evidence.search.result.ids.every((id) => id?.startsWith('cnt:'))
    && evidence.search.empty.resultCount === 0
    && evidence.search.empty.emptyVisible;
  const semanticPass = evidence.semantic.landmarks.main === 1
    && evidence.semantic.headingOneCount === 1
    && evidence.semantic.duplicateIds.length === 0
    && evidence.semantic.unnamedControls.length === 0
    && evidence.semantic.invalidTabs === 0
    && evidence.semantic.mathWithoutTextAlternative === 0
    && evidence.semantic.currentPageCount > 0;
  const filtersPass = evidence.projection.exerciseState.exerciseChecked
    && evidence.projection.exerciseState.result?.includes('2 matching navigation results')
    && evidence.projection.exerciseState.status?.includes('filter updated')
    && evidence.projection.selectedStructural.length === 2
    && evidence.projection.combinedState.status?.includes('filter updated');
  const preferencesPass = evidence.preferences.restored.theme === 'dark-high-contrast'
    && evidence.preferences.restored.projection === 'lean-mathlib'
    && evidence.preferences.reset.theme === 'system'
    && evidence.preferences.reset.representation === 'rendered'
    && evidence.preferences.reset.projection === 'course'
    && evidence.preferences.unavailable.persistenceAvailable === false
    && evidence.preferences.unavailable.theme === 'dark';
  const drawerPass = evidence.drawer.opened.modal
    && evidence.drawer.opened.active
    && evidence.drawer.opened.hasAccessibleName
    && evidence.drawer.focusTrail.every(({ inside, tag }) => inside && tag !== 'BODY')
    && evidence.drawer.beforeExpanded !== evidence.drawer.afterExpanded
    && evidence.drawer.disclosureFocusRetained
    && evidence.drawer.focusReturned;
  const targetPass = evidence.drawer.targets.length > 0
    && evidence.drawer.targets.every(({ width, height }) => width >= 44 && height >= 44);
  const reflowPass = evidence.drawer.reflow.scrollWidth <= evidence.drawer.reflow.viewportWidth + 1
    && evidence.drawer.reflow.bodyScrollWidth <= evidence.drawer.reflow.viewportWidth + 1
    && evidence.drawer.reflow200.scrollWidth <= evidence.drawer.reflow200.viewportWidth + 1
    && evidence.drawer.reflow.animated.length === 0;
  const forcedPass = evidence.drawer.forcedState.active
    && Boolean(evidence.drawer.forcedState.currentPage)
    && evidence.drawer.forcedState.focusOutline !== 'none'
    && evidence.drawer.forcedState.focusOutlineWidth !== '0px';
  const mappingPass = evidence.projection.options.filter(({ disabled }) => disabled).length === 3
    && evidence.projection.after.context?.includes('Canonical route remains')
    && evidence.projection.multiParent.completeReferenceIds.length > 0;
  return { allFixtureProjections, projectionIdentity, searchPass, semanticPass, filtersPass, preferencesPass, drawerPass, targetPass, reflowPass, forcedPass, mappingPass };
}

function applicationStats() {
  const validationDirectory = join(dist, '_validation');
  const files = filesBelow(dist, validationDirectory);
  const html = files.filter((path) => extname(path) === '.html');
  const scripts = files.filter((path) => extname(path) === '.js' && relative(dist, path).startsWith('_astro/'));
  const styles = files.filter((path) => extname(path) === '.css' && relative(dist, path).startsWith('_astro/'));
  const pagefind = directoryStats(join(dist, 'pagefind'));
  const largest = (paths) => paths.map((path) => ({ path: relative(dist, path).replaceAll('\\', '/'), bytes: statSync(path).size })).sort((left, right) => right.bytes - left.bytes)[0];
  const largestHtml = largest(html);
  const largestScript = largest(scripts);
  const largestStyle = largest(styles);
  const uiCore = scripts.find((path) => /ui-core\./u.test(path));
  return {
    files: files.length,
    bytes: files.reduce((sum, path) => sum + statSync(path).size, 0),
    pagefind,
    largestHtml,
    largestScript,
    largestStyle,
    gzip: {
      largestHtml: gzipSync(readFileSync(join(dist, largestHtml.path))).byteLength,
      uiCore: uiCore ? gzipSync(readFileSync(uiCore)).byteLength : null,
      largestStyle: gzipSync(readFileSync(join(dist, largestStyle.path))).byteLength
    },
    fonts: files.filter((path) => /\.(woff2?|ttf|otf)$/u.test(path)).map((path) => relative(dist, path).replaceAll('\\', '/')),
    unhashedAstroAssets: files.filter((path) => relative(dist, path).startsWith('_astro/') && !/\.[A-Za-z0-9_-]{5,}\./u.test(path)).map((path) => relative(dist, path).replaceAll('\\', '/'))
  };
}

async function performanceAudit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observe(page, 'chromium-performance');
  await page.addInitScript(() => {
    window.__fmcLcp = 0;
    window.__fmcCls = 0;
    window.__fmcInteractions = [];
    try {
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__fmcLcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__fmcCls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__fmcInteractions.push(entry.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch {}
  });
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 50,
    downloadThroughput: 10_000_000 / 8,
    uploadThroughput: 5_000_000 / 8
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const response = await page.goto(`${origin}${primaryRoute}`, { waitUntil: 'load' });
  await waitForCourse(page);
  await page.waitForTimeout(500);
  const loadVitals = await page.evaluate(() => ({ lcpMs: window.__fmcLcp, cls: window.__fmcCls }));
  await page.locator('fmc-global-search summary').click();
  await page.locator('[data-fmc-global-query]').fill('distributive');
  await page.waitForFunction(() => /matching governed learner/u.test(document.querySelector('[data-fmc-global-status]')?.textContent ?? ''));
  await page.waitForTimeout(250);
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const bytes = (entry) => entry.transferSize || entry.encodedBodySize || 0;
    return {
      scriptBytes: resources.filter((entry) => entry.initiatorType === 'script').reduce((sum, entry) => sum + bytes(entry), 0),
      styleBytes: resources.filter((entry) => entry.initiatorType === 'css' || entry.initiatorType === 'link').reduce((sum, entry) => sum + bytes(entry), 0),
      resourceBytes: resources.reduce((sum, entry) => sum + bytes(entry), 0),
      domContentLoadedMs: navigation.domContentLoadedEventEnd,
      loadMs: navigation.loadEventEnd,
      interactionLcpMs: window.__fmcLcp,
      interactionCls: window.__fmcCls,
      inpMs: Math.max(0, ...window.__fmcInteractions)
    };
  });
  await context.close();
  await browser.close();
  const documentBytes = Number(response?.headers()['content-length'] ?? 0);
  return { ...timing, ...loadVitals, documentBytes, totalBytes: documentBytes + timing.resourceBytes };
}

try {
  const engineConfigurations = [
    ['chromium', chromium, {}],
    ['firefox', firefox, {}],
    ['webkit', webkit, {}]
  ];
  const chromePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((path) => existsSync(path));
  if (chromePath) engineConfigurations.push(['chrome', chromium, { executablePath: chromePath }]);
  else if (!allowNoBrowser) throw new Error('frozen branded Chrome executable is unavailable');

  for (const [name, browserType, options] of engineConfigurations) {
    try {
      engineEvidence[name] = await runEngine(name, browserType, options);
    } catch (error) {
      engineEvidence[name] = { engineName: name, error: String(error?.stack ?? error) };
    }
  }

  const requiredEngines = ['chromium', 'firefox', 'webkit', 'chrome'];
  const completedEngines = requiredEngines.filter((name) => engineEvidence[name] && !engineEvidence[name].error);
  const versionsPass = requiredEngines.every((name) => engineEvidence[name]?.version === expectedBrowserVersions[name]);
  const passes = Object.fromEntries(completedEngines.map((name) => [name, enginePasses(engineEvidence[name])]));
  const every = (key) => requiredEngines.every((name) => passes[name]?.[key] === true);

  record(rows, 'A02', 'Blocker', 'five projections and projection switching preserve content identity', every('allFixtureProjections') && every('projectionIdentity'), { passes, evidence: Object.fromEntries(completedEngines.map((name) => [name, engineEvidence[name].projection])) });
  record(rows, 'A03', 'Blocker', 'projection-independent canonical route and current content identity', every('projectionIdentity'), Object.fromEntries(completedEngines.map((name) => [name, { before: engineEvidence[name].projection.before, after: engineEvidence[name].projection.after }])));
  record(rows, 'A04', 'Material', 'reference list, multi-parent cues and deep-link identity remain explicit', requiredEngines.every((name) => engineEvidence[name]?.projection?.multiParent?.completeReferenceIds?.length > 0), Object.fromEntries(completedEngines.map((name) => [name, engineEvidence[name].projection.multiParent])));
  record(rows, 'A05', 'Material', 'global search is learner-only and no-result behavior is explicit', every('searchPass'), Object.fromEntries(completedEngines.map((name) => [name, engineEvidence[name].search])));
  record(rows, 'A06', 'Material', 'universal Exercise and combined Module plus Unit filters remain operable', every('filtersPass'), Object.fromEntries(completedEngines.map((name) => [name, { exercise: engineEvidence[name].projection.exerciseState, selectedStructural: engineEvidence[name].projection.selectedStructural, combined: engineEvidence[name].projection.combinedState }])));
  record(rows, 'A07', 'Material', 'preference persistence/reset and storage-denied fallback preserve owned state', every('preferencesPass'), Object.fromEntries(completedEngines.map((name) => [name, engineEvidence[name].preferences])));
  record(rows, 'A08', 'Blocker', 'responsive drawer is modal, traps and returns focus, disclosures remain separate', every('drawerPass'), Object.fromEntries(completedEngines.map((name) => [name, { opened: engineEvidence[name].drawer.opened, focusTrail: engineEvidence[name].drawer.focusTrail, disclosureFocusRetained: engineEvidence[name].drawer.disclosureFocusRetained, focusReturned: engineEvidence[name].drawer.focusReturned }])));
  record(rows, 'A09', 'Blocker', 'controls have names, valid tab relations, MathML alternatives and current-page state', every('semanticPass'), Object.fromEntries(completedEngines.map((name) => [name, engineEvidence[name].semantic])));
  rows.push({
    id: 'A10',
    severity: 'Blocker',
    expected: 'manual NVDA 2026.1.1/Chrome and VoiceOver/Safari transcripts on the frozen candidate',
    status: 'blocked_manual_required',
    actual: {
      automatedSubstitutionAllowed: false,
      nvdaExecuted: false,
      voiceOverExecuted: false,
      reason: 'This runner exposes browser automation but no real Windows NVDA or macOS VoiceOver session.'
    }
  });
  record(rows, 'A11', 'Material', '320 CSS px (400 percent equivalent) and 640 CSS px (200 percent equivalent) reflow without page overflow', every('reflowPass'), Object.fromEntries(completedEngines.map((name) => [name, { reflow400Equivalent: engineEvidence[name].drawer.reflow, reflow200Equivalent: engineEvidence[name].drawer.reflow200 }])));
  record(rows, 'A12', 'Material', 'forced colors, reduced motion and 44 by 44 primary targets', every('forcedPass') && every('targetPass'), Object.fromEntries(completedEngines.map((name) => [name, { forced: engineEvidence[name].drawer.forcedState, targets: engineEvidence[name].drawer.targets, reduced: engineEvidence[name].drawer.reflow.reducedMotion, animated: engineEvidence[name].drawer.reflow.animated }])));
  record(rows, 'A13', 'Blocker', 'unavailable external states fail closed and complete states remain named', every('mappingPass'), Object.fromEntries(completedEngines.map((name) => [name, { productionOptions: engineEvidence[name].projection.options, context: engineEvidence[name].projection.after.context, completeReferenceIds: engineEvidence[name].projection.multiParent.completeReferenceIds }])));

  const semanticDigests = Object.fromEntries(completedEngines.map((name) => [name, stableDigest({
    semantic: engineEvidence[name].semantic,
    projectionBefore: engineEvidence[name].projection.before,
    projectionAfter: engineEvidence[name].projection.after,
    searchIds: engineEvidence[name].search.result.ids,
    searchEmpty: engineEvidence[name].search.empty,
    reset: engineEvidence[name].preferences.reset
  })]));
  record(rows, 'A14', 'Material', 'exact frozen browser versions complete with equal semantic outcomes', completedEngines.length === requiredEngines.length && versionsPass && new Set(Object.values(semanticDigests)).size === 1, {
    expectedBrowserVersions,
    actualBrowserVersions: Object.fromEntries(requiredEngines.map((name) => [name, engineEvidence[name]?.version ?? null])),
    completedEngines,
    semanticDigests,
    errors: Object.fromEntries(requiredEngines.filter((name) => engineEvidence[name]?.error).map((name) => [name, engineEvidence[name].error]))
  });

  const assets = applicationStats();
  let performance = null;
  let performanceError = null;
  try {
    performance = await performanceAudit();
  } catch (error) {
    performanceError = String(error?.stack ?? error);
  }
  const assetPass = assets.bytes <= budgets.distBytes
    && assets.files <= budgets.distFiles
    && assets.pagefind.bytes <= budgets.pagefindBytes
    && assets.largestHtml.bytes <= budgets.htmlBytes
    && assets.largestScript.bytes <= budgets.scriptBytes
    && assets.largestStyle.bytes <= budgets.styleBytes
    && assets.gzip.largestHtml <= budgets.gzipHtmlBytes
    && assets.gzip.uiCore <= budgets.gzipUiCoreBytes
    && assets.gzip.largestStyle <= budgets.gzipPrimaryCssBytes
    && assets.unhashedAstroAssets.length === 0;
  const performancePass = performance
    && performance.documentBytes <= budgets.documentTransferBytes
    && performance.scriptBytes <= budgets.scriptTransferBytes
    && performance.styleBytes <= budgets.styleTransferBytes
    && performance.totalBytes <= budgets.totalTransferBytes
    && performance.domContentLoadedMs <= budgets.domContentLoadedMs
    && performance.loadMs <= budgets.loadMs
    && performance.lcpMs <= budgets.lcpMs
    && performance.inpMs <= budgets.inpMs
    && performance.cls <= budgets.cls;
  record(rows, 'A15', 'Material', 'frozen asset and throttled lab performance budgets', Boolean(assetPass && performancePass), { budgets, assets, performance, performanceError, cacheBoundary: 'hashed-asset cacheability verified by filename; deployed response headers remain MAT-370 S05' });

  record(rows, 'A16', 'Blocker', 'zero console/page failures and zero external runtime requests', consoleFailures.length === 0 && externalRequests.length === 0, { consoleFailures, externalRequests });
} finally {
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const automatedRows = rows.filter(({ id }) => id !== 'A10');
const automatedFailures = automatedRows.filter(({ status }) => status !== 'pass');
const report = {
  schemaVersion: 'p5-m5.9-accessibility-browser-qualification/v1',
  issue: 'MAT-365',
  freeze: 'P5-M5.9-QUALIFICATION-FREEZE-v1',
  subject: {
    candidateId: 'P5-M5.8-CANDIDATE-v2',
    candidateRevision,
    candidateTree,
    contentRevision: expectedContentRevision,
    contentTree: expectedContentTree,
    leanRevision: expectedLeanRevision,
    mathlibRevision: expectedMathlibRevision,
    selectorSha256: sha256(selectorBytes),
    candidateRecordSha256: sha256(candidateRecordBytes),
    matrixSha256: sha256(matrixBytes),
    deploymentAuthorized: false
  },
  harness: {
    revision: harnessRevision,
    changedPaths: harnessChangedPaths,
    applicationDrift,
    node: process.version,
    pnpm: packageManifest.packageManager,
    pagefind: packageManifest.dependencies.pagefind,
    playwrightCore: packageManifest.devDependencies['playwright-core'],
    platform: platform(),
    architecture: arch(),
    runnerImage: process.env.FMC_RUNNER_IMAGE_LABEL ?? null,
    bundledBrowsers
  },
  evidence: {
    rowCount: rows.length,
    automatedRows: automatedRows.length,
    automatedFailures: automatedFailures.map(({ id, severity }) => ({ id, severity })),
    manualBlockers: [{ id: 'A10', severity: 'Blocker', lanes: ['NVDA 2026.1.1 plus Chrome 151.0.7922.137 on Windows 11 24H2', 'VoiceOver plus Safari on an exact recorded macOS Tahoe 26.x build'] }],
    rows
  },
  limitations: [
    'Automated browser evidence does not establish screen-reader usability or WCAG conformance.',
    'The 320 and 640 CSS pixel lanes are the WCAG reflow equivalents of 400 and 200 percent at a 1280 CSS pixel baseline; browser UI zoom itself is not claimed.',
    'Playwright WebKit is not Safari or VoiceOver evidence.',
    'Lab timings are bounded regression evidence, not field Core Web Vitals percentiles.',
    'No external taxonomy snapshot or public mapping coverage is claimed.',
    'Deployment remains unauthorized and deployed response caching is not claimed.'
  ],
  status: automatedFailures.length > 0 ? 'automated_qualification_failed' : 'automated_qualification_complete_manual_at_blocked',
  deploymentAuthorized: false
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const manifestFiles = filesBelow(evidenceDirectory)
  .filter((path) => path !== manifestPath)
  .map((path) => {
    const bytes = readFileSync(path);
    return { path: relative(evidenceDirectory, path).replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
const manifest = {
  schemaVersion: 'p5-m5.9-accessibility-evidence-manifest/v1',
  issue: 'MAT-365',
  candidateRevision,
  candidateTree,
  files: manifestFiles,
  payloadSha256: sha256(manifestFiles.map(({ path, bytes, sha256: hash }) => `${path}\0${bytes}\0${hash}\n`).join(''))
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`M5.9 accessibility/browser automated evidence: ${automatedRows.length - automatedFailures.length}/${automatedRows.length} rows passed; manual A10 blocked.`);
console.log(`report sha256: ${sha256(readFileSync(reportPath))}`);
console.log(`manifest sha256: ${sha256(readFileSync(manifestPath))}`);
if (automatedFailures.length > 0) {
  console.error(`failed rows: ${automatedFailures.map(({ id }) => id).join(', ')}`);
  process.exitCode = 1;
}
