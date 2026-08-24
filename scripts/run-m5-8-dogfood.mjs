import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateChangePacket } from '../.inputs/content/scripts/validate-m5-8-workflow.mjs';
import { validateSnapshotPolicy } from '../.inputs/content/scripts/validate-m5-8-snapshots.mjs';
import { prepareRelease } from './prepare-release.mjs';
import { validateM58Operations } from './validate-m5-8-operations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function text(path) {
  return readFile(resolve(root, path), 'utf8');
}

async function json(path) {
  return JSON.parse(await text(path));
}

function mutate(target, mutation) {
  if (!mutation) return target;
  const parts = mutation.path.split('.');
  const key = parts.pop();
  const parent = parts.reduce((value, part) => value[Number.isInteger(Number(part)) ? Number(part) : part], target);
  if (mutation.operation === 'pop') parent[key].pop();
  else if (mutation.delete === true) delete parent[key];
  else parent[key] = mutation.value;
  return target;
}

function resultFor(entry, errors, detail = {}) {
  const rejected = errors.length > 0;
  const expectedRejected = entry.expected === 'reject';
  const messageMatches = !entry.error_includes || errors.join('\n').includes(entry.error_includes);
  const passed = rejected === expectedRejected && (!expectedRejected || messageMatches);
  return {
    id: entry.id,
    requirement: entry.requirement,
    executor: entry.executor,
    command: entry.command,
    severityIfWrong: entry.severity_if_wrong,
    negativeControl: entry.negative_control,
    expected: entry.expected,
    observed: rejected ? 'reject' : 'pass',
    status: passed ? 'pass' : 'fail',
    errors,
    ...detail
  };
}

function workflowPacket(entry, workflowCases, exactBases) {
  const fixture = workflowCases.cases.find(item => item.id === entry.fixture);
  invariant(fixture, `missing workflow fixture: ${entry.fixture}`);
  const packet = structuredClone(fixture.packet);
  packet.issue = 'MAT-379';
  packet.change_id = `dogfood-${entry.id.toLowerCase()}`;
  for (const [key, value] of Object.entries(exactBases)) {
    if (Object.hasOwn(packet.exact_bases ?? {}, key)) packet.exact_bases[key] = value;
  }
  for (const change of packet.semantic_reviews ?? []) {
    if (change.project_revision) change.project_revision = exactBases.lean;
    if (change.dependency_revision) change.dependency_revision = exactBases.mathlib;
  }
  return packet;
}

async function operationsInput(policy, sources) {
  return {
    policy,
    lock: sources.lock,
    inventory: sources.inventory,
    packageJson: sources.packageJson,
    lockSource: sources.lockSource,
    ciSource: sources.ciSource,
    deploySource: sources.deploySource,
    contentRoot: resolve(root, '.inputs/content')
  };
}

