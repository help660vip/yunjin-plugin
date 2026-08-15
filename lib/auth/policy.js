const SCOPE_ALIASES = Object.freeze({
  global: 'global', '\u5168\u5c40': 'global',
  group: 'group', '\u7fa4': 'group', '\u7fa4\u7ec4': 'group',
  user: 'user', '\u7528\u6237': 'user'
});

function scopeName(value) {
  return SCOPE_ALIASES[String(value || '').trim().toLowerCase()] || '';
}

export function isYunzaiOwner(event) {
  const value = event?.isMaster;
  return value === true || value === 1 || String(value).trim().toLowerCase() === 'true';
}

export function isGroupAdmin(event) {
  return Boolean(isYunzaiOwner(event) || ['owner', 'admin', 'administrator'].includes(String(event?.role || '').toLowerCase()));
}

export function canReadConfig(event) {
  return Boolean(String(event?.userId || '').trim()) || isYunzaiOwner(event);
}

export function canUseFeature(event, manifest) {
  const required = manifest?.access ?? 'user';
  if (required === 'master') return isYunzaiOwner(event);
  if (required === 'admin') return isGroupAdmin(event);
  return Boolean(String(event?.userId || '').trim()) || isYunzaiOwner(event);
}

export function canWriteConfig(event, scope = { name: 'global' }) {
  const name = scopeName(typeof scope === 'string' ? scope : scope?.name || 'global');
  const id = typeof scope === 'string' ? '' : String(scope?.id || '');
  const targetId = id || (name === 'group' ? String(event?.groupId || '') : name === 'user' ? String(event?.userId || '') : '');
  if (!name) return false;
  if (isYunzaiOwner(event)) return true;
  if (name === 'global') return false;
  if (name === 'group') return isGroupAdmin(event) && Boolean(targetId) && targetId === String(event?.groupId || '');
  if (name === 'user') return Boolean(targetId) && targetId === String(event?.userId || '');
  return false;
}
