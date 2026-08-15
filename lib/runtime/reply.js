import { cleanText } from '../core/safe.js';
import { createMessageFactory, normalizeMessage } from '../message/adapter.js';

function replyValue(text) {
  if (Array.isArray(text)) return text.slice(0, 100);
  if (text && typeof text === 'object') return '';
  return cleanText(text ?? '', { max: 4000 });
}

export async function replyText(event, text, fallback) {
  const value = replyValue(text);
  const replies = [[event?.reply, event], [event?.raw?.reply, event?.raw]];
  for (const [reply, receiver] of replies) {
    if (typeof reply !== 'function') continue;
    try {
      return await reply.call(receiver, value);
    } catch {
      // 夺复发送失败，继续寻找降级
    }
  }
  if (typeof fallback === 'function') {
    try { return await fallback(value); } catch { /* 回调降级失败 */ }
  }
  return value;
}

export function replySegments(event, segments, fallback) {
  const factory = createMessageFactory(globalThis.segment);
  const list = Array.isArray(segments) ? segments : segments == null ? [] : [segments];
  const normalized = normalizeMessage(list).segments;
  const value = factory.join(normalized.map((segment) => {
    if (segment.type === 'image' || segment.type === 'video' || segment.type === 'audio' || segment.type === 'file') return factory.image(segment.url || segment.file);
    if (segment.type === 'at') return factory.at(segment.id);
    if (segment.type === 'reply') return factory.reply(segment.id);
    if (segment.type === 'text') return factory.text(segment.text);
    return '';
  }));
  return replyText(event, value, fallback);
}
