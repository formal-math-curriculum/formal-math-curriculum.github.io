import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const releaseTupleFields = [
  'site_revision',
  'content_revision',
  'content_tree',
  'lean_revision',
  'mathlib_revision',
  'input_lock_sha256',
  'pnpm_lock_sha256',
  'software_inventory_sha256',
  'external_snapshot_policy_sha256',
  'external_snapshot_schema_sha256',
  'content_validator_sha256',
  'site_operations_validator_sha256',
  'node_version',
  'pnpm_version',
  'runner_image',
  'artifact_manifest_sha256'
];
const changelogSections = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactArray(actual, expected) {
  return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function workflowSteps(workflow) {
  return Object.values(workflow.jobs ?? {}).flatMap(job => job.steps ?? []);
}

async function assertContentHash(contentRoot, record, pathField, hashField) {
  const path = record[pathField];
  invariant(typeof path === 'string', `content ${pathField} is missing`);
  const source = await readFile(resolve(contentRoot, path), 'utf8');
  invariant(sha256(source) === record[hashField], `content ${pathField} hash drift`);
}

export async function validateM58Operations({
  policy,
  lock,
  inventory,
  packageJson,
  lockSource,
  ciSource,
  deploySource,
  contentRoot = '.inputs/content'
}) {
  invariant(policy.schema_version === 'p5-m5.8-release-operations-policy/v1', 'operations policy schema is incompatible');
  invariant(policy.issue === 'MAT-367', 'operations policy issue drift');
  invariant(lock.lock_version === 'p5-m5.8-site-input-lock/v1', 'M5.8 input lock is incompatible');
  invariant(policy.authority.site_base_revision === lock.site_base_revision, 'site base authority drift');
  invariant(policy.authority.content_revision === lock.consumed.content.revision, 'content revision authority drift');
  invariant(policy.authority.content_tree === lock.consumed.content.tree, 'content tree authority drift');
  invariant(policy.authority.lean_revision === lock.recorded_not_consumed.lean.revision, 'Lean authority drift');
  invariant(policy.authority.mathlib_revision === lock.recorded_not_consumed.mathlib.revision, 'mathlib authority drift');
  invariant(policy.authority.pnpm_lock_sha256 === sha256(lockSource), 'pnpm lock authority drift');

  const snapshot = lock.consumed.content.m5_8_external_snapshot_contract;
  invariant(snapshot.public_projection_eligible === false, 'unqualified external snapshot became public');
  invariant(snapshot.runtime_fetch_allowed === false, 'runtime external snapshot fetch is forbidden');
  await assertContentHash(contentRoot, snapshot, 'policy_path', 'policy_sha256');
  await assertContentHash(contentRoot, snapshot, 'schema_path', 'schema_sha256');
  await assertContentHash(contentRoot, snapshot, 'validator_path', 'validator_sha256');
  await assertContentHash(contentRoot, snapshot, 'fixture_path', 'fixture_sha256');

  invariant(policy.versioning.scheme === 'semver', 'versioning must use SemVer');
  invariant(policy.versioning.package_version === packageJson.version, 'package/release version drift');
  invariant(/^p5-web-v\d+\.\d+\.\d+-rc\.[1-9]\d*$/u.test(policy.versioning.candidate_example), 'candidate tag is invalid');
  invariant(/^p5-web-v\d+\.\d+\.\d+$/u.test(policy.versioning.release_example), 'release tag is invalid');
  invariant(exactArray(policy.versioning.changelog_required_sections, changelogSections), 'changelog section contract drift');
  invariant(policy.versioning.current_state === 'policy_defined_no_candidate', 'MAT-367 must not claim a release candidate');
  invariant(policy.versioning.incompatible_schema_behavior === 'fail_closed_new_candidate_required', 'incompatible schema must fail closed');

  invariant(policy.release_tuple.atomic === true && policy.release_tuple.mixed_tuple_allowed === false, 'release tuple must be atomic');
  invariant(exactArray(policy.release_tuple.required_fields, releaseTupleFields), 'release tuple is incomplete or reordered');
  invariant(policy.release_tuple.stale_candidate_reuse_allowed === false, 'stale candidates must not be reused');

  invariant(Number.isInteger(policy.artifacts.preview.retention_days) && policy.artifacts.preview.retention_days > 0 && policy.artifacts.preview.retention_days <= 90, 'preview retention exceeds the supported bound');
  invariant(policy.artifacts.preview.retention_days === 7, 'preview retention policy/workflow drift');
  invariant(policy.artifacts.preview.durable_release_authority === false, 'preview artifact cannot be durable release authority');
  invariant(policy.artifacts.durable_release.provider === 'github_release', 'durable release provider drift');
  invariant(policy.artifacts.durable_release.draft_before_publish === true, 'release assets must be complete in draft');
  invariant(policy.artifacts.durable_release.immutable_after_publish === true, 'published releases must be immutable');
  invariant(policy.artifacts.durable_release.asset_digest === 'sha256', 'release asset digest drift');
  invariant(policy.artifacts.durability_rule === 'actions_artifacts_and_logs_are_not_release_or_rollback_authority', 'Actions retention must not be durable authority');

  invariant(policy.rollback.complete_tuple_only === true, 'rollback must restore a complete tuple');
  invariant(policy.rollback.force_move_main_or_release_tag === false, 'rollback must not force-move authority');
  invariant(policy.rollback.reuse_actions_preview_artifact === false, 'rollback must rebuild from durable authority');
  invariant(policy.rollback.record_new_decision === true, 'rollback requires a new decision record');
  invariant(policy.redirects.maximum_raw_edges <= 8 && policy.redirects.maximum_raw_edges > 0, 'redirect edge bound drift');
  invariant(policy.redirects.maximum_terminal_hops === 1, 'redirects must resolve to one terminal hop');
  invariant(policy.redirects.cycles_allowed === false, 'redirect cycles are forbidden');

  invariant(policy.privacy.application_analytics === 'none', 'application analytics are forbidden by the current policy');
  invariant(policy.privacy.optional_tracking === 'none', 'optional tracking drift');
  invariant(policy.privacy.application_cookies === 'none' && policy.privacy.accounts === 'none', 'cookie/account privacy drift');
  invariant(policy.privacy.consent_banner_required === false, 'a consent banner must not imply nonexistent optional tracking');
  invariant(exactArray(policy.privacy.local_storage_keys, ['formal-math-curriculum:preferences:v1']), 'local-storage allowlist drift');
  invariant(policy.privacy.astro_telemetry_environment?.ASTRO_TELEMETRY_DISABLED === '1', 'Astro telemetry must be disabled');

  invariant(inventory.schema_version === policy.licensing.inventory_schema, 'software inventory schema drift');
  invariant(inventory.lockfile_sha256 === sha256(lockSource), 'software inventory lock hash drift');
  invariant(inventory.package_json_sha256 === sha256(`${JSON.stringify(packageJson, null, 2)}\n`), 'software inventory package hash drift');
  invariant(inventory.lock_counts.packages === policy.licensing.expected_lock_packages, 'lock package count drift');
  invariant(inventory.lock_counts.snapshots === policy.licensing.expected_lock_snapshots, 'lock snapshot count drift');
  invariant(inventory.lock_counts.installed_unique_name_versions === policy.licensing.expected_installed_unique_name_versions, 'installed package count drift');
  invariant(inventory.packages.length === policy.licensing.expected_installed_unique_name_versions, 'software inventory package list drift');
  invariant(inventory.metadata_only_count > 0 && inventory.release_gate === 'blocked_missing_bundled_license_text', 'metadata-only license blockers must fail closed');
  const allowed = new Set(policy.licensing.allowed_expressions);
  invariant(inventory.packages.every(item => allowed.has(item.license)), 'software inventory contains an unapproved license expression');
  invariant(policy.licensing.metadata_only_texts_block_public_release === true, 'missing license text must block public release');

  invariant(policy.deployment.authorized === false, 'MAT-367 policy must not authorize deployment');
  invariant(policy.deployment.workflow_event === 'workflow_dispatch', 'deployment must retain manual dispatch');
  for (const [label, source] of [['CI', ciSource], ['deploy', deploySource]]) {
    const workflow = parse(source);
    invariant(workflow.env?.ASTRO_TELEMETRY_DISABLED === '1', `${label} Astro telemetry environment drift`);
    const steps = workflowSteps(workflow);
    const licenseIndex = steps.findIndex(step => step.run === 'pnpm licenses:check');
    const operationsIndex = steps.findIndex(step => step.run === 'pnpm validate:m5-8-operations');
    const buildIndex = steps.findIndex(step => step.run === 'pnpm build');
    invariant(licenseIndex >= 0 && operationsIndex >= 0, `${label} M5.8 qualification steps are missing`);
    invariant(licenseIndex < buildIndex && operationsIndex < buildIndex, `${label} M5.8 qualification must precede build`);
  }
  return true;
}

async function validateCurrentFiles() {
  const [policy, lock, inventory, packageSource, lockSource, ciSource, deploySource] = await Promise.all([
    readFile('operations/m5-8/release-policy.json', 'utf8').then(JSON.parse),
    readFile('inputs.lock.json', 'utf8').then(JSON.parse),
    readFile('generated/licenses/software-dependencies.json', 'utf8').then(JSON.parse),
    readFile('package.json', 'utf8'),
    readFile('pnpm-lock.yaml', 'utf8'),
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('.github/workflows/deploy-pages.yml', 'utf8')
  ]);
  await validateM58Operations({
    policy,
    lock,
    inventory,
    packageJson: JSON.parse(packageSource),
    lockSource,
    ciSource,
    deploySource
  });
  console.log(`validated M5.8 release, rollback, privacy, retention, and ${inventory.packages.length}-package licensing contracts`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await validateCurrentFiles();
