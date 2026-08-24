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
const reportPath = join(evidenceDirectory, 'm5-6-requalification-v2-report.json');
const storageKey = 'fmc:site-preferences:v1';
const requiredBrowser = process.env.FMC_REQUIRE_BROWSER === '1';
const explicitSkip = process.env.FMC_SKIP_BROWSER === '1';

if (explicitSkip && requiredBrowser) throw new Error('FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1');

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
    console.log('M5.6 browser qualification explicitly skipped: no Chrome executable in this local environment.');
    process.exit(0);
  }
  throw new Error('M5.6 browser qualification requires an identifiable Chrome executable');
}

const requiredRoutes = [
  'validation/m5-6/index.html',
  'content/p5m56c0004/natural-number-operation-laws/index.html',
  'content/p5m56c0006/distribute-and-cancel-exercise/index.html',
  'formal/fart-p2-000010/index.html',
  'outline/course/index.html',
  '404.html'
];
for (const route of requiredRoutes) {
  if (!existsSync(join(dist, route))) throw new Error(`M5.6 browser subject missing: ${route}`);
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
    let filePath = resolve(dist, relativePath);
    let status = 200;
    if (filePath !== dist && !filePath.startsWith(`${dist}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      filePath = join(dist, '404.html');
      status = 404;
    }
    const size = statSync(filePath).size;
    response.writeHead(status, {
      'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'content-length': String(size),
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

const browser = await chromium.launch({
  executablePath: chromeExecutable,
  headless: true,
  args: ['--force-color-profile=srgb']
});
const browserVersion = browser.version();
const results = [];
const consoleFailures = [];
const evidencePaths = [];

async function row(id, severity, expected, execute) {
  try {
    const outcome = await execute();
    const structured = outcome && typeof outcome === 'object' && Object.hasOwn(outcome, 'pass')
      ? outcome
      : { pass: Boolean(outcome), actual: outcome };
    results.push({ id, severity, expected, status: structured.pass ? 'pass' : 'fail', actual: structured.actual ?? null });
  } catch (error) {
    results.push({
      id,
      severity,
      expected,
      status: 'fail',
      actual: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
  }
}

function observePage(page, name) {
  page.on('pageerror', (error) => consoleFailures.push({ page: name, type: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    const expectedRecovery404 = name === 'locale-recovery'
      && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)';
    if (message.type() === 'error' && !expectedRecovery404) {
      consoleFailures.push({ page: name, type: 'console-error', text: message.text() });
    }
  });
}

async function waitForCourse(page) {
  await page.waitForFunction(() => Boolean(
    window.FMCPreferenceStore
    && document.querySelector('fmc-outline-navigator')?.dataset.fmcEnhanced === 'true'
  ));
}

async function screenshot(page, name, options = {}) {
  const path = join(evidenceDirectory, name);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', ...options });
  evidencePaths.push(path);
}

const inputLock = JSON.parse(readFileSync(join(root, 'inputs.lock.json'), 'utf8'));
const sourceRevision = process.env.FMC_SOURCE_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const performanceProfile = {
  cpuThrottlingRate: 4,
  latencyMs: 50,
  downloadBitsPerSecond: 10_000_000,
  uploadBitsPerSecond: 5_000_000,
  budgets: {
    documentBytes: 120_000,
    scriptBytes: 190_000,
    styleBytes: 150_000,
    totalBytes: 520_000,
    domContentLoadedMs: 2_500,
    loadMs: 3_500
  }
};

async function measureRoute(pathname) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observePage(page, `performance:${pathname}`);
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: performanceProfile.latencyMs,
    downloadThroughput: performanceProfile.downloadBitsPerSecond / 8,
    uploadThroughput: performanceProfile.uploadBitsPerSecond / 8
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: performanceProfile.cpuThrottlingRate });
  const response = await page.goto(`${origin}${pathname}`, { waitUntil: 'load' });
  const documentBytes = Number(response?.headers()['content-length'] ?? 0);
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const bytes = (entry) => entry.transferSize || entry.encodedBodySize || 0;
    return {
      scriptBytes: resources.filter((entry) => entry.initiatorType === 'script').reduce((sum, entry) => sum + bytes(entry), 0),
      styleBytes: resources.filter((entry) => entry.initiatorType === 'css' || entry.initiatorType === 'link').reduce((sum, entry) => sum + bytes(entry), 0),
      resourceBytes: resources.reduce((sum, entry) => sum + bytes(entry), 0),
      domContentLoadedMs: navigation.domContentLoadedEventEnd,
      loadMs: navigation.loadEventEnd
    };
  });
  await context.close();
  const actual = { pathname, documentBytes, ...timing, totalBytes: documentBytes + timing.resourceBytes };
  const budget = performanceProfile.budgets;
  const pass = actual.documentBytes <= budget.documentBytes
    && actual.scriptBytes <= budget.scriptBytes
    && actual.styleBytes <= budget.styleBytes
    && actual.totalBytes <= budget.totalBytes
    && actual.domContentLoadedMs <= budget.domContentLoadedMs
    && actual.loadMs <= budget.loadMs;
  return { pass, actual };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observePage(page, 'desktop-m5.6');

  await row('M01', 'Blocker', 'exact noindex M5.6 fixture exists and is excluded from global search/canonical metadata', async () => {
    await page.goto(`${origin}/validation/m5-6/`, { waitUntil: 'networkidle' });
    await waitForCourse(page);
    const actual = await page.evaluate(() => ({
      fingerprint: document.documentElement.getAttribute('data-fmc-m5-6-validation'),
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      globalSearch: Boolean(document.querySelector('fmc-global-search')),
      reserved: document.body.textContent?.includes('FMC-M56-A') && document.body.textContent?.includes('fmc.m56')
    }));
    await screenshot(page, 'm5-6-requalification-v2-fixture.png');
    return { pass: actual.fingerprint === 'synthetic-m5-6-v1' && actual.robots === 'noindex, nofollow' && actual.canonical === null && !actual.globalSearch && actual.reserved, actual };
  });

  await row('M02', 'Material', 'all five fixture projections are selectable without route or content-identity mutation', async () => {
    const selector = page.locator('select[data-fmc-projection]');
    const before = await page.evaluate(() => ({ pathname: location.pathname, content: document.querySelector('fmc-outline-navigator')?.dataset.fmcCurrentContentId }));
    const states = [];
    for (const projection of ['course', 'ontomathpro', 'msc2020', 'arxiv', 'lean-mathlib']) {
      await selector.selectOption(projection);
      states.push({ projection, selected: await selector.inputValue(), text: (await page.locator('[data-fmc-outline-tree]').innerText()).slice(0, 500) });
    }
    const after = await page.evaluate(() => ({ pathname: location.pathname, content: document.querySelector('fmc-outline-navigator')?.dataset.fmcCurrentContentId }));
    return { pass: states.every((state) => state.selected === state.projection) && JSON.stringify(before) === JSON.stringify(after), actual: { before, after, states: states.map(({ projection, selected }) => ({ projection, selected })) } };
  });

  await row('M03', 'Material', 'reserved external labels are searchable only inside the fixture outline', async () => {
    const selector = page.locator('select[data-fmc-projection]');
    const query = page.locator('[data-fmc-outline-query]');
    const probes = [
      ['ontomathpro', 'parent-a'],
      ['msc2020', 'FMC-M56-B'],
      ['arxiv', 'fmc.m56']
    ];
    const actual = [];
    for (const [projection, term] of probes) {
      await selector.selectOption(projection);
      await query.fill(term);
      const text = await page.locator('[data-fmc-outline-tree]').innerText();
      actual.push({ projection, term, matched: text.toLocaleLowerCase('en').includes(term.toLocaleLowerCase('en')) });
    }
    return { pass: actual.every((probe) => probe.matched), actual };
  });

  await row('M04', 'Material', 'global search resolves exact formal identifiers to canonical learner pages', async () => {
    await page.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    await waitForCourse(page);
    await page.locator('fmc-global-search summary').click();
    await page.locator('[data-fmc-global-query]').fill('FART-P2-000010');
    const visible = page.locator('[data-fmc-search-item]:visible a');
    const actual = { count: await visible.count(), href: await visible.first().getAttribute('href') };
    return { pass: actual.count === 1 && actual.href === '/content/p5m56c0006/distribute-and-cancel-exercise/', actual };
  });

  await row('M05', 'Material', 'Course menu search retains cancellation results and their ancestors', async () => {
    await page.locator('select[data-fmc-projection]').selectOption('course');
    await page.locator('[data-fmc-outline-query]').fill('cancel');
    const text = await page.locator('[data-fmc-outline-tree]').innerText();
    return { pass: text.includes('Natural-number law examples') && text.includes('Distribute-and-cancel exercise') && text.includes('Arithmetic to algebra'), actual: text.slice(0, 800) };
  });

  await row('M06', 'Material', 'Lean selection persists across reload and reset restores Course without route mutation', async () => {
    const selector = page.locator('select[data-fmc-projection]');
    await selector.selectOption('lean-mathlib');
    const path = new URL(page.url()).pathname;
    await page.reload({ waitUntil: 'networkidle' });
    await waitForCourse(page);
    const retained = await page.locator('select[data-fmc-projection]').inputValue();
    await page.locator('fmc-preference-controls summary').click();
    await page.locator('[data-fmc-reset]').click();
    const reset = await page.locator('select[data-fmc-projection]').inputValue();
    const actual = { path, afterReload: new URL(page.url()).pathname, retained, reset, afterReset: new URL(page.url()).pathname };
    return { pass: retained === 'lean-mathlib' && reset === 'course' && actual.path === actual.afterReload && actual.path === actual.afterReset, actual };
  });

  await row('M07', 'Material', 'unavailable production projection fails safely to Course while retaining the requested preference', async () => {
    const selector = page.locator('select[data-fmc-projection]');
    await selector.selectOption('ontomathpro');
    const actual = await page.evaluate((key) => ({
      selected: document.querySelector('select[data-fmc-projection]')?.value,
      status: document.querySelector('[data-fmc-outline-status]')?.textContent,
      stored: JSON.parse(localStorage.getItem(key) ?? '{}').outlineProjection,
      pathname: location.pathname
    }), storageKey);
    return { pass: actual.selected === 'course' && actual.stored === 'ontomathpro' && /unavailable/u.test(actual.status ?? '') && actual.pathname.includes('p5m56c0004'), actual };
  });

  await row('M08', 'Material', 'exercise is typed, solution is closed, checkpoints are visible and exact evidence opens on demand', async () => {
    await page.goto(`${origin}/content/p5m56c0006/distribute-and-cancel-exercise/`, { waitUntil: 'networkidle' });
    const solution = page.locator('[data-fmc-exercise-solution]');
    const before = await solution.evaluate((element) => element.open);
    const text = await page.locator('.fmc-exercise').innerText();
    await solution.locator('summary').click();
    const after = await solution.evaluate((element) => element.open);
    const math = await solution.locator('math[data-fmc-math-renderer="p5-latex-mathml-renderer/v1"]').count();
    const actual = { before, after, math, checkpoints: ['7(4+3)=n', '7·4+7·3=n', 'n=49'].every((value) => text.includes(value)) };
    return { pass: !before && after && math === 1 && actual.checkpoints, actual };
  });

  await row('M09', 'Material', 'rendered MathML is derived from exact LaTeX and representation tabs expose exact sources', async () => {
    await page.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    await waitForCourse(page);
    const block = page.locator('fmc-mathematical-block').nth(1);
    const actual = await block.evaluate((element) => ({
      renderer: element.querySelector('math')?.getAttribute('data-fmc-math-renderer'),
      latexAttribute: element.querySelector('math')?.getAttribute('data-fmc-latex-source'),
      annotation: element.querySelector('annotation[encoding="application/x-tex"]')?.textContent,
      source: element.querySelector('[data-fmc-panel="latex"] code')?.textContent
    }));
    await block.locator('[data-fmc-tab="latex"]').click();
    const latexVisible = await block.locator('[data-fmc-panel="latex"]').isVisible();
    await block.locator('[data-fmc-tab="lean"]').click();
    const leanVisible = await block.locator('[data-fmc-panel="lean"]').isVisible();
    await screenshot(page, 'm5-6-requalification-v2-concept.png');
    return { pass: actual.renderer === 'p5-latex-mathml-renderer/v1' && actual.latexAttribute === actual.annotation && actual.annotation === actual.source && latexVisible && leanVisible, actual: { ...actual, latexVisible, leanVisible } };
  });

  await context.close();

  await row('M10', 'Material', '320px outline opens modally, closes explicitly and restores trigger focus', async () => {
    const narrow = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const narrowPage = await narrow.newPage();
    observePage(narrowPage, 'narrow-m5.6');
    await narrowPage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    await waitForCourse(narrowPage);
    const trigger = narrowPage.locator('[data-fmc-outline-open]');
    await trigger.click();
    const modal = await narrowPage.locator('[data-fmc-outline-dialog]').evaluate((dialog) => dialog.matches(':modal'));
    await screenshot(narrowPage, 'm5-6-requalification-v2-narrow-drawer.png');
    await narrowPage.locator('[data-fmc-outline-close]').click();
    const actual = { modal, focused: await trigger.evaluate((element) => element === document.activeElement) };
    await narrow.close();
    return { pass: actual.modal && actual.focused, actual };
  });

  await row('M11', 'Material', 'known unavailable Portuguese route offers the exact English canonical counterpart', async () => {
    const locale = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const localePage = await locale.newPage();
    observePage(localePage, 'locale-recovery');
    await localePage.goto(`${origin}/pt/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    const actual = await localePage.evaluate(() => ({
      state: document.querySelector('[data-fmc-recovery-page]')?.dataset.fmcRecoveryState,
      href: document.querySelector('[data-fmc-english-counterpart]')?.getAttribute('href'),
      hidden: document.querySelector('[data-fmc-english-counterpart]')?.hidden,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      heading: document.querySelector('[data-fmc-recovery-heading]')?.textContent
    }));
    await screenshot(localePage, 'm5-6-requalification-v2-locale-recovery.png');
    await locale.close();
    return { pass: actual.state === 'known-locale-translation-unavailable' && actual.href === '/content/p5m56c0004/natural-number-operation-laws/' && actual.hidden === false && actual.canonical === null, actual };
  });

  await row('M12', 'Material', 'unknown locale remains distinct and receives no invented counterpart', async () => {
    const locale = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const localePage = await locale.newPage();
    await localePage.goto(`${origin}/fr/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    const actual = await localePage.evaluate(() => ({
      state: document.querySelector('[data-fmc-recovery-page]')?.dataset.fmcRecoveryState,
      heading: document.querySelector('[data-fmc-recovery-heading]')?.textContent,
      counterpartHidden: document.querySelector('[data-fmc-english-counterpart]')?.hidden
    }));
    await locale.close();
    return { pass: actual.state === 'unknown-locale' && /not supported/u.test(actual.heading ?? '') && actual.counterpartHidden === true, actual };
  });

  await row('M13', 'Material', 'corrupt preference schema resets safely and cannot manufacture locale availability', async () => {
    const corrupt = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    await corrupt.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, locale: 'pt' })), { key: storageKey });
    const corruptPage = await corrupt.newPage();
    await corruptPage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    const actual = await corruptPage.evaluate((key) => ({ stored: localStorage.getItem(key), pathname: location.pathname, lang: document.documentElement.lang }), storageKey);
    await corrupt.close();
    return { pass: actual.stored === null && actual.pathname === '/content/p5m56c0004/natural-number-operation-laws/' && actual.lang === 'en', actual };
  });

  await row('M14', 'Material', 'no-JavaScript learner page retains rendered math, exact sources and ordinary navigation', async () => {
    const noJs = await browser.newContext({ viewport: { width: 320, height: 800 }, javaScriptEnabled: false });
    const noJsPage = await noJs.newPage();
    await noJsPage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'load' });
    const actual = await noJsPage.evaluate(() => ({
      math: document.querySelectorAll('math[data-fmc-math-renderer="p5-latex-mathml-renderer/v1"]').length,
      latex: document.querySelectorAll('[data-fmc-panel="latex"] code').length,
      lean: document.querySelectorAll('[data-fmc-panel="lean"] code').length,
      links: document.querySelectorAll('[data-fmc-complete-list] a').length
    }));
    await noJs.close();
    return { pass: actual.math >= 1 && actual.latex >= 1 && actual.lean >= 1 && actual.links >= 1, actual };
  });

  const performanceRoutes = [
    ['P01', '/content/p5m56c0004/natural-number-operation-laws/'],
    ['P02', '/content/p5m56c0010/integer-sign-law-examples/'],
    ['P03', '/content/p5m56c0006/distribute-and-cancel-exercise/'],
    ['P04', '/formal/fart-p2-000010/'],
    ['P05', '/outline/course/']
  ];
  for (const [id, pathname] of performanceRoutes) {
    await row(id, 'Material', `representative page ${pathname} stays within the exact throttled performance budget`, () => measureRoute(pathname));
  }

  await row('M15', 'Blocker', 'no page or console error occurs in any M5.6 scenario', async () => ({ pass: consoleFailures.length === 0, actual: consoleFailures }));
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const evidenceFiles = evidencePaths.map((path) => {
  const content = readFileSync(path);
  return { path: `_validation/${path.split(sep).at(-1)}`, bytes: content.byteLength, sha256: createHash('sha256').update(content).digest('hex') };
});
const failed = results.filter((result) => result.status !== 'pass');
const report = {
  schemaVersion: 'p5-m5.6-requalification-browser/v2',
  candidate: {
    sourceRevision,
    contentRevision: inputLock.consumed.content.revision,
    contentTree: inputLock.consumed.content.tree,
    selectorSha256: inputLock.consumed.content.selector_sha256,
    fixtureFingerprint: 'synthetic-m5-6-v1',
    deploymentAuthorized: false
  },
  environment: {
    node: process.version,
    pnpm: packageManifest.packageManager,
    playwrightCore: packageManifest.devDependencies['playwright-core'],
    browser: browserVersion,
    executable: chromeExecutable,
    platform: platform(),
    architecture: arch(),
    runnerImageLabel: process.env.FMC_RUNNER_IMAGE_LABEL ?? null,
    runnerImageOS: process.env.ImageOS ?? null,
    runnerImageVersion: process.env.ImageVersion ?? null
  },
  performanceProfile,
  execution: {
    requiredBrowser,
    skipped: false,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    blockerFailed: failed.filter((result) => result.severity === 'Blocker').length,
    materialFailed: failed.filter((result) => result.severity === 'Material').length
  },
  results,
  evidenceFiles,
  limitations: [
    'Automated Chromium evidence does not establish manual screen-reader or cross-engine conformance.',
    'Performance budgets are a bounded M5.6 regression contract, not a universal real-user performance claim.',
    'The external projection fixture is synthetic mechanics only and creates no mapping coverage.'
  ]
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failed.length) {
  throw new Error(`M5.6 v2 requalification has ${failed.length} failure(s):\n${failed.map((result) => `${result.id}: ${result.expected} — ${JSON.stringify(result.actual)}`).join('\n')}`);
}
console.log(`M5.6 v2 requalification passed ${results.length}/${results.length} rows on ${browserVersion}`);
