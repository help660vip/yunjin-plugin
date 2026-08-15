import fs from 'node:fs/promises';
import path from 'node:path';

export class AuditLog {
  constructor(filePath, { logger = console } = {}) {
    this.filePath = filePath;
    this.logger = logger;
    this.chain = Promise.resolve();
  }

  record(entry) {
    const event = { at: new Date().toISOString(), ...sanitize(entry) };
    this.chain = this.chain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 });
    }).catch((error) => {
      this.logger.warn?.('[audit] write failed: ' + error.message);
    });
    return this.chain;
  }
}

const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 64;
const MAX_DEPTH = 5;

function sanitize(value, depth = 0, key = '') {
  if (/token|secret|password|passwd|api[_-]?key|cookie/i.test(key)) return '[\u5df2\u9690\u85cf]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH - 3) + '...' : value;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') return '[\u4e0d\u53ef\u5e8f\u5217\u5316]';
  if (depth >= MAX_DEPTH) return '[\u5df2\u622a\u65ad]';
  if (value instanceof Error) return { name: sanitize(value.name, depth + 1), message: sanitize(value.message, depth + 1) };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[\u65e0\u6548\u65e5\u671f]' : value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, MAX_OBJECT_KEYS).map(([entryKey, item]) => [entryKey, sanitize(item, depth + 1, entryKey)]));
  }
  return '[\u4e0d\u53ef\u5e8f\u5217\u5316]';
}
