# Changelog

All notable changes use the sections required by the M5.8 release policy. Versions follow SemVer; release candidates use `p5-web-vX.Y.Z-rc.N` and immutable releases use `p5-web-vX.Y.Z`.

## [Unreleased]

### Added

- Executable M5.8 contracts for dependency licensing, release assets, retention, reproducibility, privacy, redirects, recovery, and rollback.
- A deterministic 440-package Linux x64 glibc dependency inventory with deduplicated third-party texts.

### Changed

- The site input lock now pins content commit `3a1e87c7c55c7b17e9fa7b3eb4deafd8b991e828` and its M5.8 external-snapshot policy.
- CI and manual Pages builds disable Astro telemetry and validate M5.8 contracts before building.

### Deprecated

- None.

### Removed

- None.

### Fixed

- Preview artifacts and Actions logs can no longer be interpreted as durable release or rollback authorities.

### Security

- Deployment remains fail-closed and manual; MAT-367 does not authorize a release candidate or production deployment.
