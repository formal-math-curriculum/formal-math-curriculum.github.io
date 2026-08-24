import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const exact = Object.freeze({
  applicationCandidateRevision: 'cc137e0f47e324acbb8b864212a1dd4387c54d23',
  applicationCandidateTree: '99033aa8185141b7b5a5346ea70533086af2eb24',
  integratedM59Revision: 'f28129382128eddf21d94188e1977af3dfc7c3ae',
  integratedM59Tree: 'd9bb31fd73e8be2c4f79454bf3abb717bc664544',
  contentRevision: '3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828',
  contentTree: '59d0e0c49851b534bf528e46dd6ce74f46173c6c',
  leanRevision: '3f1a315f438af37a327eaf8b9b9c1dbc6f409394',
  leanCoreRevision: 'd8b18978322de05a8f3dba51ef03cf5461676c17',
  mathlibRevision: 'db584cd6d46c92f209a44c0f1c829460d327499d',
  formalDependencySha256: 'f8c79c8d196952e4827c72d394039862935689b2e100f821697c41bad8cb1438',
  inputLockSha256: 'bc53a66a9ee05a4bd2bec67bd8761bda0c31be74a798a8e6ad8d5a518fd6e46d',
  pnpmLockSha256: '5bc6e61817b88aa16ddde81d8d4453ec340013a203a0efc582864b6d2816f21f',
  softwareInventorySha256: '4e6403a7c242b59b550804d767eb4a8423890f582a0e79e7f41edb46b2e2b4a1',
  releasePolicySha256: 'ac2f5916f6686f8d048ecb47a27eed28d96d7f36e15542549a6d430cf744aaea',
  operationsValidatorSha256: '50820ada07c543f536ad6c757b57ad50428e2437aa6a698f57735c6ae6e68d29',
  externalSnapshotPolicySha256: 'bd864c4d98cde7f2e0ad16de29d230d5f4e6a87a3a6d7904547e8a7b12df5d01',
  externalSnapshotSchemaSha256: 'a1b66ea6843362fc58f256de9efaa49f41652192af1bb2729ba851c120fb34ae',
  externalSnapshotValidatorSha256: '5550d69ba94fda2299fd2235f31ffa81d7ff177fbdbdbf2fa0ae414870867cb2',
  contentManifestSha256: '7bd7020156e0d20767e06d5fcb48f1eebfa1f0d24dd52b749135d16e39f7ed60',
  outlineManifestSha256: 'b94d8a104a91f768ab5002cc8d505fb98bd537794a02c82e38a1ff7da48a2ed6',
  contentValidatorSha256: 'fc8625ceb464adb1d9f776422933a6819a3b7612e06ae559458df4269ac77932',
  formalAuthoritySha256: '9018ec2f4651efdfe51806386648aa831b27d37308a504624849165fdea6f347'
});
const requiredAssets = [
  'site-dist.tar.zst',
  'release-tuple.json',
  'software-dependencies.json',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES.txt',
  'SHA256SUMS'
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function inside(parent, child) {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function validateM510Release(options = {}) {
  const root = resolve(options.root ?? repositoryRoot);
  const validationRoot = resolve(root, 'validation');
  const selectorPath = resolve(root, options.selector ?? 'validation/m5-10-current.json');
  invariant(inside(validationRoot, selectorPath), 'release selector must remain under validation/');
  const selectorBytes = await readFile(selectorPath);
  const selector = JSON.parse(selectorBytes);
  invariant(selector.schemaVersion === 'p5-current-baseline-selector/v1', 'release selector schema is incompatible');
  invariant(selector.deploymentAuthorized === true, 'current release selector does not authorize deployment');
  invariant(selector.releaseRecord === 'validation/m5-10-release-v1.json', 'current release selector points to an unexpected record');

  const recordPath = resolve(root, selector.releaseRecord);
  invariant(inside(validationRoot, recordPath), 'release record must remain under validation/');
  const recordBytes = await readFile(recordPath);
  const record = JSON.parse(recordBytes);
  invariant(record.schemaVersion === 'p5-m5.10-public-release/v1', 'release record schema is incompatible');
  invariant(record.deploymentAuthorized === true, 'release record does not authorize deployment');
  invariant(record.release?.version === '0.1.0', 'release version drift');
  invariant(record.release?.tag === 'p5-web-v0.1.0', 'release tag drift');
  invariant(record.release?.canonicalRoot === 'https://formal-math-curriculum.github.io/', 'canonical release root drift');
  invariant(record.release?.repository === 'formal-math-curriculum/formal-math-curriculum.github.io', 'release repository drift');
  invariant(record.release?.event === 'workflow_dispatch', 'release must retain a manual dispatch gate');
  for (const [key, value] of Object.entries(exact)) invariant(record.authority?.[key] === value, `release authority drift: ${key}`);
  invariant(record.qualification?.workflowRunId === 32753029555, 'qualification run drift');
  invariant(record.qualification?.workflowConclusion === 'success', 'qualification run was not successful');
  invariant(record.qualification?.mandatoryFailures === 0, 'qualification retains mandatory failures');
  invariant(record.qualification?.securityRowsPassed === 15 && record.qualification?.securityRowsTotal === 15, 'security matrix is incomplete');
  invariant(record.unresolvedFindings?.Blocker === 0 && record.unresolvedFindings?.Material === 0, 'mandatory findings remain unresolved');
  invariant(record.acceptedAccessibilityRisk?.decision === 'P5-DEC-033', 'accessibility risk decision drift');
  invariant(record.acceptedAccessibilityRisk?.row === 'A10', 'accessibility risk row drift');
  invariant(record.acceptedAccessibilityRisk?.status === 'blocked_manual_required', 'A10 must remain explicitly unexecuted');
  invariant(record.acceptedAccessibilityRisk?.retainedAsPass === false, 'A10 cannot be represented as pass');
  invariant(record.acceptedAccessibilityRisk?.conformanceClaimAuthorized === false, 'accessibility conformance claim is forbidden');
  invariant(record.claims?.wcagConformance === false && record.claims?.screenReaderConformance === false, 'accessibility conformance claim drift');
  invariant(record.changeWindow?.baseRevision === exact.integratedM59Revision, 'release-control base drift');
  invariant(record.changeWindow?.applicationDriftAllowed === false, 'application drift cannot be authorized');
  invariant(record.durableRelease?.draftBeforePublish === true && record.durableRelease?.attestationRequired === true, 'durable release controls are incomplete');
  invariant(same(record.durableRelease?.requiredAssets, requiredAssets), 'durable release asset set drift');
  invariant(record.rollback?.completeTupleOnly === true
    && record.rollback?.forceMoveMainOrPublishedTag === false
    && record.rollback?.reuseActionsPreviewArtifact === false
    && record.rollback?.sameQualificationGatesRequired === true, 'rollback contract drift');

  if (options.verifyGitBoundary !== false) {
    const head = options.headRevision ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    invariant(/^[0-9a-f]{40}$/u.test(head), 'release-control head is not an immutable revision');
    const changedPaths = execFileSync('git', ['diff', '--name-only', exact.applicationCandidateRevision, head], { cwd: root, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
    const allowed = new Set(record.changeWindow.allowedPaths ?? []);
    invariant(allowed.size > 0, 'release-control allowed path set is empty');
    const drift = changedPaths.filter((path) => !allowed.has(path));
    invariant(drift.length === 0, `release-control boundary rejected application drift: ${drift.join(', ')}`);
  }

  return {
    selector,
    record,
    selectorPath: relative(root, selectorPath),
    selectorSha256: sha256(selectorBytes),
    recordPath: relative(root, recordPath),
    recordSha256: sha256(recordBytes)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await validateM510Release({ selector: process.argv[2] });
  console.log(`validated authorized M5.10 tuple ${result.record.release.tag}`);
}