async function executeCase(entry, sources, options) {
  if (entry.executor === 'workflow_fixture') {
    const packet = workflowPacket(entry, sources.workflowCases, sources.exactBases);
    return resultFor(entry, validateChangePacket(sources.editorialPolicy, packet), {
      subject: { fixture: entry.fixture, changeId: packet.change_id, exactBases: packet.exact_bases }
    });
  }

  if (entry.executor === 'snapshot_fixture') {
    const fixture = sources.snapshotCases.cases.find(item => item.id === entry.fixture);
    invariant(fixture, `missing snapshot fixture: ${entry.fixture}`);
    const policy = structuredClone(sources.snapshotPolicy);
    for (const mutation of fixture.mutations ?? []) mutate(policy, mutation);
    return resultFor(entry, validateSnapshotPolicy(policy), { subject: { fixture: entry.fixture } });
  }

  if (entry.executor === 'operations_fixture') {
    const fixture = sources.operationsCases.cases.find(item => item.id === entry.fixture);
    invariant(fixture, `missing operations fixture: ${entry.fixture}`);
    const policy = mutate(structuredClone(sources.releasePolicy), fixture.mutation);
    const errors = [];
    try {
      await validateM58Operations(await operationsInput(policy, sources));
    } catch (error) {
      errors.push(error.message);
    }
    return resultFor(entry, errors, { subject: { fixture: entry.fixture } });
  }

  if (entry.executor === 'release_gate') {
    const errors = [];
    try {
      await prepareRelease({ root, selector: 'validation/m5-6-current.json' });
    } catch (error) {
      errors.push(error.message);
    }
    return resultFor(entry, errors, { subject: { selector: 'validation/m5-6-current.json' } });
  }

  if (entry.executor === 'static_contract') {
    const errors = [];
    const ci = parse(sources.ciSource);
    const deploy = parse(sources.deploySource);
    if (entry.contract === 'preview_changelog_redirect') {
      const preview = Object.values(ci.jobs ?? {}).flatMap(job => job.steps ?? [])
        .find(step => String(step.uses ?? '').startsWith('actions/upload-artifact@'));
      if (preview?.with?.['retention-days'] !== 7) errors.push('preview retention is not seven days');
      if (sources.releasePolicy.artifacts.preview.durable_release_authority !== false) errors.push('preview became durable authority');
      if (sources.releasePolicy.artifacts.durable_release.draft_before_publish !== true || sources.releasePolicy.artifacts.durable_release.immutable_after_publish !== true) errors.push('durable release draft/immutability boundary drift');
      for (const section of sources.releasePolicy.versioning.changelog_required_sections) {
        if (!sources.changelog.includes(`### ${section}`)) errors.push(`changelog is missing ${section}`);
      }
      if (sources.releasePolicy.redirects.maximum_raw_edges !== 8 || sources.releasePolicy.redirects.maximum_terminal_hops !== 1 || sources.releasePolicy.redirects.cycles_allowed !== false) errors.push('redirect boundary drift');
    } else if (entry.contract === 'authority_locale_privacy') {
      const authority = sources.editorialPolicy.authority;
      const translation = sources.editorialPolicy.state_machines.translation;
      if (authority.canonical_editorial_repository !== 'formal-math-curriculum/content' || authority.generated_outputs_are_authority !== false || authority.translations_are_independent_authority !== false) errors.push('content/generated authority drift');
      if (translation.canonical_locale !== 'en' || translation.fallback_locale !== 'en' || translation.automatic_locale_negotiation !== false) errors.push('English-root/future-locale boundary drift');
      if (sources.publication.external_payloads.length !== 0) errors.push('external payload was copied into the governed publication');
      if (sources.snapshotPolicy.authority.runtime_fetch_allowed !== false) errors.push('runtime taxonomy fetch became allowed');
      if (sources.releasePolicy.privacy.application_analytics !== 'none' || sources.releasePolicy.privacy.optional_tracking !== 'none' || sources.releasePolicy.privacy.application_cookies !== 'none' || sources.releasePolicy.privacy.accounts !== 'none') errors.push('privacy/analytics boundary drift');
      if (ci.env?.ASTRO_TELEMETRY_DISABLED !== '1' || deploy.env?.ASTRO_TELEMETRY_DISABLED !== '1') errors.push('Astro telemetry environment drift');
      if (sources.inventory.metadata_only_count !== 9 || sources.inventory.release_gate !== 'blocked_missing_bundled_license_text') errors.push('license blockers were hidden');
    } else {
      errors.push(`unknown static contract: ${entry.contract}`);
    }
    return resultFor(entry, errors, { subject: { contract: entry.contract } });
  }

  if (entry.executor === 'browser_regression') {
    const errors = [];
    let report = null;
    try {
      report = await json('dist/_validation/m5-7-remediated-candidate-v2.json');
    } catch (error) {
      if (options.requireBrowser) errors.push(`required hosted-browser report is missing: ${error.message}`);
    }
    if (report) {
      if (report.execution?.totalAcceptanceRows !== 121) errors.push('hosted-browser acceptance total is not 121');
      if (report.operationalGovernanceDecision?.m5_8Ready !== true) errors.push('M5.7 report is not M5.8-ready');
      if (report.deploymentAuthorized !== false) errors.push('browser report authorized deployment');
    }
    return resultFor(entry, errors, {
      subject: report
        ? { report: 'dist/_validation/m5-7-remediated-candidate-v2.json', sourceRevision: report.candidate?.sourceRevision, rows: report.execution?.totalAcceptanceRows }
        : { report: 'required only in hosted CI', structurallyDeferred: true }
    });
  }

  return resultFor(entry, [`unknown executor: ${entry.executor}`]);
}

