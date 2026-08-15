import { cleanText, limitArray } from '../core/safe.js';

function rawType(segment) {
  return String(segment?.type || segment?.kind || 'text').trim().toLowerCase();
}

function scalar(value, max = 4000) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return '';
  return cleanText(value, { max });
}

function boundedInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(max, Math.floor(number));
}

export function normalizeSegment(segment) {
  if (typeof segment === 'string') return { type: 'text', text: scalar(segment) };
  if (!segment || typeof segment !== 'object') return { type: 'text', text: '' };
  const type = rawType(segment);
  if (type === 'text') return { type: 'text', text: scalar(segment.text ?? segment.data?.text ?? '') };
  if (type === 'at' || type === 'mention') {
    const id = scalar(segment.qq ?? segment.id ?? segment.data?.qq ?? '', 160);
    return id ? { type: 'at', id } : { type: 'text', text: '' };
  }
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'file') {
    const url = scalar(segment.url ?? segment.data?.url ?? segment.file ?? segment.data?.file ?? '', 2000);
    const file = scalar(segment.file ?? segment.data?.file ?? '', 2000);
    if (!url && !file) return { type: 'text', text: '' };
    return { type, url, file, name: scalar(segment.name ?? segment.data?.name ?? '', 160), size: Number.isFinite(Number(segment.size ?? segment.data?.size)) ? Number(segment.size ?? segment.data?.size) : undefined, mime: scalar(segment.mime ?? segment.mimetype ?? segment.data?.mime ?? '', 120) };
  }
  if (type === 'reply') {
    const id = scalar(segment.id ?? segment.data?.id ?? '', 160);
    return id ? { type: 'reply', id } : { type: 'text', text: '' };
  }
  return { type, data: segment.data && typeof segment.data === 'object' ? segment.data : {} };
}

export function normalizeMessage(message, options = {}) {
  const list = Array.isArray(message) ? message : [message];
  const maxSegments = boundedInteger(options.maxSegments, 100, 100);
  const segments = limitArray(list.map(normalizeSegment).filter((item) => item.type !== 'text' || item.text), maxSegments);
  const text = segments.filter((item) => item.type === 'text').map((item) => item.text).join('');
  return { segments, text, has: (type) => segments.some((item) => item.type === type) };
}

export function createMessageFactory(segmentApi = globalThis.segment) {
  const api = segmentApi || {};
  return {
    text(value) {
      const text = scalar(value);
      return typeof api.text === 'function' ? api.text(text) : text;
    },
    image(value) {
      const source = value && typeof value === 'object' ? value.url || value.file : value;
      const url = scalar(source, 2000);
      if (!url) return '';
      return typeof api.image === 'function' ? api.image(url) : '[\u56fe\u7247] ' + url;
    },
    at(id) {
      const value = scalar(id, 160);
      if (!value) return '';
      return typeof api.at === 'function' ? api.at(value) : '@' + value;
    },
    reply(id) {
      const value = scalar(id, 160);
      if (!value) return '';
      return typeof api.reply === 'function' ? api.reply(value) : '';
    },
    join(parts) {
      const list = Array.isArray(parts) ? parts : [parts];
      const values = list.filter((part) => part !== undefined && part !== null && part !== '');
      if (values.some((part) => typeof part !== 'string')) return values.slice(0, 100);
      return values.join('').slice(0, 8000);
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
  try {
    return await bot[method](...args);
  } catch {
    return fallback;
  }
}

export function messageToText(message) {
  return normalizeMessage(message).text;
}

export function segmentListToText(segments) {
  return normalizeMessage(segments).text;
}
