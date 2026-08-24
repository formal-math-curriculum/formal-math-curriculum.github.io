# M5.5 design system and preference boundary

MAT-357 implements the website-owned display-preference surface defined by
`P5-M5.5-ENTRY-AND-COMPONENT-CONTRACT-v1`. It does not own content, curriculum,
classification, routes, Lean facts, projection manifests, or per-block state.

## One atomic value

The only durable key is `fmc:site-preferences:v1`. Its version-1 JSON value contains:

* one of four explicit themes or `system` resolver mode;
* bounded family, size, and weight choices;
* the global rendered/LaTeX/Lean default;
* the requested five-projection outline mode.

Query, filters, expansion, active reference, scroll, history, locale, canonical route,
and per-block overrides are deliberately absent. MAT-360 and MAT-416 consume this
store; they must not read or write Web Storage directly.

Every read, cross-window event, update, and migration is validated atomically. Invalid
or incompatible data resets to in-memory defaults. Storage denial or quota failure is
a supported state: controls keep working for the current page and expose a concise
accessible non-persistence status.

## Starlight integration

The site overrides only Starlight's documented `ThemeProvider` and `ThemeSelect`
surfaces. The pre-paint provider keeps `data-theme=light|dark` for Starlight and code
blocks, while `data-fmc-theme` selects light, light high contrast, dark, or dark high
contrast tokens. `system` resolves from color-scheme and contrast media preferences;
it is not a fifth theme.

The interactive implementation is dependency-free browser JavaScript. Reset removes
the key and emits one `fmc:preferences-reset` event for mounted M5.5 consumers.

## Typography and assets

Sans-serif and serif use deterministic local/system stacks and redistribute no font
binary. Code has a separate safe monospace stack. Math remains owned by the qualified
math renderer. Condensed and expanded are schema-reserved but disabled and visibly
unavailable until exact font files, license, glyph coverage, metrics, reflow, and
cross-browser evidence are qualified. The runtime falls back to sans-serif rather than
synthesizing or fetching a remote font.

## Accessibility behavior

Semantic tokens cover surfaces, text, borders, accent, status, focus, spacing, and
motion. Standalone preference controls target 44×44 CSS pixels. Focus remains visible
in every theme. Forced-colors mode uses system colors and normal user-agent adjustment.
Reduced-motion mode removes nonessential transitions and smooth scrolling. Without
JavaScript the page remains readable using system/light CSS defaults and the controls
state their limitation in `noscript` content.

## Verification

Run:

```sh
pnpm check
pnpm test
CONTENT_INPUT_DIR=.inputs/content pnpm build
```

Pure Node tests cover schema/defaults, corruption, unavailable storage, write failure,
cross-window updates, reset, system media changes, four-theme/token structure, semantic
controls, and exclusion of transient state. PR CI remains the exact Astro/Starlight
build and preview-artifact authority.

Revalidate this boundary after a preference schema/key change, Astro/Starlight update,
font/license/catalog change, storage/media-query behavior change, accessibility-standard
change, or contradictory MAT-360/MAT-416 integration evidence.
