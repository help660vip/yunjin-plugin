# Changelog

## 1.0.3 - 2026-08-15

### Fixed

- Made the release-state verifier read the published package version instead of relying on a stale hard-coded version.

## 1.0.2 - 2026-08-15

### Fixed

- Hardened feature input validation, scope isolation, permission checks, rate limits, quotas, and audit redaction.
- Added safe network, file, MIME, path, redirect, and private-network handling with controlled fallbacks.
- Stabilized scheduler persistence, task deduplication, locking, recovery, and optional Redis fallback.

### Added

- Added capability health, dependency, rendering, storage, privacy, and failure-policy metadata for all 50 commands.
- Added TRSS-Yunzai and Miao-Yunzai compatibility adapters with text fallback when optional capabilities are unavailable.
