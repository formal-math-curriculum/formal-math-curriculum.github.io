import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { createServer } from 'node:http';
import { arch, platform } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const contentRoot = resolve(root, '.inputs/content');
const evidenceDirectory = resolve(dist, '_validation/m5-9-security-v1');
const reportPath = resolve(evidenceDirectory, 'report.json');
const manifestPath = resolve(evidenceDirectory, 'manifest.json');
const auditEvidencePath = resolve(evidenceDirectory, 'audit.json');

const candidate = Object.freeze({
  siteRevision: '01c09041aaed77db164a060e6a1aecc889ab861f',
  siteTree: 'b7da7512ff507b86eab2e5953af4d28c7f27318e',
  contentRevision: '3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828',
  contentTree: '59d0e0c49851b534bf528e46dd6ce74f46173c6c',
  leanRevision: '3f1a315f438af37a327eaf8b9b9c1dbc6f409394',
  leanCoreRevision: 'd8b18978322de05a8f3dba51ef03cf5461676c17',
  mathlibRevision: 'db584cd6d46c92f209a44c0f1c829460d327499d',
  formalDependencySha256: 'f8c79c8d196952e4827c72d394039862935689b2e100f821697c41bad8cb1438',
  canonicalHost: 'https://formal-math-curriculum.github.io'
});

const allowedHarnessChanges = new Set([
  '.github/workflows/ci.yml',
  'docs/qualification/m5-9-accessibility-browser.md',
  'docs/qualification/m5-9-security-integrity.md',
  'scripts/validate-m5-9-accessibility-browser.mjs',
  'scripts/validate-m5-9-security-integrity.mjs',
  'tests/m5-9-qualification.test.mjs',
  'tests/m5-9-security-integrity.test.mjs'
]);

const requireAuthoritative = process.env.FMC_REQUIRE_M59 === '1';
const skipNetwork = process.env.FMC_M59_SKIP_NETWORK === '1';
const skipRuntime = process.env.FMC_M59_SKIP_RUNTIME === '1';
if (requireAuthoritative && (skipNetwork || skipRuntime)) {
  throw new Error('authoritative M5.9 qualification forbids network or runtime skips');
}
if (!existsSync(dist)) throw new Error('M5.9 qualification requires a completed dist build');
if (!existsSync(contentRoot)) throw new Error('M5.9 qualification requires the exact content checkout');
mkdirSync(evidenceDirectory, { recursive: true });

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = (path) => sha256(readFileSync(path));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));
const unique = (values) => sorted(new Set(values));
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};

function filesBelow(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesBelow(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

function parseAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = match[1].toLowerCase();
    if (!key.startsWith('<')) attributes[key] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function elementTags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => parseAttributes(match[0]));
}

function metaContent(html, name) {
  return elementTags(html, 'meta').find((entry) => entry.name?.toLowerCase() === name.toLowerCase())?.content ?? null;
}

function canonicalLinks(html) {
  return elementTags(html, 'link')
    .filter((entry) => entry.rel?.toLowerCase().split(/\s+/).includes('canonical'))
    .map((entry) => entry.href)
    .filter(Boolean);
}

function decodeText(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlRoute(path) {
  const name = relative(dist, path).replaceAll('\\', '/');
  if (name === 'index.html') return '/';
  if (name.endsWith('/index.html')) return `/${name.slice(0, -'index.html'.length)}`;
  return `/${name}`;
}

function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function runAudit(scope) {
  if (skipNetwork) return { scope, executed: false, reason: 'explicit local network skip' };
  const args = ['audit', scope === 'production' ? '--prod' : '--dev', '--json'];
  const result = spawnSync('pnpm', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || result.stderr);
  } catch {
    parsed = null;
  }
  const advisories = parsed?.advisories && typeof parsed.advisories === 'object'
    ? Object.values(parsed.advisories)
    : Array.isArray(parsed?.vulnerabilities)
      ? parsed.vulnerabilities
      : [];
  const counts = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  for (const advisory of advisories) {
    const severity = String(advisory?.severity ?? 'unknown').toLowerCase();
    counts[Object.hasOwn(counts, severity) ? severity : 'unknown'] += 1;
  }
  return {
    scope,
    executed: true,
    command: `pnpm ${args.join(' ')}`,
    exitCode: result.status,
    signal: result.signal,
    timedOut: result.error?.code === 'ETIMEDOUT',
    parseable: parsed !== null,
    advisories: advisories.map((entry) => ({
      id: entry.id ?? entry.github_advisory_id ?? entry.url ?? null,
      module: entry.module_name ?? entry.name ?? null,
      severity: entry.severity ?? null,
      vulnerableVersions: entry.vulnerable_versions ?? entry.range ?? null,
      patchedVersions: entry.patched_versions ?? null
    })),
    counts,
    stdoutSha256: sha256(result.stdout ?? ''),
    stderrSha256: sha256(result.stderr ?? ''),
    diagnostic: parsed === null ? (result.stderr || result.stdout || 'no audit output').slice(0, 1_000) : null
  };
}

