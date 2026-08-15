import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationBus } from '../../lib/notification/bus.js';

test('消息发送兼容 sendMessage 并在选择器异常时降级', async () => {
  const calls = [];
  const bus = new NotificationBus();
  const result = await bus.sendToTarget({ pickGroup: () => { throw new Error('group unavailable'); }, sendMessage: (target, message) => { calls.push([target, message]); return 'sent'; } }, { groupId: 'g1' }, 'hello');
  assert.equal(result, 'sent');
  assert.deepEqual(calls, [['g1', 'hello']]);
  bus.close();
});

test('事件回复失败时回退原始事件', async () => {
  const bus = new NotificationBus();
  const calls = [];
  const result = await bus.sendToEvent({ reply: () => { throw new Error('unsupported'); }, raw: { reply: (message) => { calls.push(message); return 'raw-sent'; } } }, 'fallback');
  assert.equal(result, 'raw-sent');
  assert.deepEqual(calls, ['fallback']);
  bus.close();
});
