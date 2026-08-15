import { systemClock } from './clock.js';

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  if (value && typeof value === 'object') {
    try { return JSON.parse(JSON.stringify(value)); } catch {}
  }
  return value;
}

export class TTLCache {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    this.maxEntries = Math.max(1, Number(options.maxEntries || 1000));
    this.defaultTtlMs = Math.max(0, Number(options.defaultTtlMs || 60000));
    this.map = new Map();
  }

  set(key, value, options = {}) {
    const name = String(key);
    const ttlMs = Math.max(0, Number(options.ttlMs ?? this.defaultTtlMs));
    const now = this.clock.now();
    this.map.delete(name);
    this.map.set(name, { value: clone(value), createdAt: now, expiresAt: ttlMs === 0 ? Infinity : now + ttlMs, staleUntil: options.staleMs ? now + ttlMs + Number(options.staleMs) : 0, hits: 0, tags: new Set(options.tags || []) });
    this.trim();
    return value;
  }

  get(key, options = {}) {
    const name = String(key);
    const item = this.map.get(name);
    if (!item) return undefined;
    const now = this.clock.now();
    if (item.expiresAt < now) {
      if (options.allowStale && item.staleUntil >= now) {
        item.hits += 1;
        return clone(item.value);
      }
      this.map.delete(name);
      return undefined;
    }
    item.hits += 1;
    this.map.delete(name);
    this.map.set(name, item);
    return clone(item.value);
  }

  has(key, options = {}) {
    return this.get(key, options) !== undefined;
  }

  delete(key) {
    return this.map.delete(String(key));
  }

  invalidateTag(tag) {
    const value = String(tag);
    let count = 0;
    for (const [key, item] of this.map) {
      if (item.tags.has(value)) {
        this.map.delete(key);
        count += 1;
      }
    }
    return count;
  }

  clear() {
    this.map.clear();
  }

  trim() {
    const now = this.clock.now();
    for (const [key, item] of this.map) if (item.staleUntil && item.staleUntil < now) this.map.delete(key);
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
  }

  entries() {
    return [...this.map.entries()].map(([key, item]) => ({ key, createdAt: item.createdAt, expiresAt: item.expiresAt, hits: item.hits, tags: [...item.tags] }));
  }

  stats() {
    let bytes = 0;
    for (const item of this.map.values()) {
      try { bytes += Buffer.byteLength(JSON.stringify(item.value)); } catch {}
    }
    return { entries: this.map.size, approximateBytes: bytes };
  }
}

export class CacheNamespace {
  constructor(cache, prefix) {
    this.cache = cache;
    this.prefix = String(prefix).replace(/:+$/u, '');
  }

  key(key) {
    return this.prefix + ':' + String(key);
  }

  set(key, value, options) {
    return this.cache.set(this.key(key), value, options);
  }

  get(key, options) {
    return this.cache.get(this.key(key), options);
  }

  delete(key) {
    return this.cache.delete(this.key(key));
  }

  invalidateTag(tag) {
    return this.cache.invalidateTag(this.key(tag));
  }

  clear() {
    for (const entry of this.cache.entries()) if (entry.key.startsWith(this.prefix + ':')) this.cache.delete(entry.key);
  }
}
