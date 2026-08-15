import { randomUUID } from 'node:crypto';
import { withRetry } from '../http/retry.js';
import { redactSecrets, cleanText } from '../core/safe.js';
import { normalizeBotId, normalizeGroupId, normalizeUserId, stableId } from '../core/ids.js';

export class NotificationBus {
  constructor(options = {}) {
    this.logger = options.logger;
    this.clock = options.clock;
    this.handlers = new Map();
    this.onceKeys = new Map();
    this.queue = [];
    this.closed = false;
    this.maxQueue = Number(options.maxQueue || 1000);
    this.dedupeTtlMs = Math.max(1000, Number(options.dedupeTtlMs || 3600000));
    this.maxDedupeEntries = Math.max(100, Number(options.maxDedupeEntries || this.maxQueue * 2));
    this.defaultAttempts = Math.max(1, Number(options.attempts || 2));
  }

  on(topic, handler) {
    const name = String(topic);
    if (typeof handler !== 'function') return () => {};
    const list = this.handlers.get(name) || new Set();
    list.add(handler);
    this.handlers.set(name, list);
    return () => list.delete(handler);
  }

  off(topic, handler) {
    return this.handlers.get(String(topic))?.delete(handler) || false;
  }

  async publish(topic, payload = {}, options = {}) {
    if (this.closed) return { ok: false, reason: 'closed' };
    const name = String(topic);
    const safePayload = redactSecrets(payload);
    const key = options.dedupeKey || stableId([name, JSON.stringify(safePayload)]);
    const now = Number(this.clock?.now?.() ?? Date.now());
    const seenAt = this.onceKeys.get(key);
    if (options.dedupe !== false && seenAt !== undefined && now - seenAt < this.dedupeTtlMs) return { ok: true, duplicate: true, key };
    const event = { id: randomUUID(), topic: name, payload: safePayload, createdAt: Date.now(), key };
    this.queue.push(event);
    while (this.queue.length > this.maxQueue) this.queue.shift();
    const handlers = [...(this.handlers.get(name) || []), ...(this.handlers.get('*') || [])];
    const results = [];
    for (const handler of handlers) {
      try {
        const value = await withRetry(() => handler(event), { attempts: options.attempts || this.defaultAttempts, baseMs: 100, maxMs: 1000 });
        results.push({ ok: true, value });
      } catch (error) {
        this.logger?.error?.('notification handler failed', error);
        results.push({ ok: false, error: cleanText(error?.message || error, { max: 300 }) });
      }
    }
    const ok = results.every((item) => item.ok);
    if (options.dedupe !== false && ok) {
      this.onceKeys.set(key, now);
      while (this.onceKeys.size > this.maxDedupeEntries) this.onceKeys.delete(this.onceKeys.keys().next().value);
    }
    return { ok, duplicate: false, key, results };
  }

  async sendToTarget(bot, target, message, options = {}) {
    const content = cleanText(message, { max: options.maxLength || 4000 });
    const groupId = String(target?.groupId || target?.group_id || '');
    const userId = String(target?.userId || target?.user_id || '');
    if (groupId && typeof bot?.pickGroup === 'function') {
      try {
        const group = bot.pickGroup(groupId);
        const method = typeof group?.sendMsg === 'function' ? 'sendMsg' : typeof group?.sendMessage === 'function' ? 'sendMessage' : '';
        if (method) return await group[method](content);
      } catch (error) {
        this.logger?.warn?.('[message] group send failed: ' + cleanText(error?.message || error, { max: 200 }));
      }
    }
    if (userId && typeof bot?.pickUser === 'function') {
      try {
        const user = bot.pickUser(userId);
        const method = typeof user?.sendMsg === 'function' ? 'sendMsg' : typeof user?.sendMessage === 'function' ? 'sendMessage' : '';
        if (method) return await user[method](content);
      } catch (error) {
        this.logger?.warn?.('[message] user send failed: ' + cleanText(error?.message || error, { max: 200 }));
      }
    }
    const method = typeof bot?.sendMsg === 'function' ? 'sendMsg' : typeof bot?.sendMessage === 'function' ? 'sendMessage' : '';
    if (method) {
      try {
        return await bot[method](groupId || userId, content);
      } catch (error) {
        return { ok: false, reason: '\u53d1\u9001\u5931\u8d25', error: cleanText(error?.message || error, { max: 200 }) };
      }
    }
    return { ok: false, reason: 'send capability missing', botId: normalizeBotId({ bot }), groupId: normalizeGroupId(target), userId: normalizeUserId(target) };
  }

  async sendToEvent(event, message, options = {}) {
    const content = cleanText(message, { max: options.maxLength || 4000 });
    const replies = [[event?.reply, event], [event?.raw?.reply, event?.raw]];
    for (const [reply, receiver] of replies) {
      if (typeof reply !== 'function') continue;
      try {
        return await reply.call(receiver, content);
      } catch (error) {
        this.logger?.warn?.('[message] event reply failed: ' + cleanText(error?.message || error, { max: 200 }));
      }
    }
    return this.sendToTarget(event?.bot, { groupId: event?.groupId, userId: event?.userId }, message, options);
  }


  clearDedupe() {
    this.onceKeys.clear();
  }

  snapshot() {
    return { topics: [...this.handlers.keys()], queue: this.queue.slice(-100), dedupeEntries: this.onceKeys.size };
  }

  close() {
    this.closed = true;
    this.handlers.clear();
    this.queue = [];
    this.onceKeys.clear();
  }
}
