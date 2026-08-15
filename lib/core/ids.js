import crypto from 'node:crypto';
import { REDIS_NAMESPACE } from './constants.js';

function clean(value, fallback = 'unknown') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function normalizeId(value, fallback = 'unknown') {
  return clean(value, fallback).replace(/[^a-zA-Z0-9:._@-]/g, '_').slice(0, 160) || fallback;
}

export function normalizeBotId(event, fallback = 'default') {
  return normalizeId(event?.botId ?? event?.selfId ?? event?.self_id ?? event?.bot?.uin ?? event?.raw?.self_id, fallback);
}

export function normalizeUserId(event, fallback = 'unknown') {
  return normalizeId(event?.userId ?? event?.user_id ?? event?.sender?.user_id ?? event?.sender?.id, fallback);
}

export function normalizeGroupId(event, fallback = 'private') {
  return normalizeId(event?.groupId ?? event?.group_id ?? event?.group?.group_id, fallback);
}

export function scopeParts(event, options = {}) {
  const bot = normalizeId(options.botId ?? normalizeBotId(event));
  const group = normalizeId(options.groupId ?? normalizeGroupId(event));
  const user = normalizeId(options.userId ?? normalizeUserId(event));
  return { bot, group, user };
}

export function scopeKey(event, options = {}) {
  const parts = scopeParts(event, options);
  const level = options.level || (parts.group === 'private' ? 'user' : 'group');
  if (level === 'bot') return 'bot:' + parts.bot;
  if (level === 'user') return 'bot:' + parts.bot + ':user:' + parts.user;
  if (level === 'group') return 'bot:' + parts.bot + ':group:' + parts.group;
  if (level === 'member') return 'bot:' + parts.bot + ':group:' + parts.group + ':user:' + parts.user;
  return 'bot:' + parts.bot + ':group:' + parts.group + ':user:' + parts.user;
}

export function redisKey(feature, scope, id, suffix) {
  const pieces = [REDIS_NAMESPACE, normalizeId(feature), normalizeId(scope)];
  if (id !== undefined && id !== null) pieces.push(normalizeId(id));
  if (suffix !== undefined && suffix !== null) pieces.push(normalizeId(suffix));
  return pieces.join(':');
}

export function featureStorageKey(feature, event, suffix = 'state', options = {}) {
  return redisKey(feature, scopeKey(event, options), suffix);
}

export function hash(value, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(String(value ?? ''), 'utf8').digest('hex');
}

export function stableId(parts, length = 24) {
  return hash(Array.isArray(parts) ? parts.join('\u001f') : parts).slice(0, length);
}

export function idempotencyKey(feature, event, token) {
  return stableId([feature, normalizeBotId(event), normalizeGroupId(event), normalizeUserId(event), token]);
}

export function redactId(value) {
  const text = String(value ?? '');
  if (text.length <= 4) return '****';
  return text.slice(0, 2) + '***' + text.slice(-2);
}

export function sameScope(left, right) {
  const a = scopeParts(left);
  const b = scopeParts(right);
  return a.bot === b.bot && a.group === b.group && a.user === b.user;
}
