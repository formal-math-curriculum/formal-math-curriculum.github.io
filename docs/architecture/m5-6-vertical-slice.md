# M5.6 learner-facing vertical slice

## Decision and exact input

MAT-361 consumes `formal-math-curriculum/content` commit
`2da8fdb43074d00fea5fc6201d239e5f26a43250`, tree
`d51b0c7cfe44feec2b6eb176fd6ce1825a8ab458`. The input lock covers the validator,
generator, content manifest, publication, outline, search and provenance file hashes.
Ingestion executes the source-owned validator and rejects stale revisions, missing
files, schema drift or any incompatible hash before Astro sees the bundle.

The site does not copy an editable content mirror. Disposable files under
`.generated/content/m5-6/` are exact build inputs derived from the pinned content
checkout. Public `_provenance/input.json` records the consumed revision, tree, selector,
formal dependency and observed hashes.

## Learner experience

The build generates 15 English canonical pages under stable route keys. A shared shell
provides:

* a deterministic global search over the governed search index;
* the M5.5 five-projection outline, centered on the current page;
* Course menu search, universal and structural filters, and Expand all / Collapse all;
* responsive native-dialog outline behavior inherited from the adopted navigator;
* persisted/reset theme, typography, representation and projection preferences;
* previous/next Course navigation, source links and bounded release metadata;
* explicit language, external-classification and correspondence states.

The Course projection preserves three authored branches and the repeated review
placement of `cnt:p5m56:000006`. Exercise-only filtering returns both placements but
one canonical route. Combined Module and Unit structural filtering narrows a branch
without changing content identity.

Ten governed blocks adapt to the M5.5 representation contract. Rendered text uses the
qualified-equivalent mode; LaTeX and Lean payloads preserve exact source bytes. Every
block exposes its FART/FLOC/FLINK tuple and exact repository revision. The exercise
solution is inside a closed native disclosure and retains all three checkpoints.

Lean projection artifact and module links resolve to bounded derived record pages. A
derived record is navigation/provenance material only; it does not create or supersede
formal authority.

## Failure and locale behavior

No `/pt/` route or Portuguese `hreflang` is emitted. The 404 page explains the locale
boundary and returns to the English course without silently redirecting. Empty global
search and unavailable external/Lean projections remain explicit. Missing, stale and
incompatible build inputs fail closed in ingestion tests.

## Current primary references revalidated

* Astro static dynamic routes use `getStaticPaths`: https://docs.astro.build/en/guides/routing/
* Pagefind content scoping and `data-pagefind-body`: https://pagefind.app/docs/indexing/
* Pagefind metadata behavior: https://pagefind.app/docs/metadata/
* W3C ARIA Authoring Practices patterns and keyboard semantics: https://www.w3.org/WAI/ARIA/apg/patterns/

The implementation uses native details/disclosure semantics for global search and the
exercise, and retains the already-qualified native dialog behavior for the narrow
outline. Navigation and footer regions are excluded from Pagefind indexing so repeated
chrome does not pollute learner searches.

## Reproduction

Use Node 24.19.0 and pnpm 11.23.0, then run:

```sh
pnpm install --frozen-lockfile
CONTENT_INPUT_DIR=.inputs/content pnpm build
```

The build validates source boundaries, all unit/contract tests, exact content
ingestion, 15 learner routes and derived formal routes, the retained M5.5 Chromium
qualification, Pagefind output and the bounded artifact manifest.

## Non-claims and next owner

MAT-361 does not authorize deployment, claim a full course, prove Portuguese
translation completeness, ingest external taxonomy payloads, execute Lean remotely or
claim manual screen-reader/cross-engine accessibility conformance. MAT-376 owns clean-
input end-to-end M5.6 qualification. Selector, route, Course-reference, readiness or
formal-binding changes return to MAT-346/MAT-362 before site adoption.
