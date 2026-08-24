# M5.5 candidate adversarial audit v1

**Issue:** MAT-386  
**Audit date:** 2026-08-24  
**Disposition:** auditable immutable subject; remediation required  
**Release / M5.6 readiness:** not established  
**Findings:** 0 Blocker, 4 Material, 1 Minor, 2 Observation

This is an audit record, not a repair. The candidate source, component tests, browser harness, candidate manifest and frozen evidence were not changed by MAT-386.

## 1. Verdict

The exact MAT-375 subject is recoverable, internally hash-consistent and suitable for adversarial audit. It is not eligible to satisfy the M5.5 release gate while four Material findings remain open:

1. the known narrow-dialog sequential-focus escape is independently confirmed;
2. the repository can manually deploy the candidate even though its manifest denies deployment, and the synthetic fixture is emitted in the public sitemap;
3. valid mathematical-block identities can collide in the 32-bit DOM-ID derivation and create duplicate ARIA targets;
4. the candidate does not execute or mark unsupported every frozen D/X acceptance row it claims as required.

MAT-399 owns repair and requalification. Nothing in this report authorizes deployment or M5.6 execution.

## 2. Immutable subject and authority reconstruction

### 2.1 Exact subject

| Surface | Frozen identity |
| --- | --- |
| Reviewed PR | `formal-math-curriculum/formal-math-curriculum.github.io#9` |
| Reviewed PR head | `0605255cb9dfaad28c1c425feff558288bb81cc7` |
| Squash merge on `main` | `88c2ac887b1dc0dad73a2cd684eec67096df787f` |
| Reviewed and merged Git tree | `879f696862fbce59d4395a31b087f8bd84b45822` for both commits |
| Required workflow run / job | `32686851006` / `97313424633` |
| Artifact ID / name | `9505961644` / `site-preview-bfee3064205e2e7d8d9681507831b9e29d5f19d2` |
| Artifact ZIP SHA-256 | `e06611c78123c9854a1729518c18ee61ebef2149e82ef3c32d16f859be8c2df8` |
| Browser report SHA-256 | `d88f90994a2ee460ca3f9bfef2f3e7f2aecada9ace41979ba59b0712fff713fb` |
| ARIA snapshot SHA-256 | `7d446a473065a812a294310be6bd7cc64edbab6e039ed4be0f6dde7ad8c5fc05` |
| Sitemap SHA-256 | `e6d404d315770928f4d222749a649229a8beb15873f20aef4fca17dc2964d825` |
| Content input | `fb3df63b27ae54d4dc237a421dd241d4c59330e4` |
| Recorded runtime | Node `v24.19.0`; pnpm `11.23.0`; Playwright Core `1.62.1`; Chrome `151.0.7922.137`; Linux x64 |

The reviewed head and squash merge have the same Git tree. The downloaded ZIP passes ZIP integrity, contains 47 payload files / 2,654,102 payload bytes plus its manifest, and every payload/evidence hash was independently recomputed. No deployment is part of the audited evidence.

### 2.2 Governing authority

The audit reconstructs the contract from MAT-335, MAT-345 and its frozen `P5-M5.5-ENTRY-AND-COMPONENT-CONTRACT-v1`, MAT-357, MAT-360, MAT-416, MAT-375, the Project-5 v2 product charter, decision register, authority-impact register and web plan, plus the MAT-375 candidate handoff. Repository source is authoritative for executable behavior; the GitHub run and artifact are authoritative for executed evidence; Linear is authoritative for requirements, issue state and remediation ownership.

The synthetic fixture establishes no curriculum, mapping, translation or formal-verification claim. Canonical mathematical/editorial authority remains outside this website component candidate.

## 3. Independence and method

Independence is procedural, not personnel-independent. Executor continuity is disclosed. Separation is provided by a new issue, a frozen artifact, independently recomputed hashes, a fresh checkout, adversarial cases and an audit-only diff. The audit PR CI, if any, validates delivery of this report only; it is not evidence for and does not replace the frozen MAT-375 subject.

The audit used:

- positive replay: 88 pure/source tests pass with the exact qualified content input; Astro check reports 0 errors/warnings/hints;
- exact browser-evidence review: B01–B23, 22 pass / 1 Material fail / 0 Blocker fail;
- negative and incompatible inputs: corrupt JSON, invalid enums, unknown schema major, missing/stale/integrity-invalid manifests, unavailable storage and clipboard rejection;
- boundary cases: 320 CSS-pixel viewport, 200% text, local source overflow, four official themes, forced colors, reduced motion and no JavaScript;
- stale/evolution/recovery cases: storage events, projection fingerprints, unavailable projection, reset, no-result focus recovery and candidate/main tree equivalence;
- fresh-session and publication inspection: fresh clone, fresh defaults, generated sitemap/Pagefind boundary and deploy workflow;
- adversarial identity construction: valid input pairs against the exported DOM-ID function.

## 4. Obligation matrix

