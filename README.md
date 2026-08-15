# 云锦插件

> TRSS Yunzai / Miao Yunzai 模块化综合插件。
>
> 默认命令空间为 `云锦`，例如 `#云锦帮助`。

## 功能

| 分类 | 内容 |
| :--- | :--- |
| 核心与运维 | 状态、帮助、配置、权限、日志、任务与监控 |
| 群管理 | 名单、事件、过滤、反广告、撤回与群设置 |
| 订阅与推送 | 通用订阅、 RSS、B 站、定时播报与信息源 |
| 工具与媒体 | 翻译、图片、二维码、短链、待办、点歌与图片处理 |
| 社区能力 | 签到、语录、精华消息、群活跃、报名与日任务 |

共有 50 项能力，请发送 `#云锦帮助` 查看当前清单。

## 安装

将仓库放入 Yunzai 插件目录：

```bash
git clone https://github.com/help660vip/yunjin-plugin.git ./yunjin-plugin
```

安装依赖：

```bash
cd yunjin-plugin
npm install
```

重启 Yunzai 后发送 `#云锦帮助`检查是否加载成功。

## 常用入口

| 命令 | 作用 |
| :--- | :--- |
| `#云锦帮助` | 查看当前功能和参数 |
| `#云锦状态` | 查看运行状态和依赖健康 |
| `#云锦配置` | 查看或修改允许范围内的配置 |
| `#云锦权限` | 查看权限摘要 |
| `#云锦订阅` | 管理订阅与推送 |
| `#云锦签到` | 使用社区签到 |

参数错误、权限不足、依赖缺失和频率超限时会返回可读提示。

## 配置与权限

Yunzai 主人即全局 OP。群管理操作默认需要当前群管理员权限，用户数据按用户隔离。

| 配置项 | 说明 |
| :--- | :--- |
| `enabled` | 是否启用插件 |
| `prefix` | 主命令前缀，默认为 `#云锦` |
| `aliases` | 可选别名，不主动添加旧命令 |
| `storage` | 优先 Redis，失败时安全回退 |
| `render` | 优先宿主渲染，失败时返回文字 |
| `http` | 网络、SSRF、重定向和大小限制 |

请勿在群聊中发送 Cookie、Token、密钥或其他账号凭据。

## 安全与降级

- 网络请求拦截私网地址、危险重定向和超大响应。
- 文件、图片、二维码和 URL 都有大小与长度边界。
- Redis 或渲染不可用时，非关键能力降级为文字。
- 审计记录会脱敏敏感字段并限制深度、长度和集合大小。

## 开发检查

```bash
npm run lint
npm test
npm run test:features
npm run test:compat:trss
npm run test:compat:miao
npm run test:render
npm run test:smoke
npm run pack:dry-run
npm run audit:references
```

## 许可证

本项目采用 MIT 许可证，详见 `LICENSE`。第三方参考项目和许可证信息见 `THIRD_PARTY_NOTICES.md`。

如果遇到问题，请提供 Yunzai 类型、Node.js 版本、触发命令和脱敏后的错误信息。
