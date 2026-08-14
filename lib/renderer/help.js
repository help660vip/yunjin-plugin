export function renderHelp(manifests, pageSize = 20) {
  const visible = manifests.filter((manifest) => manifest.enabled).slice(0, pageSize);
  const lines = ['云锦帮助'];
  for (const manifest of visible) {
    lines.push(manifest.id + ' ' + manifest.name);
    for (const command of manifest.commands ?? []) lines.push('  ' + command);
  }
  if (!visible.length) lines.push('当前没有启用的能力。');
  return lines.join('\n');
}

export function renderModules(manifests) {
  return ['云锦模块', ...manifests.map((manifest) => manifest.id + ' ' + (manifest.enabled ? '启用' : '关闭') + ' ' + manifest.name)].join('\n');
}
