import { randomUUID } from 'node:crypto';
import { stableId } from '../core/ids.js';
import { cleanText } from '../core/safe.js';
import { Clock, systemClock } from '../core/clock.js';

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback, max = 100000) {
  return Math.min(max, Math.max(1, Math.floor(finiteNumber(value, fallback))));
}

function booleanValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeIdentity(value, fallback) {
  if (value === undefined || value === null || (typeof value !== 'string' && typeof value !== 'number')) return fallback;
  const text = cleanText(String(value), { max: 128 });
  return text || fallback;
}

function timestamp(value, fallback, clock) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  try {
    const parsed = clock.parseDate(value);
    const result = Number(parsed);
    return Number.isFinite(result) ? result : fallback;
  } catch {
    return fallback;
  }
}

export class TaskLedger {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    this.maxItems = positiveInteger(options.maxItems ?? 500, 500, 10000);
    this.items = [];
  }

  normalize(input = {}) {
    const data = input && typeof input === 'object' ? input : {};
    const text = cleanText(data.text ?? data.title ?? data.name, { max: 500 });
    if (!text) throw new Error('\u4efb\u52a1\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a');
    const userId = normalizeIdentity(data.userId, 'unknown');
    const groupId = normalizeIdentity(data.groupId, 'private');
    const botId = normalizeIdentity(data.botId, 'default');
    const now = finiteNumber(this.clock.now(), Date.now());
    const createdAt = timestamp(data.createdAt, now, this.clock);
    const fallbackId = stableId([botId, groupId, userId, text, createdAt]);
    const id = normalizeIdentity(data.id, fallbackId);
    const dueAt = data.dueAt ? timestamp(data.dueAt, null, this.clock) : null;
    const tags = Array.isArray(data.tags)
      ? [...new Set(data.tags.map((tag) => cleanText(tag, { max: 40 })).filter(Boolean))].slice(0, 20)
      : [];
    return { id, text, userId, groupId, botId, done: booleanValue(data.done), createdAt, updatedAt: now, dueAt, tags };
  }

  add(input) {
    const task = this.normalize(input);
    this.items = [task, ...this.items.filter((item) => item.id !== task.id)].slice(0, this.maxItems);
    return { ...task };
  }

  find(id, scope = {}) {
    return this.items.find((item) => item.id === String(id) && this.inScope(item, scope));
  }

  inScope(item, scope = {}) {
    return (!scope.botId || item.botId === String(scope.botId)) && (!scope.groupId || item.groupId === String(scope.groupId)) && (!scope.userId || item.userId === String(scope.userId));
  }

  complete(id, scope = {}) {
    const item = this.find(id, scope);
    if (!item) return null;
    item.done = true;
    item.completedAt = this.clock.now();
    item.updatedAt = item.completedAt;
    return { ...item };
  }

  remove(id, scope = {}) {
    const before = this.items.length;
    this.items = this.items.filter((item) => !(item.id === String(id) && this.inScope(item, scope)));
    return before - this.items.length;
  }

  list(scope = {}, options = {}) {
    let values = this.items.filter((item) => this.inScope(item, scope));
    if (options.pendingOnly) values = values.filter((item) => !item.done);
    if (options.tag) values = values.filter((item) => item.tags.includes(String(options.tag)));
    return values.slice(0, positiveInteger(options.limit ?? 100, 100, 1000)).map((item) => ({ ...item }));
  }

  due(now = this.clock.now(), scope = {}) {
    return this.list(scope).filter((item) => !item.done && item.dueAt && item.dueAt <= now);
  }

  import(values = []) {
    this.items = [];
    for (const item of (Array.isArray(values) ? values : []).slice(0, this.maxItems)) {
      try { this.add(item); } catch {}
    }
    return this.items.length;
  }

  export() {
    return this.items.map((item) => ({ ...item }));
  }
}

export class DailyTaskLedger {
  constructor(options = {}) {
    this.clock = options.clock || new Clock();
    const supplied = Array.isArray(options.catalog)
      ? options.catalog.map((item) => cleanText(item, { max: 100 })).filter(Boolean)
      : [];
    this.catalog = supplied.length ? [...new Set(supplied)] : ['\u5b8c\u6210\u4e00\u6b21\u7b7e\u5230', '\u6dfb\u52a0\u4e00\u6761\u5f85\u529e', '\u6574\u7406\u4e00\u6761\u6536\u85cf', '\u53c2\u4e0e\u4e00\u6b21\u8ba8\u8bba'];
    this.items = new Map();
  }

  key(scope) {
    return String(scope);
  }

  get(scope, day = this.clock.dayKey()) {
    const key = this.key(scope) + ':' + day;
    if (!this.items.has(key)) {
      const index = Math.abs(this.hash(key)) % this.catalog.length;
      this.items.set(key, { scope: this.key(scope), day, text: this.catalog[index], done: false, createdAt: this.clock.now() });
    }
    return { ...this.items.get(key) };
  }

  complete(scope, day) {
    const item = this.get(scope, day);
    item.done = true;
    item.completedAt = this.clock.now();
    this.items.set(this.key(scope) + ':' + item.day, item);
    return { ...item };
  }

  hash(value) {
    let result = 0;
    for (const char of String(value)) result = ((result << 5) - result + char.charCodeAt(0)) | 0;
    return result;
  }

  prune(before = this.clock.now() - 90 * 86400000) {
    let removed = 0;
    for (const [key, item] of this.items) if (item.createdAt < before) {
      this.items.delete(key);
      removed += 1;
    }
    return removed;
  }
}
