# M5.8 dogfood and immutable audit handoff

MAT-379 integrates the content-owned editorial/translation/snapshot contracts with the site-owned licensing/release/privacy contract. Its source matrix is `validation/m5-8-dogfood-matrix-v1.json`; its candidate authority is `validation/m5-8-dogfood-candidate-v1.json`; `validation/m5-8-current.json` is the deployment-inert current selector.

## Reproduce from a fresh checkout

1. Check out the exact site candidate and its pinned content input. Confirm the site/content/Lean/mathlib commits in the candidate record rather than substituting branch names.
2. Install Node 24.19.0 and pnpm 11.23.0, then run the frozen install.
3. Run the content M5.8 workflow and snapshot validators, `pnpm licenses:check`, `pnpm validate:m5-8-operations`, and `pnpm test`.
4. On Ubuntu 24.04 with an identifiable Chrome, set `FMC_REQUIRE_BROWSER=1`, `FMC_SOURCE_REVISION` to the exact candidate commit and `FMC_RUNNER_IMAGE_LABEL=ubuntu-24.04`, then run `pnpm build`.
5. Inspect `dist/_validation/m5-8-dogfood-report-v1.json`. It must identify the exact source subject, pass 18/18 cases and ten negative controls, incorporate the 121-row hosted-browser report, contain no Blocker/Material findings, and retain false deployment/public-release authorization.

No case mutates canonical content, a release, a tag, Pages, or a public URL. Workflow packets and policy mutations are disposable fixtures. The release simulation intentionally stops at the existing independent authorization gate. The uploaded seven-day preview is diagnostic evidence only.

## Interpretation

Passing D01 shows that the durable content instructions and executable policy admit a correctly attributed, independently reviewed, preview-only change packet on the current bases. It does not claim that an actual editorial change was merged. D02/D03 demonstrate translation freshness mechanics but do not claim Portuguese coverage. D10 qualifies the recorded licensing state but does not create external taxonomy coverage. D18 adopts only the exact automated Chrome evidence and does not imply manual screen-reader or cross-engine conformance.

Nine dependency records still lack captured license text and block public release. OntoMathPRO, MSC2020 and arXiv remain in non-public snapshot states; OpenStax remains link/original-paraphrase only. These are retained limitations, not silently waived dogfood findings.

## Audit handoff

MAT-385 audits the integrated candidate and its executed CI report as immutable subjects. Do not repair a finding on the candidate branch or edit the executed report. Record findings with Blocker, Material, Minor or Observation severity and hand remediation to MAT-396. Re-run after any authority, policy/schema, exact input, dependency, browser/runner, locale, privacy, redirect, release-asset, audit disposition or selector change.
