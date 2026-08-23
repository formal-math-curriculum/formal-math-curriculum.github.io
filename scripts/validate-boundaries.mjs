import { access, readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const config = await readFile(new URL('../astro.config.mjs', import.meta.url), 'utf8');

const requiredPins = {
  astro: '7.2.4',
  '@astrojs/starlight': '0.41.7',
  pagefind: '1.5.2'
};
for (const [name, version] of Object.entries(requiredPins)) {
  if (pkg.dependencies[name] !== version) throw new Error(`${name} must be exactly ${version}`);
}
if (pkg.packageManager !== 'pnpm@11.23.0') throw new Error('pnpm pin mismatch');
if (pkg.engines.node !== '24.19.0') throw new Error('Node pin mismatch');
if (!config.includes("site: 'https://formal-math-curriculum.github.io'")) throw new Error('canonical site mismatch');
if (/\bbase\s*:/.test(config)) throw new Error('organization-root repository must not set Astro base');

for (const forbidden of ['dist', '.generated']) {
  try {
    await access(new URL(`../${forbidden}/authority.json`, import.meta.url));
    throw new Error(`${forbidden} must never contain an authority marker`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

console.log('validated source/generated and root-route boundaries');

