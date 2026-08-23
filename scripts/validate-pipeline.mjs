import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const exactActions = new Set([
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444',
  'actions/cache@caa296126883cff596d87d8935842f9db880ef25',
  'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f',
  'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
  'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128'
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sameObject(actual, expected) {
  const normalize = value => Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
}

function steps(workflow) {
  return Object.values(workflow.jobs ?? {}).flatMap(job => job.steps ?? []);
}

function actionSteps(workflow) {
  return steps(workflow).filter(step => step.uses);
}

export function validatePipeline({ ciSource, deploySource, lock }) {
  const ci = parse(ciSource);
  const deploy = parse(deploySource);
  const revision = lock.consumed?.content?.revision;

  invariant(lock.lock_version === 'm5.4-input-lock/v1', 'input lock version drift');
  invariant(/^[0-9a-f]{40}$/.test(revision ?? ''), 'content lock must be an immutable SHA');

  const ciEvents = Object.keys(ci.on ?? {}).sort();
  invariant(JSON.stringify(ciEvents) === JSON.stringify(['pull_request', 'push']), 'CI event contract drift');
  invariant(ci.on.push?.branches?.includes('main'), 'CI must validate main pushes');
  invariant(sameObject(ci.permissions, { contents: 'read' }), 'unsafe CI authority');
  invariant(ci.concurrency?.['cancel-in-progress'] === true, 'stale CI must be cancelled');

  const deployEvents = Object.keys(deploy.on ?? {});
  invariant(JSON.stringify(deployEvents) === JSON.stringify(['workflow_dispatch']), 'production deployment must retain a sole manual gate');
  invariant(sameObject(deploy.permissions, { contents: 'read' }), 'deploy workflow global authority drift');
  invariant(deploy.concurrency?.group === 'pages-production', 'production concurrency group drift');
  invariant(deploy.concurrency?.['cancel-in-progress'] === false, 'production deploy must not cancel in-flight work');
  invariant(deploy.jobs?.build && !deploy.jobs.build.permissions, 'build job must inherit read-only contents authority');
  invariant(sameObject(deploy.jobs?.deploy?.permissions, { pages: 'write', 'id-token': 'write' }), 'Pages least privilege missing');
  invariant(deploy.jobs?.deploy?.environment?.name === 'github-pages', 'Pages environment missing');
  invariant(deploy.jobs?.deploy?.needs === 'build', 'deploy must require the qualified build');

  for (const step of [...actionSteps(ci), ...actionSteps(deploy)]) {
    invariant(/^[^@\s]+@[0-9a-f]{40}$/.test(step.uses), `mutable or malformed action ref: ${step.uses}`);
    invariant(exactActions.has(step.uses), `unqualified action ref: ${step.uses}`);
  }

  for (const workflow of [ci, deploy]) {
    const checkout = steps(workflow).find(step => step.with?.repository === 'formal-math-curriculum/content');
    invariant(checkout, 'qualified content checkout missing');
    invariant(checkout.with.ref === revision, 'workflow/content lock drift');
    invariant(checkout.with.path === '.inputs/content', 'content checkout path drift');
    invariant(checkout.with['persist-credentials'] === false, 'content checkout must not persist credentials');
  }

  const preview = actionSteps(ci).find(step => step.uses.startsWith('actions/upload-artifact@'));
  invariant(preview?.with?.['retention-days'] === 7, 'preview retention drift');
  invariant(preview?.with?.['if-no-files-found'] === 'error', 'missing preview artifact must fail');
  const pagesArtifact = actionSteps(deploy).find(step => step.uses.startsWith('actions/upload-pages-artifact@'));
  invariant(pagesArtifact?.with?.path === 'dist', 'Pages artifact path drift');

  return true;
}

async function validateCurrentFiles() {
  const [ciSource, deploySource, lockSource] = await Promise.all([
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('.github/workflows/deploy-pages.yml', 'utf8'),
    readFile('inputs.lock.json', 'utf8')
  ]);
  validatePipeline({ ciSource, deploySource, lock: JSON.parse(lockSource) });
  console.log('semantically validated ingestion, CI, preview, Pages, permission, action, and concurrency contracts');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await validateCurrentFiles();
