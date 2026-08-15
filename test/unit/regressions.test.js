import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../lib/storage/memory-repository.js';
import { SchedulerService } from '../../lib/scheduler/service.js';
import { ConfigService } from '../../lib/config/service.js';
import { canWriteConfig } from '../../lib/auth/policy.js';
import { executeFeature } from '../../lib/features/service.js';
import { dispatchFeature } from '../../lib/features/handlers/index.js';
import { featureManifests } from '../../apps/manifest.js';
import { serviceFor } from '../../lib/features/service-index.js';

function runtimeWithState(initial = {}) {
  return {
    stateRepository: new MemoryRepository(initial),
    core: { clock: { now: () => 1700000000000, dayKey: () => '2023-11-14', format: (value) => new Date(value).toISOString() } },
    audit: { record: async () => ({ ok: true }) },
    registry: { list: () => featureManifests },
    config: null,
    scheduler: null
  };
}

test('runtime dispatch uses the concrete handler set', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '01');
  const result = await executeFeature(manifest, { botId: 'b', groupId: 'g', userId: 'u' }, [], runtime);
  assert.match(result, /YunJin 运行状态/u);
});

test('generated service failures are readable and healthCheck does not recurse', () => {
  const service = serviceFor('01');
  assert.equal(service.failure('invalid'), '参数不合法');
  assert.equal(service.failure('dependency', 'http'), '依赖不可用: http');
  assert.doesNotThrow(() => service.healthCheck({ registry: { isEnabled: () => true }, runtime: true, core: { render: {} } }));
  assert.equal(service.healthCheck({ registry: { isEnabled: () => true }, runtime: true, core: { render: {} } }).degraded, false);
});

test('config scope aliases and state leaf values remain safe', async () => {
  const repository = new MemoryRepository({ global: { 'core.enabled': false }, groups: {}, users: {} });
  const config = new ConfigService({ repository, audit: { record: async () => {} } });
  await config.initialize();
  assert.equal(config.getGlobal('core.enabled'), false);
  assert.deepEqual(await config.set({ name: '群', id: 'g1' }, 'core.enabled', true), { ok: true, action: 'updated', scope: 'group', key: 'core.enabled', value: true });
  assert.equal((await config.getEffectiveValue({ name: 'group', id: 'g1' }, 'core.enabled')).value, true);
  assert.equal((await config.set({ name: 'unknown', id: 'g1' }, 'core.enabled', true)).error, 'invalid_scope');
  assert.equal((await config.set({ name: 'group', id: '__proto__' }, 'core.enabled', true)).error, 'invalid_scope');
});

test('config writes follow Yunzai OP and current-scope ownership', () => {
  assert.equal(canWriteConfig({ isMaster: false, userId: 'u1', groupId: 'g1', role: 'member' }, { name: 'user', id: 'u1' }), true);
  assert.equal(canWriteConfig({ isMaster: false, userId: 'u1', groupId: 'g1', role: 'member' }, { name: 'user', id: 'u2' }), false);
  assert.equal(canWriteConfig({ isMaster: false, userId: 'u1', groupId: 'g1', role: 'admin' }, { name: 'group', id: 'g1' }), true);
  assert.equal(canWriteConfig({ isMaster: false, userId: 'u1', groupId: 'g1', role: 'admin' }, { name: 'group', id: 'g2' }), false);
  assert.equal(canWriteConfig({ isMaster: true, userId: 'u1' }, { name: 'global' }), true);
});

test('report list action does not create an error record', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '02');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const result = await dispatchFeature(manifest, event, ['查看'], runtime);
  assert.match(result, /暂无记录/u);
  assert.deepEqual(await runtime.stateRepository.read({}), {});
});

test('members can join a group signup while management remains admin-only', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '49');
  const member = { botId: 'b', groupId: 'g', userId: 'u', role: 'member', isMaster: false };
  const joined = await dispatchFeature(manifest, member, ['参加', '活动'], runtime);
  assert.match(joined, /人数 1/u);
  const denied = await dispatchFeature(manifest, member, ['关闭', '活动'], runtime);
  assert.match(denied, /管理员/u);
  const listed = await dispatchFeature(manifest, member, ['列表', '活动'], runtime);
  assert.match(listed, /人数：1/u);
});

test('scheduler retries without exceeding maxAttempts and reschedules', async () => {
  const repository = new MemoryRepository({ tasks: [] });
  let attempts = 0;
  const scheduler = new SchedulerService(repository, { clock: { now: () => 1000 }, onExecute: async () => { attempts += 1; if (attempts === 1) throw new Error('temporary'); } });
  const task = await scheduler.create({ featureId: '06', title: 'retry', runAt: 100000, maxAttempts: 2 });
  await assert.rejects(() => scheduler.execute(task.id), /temporary/u);
  assert.equal((await scheduler.find(task.id)).status, 'scheduled');
  assert.equal((await scheduler.execute(task.id)), true);
  assert.equal((await scheduler.find(task.id)).status, 'done');
  assert.equal(attempts, 2);
  await scheduler.close();
});

test('scheduler recovers interrupted tasks on startup', async () => {
  const repository = new MemoryRepository({ tasks: [{ id: 't', featureId: '06', title: 'recover', runAt: 100000, status: 'running', attempts: 1, maxAttempts: 2, botId: 'b', groupId: 'g', userId: 'u' }] });
  const scheduler = new SchedulerService(repository, { clock: { now: () => 1000 } });
  const tasks = await scheduler.recover();
  assert.equal(tasks[0].status, 'scheduled');
  assert.equal((await scheduler.find('t')).status, 'scheduled');
  await scheduler.close();
});
