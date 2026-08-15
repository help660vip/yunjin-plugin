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
  const parsedRunAt = Number(input.runAt ?? now + Number(input.delayMs || 0));
  const runAt = Number.isFinite(parsedRunAt) ? parsedRunAt : now;
  const parsedAttempts = Number(existing.attempts ?? input.attempts ?? 0);
  const parsedMaxAttempts = Number(input.maxAttempts ?? existing.maxAttempts ?? 1);
  const parsedRepeatMs = Number(input.repeatMs ?? existing.repeatMs ?? 0);
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
    attempts: Number.isFinite(parsedAttempts) ? Math.max(0, parsedAttempts) : 0,
    maxAttempts: Number.isFinite(parsedMaxAttempts) ? Math.max(1, parsedMaxAttempts) : 1,
    repeatMs: Number.isFinite(parsedRepeatMs) ? Math.max(0, parsedRepeatMs) : 0,
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
    const runAt = Number(task.runAt);
    const delay = Number.isFinite(runAt) ? Math.max(0, runAt - this.clock.now()) : 0;
    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      this.execute(task.id, { fromTimer: true }).catch((error) => this.logger?.error?.('scheduler execute failed', error));
    }, Math.min(delay, 2147483647));
    this.timers.set(task.id, timer);
    return true;
  }

  async execute(id, options = {}) {
    if (this.closed) return false;
    const name = String(id);
    if (this.running.has(name)) return false;
    const task = await this.find(name);
    if (!task || task.status !== 'scheduled') return false;
    if (options.fromTimer && Number.isFinite(Number(task.runAt)) && Number(task.runAt) > this.clock.now()) {
      this.schedule(task);
      return false;
    }
    this.running.add(name);
    try {
      const claimed = await this.repository.update({ tasks: [] }, (root) => {
        const item = (root.tasks || []).find((entry) => entry.id === name);
        if (!item || item.status !== 'scheduled') return false;
        item.status = 'running';
        item.attempts = Number(item.attempts || 0) + 1;
        item.updatedAt = this.clock.now();
        return clone(item);
      });
      if (!claimed) return false;
      try {
        if (typeof this.onExecute === 'function') await this.onExecute(claimed);
        const current = await this.find(name);
        if (!current || current.status === 'cancelled') return false;
        if (Number(claimed.repeatMs) > 0) {
          const now = this.clock.now();
          const next = await this.mark(name, { status: 'scheduled', runAt: now + Number(claimed.repeatMs), attempts: 0, lastRunAt: now });
          if (next) this.schedule(next);
          return Boolean(next);
        }
        await this.mark(name, { status: 'done' });
        return true;
      } catch (error) {
        const current = await this.find(name);
        if (current?.status === 'cancelled') return false;
        const retry = Number(claimed.attempts) < Number(claimed.maxAttempts);
        const updated = await this.mark(name, { status: retry ? 'scheduled' : 'failed', lastError: String(error?.message || error) });
        if (retry && updated) this.schedule(updated);
        if (typeof this.onError === 'function') await this.onError(error, clone(claimed));
        throw error;
      }
    } finally {
      this.running.delete(name);
    }
  }

  async recover() {
    if (this.closed) return [];
    const tasks = await this.repository.update({ tasks: [] }, (root) => {
      root.tasks = Array.isArray(root.tasks) ? root.tasks : [];
      for (const item of root.tasks) {
        if (item.status !== 'running') continue;
        item.status = Number(item.attempts || 0) < Number(item.maxAttempts || 1) ? 'scheduled' : 'failed';
        item.updatedAt = this.clock.now();
      }
      return root.tasks.map(clone);
    });
    for (const task of tasks) this.schedule(task);
    return tasks;
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
