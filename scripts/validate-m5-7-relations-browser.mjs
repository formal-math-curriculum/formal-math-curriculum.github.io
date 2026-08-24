import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { arch, platform } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';
import { buildRelationCorpus, generateScaleRelationFixture } from '../src/lib/m5-7-relations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const evidenceDirectory = join(dist, '_validation');
const reportPath = join(evidenceDirectory, 'm5-7-relations-browser-v1-report.json');
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
    console.log('M5.7 relation browser qualification explicitly skipped: no Chrome executable in this local environment.');
    process.exit(0);
  }
  throw new Error('M5.7 relation browser qualification requires an identifiable Chrome executable');
}

for (const path of [
  'content/p5m56c0004/natural-number-operation-laws/index.html',
  'content/p5m56c0006/distribute-and-cancel-exercise/index.html',
  'validation/m5-7-relations/index.html'
]) {
  if (!existsSync(join(dist, path))) throw new Error(`M5.7 relation browser subject missing: ${path}`);
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
if (!address || typeof address === 'string') throw new Error('Loopback relation validation server has no port');
const origin = `http://127.0.0.1:${address.port}`;

const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const corpus = buildRelationCorpus(bundle);
const scale = generateScaleRelationFixture(bundle);
const sourceRevision = process.env.FMC_SOURCE_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true, args: ['--force-color-profile=srgb'] });
const browserVersion = browser.version();
const results = [];
const consoleFailures = [];
const requestedUrls = [];
const evidencePaths = [];

