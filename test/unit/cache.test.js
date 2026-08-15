import test from 'node:test';
import assert from 'node:assert/strict';
import { TTLCache } from '../../lib/core/cache.js';
import { HttpCache } from '../../lib/http/cache.js';

test('缓存在到期边界使用左闭右开时间窗口', () => {
  let now = 100;
  const cache = new TTLCache({ clock: { now: () => now } });
  cache.set('key', 'value', { ttlMs: 10, staleMs: 10 });
  now = 110;
  assert.equal(cache.get('key', { allowStale: true }), 'value');
  now = 120;
  assert.equal(cache.get('key', { allowStale: true }), undefined);
  cache.set('fresh-check', 'value', { ttlMs: 10, staleMs: 10 });
  now = 130;
  assert.equal(cache.get('fresh-check'), undefined);
});

test('缓存不保存 undefined 占位条目', () => {
  const cache = new HttpCache();
  cache.set('https://example.com', undefined);
  assert.equal(cache.get('https://example.com'), undefined);
  assert.equal(cache.cache.entries().length, 0);
});
