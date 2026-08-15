import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../lib/storage/memory-repository.js';
import { SchedulerService } from '../../lib/scheduler/service.js';
import { ConfigService } from '../../lib/config/service.js';
import { canWriteConfig } from '../../lib/auth/policy.js';
import { executeFeature, scanFeature } from '../../lib/features/service.js';
import { dispatchFeature } from '../../lib/features/handlers/index.js';
import { featureManifests } from '../../apps/manifest.js';
import { serviceFor } from '../../lib/features/service-index.js';
import { NotificationBus } from '../../lib/notification/bus.js';
import { handlerContext } from '../../lib/features/handlers/context.js';
import { handleRequestEvent } from '../../lib/features/handlers/core.js';
import { normalizeEvent } from '../../lib/runtime/event.js';

function runtimeWithState(initial = {}) {
  return {
    stateRepository: new MemoryRepository(initial),
    core: { clock: { now: () => 1700000000000, dayKey: () => '2023-11-14', format: (value) => new Date(value).toISOString() }, renderLimit: () => ({ allowed: true }) },
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

test('status card reports scheduler, notification, and render health', async () => {
  const runtime = runtimeWithState();
  runtime.scheduler = { list: async () => [{ status: 'scheduled' }, { status: 'done' }] };
  runtime.notifications = { snapshot: () => ({ queue: [{ id: 'a' }, { id: 'b' }], topics: ['task.execute'] }) };
  runtime.capabilities = () => ({ render: true, message: { reply: true, send: true } });
  const manifest = featureManifests.find((item) => item.id === '01');
  const result = await dispatchFeature(manifest, { botId: 'b', groupId: 'g', userId: 'u' }, [], runtime);
  assert.match(result, /\u8c03\u5ea6\u4efb\u52a1\uFF1A1\/2/u);
  assert.match(result, /\u901a\u77e5\u961f\u5217\uFF1A2 \/ 1 topics/u);
  assert.match(result, /\u6e32\u67d3\uFF1A\u53EF\u7528/u);
  assert.match(result, /\u6d88\u606f\u9002\u914d\uFF1A2/u);
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


test('periodic tasks remain scheduled and cancelled tasks stay terminal', async () => {
  const repository = new MemoryRepository({ tasks: [{ id: 'repeat', featureId: '18', title: 'repeat', runAt: 1000, status: 'scheduled', attempts: 0, maxAttempts: 1, repeatMs: 100, botId: 'b', groupId: 'g', userId: 'u' }] });
  let executions = 0;
  const scheduler = new SchedulerService(repository, { clock: { now: () => 1000 }, onExecute: async () => { executions += 1; } });
  assert.equal(await scheduler.execute('repeat'), true);
  assert.equal(executions, 1);
  assert.equal((await scheduler.find('repeat')).status, 'scheduled');
  assert.equal(await scheduler.cancel('repeat'), true);
  assert.equal(await scheduler.execute('repeat'), false);
  assert.equal((await scheduler.find('repeat')).status, 'cancelled');
  await scheduler.close();
});

test('notification dedupe works with a zero-based clock', async () => {
  const bus = new NotificationBus({ clock: { now: () => 0 }, maxQueue: 10 });
  let calls = 0;
  bus.on('test', async () => { calls += 1; });
  await bus.publish('test', { value: 1 }, { dedupeKey: 'zero-clock' });
  const duplicate = await bus.publish('test', { value: 1 }, { dedupeKey: 'zero-clock' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(calls, 1);
  bus.close();
});

test('notification dedupe keys remain retryable after handler failure', async () => {
  const bus = new NotificationBus();
  let attempts = 0;
  bus.on('retryable', async () => { attempts += 1; if (attempts === 1) throw new Error('temporary'); });
  const failed = await bus.publish('retryable', { value: 1 }, { dedupeKey: 'retry-key', attempts: 1 });
  assert.equal(failed.ok, false);
  const retried = await bus.publish('retryable', { value: 1 }, { dedupeKey: 'retry-key', attempts: 1 });
  assert.equal(retried.ok, true);
  assert.equal(attempts, 2);
  bus.close();
});
test('handler context cannot override event scope or audit identity', async () => {
  const audits = [];
  const runtime = runtimeWithState();
  runtime.audit.record = async (entry) => { audits.push(entry); return { ok: true }; };
  const manifest = featureManifests.find((item) => item.id === '45');
  const ctx = handlerContext(manifest, { botId: 'b', groupId: 'g', userId: 'u' }, [], runtime);
  await ctx.add({ groupId: 'other', userId: 'other', botId: 'other', text: 'scoped' });
  assert.deepEqual((await ctx.store.list('items'))[0], { groupId: 'g', userId: 'u', botId: 'b', text: 'scoped', id: (await ctx.store.list('items'))[0].id, createdAt: 1700000000000 });
  await ctx.audit('scope.test', { featureId: 'other', userId: 'other', groupId: 'other', botId: 'other' });
  assert.equal(audits[0].featureId, '45');
  assert.equal(audits[0].userId, 'u');
  assert.equal(audits[0].groupId, 'g');
  assert.equal(audits[0].botId, 'b');
});



test('request events approve only bot-scoped allow-list matches and deduplicate flags', async () => {
  const calls = [];
  const runtime = runtimeWithState();
  runtime.registry.isEnabled = () => true;
  const manifest = featureManifests.find((item) => item.id === '13');
  await dispatchFeature(manifest, { botId: 'b', groupId: 'g', userId: 'u', isMaster: true }, ['\u6dfb\u52a0', 'g'], runtime);
  const event = normalizeEvent({
    post_type: 'request',
    request_type: 'group',
    sub_type: 'add',
    group_id: 'g',
    user_id: 'u',
    self_id: 'b',
    flag: 'flag-1',
    bot: { setGroupAddRequest: async (payload) => { calls.push(payload); return true; } }
  });
  const ordinary = { ...event, type: 'message', postType: 'message' };
  assert.equal(await handleRequestEvent(manifest, ordinary, runtime), false);
  const first = await handleRequestEvent(manifest, event, runtime);
  const second = await handleRequestEvent(manifest, event, runtime);
  assert.equal(first.approved, true);
  assert.equal(second, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].approve, true);
});

test('summary uses the shared renderer when the host provides one', async () => {
  const runtime = runtimeWithState();
  let rendered = 0;
  const event = {
    botId: 'b',
    groupId: 'g',
    userId: 'u',
    raw: { runtime: { render: async () => { rendered += 1; return { type: 'image', url: 'mock://card' }; } } }
  };
  const manifest = featureManifests.find((item) => item.id === '29');
  const ctx = handlerContext(manifest, event, [], runtime);
  const result = await ctx.summary('QR', [{ label: 'content', value: 'hello' }], { render: true });
  assert.equal(rendered, 1);
  assert.deepEqual(result, { type: 'image', url: 'mock://card' });
});

test('push records can republish a failed notification', async () => {
  const runtime = runtimeWithState();
  const published = [];
  runtime.notifications = { publish: async (topic, payload, options) => { published.push({ topic, payload, options }); return { ok: true }; } };
  const manifest = featureManifests.find((item) => item.id === '23');
  const event = { botId: 'b', groupId: 'g', userId: 'u', role: 'admin' };
  const ctx = handlerContext(manifest, event, [], runtime, { level: 'group' });
  await ctx.add({ id: 'push-1', taskId: 'task-1', featureId: '21', runAt: 1000, status: 'failed', payload: { kind: 'broadcast', content: 'hello', groupId: 'g', botId: 'b' } }, 'items');
  const result = await dispatchFeature(manifest, event, ['\u91cd\u8bd5', 'push-1'], runtime);
  assert.match(result, /\u91cd\u8bd5\u6210\u529f/u);
  assert.equal(published[0].topic, 'task.execute');
  assert.equal(published[0].options.dedupe, false);
});

test('passive group telemetry persists one incoming message across enabled views', async () => {
  const runtime = runtimeWithState();
  await scanFeature({ id: '12' }, { botId: 'b', groupId: 'g', userId: 'u', message: 'hello', raw: { message_id: 'm1' } }, runtime);
  const root = await runtime.stateRepository.read({});
  const values = Object.values(root);
  assert.equal(values.filter((value) => value?.counters?.messages === 1).length, 3);
  assert.equal(values.some((value) => Array.isArray(value?.events) && value.events[0]?.messageId === 'm1'), true);
  assert.equal(values.some((value) => Array.isArray(value?.messages) && value.messages[0]?.messageId === 'm1'), true);
});

test('report action merges repeated scoped errors', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '02');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const first = await dispatchFeature(manifest, event, ['\u8fde\u63a5\u8d85\u65f6'], runtime);
  const second = await dispatchFeature(manifest, event, ['\u8fde\u63a5\u8d85\u65f6'], runtime);
  assert.match(first, /\u5f02\u5e38\u5df2\u8bb0\u5f55/u);
  assert.match(second, /\u91cd\u590d 2 \u6b21/u);
  const root = await runtime.stateRepository.read({});
  const state = Object.values(root)[0];
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].occurrences, 2);
  const otherScope = await dispatchFeature(manifest, { ...event, groupId: 'other' }, ['\u8fde\u63a5\u8d85\u65f6'], runtime);
  assert.match(otherScope, /\u5f02\u5e38\u5df2\u8bb0\u5f55/u);
  const states = Object.values(await runtime.stateRepository.read({}));
  assert.equal(states.length, 2);
});

test('log archive validates actions and reports clear count', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '03');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const { featureStore } = await import('../../lib/features/store.js');
  await featureStore(runtime, '03', event).add({ text: 'startup warning' });
  const usage = await dispatchFeature(manifest, event, ['unknown'], runtime);
  assert.ok(usage.includes('\u67e5\u770b|\u6e05\u7406'));
  const result = await dispatchFeature(manifest, event, ['\u6e05\u7406'], runtime);
  assert.match(result, /1 \u6761\u65e5\u5fd7/u);
  const empty = await dispatchFeature(manifest, event, ['\u6e05\u7406'], runtime);
  assert.match(empty, /\u6ca1\u6709\u65e5\u5fd7/u);
});