async function loadSources() {
  const paths = {
    matrix: 'validation/m5-8-dogfood-matrix-v1.json',
    candidate: 'validation/m5-8-dogfood-candidate-v1.json',
    current: 'validation/m5-8-current.json',
    editorialPolicy: '.inputs/content/source/m5-8/editorial-workflow-policy.json',
    workflowCases: '.inputs/content/fixtures/m5-8/workflow-cases.json',
    snapshotPolicy: '.inputs/content/source/m5-8/external-snapshot-policy.json',
    snapshotCases: '.inputs/content/fixtures/m5-8/snapshot-cases.json',
    releasePolicy: 'operations/m5-8/release-policy.json',
    operationsCases: 'tests/fixtures/m5-8-operations-cases.json',
    lock: 'inputs.lock.json',
    inventory: 'generated/licenses/software-dependencies.json',
    packageJson: 'package.json',
    publication: '.inputs/content/generated/m5-6/publication.json'
  };
  const parsed = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await json(path)])));
  const [matrixSource, editorialPolicySource, snapshotPolicySource, releasePolicySource, inventorySource, lockSource, ciSource, deploySource, changelog] = await Promise.all([
    text(paths.matrix),
    text(paths.editorialPolicy),
    text(paths.snapshotPolicy),
    text(paths.releasePolicy),
    text(paths.inventory),
    text('pnpm-lock.yaml'),
    text('.github/workflows/ci.yml'),
    text('.github/workflows/deploy-pages.yml'),
    text('CHANGELOG.md')
  ]);
  return { ...parsed, matrixSource, editorialPolicySource, snapshotPolicySource, releasePolicySource, inventorySource, lockSource, ciSource, deploySource, changelog };
}

function validateCandidate(sources) {
  const { candidate, current, matrix } = sources;
  invariant(matrix.schema_version === 'p5-m5.8-dogfood-matrix/v1' && matrix.issue === 'MAT-379', 'dogfood matrix schema/issue mismatch');
  invariant(matrix.cases.length === 18 && new Set(matrix.cases.map(entry => entry.id)).size === 18, 'dogfood matrix must contain 18 unique cases');
  invariant(matrix.cases.filter(entry => entry.negative_control).length === 10, 'dogfood negative-control count drift');
  invariant(candidate.schemaVersion === 'p5-m5.8-dogfood-candidate/v1' && candidate.issue === 'MAT-379', 'dogfood candidate schema/issue mismatch');
  invariant(candidate.candidateId === matrix.candidate_id && candidate.status === 'candidate_requires_required_ci', 'dogfood candidate identity/status drift');
  invariant(candidate.deploymentAuthorized === false && current.deploymentAuthorized === false, 'dogfood candidate cannot authorize deployment');
  invariant(current.schemaVersion === 'p5-m5.8-current-candidate/v1' && current.candidateRecord === 'validation/m5-8-dogfood-candidate-v1.json' && current.auditIssue === 'MAT-385', 'current M5.8 selector drift');
  invariant(candidate.matrix.sha256 === sha256(sources.matrixSource), 'dogfood matrix hash drift');
  for (const [record, source] of [
    [candidate.coreContracts.editorialPolicy, sources.editorialPolicySource],
    [candidate.coreContracts.snapshotPolicy, sources.snapshotPolicySource],
    [candidate.coreContracts.releasePolicy, sources.releasePolicySource],
    [candidate.coreContracts.softwareInventory, sources.inventorySource]
  ]) invariant(record.sha256 === sha256(source), `dogfood core contract hash drift: ${record.path}`);
  invariant(candidate.coreContracts.softwareInventory.metadataOnlyReleaseBlockers === 9, 'dogfood candidate hid license-text blockers');
  invariant(candidate.requiredEvidence.dogfoodCases === 18 && candidate.requiredEvidence.negativeControls === 10 && candidate.requiredEvidence.hostedBrowserAcceptanceRows === 121, 'dogfood evidence count drift');
  invariant(candidate.auditHandoff.nextIssue === 'MAT-385' && candidate.auditHandoff.mutationPolicy === 'candidate_and_executed_evidence_are_immutable_during_audit' && candidate.auditHandoff.remediationIssue === 'MAT-396', 'dogfood audit handoff drift');
  invariant(candidate.exactBases.content === sources.lock.consumed.content.revision && candidate.exactBases.contentTree === sources.lock.consumed.content.tree, 'dogfood content authority drift');
  invariant(candidate.exactBases.lean === sources.lock.recorded_not_consumed.lean.revision && candidate.exactBases.mathlib === sources.lock.recorded_not_consumed.mathlib.revision, 'dogfood formal authority drift');
  invariant(git('merge-base', 'HEAD', candidate.exactBases.site) === candidate.exactBases.site, 'dogfood branch is not descended from its site base');
  invariant(git('-C', resolve(root, '.inputs/content'), 'rev-parse', 'HEAD') === candidate.exactBases.content, 'dogfood content checkout is not exact');
}

