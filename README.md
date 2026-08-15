# YunJin Plugin

面向 TRSS-Yunzai 与 Miao-Yunzai 的模块化综合插件。命令统一使用 `#云锦` 命名空间，具体能力使用自己的子命令，例如 `#云锦帮助`、`#云锦状态`、`#云锦天气`、`#云锦报名`。
帮助按六个领域分组展示当前命令，支持查看领域筛选。

## 安装

将本目录放入 Yunzai 的 `plugins/yunjin-plugin`，重启机器人即可。运行数据写入宿主 Yunzai 数据目录的 `data/yunjin-plugin`，不会写入插件源码目录。

## 权限

- 普通用户可使用标记为 user 的能力。
- 群管理员可使用当前群治理和管理能力。
- Yunzai 主人，即 `e.isMaster === true` 的 OP，拥有全局配置、模块开关和高风险管理权限。
- 不使用独立的 YunJin 主人名单替代 Yunzai OP；群管理员权限不会扩大为全局 OP 权限。

## 命令矩阵

### 底座与运行

`#云锦状态`、`#云锦报错`、`#云锦日志`、`#云锦事务`、`#云锦监控`、`#云锦调度`、`#云锦帮助`、`#云锦配置`
- 支持严格的查看、获取、设置、重载、校验边界；修改权限遵循 Yunzai OP、群管理员和用户作用域规则。
列表和取消动作会校验多余参数，取消成功会写入审计。
重复添加监控会保留原有编号并复用已有任务，调度失败会回滚新记录。
事务终态不会被重复更新，并会记录终止审计。
日志清理会返回实际条数，未知动作会返回用法提示。
重复异常会在当前作用域合并计数，并保留首次与最近发生时间。

- `#云锦状态` displays runtime, scheduler, notification, and renderer health with text fallback when host capabilities are unavailable.

### 权限与群治理

`#云锦权限`、`#云锦名单`、`#云锦群管`、`#云锦事件`、`#云锦入群`、`#云锦好友`、`#云锦脏词`、`#云锦反广告`、`#云锦撤回`
- 批量撤回需要明确消息 ID 和确认词，会去重 ID、拒绝非法标识并显式报告协议能力缺失。
- 反广告规则限制长度和控制字符，拒绝 javascript: 危险协议，增删与列表都记录审计。
- 好友申请名单严格校验用户 ID，并对增删和列表操作记录审计。
- 事件查看与清理严格校验群聊上下文，清理会报告受影响事件数并写入审计。
- 名单操作严格校验 bot、群、用户类型和 ID，删除按类型与 ID 共同匹配。
- 会显示当前身份对全局、群和用户配置的有效权限，多余参数会返回统一用法提示。

### 订阅与信息

`#云锦订阅`、`#云锦RSS`、`#云锦哔哩`、`#云锦定时广播`、`#云锦报告`、`#云锦推送`、`#云锦日报`、`#云锦更新`、`#云锦天气`
- 订阅创建与调度任务保持回滚一致，目标、周期、删除和群聊上下文都会严格校验。

### 日常工具

`#云锦翻译`、`#云锦搜图`、`#云锦二维码`、`#云锦二维码渲染`、`#云锦短链`、`#云锦百科`、`#云锦汇率`、`#云锦待办`、`#云锦时钟`

### 内容与媒体

`#云锦解析`、`#云锦点歌`、`#云锦表情`、`#云锦收图`、`#云锦语音`、`#云锦自动回复`、`#云锦词库`、`#云锦总结`
- 词语规则只在群聊生效，允许短语句但限制为 128 字符且拒绝控制字符。

### 社区互动

`#云锦签到`、`#云锦语录`、`#云锦精华`、`#云锦群活跃`、`#云锦群历史`、`#云锦报名`、`#云锦日任务`

## 使用示例

- `#云锦帮助`：查看 50 项当前启用能力。
- `#云锦配置 查看`：查看有效配置。
- `#云锦配置 设置 全局 feature.01.enabled true` 或 `#云锦配置 设置 群 <群号> feature.01.enabled true`：仅 Yunzai OP 可修改全局配置。
- `#云锦待办 添加 整理资料`、`#云锦待办 完成 <ID>`：管理个人待办。
- `#云锦时钟 10 提醒内容`：创建十分钟提醒。
- `#云锦报名 参加 周末活动`：参加报名活动。