| Obligation | Evidence and falsification | Result |
| --- | --- | --- |
| Authority | Project-5 registers and M5.5 freeze reconciled with the source tree, PR #9, run, artifact and issue states | Pass |
| Mathematical/editorial meaning | Fixture labels itself synthetic; provenance/source records are scoped; no production or verification claim is made | Pass within declared synthetic boundary |
| Architecture/state ownership | One store; local representation override; projection-local ephemeral context; pure invalid/stale cases replayed | Pass for tested subject |
| Stable identity | Constructed two valid identities with the same DOM ID | **Material F03** |
| Accessibility | B03, B07, B10–B15, B19–B21 and ARIA/screenshot evidence inspected; B18 reproduced in frozen report | **Material F01** |
| Security | Static output; loopback-only test server; validated manifests/routes; no runtime backend or token-bearing artifact found | Pass for bounded static subject |
| Privacy | One bounded preference key; no reading history or remote telemetry; outline context remains page/history state | Pass for bounded static subject |
| Reproducibility/provenance | Artifact and inner hashes close the frozen subject; exact observed runtime is recorded; rerun OS/browser source remains mutable | **Minor F05** |
| Maintainability/evolution | Schema majors fail closed and stale fingerprints recover; ID collision and incomplete frozen-row execution remain | **Material F03/F04** |
| Publication state | No deploy evidence, but manual deploy ignores `deploymentAuthorized: false` and emits fixture in sitemap | **Material F02** |
| English root/future locale | English root and route ownership pass; future-locale runtime/chrome is not qualified | Unsupported scope; Observation O02 |
| Cross-system consistency | Commit trees and artifact identities reconcile; declarative deployment denial conflicts with executable workflow | **Material F02** |

## 5. Acceptance-claim coverage

### 5.1 Browser rows

All B01–B23 rows are present in the frozen report. B01–B17 and B19–B23 pass. B18 fails Material. Browser evidence therefore supports a coherent audit candidate, not an all-pass release candidate.

### 5.2 Frozen D/R/N/X rows

| Family | Audit record | Status |
| --- | --- | --- |
| D01–D16 | Preference pure/source tests and B02, B08–B09, B12–B17, B20–B21 replay substantial state/theme/failure coverage | D02 reload of every explicit theme and D05 wrapping/metric behavior across every type combination are not explicitly executed; **F04** |
| R01–R16 | All 16 named pure tests pass; B03–B05, B10–B11, B15, B19 and B21 exercise the integrated DOM | Tested for the English synthetic fixture; constructed multi-block uniqueness fails **F03** |
| N01–N26 | All 26 named pure/source tests pass; B05–B09, B11–B13 and B17–B21 exercise the integrated DOM | N17 fails **F01** |
| X01–X16 | B01, B04–B09, B17 and B19–B21 cover the principal merged transitions | X06, X08, X12 and X13 are not explicit integrated-browser rows; X16 does not repeat X01–X15 under all four themes; **F04** |

Unsupported claims are not silently upgraded: production corpus coverage, external taxonomy correctness, translation completeness, remote Lean verification, cross-engine behavior, manual screen-reader usability and future-locale runtime behavior remain outside the evidence.

## 6. Findings

### F01 — Material — narrow modal loses sequential focus containment

**Affected claim:** N17, B18, M5.5 keyboard/focus release gate.

**Reproduction:** inspect frozen report row B18 under Chrome `151.0.7922.137`. Open the outline at 320×800 and press forward Tab through the dialog. After the final `summary`, focus reaches `BODY` for one step before returning to `DIALOG`.

**Evidence:** B18 records `modal=true`, `contained=false`, `restored=true` and the exact 24-step focus trace. Outside interactive controls remain inert; Escape closes; trigger focus is restored.

**Impact:** the frozen contract requires containment and stops on keyboard traps/focus loss. Native modal status alone does not satisfy the project focus contract.

**Owner/scope:** MAT-399; `OutlineNavigator.astro` narrow-dialog focus management and B18 regression coverage.

**Requalification:** under the qualified browser matrix, forward and reverse sequential focus never leave the dialog while modal; Escape, explicit close, backdrop close, resize transitions and trigger restoration pass. Record exact engine versions.

### F02 — Material — deployment denial is not enforced and the fixture is advertised in the sitemap

**Affected claim:** `deploymentAuthorized: false`, publication-state boundary, bounded static-product release gate.

**Reproduction:**

1. Read `validation/m5-5-candidate.json`: `deploymentAuthorized` is `false`.
2. Read `.github/workflows/deploy-pages.yml`: `workflow_dispatch` builds current source and deploys it without checking that field or excluding the fixture.
3. Build the exact tree or inspect the frozen artifact: `validation/m5-5/index.html` is present.
4. Inspect `sitemap-0.xml`: it contains `https://formal-math-curriculum.github.io/validation/m5-5/` even though the page is `noindex, nofollow`.

**Impact:** an operator dispatch can publish the unaudited synthetic route from `main`. `noindex` is crawler guidance, not an access or deployment control; sitemap inclusion actively contradicts the intended non-public interpretation.

**Owner/scope:** MAT-399; deploy workflow, build routing/sitemap policy and release gate.

