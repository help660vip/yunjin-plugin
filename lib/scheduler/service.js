import { randomUUID } from 'node:crypto';
import { KeyedMutex } from '../core/locks.js';
import { Clock, systemClock } from '../core/clock.js';
import { stableId } from '../core/ids.js';
import { YunjinError, ERROR_CODES } from '../core/errors.js';

function clone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeTask(input, now, existing = {}) {
  const runAt = Number(input.runAt || now + Number(input.delayMs || 0));
  const featureId = String(input.featureId || existing.featureId || 'shared').padStart(2, '0');
  const scope = [input.botId || existing.botId || 'default', input.groupId || existing.groupId || 'private', input.userId || existing.userId || 'unknown'].join(':');
  const stable = input.id || existing.id || stableId([featureId, scope, input.title || existing.title || '', runAt, input.dedupeKey || existing.dedupeKey || '']);
  return {
    id: stable,
    featureId,
    title: String(input.title || existing.title || 'YunJin task').slice(0, 200),
    runAt: Number.isFinite(runAt) ? runAt : now,
    status: existing.status || input.status || 'scheduled',
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now,
    attempts: Number(existing.attempts || input.attempts || 0),
    maxAttempts: Math.max(1, Number(input.maxAttempts || existing.maxAttempts || 1)),
    botId: String(input.botId || existing.botId || 'default'),
    groupId: String(input.groupId || existing.groupId || 'private'),
    userId: String(input.userId || existing.userId || 'unknown'),
    payload: clone(input.payload ?? existing.payload ?? {}),
    dedupeKey: String(input.dedupeKey || existing.dedupeKey || stable)
  };
}

export class SchedulerService {
  constructor(repository, options = {}) {
    this.repository = repository;
    this.logger = options.logger;
    this.clock = options.clock || systemClock;
    this.onExecute = options.onExecute;
    this.onError = options.onError;
    this.mutex = options.mutex || new KeyedMutex({ clock: this.clock });
    this.timers = new Map();
    this.running = new Set();
    this.closed = false;
  }

  async readRoot() {
    return this.repository.read({ tasks: [] });
  }

  async list() {
    const root = await this.readRoot();
    return Array.isArray(root.tasks) ? root.tasks.map(clone) : [];
  }

  async create(input = {}) {
    if (this.closed) throw new YunjinError(ERROR_CODES.TASK_CONFLICT, '调度器已关闭。');
    const now = this.clock.now();
    const task = normalizeTask(input, now);
    if (task.runAt < now) task.runAt = now;
    const result = await this.repository.update({ tasks: [] }, (root) => {
      root.tasks = Array.isArray(root.tasks) ? root.tasks : [];
      const duplicate = root.tasks.find((item) => item.dedupeKey === task.dedupeKey && ['scheduled', 'running'].includes(item.status));
      if (duplicate) return duplicate;
      root.tasks.push(task);
      return task;
    });
    this.schedule(result);
    return clone(result);
  }

  async cancel(id) {
    const name = String(id);
    const result = await this.repository.update({ tasks: [] }, (root) => {
      const item = (root.tasks || []).find((entry) => entry.id === name);
      if (!item || ['done', 'cancelled'].includes(item.status)) return false;
      item.status = 'cancelled';
      item.updatedAt = this.clock.now();
      return true;
    });
    this.clearTimer(name);
    return result;
  }

  schedule(task) {
    if (this.closed || !task || task.status !== 'scheduled') return false;
    this.clearTimer(task.id);
    const delay = Math.max(0, Number(task.runAt) - this.clock.now());
    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      this.execute(task.id).catch((error) => this.logger?.error?.('scheduler execute failed', error));
    }, Math.min(delay, 2147483647));
    this.timers.set(task.id, timer);
    return true;
  }

  async execute(id) {
    if (this.closed) return false;
    const name = String(id);
    if (this.running.has(name)) return false;
    const task = await this.find(name);
    if (!task || task.status !== 'scheduled') return false;
    this.running.add(name);
    try {
      const claimed = await this.repository.update({ tasks: [] }, (root) => {
        const item = (root.tasks || []).find((entry) => entry.id === name);
        if (!item || item.status !== 'scheduled') return false;
        item.status = 'running';
        item.attempts = Number(item.attempts || 0) + 1;
        item.updatedAt = this.clock.now();
        return true;
      });
      if (!claimed) return false;
      try {
        if (typeof this.onExecute === 'function') await this.onExecute(clone(task));
        await this.mark(name, { status: 'done' });
        return true;
      } catch (error) {
        await this.mark(name, { status: task.attempts < task.maxAttempts ? 'scheduled' : 'failed', lastError: String(error?.message || error) });
        if (typeof this.onError === 'function') await this.onError(error, clone(task));
        throw error;
      }
    } finally {
      this.running.delete(name);
    }
  }

  async find(id) {
    const tasks = await this.list();
    return tasks.find((task) => task.id === String(id));
  }

  async mark(id, patch) {
    return this.repository.update({ tasks: [] }, (root) => {
      const item = (root.tasks || []).find((entry) => entry.id === String(id));
      if (!item) return false;
      Object.assign(item, patch, { updatedAt: this.clock.now() });
      return clone(item);
    });
  }

  clearTimer(id) {
    const timer = this.timers.get(String(id));
    if (timer) clearTimeout(timer);
    this.timers.delete(String(id));
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const id of this.timers.keys()) this.clearTimer(id);
    this.timers.clear();
    this.running.clear();
    this.mutex.clear();
  }
}
