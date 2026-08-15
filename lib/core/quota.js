import { quotaExceeded } from './errors.js';
import { systemClock } from './clock.js';
import { normalizeId } from './ids.js';

export class QuotaLedger {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    this.timeZone = options.timeZone;
    this.defaults = { ...options.defaults };
    this.entries = new Map();
    this.maxEntries = Number(options.maxEntries || 20000);
  }

  key(scope, quota, day = this.clock.dayKey(undefined, this.timeZone)) {
    return [normalizeId(scope), normalizeId(quota), day].join(':');
  }

  usage(scope, quota, limit = this.defaults[quota] || Infinity) {
    const key = this.key(scope, quota);
    const value = this.entries.get(key) || { used: 0, limit, updatedAt: this.clock.now() };
    value.limit = Number.isFinite(limit) ? limit : value.limit;
    this.entries.set(key, value);
    return { ...value, remaining: Math.max(0, value.limit - value.used) };
  }

  consume(scope, quota, amount = 1, limit = this.defaults[quota] || Infinity) {
    const count = Math.max(0, Number(amount) || 0);
    const current = this.usage(scope, quota, limit);
    if (current.used + count > current.limit) {
      throw quotaExceeded({ scope: normalizeId(scope), quota: normalizeId(quota), used: current.used, limit: current.limit });
    }
    const next = { used: current.used + count, limit: current.limit, updatedAt: this.clock.now() };
    this.entries.set(this.key(scope, quota), next);
    this.trim();
    return { ...next, remaining: Math.max(0, next.limit - next.used) };
  }

  reset(scope, quota) {
    const prefix = [normalizeId(scope), quota ? normalizeId(quota) : ''].join(':');
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  trim() {
    if (this.entries.size <= this.maxEntries) return;
    for (const key of [...this.entries.keys()].slice(0, this.entries.size - this.maxEntries)) this.entries.delete(key);
  }

  snapshot() {
    return Object.fromEntries(this.entries);
  }
}
