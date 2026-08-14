export function isYunzaiOwner(event) {
  return Boolean(event?.isMaster === true);
}

export function isGroupAdmin(event) {
  return Boolean(event?.isMaster === true || ['owner', 'admin', 'administrator'].includes(event?.role));
}

export function canReadConfig(event) {
  return Boolean(event?.userId || event?.isMaster);
}

export function canUseFeature(event, manifest) {
  const required = manifest?.access ?? 'user';
  if (required === 'master') return isYunzaiOwner(event);
  if (required === 'admin') return isGroupAdmin(event);
  return Boolean(event?.userId || event?.isMaster);
}

export function canWriteConfig(event, scope = { name: 'global' }) {
  const name = typeof scope === 'string' ? scope : scope.name;
  if (name === 'global') return isYunzaiOwner(event);
  if (name === 'group') return isGroupAdmin(event);
  if (name === 'user') return Boolean(event?.userId || event?.isMaster);
  return false;
}
