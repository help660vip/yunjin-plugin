import { Clock } from './clock.js';
import { KeyedMutex } from './locks.js';
import { TTLCache } from './cache.js';
import { RateLimiter } from './rate-limit.js';
import { QuotaLedger } from './quota.js';
import { QUOTAS, RATE_LIMITS } from './constants.js';

export class CoreServices {
  constructor(options = {}) {
    this.clock = options.clock || new Clock({ timeZone: options.timeZone });
    this.mutex = options.mutex || new KeyedMutex({ clock: this.clock });
    this.cache = options.cache || new TTLCache({ clock: this.clock, maxEntries: options.maxCacheEntries || 5000, defaultTtlMs: options.cacheTtlMs || 60000 });
    this.rateLimiter = options.rateLimiter || new RateLimiter({ clock: this.clock, defaults: RATE_LIMITS.command });
    this.quota = options.quota || new QuotaLedger({ clock: this.clock, defaults: QUOTAS });
    this.started = false;
  }

  start() {
    this.started = true;
    return this;
  }

  stop() {
    this.cache.clear();
    this.rateLimiter.reset();
    this.quota.entries.clear();
    this.mutex.clear();
    this.started = false;
  }

  commandLimit(event, featureId, cost = 1) {
    const key = ['command', event?.botId || event?.selfId || 'default', event?.groupId || 'private', event?.userId || 'unknown', featureId].join(':');
    return this.rateLimiter.check(key, RATE_LIMITS.command, cost);
  }

  networkLimit(event, featureId) {
    const key = ['network', event?.botId || 'default', event?.groupId || 'private', event?.userId || 'unknown', featureId].join(':');
    return this.rateLimiter.check(key, RATE_LIMITS.network, 1);
  }

  renderLimit(event, featureId) {
    const key = ['render', event?.botId || 'default', event?.groupId || 'private', event?.userId || 'unknown', featureId].join(':');
    return this.rateLimiter.check(key, RATE_LIMITS.render, 1);
  }

  consumeQuota(event, quotaName, amount = 1) {
    const scope = [event?.botId || 'default', event?.groupId || 'private', event?.userId || 'unknown'].join(':');
    return this.quota.consume(scope, quotaName, amount);
  }
}
