# M5.5 multi-representation mathematical block

`src/components/MathematicalBlock.astro` is the website-owned MAT-360 component. It
does not generate or verify mathematics. A qualified build input supplies one block
identity, exact representation states and provenance, LaTeX/Lean source strings, and a
named rendered slot produced by the qualified math renderer.

## Version-1 input boundary

Every input has `schemaVersion: 1`, a non-empty `identity.contentId`,
`identity.blockId`, `identity.revision`, a title, and exactly `rendered`, `latex`, and
`lean` records. Each record carries:

* one availability state: `current`, `unavailable`, `pending`, `stale`,
  `incompatible`, `withdrawn`, or `disputed`;
* one correspondence state: `exact`, `scoped`, `related`, `unreviewed`,
  `unavailable`, `stale`, or `disputed`;
* an exact provenance `subject` and `revision`;
* a qualified `mathml`/`qualified-equivalent` renderer kind for rendered math, or an
  exact source string for LaTeX/Lean.

Only a current record with its required payload becomes a tab. Every state remains in
the adjacent status/provenance list. The component never derives a verification claim
from compilation, source presence, or correspondence spelling. Invalid/incompatible
input fails the component boundary instead of being silently repaired in the browser.

The rendered slot is a trust boundary. MAT-360 neither parses arbitrary raw HTML nor
sanitizes/generates MathML. Callers must pass renderer-owned semantic markup, never an
image-only substitute. LaTeX and Lean are escaped by Astro into selectable `pre/code`
surfaces.

## Static and enhanced behavior

Without JavaScript, every current representation is an ordinary titled section and
source/provenance evidence remains readable. JavaScript exposes the pre-rendered local
panels as an APG horizontal tablist. Automatic activation is intentional because no
panel is fetched or generated on focus:

* Tab enters on the active tab and then proceeds into the active panel;
* Left/Right wrap and activate; Home/End activate the endpoints;
* Enter/Space activate; Up/Down retain native page scrolling;
* roles, selection, controls and labelling relationships are installed together only
  after enhancement succeeds.

English is the root default. A caller for a future qualified locale supplies the
component's bounded `labels` object, including view/state names and live-message
templates. That object changes chrome only; it cannot change block identity, source
provenance, route, or document language.

Long math and source scroll inside their own bounded container. The component uses the
shared MAT-357 tokens, target sizes, focus, reduced-motion and forced-colors policy.

## Effective view and reset

The block consumes `window.FMCPreferenceStore`; it never touches Web Storage.

```text
requested = local override ?? global representationDefault
effective = requested when current/operable, otherwise first of rendered → LaTeX → Lean
```

Selecting a tab creates only an in-memory override for that mounted instance. `Use
global default (<label>)` clears it. Global/store events update only blocks without an
override. The store reset event clears mounted overrides. A missing requested view is
announced and does not rewrite the global preference. With no operable view, the block
shows an explicit unavailable state and exact provenance.

## Copy policy

Copy is invoked only by an explicit 44×44-target button. Build time encodes the exact
source scalar string as UTF-8/base64; the browser reverses that encoding and passes the
result directly to `navigator.clipboard.writeText`. MAT-360 performs no trimming,
newline conversion, or source normalization. Success and rejection/unavailability are
announced politely without focus movement; the visible source always remains
selectable.

## Verification and limitations

Run `pnpm check`, `pnpm test`, and the normal qualified build. Pure Node tests cover
the frozen R01–R16 matrix: defaults, local/global transitions, reset, missing/stale
states, keyboard/ARIA source contract, MathML slot boundary, exact copy round-trip,
overflow/no-JS CSS and locale/identity isolation.

This baseline does not populate course content, create translations, generate MathML,
prove Lean correspondence, deploy, or claim browser/assistive-technology conformance.
MAT-375 owns integrated component qualification and M5.6 owns the representative
publication slice. Revalidate on schema/provenance, renderer, preference-store,
Astro/Starlight/runtime, APG, MathML or Clipboard API changes.
