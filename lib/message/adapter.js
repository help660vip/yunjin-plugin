import { cleanText, limitArray } from '../core/safe.js';

function rawType(segment) {
  return String(segment?.type || segment?.kind || 'text').toLowerCase();
}

export function normalizeSegment(segment) {
  if (typeof segment === 'string') return { type: 'text', text: cleanText(segment, { max: 4000 }) };
  if (!segment || typeof segment !== 'object') return { type: 'text', text: '' };
  const type = rawType(segment);
  if (type === 'text') return { type: 'text', text: cleanText(segment.text ?? segment.data?.text ?? '', { max: 4000 }) };
  if (type === 'at' || type === 'mention') return { type: 'at', id: String(segment.qq ?? segment.id ?? segment.data?.qq ?? '') };
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'file') {
    return { type, url: String(segment.url ?? segment.data?.url ?? segment.file ?? segment.data?.file ?? ''), file: String(segment.file ?? segment.data?.file ?? ''), name: String(segment.name ?? segment.data?.name ?? ''), size: Number(segment.size ?? segment.data?.size ?? 0) || undefined, mime: String(segment.mime ?? segment.mimetype ?? segment.data?.mime ?? '') };
  }
  if (type === 'reply') return { type: 'reply', id: String(segment.id ?? segment.data?.id ?? '') };
  return { type, data: segment.data ?? segment };
}

export function normalizeMessage(message, options = {}) {
  const list = Array.isArray(message) ? message : [message];
  const segments = limitArray(list.map(normalizeSegment).filter((item) => item.type !== 'text' || item.text), options.maxSegments || 100);
  const text = segments.filter((item) => item.type === 'text').map((item) => item.text).join('');
  return { segments, text, has: (type) => segments.some((item) => item.type === type) };
}

export function createMessageFactory(segmentApi = globalThis.segment) {
  const api = segmentApi || {};
  return {
    text(value) {
      const text = cleanText(value, { max: 4000 });
      return typeof api.text === 'function' ? api.text(text) : text;
    },
    image(value) {
      const url = String(value?.url || value || '');
      return typeof api.image === 'function' ? api.image(url) : '[图片] ' + url;
    },
    at(id) {
      const value = String(id || '');
      return typeof api.at === 'function' ? api.at(value) : '@' + value;
    },
    reply(id) {
      const value = String(id || '');
      return typeof api.reply === 'function' ? api.reply(value) : '';
    },
    join(parts) {
      return parts.filter((part) => part !== undefined && part !== null && part !== '').join('');
    }
  };
}

export function detectCapabilities(event, bot = event?.bot) {
  const value = bot || {};
  return Object.freeze({
    reply: typeof event?.reply === 'function' || typeof event?.raw?.reply === 'function',
    sendMsg: typeof value.sendMsg === 'function' || typeof value.sendMessage === 'function',
    deleteMsg: typeof value.deleteMsg === 'function',
    setGroupBan: typeof value.setGroupBan === 'function',
    setGroupWholeBan: typeof value.setGroupWholeBan === 'function',
    setGroupKick: typeof value.setGroupKick === 'function',
    setGroupAdmin: typeof value.setGroupAdmin === 'function',
    approveFriend: typeof value.setFriendAddRequest === 'function' || typeof value.approveFriend === 'function',
    approveGroup: typeof value.setGroupAddRequest === 'function' || typeof value.approveGroup === 'function',
    forward: typeof value.sendForwardMsg === 'function',
    voice: ['sendRecord', 'sendVoice'].some((name) => typeof value[name] === 'function'),
    file: typeof value.sendFile === 'function'
  });
}

export async function safeBotCall(bot, methodNames, args = [], fallback = null) {
  const names = Array.isArray(methodNames) ? methodNames : [methodNames];
  const method = names.find((name) => typeof bot?.[name] === 'function');
  if (!method) return fallback;
  return bot[method](...args);
}

export function messageToText(message) {
  return normalizeMessage(message).text;
}

export function segmentListToText(segments) {
  return normalizeMessage(segments).text;
}
