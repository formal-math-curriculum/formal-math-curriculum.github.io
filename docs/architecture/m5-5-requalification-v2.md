# M5.5 remediation and requalification v2

MAT-399 creates a new corrected subject from the immutable MAT-386 audit. It does not change the MAT-375 artifact, the MAT-386 report or their historical finding counts.

## Corrected scope

- F01: the narrow native modal now adds explicit forward/reverse Tab containment while retaining native modality, Escape, explicit/backdrop close, resize behavior and trigger restoration.
- F02: the deploy workflow reads the current versioned release record and fails closed unless deployment is explicitly authorized with zero Blocker/Material findings. Authorized release preparation removes every `/validation/m5-5/` route and sitemap entry.
- F03: mathematical-block DOM IDs use injective base64url encoding of the full identity tuple rather than a 32-bit hash. The exact audit collision pair is rendered together on a synthetic regression route.
- F04: `validation/m5-5-requalification-v2.json` owns the one-to-one D/R/N/X evidence matrix. B24–B30 close the explicit theme-reload, typography-metric, focus, locale/path, failure-isolation and ID-uniqueness gaps.
- F05: workflows use the versioned `ubuntu-24.04` label; evidence records the observed runner image and browser. This is an accepted Minor risk with mandatory evolution triggers, not an immutable-image claim.

## Versioned evidence

The required v2 run emits:

- `_validation/m5-5-requalification-v2-report.json`;
- `_validation/m5-5-requalification-v2-aria.txt`;
- seven `m5-5-requalification-v2-*.png` screenshots;
- the ordinary full artifact manifest and outer Actions artifact digest.

All B01–B30 rows must pass. Unlike the v1 candidate harness, the v2 harness fails CI for any Blocker or Material row failure.

## Publication boundary

`validation/m5-5-current.json` points to the current versioned record. The v2 record deliberately keeps `deploymentAuthorized=false`: component readiness and M5.6 execution eligibility do not themselves authorize public deployment. A later governed record may authorize deployment only with zero unresolved Blocker/Material findings; `scripts/prepare-release.mjs` then removes the synthetic fixture routes before Pages upload.

## Interpretation boundary

The corrected candidate remains synthetic. It does not establish production corpus/taxonomy correctness, translation completeness, remote Lean verification, cross-engine behavior, manual screen-reader usability or released WCAG conformance. The localized-route test is an ownership/no-redirect proxy, not a translated UI qualification.
