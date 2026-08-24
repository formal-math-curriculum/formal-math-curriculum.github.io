import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { arch, platform } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { computeRelevanceMetrics, FROZEN_RELEVANCE_JUDGMENTS } from '../src/lib/m5-7-relevance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const evidenceDirectory = join(dist, '_validation');
const scaleDirectory = join(root, '.generated/validation/m5-7-scale');
const scalePagefind = join(scaleDirectory, 'pagefind');
const scaleRelations = join(scaleDirectory, 'relations.json');
const pass = process.env.FMC_M57_REMEDIATION_PASS ?? 'final';
if (!['baseline', 'final'].includes(pass)) throw new Error(`invalid FMC_M57_REMEDIATION_PASS: ${pass}`);
const baselinePath = join(evidenceDirectory, 'm5-7-remediation-browser-v2-baseline.json');
const reportPath = pass === 'baseline' ? baselinePath : join(evidenceDirectory, 'm5-7-remediation-browser-v2-report.json');
const requiredBrowser = process.env.FMC_REQUIRE_BROWSER === '1';
const explicitSkip = process.env.FMC_SKIP_BROWSER === '1';
if (explicitSkip && requiredBrowser) throw new Error('FMC_SKIP_BROWSER is forbidden when FMC_REQUIRE_BROWSER=1');

const chromeExecutable = [
  process.env.FMC_CHROME_EXECUTABLE,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!chromeExecutable) {
  if (explicitSkip && !requiredBrowser) {
    console.log(`M5.7 remediation ${pass} browser pass explicitly skipped: no Chrome executable.`);
    process.exit(0);
  }
  throw new Error('M5.7 remediation qualification requires an identifiable Chrome executable');
}

for (const path of [
  join(dist, 'content/p5m56c0004/natural-number-operation-laws/index.html'),
  join(dist, 'validation/m5-7-scale/index.html'),
  join(dist, 'pagefind/pagefind.js'),
  join(scalePagefind, 'pagefind.js'),
  scaleRelations,
  join(evidenceDirectory, 'm5-7-scale-build-v2.json')
]) {
  if (!existsSync(path)) throw new Error(`M5.7 remediation subject missing: ${relative(root, path)}`);
}
if (pass === 'final' && !existsSync(baselinePath)) throw new Error('M5.7 remediation baseline report is missing');
mkdirSync(evidenceDirectory, { recursive: true });

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function safeFile(base, pathname) {
  const relativePath = normalize(pathname).replace(/^([/\\])+/, '');
  const file = resolve(base, relativePath);
  return file === base || file.startsWith(`${base}${sep}`) ? file : null;
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    let base = dist;
    if (pathname.startsWith('/__fmc_scale_pagefind__/')) {
      base = scalePagefind;
      pathname = pathname.slice('/__fmc_scale_pagefind__/'.length);
    } else if (pathname === '/__fmc_scale_data__/relations.json') {
      base = scaleDirectory;
      pathname = 'relations.json';
    } else if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }
    let file = safeFile(base, pathname);
    let status = 200;
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      file = join(dist, '404.html');
      status = 404;
    }
    const size = statSync(file).size;
    response.writeHead(status, {
      'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream',
      'content-length': String(size),
      'cache-control': 'no-store'
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
if (!address || typeof address === 'string') throw new Error('loopback remediation server has no port');
const origin = `http://127.0.0.1:${address.port}`;

function filesBelow(directory) {
  const files = [];
  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const entry = statSync(path);
      if (entry.isDirectory()) walk(path);
      if (entry.isFile()) files.push(path);
    }
  }
  walk(directory);
  return files;
}

function snapshot(directory) {
  const manifest = filesBelow(directory).map((path) => {
    const bytes = readFileSync(path);
    return {
      path: relative(directory, path).replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex')
    };
  });
  const treeInput = manifest.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join('');
  return {
    files: manifest.length,
    bytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0),
    treeSha256: createHash('sha256').update(treeInput).digest('hex'),
    manifest
  };
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] ?? null;
}

