import { createMessageFactory } from '../message/adapter.js';

export async function replyText(event, text, fallback) {
  const value = String(text ?? '');
  if (typeof event?.reply === 'function') return event.reply(value);
  if (typeof event?.raw?.reply === 'function') return event.raw.reply(value);
  if (typeof fallback === 'function') return fallback(value);
  return value;
}

export function replySegments(event, segments, fallback) {
  const factory = createMessageFactory(globalThis.segment);
  const value = segments.map((segment) => {
    if (segment?.type === 'image') return factory.image(segment.url || segment.file);
    if (segment?.type === 'at') return factory.at(segment.id);
    return factory.text(segment?.text ?? segment);
  });
  return replyText(event, factory.join(value), fallback);
}
