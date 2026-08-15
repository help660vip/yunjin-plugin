const row = (label, value) => ({ label, value });

export const FEATURE_CONTRACTS = Object.freeze({
  '01': { area: 'core', view: 'dashboard', access: 'user', usage: '查看插件运行状态、启用能力数、Node 与平台信息。', actions: ['查看'], args: [], dependencies: ['runtime'] },
  '02': { area: 'core', view: 'list', access: 'user', usage: '记录和查询异常描述，限制保存数量并写入审计。', actions: ['查看', '记录'], args: ['内容'], dependencies: ['storage', 'audit'] },
  '03': { area: 'core', view: 'table', access: 'admin', usage: '按当前 bot 与群查看结构化日志摘要。', actions: ['查看', '清理'], args: ['操作'], dependencies: ['storage', 'audit'] },
  '04': { area: 'core', view: 'table', access: 'admin', usage: '创建、完成和标记失败的外部事务记录。', actions: ['开始', '结束', '失败'], args: ['名称', '事务 ID'], dependencies: ['storage', 'locks'] },
  '05': { area: 'core', view: 'table', access: 'admin', usage: '维护 URL 健康检查目标，拒绝私网、重定向和超大响应。', actions: ['添加', '检查', '列表'], args: ['URL', '目标 ID'], dependencies: ['http', 'storage', 'scheduler'] },
  '06': { area: 'core', view: 'table', access: 'admin', usage: '创建、查看、取消可恢复的一次性提醒任务。', actions: ['添加', '列表', '取消'], args: ['时长', '内容', '任务 ID'], dependencies: ['scheduler', 'storage'] },
  '07': { area: 'core', view: 'list', access: 'user', usage: '按六个领域列出当前启用能力和权限。', actions: ['查看'], args: ['领域'], dependencies: ['registry', 'renderer'] },
  '08': { area: 'core', view: 'table', access: 'user', usage: '查看、校验、重载和修改全局/群/用户配置。', actions: ['查看', '获取', '设置', '重载', '校验'], args: ['作用域', '键', 'JSON 值'], dependencies: ['config', 'audit'] },
  '09': { area: 'governance', view: 'card', access: 'admin', usage: '显示当前 Yunzai OP、群管理员和能力权限摘要。', actions: ['查看'], args: [], dependencies: ['policy'] },
  '10': { area: 'governance', view: 'table', access: 'admin', usage: '维护 bot/群/用户名单，作用域由权限决定。', actions: ['添加', '删除', '列表'], args: ['名单类型', 'ID'], dependencies: ['storage', 'policy'] },
  '11': { area: 'governance', view: 'table', access: 'admin', usage: '查看群状态、开关和成员操作摘要。', actions: ['查看', '设置'], args: ['键', '值'], dependencies: ['bot', 'storage'] },
  '12': { area: 'governance', view: 'table', access: 'admin', usage: '记录群事件计数和最近事件，按 bot/群隔离。', actions: ['查看', '清理'], args: ['操作'], dependencies: ['storage', 'audit'] },
  '13': { area: 'governance', view: 'table', access: 'master', usage: '维护自动入群允许列表和处理结果。', actions: ['添加', '删除', '列表'], args: ['群号'], dependencies: ['bot', 'storage'] },
  '14': { area: 'governance', view: 'table', access: 'master', usage: '维护好友申请处理记录和允许名单。', actions: ['添加', '删除', '列表'], args: ['用户 ID'], dependencies: ['bot', 'storage'] },
  '15': { area: 'governance', view: 'table', access: 'admin', usage: '维护词语规则并对新消息执行可审计的命中检测。', actions: ['添加', '删除', '列表'], args: ['词语'], dependencies: ['storage', 'audit'] },
  '16': { area: 'governance', view: 'table', access: 'admin', usage: '维护广告 URL/词语规则，命中后只在具备撤回能力时处理。', actions: ['添加', '删除', '列表'], args: ['规则'], dependencies: ['storage', 'bot', 'audit'] },
  '17': { area: 'governance', view: 'card', access: 'admin', usage: '按明确消息 ID 批量撤回，并记录不支持的协议能力。', actions: ['撤回'], args: ['消息 ID'], dependencies: ['bot', 'audit'] },
  '18': { area: 'feeds', view: 'table', access: 'admin', usage: '维护通用订阅目标、周期和投递范围。', actions: ['添加', '删除', '列表'], args: ['目标', '周期'], dependencies: ['storage', 'scheduler', 'notification'] },
  '19': { area: 'feeds', view: 'table', access: 'admin', usage: '订阅 RSS/Atom，读取标题并缓存失败回退。', actions: ['添加', '读取', '删除', '列表'], args: ['URL', '订阅 ID'], dependencies: ['http', 'storage', 'cache'] },
  '20': { area: 'feeds', view: 'table', access: 'admin', usage: '记录 B 站内容订阅与最近推送去重键。', actions: ['添加', '删除', '列表'], args: ['UID/URL'], dependencies: ['http', 'storage', 'scheduler'] },
  '21': { area: 'feeds', view: 'table', access: 'admin', usage: '创建定时广播并检查目标 bot 的发送能力。', actions: ['添加', '列表', '取消'], args: ['时长', '内容'], dependencies: ['scheduler', 'notification'] },
  '22': { area: 'feeds', view: 'table', access: 'admin', usage: '生成当前群/用户的摘要报告并允许文本降级。', actions: ['生成', '列表'], args: ['范围'], dependencies: ['storage', 'renderer'] },
  '23': { area: 'feeds', view: 'admin', access: 'admin', usage: '查看推送队列、失败次数和重试状态。', actions: ['查看', '重试'], args: ['推送 ID'], dependencies: ['notification', 'storage'] },
  '24': { area: 'feeds', view: 'card', access: 'user', usage: '聚合多个已配置信息源的今日摘要。', actions: ['查看', '刷新'], args: ['来源'], dependencies: ['http', 'cache', 'renderer'] },
  '25': { area: 'feeds', view: 'table', access: 'admin', usage: '记录 Git 远端轮询目标和变更去重状态。', actions: ['添加', '检查', '列表'], args: ['URL'], dependencies: ['http', 'scheduler', 'storage'] },
  '26': { area: 'feeds', view: 'card', access: 'user', usage: '通过可替换天气适配器查询城市当前天气。', actions: ['查询'], args: ['城市'], dependencies: ['http', 'cache'] },
  '27': { area: 'tools', view: 'card', access: 'user', usage: '使用可选在线提供方翻译文本，服务不可用时保留原文。', actions: ['翻译'], args: ['文本'], dependencies: ['http', 'config'] },
  '28': { area: 'tools', view: 'list', access: 'user', usage: '生成受限图片搜索查询链接，不下载不可信内容。', actions: ['搜索'], args: ['关键词'], dependencies: ['http'] },
  '29': { area: 'tools', view: 'card', access: 'user', usage: '生成二维码链接，渲染器不可用时返回安全 URL。', actions: ['生成'], args: ['文本/URL'], dependencies: ['http', 'renderer'] },
  '30': { area: 'tools', view: 'card', access: 'user', usage: '生成大尺寸二维码链接并返回输入摘要。', actions: ['生成'], args: ['文本/URL'], dependencies: ['http', 'renderer'] },
  '31': { area: 'tools', view: 'table', access: 'user', usage: '生成本地短码并按 bot/群/用户解析，不调用未配置的公网短链服务。', actions: ['生成', '解析'], args: ['URL', '短码'], dependencies: ['storage'] },
  '32': { area: 'tools', view: 'card', access: 'user', usage: '查询百科摘要并显示来源链接。', actions: ['查询'], args: ['关键词'], dependencies: ['http', 'cache'] },
  '33': { area: 'tools', view: 'card', access: 'user', usage: '查询汇率并校验货币代码和金额。', actions: ['换算'], args: ['金额', '源货币', '目标货币'], dependencies: ['http', 'cache'] },
  '34': { area: 'tools', view: 'table', access: 'user', usage: '维护按用户隔离的待办并支持完成状态。', actions: ['添加', '完成', '列表'], args: ['内容', '待办 ID'], dependencies: ['storage'] },
  '35': { area: 'tools', view: 'card', access: 'user', usage: '显示明确时区的当前时间和时间戳。', actions: ['查看'], args: ['时区'], dependencies: ['clock'] },
  '36': { area: 'media', view: 'card', access: 'user', usage: '解析安全 URL 的协议、主机、路径和查询参数。', actions: ['解析'], args: ['URL'], dependencies: ['http'] },
  '37': { area: 'media', view: 'table', access: 'user', usage: '维护歌曲候选和随机选择结果，不抓取受限音源。', actions: ['添加', '随机', '列表'], args: ['歌曲'], dependencies: ['storage'] },
  '38': { area: 'media', view: 'card', access: 'user', usage: '根据公开模板生成安全文字梗图描述，图片失败时返回文字。', actions: ['生成'], args: ['模板', '文字'], dependencies: ['renderer'] },
  '39': { area: 'media', view: 'table', access: 'user', usage: '保存消息中的图片引用，限制 URL、数量和保留时间。', actions: ['保存', '列表', '删除'], args: ['图片'], dependencies: ['storage', 'http'] },
  '40': { area: 'media', view: 'card', access: 'user', usage: '记录语音/文件引用的元数据，不伪造媒体转换成功。', actions: ['记录', '列表'], args: ['引用'], dependencies: ['storage'] },
  '41': { area: 'media', view: 'table', access: 'admin', usage: '维护触发词自动回复规则并限制响应长度。', actions: ['添加', '删除', '列表'], args: ['触发词', '回复'], dependencies: ['storage', 'audit'] },
  '42': { area: 'media', view: 'table', access: 'admin', usage: '维护按群隔离的词库，供回复和内容规则使用。', actions: ['添加', '删除', '列表'], args: ['词语'], dependencies: ['storage'] },
  '43': { area: 'media', view: 'card', access: 'admin', usage: '从消息聚合管线读取群摘要，不保存不必要的私聊原文。', actions: ['生成', '清理'], args: ['范围'], dependencies: ['storage', 'renderer'] },
  '44': { area: 'community', view: 'card', access: 'user', usage: '按 bot/群/用户隔离每日签到和积分。', actions: ['签到', '排行'], args: [], dependencies: ['storage', 'clock'] },
  '45': { area: 'community', view: 'card', access: 'user', usage: '记录和查询群内引用内容，支持删除和隐私清理。', actions: ['添加', '列表', '删除'], args: ['内容'], dependencies: ['storage'] },
  '46': { area: 'community', view: 'table', access: 'admin', usage: '维护精华消息引用，不在本地复制完整聊天记录。', actions: ['添加', '删除', '列表'], args: ['消息 ID'], dependencies: ['bot', 'storage'] },
  '47': { area: 'community', view: 'card', access: 'admin', usage: '根据聚合计数展示群活跃度，不输出个人敏感排名。', actions: ['查看', '重置'], args: ['周期'], dependencies: ['storage', 'renderer'] },
  '48': { area: 'community', view: 'table', access: 'admin', usage: '查询按群隔离的历史统计并支持数据清理。', actions: ['查看', '清理'], args: ['范围'], dependencies: ['storage'] },
  '49': { area: 'community', view: 'table', access: 'user', usage: '维护活动报名状态与去重参与者。', actions: ['开启', '关闭', '参加', '列表'], args: ['活动名'], dependencies: ['storage', 'policy'] },
  '50': { area: 'community', view: 'card', access: 'user', usage: '生成按用户隔离的每日任务并记录完成状态。', actions: ['查看', '完成'], args: [], dependencies: ['storage', 'clock'] }
});

export function contractFor(id) {
  return FEATURE_CONTRACTS[String(id).padStart(2, '0')] || null;
}

export function contractRows(id) {
  const contract = contractFor(id);
  if (!contract) return [];
  return [
    row('领域', contract.area),
    row('权限', contract.access),
    row('用途', contract.usage),
    row('操作', contract.actions.join('、')),
    row('依赖', contract.dependencies.join('、'))
  ];
}

export function validateContractSet(manifests) {
  const ids = new Set((manifests || []).map((manifest) => String(manifest.id).padStart(2, '0')));
  const missing = Object.keys(FEATURE_CONTRACTS).filter((id) => !ids.has(id));
  const extra = [...ids].filter((id) => !FEATURE_CONTRACTS[id]);
  return { ok: missing.length === 0 && extra.length === 0, missing, extra, count: ids.size };
}