**Requalification:** a negative deployment test proves that a candidate with `deploymentAuthorized: false`, unresolved Blocker/Material findings or a synthetic validation route cannot reach the Pages deploy job. A release artifact contains neither the fixture nor its sitemap entry. Preview/audit evidence remains separately reproducible.

### F03 — Material — 32-bit DOM-ID collisions break per-block ARIA uniqueness

**Affected claim:** stable identity, R10/R16 and multi-block accessible component architecture.

**Reproduction:** call `createRepresentationDomId` with these two independently valid identities (same `blockId` and `revision`):

```json
{"contentId":"audit-nvq07x-kpaqu0","blockId":"block","revision":"v1"}
{"contentId":"audit-1f118lz-4560qy","blockId":"block","revision":"v1"}
```

Both return `fmc-math-6bgz1q`. Rendering both blocks therefore duplicates title, tab and panel IDs such as `fmc-math-6bgz1q-panel-rendered`. `aria-controls` and `aria-labelledby` no longer identify a unique block relationship.

**Impact:** valid content can produce ambiguous IDREF relationships and invalid multi-block DOM. The component contract cannot promise stable accessible identity solely from a 32-bit hash.

**Owner/scope:** MAT-399 with MAT-360 component scope; DOM-ID construction and multi-block tests.

**Requalification:** use a collision-resistant or deterministic collision-resolving ID scheme, render the exact collision pair on one page, assert document-wide uniqueness and verify each tab controls only its own panel. Preserve SSR/client determinism.

### F04 — Material — required frozen-row execution is incomplete

**Affected claim:** candidate manifest `requiredFrozenRows`, freeze row X16, MAT-386 acceptance that every candidate claim be tested or marked unsupported.

**Reproduction:** compare `P5-M5.5-ENTRY-AND-COMPONENT-CONTRACT-v1` D01–D16/X01–X16 with `scripts/validate-m5-5-browser.mjs` B01–B23 and the 88 pure/source tests. There is no explicit integrated-browser execution for X06, X08, X12 or X13; X16's required repeat of X01–X15 under all four themes is not performed. D02 reload of each explicit theme and D05 wrapping/metric behavior for every typography combination are also not explicitly measured. The candidate limitations do not mark these rows unsupported.

**Impact:** the evidence index overstates completeness. Passing source tests and separate theme screenshots cannot substitute for the frozen cross-transition assertions.

**Owner/scope:** MAT-399; validation plan, browser harness and candidate evidence manifest. This issue must not retrofit the frozen MAT-375 report.

**Requalification:** publish a new candidate version with an explicit one-to-one D/R/N/X evidence matrix. Execute the missing cases on the merged subject or mark genuinely out-of-scope claims unsupported with authority approval. X16 must show the exact cross-transition/theme matrix, not inference from unrelated rows.

### F05 — Minor — rerun environment is observed, not fully pinned

**Affected claim:** deterministic provenance and future requalification reproducibility.

**Reproduction:** `.github/workflows/ci.yml` and `deploy-pages.yml` use `runs-on: ubuntu-latest` and `/usr/bin/google-chrome`. The report records Linux x64 and Chrome `151.0.7922.137`, but no immutable runner image/container digest. Candidate documentation calls this a pinned GitHub runner.

**Impact:** the frozen artifact is identifiable, but a later rerun can silently change OS packages, fonts and browser behavior—especially material to screenshots, contrast and B18.

**Owner/scope:** MAT-399 or platform workflow owner.

**Requalification:** record/pin a runner image or container/browser artifact sufficiently to reconstruct the qualified environment, and add an explicit evolution trigger when the image/browser changes.

### O01 — Observation — organizational independence is not established

The audit has procedural separation and immutable inputs, but executor continuity means it must not be represented as an independent human/organizational review.

### O02 — Observation — declared unsupported qualification surfaces remain unsupported

Cross-engine behavior, manual screen-reader usability, production corpus/taxonomy correctness, translation completeness, remote Lean verification and future-locale runtime chrome were not established. This is acceptable only while release and conformance claims remain withheld.

## 7. Exact MAT-399 remediation handoff

MAT-399 must use this report and `validation/m5-5-audit-v1.json` as immutable input and produce a new candidate/evidence version rather than editing MAT-375 history.

Required exit conditions:

1. resolve F01 with forward/reverse modal focus, close, Escape, backdrop, resize and trigger-restoration evidence;
2. resolve F02 with an executable deploy denial and a release artifact free of the synthetic route/sitemap entry;
3. resolve F03 with document-wide unique IDs using the exact collision pair;
4. resolve F04 with a one-to-one D/R/N/X evidence matrix and explicit unsupported-scope decisions;
5. address or explicitly accept F05 with named authority and an evolution/revalidation trigger;
6. rerun source/unit/browser/build/artifact verification on the exact remediation head, freeze the new run/job/artifact/digests and independently inspect screenshots/ARIA;
7. demonstrate 0 unresolved Blocker and 0 unresolved Material before deciding M5.6 readiness or authorizing deployment.

## 8. Stop-condition disposition

The audited subject did not change; the exact artifact was recovered; authority was reconstructable; required evidence was present and immutable. Audit execution therefore did not stop early. The Material findings stop release/M5.6 readiness, not publication of this audit record.
