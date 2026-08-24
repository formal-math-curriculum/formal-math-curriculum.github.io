import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateChangePacket } from '../.inputs/content/scripts/validate-m5-8-workflow.mjs';

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

export async function runM58FreshSession({ sourceRevision = process.env.FMC_SOURCE_REVISION ?? git('rev-parse', 'HEAD') } = {}) {
  const paths = {
    instructions: '.inputs/content/docs/m5-8-editorial-contribution-workflow.md',
    policy: '.inputs/content/source/m5-8/editorial-workflow-policy.json',
    schema: '.inputs/content/schemas/m5-8-change-packet.schema.json',
    validator: '.inputs/content/scripts/validate-m5-8-workflow.mjs',
    governedFixtures: '.inputs/content/fixtures/m5-8/workflow-cases.json',
    candidate: 'validation/m5-9-remediation-candidate-v1.json',
    current: 'validation/m5-8-current.json'
  };
  const [instructions, policySource, schemaSource, validatorSource, fixturesSource, candidate, current] = await Promise.all([
    text(paths.instructions), text(paths.policy), text(paths.schema), text(paths.validator), text(paths.governedFixtures), json(paths.candidate), json(paths.current)
  ]);
  const policy = JSON.parse(policySource);
  const governedFixtures = JSON.parse(fixturesSource);
  invariant(instructions.includes('## Fresh-contributor path') && instructions.includes('candidate_not_deployed'), 'durable fresh-contributor instructions are incomplete');
  invariant(schemaSource.includes('p5-m58-change-packet/v1') && schemaSource.includes('contributor_actor_ids'), 'portable change-packet schema is incomplete');
  invariant(policy.schema_version === 'p5-m58-editorial-workflow-policy/v1', 'fresh session received incompatible workflow policy');
  invariant(candidate.candidateId === 'P5-M5.9-REMEDIATION-v1' && current.candidateRecord === paths.candidate, 'fresh session candidate selector drift');

  const sourceTree = git('rev-parse', `${sourceRevision}^{tree}`);
  const sourceDigest = sha256('MAT-397 clean-process disposable editorial source');
  const packet = {
    schema_version: 'p5-m58-change-packet/v1',
    issue: 'MAT-397',
    change_id: `fresh-process-${sourceRevision.slice(0, 12)}`,
    exact_bases: {
      content: candidate.exactBases.content,
      lean: candidate.exactBases.lean,
      site: candidate.exactBases.site,
      mathlib: candidate.exactBases.mathlib
    },
    actors: [
      { actor_id: 'fresh-process-author', roles: ['canonical_english_author'] },
      { actor_id: 'fresh-process-math-reviewer', roles: ['mathematical_editorial_reviewer'] },
      { actor_id: 'fresh-process-release-coordinator', roles: ['release_coordinator'] }
    ],
    attribution: {
        source_references: ['src:mat397:fresh-process'],
      contributor_actor_ids: ['fresh-process-author', 'fresh-process-math-reviewer', 'fresh-process-release-coordinator']
    },
    change_families: ['editorial', 'publication_candidate'],
    authority_mutations: [
      { fact_family: 'editorial', repository: 'formal-math-curriculum/content' }
    ],
    editorial_changes: [
      {
        content_id: 'cnt:p5m58:fresh-process',
        from: 'in_review',
        to: 'current_reviewed',
        author_id: 'fresh-process-author',
        reviewer_id: 'fresh-process-math-reviewer',
        review_decision: 'approved',
        source_refs: ['src:mat397:fresh-process'],
        result_source_sha256: sourceDigest
      }
    ],
    publication_changes: [
      {
        candidate_id: 'P5-M5.9-REMEDIATION-v1',
        from: 'draft',
        to: 'candidate_not_deployed',
        coordinator_id: 'fresh-process-release-coordinator',
        candidate_selector: 'validation/m5-8-current.json',
        preview_only: true
      }
    ],
    deployment_authorized: false
  };
  const errors = validateChangePacket(policy, packet);
  const governedFixtureHashes = new Set(governedFixtures.cases.map(entry => sha256(JSON.stringify(entry.packet))));
  const packetSha256 = sha256(JSON.stringify(packet));
  if (governedFixtureHashes.has(packetSha256)) errors.push('fresh process reused a governed workflow fixture');

  return {
    schemaVersion: 'p5-m5.8-fresh-session-report/v1',
    issue: 'MAT-397',
    status: errors.length ? 'failed' : 'fresh_process_completed',
    exactSubject: {
      siteRevision: sourceRevision,
      siteTree: sourceTree,
      contentRevision: candidate.exactBases.content,
      leanRevision: candidate.exactBases.lean,
      mathlibRevision: candidate.exactBases.mathlib
    },
    execution: {
      processIsolation: 'separate_node_process',
      durableInputsOnly: [paths.instructions, paths.policy, paths.schema, paths.validator, paths.governedFixtures, paths.candidate, paths.current],
      canonicalMutation: false,
      organizationalIndependenceClaimed: false,
      proceduralRoleSeparation: true,
      publicationState: 'candidate_not_deployed',
      deploymentAuthorized: false
    },
    packet: {
      changeId: packet.change_id,
      packetSha256,
      sourceDigest,
      actorIds: packet.actors.map(actor => actor.actor_id),
      contributorActorIds: packet.attribution.contributor_actor_ids,
      sourceReferences: packet.attribution.source_references,
      exactBases: packet.exact_bases,
      reusedGovernedFixture: governedFixtureHashes.has(packetSha256)
    },
    sourceRecords: {
      instructions: { path: paths.instructions, sha256: sha256(instructions) },
      policy: { path: paths.policy, sha256: sha256(policySource) },
      schema: { path: paths.schema, sha256: sha256(schemaSource) },
      validator: { path: paths.validator, sha256: sha256(validatorSource) },
      governedFixtures: { path: paths.governedFixtures, sha256: sha256(fixturesSource) }
    },
    errors,
    deploymentAuthorized: false
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runM58FreshSession();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report)}\n`);
  else console.log(`validated M5.8 clean-process contributor packet; ${report.status}; organizational_independence_claimed=false`);
  if (report.errors.length) process.exitCode = 1;
}
