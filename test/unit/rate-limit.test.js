import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, TokenBucket } from '../../lib/core/rate-limit.js';

test('限流参数异常时保持有限状态', () => {
  let now = 0;
  const bucket = new TokenBucket({
    capacity: Number.POSITIVE_INFINITY,
    refillPerSecond: Number.NaN,
    updatedAt: Number.POSITIVE_INFINITY,
    clock: { now: () => now }
  });
  const snapshot = bucket.snapshot();
  assert.deepEqual(snapshot, { capacity: 1, refillPerSecond: 0, tokens: 1, updatedAt: 0 });
  assert.equal(bucket.take(Number.NaN).allowed, false);
  assert.equal(bucket.take(Number.POSITIVE_INFINITY).allowed, false);
  now = 1000;
  assert.equal(bucket.refill(), 1);
});

test('时间回拨不会重复补充令牌', () => {
  let now = 0;
  const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 1, clock: { now: () => now } });
  assert.equal(bucket.take(2).allowed, true);
  now = 1000;
  assert.equal(bucket.refill(), 1);
  now = 500;
  assert.equal(bucket.refill(), 1);
  now = 2000;
  assert.equal(bucket.refill(), 2);
});

test('限流器条目上限使用有限整数', () => {
  const limiter = new RateLimiter({ maxEntries: Number.POSITIVE_INFINITY });
  assert.equal(limiter.maxEntries, 20000);
  limiter.bucket('a', { capacity: 1 });
  assert.equal(limiter.tryCheck('a', {}, Number.NaN).allowed, false);
});
