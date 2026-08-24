# Pages release, rollback, and recovery

For the complete M5.8 versioning, durable-asset, retention, licensing, privacy, redirect, and deprecation contract, use [the M5.8 runbook](./m5-8-release-runbook.md). The shorter procedure below remains the Pages-specific operational checklist.

## Release gate

1. Require green PR CI and review the exact site head, content revision, artifact
   manifest, input provenance, and retained limitations.
2. Verify Pages is configured to use GitHub Actions and the `github-pages` environment
   grants only the intended deployment authority.
3. Dispatch `Deploy qualified artifact to Pages` from the integrated default branch.
4. Record workflow/run, deployment/environment, artifact, site URL, HTTPS result,
   root-route checks, and both exact revisions. A successful job alone is not a public
   conformance claim.

## Rollback

Create a scoped PR that reverts `main` to the last qualified site/input-lock pair. Run
the same CI, review the provenance diff, merge, and dispatch the production workflow.
Never move `main` directly and never redeploy an unrecorded local directory. Seven-day
preview artifacts are diagnostic only and are not durable rollback authorities.

## Failure recovery

- Input/hash/schema failure: do not bypass; update the lock through a reviewed PR or
  restore the exact input checkout.
- Build/artifact failure: retain logs, reproduce with the frozen lockfile, and repair on
  a branch.
- Pages settings, environment, OIDC, root route, or HTTPS failure: retain the build
  artifact and stop the release. Correct repository/environment configuration before a
  new dispatch.
- Interrupted deployment: concurrency queues the next dispatch; it does not cancel the
  in-flight production attempt.
