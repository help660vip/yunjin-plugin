export function formatUptime(seconds) {
  let value = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(value / 86400);
  value %= 86400;
  const hours = Math.floor(value / 3600);
  value %= 3600;
  const minutes = Math.floor(value / 60);
  const remaining = value % 60;
  const parts = [];
  if (days) parts.push(days + 'd');
  if (hours) parts.push(hours + 'h');
  if (minutes) parts.push(minutes + 'm');
  parts.push(remaining + 's');
  return parts.join(' ');
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let amount = value;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return amount.toFixed(index ? 1 : 0) + ' ' + units[index];
}

export function formatCount(value) {
  return new Intl.NumberFormat('zh-CN').format(Math.max(0, Number(value) || 0));
}