test('transaction updates are atomic and terminal operations are idempotent', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '04');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const started = await dispatchFeature(manifest, event, ['\u90e8\u7f72\u4efb\u52a1'], runtime);
  assert.match(started, /\u4e8b\u52a1\u5df2\u5f00\u59cb/u);
  const { featureStore } = await import('../../lib/features/store.js');
  const item = (await featureStore(runtime, '04', event).list('items'))[0];
  const finished = await dispatchFeature(manifest, event, ['\u7ed3\u675f', item.id], runtime);
  assert.match(finished, /\u4e8b\u52a1\u5df2\u66f4\u65b0/u);
  const repeated = await dispatchFeature(manifest, event, ['\u7ed3\u675f', item.id], runtime);
  assert.match(repeated, /\u7ec8\u6001/u);
  const state = (await featureStore(runtime, '04', event).list('items'))[0];
  assert.equal(state.status, 'done');
  const usage = await dispatchFeature(manifest, event, ['\u672a\u77e5', 'extra'], runtime);
  assert.ok(usage.includes('\u5f00\u59cb'));
});

test('monitor add preserves IDs and rolls back scheduler failures', async () => {
  const runtime = runtimeWithState();
  runtime.scheduler = { tasks: [], async list() { return this.tasks; }, async create(payload) { const task = { ...payload, id: 'task-' + (this.tasks.length + 1), status: 'scheduled' }; this.tasks.push(task); return task; }, async cancel() { return true; } };
  const manifest = featureManifests.find((item) => item.id === '05');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const first = await dispatchFeature(manifest, event, ['\u6dfb\u52a0', 'https://example.com'], runtime);
  const second = await dispatchFeature(manifest, event, ['\u6dfb\u52a0', 'https://example.com/'], runtime);
  assert.match(first, /\u76d1\u63a7\u5df2\u6dfb\u52a0/u);
  assert.match(second, /\u76d1\u63a7\u5df2\u5b58\u5728|\u76d1\u63a7\u5df2\u6062\u590d/u);
  const { featureStore } = await import('../../lib/features/store.js');
  assert.equal((await featureStore(runtime, '05', event).list('items')).length, 1);
  assert.equal(runtime.scheduler.tasks.length, 1);
  const failing = runtimeWithState();
  failing.scheduler = { async list() { return []; }, async create() { throw new Error('scheduler unavailable'); } };
  await assert.rejects(() => dispatchFeature(manifest, event, ['\u6dfb\u52a0', 'https://example.org'], failing));
  assert.equal((await featureStore(failing, '05', event).list('items')).length, 0);
});