export async function runM58Dogfood({ write = false, requireBrowser = process.env.FMC_REQUIRE_BROWSER === '1' } = {}) {
  const sources = await loadSources();
  validateCandidate(sources);
  sources.exactBases = {
    content: sources.candidate.exactBases.content,
    lean: sources.candidate.exactBases.lean,
    site: sources.candidate.exactBases.site,
    mathlib: sources.candidate.exactBases.mathlib
  };
  const results = [];
  for (const entry of sources.matrix.cases) results.push(await executeCase(entry, sources, { requireBrowser }));
  const failures = results.filter(result => result.status !== 'pass');
  invariant(failures.length === 0, `M5.8 dogfood failed:\n${failures.map(result => `${result.id}: ${result.errors.join('; ') || `${result.expected} expected, ${result.observed} observed`}`).join('\n')}`);

  const sourceRevision = process.env.FMC_SOURCE_REVISION ?? git('rev-parse', 'HEAD');
  const sourceTree = git('rev-parse', `${sourceRevision}^{tree}`);
  const report = {
    schemaVersion: 'p5-m5.8-dogfood-report/v1',
    issue: 'MAT-379',
    candidateId: sources.candidate.candidateId,
    status: requireBrowser ? 'qualified_candidate_for_immutable_audit' : 'local_structural_evidence_only',
    exactSubject: {
      siteRevision: sourceRevision,
      siteTree: sourceTree,
      contentRevision: sources.candidate.exactBases.content,
      contentTree: sources.candidate.exactBases.contentTree,
      leanRevision: sources.candidate.exactBases.lean,
      mathlibRevision: sources.candidate.exactBases.mathlib,
      runner: process.env.FMC_RUNNER_IMAGE_LABEL ?? 'local',
      browserRequired: requireBrowser
    },
    execution: {
      total: results.length,
      passed: results.length,
      failed: 0,
      negativeControls: results.filter(result => result.negativeControl).length,
      hostedBrowserAcceptanceRows: requireBrowser ? 121 : 0
    },
    results,
    findings: [],
    unresolvedFindings: { Blocker: 0, Material: 0 },
    knownLimitations: sources.candidate.knownLimitations,
    revalidationTriggers: sources.candidate.revalidationTriggers,
    auditHandoff: sources.candidate.auditHandoff,
    sourceRecords: {
      candidate: { path: 'validation/m5-8-dogfood-candidate-v1.json', sha256: sha256(await text('validation/m5-8-dogfood-candidate-v1.json')) },
      matrix: { path: 'validation/m5-8-dogfood-matrix-v1.json', sha256: sha256(sources.matrixSource) },
      editorialPolicy: sources.candidate.coreContracts.editorialPolicy,
      snapshotPolicy: sources.candidate.coreContracts.snapshotPolicy,
      releasePolicy: sources.candidate.coreContracts.releasePolicy,
      softwareInventory: sources.candidate.coreContracts.softwareInventory
    },
    boundaries: {
      deploymentAuthorized: false,
      publicReleaseAuthorized: false,
      translationCoverageClaimed: false,
      externalTaxonomyCoverageClaimed: false,
      generatedOrFrontendArtifactsAreAuthority: false
    },
    deploymentAuthorized: false
  };
  if (write) {
    invariant(requireBrowser, 'writing the immutable dogfood report requires hosted browser qualification');
    const output = resolve(root, 'dist/_validation/m5-8-dogfood-report-v1.json');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const report = await runM58Dogfood({ write });
  console.log(`validated M5.8 dogfood ${report.execution.passed}/${report.execution.total} cases (${report.execution.negativeControls} negative controls); ${report.status}`);
}
