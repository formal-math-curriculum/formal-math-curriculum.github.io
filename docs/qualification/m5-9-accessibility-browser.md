# M5.9 accessibility, responsive, browser and performance qualification

`P5-M5.9-QUALIFICATION-FREEZE-v1` owns the matrix and severity taxonomy;
`P5-DEC-033` owns the accepted accessibility-risk boundary for the remediation
candidate. This repository owns the executable website qualification harness.
It does not change curriculum, editorial content or formal facts.

The harness compares its revision with website commit
`01c09041aaed77db164a060e6a1aecc889ab861f` (tree
`b7da7512ff507b86eab2e5953af4d28c7f27318e`) and rejects every changed path
except the paired accessibility/security harness, their procedures and contract
tests, and CI wiring. It then runs fresh Chromium, Firefox, WebKit and branded
Chrome evidence against the built static subject. Earlier M5.8 evidence is not
imported as an M5.9 result.

## Automated reproduction

Use Ubuntu 24.04, Node 24.19.0 and pnpm 11.23.0. Check out content commit
`3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828` at `.inputs/content`, then run:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright-core install --with-deps chromium firefox webkit
FMC_REQUIRE_BROWSER=1 \
FMC_M59_CANDIDATE_REVISION=01c09041aaed77db164a060e6a1aecc889ab861f \
FMC_M59_HARNESS_REVISION=$(git rev-parse HEAD) \
FMC_RUNNER_IMAGE_LABEL=ubuntu-24.04 \
pnpm build
FMC_REQUIRE_BROWSER=1 \
FMC_M59_CANDIDATE_REVISION=01c09041aaed77db164a060e6a1aecc889ab861f \
FMC_M59_HARNESS_REVISION=$(git rev-parse HEAD) \
FMC_RUNNER_IMAGE_LABEL=ubuntu-24.04 \
node scripts/validate-m5-9-accessibility-browser.mjs
```

The versioned JSON report, screenshots and SHA-256 manifest are written below
`dist/_validation/m5-9-accessibility-v1/`. A mandatory functional, performance,
security or integrity failure exits nonzero. Accessibility-specific non-passes
covered by `P5-DEC-033` remain recorded with their original status and severity,
but do not determine the process exit code. They are never rewritten as passes.

## Manual NVDA lane

Use Windows 11 24H2, NVDA 2026.1.1 and branded Chrome
151.0.7922.137. Record the Windows build, NVDA speech synthesizer/settings,
Chrome version, operator role, candidate URL/hash, timestamps and transcript.

1. Navigate by landmarks and headings to the governed content title and every
   mathematical block. Confirm rendered mathematics has a usable text
   alternative and that LaTeX/Lean provenance is not announced as the same
   representation.
2. Open global search, enter a matching and a no-result query, change a filter
   and clear it. Record labels, result count/status announcements and focus.
3. At a narrow window, open the outline drawer. Confirm dialog name, initial
   focus, Tab/Shift+Tab containment, Escape, Close, and focus return.
4. Change all five projections in the validation fixture. Record the selected
   option, announced projection/state/result count, unavailable state and Course
   fallback. Confirm canonical content identity does not sound like it changed.
5. Operate a disclosure separately from its navigation link, then Expand all,
   Collapse all, an Exercise-only filter and simultaneous Module plus Unit
   filters. Record expanded/checked states and result announcements.
6. Operate the representation tab list with arrow, Home and End keys. Confirm
   selected tab, panel label, global/local override and reset announcements.
7. Repeat preference changes with storage denied. Confirm the change works for
   the page and that the unsaved-state message is announced.

Any missing name/role/value/state, lost/hidden focus, silent result/state
change, trap or ambiguous math alternative is recorded against its frozen row.

## Manual VoiceOver lane

Record the exact macOS Tahoe 26.x build, bundled VoiceOver build and Safari
26.x patch before testing. Repeat the NVDA script using VoiceOver keyboard
navigation and rotor lists for landmarks, headings, form controls and links.
Playwright WebKit evidence is not a substitute. If this exact lane is not
available, A10 remains `blocked_manual_required`; under `P5-DEC-033` that
accessibility-specific non-pass is accepted risk for release gating, never a
pass and never evidence of accessibility or WCAG conformance.

## Boundaries

The 320 and 640 CSS-pixel lanes are the WCAG reflow equivalents of 400% and
200% at a 1280 CSS-pixel baseline. Lab LCP, INP and CLS are regression signals,
not field percentiles. The loopback cache policy establishes only that hashed
assets are cacheable; MAT-370 owns deployed response/header evidence. Public
deployment, Portuguese coverage, external-taxonomy coverage, screen-reader
usability and WCAG conformance remain unclaimed.
