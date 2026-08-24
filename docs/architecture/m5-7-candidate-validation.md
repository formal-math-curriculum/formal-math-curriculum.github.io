# M5.7 integrated candidate validation

MAT-377 validates the static-search and relation-navigation cores together without changing either implementation. The frozen core subject is website commit `6adab87f4feaba4c957df189936fbe0dd1e726b8`, tree `01e0277a7996d39cc193cc603cc20f8a94946b8d`. A source-diff gate rejects any MAT-377 change outside the validation record, selector, validator, tests, this document and package pipeline wiring.

## Evidence layers

The integrated candidate gate consumes the exact M5.6 bundle and independently regenerates both M5.7 models and scale fixtures. It rejects drift from the frozen search, relation, content, selector, generated-dependency, Lean project, Lean core and mathlib fingerprints.

The browser layer combines four executed reports:

| Surface | Rows | Purpose |
| --- | ---: | --- |
| M5.5 shared interaction baseline | B01–B30 | keyboard, focus, responsive, forced-colors, reduced-motion and no-JavaScript regressions |
| M5.7 global search | D01–D20 | realistic queries, filters, empty/failure states, 320 px, privacy and bounded latency |
| M5.7 relation navigation | R01–R14 and A01–A08 | typed graph/list semantics, invalid/stale cases, route continuity and accessible enhancement |
| M5.6 integrated slice | M01–M15 and P01–P05 | route, locale, projection, privacy and throttled representative-page budgets |

All 92 rows are required in CI. Source presence is not execution evidence: each report must declare the exact schema, contain every expected row once, have zero failures and match the current candidate revision where the report owns that field. Screenshot hashes and report hashes are recorded in the generated integrated report.

The artifact layer checks the 15 learner pages, 42 Pagefind-indexed pages, seven public search filters, eight typed relation systems, 16 Course placements, validation-route exclusions and the absence of reserved T1/T2 identifiers from learner HTML, Pagefind and the sitemap. Pagefind remains within the adopted 90-file/800,000-byte envelope. Its content-addressed shards may partition differently between clean builds, so semantic row/fingerprint equality and the actual packaged path/byte/SHA-256 manifest are the integrity claims; byte-identical directory layout is not claimed.

## Failure and audit policy

Stale or incompatible content, selector, formal dependency, Lean project/core/mathlib, schema, route and graph mutations fail closed in the existing negative suites. Missing Pagefind, unknown filters, self-edges, cycles, dangling IDs, invalid relation conversion, unsafe markup and external runtime requests are also exercised.

MAT-377 does not repair a core defect in place. A failed integrated row becomes a versioned finding with severity, exact reproduction, affected claim, owner and requalification criteria. A coherent candidate requires zero unresolved Blocker and zero unresolved Material validation failures. MAT-388 receives the immutable candidate and attempts to falsify it independently; MAT-394 owns any later remediation.

The selector `validation/m5-7-current.json` is an audit navigation pointer, not the production release selector. It does not alter `validation/m5-6-current.json`, authorize GitHub Pages, claim a full course, claim Portuguese or external-taxonomy coverage, or establish manual screen-reader/cross-engine conformance.

## Reproduction

Use the pinned Node 24.19.0 and pnpm 11.23.0 environment, check out the exact content commit into `.inputs/content`, and run `pnpm build` with `FMC_REQUIRE_BROWSER=1`, an identifiable Chromium executable and the exact candidate revision. The final pipeline writes `_validation/m5-7-integrated-candidate-v1.json` before the package manifest is sealed.
