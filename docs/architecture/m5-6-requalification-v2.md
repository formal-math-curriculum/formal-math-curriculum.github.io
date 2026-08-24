# M5.6 remediation and requalification v2

This record is the versioned correction to the M5.6 candidate audited in the immutable Linear document `cecc72c7-49de-4c24-8ed9-5b0b22a58a31`. It does not edit, relabel or supersede the audit history. The exact correction subject is built from website entry revision `56d898b40823db17d92164cfdc93a0fb9d7a175b` and governed content revision `2da8fdb43074d00fea5fc6201d239e5f26a43250`.

## Remediation ledger

| Finding | Severity | Correction | Required requalification |
| --- | --- | --- | --- |
| A01 | Blocker | Consume the content-owned `synthetic-m5-6-v1` fixture and expose `/validation/m5-6/` with explicit noindex/non-coverage boundaries. | M01–M03 and artifact leakage checks |
| A02 | Material | Add a mandatory M5.6 Chromium program to the exact CI build. | M01–M15 with `FMC_REQUIRE_BROWSER=1` |
| A03 | Material | Derive semantic MathML deterministically from each exact governed LaTeX source and retain the source annotation. | M08, M09, M14 and exact artifact comparisons |
| A04 | Material | Add five bounded, throttled performance rows with byte and navigation timing budgets. | P01–P05 |
| A05 | Material | Resolve every governed unavailable Portuguese path to the same English content identity and distinguish unknown paths/locales. | M11–M13 and static all-pair checks |
| A06 | Material | Render `license_state` whenever the governed source record supplies it. | source/page coverage check |
| A07 | Material | Derive revisions, counts, consumed outputs, search labels and synthetic-route release removal from governed records. | evolution and regression tests |
| A08 | Minor | Remove the unused unordered Pagefind filter metadata, then remove stale output before a bounded single-threaded index build. | two clean-build comparison |

No finding is removed from history. The corrected selector points to `validation/m5-6-requalification-v2.json`; it fails closed for deployment because `deploymentAuthorized=false`.

## Acceptance packet

The CI artifact must contain both `dist/_validation/m5-6-requalification-v2-report.json` and `dist/_validation/m5-6-requalification-artifact-v2.json`. The browser report owns M01–M15 and P01–P05. The artifact report owns governed cardinalities, route resolution, sitemap/search/canonical fixture exclusions, exact LaTeX-to-MathML evidence, license disclosure, locale pairs and internal links. Existing M5.5 B01–B30 qualification remains a regression input and runs in the same build.

The performance contract uses Chromium under 4× CPU throttling, 50 ms latency, 10 Mbps down and 5 Mbps up. It is a bounded regression signal, not a real-user percentile claim. Automated Chromium does not establish manual screen-reader or cross-engine conformance.

## M5.7 decision and fresh-session handoff

M5.7 discovery expansion is ready only after the exact PR and post-merge CI executions pass and their immutable artifact identities are recorded in Linear. “Ready” means work may discover and add governed content or adopted external snapshots. It does not authorize public deployment, claim a complete course or convert the synthetic projection fixture into production mappings.

A fresh session should start from the current selector, verify the exact content lock and CI artifact IDs, and reopen MAT-398 if a required row fails, the upstream selector changes, the artifact identity drifts or a new Blocker/Material finding appears.
