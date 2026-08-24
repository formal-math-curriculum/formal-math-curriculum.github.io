import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteBundle } from '../src/lib/m5-6-publication.mjs';
import { buildDiscoveryModel, generateScaleSearchFixture } from '../src/lib/m5-7-discovery.mjs';
import { buildRelationCorpus, generateScaleRelationFixture } from '../src/lib/m5-7-relations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const validationDirectory = resolve(dist, '_validation');
const requiredBrowser = process.env.FMC_REQUIRE_BROWSER === '1';
const failures = [];

function invariant(condition, message) {
  if (!condition) failures.push(message);
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function digest(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function range(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en'));
}

function changedPaths(baseRevision, candidateRevision) {
  const committed = git('diff', '--name-only', `${baseRevision}..${candidateRevision}`).split('\n').filter(Boolean);
  if (candidateRevision !== git('rev-parse', 'HEAD')) return sortedUnique(committed);
  return sortedUnique([
    ...committed,
    ...git('diff', '--name-only', baseRevision, '--').split('\n').filter(Boolean),
    ...git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
  ]);
}

function browserMajor(value) {
  return String(value ?? '').match(/(?:Chrome|Chromium)[\s/]?(\d+)|^(\d+)\./u)?.slice(1).find(Boolean) ?? null;
}

const paths = {
  candidate: resolve(root, 'validation/m5-7-candidate-v2.json'),
  remediation: resolve(root, 'validation/m5-7-remediation-v2.json'),
  current: resolve(root, 'validation/m5-7-current.json')
};
const [candidate, remediation, current, inputLock] = await Promise.all([
  ...Object.values(paths).map(json),
  json(resolve(root, 'inputs.lock.json'))
]);
invariant(candidate.schemaVersion === 'p5-m5.7-remediated-candidate/v2' && candidate.issue === 'MAT-394', 'remediated candidate schema/issue mismatch');
invariant(remediation.schemaVersion === 'p5-m5.7-remediation/v2' && remediation.issue === 'MAT-394', 'remediation record schema/issue mismatch');
invariant(current.schemaVersion === 'p5-m5.7-current-candidate/v2' && current.candidateRecord === 'validation/m5-7-candidate-v2.json', 'current candidate selector mismatch');
invariant(candidate.remediationRecord === 'validation/m5-7-remediation-v2.json', 'candidate remediation pointer mismatch');
invariant(candidate.immutableAuditDocumentId === '1f3d98e5-677f-40e0-8faf-d9a18c611473', 'immutable audit document mismatch');
invariant(candidate.remediationDecisionDocumentId === '80ead78d-3298-40ee-b785-69c88665f691', 'remediation decision document mismatch');
invariant(candidate.deploymentAuthorized === false && remediation.deploymentAuthorized === false && current.deploymentAuthorized === false, 'M5.7 remediation cannot authorize deployment');
invariant(remediation.immutableAudit?.preserved === true, 'immutable audit preservation missing');
invariant(remediation.findingDispositions?.length === 5 && remediation.findingDispositions.every(({ disposition }) => disposition.startsWith('remediated')), 'all five audit findings must be remediated');
invariant(JSON.stringify(remediation.unresolvedFindings) === JSON.stringify({ Blocker: 0, Material: 0, Minor: 0 }), 'remediation record has unresolved findings');

const baseRevision = candidate.auditSubject?.commit;
const candidateRevision = process.env.FMC_SOURCE_REVISION ?? git('rev-parse', 'HEAD');
const successorBaseRevision = '1533b529fc2d7513fc51cdd28182f2a5eca65279';
const successorMode = inputLock.lock_version === 'p5-m5.8-site-input-lock/v1';
invariant(git('rev-parse', `${baseRevision}^{tree}`) === candidate.auditSubject?.tree, 'immutable audit subject tree mismatch');
invariant(git('merge-base', candidateRevision, baseRevision) === baseRevision, 'remediated candidate is not descended from immutable audit subject');
if (successorMode) invariant(git('merge-base', candidateRevision, successorBaseRevision) === successorBaseRevision, 'M5.8 successor is not descended from the integrated M5.7 remediation');
const changed = changedPaths(baseRevision, candidateRevision);
const allowedPaths = new Set([
  '.github/workflows/deploy-pages.yml',
  'docs/architecture/m5-7-remediation-v2.md',
  'package.json',
  'scripts/build-m5-7-scale-artifacts.mjs',
  'scripts/clean-build-output.mjs',
  'scripts/validate-m5-7-remediated-candidate.mjs',
  'scripts/validate-m5-7-remediation-browser.mjs',
  'scripts/validate-m5-7-scale-artifact.mjs',
  'src/components/GlobalSearch.astro',
  'src/lib/m5-7-discovery.mjs',
  'src/lib/m5-7-relevance.mjs',
  'src/lib/m5-7-search-client.mjs',
  'src/pages/validation/m5-7-scale.astro',
  'tests/integrated-validation.test.mjs',
  'tests/m5-7-candidate.test.mjs',
  'tests/m5-7-discovery.test.mjs',
  'validation/m5-7-candidate-v2.json',
  'validation/m5-7-current-v1.json',
  'validation/m5-7-current.json',
  'validation/m5-7-remediation-v2.json'
]);
const escaped = changed.filter((path) => !allowedPaths.has(path));
if (!successorMode) invariant(escaped.length === 0, `MAT-394 diff escaped frozen remediation paths: ${escaped.join(', ')}`);

const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const discovery = buildDiscoveryModel(bundle);
const searchScale = generateScaleSearchFixture(discovery.documents);
const relations = buildRelationCorpus(bundle);
const relationScale = generateScaleRelationFixture(bundle);
invariant(discovery.fingerprint === candidate.models?.searchFingerprint, 'regenerated search fingerprint mismatch');
invariant(searchScale.fingerprint === candidate.models?.searchScaleFingerprint, 'regenerated search scale fingerprint mismatch');
if (successorMode) {
  const governedOutputs = inputLock.consumed?.content?.outputs ?? {};
  invariant(inputLock.consumed?.content?.source_identity === 'P5-M5.6-CONTENT-v1', 'M5.8 successor changed the governed M5.6 source identity');
  invariant(governedOutputs['publication.json']?.sha256 === '3be1b29a8c282207d0ddd64a2edbc6d79a397d2b6c72cfee024e2fe4430b7bbe', 'M5.8 successor changed the governed M5.6 publication bytes');
  invariant(governedOutputs['outline-manifest.json']?.sha256 === 'b94d8a104a91f768ab5002cc8d505fb98bd537794a02c82e38a1ff7da48a2ed6', 'M5.8 successor changed the governed M5.6 outline bytes');
  invariant(buildRelationCorpus(bundle).fingerprint === relations.fingerprint, 'M5.8 successor relation regeneration is nondeterministic');
  invariant(generateScaleRelationFixture(bundle).fingerprint === relationScale.fingerprint, 'M5.8 successor relation-scale regeneration is nondeterministic');
} else {
  invariant(relations.fingerprint === candidate.models?.relationFingerprint, 'regenerated relation fingerprint mismatch');
  invariant(relationScale.fingerprint === candidate.models?.relationScaleFingerprint, 'regenerated relation scale fingerprint mismatch');
}

const [deployWorkflow, ciWorkflow] = await Promise.all([
  readFile(resolve(root, '.github/workflows/deploy-pages.yml'), 'utf8'),
  readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8')
]);
invariant(/Deploy qualified artifact[\s\S]*?actions\/checkout@[\s\S]*?fetch-depth: 0/u.test(deployWorkflow), 'production workflow primary checkout must retain full history');
invariant(/Validate static platform[\s\S]*?actions\/checkout@[\s\S]*?fetch-depth: 0/u.test(ciWorkflow), 'CI workflow primary checkout must retain full history');

const artifactDefinitions = [
  ['m5-7-search-artifact-v1.json', 'p5-m5.7-static-search-artifact/v1'],
  ['m5-7-relations-artifact-v1.json', 'p5-m5.7-relations-artifact/v1'],
  ['m5-6-requalification-artifact-v2.json', 'p5-m5.6-requalification-artifact/v2'],
  ['m5-7-scale-artifact-v2.json', 'p5-m5.7-scale-artifact/v2']
];
const artifacts = [];
for (const [file, schema] of artifactDefinitions) {
  const path = resolve(validationDirectory, file);
  const present = await exists(path);
  invariant(present, `required artifact report is missing: ${file}`);
  if (!present) continue;
  const report = await json(path);
  invariant((report.schemaVersion ?? report.schema_version) === schema, `artifact schema mismatch: ${file}`);
  invariant(report.deploymentAuthorized !== true && report.deployment_authorized !== true && report.boundaries?.deploymentAuthorized !== true, `artifact authorized deployment: ${file}`);
  artifacts.push({ file: `_validation/${file}`, schema, ...await digest(path) });
}

const legacyDefinitions = [
  ['m5-5-requalification-v2-report.json', 'p5-m5.5-requalification-browser/v2', range('B', 30), (report) => report.candidate?.sourceRevision],
  ['m5-7-search-browser-v1-report.json', 'p5-m5.7-static-search-browser/v1', range('D', 20), (report) => report.candidate?.sourceRevision],
  ['m5-7-relations-browser-v1-report.json', 'p5-m5.7-relations-browser/v1', [...range('R', 14), ...range('A', 8)], (report) => report.sourceRevision],
  ['m5-6-requalification-v2-report.json', 'p5-m5.6-requalification-browser/v2', [...range('M', 15), ...range('P', 5)], (report) => report.candidate?.sourceRevision]
];
const browserReports = [];
const browserMajors = [];
let legacyRows = 0;
for (const [file, schema, ids, revision] of legacyDefinitions) {
  const path = resolve(validationDirectory, file);
  const present = await exists(path);
  invariant(present || !requiredBrowser, `required legacy browser report is missing: ${file}`);
  if (!present) continue;
  const report = await json(path);
  invariant(report.schemaVersion === schema, `legacy browser schema mismatch: ${file}`);
  invariant(revision(report) === candidateRevision, `legacy browser revision mismatch: ${file}`);
  const actualIds = report.results?.map(({ id }) => id) ?? [];
  invariant(report.execution?.skipped !== true && report.execution?.passed === ids.length && report.execution?.failed === 0, `legacy browser report contains failures: ${file}`);
  invariant(actualIds.length === ids.length && new Set(actualIds).size === ids.length && ids.every((id) => actualIds.includes(id)), `legacy browser matrix mismatch: ${file}`);
  legacyRows += actualIds.length;
  const major = browserMajor(report.environment?.browser);
  invariant(Boolean(major), `browser major unavailable: ${file}`);
  if (major) browserMajors.push(major);
  browserReports.push({ file: `_validation/${file}`, schema, rows: actualIds.length, ...await digest(path) });
}
invariant(!requiredBrowser || legacyRows === 92, `legacy browser row total mismatch: ${legacyRows}/92`);

const remediationReports = {};
for (const [pass, expectedRows, file] of [
  ['baseline', 28, 'm5-7-remediation-browser-v2-baseline.json'],
  ['final', 29, 'm5-7-remediation-browser-v2-report.json']
]) {
  const path = resolve(validationDirectory, file);
  const present = await exists(path);
  invariant(present || !requiredBrowser, `required remediation browser report is missing: ${file}`);
  if (!present) continue;
  const report = await json(path);
  invariant(report.schemaVersion === 'p5-m5.7-remediation-browser/v2' && report.pass === pass, `remediation browser schema/pass mismatch: ${file}`);
  invariant(report.sourceRevision === candidateRevision, `remediation browser revision mismatch: ${file}`);
  invariant(report.execution?.total === expectedRows && report.execution?.passed === expectedRows && report.execution?.failed === 0, `remediation browser report contains failures: ${file}`);
  invariant(report.queries?.length === 20 && report.queries.map(({ id }) => id).join(',') === range('G', 20).join(','), `G01-G20 coverage mismatch: ${file}`);
  invariant(report.boundaries?.deploymentAuthorized === false && report.boundaries?.publicCoverage === false && report.boundaries?.releasePayload === false, `remediation browser boundary mismatch: ${file}`);
  const major = browserMajor(report.environment?.browser);
  invariant(Boolean(major), `browser major unavailable: ${file}`);
  if (major) browserMajors.push(major);
  remediationReports[pass] = report;
  browserReports.push({ file: `_validation/${file}`, schema: report.schemaVersion, rows: expectedRows, ...await digest(path) });
}

if (remediationReports.baseline && remediationReports.final) {
  const semantic = (report) => report.queries.map(({ id, resultIds, metrics }) => ({ id, resultIds, metrics }));
  invariant(JSON.stringify(semantic(remediationReports.baseline)) === JSON.stringify(semantic(remediationReports.final)), 'clean-build governed search semantics changed');
  for (const query of remediationReports.final.queries) {
    if (query.metrics?.mrr === null) invariant(query.resultIds.length === 0, `${query.id} expected empty result`);
    else invariant(query.metrics.mrr === 1 && query.metrics.recallAt5 === 1 && query.metrics.ndcgAt5 >= 0.75, `${query.id} relevance threshold failed`);
  }
  invariant(remediationReports.final.aggregate?.meanMrr >= 0.9 && remediationReports.final.aggregate?.meanRecallAt5 >= 0.9 && remediationReports.final.aggregate?.meanNdcgAt5 >= 0.9, 'aggregate relevance threshold failed');
  invariant(remediationReports.final.results?.find(({ id }) => id === 'E01')?.status === 'pass', 'Pagefind semantic reproducibility comparison failed');
}
invariant(!requiredBrowser || new Set(browserMajors).size === 1, `browser major mismatch across reports: ${browserMajors.join(', ')}`);

if (failures.length) throw new Error(`M5.7 remediated candidate validation failed:\n${[...new Set(failures)].join('\n')}`);
await mkdir(validationDirectory, { recursive: true });
const report = {
  schemaVersion: 'p5-m5.7-remediated-candidate-artifact/v2',
  issue: 'MAT-394',
  status: requiredBrowser
    ? (successorMode ? 'm5.7_requalified_for_m5.8_successor' : 'qualified_for_m5.8_operational_governance')
    : 'local-structural-evidence-only',
  candidate: { sourceRevision: candidateRevision, auditSubject: candidate.auditSubject, changedPaths: changed, deploymentAuthorized: false },
  models: candidate.models,
  findings: remediation.findingDispositions,
  unresolvedFindings: remediation.unresolvedFindings,
  execution: { requiredBrowser, legacyBrowserRows: legacyRows, remediationBrowserRows: remediationReports.final?.execution?.total ?? 0, totalAcceptanceRows: requiredBrowser ? legacyRows + remediationReports.final.execution.total : legacyRows },
  reproducibility: remediation.pagefindReproducibility,
  artifacts,
  browserReports,
  operationalGovernanceDecision: { m5_8Ready: requiredBrowser, successorMode, excludedClaims: candidate.operationalGovernanceDecision.excludedClaims },
  sourceRecords: await Promise.all(Object.entries(paths).map(async ([name, path]) => ({ name, file: path.slice(root.length + 1), ...await digest(path) }))),
  deploymentAuthorized: false
};
await writeFile(resolve(validationDirectory, 'm5-7-remediated-candidate-v2.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(requiredBrowser
  ? `validated M5.7 remediated candidate: ${report.execution.totalAcceptanceRows}/121 acceptance rows; M5.8 operational-governance ready`
  : 'validated M5.7 remediated candidate locally: structural evidence only; browser qualification not claimed');
