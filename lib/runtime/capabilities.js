export function detectCapabilities(event = {}) {
  const runtime = event.runtime ?? {};
  const bot = event.bot ?? globalThis.Bot ?? {};
  const name = String(runtime.name ?? runtime.type ?? '').toLowerCase();
  const family = name.includes('trss') ? 'trss' : name.includes('miao') ? 'miao' : 'unknown';
  return Object.freeze({
    family,
    canSendGroupMsg: typeof bot.pickGroup === 'function' || typeof bot.sendGroupMsg === 'function',
    canDeleteMsg: typeof bot.deleteMsg === 'function',
    canMute: typeof bot.setGroupBan === 'function',
    canRender: Boolean(runtime.puppeteer?.browserInit || runtime.renderer),
    hasRedis: Boolean(runtime.redis || globalThis.redis)
  });
}