function stableSemantic(queries) {
  return queries.map(({ id, resultIds, metrics }) => ({ id, resultIds, metrics }));
}

const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const scaleBuild = JSON.parse(readFileSync(join(evidenceDirectory, 'm5-7-scale-build-v2.json'), 'utf8'));
const sourceRevision = process.env.FMC_SOURCE_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true, args: ['--force-color-profile=srgb', '--enable-precise-memory-info'] });
const browserVersion = browser.version();
const rows = [];
const queries = [];
const requestedUrls = [];
const consoleFailures = [];
let screenshotRecord = null;

function record(id, severity, expected, passValue, actual) {
  rows.push({ id, severity, expected, status: passValue ? 'pass' : 'fail', actual });
}

function observe(page, label) {
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('pageerror', (error) => consoleFailures.push({ page: label, type: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push({ page: label, type: 'console-error', text: message.text() });
  });
}

async function openSearch(context, path, label) {
  const page = await context.newPage();
  observe(page, label);
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  await page.locator('fmc-global-search summary').click();
  return page;
}

async function search(page, query) {
  const clear = page.locator('[data-fmc-global-clear]');
  await clear.click();
  const input = page.locator('[data-fmc-global-query]');
  const started = await page.evaluate(() => performance.now());
  if (query.trim()) {
    await input.fill(query);
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-fmc-global-status]')?.textContent ?? '';
      return /matching governed learner|Static search could not load/u.test(status);
    });
  }
  const actual = await page.evaluate(() => ({
    resultIds: [...document.querySelectorAll('[data-fmc-search-item]')].map((item) => item.getAttribute('data-fmc-content-id')).filter(Boolean),
    status: document.querySelector('[data-fmc-global-status]')?.textContent?.trim() ?? '',
    elapsedMs: performance.now()
  }));
  return { ...actual, elapsedMs: actual.elapsedMs - started };
}

