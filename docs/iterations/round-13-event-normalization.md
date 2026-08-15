# 第 13 轮：事件字段归一化

## 更新内容

- 事件入口兼容 isMaster 、is_master 和 sender 中的主人标记。
- 布尔 true、字符串 true 和数字 1 会统一归一为 true。
- 字符串 false、数字 0 和其他值不会误判为 OP。
- 保留 sender/member 角色信息，增加 TRSS/Miao 字段回归测试。

## 边界行为

- 归一化只改变内部字段类型，不改变 raw 原始事件。
- 角色仍由权限策略进一步判断，不仅凭字段存在就放行。