function createLoopbackServer() {
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.xml': 'application/xml; charset=utf-8'
  };
  return createServer((request, response) => {
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
        filePath = resolve(dist, '404.html');
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
}

const rows = [];
async function row(id, severity, requirement, execute) {
  try {
    const outcome = await execute();
    rows.push({
      id,
      severity,
      requirement,
      status: outcome.pass ? 'pass' : outcome.status ?? 'fail',
      actual: outcome.actual ?? null
    });
  } catch (error) {
    rows.push({
      id,
      severity,
      requirement,
      status: 'fail',
      actual: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
  }
}

const inputLock = readJson(resolve(root, 'inputs.lock.json'));
const releasePolicy = readJson(resolve(root, 'operations/m5-8/release-policy.json'));
const contentManifest = readJson(resolve(contentRoot, 'generated/m5-6/content-manifest.json'));
const externalPolicy = readJson(resolve(contentRoot, 'source/m5-8/external-snapshot-policy.json'));
const formalAuthority = readJson(resolve(contentRoot, 'source/m5-6/formal-authority.json'));
const licenseInventory = readJson(resolve(root, 'generated/licenses/software-dependencies.json'));
const packageManifest = readJson(resolve(root, 'package.json'));
const publicInput = readJson(resolve(dist, '_provenance/input.json'));
const artifactManifest = readJson(resolve(dist, '_provenance/artifact.json'));
const htmlPaths = filesBelow(dist).filter((path) => path.endsWith('.html'));
const htmlDocuments = htmlPaths.map((path) => ({
  path,
  name: relative(dist, path).replaceAll('\\', '/'),
  route: htmlRoute(path),
  html: readFileSync(path, 'utf8')
}));

const candidateTree = git('rev-parse', `${candidate.siteRevision}^{tree}`);
const changedPaths = git('diff', '--name-only', `${candidate.siteRevision}..HEAD`).split('\n').filter(Boolean);
const unexpectedChanges = changedPaths.filter((path) => !allowedHarnessChanges.has(path));
const contentRevision = git('-C', contentRoot, 'rev-parse', 'HEAD');
const contentTree = git('-C', contentRoot, 'rev-parse', 'HEAD^{tree}');

const audits = [runAudit('production'), runAudit('development')];
writeFileSync(auditEvidencePath, `${JSON.stringify({ schemaVersion: 'p5-m5.9-audit-evidence/v1', audits }, null, 2)}\n`);

await row('S01', 'Material', 'Pinned package provenance plus fresh production and development vulnerability audits', async () => {
  const versions = {
    node: process.version,
    pnpm: commandVersion('pnpm'),
    packageManager: packageManifest.packageManager
  };
  const auditUsable = audits.every((audit) => audit.executed && audit.parseable && !audit.timedOut);
  const findings = audits.reduce((sum, audit) => sum + Object.values(audit.counts ?? {}).reduce((a, b) => a + b, 0), 0);
  const exactRuntime = process.version === 'v24.19.0' && versions.pnpm === '11.23.0' && versions.packageManager === 'pnpm@11.23.0';
  return {
    pass: exactRuntime && auditUsable && findings === 0,
    actual: { versions, lockfileSha256: sha256File(resolve(root, 'pnpm-lock.yaml')), audits, exactRuntime, findings }
  };
});

await row('S02', 'Blocker', 'GitHub Actions use least privilege, immutable actions and untrusted-input-safe triggers', async () => {
  const workflowPaths = ['.github/workflows/ci.yml', '.github/workflows/deploy-pages.yml'];
  const workflows = workflowPaths.map((name) => ({ name, text: readFileSync(resolve(root, name), 'utf8') }));
  const uses = workflows.flatMap(({ name, text }) => [...text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => ({ workflow: name, value: match[1] })));
  const mutableActions = uses.filter(({ value }) => !/@[0-9a-f]{40}$/.test(value));
  const checkoutCount = uses.filter(({ value }) => value.startsWith('actions/checkout@')).length;
  const persistFalseCount = workflows.reduce((sum, { text }) => sum + [...text.matchAll(/^\s*persist-credentials:\s*false\s*$/gm)].length, 0);
  const ci = workflows.find(({ name }) => name.endsWith('ci.yml')).text;
  const deploy = workflows.find(({ name }) => name.endsWith('deploy-pages.yml')).text;
  const observations = {
    globalReadOnly: workflows.every(({ text }) => /^permissions:\s*\n\s+contents:\s*read\s*$/m.test(text)),
    mutableActions,
    checkoutCredentialsDisabled: checkoutCount === persistFalseCount,
    forbiddenPullRequestTarget: workflows.some(({ text }) => /pull_request_target\s*:/.test(text)),
    ciHasNoWritePermission: !/^\s+(?:contents|actions|checks|deployments|issues|packages|pull-requests|security-events|statuses):\s*write\s*$/m.test(ci),
    deployPagesOnly: /permissions:\s*\n\s+pages:\s*write\s*\n\s+id-token:\s*write/m.test(deploy),
    deployEnvironment: /environment:\s*\n\s+name:\s*github-pages/m.test(deploy)
  };
  return { pass: observations.globalReadOnly && mutableActions.length === 0 && observations.checkoutCredentialsDisabled && !observations.forbiddenPullRequestTarget && observations.ciHasNoWritePermission && observations.deployPagesOnly && observations.deployEnvironment, actual: observations };
});

await row('S03', 'Blocker', 'No secrets, source maps, private absolute paths or credential-bearing URLs in source or artifact', async () => {
  const tracked = git('ls-files').split('\n').filter(Boolean).map((path) => resolve(root, path));
  const candidates = [...tracked, ...filesBelow(dist)].filter((path) => {
    if (path.startsWith(evidenceDirectory)) return false;
    if (/\.(?:png|jpg|jpeg|gif|webp|wasm|woff2?|ico|pdf|zip)$/i.test(path)) return false;
    return statSync(path).size <= 2_000_000;
  });
  const detectors = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
    ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
    ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
    ['credential-url', /https?:\/\/[^\s/:@]+:[^\s/@]+@/g],
    ['runner-private-path', /(?:\/home\/runner\/|\/workspace\/|[A-Za-z]:\\Users\\)/g]
  ];
  const findings = [];
  for (const path of candidates) {
    const text = readFileSync(path, 'utf8');
    for (const [detector, pattern] of detectors) {
      for (const match of text.matchAll(pattern)) {
        findings.push({ detector, path: relative(root, path).replaceAll('\\', '/'), line: text.slice(0, match.index).split('\n').length });
      }
    }
  }
  const sourceMaps = filesBelow(dist).filter((path) => path.endsWith('.map')).map((path) => relative(dist, path).replaceAll('\\', '/'));
  return { pass: findings.length === 0 && sourceMaps.length === 0, actual: { scannedFiles: candidates.length, findings, sourceMaps } };
});

let runtimePrivacy = null;
await row('S04', 'Blocker', 'Same-origin runtime, no analytics or cookies, and only policy-declared local storage', async () => {
  const sourceText = git('ls-files').split('\n').filter(Boolean).map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');
  const analyticsSignals = unique([...sourceText.matchAll(/(?:google-analytics\.com|googletagmanager\.com|plausible\.io|segment\.com\/analytics|mixpanel\.com)/gi)].map((match) => match[0].toLowerCase()));
  if (skipRuntime) {
    runtimePrivacy = { executed: false, reason: 'explicit local runtime skip', analyticsSignals };
    return { pass: false, status: 'not_executed', actual: runtimePrivacy };
  }
  const { chromium } = await import('playwright-core');
  const executableCandidates = [process.env.FMC_CHROME_EXECUTABLE, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const executable = executableCandidates.find((path) => existsSync(path));
  if (!executable) throw new Error('identifiable Chrome executable is required');
  const server = createLoopbackServer();
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback server has no port');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath: executable, headless: true, args: ['--force-color-profile=srgb'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.locator('fmc-preference-controls details').evaluate((element) => { element.open = true; });
    await page.locator('[data-fmc-field="themePreference"]').selectOption('dark');
    await page.waitForFunction(() => document.documentElement.dataset.fmcThemePreference === 'dark');
    const storage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])));
    const cookies = await context.cookies();
    const externalRequests = unique(requests.filter((url) => new URL(url).origin !== origin));
    const declaredKeys = sorted(releasePolicy.privacy.local_storage_keys);
    const observedKeys = sorted(Object.keys(storage));
    runtimePrivacy = { executed: true, browser: browser.version(), executable, requests: requests.length, externalRequests, cookies, declaredKeys, observedKeys, storageValueSha256: Object.fromEntries(Object.entries(storage).map(([key, value]) => [key, sha256(value ?? '')])), analyticsSignals };
    return { pass: externalRequests.length === 0 && cookies.length === 0 && analyticsSignals.length === 0 && JSON.stringify(declaredKeys) === JSON.stringify(observedKeys), actual: runtimePrivacy };
  } finally {
    await browser.close();
    await new Promise((accept) => server.close(accept));
  }
});

