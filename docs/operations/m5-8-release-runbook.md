# M5.8 release, retention, rollback, and privacy runbook

The machine-readable authority is `operations/m5-8/release-policy.json`. This runbook explains how to apply it; it does not authorize deployment. MAT-367 intentionally remains in `policy_defined_no_candidate`, and the existing release selector must independently authorize any future Pages dispatch.

## Candidate and release identity

Use SemVer. A reviewable candidate is `p5-web-vX.Y.Z-rc.N`; a published release is `p5-web-vX.Y.Z`. Never reuse a candidate tag after any site, content, schema, generator, validator, dependency, or runner input changes. Keep the six `CHANGELOG.md` sections even when a section says `None`.

Before tagging, materialize one atomic release tuple containing every field named by `release_tuple.required_fields`. Resolve `site_revision` only after the candidate commit exists. Reject partial, mixed, stale, or schema-incompatible tuples; do not infer missing values from a branch name or mutable URL.

## Qualification and durable assets

1. Run the frozen install and all content, licensing, operations, unit, ingestion, static-build, browser, search, scale, artifact, and candidate checks on the exact tuple.
2. Confirm that `generated/licenses/software-dependencies.json` has no `metadata_only` records and that every content snapshot projected publicly is explicitly eligible. The current inventory has nine metadata-only blockers, so it is not release-eligible.
3. Create a draft GitHub Release. Attach `site-dist.tar.zst`, `release-tuple.json`, the software inventory, both third-party notice files, and `SHA256SUMS`.
4. Independently verify every SHA-256 digest and the required attestation before publishing.
5. Publish as an immutable release only after review. The release tag and assets then become durable authority; do not replace them.

The seven-day `site-preview-*` Actions artifact is diagnostic and disposable. Actions artifacts and logs expire (the policy bounds logs to 90 days) and must never be the sole release, provenance, recovery, or rollback source.

## Manual deployment

Deployment is a separate decision. Only after an exact candidate is qualified may a reviewed release record set `deploymentAuthorized` to `true` with zero Blocker and Material findings. Merge that record through a PR, verify the default branch, then manually dispatch `Deploy qualified artifact to Pages`. Do not dispatch from a topic branch and do not bypass `prepare-release.mjs`.

Record the release URL and tag, full tuple, checksums, attestation, workflow run, Pages environment, deployed URL, HTTPS result, root-route checks, and known limitations. A green workflow alone is not a public conformance claim.

## Rollback and failure recovery

Rollback restores a complete previously qualified tuple through a new reviewed PR, rebuild, decision record, and manual dispatch. Never force-move `main` or an immutable release tag; never mix the former site revision with newer content or tooling; never redeploy a preview artifact.

- Hash, schema, license, or input failure: stop. Restore the exact authority or qualify a new candidate.
- Build or browser failure: retain diagnostic logs while available, reproduce with the frozen tuple, and repair on a branch.
- GitHub Release asset/digest failure: keep the release draft, replace the incomplete draft assets, and repeat verification before publication.
- Pages, environment, OIDC, HTTPS, or route failure: stop deployment, correct configuration through review, and dispatch a newly recorded attempt.
- Fault in an immutable release: mark it superseded in a new release; preserve its tag and evidence.

## Redirects and deprecation

A redirect table may contain at most eight raw edges, no cycles, and must collapse to one terminal hop. Ambiguous mappings serve a recovery page listing canonical choices. A removed identifier serves a deprecation page naming the last qualified version. Redirect changes require the same fixtures and candidate qualification as navigation changes.

## Privacy boundary

The static site has no application analytics, optional tracking, cookies, or accounts. It stores only the versioned preference key `formal-math-curriculum:preferences:v1`. Provider operational logs are infrastructure records, not application analytics. Because there is no optional tracking, no consent banner is shown. Both CI and deployment set `ASTRO_TELEMETRY_DISABLED=1`; adding telemetry, analytics, cookies, accounts, or another storage key requires a new policy, privacy review, fixtures, and candidate.