test('scheduler actions validate arguments and audit cancellation', async () => {
  const runtime = runtimeWithState();
  runtime.scheduler = { tasks: [], async list() { return this.tasks; }, async find(id) { return this.tasks.find((task) => task.id === id); }, async create(payload) { const task = { ...payload, id: 'task-1', status: 'scheduled', runAt: 1000 }; this.tasks.push(task); return task; }, async cancel(id) { const task = this.tasks.find((entry) => entry.id === id); if (!task || task.status !== 'scheduled') return false; task.status = 'cancelled'; return true; } };
  const manifest = featureManifests.find((item) => item.id === '06');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const created = await dispatchFeature(manifest, event, ['1m', '\u4e00\u5206\u949f\u540e\u63d0\u9192'], runtime);
  assert.match(created, /\u4efb\u52a1\u5df2\u521b\u5efa/u);
  const usage = await dispatchFeature(manifest, event, ['\u5217\u8868', 'extra'], runtime);
  assert.ok(usage.includes('\u5217\u8868'));
  const cancelled = await dispatchFeature(manifest, event, ['\u53d6\u6d88', 'task-1'], runtime);
  assert.match(cancelled, /\u4efb\u52a1\u5df2\u53d6\u6d88/u);
  assert.equal(runtime.scheduler.tasks[0].status, 'cancelled');
});

