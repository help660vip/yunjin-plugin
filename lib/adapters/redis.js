import { redisKey } from '../core/ids.js';
import { redactSecrets } from '../core/safe.js';

export class MemoryRedis {
  constructor(options = {}) {
    this.values = new Map();
    this.expiry = new Map();
    this.clock = options.clock || { now: () => Date.now() };
  }

  clean(key) {
    const expires = this.expiry.get(key);
    if (expires && expires <= this.clock.now()) {
      this.values.delete(key);
      this.expiry.delete(key);
    }
  }

  async get(key) {
    this.clean(key);
    const value = this.values.get(String(key));
    return value === undefined ? null : value;
  }

  async set(key, value, options = {}) {
    const name = String(key);
    this.values.set(name, String(value));
    if (options.EX || options.ex) this.expiry.set(name, this.clock.now() + Number(options.EX || options.ex) * 1000);
    return 'OK';
  }

  async del(key) {
    const name = String(key);
    const existed = this.values.delete(name);
    this.expiry.delete(name);
    return existed ? 1 : 0;
  }

  async incr(key) {
    const value = Number(await this.get(key) || 0) + 1;
    await this.set(key, value);
    return value;
  }

  async expire(key, seconds) {
    if (!this.values.has(String(key))) return 0;
    this.expiry.set(String(key), this.clock.now() + Number(seconds) * 1000);
    return 1;
  }

  async quit() {
    this.values.clear();
    this.expiry.clear();
  }
}

export class RedisAdapter {
  constructor(options = {}) {
    this.client = options.client || new MemoryRedis(options);
    this.prefix = options.prefix || 'Yunjin';
    this.available = Boolean(options.client);
    this.logger = options.logger;
    this.fallback = options.fallback || null;
  }

  key(feature, scope, id, suffix) {
    return redisKey(feature, scope, id, suffix).replace(/^Yunjin:/u, this.prefix + ':');
  }

  async get(feature, scope, id, suffix) {
    try {
      const value = await this.client.get(this.key(feature, scope, id, suffix));
      return value === null || value === undefined ? null : this.parse(value);
    } catch (error) {
      this.log(error);
      return this.fallback?.get?.(feature, scope, id, suffix) ?? null;
    }
  }

  async set(feature, scope, id, suffix, value, options = {}) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(redactSecrets(value));
      return this.client.set(this.key(feature, scope, id, suffix), serialized, options);
    } catch (error) {
      this.log(error);
      if (this.fallback?.set) return this.fallback.set(feature, scope, id, suffix, value, options);
      return null;
    }
  }

  async delete(feature, scope, id, suffix) {
    try { return this.client.del(this.key(feature, scope, id, suffix)); } catch (error) { this.log(error); return 0; }
  }

  async increment(feature, scope, id, suffix, options = {}) {
    try {
      const key = this.key(feature, scope, id, suffix);
      const value = await this.client.incr(key);
      if (options.ttlSeconds) await this.client.expire(key, options.ttlSeconds);
      return value;
    } catch (error) {
      this.log(error);
      return this.fallback?.increment?.(feature, scope, id, suffix, options) ?? 0;
    }
  }

  parse(value) {
    try { return JSON.parse(value); } catch { return value; }
  }

  log(error) {
    this.logger?.warn?.('Redis unavailable; using safe fallback', { message: error?.message });
  }

  status() {
    return { available: this.available, backend: this.available ? 'redis' : 'memory', prefix: this.prefix };
  }

  async close() {
    if (typeof this.client.quit === 'function') {
      try { await this.client.quit(); } catch (error) { this.log(error); }
    }
  }
}

export function redisAdapter(options) {
  return new RedisAdapter(options);
}
