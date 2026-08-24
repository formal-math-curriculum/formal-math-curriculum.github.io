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

function changedPaths(coreRevision, candidateRevision) {
  const committed = git('diff', '--name-only', `${coreRevision}..${candidateRevision}`).split('\n').filter(Boolean);
  if (candidateRevision !== git('rev-parse', 'HEAD')) return sortedUnique(committed);
  const worktree = git('diff', '--name-only', coreRevision, '--').split('\n').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  return sortedUnique([...committed, ...worktree, ...untracked]);
}

function browserMajor(value) {
  return String(value ?? '').match(/(?:Chrome|Chromium)[\s/]?(\d+)|^(\d+)\./u)?.slice(1).find(Boolean) ?? null;
}

const candidatePath = resolve(root, 'validation/m5-7-candidate-v1.json');
const currentPath = resolve(root, 'validation/m5-7-current.json');
const [candidate, current, packageManifest] = await Promise.all([
  json(candidatePath),
  json(currentPath),
  json(resolve(root, 'package.json'))
]);

invariant(candidate.schemaVersion === 'p5-m5.7-integrated-candidate/v1', 'integrated candidate schema mismatch');
invariant(candidate.issue === 'MAT-377', 'integrated candidate issue mismatch');
invariant(candidate.status === 'integrated_candidate_pending_independent_audit', 'integrated candidate status mismatch');
invariant(candidate.matrixDocument === 'b10cf6f4-2977-4873-ba58-a1046b83bb7a', 'integrated validation matrix mismatch');
invariant(candidate.freezeDocument === 'd879fd37-8602-4cf2-b3a8-aa19d0a6e588', 'M5.7 freeze document mismatch');
invariant(candidate.requiredEvidence?.totalBrowserRows === 92, 'integrated browser matrix must contain exactly 92 rows');
invariant(candidate.severityPolicy?.candidateRequires === 'zero_unresolved_blocker_and_material_validation_failures', 'candidate severity policy mismatch');
invariant(candidate.severityPolicy?.auditMutation === 'forbidden', 'audit mutation boundary mismatch');
invariant(candidate.deploymentAuthorized === false && current.deploymentAuthorized === false, 'candidate validation cannot authorize deployment');
invariant(current.candidateRecord === 'validation/m5-7-candidate-v1.json', 'current M5.7 candidate pointer mismatch');
invariant(current.coreCommit === candidate.coreSubject?.commit, 'current candidate core revision mismatch');
invariant(current.independentAuditRequired === 'MAT-388' && candidate.nextIssue === 'MAT-388', 'independent audit handoff mismatch');

const coreRevision = candidate.coreSubject?.commit;
const candidateRevision = process.env.FMC_SOURCE_REVISION ?? git('rev-parse', 'HEAD');
invariant(git('rev-parse', `${coreRevision}^{tree}`) === candidate.coreSubject?.tree, 'frozen integrated core tree mismatch');
invariant(git('merge-base', candidateRevision, coreRevision) === coreRevision, 'candidate is not descended from the frozen integrated core');
const changed = changedPaths(coreRevision, candidateRevision);
const allowed = candidate.validationOnlyDiff?.allowedPrefixes ?? [];
const escaped = changed.filter((path) => !allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)));
invariant(candidate.validationOnlyDiff?.coreProductMutationAllowed === false, 'candidate must forbid core-product mutation');
invariant(escaped.length === 0, `candidate validation diff escaped allowed evidence paths: ${escaped.join(', ')}`);

const bundle = await loadSiteBundle({ bundleDir: resolve(root, '.generated/content/m5-6') });
const discovery = buildDiscoveryModel(bundle);
const searchScale = generateScaleSearchFixture(discovery.documents);
const relations = buildRelationCorpus(bundle);
const relationScale = generateScaleRelationFixture(bundle);

