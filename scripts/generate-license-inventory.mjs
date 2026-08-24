import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageStore = resolve(repositoryRoot, 'node_modules/.pnpm');
const outputPaths = {
  inventory: resolve(repositoryRoot, 'generated/licenses/software-dependencies.json'),
  notices: resolve(repositoryRoot, 'THIRD_PARTY_NOTICES.md'),
  texts: resolve(repositoryRoot, 'THIRD_PARTY_LICENSES.txt')
};
const approvedLicenses = new Set([
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MPL-2.0',
  'Python-2.0'
]);
const licenseName = /^(licen[sc]e|copying|notice|thirdpartynotices)(?:$|[._-])/iu;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value) {
  return value.replace(/\r\n?/gu, '\n').replace(/[ \t]+$/gmu, '').trimEnd() + '\n';
}

function repositoryUrl(metadata) {
  const value = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  return value ?? null;
}

function repositoryIdentity(value) {
  if (!value) return null;
  return value
    .replace(/^git\+/u, '')
    .replace(/^git:\/\//u, 'https://')
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/^https:\/\/github\.com:/u, 'https://github.com/')
    .replace(/\.git$/u, '')
    .replace(/\/tree\/.*$/u, '')
    .replace(/\/$/u, '')
    .toLowerCase();
}

async function isDirectory(path) {
  return (await lstat(path).catch(() => null))?.isDirectory() === true;
}

async function isFile(path) {
  return (await lstat(path).catch(() => null))?.isFile() === true;
}

