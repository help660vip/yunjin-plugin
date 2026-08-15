import { redisKey } from '../core/ids.js';
import { redactSecrets } from '../core/safe.js';

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePrefix(value) {
  const text = String(value ?? 'Yunjin').trim().replace(/[^a-zA-Z0-9_-]/gu, '_').slice(0, 64);
  return text || 'Yunjin';
}

export class MemoryRedis {
  constructor(options = {}) {
    this.values = new Map();
    this.expiry = new Map();
    this.clock = options.clock || { now: () => Date.now() };
  }

  now() {
    return finiteNumber(this.clock.now(), Date.now());
  }

  clean(key) {
    const name = String(key);
    const expires = this.expiry.get(name);
    if (expires !== undefined && expires <= this.now()) {
      this.values.delete(name);
      this.expiry.delete(name);
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
    this.expiry.delete(name);
    const rawSeconds = options.EX ?? options.ex;
    if (rawSeconds !== undefined) {
      const seconds = Number(rawSeconds);
      if (Number.isFinite(seconds)) this.expiry.set(name, this.now() + seconds * 1000);
    }
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
    const name = String(key);
    if (!this.values.has(name)) return 0;
    const value = Number(seconds);
    if (!Number.isFinite(value)) return 0;
    this.expiry.set(name, this.now() + value * 1000);
    return 1;
  }

  async quit() {
    this.values.clear();
    this.expiry.clear();
  }
}

export class RedisAdapter {
  constructor(options = {}) {
    const hasClient = Boolean(options.client);
    const memory = options.fallback || new MemoryRedis(options);
    this.client = options.client || memory;
    this.prefix = normalizePrefix(options.prefix);
    this.available = hasClient;
    this.logger = options.logger;
    this.fallback = options.fallback || (hasClient ? memory : null);
  }

  key(feature, scope, id, suffix) {
    return redisKey(feature, scope, id, suffix).replace(/^Yunjin:/u, this.prefix + ':');
  }

  async fallbackGet(feature, scope, id, suffix) {
    if (!this.fallback?.get) return null;
    try {
      const value = this.fallback instanceof RedisAdapter
        ? await this.fallback.get(feature, scope, id, suffix)
        : await this.fallback.get(this.key(feature, scope, id, suffix));
      return value === null || value === undefined ? null : this.parse(value);
    } catch (error) {
      this.log(error);
      return null;
    }
  }

  async fallbackSet(feature, scope, id, suffix, value, options) {
    if (!this.fallback?.set) return null;
    try {
      if (this.fallback instanceof RedisAdapter) return await this.fallback.set(feature, scope, id, suffix, value, options);
      const serialized = typeof value === 'string' ? value : JSON.stringify(redactSecrets(value));
      return await this.fallback.set(this.key(feature, scope, id, suffix), serialized, options);
    } catch (error) {
      this.log(error);
      return null;
    }
  }

  async fallbackDelete(feature, scope, id, suffix) {
    if (!this.fallback?.del && !this.fallback?.delete) return 0;
    try {
      return this.fallback instanceof RedisAdapter
        ? await this.fallback.delete(feature, scope, id, suffix)
        : await this.fallback.del(this.key(feature, scope, id, suffix));
    } catch (error) {
      this.log(error);
      return 0;
    }
  }

  async fallbackIncrement(feature, scope, id, suffix, options = {}) {
    if (!this.fallback?.incr && !this.fallback?.increment) return 0;
    try {
      if (this.fallback instanceof RedisAdapter) return await this.fallback.increment(feature, scope, id, suffix, options);
      const key = this.key(feature, scope, id, suffix);
      const value = await this.fallback.incr(key);
      const ttl = Number(options.ttlSeconds);
      if (options.ttlSeconds !== undefined && Number.isFinite(ttl) && this.fallback.expire) await this.fallback.expire(key, ttl);
      return value;
    } catch (error) {
      this.log(error);
      return 0;
    }
  }

  async get(feature, scope, id, suffix) {
    try {
      const value = await this.client.get(this.key(feature, scope, id, suffix));
      return value === null || value === undefined ? null : this.parse(value);
    } catch (error) {
      this.log(error);
      return this.fallbackGet(feature, scope, id, suffix);
    }
  }

  async set(feature, scope, id, suffix, value, options = {}) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(redactSecrets(value));
      return await this.client.set(this.key(feature, scope, id, suffix), serialized, options);
    } catch (error) {
      this.log(error);
      return this.fallbackSet(feature, scope, id, suffix, value, options);
    }
  }

  async delete(feature, scope, id, suffix) {
    try {
      return await this.client.del(this.key(feature, scope, id, suffix));
    } catch (error) {
      this.log(error);
      return this.fallbackDelete(feature, scope, id, suffix);
    }
  }

  async increment(feature, scope, id, suffix, options = {}) {
    try {
      const key = this.key(feature, scope, id, suffix);
      const value = await this.client.incr(key);
      const ttl = Number(options.ttlSeconds);
      if (options.ttlSeconds !== undefined && Number.isFinite(ttl)) await this.client.expire(key, ttl);
      return value;
    } catch (error) {
      this.log(error);
      return this.fallbackIncrement(feature, scope, id, suffix, options);
    }
  }

  parse(value) {
    try { return JSON.parse(value); } catch { return value; }
  }

  log(error) {
    this.logger?.warn?.('Redis 不可用，已切换安全回退', { message: error?.message });
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
