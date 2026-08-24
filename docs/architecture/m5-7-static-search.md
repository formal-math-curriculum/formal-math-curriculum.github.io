# M5.7 static search implementation

MAT-363 implements the bounded search portion of the M5.7 discovery freeze. It replaces the former 15-record substring list embedded in every page with one generated Pagefind 1.5.2 index. The implementation remains static: there is no backend, no external request at runtime, and no query or filter persistence.

## Governed result boundary

The built site contains 42 Pagefind-indexed pages because formal and outline pages retain their existing `data-pagefind-body` contract. Only the 15 canonical learner pages receive `fmc-result-kind=learner-content`. Every global-search request applies that filter unconditionally, so derived formal and projection pages cannot enter the result set.

Each learner page publishes exact metadata for title, content ID, kind, summary, identifiers, aliases, content revision and discovery fingerprint. Pagefind requires attribute captures on `<meta>` elements to use `key[content]`; the implementation uses that exact syntax for both metadata and filters. This follows the official [metadata](https://pagefind.app/docs/metadata/) and [filter](https://pagefind.app/docs/filtering/) contracts.

Seven user-selectable filter dimensions are derived from the governed publication bundle: content kind, editorial state, formal state, publication state, representation, locale and translation state. Filter choices are not hard-coded to the current corpus cardinalities. An eighth Pagefind filter, `fmc-result-kind`, is an internal result boundary and is never user-selectable.

## Relevance and rendering

The discovery model normalizes mathematical punctuation and the multiplication/multiply wording family before indexing. Exact title, content ID, curriculum candidate, FART/FLOC/FLINK, Lean declaration and module matches are then ordered deterministically before score/URL ties. Ranking uses the frozen Pagefind parameters and metadata weights from the MAT-347 decision.

Results are built with DOM nodes and `textContent`; snippets are never injected as HTML. A stale request sequence cannot overwrite newer results. If the Pagefind bundle or WASM cannot load, the component clears the result list, names the Course outline as the fallback, and explicitly states that it is showing no cached or invented results.

## Scale and qualification

The T2 scale generator deterministically creates 2,000 validation-only documents with all five mapping states and the three reserved judgment identifiers. It is exercised in Node tests but is never written into `dist` or the production Pagefind index.

Qualification has three layers:

1. Node tests validate the 15-document model, G01–G20 relevance judgments, filters, stable ordering, safe source boundaries and the deterministic T2 fixture.
2. Required Chromium rows D01–D20 validate the real generated Pagefind index, exact and natural-language queries, filters, empty/failure recovery, keyboard behavior, 320 CSS-pixel reflow, no-JavaScript fallback, privacy and a two-second loopback latency budget.
3. The artifact gate validates learner metadata, the seven public filter dimensions, the internal result boundary, Pagefind 1.5.2 files, fixture non-leakage and the browser report when CI requires it.

Pagefind 1.5.2 can partition identical filter data into different content-addressed shard sets across builds. MAT-363 therefore does not pretend that a fixed Pagefind directory hash is a reproducibility guarantee. It enforces a bounded file/byte envelope and records the actual path, byte count and SHA-256 of every packaged file in the final artifact manifest. Semantic equivalence is guarded by the exact model fingerprint and D01–D20 browser rows; payload integrity is guarded by that per-build content-addressed manifest.

Automated Chromium evidence does not establish manual screen-reader or cross-engine conformance. The 15 pages remain a representative slice, and this implementation does not authorize public deployment. MAT-364 owns the next relation-graph implementation step.