invariant(discovery.fingerprint === candidate.models?.searchFingerprint, 'regenerated search fingerprint mismatch');
invariant(searchScale.fingerprint === candidate.models?.searchScaleFingerprint, 'regenerated search scale fingerprint mismatch');
invariant(relations.fingerprint === candidate.models?.relationFingerprint, 'regenerated relation fingerprint mismatch');
invariant(relationScale.fingerprint === candidate.models?.relationScaleFingerprint, 'regenerated relation scale fingerprint mismatch');
invariant(discovery.documents.length === candidate.governed?.learnerPages, 'governed learner-page count mismatch');
invariant(searchScale.documents.length === candidate.scale?.searchDocuments, 'search scale document count mismatch');
invariant(relationScale.documents.length === candidate.scale?.relationDocuments, 'relation scale document count mismatch');
invariant(relationScale.placements.length === candidate.scale?.relationPlacements, 'relation scale placement count mismatch');
invariant(relationScale.prerequisite.nodes.length === candidate.scale?.prerequisiteNodes, 'relation scale prerequisite-node count mismatch');
invariant(relationScale.prerequisite.edges.length === candidate.scale?.prerequisiteEdges, 'relation scale prerequisite-edge count mismatch');
invariant(relationScale.formal.directEdges.length === candidate.scale?.directFormalEdges, 'relation scale direct-edge count mismatch');
invariant(relationScale.formal.twoHopChains.length === candidate.scale?.twoHopFormalChains, 'relation scale two-hop count mismatch');
invariant(relationScale.formal.unresolvedEdges.length === candidate.scale?.unresolvedFormalEdges, 'relation scale unresolved-edge count mismatch');
invariant(searchScale.productionIndexEligible === false && relationScale.productionEligible === false, 'scale fixtures must remain outside the production artifact');
invariant(candidate.scale?.generatedInProductionArtifact === false, 'candidate must not claim scale-fixture production coverage');
invariant(bundle.publication.external_payloads.length === candidate.governed?.externalPayloads, 'external-payload boundary mismatch');
invariant(candidate.governed?.portugueseRoutes === 0, 'unavailable Portuguese coverage must remain explicit');

const artifactDefinitions = [
  {
    name: 'search',
    file: 'm5-7-search-artifact-v1.json',
    schema: 'p5-m5.7-static-search-artifact/v1',
    validate(report) {
      invariant(report.discoveryFingerprint === discovery.fingerprint, 'search artifact fingerprint mismatch');
      invariant(report.governedLearnerDocuments === 15 && report.indexedPages === 42, 'search artifact governed-count mismatch');
      invariant(report.pagefind?.version === packageManifest.dependencies.pagefind, 'Pagefind version mismatch');
      invariant(report.pagefind?.files <= 90 && report.pagefind?.bytes <= 800_000, 'Pagefind artifact envelope exceeded');
      invariant(report.scaleFixture?.deterministicDocuments === 2_000 && report.scaleFixture?.generatedInProductionArtifact === false, 'search artifact scale boundary mismatch');
      invariant(report.deploymentAuthorized === false, 'search artifact cannot authorize deployment');
    }
  },
  {
    name: 'relations',
    file: 'm5-7-relations-artifact-v1.json',
    schema: 'p5-m5.7-relations-artifact/v1',
    validate(report) {
      invariant(report.relationCorpusFingerprint === relations.fingerprint, 'relation artifact fingerprint mismatch');
      invariant(report.scaleFixtureFingerprint === relationScale.fingerprint, 'relation artifact scale fingerprint mismatch');
      invariant(report.relationSystems?.length === 8 && report.governed?.learnerPages === 15, 'relation artifact governed-count mismatch');
      invariant(report.scaleFixture?.documents === 2_000 && report.scaleFixture?.placements === 2_200, 'relation artifact scale count mismatch');
      invariant(report.scaleFixture?.generatedInProductionArtifact === false && report.scaleFixture?.publicCoverage === false, 'relation artifact scale boundary mismatch');
      invariant(report.boundaries?.relationStatePersistence === false && report.boundaries?.progressTracking === false, 'relation state boundary mismatch');
      invariant(report.boundaries?.deploymentAuthorized === false, 'relation artifact cannot authorize deployment');
    }
  },
  {
    name: 'm5-6',
    file: 'm5-6-requalification-artifact-v2.json',
    schema: 'p5-m5.6-requalification-artifact/v2',
    validate(report) {
      invariant(report.source_identity === candidate.authority?.sourceIdentity, 'M5.6 authority identity mismatch');
      invariant(report.selector_sha256 === candidate.authority?.selectorSha256, 'M5.6 selector mismatch');
      invariant(report.content_revision === candidate.authority?.contentRevision, 'M5.6 content revision mismatch');
      invariant(report.content_tree === candidate.authority?.contentTree, 'M5.6 content tree mismatch');
      invariant(report.governed_counts?.content_pages === 15 && report.governed_counts?.formal_records === 20, 'M5.6 governed-count mismatch');
      invariant(report.portuguese_routes === 0 && report.external_payloads === 0, 'M5.6 missing-coverage boundary mismatch');
    }
  }
];

