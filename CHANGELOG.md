# Changelog

## 1.0.1 - 2026-08-15

### Added

- 统一 `#云锦` 命令空间。
- 接入 50 项独立 manifest、插件入口和 service 边界。
- 增加 TRSS-Yunzai/Miao-Yunzai 事件适配、Yunzai OP 权限、群管理员权限、配置、审计、JSON repository、持久化调度、安全 HTTP 和渲染文本降级。
- 增加 50 项能力的产品帮助、配置开关和内部 source-audit。

### Fixed

- 修复重复 FeatureRegistry 声明导致的启动语法错误。
- 修复消息段、`e.msg`、`e.raw_message`、bot 缺失和 `e.isMaster` 适配边界。
- 修复统一命令前缀和能力命令冲突问题。
