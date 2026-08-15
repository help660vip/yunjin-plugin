import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRedis, RedisAdapter } from '../../lib/adapters/redis.js';

test('内存 Redis 在到期边界清理键值并移除旧 TTL', async () => {
  let now = 0;
  const redis = new MemoryRedis({ clock: { now: () => now } });
  await redis.set('key', 'old', { EX: 1 });
  await redis.set('key', 'new');
  now = 1000;
  assert.equal(await redis.get('key'), 'new');
  await redis.set('key', 'expired', { EX: 0 });
  assert.equal(await redis.get('key'), null);
});

test('异步 Redis 操作失败时写入、读取和删除都使用回退', async () => {
  const failing = {
    get: async () => { throw new Error('读取失败'); },
    set: async () => { throw new Error('写入失败'); },
    del: async () => { throw new Error('删除失败'); }
  };
  const fallback = new MemoryRedis();
  const adapter = new RedisAdapter({ client: failing, fallback, prefix: 'Yunjin:tenant' });
  assert.match(adapter.key('feature', 'group', '1', 'value'), /^Yunjin_tenant:/u);
  assert.equal(await adapter.set('feature', 'group', '1', 'value', { ok: true }), 'OK');
  assert.deepEqual(await adapter.get('feature', 'group', '1', 'value'), { ok: true });
  assert.equal(await adapter.delete('feature', 'group', '1', 'value'), 1);
});

test('外部 Redis 未配置时使用内置回退', async () => {
  const failing = { get: async () => { throw new Error('不可用'); }, set: async () => { throw new Error('不可用'); } };
  const adapter = new RedisAdapter({ client: failing });
  assert.equal(adapter.status().available, true);
  assert.equal(await adapter.set('feature', 'user', '2', 'value', 'ok'), 'OK');
  assert.equal(await adapter.get('feature', 'user', '2', 'value'), 'ok');
});
