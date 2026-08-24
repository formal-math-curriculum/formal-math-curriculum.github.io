import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { arch, platform } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';
import { buildDiscoveryModel } from '../src/lib/m5-7-discovery.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const evidenceDirectory = join(dist, '_validation');
const reportPath = join(evidenceDirectory, 'm5-7-search-browser-v1-report.json');
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
    console.log('M5.7 search browser qualification explicitly skipped: no Chrome executable in this local environment.');
    process.exit(0);
  }
  throw new Error('M5.7 search browser qualification requires an identifiable Chrome executable');
}

for (const path of [
  'content/p5m56c0004/natural-number-operation-laws/index.html',
  'pagefind/pagefind.js',
  'pagefind/pagefind-entry.json',
  'pagefind/wasm.en.pagefind'
]) {
  if (!existsSync(join(dist, path))) throw new Error(`M5.7 search browser subject missing: ${path}`);
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
    if (filePath !== dist && !filePath.startsWith(`${dist}${sep}`)) return response.writeHead(403).end('Forbidden');
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
if (!address || typeof address === 'string') throw new Error('Loopback search validation server has no port');
const origin = `http://127.0.0.1:${address.port}`;

const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const model = buildDiscoveryModel(bundle);
const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const sourceRevision = process.env.FMC_SOURCE_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true, args: ['--force-color-profile=srgb'] });
const browserVersion = browser.version();
const results = [];
const evidencePaths = [];
const consoleFailures = [];
const requestedUrls = [];

