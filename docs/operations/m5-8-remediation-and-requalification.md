# M5.8 audit remediation and requalification

MAT-396 preserves `P5-M5.8-AUDIT-v1`, the v1 dogfood candidate, matrix and
executed reports as immutable history. The current selector advances to
`P5-M5.8-CANDIDATE-v2`; this is a new subject, not a relabeling of the audited
candidate. Deployment and public release remain unauthorized.

## Finding dispositions

`MAT385-F01` is corrected by binding D18 to the exact
`p5-m5.7-remediated-candidate-artifact/v2` schema and current source revision.
The evidence must state that hosted browsing was required, contain the exact
92 legacy plus 29 remediation rows, be M5.8-ready in successor mode, and keep
both candidate and report deployment authorization false. D19 and D20 prove
that stale revisions and unknown report schemas fail closed.

`MAT385-F02` is corrected without claiming a human usability study or
organizationally independent review. D01 starts a separate Node process that
reads the durable contributor instructions, policy, portable schema, candidate
and selector; constructs a unique, attributed packet in memory; exercises
distinct procedural author, reviewer and coordinator roles; and advances only
to `candidate_not_deployed`. It does not import or clone W01, mutate canonical
content, merge a change, publish a release or authorize deployment.

`MAT385-O01` remains explicit: the hosted preview has seven-day retention and
is not release/rollback authority. Exact artifact and report digests belong in
the qualification record. `MAT385-O02` also remains explicit: automated Chrome
evidence does not establish manual screen-reader or cross-engine conformance.

## Reproduce from a fresh checkout

1. Check out the exact candidate head and pinned content input. Verify the v2
   candidate base tuple rather than substituting mutable branch names.
2. Use Node 24.19.0 and pnpm 11.23.0 with the frozen lockfile.
3. Run `pnpm validate:m5-8-fresh-session`, `pnpm licenses:check`,
   `pnpm validate:m5-8-operations`, `pnpm test` and `pnpm check`.
4. Run `node scripts/run-m5-8-dogfood.mjs`. Local D18 is structurally deferred
   and the report must say `local_structural_evidence_only`.
5. On Ubuntu 24.04 with the identified Chrome, set `FMC_REQUIRE_BROWSER=1`,
   `FMC_SOURCE_REVISION` to the exact PR head and
   `FMC_RUNNER_IMAGE_LABEL=ubuntu-24.04`, then run `pnpm build`.
6. Inspect `dist/_validation/m5-8-fresh-session-v1.json` and
   `dist/_validation/m5-8-dogfood-report-v2.json`. The latter must pass 20/20
   cases and 12 negative controls, bind the 121-row report to the same head,
   dispose both Material findings, retain both observations and keep every
   deployment/public-release/coverage boundary false.

Any correction after qualification creates a successor candidate. Re-run on
authority, policy/schema, exact input, dependency, browser/runner, evidence
schema/provenance, locale, privacy, redirect, release-asset, audit-disposition
or selector changes.
