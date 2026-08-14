export function canReadConfig(event) {
  return Boolean(event.userId || event.isMaster);
}

export function canWriteConfig(event, scope = { name: 'global' }) {
  const name = typeof scope === 'string' ? scope : scope.name;
  if (name === 'global') return event.isMaster;
  if (name === 'group') return event.isMaster || event.role === 'owner' || event.role === 'admin' || event.role === 'administrator';
  if (name === 'user') return Boolean(event.userId);
  return false;
}