async function executeJudgment(page, judgment) {
  const actual = await search(page, judgment.query);
  const metrics = computeRelevanceMetrics(actual.resultIds, judgment.grades);
  const expectedIds = Object.keys(judgment.grades);
  const emptyPass = expectedIds.length === 0 ? actual.resultIds.length === 0 : true;
  const metricPass = expectedIds.length === 0 || (metrics.mrr === 1 && metrics.recallAt5 === 1 && metrics.ndcgAt5 >= 0.75);
  const entry = { id: judgment.id, query: judgment.query, tier: judgment.tier, grades: judgment.grades, resultIds: actual.resultIds, metrics, elapsedMs: actual.elapsedMs, status: actual.status };
  queries.push(entry);
  record(judgment.id, 'Material', 'frozen graded ranking has MRR 1, recall@5 1 and nDCG@5 >= 0.75, or an exact empty result', emptyPass && metricPass, entry);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.__fmcLongTasks = [];
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver((list) => window.__fmcLongTasks.push(...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })))).observe({ type: 'longtask', buffered: true });
    }
  });
  const productionPage = await openSearch(context, '/content/p5m56c0004/natural-number-operation-laws/', `production-${pass}`);
  const scalePage = await openSearch(context, '/validation/m5-7-scale/', `scale-${pass}`);
  await scalePage.waitForFunction(() => document.querySelector('fmc-scale-relations')?.getAttribute('data-fmc-scale-ready') === 'true');
  for (const judgment of FROZEN_RELEVANCE_JUDGMENTS) {
    await executeJudgment(judgment.tier === 'T2' ? scalePage : productionPage, judgment);
  }

  const pagefindSnapshot = snapshot(join(dist, 'pagefind'));
  record('T01', 'Blocker', 'isolated runtime owns exactly 2,000 indexed search documents and 2,200 relation placements', scaleBuild.search.documents === 2_000 && scaleBuild.search.pagefind.indexedPages === 2_000 && scaleBuild.relations.documents === 2_000 && scaleBuild.relations.placements === 2_200, { searchDocuments: scaleBuild.search.documents, indexedPages: scaleBuild.search.pagefind.indexedPages, relationDocuments: scaleBuild.relations.documents, relationPlacements: scaleBuild.relations.placements });
  record('T02', 'Material', 'isolated Pagefind payload is bounded to 12 MiB', scaleBuild.search.pagefind.bytes <= 12 * 1024 * 1024, scaleBuild.search.pagefind);
  record('T03', 'Material', 'isolated relation payload is bounded to 8 MiB', scaleBuild.relations.bytes <= 8 * 1024 * 1024, scaleBuild.relations);

  const coldContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const coldPage = await coldContext.newPage();
  observe(coldPage, `cold-scale-${pass}`);
  const cdp = await coldContext.newCDPSession(coldPage);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await coldPage.goto(`${origin}/validation/m5-7-scale/`, { waitUntil: 'networkidle' });
  await coldPage.locator('fmc-global-search summary').click();
  const cold = await search(coldPage, '11A05');
  record('T04', 'Material', 'cold scale query completes within 2,500 ms under 4x CPU and 50 ms latency', cold.elapsedMs <= 2_500 && cold.resultIds[0] === 'validation:m57:000001', cold);
  await coldContext.close();

  const warmDurations = [];
  for (let index = 0; index < 20; index += 1) warmDurations.push((await search(scalePage, index % 2 ? 'math.NT' : '11A05')).elapsedMs);
  const warmP95 = percentile(warmDurations, 0.95);
  record('T05', 'Material', '20-query warm scale p95 is at most 300 ms', warmP95 <= 300, { samples: warmDurations, p95Ms: warmP95 });

  const relationDurations = [];
  const relationInput = scalePage.locator('[data-fmc-scale-relation-query]');
  const relationSelect = scalePage.locator('[data-fmc-scale-relation-projection]');
  for (let index = 0; index < 20; index += 1) {
    const started = await scalePage.evaluate(() => performance.now());
    await relationInput.fill(index % 2 ? 'validation scale 000001' : '');
    await relationSelect.selectOption(index % 3 ? 'course' : 'lean-mathlib');
    await scalePage.waitForTimeout(0);
    const elapsed = await scalePage.evaluate((value) => performance.now() - value, started);
    relationDurations.push(elapsed);
  }
  const relationActual = await scalePage.evaluate(() => ({
    rows: document.querySelectorAll('[data-fmc-scale-relation-results] li').length,
    componentElapsedMs: Number(document.querySelector('fmc-scale-relations')?.getAttribute('data-fmc-scale-elapsed') ?? NaN),
    longTasks: window.__fmcLongTasks ?? [],
    usedHeapBytes: performance.memory?.usedJSHeapSize ?? null
  }));
  const relationP95 = percentile(relationDurations, 0.95);
  record('T06', 'Material', '20 relation query/filter interactions have p95 <= 500 ms and render at most 250 rows', relationP95 <= 500 && relationActual.rows <= 250, { samples: relationDurations, p95Ms: relationP95, ...relationActual });

  const productionBytes = filesBelow(join(dist, 'pagefind')).map((path) => readFileSync(path)).reduce((all, bytes) => Buffer.concat([all, bytes]), Buffer.alloc(0)).toString('latin1');
  const leakage = ['validation:m57:', '11A05', 'math.NT', 'urn:fmc:validation:m5-7:onto:parent-a'].filter((token) => productionBytes.includes(token));
  record('T07', 'Blocker', 'validation-only scale identities do not leak into the production Pagefind tree', leakage.length === 0, { leakage });

  const screenshotPath = join(evidenceDirectory, `m5-7-remediation-v2-${pass}.png`);
  await scalePage.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  const screenshotBytes = readFileSync(screenshotPath);
  screenshotRecord = { path: `_validation/${screenshotPath.split(sep).at(-1)}`, bytes: screenshotBytes.byteLength, sha256: createHash('sha256').update(screenshotBytes).digest('hex') };
  await context.close();

  const external = requestedUrls.filter((url) => new URL(url).origin !== origin);
  record('T08', 'Blocker', 'runtime emits no external requests or browser errors', external.length === 0 && consoleFailures.length === 0, { external, consoleFailures });

  if (pass === 'final') {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const baselineSemantic = stableSemantic(baseline.queries);
    const currentSemantic = stableSemantic(queries);
    const gradedMetrics = queries.filter(({ metrics }) => metrics.mrr !== null).map(({ metrics }) => metrics);
    const aggregatePass = ['mrr', 'recallAt5', 'ndcgAt5'].every((key) => gradedMetrics.reduce((sum, metrics) => sum + metrics[key], 0) / gradedMetrics.length >= 0.9);
    record('E01', 'Blocker', 'two clean production builds have byte-identical governed query IDs, order and metrics, with aggregate metrics >= 0.90', JSON.stringify(baselineSemantic) === JSON.stringify(currentSemantic) && aggregatePass, {
      baselineTreeSha256: baseline.pagefind.treeSha256,
      finalTreeSha256: pagefindSnapshot.treeSha256,
      byteIdenticalTree: baseline.pagefind.treeSha256 === pagefindSnapshot.treeSha256,
      semanticSha256: createHash('sha256').update(JSON.stringify(currentSemantic)).digest('hex')
    });
  }

  const failed = rows.filter(({ status }) => status !== 'pass');
  const graded = queries.filter(({ metrics }) => metrics.mrr !== null);
  const aggregate = {
    meanMrr: graded.reduce((sum, query) => sum + query.metrics.mrr, 0) / graded.length,
    meanRecallAt5: graded.reduce((sum, query) => sum + query.metrics.recallAt5, 0) / graded.length,
    meanNdcgAt5: graded.reduce((sum, query) => sum + query.metrics.ndcgAt5, 0) / graded.length
  };
  const report = {
    schemaVersion: 'p5-m5.7-remediation-browser/v2',
    issue: 'MAT-394',
    pass,
    sourceRevision,
    environment: { node: process.version, pnpm: packageManifest.packageManager, pagefind: packageManifest.dependencies.pagefind, playwrightCore: packageManifest.devDependencies['playwright-core'], browser: browserVersion, executable: chromeExecutable, platform: platform(), architecture: arch(), runnerImageLabel: process.env.FMC_RUNNER_IMAGE_LABEL ?? null },
    execution: { requiredBrowser, skipped: false, total: rows.length, passed: rows.length - failed.length, failed: failed.length, blockerFailed: failed.filter(({ severity }) => severity === 'Blocker').length, materialFailed: failed.filter(({ severity }) => severity === 'Material').length },
    thresholds: { mrr: 1, recallAt5: 1, ndcgAt5Minimum: 0.75, aggregateMinimum: 0.9, coldSearchMs: 2_500, warmSearchP95Ms: 300, relationP95Ms: 500, maximumRenderedSearchRows: 100, maximumRenderedRelationRows: 250 },
    aggregate,
    queries,
    scaleBuild,
    pagefind: pagefindSnapshot,
    results: rows,
    evidenceFiles: [screenshotRecord],
    boundaries: { publicCoverage: false, releasePayload: false, deploymentAuthorized: false },
    limitations: ['Automated Chromium does not establish manual screen-reader or cross-engine conformance.', 'Loopback timings are bounded regression evidence, not real-user performance claims.']
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (failed.length) throw new Error(`M5.7 remediation ${pass} pass has ${failed.length} failure(s):\n${failed.map(({ id, actual }) => `${id}: ${JSON.stringify(actual)}`).join('\n')}`);
  console.log(`M5.7 remediation ${pass} qualification passed ${rows.length}/${rows.length} rows on ${browserVersion}`);
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}
