import { rateLimited } from './errors.js';
import { systemClock } from './clock.js';

export class TokenBucket {
  constructor(options = {}) {
    this.capacity = Math.max(1, Number(options.capacity || 1));
    this.refillPerSecond = Math.max(0, Number(options.refillPerSecond || 0));
    this.tokens = this.capacity;
    this.updatedAt = Number(options.updatedAt || systemClock.now());
    this.clock = options.clock || systemClock;
  }

  refill(now = this.clock.now()) {
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.updatedAt = now;
    return this.tokens;
  }

  take(cost = 1, now = this.clock.now()) {
    const amount = Math.max(0, Number(cost) || 0);
    this.refill(now);
    if (this.tokens >= amount) {
      this.tokens -= amount;
      return { allowed: true, remaining: this.tokens, retryAfterMs: 0 };
    }
    const missing = amount - this.tokens;
    const retryAfterMs = this.refillPerSecond > 0 ? Math.ceil(missing / this.refillPerSecond * 1000) : Infinity;
    return { allowed: false, remaining: this.tokens, retryAfterMs };
  }

  snapshot() {
    this.refill();
    return { capacity: this.capacity, refillPerSecond: this.refillPerSecond, tokens: this.tokens, updatedAt: this.updatedAt };
  }
}

export class RateLimiter {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    this.defaults = options.defaults || {};
    this.buckets = new Map();
    this.maxEntries = Number(options.maxEntries || 20000);
  }

  key(parts) {
    return Array.isArray(parts) ? parts.join(':') : String(parts);
  }

  bucket(key, policy = {}) {
    const name = this.key(key);
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new TokenBucket({ ...this.defaults, ...policy, clock: this.clock });
      this.buckets.set(name, bucket);
      this.trim();
    }
    return bucket;
  }

  check(key, policy, cost = 1) {
    const result = this.bucket(key, policy).take(cost);
    if (!result.allowed) throw rateLimited(result.retryAfterMs, { key: this.key(key) });
    return result;
  }

  tryCheck(key, policy, cost = 1) {
    return this.bucket(key, policy).take(cost);
  }

  reset(prefix) {
    const value = prefix === undefined ? undefined : String(prefix);
    for (const key of this.buckets.keys()) if (value === undefined || key.startsWith(value)) this.buckets.delete(key);
  }

  trim() {
    if (this.buckets.size <= this.maxEntries) return;
    const remove = this.buckets.size - this.maxEntries;
    for (const key of [...this.buckets.keys()].slice(0, remove)) this.buckets.delete(key);
  }

  snapshot() {
    return Object.fromEntries([...this.buckets.entries()].map(([key, value]) => [key, value.snapshot()]));
  }
}