test('help groups capabilities and validates areas', async () => {
  const runtime = runtimeWithState();
  const manifest = featureManifests.find((item) => item.id === '07');
  const event = { botId: 'b', groupId: 'g', userId: 'u' };
  const all = await dispatchFeature(manifest, event, [], runtime);
  assert.ok(all.includes('\u57fa\u7840\u8fd0\u884c'));
  assert.ok(all.includes('#\u4e91\u9526\u72b6\u6001'));
  const core = await dispatchFeature(manifest, event, ['\u67e5\u770b', 'core'], runtime);
  assert.ok(core.includes('\u57fa\u7840\u8fd0\u884c'));
  assert.ok(!core.includes('\u793e\u533a\u4e92\u52a8'));
  const usage = await dispatchFeature(manifest, event, ['unknown'], runtime);
  assert.ok(usage.includes('core|governance|feeds|tools|media|community'));
});
test('config command boundaries protect scopes and report dependency failures', async () => {
  const manifest=featureManifests.find(item => item.id==='08')
  const runtime=runtimeWithState()
  runtime.config={
    schemas:new Set(['core.enabled']),
    describeEffective:async()=> 'effective',
    reload:async()=> undefined,
    validate:async()=> ({ok:true}),
    getEffectiveValue:async(scope,key)=> ({scope,key}),
    set:async(scope,key,value)=> ({scope,key,value})
  }
  const member={botId:'bot',groupId:'g1',userId:'u1',role:'member',isMaster:false}
  const op={...member,isMaster:true}
  assert.match(await dispatchFeature(manifest,member,['\u6821\u9a8c','extra'],runtime),/\u0023\u4e91\u9526\u914d\u7f6e/)
  assert.match(await dispatchFeature(manifest,member,['\u8bbe\u7f6e','\u5168\u5c40','core.enabled','true'],runtime),/\u53ea\u6709 Yunzai OP/)
  const opResult=await dispatchFeature(manifest,op,['\u8bbe\u7f6e','\u5168\u5c40','core.enabled','true'],runtime)
  assert.equal(opResult.scope.name,'global')
  assert.equal(opResult.key,'core.enabled')
  assert.equal(opResult.value,true)
  assert.match(await dispatchFeature(manifest,op,['\u8bbe\u7f6e','\u7fa4','core.enabled','{bad'],runtime),/JSON/)
  assert.match(await dispatchFeature(manifest,{...member,groupId:'private'},['\u83b7\u53d6','\u7fa4','core.enabled'],runtime),/\u7fa4\u4f5c\u7528\u57df\u53ea\u80fd/)
  assert.match(await dispatchFeature(manifest,op,['\u83b7\u53d6','\u5168\u5c40','core.enabled','extra'],runtime),/\u0023\u4e91\u9526\u914d\u7f6e/)
  const unavailable=runtimeWithState()
  assert.match(await dispatchFeature(manifest,member,[],unavailable),/\u914d\u7f6e\u670d\u52a1\u4e0d\u53ef\u7528/)
})

