# M5.5 integrated candidate qualification

MAT-375 turns the separately merged preference, representation and outline components into one exact audit candidate. It adds validation evidence, not production curriculum or a release deployment.

## Exact entry baseline

- Website: `37346c7e77f80da6cbce4547c24e55de2c704f57`
- Content input: `fb3df63b27ae54d4dc237a421dd241d4c59330e4`
- Preference/design-system merge: `bb693450c2c18cacdb4913e27811e16b688e8fbe`
- Representation-block merge: `442a4b0f778698c725825f9615be1a0aa09da9e5`
- Outline-navigator merge: `37346c7e77f80da6cbce4547c24e55de2c704f57`

`validation/m5-5-candidate.json` is the source-owned qualification contract. The required CI execution writes the exact tested head into the generated browser report; the report is then hashed by the ordinary artifact manifest.

## Synthetic integration route

`src/pages/validation/m5-5.astro` mounts all three runtime surfaces in one document:

- the one `FMCPreferenceStore` and native preference controls;
- one current rendered/LaTeX/Lean block with exact synthetic source/provenance;
- the exact five-projection navigator using the explicitly synthetic outline fixture.

The page is `noindex` and labels itself as synthetic test evidence. Its long LaTeX source intentionally exercises local overflow. Its MathML is ordinary semantic rendered content. Projection links and representation identities are not production claims.

The route remains in the candidate artifact so MAT-386 can reproduce and adversarially inspect the same subject without a deployment. It must not be interpreted as a public curriculum route and must be removed or separately governed before a release workflow ever publishes the candidate.

## Browser execution

The build order is:

1. Astro/type and source-boundary checks;
2. all pure/unit/source tests;
3. exact content ingest;
4. Astro build;
5. `scripts/validate-m5-5-browser.mjs` against `dist`;
6. Pagefind generation;
7. full artifact hashing/verification.

The browser program serves `dist` only on an ephemeral `127.0.0.1` port and uses exact `playwright-core@1.62.1` to drive the Chrome already installed on the pinned GitHub runner. It does not download an untracked browser. CI sets `FMC_REQUIRE_BROWSER=1` and the exact pull-request head or main SHA; an explicit local skip is forbidden under that flag.

The report records Node, pnpm, Playwright, browser/version, OS/architecture, source/content subjects, viewports/media and every result. Browser absence, any `Blocker` row failure or missing evidence that prevents a coherent subject fails the build. A `Material` failure remains a failed row and a known audit finding, but does not erase an otherwise reproducible candidate or authorize audit-stage remediation.

The first required Chromium executions found one reproducible Material issue, recorded as B18 in the candidate manifest: in runner Chrome, forward `Tab` reaches `BODY` for one step after the final native-dialog control before returning to the modal. Outside controls remain inert; `Escape` closes the modal and restores focus to the trigger. MAT-375 deliberately does not alter the outline component. MAT-386 must independently classify or reject this known finding against the exact report and browser version.

## Evidence

Successful execution creates inside `dist/_validation/`:

- `m5-5-report.json` — `p5-m5.5-browser-qualification/v1` structured results;
- `m5-5-aria.txt` — representation tablist and outline navigation ARIA snapshots;
- four official-theme screenshots;
- narrow modal, forced-colors and no-JavaScript screenshots.

The browser report hashes the ARIA/screenshot files. `scripts/verify-artifact.mjs` then hashes the report and every other output in `_provenance/artifact.json`. The CI-uploaded ZIP digest closes the outer evidence boundary.

## What the browser rows execute

Rows `B01`–`B23` cover:

- one shared store and fresh/reset defaults;
- representation APG roles/relations/keyboard behavior;
- global default, local override and restore-global transitions;
- projection switches without URL/canonical/content/block mutation;
- multiple references to one entity/route and one active traversal;
- query/filter/no-result/focus/local-reset behavior;
- full reset and valid/invalid/corrupt/denied storage paths;
- exact clipboard bytes and rejection announcement;
- ARIA snapshots, 44×44 targets and visible/unobscured focus;
- computed contrast in all four official themes;
- every qualified typography family/size/weight combination with code/math boundaries;
- native modal focus containment/Escape/trigger restoration;
- 320 CSS-pixel reflow proxy, 200% text and local source overflow;
- forced colors and reduced motion;
- complete no-JavaScript Course/source/provenance fallback;
- absence of page/console errors and completeness of evidence files.

Existing D01–D16, R01–R16, N01–N26 and X01–X16 pure/source tests remain normative. The browser suite does not replace invalid/stale schema tests; it adds executed integrated-browser evidence.

## Interpretation boundary

A coherent Chromium candidate with no `Blocker` failures is eligible for MAT-386 adversarial audit. It may still contain explicitly failed Material rows, is not an all-pass release qualification, and is not proof of:

- production corpus or external classification coverage;
- translation completeness;
- Lean correspondence or remote verification;
- cross-engine behavior;
- manual screen-reader usability;
- WCAG conformance of a released public course.

Screenshots are immutable candidate evidence, not self-approved golden images. MAT-386 must inspect the exact artifact and may reject it without silently changing this qualification subject.
