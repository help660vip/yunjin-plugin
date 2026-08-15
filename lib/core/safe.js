import path from 'node:path';
import { fileRejected } from './errors.js';

const MAX_SAFE_TEXT = 1000000;
const MAX_SAFE_ITEMS = 10000;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function scalarText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  return '';
}

function boundedInteger(value, fallback, min = 0, max = MAX_SAFE_TEXT) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function stripControl(value, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const max = boundedInteger(settings.max, 4000, 0, MAX_SAFE_TEXT);
  let text = scalarText(value);
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (settings.removeZeroWidth !== false) text = text.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '');
  return text.slice(0, max);
}

export function cleanText(value, options = {}) {
  return stripControl(value, options).replace(/\s+/gu, ' ').trim();
}

export function redactSecrets(value, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const defaultKeys = ['token', 'access_token', 'authorization', 'cookie', 'password', 'secret', 'api_key', 'apikey'];
  const keys = new Set((Array.isArray(settings.keys) ? settings.keys : defaultKeys).map((key) => scalarText(key).trim().toLowerCase()).filter(Boolean));
  const maxString = boundedInteger(settings.maxString, 1000, 0, MAX_SAFE_TEXT);
  const maxArray = boundedInteger(settings.maxArray, 100, 0, MAX_SAFE_ITEMS);
  const maxKeys = boundedInteger(settings.maxKeys, 100, 0, MAX_SAFE_ITEMS);
  const seen = new WeakSet();
  function visit(item, depth) {
    if (depth > 8) return '[depth-limit]';
    if (typeof item === 'string') return stripControl(item, { max: maxString });
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) return '[circular]';
    seen.add(item);
    if (Array.isArray(item)) return item.slice(0, maxArray).map((entry) => visit(entry, depth + 1));
    const result = {};
    for (const [key, entry] of Object.entries(item).slice(0, maxKeys)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      result[key] = keys.has(key.toLowerCase()) ? '[redacted]' : visit(entry, depth + 1);
    }
    return result;
  }
  return visit(value, 0);
}

export function safeJson(value, options = {}) {
  try { return JSON.stringify(redactSecrets(value, options)); } catch { return '"[unserializable]"'; }
}

export function resolveInside(root, candidate) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw fileRejected('文件路径超出允许目录。');
  return resolved;
}

export function safeFilename(value, fallback = 'file') {
  const safeFallback = scalarText(fallback) || 'file';
  const base = path.basename(scalarText(value) || safeFallback);
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/u, '').slice(0, 120);
  return clean || safeFallback;
}

export function safeExtension(value, allowed = []) {
  const ext = path.extname(String(value || '')).toLowerCase();
  if (allowed.length && !allowed.includes(ext)) throw fileRejected('文件类型不受支持。', { extension: ext });
  return ext;
}

export function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function limitArray(value, max = 100) {
  return Array.isArray(value) ? value.slice(0, boundedInteger(max, 100, 0, MAX_SAFE_ITEMS)) : [];
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = scalarText(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', String.fromCodePoint(26159), String.fromCodePoint(24320, 21551)].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', String.fromCodePoint(21542), String.fromCodePoint(20851, 38381)].includes(normalized)) return false;
  return fallback;
}

export function parseNumber(value, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const minimum = Number.isFinite(Number(settings.min)) ? Number(settings.min) : -Infinity;
  const maximum = Number.isFinite(Number(settings.max)) ? Number(settings.max) : Infinity;
  const low = Math.min(minimum, maximum);
  const high = Math.max(minimum, maximum);
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const fallback = Number(settings.fallback);
    return Number.isFinite(fallback) ? Math.min(high, Math.max(low, fallback)) : settings.fallback;
  }
  return Math.min(high, Math.max(low, number));
}

export function redactText(text, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  let value = stripControl(text, { max: boundedInteger(settings.max, 4000, 0, MAX_SAFE_TEXT) });
  const patterns = Array.isArray(settings.patterns) ? settings.patterns : [/Bearer\s+[A-Za-z0-9._-]+/gi, /(?:token|secret|password)=[^&\s]+/gi];
  for (const pattern of patterns) if (pattern instanceof RegExp) value = value.replace(pattern, '[redacted]');
  return value;
}

export function safeUrlText(value, max = 2000) {
  return stripControl(value, { max }).replace(/[\r\n]/g, '');
}
