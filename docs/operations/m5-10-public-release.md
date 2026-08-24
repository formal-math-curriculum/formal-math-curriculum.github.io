# M5.10 public release control

The `p5-web-v0.1.0` release is authorized only by `validation/m5-10-current.json` and its exact M5.10 record. The selector, record, workflow, prepared artifact, GitHub Pages deployment, durable GitHub Release and published provenance must describe one coherent tuple.

The application candidate is `cc137e0f47e324acbb8b864212a1dd4387c54d23` (tree `99033aa8185141b7b5a5346ea70533086af2eb24`). M5.10 changes are limited to release control, validation, tests, workflow, documentation and evidence. The release validator compares the current head with that candidate and fails if any other path changed.

The production workflow remains manually dispatched. It validates the exact tuple, rebuilds from the frozen content commit, runs every mandatory qualification gate, removes validation-only routes and evidence, regenerates the public artifact manifest, packages a reproducible `site-dist.tar.zst`, attests the distributable, and uploads the exact required assets to a draft GitHub Release. It deploys that same prepared `dist`, verifies the public origin and only then publishes the release.

Before deployment, the workflow binds the release tag directly to the exact workflow commit and refuses an existing mismatched tag or a published release. A retry after a partial run may reuse only an existing draft: it replaces every staged asset, downloads the draft again and byte-compares all six files before deployment. Publication verifies the tag and draft state before transition, then confirms both the published state and unchanged tag target.

## Accessibility risk decision

P5-DEC-033 is an accepted, narrowly scoped product risk. Accessibility-only failures and unavailable manual assistive-technology execution are nonblocking. A10 remains `blocked_manual_required`, is not represented as pass, and no WCAG or screen-reader conformance claim is made. Mandatory functional portions of mixed checks remain blocking.

## Rollback rehearsal and execution

Rollback uses a reviewed PR to select a previously qualified complete release tuple and a fresh manual workflow dispatch. The same exact-tuple, qualification, packaging, attestation, deploy and public-origin verification gates apply. The operator must never force-move `main` or a published tag, reuse an Actions preview artifact as release authority, reuse a published version/tag, or combine assets and provenance from different releases.

The automated tests rehearse the fail-closed boundary by rejecting unauthorized, stale, incompatible, traversal and mixed-tuple fixtures. Packaging also refuses a prepared artifact whose public provenance does not match the requested source revision, tag and release-record digest.
