export function renderConfigHelp() {
  return [
    '云锦配置中心',
    '#云锦帮助',
    '#云锦 配置 查看',
    '#云锦 配置 获取 <全局|群|用户> <键>',
    '#云锦 配置 设置 <全局|群|用户> <键> <JSON值>',
    '#云锦 配置 重载',
    '#云锦 配置 校验'
  ].join('\n');
}

export function renderConfigResult(result) {
  if (!result) return '云锦配置：没有结果。';
  if (result.ok === false) {
    if (result.errors) return `云锦配置校验失败：${result.errors.map((item) => `${item.key}=${item.error}`).join('；')}`;
    return `云锦配置操作失败：${result.error ?? 'unknown_error'}`;
  }
  if (result.values) return ['云锦配置', ...Object.entries(result.values).map(([key, value]) => `${key}: ${formatValue(value)}`)].join('\n');
  if (Object.hasOwn(result, 'value')) return `${result.key}: ${formatValue(result.value)}`;
  if (result.action === 'updated') return `云锦配置已更新：${result.key}=${formatValue(result.value)}`;
  if (result.action === 'reloaded') return '云锦配置已重载。';
  if (result.action === 'valid') return '云锦配置校验通过。';
  return '云锦配置操作完成。';
}

function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