const artifactEvidence = [];
for (const definition of artifactDefinitions) {
  const path = resolve(validationDirectory, definition.file);
  invariant(await exists(path), `required ${definition.name} artifact report is missing`);
  if (!(await exists(path))) continue;
  const report = await json(path);
  invariant((report.schemaVersion ?? report.schema_version) === definition.schema, `${definition.name} artifact schema mismatch`);
  definition.validate(report);
  invariant(report.browserQualification?.required === requiredBrowser || report.browser_qualification?.required === requiredBrowser, `${definition.name} browser requirement mismatch`);
  if (requiredBrowser) {
    invariant(report.browserQualification?.present === true || report.browser_qualification?.present === true, `${definition.name} browser evidence is absent`);
    invariant(report.browserQualification?.passed === true || report.browser_qualification?.passed === true, `${definition.name} browser evidence did not pass`);
  }
  artifactEvidence.push({ name: definition.name, schema: definition.schema, file: `_validation/${definition.file}`, ...await digest(path) });
}

const browserDefinitions = [
  { name: 'm5-5', file: 'm5-5-requalification-v2-report.json', schema: 'p5-m5.5-requalification-browser/v2', ids: range('B', 30), revision: (report) => report.candidate?.sourceRevision },
  { name: 'search', file: 'm5-7-search-browser-v1-report.json', schema: 'p5-m5.7-static-search-browser/v1', ids: range('D', 20), revision: (report) => report.candidate?.sourceRevision },
  { name: 'relations', file: 'm5-7-relations-browser-v1-report.json', schema: 'p5-m5.7-relations-browser/v1', ids: [...range('R', 14), ...range('A', 8)], revision: (report) => report.sourceRevision },
  { name: 'm5-6', file: 'm5-6-requalification-v2-report.json', schema: 'p5-m5.6-requalification-browser/v2', ids: [...range('M', 15), ...range('P', 5)], revision: (report) => report.candidate?.sourceRevision }
];

