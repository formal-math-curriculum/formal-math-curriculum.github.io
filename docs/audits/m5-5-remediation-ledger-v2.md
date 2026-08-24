# M5.5 remediation ledger v2

**Owner:** MAT-399

**Immutable input:** MAT-386 merge `a071e58473646f00ea163b3f745c752228a0a8a2`

**Corrected subject:** exact `FMC_SOURCE_REVISION` recorded by the required v2 CI run

**Qualification rule:** zero unresolved Blocker and Material findings

| Finding | Audit severity | Disposition | Corrected surface | Required requalification |
| --- | --- | --- | --- | --- |
| F01 | Material | Remediated | `OutlineNavigator.astro` | B18 forward/reverse containment, Escape and trigger restoration |
| F02 | Material | Remediated | current selector, deploy workflow, `prepare-release.mjs` | denial test plus authorized synthetic-route/sitemap removal test |
| F03 | Material | Remediated | `createRepresentationDomId` and collision fixture | unit collision pair plus B30 document-wide ID/IDREF uniqueness |
| F04 | Material | Remediated | v2 manifest/evidence matrix and B24–B29 | 16 D, 16 R, 26 N and 16 X obligations each have named evidence |
| F05 | Minor | Accepted with controls | `ubuntu-24.04`, recorded image/browser fields | exact observed values and mandatory environment-change trigger |
| O01 | Observation | Retained | audit interpretation | procedural separation is not organizational independence |
| O02 | Observation | Retained | limitation register | unsupported qualification surfaces remain explicit |

The source record `validation/m5-5-requalification-v2.json` is the machine-readable ledger and evidence index. `validation/m5-5-current.json` selects it but keeps deployment unauthorized. Component/M5.6 readiness and public release authorization are separate decisions.

## Regression boundary

The exact corrected head must pass Astro/type checks, all pure/source tests, qualified content ingest, B01–B30, Pagefind generation and full artifact hashing. The report and every inner evidence file must be independently hash-verified and visually/semantically reviewed before MAT-399 can close.

## Historical integrity

The MAT-375 artifact and MAT-386 audit remain unchanged. A failed v2 run is a failed remediation candidate; it is never used to relabel historical findings as resolved.
