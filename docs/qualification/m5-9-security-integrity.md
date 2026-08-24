# M5.9 security and content-integrity qualification

MAT-370 executes the frozen `P5-M5.9-QUALIFICATION-FREEZE-v1` S01–S15 matrix against one immutable subject:

- site `23c76800ccd19dcc40f2b16c21297283fb2c7f20`, tree `7060d821d216655d762019f15e1ba7a18d18d078`;
- content `3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828`, tree `59d0e0c49851b534bf528e46dd6ce74f46173c6c`;
- Lean `3f1a315f438af37a327eaf8b9b9c1dbc6f409394` and mathlib `db584cd6d46c92f209a44c0f1c829460d327499d`;
- formal dependency fingerprint `f8c79c8d196952e4827c72d394039862935689b2e100f821697c41bad8cb1438`.

The qualification branch may change only this guide, the harness, its contract test, and the CI wiring. It does not remediate product findings, change governed inputs, authorize a release, or deploy the site.

## Authoritative execution

CI builds the exact static candidate, then runs:

```sh
FMC_REQUIRE_M59=1 \
FMC_SOURCE_REVISION="$GITHUB_SHA" \
FMC_RUNNER_IMAGE_LABEL=ubuntu-24.04 \
node scripts/validate-m5-9-security-integrity.mjs
```

The validator completes independent diagnostics, writes evidence under `dist/_validation/m5-9-security-v1/`, and exits nonzero when any row is failed, blocked, or not executed. CI deliberately captures that exit as a step outcome, uploads the artifact with `if: always()`, and only then enforces failure. This preserves evidence without turning a failed row green.

`FMC_M59_SKIP_NETWORK=1` and `FMC_M59_SKIP_RUNTIME=1` exist only for non-authoritative local diagnostics. They are rejected whenever `FMC_REQUIRE_M59=1` is set, and skipped rows cannot qualify the candidate.

## Evidence and decision rules

`report.json` records the candidate, harness-only diff, environment, all S01–S15 results, explicit non-deployment boundary, and primary references. `audit.json` records fresh production and development audit commands, counts, bounded advisory metadata, exit state, and output hashes. `manifest.json` hashes both evidence files and excludes itself.

A Blocker or Material failure keeps the qualification failed. In particular, the existing nine `metadata_only` dependency-license records are reported by S15 as a public-release Blocker even when the inventory mechanics are internally consistent. Therefore public release remains blocked until a separately governed remediation candidate supplies and requalifies the missing license evidence.

The build artifact can inspect generated HTML and same-origin loopback behavior. It cannot establish deployed GitHub Pages response headers, TLS behavior, cache behavior, or production redirect handling because deployment is explicitly unauthorized. S05 and S10 record that boundary and do not infer deployed properties from static files.

## Primary references

- [GitHub Actions secure use and least privilege](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [GitHub Pages custom 404 pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)
- [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)
- [pnpm audit](https://pnpm.io/cli/audit)
- [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google localized versions guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google robots.txt guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
