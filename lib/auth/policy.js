const SCOPE_ALIASES = Object.freeze({
  global: 'global', '全局': 'global',
  group: 'group', '群': 'group', '群组': 'group',
  user: 'user', '用户': 'user'
});

function scopeName(value) {
  return SCOPE_ALIASES[String(value || '').trim().toLowerCase()] || '';
}

function identity(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return '';
  const text = String(value).trim();
  if (!text || text.length > 128 || /[\u0000-\u001f\u007f]/u.test(text)) return '';
  return text;
}

function accessName(value) {
  if (value === undefined || value === null) return 'user';
  const name = String(value).trim().toLowerCase();
  return ['user', 'admin', 'master'].includes(name) ? name : '';
}

export function isYunzaiOwner(event) {
  const value = event?.isMaster;
  return value === true || value === 1 || ['true', '1'].includes(String(value).trim().toLowerCase());
}

export function isGroupAdmin(event) {
  const role = String(event?.role || '').trim().toLowerCase();
  return Boolean(isYunzaiOwner(event) || ['owner', 'admin', 'administrator'].includes(role));
}

export function canReadConfig(event) {
  return Boolean(identity(event?.userId)) || isYunzaiOwner(event);
}

export function canUseFeature(event, manifest) {
  const required = accessName(manifest?.access);
  if (!required) return false;
  if (required === 'master') return isYunzaiOwner(event);
  if (required === 'admin') return isGroupAdmin(event);
  return Boolean(identity(event?.userId)) || isYunzaiOwner(event);
}

export function canWriteConfig(event, scope = { name: 'global' }) {
  const name = scopeName(typeof scope === 'string' ? scope : scope?.name || 'global');
  const id = typeof scope === 'string' ? '' : identity(scope?.id);
  const targetId = id || (name === 'group' ? identity(event?.groupId) : name === 'user' ? identity(event?.userId) : '');
  if (!name) return false;
  if (isYunzaiOwner(event)) return true;
  if (name === 'global') return false;
  if (name === 'group') return isGroupAdmin(event) && Boolean(targetId) && targetId === identity(event?.groupId);
  if (name === 'user') return Boolean(targetId) && targetId === identity(event?.userId);
  return false;
}