async function row(id, severity, expected, execute) {
  try {
    const outcome = await execute();
    const structured = outcome && typeof outcome === 'object' && Object.hasOwn(outcome, 'pass') ? outcome : { pass: Boolean(outcome), actual: outcome };
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

async function open(page, route) {
  await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  observe(page, 'desktop-relations');

  await open(page, '/content/p5m56c0004/natural-number-operation-laws/');
  await row('R01', 'Blocker', 'out-of-slice readiness is a textual boundary with no fabricated page', async () => {
    const item = page.locator('[data-fmc-prerequisite-list] > li').first();
    const actual = { text: await item.innerText(), links: await item.locator('a').count(), state: await item.getAttribute('data-fmc-relation-state') };
    return { pass: /READY-P1-000001/u.test(actual.text) && /CAND-P1-000003/u.test(actual.text) && actual.links === 0 && actual.state === 'external-boundary', actual };
  });
  await row('R02', 'Blocker', 'prerequisite and downstream views share the governed relation but keep distinct labels', async () => {
    const downstream = await page.locator('[data-fmc-downstream-list]').innerText();
    await open(page, '/content/p5m56c0009/integer-operation-and-sign-laws/');
    const prerequisite = await page.locator('[data-fmc-prerequisite-list]').innerText();
    return { pass: /READY-P1-000006/u.test(downstream) && /supports later study/u.test(downstream) && /READY-P1-000006/u.test(prerequisite) && /required before/u.test(prerequisite), actual: { downstream, prerequisite } };
  });
  await row('R03', 'Blocker', 'two Course placements resolve one canonical exercise route', async () => {
    await open(page, '/content/p5m56c0006/distribute-and-cancel-exercise/');
    const actual = await page.locator('[data-fmc-course-placement-list] a').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
    return { pass: actual.length === 2 && new Set(actual).size === 1 && actual[0] === '/content/p5m56c0006/distribute-and-cancel-exercise/', actual };
  });
  await row('R04', 'Blocker', 'Course adjacency without readiness has no invented prerequisite', async () => {
    await open(page, '/content/p5m56c0002/natural-number-operations/');
    const actual = { prerequisiteRows: await page.locator('[data-fmc-prerequisite-list] > li').count(), empty: await page.locator('#relation-prerequisites').innerText(), courseLinks: await page.locator('.fmc-relation-course-nav a').count() };
    return { pass: actual.prerequisiteRows === 0 && /No strict learner prerequisite/u.test(actual.empty) && actual.courseLinks >= 2, actual };
  });
  await open(page, '/content/p5m56c0004/natural-number-operation-laws/');
  await row('R05', 'Blocker', 'exact content-to-artifact-to-module-to-declaration chain is present', async () => {
    const rows = await page.locator('[data-fmc-formal-direct-list] > li').allInnerTexts();
    return { pass: rows.length === 3 && ['FART-P2-000005', 'Mathlib.Algebra.Ring.Nat', 'Nat.instDistrib'].every((value) => rows.join(' ').includes(value)), actual: rows };
  });
  await row('R06', 'Material', 'direct and transitive formal relations are separately labeled', async () => {
    const direct = await page.locator('[data-fmc-formal-direct-list] > li').count();
    const transitive = await page.locator('[data-fmc-formal-transitive-list] > li').allInnerTexts();
    return { pass: direct === 3 && transitive.length === 2 && /depth 2/u.test(transitive[0]) && /depth 3/u.test(transitive[1]), actual: { direct, transitive } };
  });
  await row('R07', 'Blocker', 'stale formal revision is explicit and no mixed graph is claimed', async () => {
    await open(page, '/validation/m5-7-relations/');
    const text = await page.locator('[data-fmc-invalid-case="stale-revision"]').innerText();
    return { pass: /stale\/incompatible/u.test(text) && /0000000000000000000000000000000000000000/u.test(text) && /no mixed graph/u.test(text), actual: text };
  });
  await row('R08', 'Material', 'unresolved formal nodes retain exact reason and no guessed links', async () => {
    const unresolved = page.locator('[data-fmc-unresolved-list] > li');
    const actual = { count: await unresolved.count(), links: await unresolved.locator('a').count(), text: await unresolved.first().innerText() };
    return { pass: actual.count === 10 && actual.links === 0 && /validation-only-unresolved-mapping/u.test(actual.text) && /no guessed target/u.test(actual.text), actual };
  });
  await row('R09', 'Blocker', 'prerequisite self-edge is visibly rejected', async () => {
    const text = await page.locator('[data-fmc-invalid-case="self-edge"]').innerText();
    return { pass: /rejected/u.test(text) && /self-edge/u.test(text), actual: text };
  });
  await row('R10', 'Blocker', 'cycle diagnostic exposes a complete closed path', async () => {
    const text = await page.locator('[data-fmc-invalid-case="cycle"]').innerText();
    const ids = [...text.matchAll(/validation:m57:\d{6}/gu)].map(([value]) => value);
    return { pass: /complete cycle path/u.test(text) && ids.length === 4 && ids[0] === ids.at(-1), actual: { text, ids } };
  });
  await row('R11', 'Blocker', 'dangling edge exposes the exact missing ID and is rejected', async () => {
    const text = await page.locator('[data-fmc-invalid-case="dangling-edge"]').innerText();
    return { pass: /rejected/u.test(text) && /validation:m57:missing/u.test(text), actual: text };
  });
  await row('R12', 'Blocker', 'external multi-parent references round-trip to one canonical entity', async () => {
    const anchors = page.locator('[data-fmc-external-system="ontomathpro"] [data-fmc-reference-id] a');
    const hrefs = await anchors.evaluateAll((rows) => rows.map((row) => row.getAttribute('href')));
    return { pass: hrefs.length === 2 && new Set(hrefs).size === 1 && hrefs[0] === '/content/p5m56c0004/natural-number-operation-laws/', actual: hrefs };
  });
  await row('R13', 'Blocker', 'projection switch preserves pathname, content identity and relation focus', async () => {
    await open(page, '/content/p5m56c0004/natural-number-operation-laws/#relation-downstream');
    const before = await page.evaluate(() => ({ path: location.pathname, hash: location.hash, identity: document.querySelector('fmc-relation-navigator')?.getAttribute('data-fmc-current-content-id'), fingerprint: document.querySelector('fmc-relation-navigator')?.getAttribute('data-fmc-relation-fingerprint') }));
    await page.locator('select[data-fmc-projection]').selectOption('lean-mathlib');
    await page.waitForFunction(() => document.querySelector('[data-fmc-outline-context]')?.textContent?.includes('Lean / mathlib'));
    const after = await page.evaluate(() => ({ path: location.pathname, hash: location.hash, identity: document.querySelector('fmc-relation-navigator')?.getAttribute('data-fmc-current-content-id'), fingerprint: document.querySelector('fmc-relation-navigator')?.getAttribute('data-fmc-relation-fingerprint') }));
    return { pass: JSON.stringify(before) === JSON.stringify(after), actual: { before, after } };
  });
  await row('R14', 'Blocker', 'invalid Course-to-prerequisite type conversion is rejected', async () => {
    await open(page, '/validation/m5-7-relations/');
    const text = await page.locator('[data-fmc-invalid-case="type-conversion"]').innerText();
    return { pass: /rejected/u.test(text) && /course-order-as-prerequisite/u.test(text) && /cannot become learner prerequisite authority/u.test(text), actual: text };
  });
  await open(page, '/content/p5m56c0004/natural-number-operation-laws/');
  await row('A01', 'Material', 'visual map and complete semantic lists contain the same exact edge count', async () => {
    const actual = await page.evaluate(() => ({
      map: document.querySelectorAll('.fmc-relation-map__edges > li').length,
      list: document.querySelectorAll('[data-fmc-prerequisite-list] > li, [data-fmc-downstream-list] > li, [data-fmc-formal-direct-list] > li').length,
      currentNodes: document.querySelectorAll('.fmc-relation-map__node.is-current').length
    }));
    return { pass: actual.map === actual.list && actual.map === 5 && actual.currentNodes >= 1, actual };
  });
  await row('A02', 'Material', 'ordinary relation deep link resolves its exact target without route drift', async () => {
    await open(page, '/content/p5m56c0004/natural-number-operation-laws/#relation-formal');
    const actual = await page.evaluate(() => ({ hash: location.hash, path: location.pathname, visible: Boolean(document.querySelector('#relation-formal')?.getClientRects().length) }));
    return { pass: actual.hash === '#relation-formal' && actual.path === '/content/p5m56c0004/natural-number-operation-laws/' && actual.visible, actual };
  });
  await row('A03', 'Material', 'bounded zoom updates visual map and announces exact percentage', async () => {
    await page.locator('[data-fmc-relation-zoom-in]').click();
    const actual = await page.evaluate(() => ({
      value: document.querySelector('[data-fmc-relation-zoom-reset]')?.textContent?.trim(),
      status: document.querySelector('[data-fmc-relation-zoom-status]')?.textContent?.trim(),
      css: document.querySelector('[data-fmc-relation-map]')?.style.getPropertyValue('--fmc-relation-zoom')
    }));
    return { pass: actual.value === '110%' && /110 percent/u.test(actual.status ?? '') && actual.css === '1.1', actual };
  });
  await screenshot(page, 'm5-7-relations-v1-desktop.png');
  await context.close();

  await row('A04', 'Material', '320 CSS-pixel relation surface reflows without page overflow and keeps 44px zoom controls', async () => {
    const narrow = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const narrowPage = await narrow.newPage();
    observe(narrowPage, 'narrow-relations');
    await open(narrowPage, '/content/p5m56c0004/natural-number-operation-laws/');
    const actual = await narrowPage.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridColumns: getComputedStyle(document.querySelector('.fmc-relation-map__edges > li')).gridTemplateColumns,
      targets: [...document.querySelectorAll('.fmc-relation-zoom button')].map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
    }));
    await screenshot(narrowPage, 'm5-7-relations-v1-320px.png');
    await narrow.close();
    return { pass: actual.overflow <= 1 && !actual.gridColumns.includes(' ') && actual.targets.every(({ width, height }) => width >= 44 && height >= 44), actual };
  });
  await row('A05', 'Material', 'reduced motion removes the relation-map transition without losing content', async () => {
    const reduced = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const reducedPage = await reduced.newPage();
    observe(reducedPage, 'reduced-motion-relations');
    await open(reducedPage, '/content/p5m56c0004/natural-number-operation-laws/');
    const actual = await reducedPage.evaluate(() => ({ transition: getComputedStyle(document.querySelector('.fmc-relation-map__edges')).transitionDuration, rows: document.querySelectorAll('.fmc-relation-map__edges > li').length }));
    await reduced.close();
    return { pass: actual.transition === '0s' && actual.rows === 5, actual };
  });
  await row('A06', 'Material', 'no-JavaScript output retains every semantic relation section and honest enhancement boundary', async () => {
    const noJs = await browser.newContext({ viewport: { width: 320, height: 800 }, javaScriptEnabled: false });
    const noJsPage = await noJs.newPage();
    await open(noJsPage, '/content/p5m56c0004/natural-number-operation-laws/');
    const actual = await noJsPage.evaluate(() => ({
      sections: ['relation-prerequisites', 'relation-downstream', 'relation-course-path', 'relation-external', 'relation-formal', 'relation-import-build'].every((id) => Boolean(document.getElementById(id))),
      zoomHidden: document.querySelector('[data-fmc-relation-enhancement]')?.hasAttribute('hidden'),
      noscript: document.body.textContent?.includes('complete relation lists and ordinary deep links remain available'),
      ordinaryLinks: document.querySelectorAll('fmc-relation-navigator a[href]').length
    }));
    await noJs.close();
    return { pass: actual.sections && actual.zoomHidden && actual.noscript && actual.ordinaryLinks > 0, actual };
  });
  await row('A07', 'Blocker', 'relation enhancement emits no console or page errors', async () => ({ pass: consoleFailures.length === 0, actual: consoleFailures }));
  await row('A08', 'Blocker', 'relation navigation makes no external runtime requests', async () => {
    const external = requestedUrls.filter((url) => !url.startsWith(origin));
    return { pass: external.length === 0, actual: { total: requestedUrls.length, external } };
  });
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const failed = results.filter(({ status }) => status === 'fail');
const report = {
  schemaVersion: 'p5-m5.7-relations-browser/v1',
  issue: 'MAT-364',
  sourceRevision,
  candidate: {
    relationCorpusFingerprint: corpus.fingerprint,
    scaleFixtureFingerprint: scale.fingerprint,
    contentRevision: corpus.authority.contentRevision,
    contentTree: corpus.authority.contentTree,
    formalDependencySha256: corpus.authority.formalDependencySha256
  },
  environment: {
    browser: `Chromium ${browserVersion}`,
    runner: process.env.FMC_RUNNER_IMAGE_LABEL ?? 'local',
    platform: platform(),
    arch: arch(),
    viewportProfiles: ['1440x1000', '1280x900 reduced-motion', '320x800', '320x800 no-JavaScript']
  },
  execution: { total: results.length, passed: results.length - failed.length, failed: failed.length },
  results,
  screenshots: evidencePaths.map((path) => path.slice(dist.length + 1).replaceAll('\\', '/')),
  boundaries: { externalRuntimeRequests: false, relationStatePersistence: false, progressTracking: false, deploymentAuthorized: false },
  limitations: ['representative_slice_not_full_course', 'automated_chromium_not_manual_screen_reader_or_cross_engine_conformance']
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`M5.7 relation browser qualification: ${report.execution.passed}/${report.execution.total} pass; ${report.execution.failed} fail`);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  throw new Error(`M5.7 relation browser qualification failed: ${failed.map(({ id }) => id).join(', ')}`);
}
