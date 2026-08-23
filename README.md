# Formal Mathematics Curriculum website

Static Astro + Starlight source for the bounded public course. Authoritative
content and Lean facts are validated inputs; generated routes, projection menus,
and Pagefind indexes are disposable build outputs.

## Pinned environment

- Node 24.19.0
- pnpm 11.23.0
- Astro 7.2.4
- Starlight 0.41.7
- Pagefind 1.5.2

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
CONTENT_INPUT_DIR=.inputs/content pnpm build
```

This bootstrap contains no production course corpus, external taxonomy snapshot,
Portuguese translation, or release qualification.

`inputs.lock.json` freezes every cross-repository subject. The build refuses a
different checkout, source hash, schema version, or unqualified content manifest.
PR CI produces a seven-day `site-preview` artifact; production Pages deployment is
manual until MAT-374 qualifies repository Pages settings, HTTPS, and the root URL.
