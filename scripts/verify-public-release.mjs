import { setTimeout as delay } from 'node:timers/promises';

const base = new URL(process.env.FMC_PUBLIC_ROOT ?? 'https://formal-math-curriculum.github.io/');
const sourceRevision = process.env.FMC_SOURCE_REVISION;
if (!/^[0-9a-f]{40}$/u.test(sourceRevision ?? '')) throw new Error('public verification requires exact FMC_SOURCE_REVISION');

async function response(path, expectedStatus = 200) {
  const url = new URL(path, base);
  const result = await fetch(url, { redirect: 'error', headers: { 'user-agent': 'formal-math-curriculum-release-verifier/1' } });
  if (result.status !== expectedStatus) throw new Error(`${url} returned ${result.status}, expected ${expectedStatus}`);
  if (result.url !== url.href) throw new Error(`${url} changed identity to ${result.url}`);
  return result;
}

async function verifyOnce() {
  const root = await (await response('/')).text();
  if (!root.includes('Formal Mathematics Curriculum')) throw new Error('public root payload is incompatible');
  const provenance = await (await response('/_provenance/release.json')).json();
  if (provenance.sourceRevision !== sourceRevision || provenance.releaseTag !== 'p5-web-v0.1.0') {
    throw new Error('public provenance does not match deployed source/tag');
  }
  if (provenance.acceptedAccessibilityRisk?.status !== 'blocked_manual_required'
    || provenance.acceptedAccessibilityRisk?.conformanceClaimAuthorized !== false) {
    throw new Error('public provenance misrepresents accessibility risk');
  }
  const route = await (await response('/content/p5m56c0004/natural-number-operation-laws/')).text();
  if (!route.includes('https://formal-math-curriculum.github.io/content/p5m56c0004/natural-number-operation-laws/')) {
    throw new Error('representative route canonical identity is missing');
  }
  const robots = await (await response('/robots.txt')).text();
  if (!robots.includes('Sitemap: https://formal-math-curriculum.github.io/sitemap-index.xml')) throw new Error('robots sitemap declaration drift');
  const sitemap = await (await response('/sitemap-0.xml')).text();
  if (sitemap.includes('/validation/') || sitemap.includes('/_validation/')) throw new Error('validation-only path leaked into public sitemap');
  await response('/validation/m5-6/', 404);
  await response('/definitely-not-a-real-route-m5-10/', 404);
  return provenance;
}

let lastError;
for (let attempt = 1; attempt <= 20; attempt += 1) {
  try {
    const provenance = await verifyOnce();
    console.log(`verified public release ${provenance.releaseTag} at ${base}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 20) await delay(15_000);
  }
}
throw lastError;
