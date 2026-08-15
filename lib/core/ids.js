import crypto from 'node:crypto';
import { REDIS_NAMESPACE } from './constants.js';

const ID_MAX_LENGTH = 160;

function scalar(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'bigint') return String(value);
  return '';
}

function clean(value, fallback = 'unknown') {
  const safeFallback = scalar(fallback).trim() || 'unknown';
  const text = scalar(value).trim();
  return text || safeFallback;
}

export function normalizeId(value, fallback = 'unknown') {
  const safeFallback = clean(fallback, 'unknown').replace(/[^a-zA-Z0-9:._@-]/g, '_').slice(0, ID_MAX_LENGTH) || 'unknown';
  const text = scalar(value).trim();
  return text ? text.replace(/[^a-zA-Z0-9:._@-]/g, '_').slice(0, ID_MAX_LENGTH) || safeFallback : safeFallback;
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
  const settings = options && typeof options === 'object' ? options : {};
  const bot = normalizeId(settings.botId ?? normalizeBotId(event));
  const group = normalizeId(settings.groupId ?? normalizeGroupId(event));
  const user = normalizeId(settings.userId ?? normalizeUserId(event));
  return { bot, group, user };
}

export function scopeKey(event, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const parts = scopeParts(event, settings);
  const requestedLevel = scalar(settings.level).trim().toLowerCase();
  const level = ['bot', 'user', 'group', 'member'].includes(requestedLevel)
    ? requestedLevel
    : (parts.group === 'private' ? 'user' : 'group');
  if (level === 'bot') return 'bot:' + parts.bot;
  if (level === 'user') return 'bot:' + parts.bot + ':user:' + parts.user;
  if (level === 'group') return 'bot:' + parts.bot + ':group:' + parts.group;
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
  const numericLength = Number(length);
  const safeLength = Number.isFinite(numericLength) ? Math.min(64, Math.max(8, Math.trunc(numericLength))) : 24;
  const input = Array.isArray(parts) ? parts.map((part) => scalar(part)).join('\u001f') : scalar(parts);
  return hash(input).slice(0, safeLength);
}

export function idempotencyKey(feature, event, token) {
  return stableId([feature, normalizeBotId(event), normalizeGroupId(event), normalizeUserId(event), token]);
}

export function redactId(value) {
  const text = scalar(value);
  if (text.length <= 4) return '****';
  return text.slice(0, 2) + '***' + text.slice(-2);
}

export function sameScope(left, right) {
  const a = scopeParts(left);
  const b = scopeParts(right);
  return a.bot === b.bot && a.group === b.group && a.user === b.user;
}