async function row(id, severity, expected, execute) {
  try {
    const outcome = await execute();
    const structured = outcome && typeof outcome === 'object' && Object.hasOwn(outcome, 'pass')
      ? outcome
      : { pass: Boolean(outcome), actual: outcome };
    results.push({ id, severity, expected, status: structured.pass ? 'pass' : 'fail', actual: structured.actual ?? null });
  } catch (error) {
    results.push({ id, severity, expected, status: 'fail', actual: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
}

function observe(page, label) {
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('pageerror', (error) => consoleFailures.push({ page: label, type: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push({ page: label, type: 'console-error', text: message.text() });
  });
}

async function screenshot(page, name) {
  const path = join(evidenceDirectory, name);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  evidencePaths.push(path);
}

async function waitForSearch(page) {
  await page.waitForFunction(() => /(?:\d+ matching governed learner|Static search could not load)/u.test(
    document.querySelector('[data-fmc-global-status]')?.textContent ?? ''
  ));
}

async function resetSearch(page) {
  await page.locator('[data-fmc-global-clear]').click();
}

async function search(page, query, filters = {}) {
  await resetSearch(page);
  for (const [key, value] of Object.entries(filters)) {
    await page.locator(`[data-fmc-global-filter="${key}"]`).selectOption(value);
  }
  const started = Date.now();
  if (query) await page.locator('[data-fmc-global-query]').fill(query);
  await waitForSearch(page);
  const actual = await page.evaluate(() => ({
    status: document.querySelector('[data-fmc-global-status]')?.textContent?.trim(),
    ids: [...document.querySelectorAll('[data-fmc-search-item]')].map((item) => item.getAttribute('data-fmc-content-id')),
    hrefs: [...document.querySelectorAll('[data-fmc-search-item] a')].map((item) => item.getAttribute('href'))
  }));
  return { ...actual, elapsedMs: Date.now() - started };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observe(page, 'desktop-search');
  await page.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
  await page.locator('fmc-global-search summary').click();

  await row('D01', 'Blocker', 'exact formal ID resolves only to its canonical learner page', async () => {
    const actual = await search(page, 'FART-P2-000010');
    return { pass: actual.ids.length === 1 && actual.ids[0] === 'cnt:p5m56:000006' && actual.hrefs[0] === '/content/p5m56c0006/distribute-and-cancel-exercise/', actual };
  });
  await row('D02', 'Material', 'shared curriculum candidate resolves all three governed pages', async () => {
    const actual = await search(page, 'CAND-P1-000004');
    const required = ['cnt:p5m56:000004', 'cnt:p5m56:000005', 'cnt:p5m56:000006'];
    return { pass: required.every((id) => actual.ids.includes(id)), actual };
  });
  await row('D03', 'Material', 'exact title is deterministically first', async () => {
    const actual = await search(page, 'Natural-number operation laws');
    return { pass: actual.ids[0] === 'cnt:p5m56:000004', actual };
  });
  await row('D04', 'Material', 'Lean instance identifier resolves the governed definition', async () => {
    const actual = await search(page, 'Nat.instDistrib');
    return { pass: actual.ids.includes('cnt:p5m56:000004'), actual };
  });
  await row('D05', 'Material', 'exact module identifier resolves its learner correspondence', async () => {
    const actual = await search(page, 'Mathlib.Algebra.Ring.Nat');
    return { pass: actual.ids.includes('cnt:p5m56:000004'), actual };
  });
  await row('D06', 'Material', 'zero-product wording retains both required governed results', async () => {
    const actual = await search(page, 'zero product');
    return { pass: ['cnt:p5m56:000012', 'cnt:p5m56:000014'].every((id) => actual.ids.includes(id)), actual };
  });
  await row('D07', 'Material', 'multiplication wording normalization retains law and example', async () => {
    const actual = await search(page, 'negative multiplication');
    return { pass: ['cnt:p5m56:000009', 'cnt:p5m56:000010'].every((id) => actual.ids.includes(id)), actual };
  });
  await row('D08', 'Material', 'mathematical notation resolves the governed example and exercise', async () => {
    const actual = await search(page, '7 * (4 + 3)');
    return { pass: ['cnt:p5m56:000005', 'cnt:p5m56:000006'].every((id) => actual.ids.includes(id)), actual };
  });
  await row('D09', 'Material', 'natural-language roots query resolves its exact example', async () => {
    const actual = await search(page, 'roots two five');
    return { pass: actual.ids.includes('cnt:p5m56:000015'), actual };
  });
  await row('D10', 'Material', 'unknown query returns an explicit empty state without stale results', async () => {
    const actual = await search(page, 'zzzz-no-governed-match');
    const empty = await page.locator('[data-fmc-global-empty]').isVisible();
    return { pass: actual.ids.length === 0 && empty, actual: { ...actual, empty } };
  });
  await row('D11', 'Blocker', 'validation-only identifiers never enter the production index', async () => {
    const probes = [];
    for (const query of ['11A05', 'math.NT', 'urn:fmc:validation:m5-7:onto:parent-a']) probes.push(await search(page, query));
    return { pass: probes.every((probe) => probe.ids.length === 0), actual: probes };
  });
  await row('D12', 'Material', 'content-kind filter intersects with search terms', async () => {
    const actual = await search(page, 'FLOC-P2-000002', { 'content-kind': 'theorem' });
    return { pass: actual.ids.length === 1 && actual.ids[0] === 'cnt:p5m56:000014', actual };
  });
  await row('D13', 'Material', 'representation filter returns exactly narrative-only learner pages', async () => {
    const expected = model.documents.filter(({ representations }) => representations.includes('narrative-only')).map(({ contentId }) => contentId).sort();
    const actual = await search(page, '', { representation: 'narrative-only' });
    return { pass: JSON.stringify([...actual.ids].sort()) === JSON.stringify(expected), actual: { ...actual, expected } };
  });
  await row('D14', 'Material', 'locale filter returns all and only the 15 governed English pages', async () => {
    const actual = await search(page, '', { locale: 'en' });
    return { pass: actual.ids.length === model.documents.length && new Set(actual.ids).size === model.documents.length, actual };
  });
  await row('D15', 'Material', 'one clear action resets query, filters, results and status', async () => {
    await resetSearch(page);
    const actual = await page.evaluate(() => ({
      query: document.querySelector('[data-fmc-global-query]')?.value,
      filters: [...document.querySelectorAll('[data-fmc-global-filter]')].map((select) => select.value),
      results: document.querySelectorAll('[data-fmc-search-item]').length,
      status: document.querySelector('[data-fmc-global-status]')?.textContent?.trim()
    }));
    return { pass: actual.query === '' && actual.filters.every((value) => value === '') && actual.results === 0 && actual.status?.startsWith('15 governed learner pages available'), actual };
  });
  await row('D16', 'Material', 'slash opens/focuses search and Escape restores focus to its summary', async () => {
    await page.keyboard.press('Escape');
    await page.locator('body').press('/');
    const opened = await page.locator('.fmc-global-search').evaluate((element) => element.open);
    const focusedInput = await page.evaluate(() => document.activeElement?.hasAttribute('data-fmc-global-query'));
    await page.keyboard.press('Escape');
    const focusedSummary = await page.evaluate(() => document.activeElement === document.querySelector('fmc-global-search summary'));
    return { pass: opened && focusedInput && focusedSummary, actual: { opened, focusedInput, focusedSummary } };
  });
  await page.locator('fmc-global-search summary').click();
  await search(page, 'FART-P2-000010');
  await screenshot(page, 'm5-7-search-v1-desktop.png');
  await context.close();

  await row('D17', 'Material', '320 CSS-pixel view has no page overflow and all search controls meet 24px target minimum', async () => {
    const narrow = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const narrowPage = await narrow.newPage();
    observe(narrowPage, 'narrow-search');
    await narrowPage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    await narrowPage.locator('fmc-global-search summary').click();
    const actual = await narrowPage.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      targets: [...document.querySelectorAll('fmc-global-search input, fmc-global-search select, fmc-global-search button, fmc-global-search summary')]
        .map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
    }));
    await screenshot(narrowPage, 'm5-7-search-v1-320px.png');
    await narrow.close();
    return { pass: actual.overflow <= 1 && actual.targets.every(({ width, height }) => width >= 24 && height >= 24), actual };
  });
  await row('D18', 'Material', 'no-JavaScript page retains an honest search fallback and ordinary Course navigation', async () => {
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
    const noJsPage = await noJs.newPage();
    await noJsPage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'load' });
    const actual = await noJsPage.evaluate(() => ({
      fallback: document.querySelector('fmc-global-search noscript')?.textContent,
      courseLinks: document.querySelectorAll('[data-fmc-complete-list] a').length
    }));
    await noJs.close();
    return { pass: /Course outline remains complete/u.test(actual.fallback ?? '') && actual.courseLinks > 0, actual };
  });
  await row('D19', 'Blocker', 'index load failure clears results and names the Course outline without cached invention', async () => {
    const failedContext = await browser.newContext({ viewport: { width: 900, height: 800 } });
    await failedContext.route('**/pagefind/**', (route) => route.abort());
    const failedPage = await failedContext.newPage();
    await failedPage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    await failedPage.locator('fmc-global-search summary').click();
    await failedPage.locator('[data-fmc-global-query]').fill('FART-P2-000010');
    await waitForSearch(failedPage);
    const actual = await failedPage.evaluate(() => ({
      status: document.querySelector('[data-fmc-global-status]')?.textContent?.trim(),
      results: document.querySelectorAll('[data-fmc-search-item]').length
    }));
    await failedContext.close();
    return { pass: actual.results === 0 && /Course outline/u.test(actual.status ?? '') && /no cached or invented results/u.test(actual.status ?? ''), actual };
  });
  await row('D20', 'Material', 'static exact-ID search completes within 2s with no external request or normal-console failure', async () => {
    const performanceContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const performancePage = await performanceContext.newPage();
    observe(performancePage, 'performance-search');
    await performancePage.goto(`${origin}/content/p5m56c0004/natural-number-operation-laws/`, { waitUntil: 'networkidle' });
    await performancePage.locator('fmc-global-search summary').click();
    const actual = await search(performancePage, 'FART-P2-000010');
    await performanceContext.close();
    const external = requestedUrls.filter((url) => new URL(url).origin !== origin);
    return { pass: actual.elapsedMs <= 2_000 && actual.ids[0] === 'cnt:p5m56:000006' && external.length === 0 && consoleFailures.length === 0, actual: { ...actual, external, consoleFailures } };
  });
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const evidenceFiles = evidencePaths.map((path) => {
  const content = readFileSync(path);
  return { path: `_validation/${path.split(sep).at(-1)}`, bytes: content.byteLength, sha256: createHash('sha256').update(content).digest('hex') };
});
const failed = results.filter(({ status }) => status !== 'pass');
const report = {
  schemaVersion: 'p5-m5.7-static-search-browser/v1',
  candidate: {
    sourceRevision,
    contentRevision: bundle.provenance.exact_revisions.content,
    discoveryFingerprint: model.fingerprint,
    governedLearnerDocuments: model.documents.length,
    validationScaleDocumentsInProduction: 0,
    deploymentAuthorized: false
  },
  environment: {
    node: process.version,
    pnpm: packageManifest.packageManager,
    pagefind: packageManifest.dependencies.pagefind,
    playwrightCore: packageManifest.devDependencies['playwright-core'],
    browser: browserVersion,
    executable: chromeExecutable,
    platform: platform(),
    architecture: arch(),
    runnerImageLabel: process.env.FMC_RUNNER_IMAGE_LABEL ?? null,
    runnerImageOS: process.env.ImageOS ?? null,
    runnerImageVersion: process.env.ImageVersion ?? null
  },
  execution: {
    requiredBrowser,
    skipped: false,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    blockerFailed: failed.filter(({ severity }) => severity === 'Blocker').length,
    materialFailed: failed.filter(({ severity }) => severity === 'Material').length
  },
  results,
  evidenceFiles,
  limitations: [
    'Automated Chromium evidence does not establish manual screen-reader or cross-engine conformance.',
    'Two-second loopback search latency is a bounded regression budget, not a real-user performance claim.',
    'The deterministic 2,000-document fixture is validated in Node and never enters this production browser artifact.'
  ]
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failed.length) throw new Error(`M5.7 static search qualification has ${failed.length} failure(s):\n${failed.map(({ id, expected, actual }) => `${id}: ${expected} — ${JSON.stringify(actual)}`).join('\n')}`);
console.log(`M5.7 static search qualification passed ${results.length}/${results.length} rows on ${browserVersion}`);