- `#云锦配置 设置 用户 feature.01.enabled true`; `设置 群 <群 ID> ...` targets the current group.
- `#云锦监控 添加 https://example.com`; use `删除 <ID>` to remove it.
- `#云锦哔哩 添加 <UID>` creates a Bilibili subscription; `#云锦更新 添加 <URL>` creates a Git poller.
- All scheduled tasks and request approvals remain isolated by bot, group, and user scope.
## 运行与安全

插件使用 JavaScript ESM。统一事件适配支持 `e.msg`、`e.raw_message`、消息段、私聊、群聊、bot 缺失和 `e.isMaster`。Redis、外部网络和渲染器均为可选能力，缺失时使用文件存储、错误文本或纯文本降级。

外部 HTTP 请求统一执行协议检查、内网地址拦截、主机白名单、超时、响应大小限制和重定向拒绝。运行数据按 feature、群和用户隔离，审计日志会清理 token、cookie、password 和 api key 等敏感字段。

## 兼容与验收

```bash
pnpm lint
pnpm test
pnpm run test:compat:trss
pnpm run test:compat:miao
pnpm run test:render
pnpm run test:smoke
pnpm pack --dry-run
```

本地未安装 TRSS/Miao 时，compat 测试使用明确标注的 mock harness，不冒充真实机器人在线验证。

## 许可

本项目采用 MIT License。实现遵循公开行为契约，不复制参考项目源代码、测试、图片、字体或私有数据。第三方服务和声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

### Request event adapters

The command surface remains 50 unified `#云锦xx` commands. Two non-command event adapters are also exported for Yunzai request events:

- `#云锦入群 添加 <group_id>` maintains the bot-scoped auto-enter allow list.
- `#云锦好友 添加 <user_id>` maintains the bot-scoped friend-request allow list.

Matching OneBot/Yunzai request events are approved through `BotAdapter`. Missing request flags, missing protocol methods, disabled features, storage failures, and non-matching IDs fail closed. Approval results are retained in the same bot-scoped feature state for audit and duplicate suppression.

### Push delivery

The persisted queue is available through `#云锦推送`. Use `#云锦推送 重试 <ID>` to retry a failed scheduled notification. Queue records are isolated by bot and target scope; unsupported delivery capabilities remain explicit failures.

#云锦群管理
- 群管理设置只在群聊生效，严格校验键、值和多余参数。

#云锦自动入群
- 自动入群名单仅接受 1-64 位安全标识符，增删和列表操作都会记录审计。

#云锦 RSS
- RSS 订阅使用共享 URL 安全策略，调度任务创建失败会回滚订阅，读取失败保留可读错误。

### v1.2.3

- #云锦B站订阅 now validates UID and HTTPS space links, safely degrades without the scheduler, rolls back failed task creation, and audits subscription lifecycle operations.

### v1.2.4

- Bilibili subscription hardening is included in the current package and release chain.

### v1.2.5

- #云锦 broadcast tasks now enforce group scope and safe scheduling fallbacks.

### v1.2.6

- #云锦 group reports now enforce chat scope and safe persistence fallbacks.

### v1.2.7

- #云锦 push retries now enforce bounded attempts and readable dependency fallbacks.

### v1.2.8

- #云锦 information sources now use safe URL validation and readable refresh fallbacks.

### v1.2.9

- #云锦 Git polling now uses safe URL handling and transactional scheduler setup.

### v1.3.0

- #云锦 weather lookup now has bounded input and readable network fallbacks.

### v1.3.1

- #云锦 translation now degrades safely when no online provider is configured.

### v1.3.2

- #云锦 image search now enforces bounded keywords and quota-safe fallback.

### v1.3.3

- #云锦 QR generation now validates long text and URL input before rendering.

### v1.3.4

- #云锦 QR rendering now keeps a readable fallback for long or unsupported image output.

### v1.3.5

- #云锦 short links now validate URLs and prevent short-code collisions.
