## v1.1.0

## v1.2.2

- 19 RSS 订阅：增加任务失败回滚，严格校验 URL、读取、删除和调度依赖，修复输出乱码。


## v1.2.1

- 18 订阅中心：增加失败回滚订阅记录，严格校验目标、周期和群聊操作边界。


## v1.2.0

- 17 批量撤回：隔离确认词与消息 ID，去重执行并拒绝非法标识。


## v1.1.9

- 16 反广告：严格校验群聊规则、限制危险协议和超长输入，补充增删列表审计。


## v1.1.8

- 15 词语过滤：收紧群聊上下文、规则长度和控制字符边界，补充列表、删除审计。


## v1.1.7

- 14 好友申请：严格校验用户 ID 和动作参数，补充增删列表审计。


## v1.1.6

- 13 自动入群：严格校验群号和动作参数，补充增删审计。


## v1.1.5

- 12 事件监控：严格限制群聊和清理参数，报告清理数量并补充查看、清理审计。


## v1.1.4

- 11 群管理：严格限制群聊上下文、设置参数和键值边界，补充查看审计。


## v1.1.3

- 10 名单：严格校验动作、类型和 ID，按类型与 ID 共同删除并记录审计。


## v1.1.2

- 09 权限控制：严格校验查看参数，展示全局、群和用户配置的有效权限，并写入权限查看审计。


## v1.1.1

- 08 配置中心：严格校验操作参数和作用域上下文，补齐配置依赖不可用降级，并记录查看、获取、校验审计。


- ?? 07 ?????????????????????????????
- ???????????????????????????
- ?????????????????????
## v1.0.13

- ?? 06 ?????????????????????????????
- ????????????????????
- ????????????????
## v1.0.12

- ?? 05 URL ????? URL ????? ID ?????????????
- ??????????????????????????????
- ????????????????
## v1.0.11

- 增强 04 事务记录：结束与失败通过原子状态更新完成，避免并发覆盖。
- 已结束事务的重复操作只记录审计，不再改变终态或耗时。
- 增加直接启动、未知动作和终态幂等回归覆盖。
## v1.0.10

- 增强 03 日志归档：严格校验查看与清理动作，避免未知参数静默落入查看。
- 清理日志返回实际条数，空作用域给出明确反馈，审计事件记录清理数量。
- 增加未知动作、清理数量和重复清理回归覆盖。
## v1.0.9

- 增强 02 异常记录：同一机器人和作用域内的相同异常按指纹合并，并累计重复次数。
- 异常列表展示累计次数，审计事件记录新增或重复更新结果。
- 增加 02 能力的跨作用域隔离与重复上报回归测试。
# Changelog

## 1.0.8 - 2026-08-15

### Added

- Enhanced #云锦状态 with scheduler, notification queue, host capability, and renderer health summaries while retaining text fallback.

## 1.0.7 - 2026-08-15

### Fixed

- Removed the npm cache requirement from Linux CI so the lockfile-free package installs reproducibly.

## 1.0.6 - 2026-08-15

### Fixed

- Repaired Linux CI matrix interpolation and removed the invalid frozen-lockfile assumption.
- Added reproducible install, full feature, TRSS/Miao, render, smoke, and package checks.

## 1.0.5 - 2026-08-15

- Added persistent push queue records and real notification retry handling for `#云锦推送`.
- Added strict request event type validation before auto-approval.
- Added per-reference L0 clean-room third-party notices.

- Added request-event adapters for the auto-enter-group and add-friends capabilities.
- Added bot-scoped request approval records with flag deduplication and fail-closed protocol fallback.
- Added normalized request metadata (`postType`, `requestType`, `subType`, `flag`, and `comment`).

### Added

- Added persistent passive collection for event, group summary, group heat, and group history views.
- Added periodic URL monitoring, Bilibili subscriptions, and Git polling with task cleanup.

### Fixed

- Enforced bot/group/user task scope checks and private-chat storage isolation.
- Made user and group configuration commands reachable while keeping global writes OP-only.
- Added explicit confirmation for batch withdrawal and regression coverage for scheduler and telemetry behavior.

- Added the shared renderer path for image, QR, and meme capabilities with text fallback.
- Fixed rendered segment replies so host adapters receive message segments instead of serialized objects.

## 1.0.4 - 2026-08-15

- Runtime commands now dispatch through the concrete 50-feature handler set.
- Fixed scheduler retry scheduling, attempt limits, and interrupted-task recovery.
- Hardened configuration scope aliases, state sanitization, and Yunzai OP/current-scope permissions.
- Enabled group members to join signup events while keeping event management admin-only.
- Repaired generated service failure messages and health checks; added regression coverage.

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

## v1.2.3

- Hardened Bilibili subscriptions with strict arguments, HTTPS URL validation, scheduler fallback, duplicate task detection, rollback on task creation failure, cancellation accounting, and audit events.

## v1.2.4

- Packaging follow-up: the hardened Bilibili subscription implementation and its regression suite are delivered in this valid release after the prior tag was already public.

## v1.2.5

- Hardened scheduled broadcasts with explicit group isolation, scoped cancellation, strict action arguments, bounded content, dependency fallback, failure audits, and regression coverage.

## v1.2.6

- Hardened group reports with explicit chat scope, strict actions, bounded persisted history, readable storage failure handling, and audit coverage.
