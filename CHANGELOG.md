# Changelog

## v1.0.0

### Added

- Added the YunJin runtime adapter, deterministic feature registry, event normalization, storage boundary, logging, audit and text reply services.
- Added the configuration center with global, group and user scopes, schema validation, atomic file persistence and hot reload.
- Added `#云锦 配置` commands for viewing, reading, updating, reloading and validating configuration.

### Compatibility

- Supports the shared JavaScript ESM plugin conventions used by TRSS-Yunzai and Miao-Yunzai.
- Falls back to text replies when optional rendering or host capabilities are unavailable.
