# Formal Mathematics Curriculum website

Static Astro + Starlight source for the bounded course candidate. Authoritative
content and Lean facts are validated inputs; generated routes, projection menus,
and Pagefind indexes are disposable build outputs.

## Pinned environment

- Node 24.19.0
- pnpm 11.23.0
- Astro 7.2.4
- Starlight 0.41.7
- Pagefind 1.5.2
- Playwright Core 1.62.1 (validation only; runner-installed Chrome version is recorded)

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
CONTENT_INPUT_DIR=.inputs/content pnpm build
```

The M5.5 design-system baseline adds four semantic themes, bounded typography,
one validated preference store, forced-colors/reduced-motion behavior, and global
preference controls through documented Starlight component overrides. See
`docs/architecture/preferences.md`.

The MAT-360 baseline adds a validated, progressively enhanced mathematical block for
rendered/LaTeX/Lean representations, local overrides, exact copy behavior and explicit
state/provenance. See `docs/architecture/representation-block.md`.

The MAT-416 baseline adds a validated, progressively enhanced five-projection outline
navigator with native disclosure navigation, a shared wide/narrow semantic surface,
ephemeral search/filter/expansion context and fail-closed projection states. See
`docs/architecture/outline-navigator.md`.

The MAT-375 candidate gate mounts those surfaces together on a synthetic noindex route
and runs required Chromium interaction/accessibility/responsive evidence before the
artifact is hashed. See `docs/architecture/m5-5-candidate-validation.md`.

MAT-361 consumes the exact MAT-362 content merge and publishes a representative M5.6
candidate: 15 canonical English content routes, derived bounded formal routes, three
deep Course branches, ten populated representation blocks, one closed-by-default
exercise solution, a deterministic global search, page-centered five-projection
outlines, source links and explicit recovery states. It is not a full-course,
Portuguese-translation, external-mapping, accessibility-conformance, deployment or
release-qualification claim. See `docs/architecture/m5-6-vertical-slice.md`.

`inputs.lock.json` freezes every cross-repository subject and all five governed M5.6
outputs. The build refuses a different checkout, tree, validator/generator hash,
output hash, schema version or source identity.
PR CI produces a seven-day `site-preview` artifact; production Pages deployment
remains the separately governed manual workflow.