await row('S05', 'Material', 'HTTPS/cache/security-meta posture is measured without claiming undeployed response headers', async () => {
  const astroAssets = filesBelow(resolve(dist, '_astro')).map((path) => relative(resolve(dist, '_astro'), path).replaceAll('\\', '/'));
  const unhashedAssets = astroAssets.filter((name) => !/\.[A-Za-z0-9_-]{5,}\.(?:css|js)$/.test(name));
  const combinedHtml = htmlDocuments.map(({ html }) => html).join('\n');
  const insecureSubresources = unique([...combinedHtml.matchAll(/(?:src|href)=["'](http:\/\/[^"']+)/gi)].map((match) => match[1]));
  const inlineScriptCount = htmlDocuments.reduce((sum, { html }) => sum + [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].length, 0);
  const cspMetaCount = htmlDocuments.reduce((sum, { html }) => sum + elementTags(html, 'meta').filter((entry) => entry['http-equiv']?.toLowerCase() === 'content-security-policy').length, 0);
  const observation = {
    canonicalHttps: candidate.canonicalHost.startsWith('https://'),
    deploymentAuthorized: releasePolicy.deployment.authorized,
    deployedHeadersInspected: false,
    reason: 'candidate is not deployed; GitHub Pages response-header policy is not asserted from a build artifact',
    astroAssets: astroAssets.length,
    unhashedAssets,
    insecureSubresources,
    inlineScriptCount,
    cspMetaCount
  };
  return { pass: observation.canonicalHttps && observation.deploymentAuthorized === false && unhashedAssets.length === 0 && insecureSubresources.length === 0, actual: observation };
});

const seoDocuments = htmlDocuments.map((document) => {
  const robots = metaContent(document.html, 'robots') ?? '';
  return { ...document, robots, indexable: document.name !== '404.html' && !robots.toLowerCase().includes('noindex') };
});

await row('S06', 'Blocker', 'Every indexable page has one absolute self-canonical and excluded pages do not claim canonical authority', async () => {
  const findings = [];
  const seen = new Map();
  for (const document of seoDocuments) {
    const links = canonicalLinks(document.html);
    if (document.indexable) {
      if (links.length !== 1) findings.push({ page: document.name, issue: 'canonical-count', actual: links.length });
      if (links.length === 1) {
        let parsed;
        try { parsed = new URL(links[0]); } catch { parsed = null; }
        if (!parsed || parsed.origin !== candidate.canonicalHost || parsed.pathname !== document.route) findings.push({ page: document.name, issue: 'canonical-not-absolute-self', actual: links[0] });
        if (seen.has(links[0])) findings.push({ page: document.name, issue: 'canonical-collision', other: seen.get(links[0]), actual: links[0] });
        seen.set(links[0], document.name);
      }
    } else if (links.length !== 0) findings.push({ page: document.name, issue: 'excluded-page-canonical', actual: links });
  }
  return { pass: findings.length === 0, actual: { indexablePages: seoDocuments.filter(({ indexable }) => indexable).length, excludedPages: seoDocuments.filter(({ indexable }) => !indexable).length, findings } };
});

await row('S07', 'Blocker', 'Language and hreflang signals match the English-only governed publication set', async () => {
  const badLang = htmlDocuments.filter(({ html }) => !/<html\b[^>]*\blang=["']en["']/i.test(html)).map(({ name }) => name);
  const hreflang = htmlDocuments.flatMap(({ name, html }) => elementTags(html, 'link').filter((entry) => entry.rel?.toLowerCase() === 'alternate' && entry.hreflang).map((entry) => ({ page: name, hreflang: entry.hreflang, href: entry.href })));
  const portugueseRoutes = contentManifest.routes.filter((route) => route.locale === 'pt');
  return { pass: badLang.length === 0 && hreflang.length === 0 && portugueseRoutes.length === 0, actual: { htmlDocuments: htmlDocuments.length, badLang, hreflang, portugueseRoutes } };
});

await row('S08', 'Material', 'Indexable titles and descriptions are present and unique; structured data is valid and truthful if present', async () => {
  const records = seoDocuments.filter(({ indexable }) => indexable).map((document) => ({
    page: document.name,
    title: decodeText(document.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: metaContent(document.html, 'description')?.trim() ?? ''
  }));
  const duplicateValues = (field) => records.filter((record, index) => records.findIndex((other) => other[field] === record[field]) !== index).map((record) => ({ page: record.page, value: record[field] }));
  const missing = records.filter(({ title, description }) => !title || !description);
  const duplicateTitles = duplicateValues('title');
  const duplicateDescriptions = duplicateValues('description');
  const structuredData = [];
  const invalidStructuredData = [];
  for (const document of htmlDocuments) {
    for (const match of document.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try { structuredData.push({ page: document.name, value: JSON.parse(match[1]) }); }
      catch (error) { invalidStructuredData.push({ page: document.name, error: error.message }); }
    }
  }
  return { pass: missing.length === 0 && duplicateTitles.length === 0 && duplicateDescriptions.length === 0 && invalidStructuredData.length === 0, actual: { records: records.length, missing, duplicateTitles, duplicateDescriptions, structuredDataCount: structuredData.length, invalidStructuredData } };
});

await row('S09', 'Blocker', 'Sitemap and robots policy expose exactly the intended indexable URL set and exclude validation routes', async () => {
  const sitemapIndexPath = resolve(dist, 'sitemap-index.xml');
  const sitemapPath = resolve(dist, 'sitemap-0.xml');
  const robotsPath = resolve(dist, 'robots.txt');
  const sitemapIndex = existsSync(sitemapIndexPath) ? readFileSync(sitemapIndexPath, 'utf8') : '';
  const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : '';
  const sitemapUrls = unique([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  const expectedUrls = unique(seoDocuments.filter(({ indexable }) => indexable).flatMap(({ html }) => canonicalLinks(html)));
  const missingUrls = expectedUrls.filter((url) => !sitemapUrls.includes(url));
  const extraUrls = sitemapUrls.filter((url) => !expectedUrls.includes(url));
  const robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : null;
  const robotsValid = robots !== null && /User-agent:\s*\*/i.test(robots) && /Disallow:\s*\/validation\//i.test(robots) && new RegExp(`Sitemap:\\s*${candidate.canonicalHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/sitemap-index\\.xml`, 'i').test(robots);
  const observation = { sitemapIndexPresent: sitemapIndex.includes(`${candidate.canonicalHost}/sitemap-0.xml`), sitemapUrls: sitemapUrls.length, expectedUrls: expectedUrls.length, missingUrls, extraUrls, validationUrls: sitemapUrls.filter((url) => new URL(url).pathname.startsWith('/validation/')), robotsPresent: robots !== null, robotsValid };
  return { pass: observation.sitemapIndexPresent && missingUrls.length === 0 && extraUrls.length === 0 && observation.validationUrls.length === 0 && robotsValid, actual: observation };
});

await row('S10', 'Material', 'Custom 404 and redirect behavior fail safely without canonical or redirect-chain ambiguity', async () => {
  const notFound = seoDocuments.find(({ name }) => name === '404.html');
  const redirects = contentManifest.redirects ?? [];
  const bySource = new Map(redirects.map((entry) => [entry.from ?? entry.source, entry.to ?? entry.target]));
  const graphFindings = [];
  for (const source of bySource.keys()) {
    const visited = new Set([source]);
    let current = source;
    let hops = 0;
    while (bySource.has(current)) {
      current = bySource.get(current);
      hops += 1;
      if (visited.has(current)) { graphFindings.push({ source, issue: 'cycle', at: current }); break; }
      visited.add(current);
      if (hops > releasePolicy.redirects.maximum_terminal_hops) { graphFindings.push({ source, issue: 'too-many-hops', hops }); break; }
    }
  }
  const server = createLoopbackServer();
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback server has no port');
  let missingResponse;
  try { missingResponse = await fetch(`http://127.0.0.1:${address.port}/definitely-missing-m59/`, { redirect: 'manual' }); }
  finally { await new Promise((accept) => server.close(accept)); }
  const observation = { custom404Present: Boolean(notFound), custom404Noindex: notFound?.robots.toLowerCase().includes('noindex') ?? false, custom404CanonicalCount: notFound ? canonicalLinks(notFound.html).length : null, loopbackMissingStatus: missingResponse.status, redirects: redirects.length, graphFindings, deployedBehaviorClaimed: false };
  return { pass: observation.custom404Present && observation.custom404Noindex && observation.custom404CanonicalCount === 0 && observation.loopbackMissingStatus === 404 && redirects.length <= releasePolicy.redirects.maximum_raw_edges && graphFindings.length === 0, actual: observation };
});

await row('S11', 'Blocker', 'Public artifact has exact input provenance, governed cardinality and a hash-valid payload manifest', async () => {
  const inputFindings = [];
  for (const [name, record] of Object.entries(inputLock.consumed.content.outputs)) {
    const observed = sha256File(resolve(contentRoot, record.path));
    if (observed !== record.sha256) inputFindings.push({ name, expected: record.sha256, observed });
  }
  const artifactFindings = [];
  for (const record of artifactManifest.payload_files ?? []) {
    const path = resolve(dist, record.path);
    if (!existsSync(path)) artifactFindings.push({ path: record.path, issue: 'missing' });
    else {
      const observed = sha256File(path);
      if (observed !== record.sha256 || statSync(path).size !== record.bytes) artifactFindings.push({ path: record.path, issue: 'hash-or-size', expectedSha256: record.sha256, observedSha256: observed, expectedBytes: record.bytes, observedBytes: statSync(path).size });
    }
  }
  const expectedIds = sorted(contentManifest.content.map((entry) => entry.content_id));
  const observedIds = unique(htmlDocuments.filter(({ name }) => name.startsWith('content/')).flatMap(({ html }) => [...html.matchAll(/data-fmc-content-id=["']([^"']+)["']/g)].map((match) => match[1])));
  const observation = {
    candidateTree,
    changedPaths,
    unexpectedChanges,
    contentRevision,
    contentTree,
    inputLockMatches: inputLock.consumed.content.revision === candidate.contentRevision && inputLock.consumed.content.tree === candidate.contentTree,
    publicInputMatches: publicInput.consumed.revision === candidate.contentRevision && publicInput.consumed.tree === candidate.contentTree && publicInput.consumed.formal_dependency_sha256 === candidate.formalDependencySha256,
    inputFindings,
    artifactManifestVersion: artifactManifest.artifact_manifest_version,
    artifactPayloadFiles: artifactManifest.payload_files?.length ?? 0,
    artifactFindings,
    expectedContentIds: expectedIds,
    observedContentIds: observedIds,
    artifactManifestSha256: sha256File(resolve(dist, '_provenance/artifact.json'))
  };
  return { pass: candidateTree === candidate.siteTree && unexpectedChanges.length === 0 && contentRevision === candidate.contentRevision && contentTree === candidate.contentTree && observation.inputLockMatches && observation.publicInputMatches && inputFindings.length === 0 && artifactFindings.length === 0 && JSON.stringify(expectedIds) === JSON.stringify(observedIds), actual: observation };
});

await row('S12', 'Blocker', 'External sources remain versioned/license-qualified boundaries with zero unreviewed public mapping', async () => {
  const contract = inputLock.consumed.content.m5_8_external_snapshot_contract;
  const policyHash = sha256File(resolve(contentRoot, contract.policy_path));
  const invalidSystems = externalPolicy.systems.filter((system) => system.public_projection_eligible !== false || system.synthetic_fixture !== false || !system.license?.spdx || !system.upstream?.url);
  const externalStates = seoDocuments.filter(({ indexable }) => indexable).flatMap(({ name, html }) => [...html.matchAll(/data-fmc-external-state=["']([^"']+)["']/g)].map((match) => ({ page: name, state: match[1] })));
  const invalidPublicStates = externalStates.filter(({ state }) => !['unavailable', 'license-needs-review'].includes(state));
  const observation = { policyHash, expectedPolicyHash: contract.policy_sha256, runtimeFetchAllowed: externalPolicy.authority.runtime_fetch_allowed, syntheticFixtureMayEstablishCoverage: externalPolicy.authority.synthetic_fixture_may_establish_coverage, systems: externalPolicy.systems.map(({ system, qualification_state, snapshot_state, public_projection_eligible }) => ({ system, qualification_state, snapshot_state, public_projection_eligible })), invalidSystems, manifestExternalPayloads: contentManifest.external_payloads.length, renderedExternalStates: externalStates.length, invalidPublicStates };
  return { pass: policyHash === contract.policy_sha256 && contract.public_projection_eligible === false && contract.runtime_fetch_allowed === false && externalPolicy.authority.runtime_fetch_allowed === false && externalPolicy.authority.synthetic_fixture_may_establish_coverage === false && invalidSystems.length === 0 && contentManifest.external_payloads.length === 0 && invalidPublicStates.length === 0, actual: observation };
});

await row('S13', 'Blocker', 'Formal dependency revisions and fingerprint are exact, visible and fail-closed inputs', async () => {
  const formalRecords = unique(htmlDocuments.flatMap(({ html }) => [...html.matchAll(/data-fmc-formal-record=["']generated:([0-9a-f]{64})["']/g)].map((match) => match[1])));
  const lockMatches = inputLock.consumed.content.formal_dependency_sha256 === candidate.formalDependencySha256 && inputLock.recorded_not_consumed.lean.revision === candidate.leanRevision && inputLock.recorded_not_consumed.lean_core.revision === candidate.leanCoreRevision && inputLock.recorded_not_consumed.mathlib.revision === candidate.mathlibRevision;
  const authorityMatches = formalAuthority.release_revision === candidate.leanRevision && formalAuthority.lean_core_revision === candidate.leanCoreRevision && formalAuthority.mathlib_revision === candidate.mathlibRevision;
  const staleFixture = resolve(contentRoot, 'fixtures/m5-6/stale/formal-dependency.json');
  const staleTest = readFileSync(resolve(contentRoot, 'tests/m5-6.test.mjs'), 'utf8');
  const observation = { lockMatches, authorityMatches, formalRecords, staleFixturePresent: existsSync(staleFixture), staleFixtureExercised: staleTest.includes('fixtures/m5-6/stale/formal-dependency.json'), recordedBoundary: inputLock.recorded_not_consumed.lean.boundary };
  return { pass: lockMatches && authorityMatches && JSON.stringify(formalRecords) === JSON.stringify([candidate.formalDependencySha256]) && observation.staleFixturePresent && observation.staleFixtureExercised, actual: observation };
});

await row('S14', 'Material', 'Missing, stale, incompatible, corrupt and evolution controls are present and executable', async () => {
  const controls = [
    { id: 'missing', paths: ['.inputs/content/fixtures/m5-6/missing/external-snapshots.json', '.inputs/content/tests/m5-6.test.mjs'], token: 'missing snapshots' },
    { id: 'stale', paths: ['.inputs/content/fixtures/m5-6/stale/formal-dependency.json', '.inputs/content/tests/m5-6.test.mjs'], token: 'fixtures/m5-6/stale/formal-dependency.json' },
    { id: 'incompatible', paths: ['tests/fixtures/m5-8-operations-cases.json', 'tests/m5-8-operations.test.mjs'], token: 'incompatible' },
    { id: 'corrupt', paths: ['tests/preferences.test.mjs'], token: 'corrupt' },
    { id: 'evolution', paths: ['tests/m5-6-publication.test.mjs'], token: 'evolution' },
    { id: 'pagefind-missing', paths: ['scripts/validate-m5-7-search-browser.mjs'], token: 'route.abort' }
  ];
  const observations = controls.map((control) => {
    const missingPaths = control.paths.filter((path) => !existsSync(resolve(root, path)));
    const combined = control.paths.filter((path) => existsSync(resolve(root, path))).map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');
    return { ...control, missingPaths, tokenPresent: combined.toLowerCase().includes(control.token.toLowerCase()) };
  });
  return { pass: observations.every(({ missingPaths, tokenPresent }) => missingPaths.length === 0 && tokenPresent), actual: observations };
});

await row('S15', 'Blocker', 'Every installed package has exact license evidence and no metadata-only public-release blocker', async () => {
  const metadataOnly = licenseInventory.packages.filter((entry) => entry.license_text_status === 'metadata_only').map((entry) => ({ id: entry.id, scope: entry.scope, license: entry.license }));
  const governedFallbacks = licenseInventory.packages.filter((entry) => entry.license_text_status === 'governed_exact_fallback');
  const fallbackFindings = governedFallbacks.flatMap((entry) => {
    const evidence = entry.governed_license_evidence;
    if (!evidence) return [{ id: entry.id, issue: 'missing-governed-license-evidence' }];
    const textPath = resolve(root, evidence.text_path ?? '');
    const textHash = existsSync(textPath) && statSync(textPath).isFile() ? sha256File(textPath) : null;
    const licenseHashRecorded = entry.license_texts?.some(({ sha256: hash }) => hash === evidence.text_sha256) ?? false;
    const findings = [];
    if (!/^[0-9a-f]{40}$/u.test(evidence.source_revision ?? '')) findings.push({ id: entry.id, issue: 'invalid-source-revision' });
    if (!/^https:\/\//u.test(evidence.source_url ?? '')) findings.push({ id: entry.id, issue: 'invalid-source-url' });
    if (!/^sha512-/u.test(evidence.registry_integrity ?? '')) findings.push({ id: entry.id, issue: 'invalid-registry-integrity' });
    if (textHash !== evidence.text_sha256) findings.push({ id: entry.id, issue: 'license-text-hash-mismatch', expected: evidence.text_sha256, observed: textHash });
    if (!licenseHashRecorded) findings.push({ id: entry.id, issue: 'inventory-license-hash-mismatch' });
    return findings;
  });
  const mechanicsPass = licenseInventory.schema_version === releasePolicy.licensing.inventory_schema
    && licenseInventory.packages.length === releasePolicy.licensing.expected_installed_unique_name_versions
    && metadataOnly.length === licenseInventory.metadata_only_count
    && licenseInventory.metadata_only_count === releasePolicy.licensing.required_metadata_only_count_for_public_release
    && licenseInventory.release_gate === 'eligible_for_human_review'
    && governedFallbacks.length > 0
    && fallbackFindings.length === 0;
  return { pass: mechanicsPass, actual: { mechanicsPass, installedPackages: licenseInventory.packages.length, metadataOnlyCount: metadataOnly.length, metadataOnly, governedFallbackCount: governedFallbacks.length, fallbackFindings, releaseGate: licenseInventory.release_gate, qualificationEligible: mechanicsPass, deploymentAuthorized: false } };
});

const failingRows = rows.filter(({ status }) => status !== 'pass');
const report = {
  schemaVersion: 'p5-m5.9-security-content-integrity-qualification/v1',
  issue: 'MAT-370',
  decisionId: 'P5-M5.9-QUALIFICATION-FREEZE-v1',
  generatedAt: new Date().toISOString(),
  candidate,
  subject: {
    candidateTreeVerified: candidateTree === candidate.siteTree,
    harnessOnlyChanges: unexpectedChanges.length === 0,
    changedPaths,
    sourceRevision: process.env.FMC_SOURCE_REVISION ?? git('rev-parse', 'HEAD'),
    deploymentAuthorized: releasePolicy.deployment.authorized
  },
  environment: {
    node: process.version,
    pnpm: commandVersion('pnpm'),
    platform: platform(),
    architecture: arch(),
    runnerImageLabel: process.env.FMC_RUNNER_IMAGE_LABEL ?? null,
    runtimePrivacy
  },
  evidenceBoundary: {
    deployedSiteInspected: false,
    responseHeadersQualified: false,
    reason: 'the frozen candidate is explicitly not deployed',
    networkAuditSkipped: skipNetwork,
    browserRuntimeSkipped: skipRuntime
  },
  rows,
  summary: {
    total: rows.length,
    passed: rows.filter(({ status }) => status === 'pass').length,
    failed: rows.filter(({ status }) => status === 'fail').length,
    blockedPublicRelease: rows.filter(({ status }) => status === 'blocked_public_release').length,
    notExecuted: rows.filter(({ status }) => status === 'not_executed').length,
    outcome: failingRows.length === 0 ? 'qualified' : 'qualification_failed',
    publicReleaseAuthorized: false,
    releaseBoundary: 'M5.9 qualification does not authorize deployment; M5.10 owns release authorization.'
  },
  primaryReferences: [
    'https://docs.github.com/en/actions/reference/security/secure-use',
    'https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https',
    'https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site',
    'https://www.w3.org/TR/CSP3/',
    'https://pnpm.io/cli/audit',
    'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
    'https://developers.google.com/search/docs/specialty/international/localized-versions',
    'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
    'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview',
    'https://developers.google.com/search/docs/crawling-indexing/robots/intro'
  ]
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const evidenceManifest = {
  schemaVersion: 'p5-m5.9-security-content-integrity-evidence-manifest/v1',
  subject: candidate,
  files: [
    { path: 'audit.json', bytes: statSync(auditEvidencePath).size, sha256: sha256File(auditEvidencePath) },
    { path: 'report.json', bytes: statSync(reportPath).size, sha256: sha256File(reportPath) }
  ]
};
writeFileSync(manifestPath, `${JSON.stringify(evidenceManifest, null, 2)}\n`);

console.log(`M5.9 security/content-integrity qualification: ${report.summary.passed}/${report.summary.total} rows passed; outcome=${report.summary.outcome}`);
console.log(`report sha256: ${sha256File(reportPath)}`);
console.log(`manifest sha256: ${sha256File(manifestPath)}`);
if (failingRows.length > 0) process.exitCode = 1;
