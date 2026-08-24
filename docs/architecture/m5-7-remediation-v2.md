# M5.7 remediation and requalification v2

MAT-394 preserves the immutable MAT-388 audit and remediates all five Material findings against audit subject `4b7e4e989ae4297ef2f09549e678f731fccfc1e7`, tree `264f78b5fbea33272096aab4b08dc24417690cd7`. The source decision is recorded in Linear document `80ead78d-3298-40ee-b785-69c88665f691`; the immutable findings remain in document `1f3d98e5-677f-40e0-8faf-d9a18c611473`.

## Relevance evidence

`src/lib/m5-7-relevance.mjs` owns the validation-only graded G01–G20 judgment set. The production client applies a query-independent, bounded content-kind prior after exact identity matching and Pagefind scoring; it does not import the judgments or special-case their query strings. The browser requalification records result identities and order plus MRR, recall@5 and nDCG@5 for every graded query. Every graded query requires MRR 1, recall@5 1 and nDCG@5 at least 0.75; the three aggregate means must each be at least 0.90. G12 explicitly requires `cnt:p5m56:000009` ahead of `cnt:p5m56:000010`, closing the ranking defect even when Pagefind's raw score prefers the example.

## Isolated scale runtime

The validation build creates 2,000 static search documents and a 2,200-placement relation payload outside `dist`. A noindex route mounts the production search component against that index and a bounded relation renderer against the payload. Browser rows measure a throttled cold query, 20-query warm p95, 20 relation query/filter interactions, DOM bounds, long tasks, heap observation, exact bytes and external requests. The generated source and runtime payloads establish neither public coverage nor release content; the public release preparation removes all `dist/validation` routes.

## Pagefind reproducibility policy v2

The MAT-388 audit demonstrated that byte-identical Pagefind directory trees are not a valid invariant for the pinned generator: two equal clean inputs produced different content-addressed bytes. `P5-M5.7-PAGEFIND-REPRODUCIBILITY-v2` therefore requires exact source/model/runtime inputs; zero validation-fixture leakage; identical governed G01–G20 result identities, order and metrics across the compared clean builds; and an exact path/byte/SHA-256 manifest for each produced tree. Directory-byte differences are reported, never silently treated as identity. Source JSON and deterministic fixture fingerprints retain their byte-deterministic requirements.

## Pipeline and decision boundary

Both CI and the dormant Pages workflow check out full repository history so ancestry and the exact immutable audit tree can be verified. CI requires the prior 92 browser rows and the 29-row remediation report, for 121 acceptance rows, plus all artifact gates and Node tests. A successful required CI run qualifies M5.8 operational-governance readiness with zero unresolved Blocker or Material findings.

This decision does not authorize public deployment, expand the governed 15-page slice, claim Portuguese or external-taxonomy payload coverage, or establish manual screen-reader or cross-engine conformance. `validation/m5-7-current.json` remains a discovery-candidate selector and is not consumed by the production release gate.
