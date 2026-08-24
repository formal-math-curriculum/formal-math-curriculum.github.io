# M5.7 relation navigation implementation

MAT-364 implements the relation-navigation portion of the M5.7 discovery freeze. Each of the 15 governed learner pages now exposes complete static lists for prerequisites, downstream uses, Course placement, external classification placement, generated formal dependency and technical import/build detail. The visual relationship map is an enhancement of the same page model; it is not the only way to access any relation.

## Typed authority boundary

The model keeps eight relation systems independent:

| System | Authority | Conversion boundary |
| --- | --- | --- |
| Course order | content pedagogy | Course order is not readiness authority. |
| Learner prerequisite | Project 1 readiness records | Only exact readiness records create strict learner prerequisites. |
| Downstream use | inverse view of Project 1 readiness | The edge direction is shared, but its type and user-facing label remain distinct. |
| OntoMathPRO placement | adopted content-alignment snapshot | Missing or unlicensed payloads remain unavailable. |
| MSC 2020 placement | adopted content-alignment snapshot | A license-needs-review state does not become a guessed placement. |
| arXiv placement | adopted content-alignment snapshot | Missing payloads remain unavailable. |
| Generated formal dependency | exact generated formal facts | Direct edges and transitive paths remain separately labeled and revision scoped. |
| Lean import/build detail | exact generated import/build facts | No technical edge is inferred from a formal locator or declaration. |

Every page-model fingerprint includes the content identity, canonical route and exact corpus fingerprint. Switching an outline projection therefore does not change relation identity, pathname, locale or deep-link focus. A Course multi-placement can expose multiple references while resolving to one canonical content route.

The governed generated example is the exact chain `cnt:p5m56:000004 → FART-P2-000005 → Mathlib.Algebra.Ring.Nat → Nat.instDistrib`. It is accepted only with the frozen content, Lean project, Lean core, mathlib and generated-dependency revisions. Stale revisions, mismatched fingerprints, self-edges, cycles, dangling IDs and relation-type conversion fail closed.

## Accessible static surface

All relation groups are ordinary HTML lists and links. Out-of-slice prerequisites and unresolved formal nodes are text boundaries without fabricated routes. The visual map duplicates only the immediate prerequisite, downstream and direct formal edges already present in the lists. Its JavaScript is limited to bounded 80–130% zoom with a polite status announcement; it makes no network request and writes no relation, locale or progress state. The relation section is excluded from Pagefind indexing because it repeats titles and identifiers from other governed pages; canonical page metadata continues to own discovery, while the complete relation HTML remains on the page.

At 320 CSS pixels, the map and lists reflow to one column, long identifiers wrap, and zoom buttons retain a 44-by-44 CSS-pixel target. Reduced-motion mode removes the zoom transition. The complete lists, route links, deep links and boundary explanations remain available with JavaScript disabled. These choices follow the W3C [Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), [Reflow understanding](https://www.w3.org/WAI/WCAG22/Understanding/reflow) and [Focus Not Obscured understanding](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), together with Astro's [client-side script processing](https://docs.astro.build/en/guides/client-side-scripts/).

## Scale and qualification

The deterministic validation route contains 2,000 documents, 2,200 placements, a 120-node acyclic prerequisite graph, 150 direct formal edges, 25 two-hop formal chains and 10 unresolved formal nodes. It also renders explicit stale, self-edge, cycle, dangling-ID and invalid-type diagnostics. Reserved fixture identifiers are excluded from learner pages, Pagefind and the sitemap.

Qualification has three layers:

1. Node tests cover R01–R14, revision and graph validation, route continuity, external multi-parent placement, no-persistence source boundaries and deterministic scale.
2. Required Chromium rows R01–R14 and A01–A08 exercise the generated site, responsive behavior, no-JavaScript output, reduced motion, exact deep links, graph/list parity, console safety and zero external requests.
3. The artifact gate validates all 15 learner pages, fixture non-leakage, exact governed IDs and revisions, the validation route boundaries, sitemap exclusion and the browser report when CI requires it.

The corpus remains a representative vertical slice. Automated Chromium evidence does not establish manual screen-reader or cross-engine conformance. MAT-364 does not authorize public deployment; MAT-377 owns the next M5.7 scope.
