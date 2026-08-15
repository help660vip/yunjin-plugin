import { randomUUID } from 'node:crypto';
import { stableId } from '../core/ids.js';
import { cleanText } from '../core/safe.js';
import { Clock, systemClock } from '../core/clock.js';

export class TaskLedger {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    this.maxItems = Number(options.maxItems || 500);
    this.items = [];
  }

  normalize(input = {}) {
    const text = cleanText(input.text || input.title || input.name, { max: 500 });
    if (!text) throw new Error('task text required');
    const userId = String(input.userId || 'unknown');
    const groupId = String(input.groupId || 'private');
    const botId = String(input.botId || 'default');
    const id = input.id || stableId([botId, groupId, userId, text, input.createdAt || this.clock.now()]);
    return { id, text, userId, groupId, botId, done: Boolean(input.done), createdAt: input.createdAt || this.clock.now(), updatedAt: this.clock.now(), dueAt: input.dueAt ? this.clock.parseDate(input.dueAt) : null, tags: Array.isArray(input.tags) ? input.tags.slice(0, 20).map((tag) => cleanText(tag, { max: 40 })) : [] };
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
    return values.slice(0, Number(options.limit || 100)).map((item) => ({ ...item }));
  }

  due(now = this.clock.now(), scope = {}) {
    return this.list(scope).filter((item) => !item.done && item.dueAt && item.dueAt <= now);
  }

  import(values = []) {
    this.items = [];
    for (const item of values.slice(0, this.maxItems)) {
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
    this.catalog = options.catalog || ['完成一次签到', '添加一条待办', '整理一条收藏', '参与一次讨论'];
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
