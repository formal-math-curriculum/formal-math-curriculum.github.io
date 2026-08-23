import { readFile } from 'node:fs/promises';

const ci = await readFile('.github/workflows/ci.yml', 'utf8');
const deploy = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
const lock = JSON.parse(await readFile('inputs.lock.json', 'utf8'));

const revision = lock.consumed.content.revision;
if (!ci.includes(`ref: ${revision}`) || !deploy.includes(`ref: ${revision}`)) throw new Error('workflow/content lock drift');
if (!ci.includes('contents: read') || /pull_request_target/.test(ci)) throw new Error('unsafe CI authority');
if (!deploy.includes('workflow_dispatch:') || /\n  push:/.test(deploy)) throw new Error('production deployment must retain a manual gate');
if (!deploy.includes('pages: write') || !deploy.includes('id-token: write')) throw new Error('Pages least privilege missing');
if (!deploy.includes('cancel-in-progress: false')) throw new Error('production deploy must serialize without cancellation');
if (!deploy.includes('environment:\n      name: github-pages')) throw new Error('Pages environment missing');
if (!ci.includes('actions/cache@caa296126883cff596d87d8935842f9db880ef25')) throw new Error('cache action drift');
if (!ci.includes('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f')) throw new Error('preview action drift');
if (!deploy.includes('actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128')) throw new Error('deploy action drift');

console.log('validated ingestion, CI, preview, Pages, permission, and concurrency contracts');
