# Five-projection outline navigator

MAT-416 adds a reusable, progressively enhanced outline component. It does not add a production corpus instance. The current authoritative content subject has only a synthetic Course bootstrap and no populated external placement manifests, so tests use `tests/fixtures/outline-manifest.json`, whose fingerprints are explicitly synthetic.

## Component boundary

`src/components/OutlineNavigator.astro` accepts one `manifest` prop. It validates the entire value with `validateOutlineManifest()` before rendering. Invalid build input throws; it is never partially repaired in the browser.

The consumer schema is `p5-outline-manifest/v1` and contains exactly these descriptors in order:

1. Course (`course-pedagogy`)
2. OntoMathPRO (`ontomathpro-polyhierarchy`)
3. MSC 2020 (`msc2020-classification`)
4. arXiv (`arxiv-shallow-category`)
5. Lean / mathlib (`lean-content-drilldown`)

Each descriptor owns its structural-filter schema, runtime state, source fingerprint, landing route and projection-local placements. Universal filters are declared once at manifest level. A placement is keyed by `referenceId`, not canonical content ID. Several placements may resolve to one content ID only when they retain the same canonical route.

The validator rejects:

- a changed projection order, label or kind;
- duplicate reference IDs, dangling parents or cycles;
- content IDs associated with inconsistent routes;
- undeclared filter groups/tokens;
- invalid active traversal references;
- placement kinds outside the descriptor's model;
- payload in a projection marked unavailable/incompatible/integrity-invalid;
- arXiv or Lean placement depth outside their bounded models.

`current` and `stale-compatible` descriptors are usable. Other states fail closed. If the shared store requests an unusable projection, the component renders Course and announces the exact state while retaining—not rewriting—the requested durable preference.

## Identity and state ownership

Projection state cannot mutate `currentContent.contentId`, `currentContent.canonicalRoute`, locale, pathname or canonical metadata. Links always use validated canonical routes. The exact active placement receives `aria-current="page"`; another placement for the same canonical entity receives a textual alternate-placement cue.

`window.FMCPreferenceStore` remains the sole durable owner. The navigator only calls `set({ outlineProjection })` and subscribes to validated snapshots/reset events. It never reads or writes Web Storage.

Query, universal/structural selections and expanded reference IDs are per-projection in-memory context. A bounded optional `history.state.fmcOutline` record carries one projection context, fingerprint and active reference trail. Restoration validates every token/reference. A fingerprint change clears query/filter/expansion state and recovers only to the nearest surviving reference. History replacement preserves the exact URL.

Local reset clears the active outline context only. Full preference reset clears every mounted outline context and restores Course without changing route, locale, representation override, content identity or page subject.

## Accessibility and progressive enhancement

The server output contains the complete Course hierarchy and all five ordinary projection landing links. JavaScript failure leaves those links and the canonical Course reading path available.

Hierarchy uses nested `ul/li`. An expandable row has a native button with `aria-expanded` and `aria-controls`, immediately followed by its ordinary link. Enter/Space activate the button through native behavior; Enter follows the link; Tab/Shift+Tab retain document order. The component intentionally does not use an ARIA tree or implement arrow-key tree behavior.

One `<dialog>`/`<nav>` owns the semantic tree. At wide widths it is a persistent non-modal panel. At narrow widths enhancement closes the initial static dialog and reopens it with `showModal()`, gaining native background inertness and Escape behavior. A visible close button, backdrop close and trigger-focus restoration are also provided. This avoids two divergent sidebar/drawer trees.

Search/filter results keep their minimal ancestors. Filter groups combine with AND; checked tokens within one group combine with OR. Expand/collapse all targets only visible groups in the effective projection. Before filtering removes a focused tree row, focus moves to the result heading and a polite status describes the update.

Every placement displays its mapping state as text. A complete disclosure list repeats all placements with parent edge, mapping state and link action. No state depends on color alone.

Shared CSS provides the 44px control target, visible focus, narrow single-column reflow, forced-colors system palette and reduced-motion policy. The primary nested list stays in source/document order.

## Use

```astro
---
import OutlineNavigator from '../components/OutlineNavigator.astro';
import manifest from '../generated/outline-manifest.json';
---

<OutlineNavigator manifest={manifest} heading="Course outline" />
```

The example path is illustrative. A generated production file must not be introduced until the content pipeline supplies a current, validated manifest with authoritative fingerprints and placement provenance.

## Verification

`tests/outline-navigator.test.mjs` covers MAT-345 rows N01–N26, the owned cross-component transitions, invalid schema/order/reference/route/filter/depth cases, failure fallback and source-level accessibility/responsive contracts. Integrated browser and assistive-technology release qualification remains MAT-375 work against the exact merged artifact.
