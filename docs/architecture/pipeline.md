# M5.4 deterministic publishing pipeline

`inputs.lock.json` is the single reviewed cross-repository input tuple. CI checks out
the content repository by immutable commit, verifies both consumed file hashes, runs
the source-owned validator, and only then materializes `.generated/content`.

The site build consumes the generated copy, emits public input provenance, builds the
English-root static site, creates Pagefind data, rejects symlinks and oversized output,
and records an artifact manifest. Pull requests upload the result for seven days as a
downloadable preview; a preview is not a publication claim.

The production workflow is manual until MAT-374 qualifies the repository Pages source,
the `github-pages` environment, root routing, and HTTPS. Its build job has only
`contents: read`; only the deploy job receives `pages: write` and OIDC `id-token: write`.
Deployments serialize in `pages-production` without cancelling an in-flight release.

The Lean and mathlib revisions in the lock are provenance context only. This bootstrap
does not check them out, execute Lean, or claim a published correspondence corpus.
