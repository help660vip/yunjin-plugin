import { invalidInput } from '../core/errors.js';
import { cleanText, parseBoolean, parseNumber } from '../core/safe.js';

function integer(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizePrefix(value) {
  const prefix = String(value ?? '').trim();
  return prefix || '#\u4e91\u9526';
}

function boundTokens(tokens, options = {}) {
  const maxTokens = integer(options.maxTokens, 100, 1, 1000);
  const maxTokenLength = integer(options.maxTokenLength, 1000, 1, 10000);
  if (tokens.length > maxTokens) throw invalidInput('\u547d\u4ee4\u53c2\u6570\u8fc7\u591a');
  for (const token of tokens) if (token.length > maxTokenLength) throw invalidInput('\u547d\u4ee4\u53c2\u6570\u8fc7\u957f');
  return tokens;
}

export function tokenize(input, options = {}) {
  const source = cleanText(input, { max: integer(options.maxLength, 4000, 1, 100000) });
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
  const tokens = boundTokens(Array.isArray(input) ? input.map(String) : tokenize(input, options), options);
  const prefix = normalizePrefix(options.prefix);
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
    if (token === '--') continue;
    if (token.startsWith('--')) {
      const raw = token.slice(2);
      const separator = raw.indexOf('=');
      const key = (separator < 0 ? raw : raw.slice(0, separator)).trim();
      if (!key) throw invalidInput('\u547d\u4ee4\u6807\u8bb0\u65e0\u6548');
      flags[key] = separator < 0 ? true : raw.slice(separator + 1);
    } else {
      args.push(token);
    }
  }
  return { matched: true, prefix, command, args, flags, rawTokens: tokens };
}

export function parseCommandArguments(input, manifest, options = {}) {
  const prefix = normalizePrefix(options.prefix);
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
  const max = Math.max(1, Number.isFinite(Number(options.maxMs)) ? Number(options.maxMs) : 365 * 86400000);
  if (!Number.isFinite(result) || result <= 0 || result > max) throw invalidInput('时长超出允许范围。');
  return result;
}

export function parsePage(value, options = {}) {
  const max = integer(options.max, 100, 1, 100000);
  const maxSize = integer(options.maxSize, 100, 1, 1000);
  const defaultSize = integer(options.defaultSize, 20, 1, maxSize);
  const page = integer(parseNumber(value, { min: 1, max, fallback: 1 }), 1, 1, max);
  const size = integer(parseNumber(options.size, { min: 1, max: maxSize, fallback: defaultSize }), defaultSize, 1, maxSize);
  return { page, size, offset: (page - 1) * size };
}

export function parseBooleanFlag(flags, key, fallback = false) {
  return parseBoolean(flags?.[key], fallback);
}

export function parseJsonValue(value, fallback, options = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value);
  const maxLength = integer(options.maxLength, 20000, 1, 1000000);
  if (text.length > maxLength) throw invalidInput('\u53c2\u6570\u957f\u5ea6\u8d85\u51fa\u9650\u5236');
  try { return JSON.parse(text); } catch { throw invalidInput('\u53c2\u4e0d\u662f\u6709\u6548 JSON'); }
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
  const currentPage = integer(page, 1, 1);
  const pageSize = integer(size, 20, 1, 100);
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  return { page: normalizedPage, size: pageSize, total: list.length, totalPages, items: list.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize) };
}