test('permission summary validates actions and audits effective scopes', async () => {
  const manifest=featureManifests.find(item => item.id==='09')
  const runtime=runtimeWithState()
  const member={botId:'bot',groupId:'g1',userId:'u1',role:'member',isMaster:false}
  const op={...member,isMaster:true}
  const memberResult=await dispatchFeature(manifest,member,['\u67e5\u770b'],runtime)
  assert.match(memberResult,/\u5f53\u524d\u6743\u9650/)
  assert.match(memberResult,/\u5168\u5c40\u914d\u7f6e/)
  assert.match(memberResult,/\u4ec5 Yunzai OP/)
  const opResult=await dispatchFeature(manifest,op,['view'],runtime)
  assert.match(opResult,/\u53ef\u4fee\u6539/)
  assert.match(await dispatchFeature(manifest,member,['\u67e5\u770b','extra'],runtime),/\u0023\u4e91\u9526\u6743\u9650/)
  assert.match(await dispatchFeature(manifest,member,['unknown'],runtime),/\u0023\u4e91\u9526\u6743\u9650/)
})
test('namelist actions validate type, identity and deletion audit boundaries', async () => {
  const manifest=featureManifests.find(item => item.id==='10')
  const runtime=runtimeWithState()
  const event={botId:'bot',groupId:'g1',userId:'u1',role:'admin',isMaster:false}
  assert.match(await dispatchFeature(manifest,event,['\u6dfb\u52a0','\u7fa4','g1'],runtime),/\u540d\u5355\u5df2\u6dfb\u52a0/)
  assert.match(await dispatchFeature(manifest,event,['\u5220\u9664','\u7528\u6237','g1'],runtime),/\u672a\u627e\u5230/)
  assert.match(await dispatchFeature(manifest,event,['\u5220\u9664','\u7fa4','g1'],runtime),/\u540d\u5355\u5df2\u5220\u9664/)
  assert.match(await dispatchFeature(manifest,event,['\u6dfb\u52a0','invalid','x'],runtime),/\u7c7b\u578b\u5fc5\u987b/)
  assert.match(await dispatchFeature(manifest,event,['\u5217\u8868','extra'],runtime),/\u0023\u4e91\u9526\u540d\u5355/)
  assert.match(await dispatchFeature(manifest,event,['unknown'],runtime),/\u0023\u4e91\u9526\u540d\u5355/)
})
test('group settings enforce chat and argument boundaries', async () => {
  const manifest=featureManifests.find(item => item.id==='11')
  const runtime=runtimeWithState()
  const event={botId:'bot',groupId:'g1',userId:'u1',role:'admin',isMaster:false}
  assert.match(await dispatchFeature(manifest,event,['\u8bbe\u7f6e','welcome','on'],runtime),/\u7fa4\u8bbe\u7f6e\u5df2\u66f4\u65b0/)
  assert.match(await dispatchFeature(manifest,event,['\u8bbe\u7f6e','welcome','on','extra'],runtime),/\u0023\u4e91\u9526\u7fa4\u7ba1/)
  assert.match(await dispatchFeature(manifest,event,['unknown'],runtime),/\u0023\u4e91\u9526\u7fa4\u7ba1/)
  assert.match(await dispatchFeature(manifest,{...event,groupId:'private'},[],runtime),/\u53ea\u80fd\u5728\u7fa4\u804a/)
})
test('event monitor enforces group and clear action boundaries', async () => {
  const manifest=featureManifests.find(item => item.id==='12')
  const runtime=runtimeWithState()
  const event={botId:'bot',groupId:'g1',userId:'u1',role:'admin',isMaster:false}
  assert.match(await dispatchFeature(manifest,event,['\u6e05\u7406'],runtime),/\u6ca1\u6709\u53ef\u6e05\u7406/)
  assert.match(await dispatchFeature(manifest,event,['\u6e05\u7406','extra'],runtime),/\u0023\u4e91\u9526\u4e8b\u4ef6/)
  assert.match(await dispatchFeature(manifest,event,['unknown'],runtime),/\u0023\u4e91\u9526\u4e8b\u4ef6/)
  assert.match(await dispatchFeature(manifest,{...event,groupId:'private'},[],runtime),/\u53ea\u80fd\u5728\u7fa4\u804a/)
})
test('auto-enter group list validates group ids and actions', async () => {
  const manifest=featureManifests.find(item => item.id==='13')
  const runtime=runtimeWithState()
  const event={botId:'bot',groupId:'g1',userId:'u1',role:'master',isMaster:true}
  assert.match(await dispatchFeature(manifest,event,['\u6dfb\u52a0','12345'],runtime),/\u81ea\u52a8\u5165\u7fa4\u540d\u5355\u5df2\u6dfb\u52a0/)
  assert.match(await dispatchFeature(manifest,event,['\u5220\u9664','12345'],runtime),/\u81ea\u52a8\u5165\u7fa4\u540d\u5355\u5df2\u5220\u9664/)
  assert.match(await dispatchFeature(manifest,event,['\u6dfb\u52a0','abc!'],runtime),/\u7fa4\u53f7\u5fc5\u987b/)
  assert.match(await dispatchFeature(manifest,event,['\u5217\u8868','extra'],runtime),/\u0023\u4e91\u9526\u5165\u7fa4/)
  assert.match(await dispatchFeature(manifest,event,['unknown'],runtime),/\u0023\u4e91\u9526\u5165\u7fa4/)
})