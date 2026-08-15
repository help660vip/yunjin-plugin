import { invalidInput } from '../core/errors.js';
import { cleanText, parseBoolean, parseNumber } from '../core/safe.js';

export function tokenize(input, options = {}) {
  const source = cleanText(input, { max: options.maxLength || 4000 });
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (escaped) current += '\\';
  if (quote) throw invalidInput('引号没有闭合。');
  if (current) tokens.push(current);
  return tokens;
}

export function parseNamespace(input, options = {}) {
  const tokens = Array.isArray(input) ? input.map(String) : tokenize(input, options);
  const prefix = options.prefix || '#云锦';
  const first = tokens.shift() || '';
  let command = '';
  if (first === prefix) {
    command = String(tokens.shift() || '').trim();
  } else if (first.startsWith(prefix)) {
    command = first.slice(prefix.length).trim();
  } else {
    return { matched: false, prefix, command: '', args: [], flags: {} };
  }
  const args = [];
  const flags = {};
  for (const token of tokens) {
    if (token.startsWith('--')) {
      const pair = token.slice(2).split('=');
      flags[pair[0]] = pair.length > 1 ? pair.slice(1).join('=') : true;
    } else {
      args.push(token);
    }
  }
  return { matched: true, prefix, command, args, flags, rawTokens: tokens };
}

export function parseCommandArguments(input, manifest, options = {}) {
  const prefix = options.prefix || '#云锦';
  const parsed = parseNamespace(Array.isArray(input) ? input : tokenize(input, options), { prefix });
  if (!parsed.matched) return { ...parsed, expected: manifest?.command };
  if (manifest && parsed.command !== manifest.command) return { ...parsed, expected: manifest.command };
  return parsed;
}

export function parseDuration(value, options = {}) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!match) throw invalidInput('时长格式不正确。');
  const number = Number(match[1]);
  const unit = match[2] || options.defaultUnit || 'm';
  const multiplier = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  const result = number * multiplier;
  const max = Number(options.maxMs || 365 * 86400000);
  if (!Number.isFinite(result) || result <= 0 || result > max) throw invalidInput('时长超出允许范围。');
  return result;
}

export function parsePage(value, options = {}) {
  const page = parseNumber(value, { min: 1, max: options.max || 100, fallback: 1 });
  const size = parseNumber(options.size, { min: 1, max: options.maxSize || 100, fallback: options.defaultSize || 20 });
  return { page, size, offset: (page - 1) * size };
}

export function parseBooleanFlag(flags, key, fallback = false) {
  return parseBoolean(flags?.[key], fallback);
}

export function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(value); } catch { throw invalidInput('参数不是有效 JSON。'); }
}

export function parseKeyValue(tokens) {
  const result = {};
  for (const token of tokens || []) {
    const separator = String(token).indexOf('=');
    if (separator <= 0) continue;
    result[String(token).slice(0, separator)] = String(token).slice(separator + 1);
  }
  return result;
}

export function commandUsage(manifest, usage = '') {
  return ('#云锦' + String(manifest?.command || '') + ' ' + String(usage || '')).trim();
}

export function paginate(items, page = 1, size = 20) {
  const list = Array.isArray(items) ? items : [];
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(size) || 20));
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  return { page: normalizedPage, size: pageSize, total: list.length, totalPages, items: list.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize) };
}
