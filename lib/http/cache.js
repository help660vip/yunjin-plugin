import { TTLCache } from '../core/cache.js';
import { hash } from '../core/ids.js';

export class HttpCache {
  constructor(options = {}) {
    this.cache = options.cache || new TTLCache({ defaultTtlMs: options.defaultTtlMs || 30000, maxEntries: options.maxEntries || 500 });
    this.prefix = options.prefix || 'http';
  }

  key(url, options = {}) {
    return this.prefix + ':' + hash([url, options.method || 'GET', options.body || ''].join('\n'), 'sha256');
  }

  get(url, options = {}) {
    return this.cache.get(this.key(url, options), { allowStale: options.allowStale });
  }

  set(url, value, options = {}) {
    return this.cache.set(this.key(url, options), value, { ttlMs: options.ttlMs, staleMs: options.staleMs, tags: options.tags || [this.prefix] });
  }

  delete(url, options = {}) {
    return this.cache.delete(this.key(url, options));
  }

  clear() {
    this.cache.invalidateTag(this.prefix);
  }
}
