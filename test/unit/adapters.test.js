import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { BotAdapter } from '../../lib/adapters/bot.js';
import { RuntimeCapabilities } from '../../lib/adapters/runtime.js';
import { ProviderRegistry, createDefaultProviders } from '../../lib/adapters/providers.js';
import { FilePolicy, sniffMime } from '../../lib/adapters/file.js';
import { RedisAdapter } from '../../lib/adapters/redis.js';
import { GroupAggregate } from '../../lib/features/aggregate.js';
import { RuleEngine } from '../../lib/features/rules.js';
import { ConfigMigrationPipeline, ConfigTransaction, flattenConfig, unflattenConfig } from '../../lib/config/migration.js';
import { MetricsRegistry } from '../../lib/observability/metrics.js';
import { makeTempDir } from '../helpers.js';

test('bot adapter detects capabilities and reports unsupported operations', async () => {
  const calls = [];
  const bot = { uin: 'bot-1', deleteMsg: async (id) => { calls.push(id); return true; } };
  const event = { bot, botId: 'bot-1', groupId: 'group-1', userId: 'user-1', reply: async (message) => message };
  const adapter = new BotAdapter(event);
  assert.equal(adapter.capabilities.deleteMsg, true);
  assert.equal((await adapter.delete('msg-1')).ok, true);
  assert.deepEqual(calls, ['msg-1']);
  assert.equal((await adapter.kick('group-1', 'user-1')).ok, false);
  assert.equal(adapter.summary().botId, 'bot-1');
});

test('runtime capability probe is shape based rather than runtime-name based', () => {
  const probe = new RuntimeCapabilities({ bot: { sendMsg() {} }, runtime: { render() {} }, groupId: 'g' }, {});
  assert.equal(probe.has('sendMsg'), true);
  assert.equal(probe.render, true);
  assert.equal(probe.missing(['sendMsg', 'deleteMsg']).includes('deleteMsg'), true);
});

test('provider registry supports local provider without external network', async () => {
  const registry = new ProviderRegistry();
  registry.register('local', async (input) => String(input.value).toUpperCase());
  const result = await registry.query('local', {}, { value: 'ok' });
  assert.deepEqual(result, { ok: true, value: 'OK', provider: 'local' });
  assert.equal(registry.has('missing'), false);
  assert.equal(createDefaultProviders().has('translation.local'), true);
});

test('file policy validates magic bytes, bounds, cleanup and path safety', async () => {
  const root = await makeTempDir('yunjin-file-');
  const policy = new FilePolicy({ root, allowedMime: ['image/png'], ttlMs: 1 });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.equal(sniffMime(png), 'image/png');
  const saved = await policy.saveBuffer(png, { name: 'safe.png' });
  assert.equal(saved.mime, 'image/png');
  await assert.rejects(() => policy.read('../safe.png'), /ENOENT|允许|文件/u);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await policy.cleanup(), 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('redis adapter uses namespaced memory fallback', async () => {
  const redis = new RedisAdapter();
  await redis.set('15', 'bot:1:group:2', 'key', 'rules', { value: 1 });
  assert.deepEqual(await redis.get('15', 'bot:1:group:2', 'key', 'rules'), { value: 1 });
  assert.match(redis.key('15', 'scope', 'id', 'x'), /^Yunjin:15:/u);
  assert.equal(redis.status().backend, 'memory');
  await redis.close();
});

test('group aggregate and rule engine bound content and scope', () => {
  const aggregate = new GroupAggregate({ maxMessages: 2 });
  aggregate.record({ botId: 'b', groupId: 'g', userId: 'u', message: 'hello' });
  aggregate.record({ botId: 'b', groupId: 'g', userId: 'u', message: '#云锦帮助' });
  aggregate.record({ botId: 'b', groupId: 'g', userId: 'v', message: 'https://example.com' });
  assert.equal(aggregate.snapshot({ botId: 'b', groupId: 'g' }).messages.length, 2);
  assert.equal(aggregate.topUsers({ botId: 'b', groupId: 'g' })[0].messages, 2);
  const rules = new RuleEngine({ cooldownMs: 10000 });
  rules.add({ trigger: 'hello', response: 'world' });
  assert.equal(rules.match('say hello', { groupId: 'g' }).rule.response, 'world');
  assert.equal(rules.match('say hello', { groupId: 'g' }).suppressed, true);
});

test('config migrations, transactions and flattening are deterministic', async () => {
  const pipeline = new ConfigMigrationPipeline({ currentVersion: 2 });
  pipeline.register(2, (value) => ({ ...value, migrated: true }));
  const migrated = await pipeline.migrate({ version: 1, core: { enabled: true } });
  assert.equal(migrated.value.migrated, true);
  const tx = new ConfigTransaction({ core: { enabled: true } });
  tx.set('core.enabled', false).set('core.name', 'x');
  assert.equal(tx.diff().length, 2);
  assert.deepEqual(unflattenConfig(flattenConfig({ a: { b: 1 } })), { a: { b: 1 } });
});

test('metrics counters, gauges and histograms expose bounded snapshots', () => {
  const metrics = new MetricsRegistry({ maxLabels: 2 });
  metrics.counter('commands', { feature: '01' });
  metrics.gauge('enabled', 50);
  metrics.observe('latency', 10);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.counters.length, 1);
  assert.equal(snapshot.gauges.length, 1);
  assert.equal(snapshot.histograms[0].average, 10);
});
