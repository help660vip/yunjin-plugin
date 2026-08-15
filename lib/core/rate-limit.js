import { rateLimited } from './errors.js';
import { systemClock } from './clock.js';

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCapacity(value) {
  return Math.max(1, Math.floor(finiteNumber(value, 1)));
}

function normalizeRate(value) {
  return Math.max(0, finiteNumber(value, 0));
}

function normalizeInteger(value, fallback) {
  return Math.max(1, Math.floor(finiteNumber(value, fallback)));
}

export class TokenBucket {
  constructor(options = {}) {
    this.clock = options.clock || systemClock;
    const initialNow = finiteNumber(this.clock.now(), 0);
    this.capacity = normalizeCapacity(options.capacity ?? 1);
    this.refillPerSecond = normalizeRate(options.refillPerSecond ?? 0);
    this.tokens = this.capacity;
    this.updatedAt = finiteNumber(options.updatedAt, initialNow);
  }

  refill(now = this.clock.now()) {
    const current = finiteNumber(now, this.updatedAt);
    if (current <= this.updatedAt) return this.tokens;
    const elapsed = (current - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.updatedAt = current;
    return this.tokens;
  }

  take(cost = 1, now = this.clock.now()) {
    const rawCost = Number(cost);
    const amount = Number.isFinite(rawCost) ? Math.max(0, rawCost) : Infinity;
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
    this.maxEntries = normalizeInteger(options.maxEntries ?? 20000, 20000);
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