const browserEvidence = [];
const browserMajors = [];
let observedBrowserRows = 0;
for (const definition of browserDefinitions) {
  const path = resolve(validationDirectory, definition.file);
  const present = await exists(path);
  invariant(present || !requiredBrowser, `required ${definition.name} browser report is missing`);
  if (!present) continue;
  const report = await json(path);
  invariant(report.schemaVersion === definition.schema, `${definition.name} browser schema mismatch`);
  invariant(definition.revision(report) === candidateRevision, `${definition.name} browser source revision mismatch`);
  invariant(report.execution?.skipped !== true, `${definition.name} browser evidence was skipped`);
  invariant(report.execution?.total === definition.ids.length, `${definition.name} browser row total mismatch`);
  invariant(report.execution?.passed === definition.ids.length && report.execution?.failed === 0, `${definition.name} browser qualification contains failures`);
  if (definition.name !== 'relations') invariant(report.execution?.requiredBrowser === requiredBrowser, `${definition.name} browser requirement mismatch`);
  const resultIds = report.results?.map(({ id }) => id) ?? [];
  invariant(resultIds.length === new Set(resultIds).size, `${definition.name} browser report contains duplicate rows`);
  invariant(resultIds.length === definition.ids.length && definition.ids.every((id) => resultIds.includes(id)), `${definition.name} browser matrix coverage mismatch`);
  invariant((report.results ?? []).every(({ status }) => status === 'pass'), `${definition.name} browser matrix has a non-pass result`);
  observedBrowserRows += resultIds.length;
  const major = browserMajor(report.environment?.browser);
  invariant(Boolean(major), `${definition.name} browser major is unavailable`);
  if (major) browserMajors.push(major);

  const evidenceDigests = [];
  for (const evidence of report.evidenceFiles ?? []) {
    const evidencePath = resolve(dist, evidence.path);
    invariant(await exists(evidencePath), `${definition.name} evidence file is missing: ${evidence.path}`);
    if (!(await exists(evidencePath))) continue;
    const actual = await digest(evidencePath);
    invariant(actual.bytes === evidence.bytes && actual.sha256 === evidence.sha256, `${definition.name} evidence digest mismatch: ${evidence.path}`);
    evidenceDigests.push({ file: evidence.path, ...actual });
  }
  for (const screenshot of report.screenshots ?? []) {
    const screenshotPath = resolve(dist, screenshot);
    invariant(await exists(screenshotPath), `${definition.name} screenshot is missing: ${screenshot}`);
    if (await exists(screenshotPath)) evidenceDigests.push({ file: screenshot, ...await digest(screenshotPath) });
  }
  browserEvidence.push({
    name: definition.name,
    schema: definition.schema,
    rows: resultIds.length,
    file: `_validation/${definition.file}`,
    ...await digest(path),
    evidenceFiles: evidenceDigests
  });
}

invariant(!requiredBrowser || observedBrowserRows === 92, `integrated browser row total mismatch: ${observedBrowserRows}/92`);
invariant(!requiredBrowser || new Set(browserMajors).size === 1, `browser major mismatch across evidence: ${browserMajors.join(', ')}`);

if (failures.length) {
  throw new Error(`M5.7 integrated candidate validation failed:\n${[...new Set(failures)].join('\n')}`);
}

await mkdir(validationDirectory, { recursive: true });
const report = {
  schemaVersion: 'p5-m5.7-integrated-candidate-artifact/v1',
  issue: 'MAT-377',
  status: requiredBrowser ? 'coherent-integrated-candidate' : 'local-structural-evidence-only',
  candidate: {
    sourceRevision: candidateRevision,
    coreRevision,
    coreTree: candidate.coreSubject.tree,
    validationOnlyChangedPaths: changed,
    deploymentAuthorized: false,
    independentAuditRequired: 'MAT-388'
  },
  authority: candidate.authority,
  models: candidate.models,
  governed: candidate.governed,
  scale: candidate.scale,
  execution: {
    requiredBrowser,
    browserRowsRequired: 92,
    browserRowsObserved: observedBrowserRows,
    browserMajor: browserMajors[0] ?? null,
    unresolved: requiredBrowser ? { Blocker: 0, Material: 0, Minor: 0 } : null
  },
  artifacts: artifactEvidence,
  browserReports: browserEvidence,
  sourceRecords: [
    { file: 'validation/m5-7-candidate-v1.json', ...await digest(candidatePath) },
    { file: 'validation/m5-7-current.json', ...await digest(currentPath) }
  ],
  limitations: candidate.limitations,
  revalidationTriggers: candidate.revalidationTriggers,
  auditMutation: 'forbidden',
  deploymentAuthorized: false
};
await writeFile(resolve(validationDirectory, 'm5-7-integrated-candidate-v1.json'), `${JSON.stringify(report, null, 2)}\n`);

if (requiredBrowser) {
  console.log(`validated M5.7 integrated candidate: ${observedBrowserRows}/92 browser rows pass; zero unresolved Blocker/Material findings`);
} else {
  console.log('validated M5.7 integrated candidate locally: structural evidence only; browser qualification not claimed');
}
