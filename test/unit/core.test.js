import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../lib/storage/memory-repository.js';
import { FeatureStore } from '../../lib/features/store.js';
import { Clock } from '../../lib/core/clock.js';
import { TokenBucket } from '../../lib/core/rate-limit.js';
import { parseNamespace, parseDuration } from '../../lib/parser/command.js';
import { safeUrl } from '../../lib/http/client.js';
import { validateUrl } from '../../lib/http/policy.js';
import { SchedulerService } from '../../lib/scheduler/service.js';
import { NotificationBus } from '../../lib/notification/bus.js';
import { renderCardHtml } from '../../lib/renderer/templates.js';
import { makeTempDir } from '../helpers.js';
import { getRuntime, shutdownRuntime } from '../../lib/bootstrap.js';

test('feature store isolates bot, group and user scopes', async () => {
  await shutdownRuntime();
  const runtime = getRuntime({ dataRoot: await makeTempDir('yunjin-store-') });
  await runtime.start();
  const first = { botId: 'bot-a', groupId: 'group-a', userId: 'user-a' };
  const second = { botId: 'bot-a', groupId: 'group-b', userId: 'user-a' };
  const firstStore = new FeatureStore(runtime, '42', first, { level: 'group' });
  const secondStore = new FeatureStore(runtime, '42', second, { level: 'group' });
  await firstStore.add({ word: 'only-a' }, 'words');
  assert.equal((await firstStore.list('words')).length, 1);
  assert.equal((await secondStore.list('words')).length, 0);
  const sameGroupDifferentUser = new FeatureStore(runtime, '42', { ...first, userId: 'user-b' }, { level: 'member' });
  await sameGroupDifferentUser.add({ word: 'only-b' }, 'words');
  assert.equal((await sameGroupDifferentUser.list('words')).length, 1);
  assert.equal((await new FeatureStore(runtime, '42', first, { level: 'member' }).list('words')).length, 0);
  await shutdownRuntime();
});

test('HTTP policy rejects unsafe protocols, local hosts and private addresses', () => {
  assert.throws(() => safeUrl('file:///tmp/a'), /HTTP|HTTPS|协议/u);
  assert.throws(() => safeUrl('http://localhost/a'), /本地|私网|环回/u);
  assert.throws(() => validateUrl('http://127.0.0.1/a'), /私网|环回/u);
  assert.throws(() => validateUrl('https://example.com/a', { hosts: ['openai.com'] }), /允许列表/u);
  assert.equal(validateUrl('https://example.com/a').protocol, 'https:');
});

test('command parser supports quoted arguments and bounded durations', () => {
  const parsed = parseNamespace('#云锦配置 设置 "core.enabled" false --scope=global');
  assert.equal(parsed.matched, true);
  assert.equal(parsed.command, '配置');
  assert.deepEqual(parsed.args, ['设置', 'core.enabled', 'false']);
  assert.equal(parsed.flags.scope, 'global');
  assert.equal(parseDuration('2h'), 7200000);
  assert.throws(() => parseDuration('0m'), /格式|范围/u);
});

test('token bucket refills from an injected clock', () => {
  let now = 1000;
  const clock = new Clock({ now: () => now });
  const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 1, clock });
  assert.equal(bucket.take().allowed, true);
  assert.equal(bucket.take().allowed, true);
  assert.equal(bucket.take().allowed, false);
  now += 1000;
  assert.equal(bucket.take().allowed, true);
});

test('scheduler persists, deduplicates, executes once and cancels', async () => {
  const repository = new MemoryRepository();
  const executed = [];
  const scheduler = new SchedulerService(repository, { onExecute: async (task) => executed.push(task.id) });
  const task = await scheduler.create({ featureId: '06', title: 'test', runAt: Date.now() + 60000, dedupeKey: 'same' });
  const duplicate = await scheduler.create({ featureId: '06', title: 'test', runAt: Date.now() + 60000, dedupeKey: 'same' });
  assert.equal(duplicate.id, task.id);
  assert.equal(await scheduler.execute(task.id), true);
  assert.deepEqual(executed, [task.id]);
  assert.equal(await scheduler.execute(task.id), false);
  const cancelled = await scheduler.create({ featureId: '06', title: 'cancel', runAt: Date.now() + 60000 });
  assert.equal(await scheduler.cancel(cancelled.id), true);
  assert.equal((await scheduler.find(cancelled.id)).status, 'cancelled');
  await scheduler.close();
});

test('notification bus deduplicates and sanitizes payloads', async () => {
  const bus = new NotificationBus();
  const values = [];
  bus.on('test', (event) => { values.push(event); return event.payload; });
  const first = await bus.publish('test', { token: 'secret', value: 'ok' }, { dedupeKey: 'one' });
  const second = await bus.publish('test', { token: 'secret', value: 'ok' }, { dedupeKey: 'one' });
  assert.equal(first.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(values[0].payload.token, '[redacted]');
  bus.close();
});

test('renderer escapes HTML, strips control characters and keeps safe footer', () => {
  const html = renderCardHtml({ feature: 'x', title: '<script>', subtitle: '\u0000hello', rows: [{ label: 'url', value: '<b>x</b>', url: 'javascript:alert(1)' }] });
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('https://github.com/help660vip/yunjin-plugin'), true);
});
