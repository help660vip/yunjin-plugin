import path from 'node:path';
import { fileRejected } from './errors.js';

export function stripControl(value, options = {}) {
  const max = Number(options.max || 4000);
  let text = String(value ?? '');
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (options.removeZeroWidth !== false) text = text.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '');
  return text.slice(0, max);
}

export function cleanText(value, options = {}) {
  return stripControl(value, options).replace(/\s+/gu, ' ').trim();
}

export function redactSecrets(value, options = {}) {
  const keys = new Set(options.keys || ['token', 'access_token', 'authorization', 'cookie', 'password', 'secret', 'api_key', 'apikey']);
  const seen = new WeakSet();
  function visit(item, depth) {
    if (depth > 8) return '[depth-limit]';
    if (typeof item === 'string') return stripControl(item, { max: options.maxString || 1000 });
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) return '[circular]';
    seen.add(item);
    if (Array.isArray(item)) return item.slice(0, options.maxArray || 100).map((entry) => visit(entry, depth + 1));
    const result = {};
    for (const [key, entry] of Object.entries(item).slice(0, options.maxKeys || 100)) {
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
  const base = path.basename(String(value || fallback));
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/u, '').slice(0, 120);
  return clean || fallback;
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
  return Array.isArray(value) ? value.slice(0, Math.max(0, Number(max) || 0)) : [];
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', '是', '开启'].includes(String(value).toLowerCase());
}

export function parseNumber(value, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return options.fallback;
  return Math.min(Number(options.max ?? Infinity), Math.max(Number(options.min ?? -Infinity), number));
}

export function redactText(text, options = {}) {
  let value = stripControl(text, { max: options.max || 4000 });
  for (const pattern of options.patterns || [/Bearer\s+[A-Za-z0-9._-]+/gi, /(?:token|secret|password)=[^&\s]+/gi]) value = value.replace(pattern, '[redacted]');
  return value;
}

export function safeUrlText(value, max = 2000) {
  return stripControl(value, { max }).replace(/[\r\n]/g, '');
}