async function packageRoots() {
  invariant(await isDirectory(packageStore), 'node_modules/.pnpm is missing; run the frozen install first');
  const roots = new Map();
  for (const entry of (await readdir(packageStore)).sort()) {
    const modules = join(packageStore, entry, 'node_modules');
    if (!(await isDirectory(modules))) continue;
    for (const name of (await readdir(modules)).sort()) {
      const first = join(modules, name);
      const firstStat = await lstat(first);
      if (firstStat.isSymbolicLink() || !firstStat.isDirectory()) continue;
      const candidates = name.startsWith('@')
        ? (await readdir(first)).sort().map(child => join(first, child))
        : [first];
      for (const candidate of candidates) {
        const candidateStat = await lstat(candidate);
        if (candidateStat.isSymbolicLink() || !candidateStat.isDirectory()) continue;
        const metadataPath = join(candidate, 'package.json');
        if (!(await isFile(metadataPath))) continue;
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        const id = `${metadata.name}@${metadata.version}`;
        if (!roots.has(id)) roots.set(id, { id, root: candidate, metadata });
      }
    }
  }
  return [...roots.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function collectNamedFiles(root) {
  const found = [];
  async function collect(path, depth) {
    for (const name of (await readdir(path)).sort()) {
      const child = join(path, name);
      const entry = await lstat(child);
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile() && (depth > 0 || licenseName.test(name))) found.push(child);
      if (entry.isDirectory() && depth < 2) await collect(child, depth + 1);
    }
  }
  for (const name of (await readdir(root)).sort()) {
    if (!licenseName.test(name)) continue;
    const candidate = join(root, name);
    const entry = await lstat(candidate);
    if (entry.isFile()) found.push(candidate);
    if (entry.isDirectory()) await collect(candidate, 1);
  }
  return found;
}

function snapshotKey(name, reference) {
  const value = typeof reference === 'string' ? reference : reference?.version;
  invariant(typeof value === 'string', `invalid lock reference for ${name}`);
  if (value.startsWith('npm:')) {
    const alias = value.match(/^npm:(@?[^@]+)@(.*)$/u);
    invariant(alias, `invalid npm alias for ${name}`);
    return `${alias[1]}@${alias[2]}`;
  }
  return `${name}@${value}`;
}

function reachableSnapshots(lock, roots) {
  const snapshots = lock.snapshots ?? {};
  const pending = [...roots];
  const reached = new Set();
  while (pending.length > 0) {
    const key = pending.pop();
    if (reached.has(key)) continue;
    reached.add(key);
    const snapshot = snapshots[key];
    invariant(snapshot, `lock snapshot is missing: ${key}`);
    for (const [name, reference] of Object.entries({
      ...(snapshot.dependencies ?? {}),
      ...(snapshot.optionalDependencies ?? {})
    })) pending.push(snapshotKey(name, reference));
  }
  return reached;
}

function unpeeredId(snapshot) {
  return snapshot.replace(/\(.*/u, '');
}

async function makeInventory() {
  const [lockSource, packageSource, packages] = await Promise.all([
    readFile(resolve(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'),
    readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
    packageRoots()
  ]);
  const lock = parse(lockSource);
  const packageJson = JSON.parse(packageSource);
  const importer = lock.importers?.['.'];
  invariant(importer, 'root lock importer is missing');
  const production = reachableSnapshots(
    lock,
    Object.entries(importer.dependencies ?? {}).map(([name, reference]) => snapshotKey(name, reference))
  );
  const all = reachableSnapshots(
    lock,
    Object.entries({ ...(importer.dependencies ?? {}), ...(importer.devDependencies ?? {}) })
      .map(([name, reference]) => snapshotKey(name, reference))
  );
  const productionIds = new Set([...production].map(unpeeredId));
  const allIds = new Set([...all].map(unpeeredId));

  const bundled = new Map();
  for (const item of packages) bundled.set(item.id, await collectNamedFiles(item.root));
  const byRepository = new Map();
  for (const item of packages) {
    const identity = repositoryIdentity(repositoryUrl(item.metadata));
    if (!identity || bundled.get(item.id).length === 0) continue;
    const list = byRepository.get(identity) ?? [];
    list.push(item);
    byRepository.set(identity, list);
  }

  const texts = new Map();
  const entries = [];
  for (const item of packages) {
    const { id, metadata } = item;
    invariant(allIds.has(id), `installed package is outside the frozen lock closure: ${id}`);
    invariant(typeof metadata.license === 'string' && approvedLicenses.has(metadata.license), `unapproved or undeclared license for ${id}`);
    let sources = bundled.get(id);
    let textStatus = 'bundled';
    let sourcePackage = item;
    if (sources.length === 0) {
      const candidates = byRepository.get(repositoryIdentity(repositoryUrl(metadata))) ?? [];
      const sameVersion = candidates.find(candidate => candidate.metadata.version === metadata.version);
      sourcePackage = sameVersion ?? candidates[0] ?? item;
      sources = sourcePackage === item ? [] : bundled.get(sourcePackage.id);
      textStatus = sources.length > 0 ? 'same_repository_fallback' : 'metadata_only';
    }
    const textRefs = [];
    for (const source of sources) {
      const content = normalizeText(await readFile(source, 'utf8'));
      const digest = sha256(content);
      const label = `${sourcePackage.id}:${relative(sourcePackage.root, source).split(sep).join('/')}`;
      const record = texts.get(digest) ?? { sha256: digest, content, sources: new Set(), packages: new Set() };
      record.sources.add(label);
      record.packages.add(id);
      texts.set(digest, record);
      textRefs.push({ sha256: digest, source: label });
    }
    entries.push({
      id,
      name: metadata.name,
      version: metadata.version,
      scope: productionIds.has(id) ? 'public_build_input' : 'build_test_only',
      license: metadata.license,
      repository: repositoryUrl(metadata),
      homepage: metadata.homepage ?? null,
      license_text_status: textStatus,
      license_texts: textRefs.sort((a, b) => a.source.localeCompare(b.source))
    });
  }

  const metadataOnly = entries.filter(entry => entry.license_text_status === 'metadata_only');
  const countsByLicense = Object.fromEntries(
    [...approvedLicenses].sort().map(license => [license, entries.filter(entry => entry.license === license).length])
      .filter(([, count]) => count > 0)
  );
  const countsByScope = Object.fromEntries(
    ['public_build_input', 'build_test_only'].map(scope => [scope, entries.filter(entry => entry.scope === scope).length])
  );
  const inventory = {
    schema_version: 'p5-m5.8-software-license-inventory/v1',
    subject: 'exact installed linux-x64-glibc dependency graph used by the Ubuntu 24.04 static build',
    package_manager: packageJson.packageManager,
    node_version: packageJson.engines.node,
    lockfile_sha256: sha256(lockSource),
    package_json_sha256: sha256(packageSource),
    lock_counts: {
      packages: Object.keys(lock.packages ?? {}).length,
      snapshots: Object.keys(lock.snapshots ?? {}).length,
      installed_unique_name_versions: entries.length,
      excluded_platform_or_optional_name_versions: Object.keys(lock.packages ?? {}).length - entries.length
    },
    counts_by_scope: countsByScope,
    counts_by_license: countsByLicense,
    metadata_only_count: metadataOnly.length,
    release_gate: metadataOnly.length === 0 ? 'eligible_for_human_review' : 'blocked_missing_bundled_license_text',
    packages: entries
  };

  const noticeRows = entries.map(entry => {
    const textsForPackage = entry.license_texts.map(text => `\`${text.sha256.slice(0, 12)}\``).join(', ') || '—';
    return `| \`${entry.id}\` | ${entry.scope} | ${entry.license} | ${entry.license_text_status} | ${textsForPackage} |`;
  });
  const notices = normalizeText(`# Third-party notices\n\nThis inventory is generated from the frozen pnpm install for the Linux x64 glibc build target. \`public_build_input\` is a conservative classification: the package can affect generated public output, but this does not assert that every package is copied verbatim into the static site. The site has no Node.js production runtime.\n\nA \`metadata_only\` row is not silently accepted. Public release remains blocked until the package's source archive has supplied and a reviewer has verified the applicable license/copyright text. Full captured texts are deduplicated in \`THIRD_PARTY_LICENSES.txt\`; the machine-readable authority is \`generated/licenses/software-dependencies.json\`.\n\n- Frozen lock packages: ${inventory.lock_counts.packages}\n- Frozen lock snapshots: ${inventory.lock_counts.snapshots}\n- Installed unique package versions: ${entries.length}\n- Platform/optional alternatives not installed: ${inventory.lock_counts.excluded_platform_or_optional_name_versions}\n- Metadata-only blockers: ${metadataOnly.length}\n\n| Package | Scope | SPDX expression | Text status | Text SHA-256 prefixes |\n|---|---|---|---|---|\n${noticeRows.join('\n')}\n`);

  const textSections = [...texts.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)).map(record => [
    '='.repeat(80),
    `SHA-256: ${record.sha256}`,
    `Packages: ${[...record.packages].sort().join(', ')}`,
    `Sources: ${[...record.sources].sort().join(', ')}`,
    '='.repeat(80),
    '',
    record.content.trimEnd(),
    ''
  ].join('\n'));
  const licenseTexts = normalizeText(`THIRD-PARTY LICENSE AND NOTICE TEXTS\n\nGenerated from the exact frozen Linux x64 glibc dependency install. Identical texts are stored once and mapped to every package above each section. Packages marked metadata_only in THIRD_PARTY_NOTICES.md have no captured text and block public release.\n\n${textSections.join('\n')}`);
  return {
    [outputPaths.inventory]: `${JSON.stringify(inventory, null, 2)}\n`,
    [outputPaths.notices]: notices,
    [outputPaths.texts]: licenseTexts
  };
}

export async function generateLicenseInventory({ check = false } = {}) {
  const outputs = await makeInventory();
  for (const [path, expected] of Object.entries(outputs)) {
    if (check) {
      const actual = await readFile(path, 'utf8').catch(() => null);
      invariant(actual === expected, `${relative(repositoryRoot, path)} is stale; run pnpm licenses:generate`);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, expected);
    }
  }
  return JSON.parse(outputs[outputPaths.inventory]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const inventory = await generateLicenseInventory({ check });
  console.log(`${check ? 'verified' : 'generated'} ${inventory.packages.length} dependency license records; ${inventory.metadata_only_count} metadata-only release blockers`);
}
