import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessage, createMessageFactory, safeBotCall } from '../../lib/message/adapter.js';
import { replySegments, replyText } from '../../lib/runtime/reply.js';
import { NotificationBus } from '../../lib/notification/bus.js';

test('\u6d88\u606f\u6bb5\u4f1a\u9650\u5236\u6570\u91cf\u5e76\u5ffd\u7565\u7a7a\u7684\u8eab\u4efd\u6bb5', () => {
  const result = normalizeMessage([{ type: 'at' }, { type: 'text', text: '  \u4f60\u597d  ' }, { type: 'image', url: {} }], { maxSegments: 1.8 });
  assert.deepEqual(result.segments, [{ type: 'text', text: '\u4f60\u597d' }]);
  assert.equal(normalizeMessage([{ type: 'text', text: 'a' }], { maxSegments: Infinity }).segments.length, 1);
});

test('\u6d88\u606f\u5de5\u5382\u4e0d\u4f1a\u628a\u5f02\u5e38\u5bf9\u8c61\u62fc\u6210\u6587\u672c', () => {
  const factory = createMessageFactory();
  assert.equal(factory.text({ value: 'bad' }), '');
  assert.equal(factory.image({ url: {} }), '');
  assert.equal(factory.at({ id: 'u1' }), '');
});

test('\u5b89\u5168\u8c03\u7528\u4f1a\u6355\u83b7\u5f02\u6b65\u53d1\u9001\u5f02\u5e38', async () => {
  const value = await safeBotCall({ send: async () => { throw new Error('failed'); } }, 'send', [], 'fallback');
  assert.equal(value, 'fallback');
  assert.equal(await safeBotCall({}, 'missing', [], 'missing'), 'missing');
});

test('\u4e8b\u4ef6\u56de\u590d\u6309\u987a\u5e8f\u964d\u7ea7', async () => {
  const calls = [];
  const result = await replyText({ reply: () => { throw new Error('unsupported'); }, raw: { reply: (value) => { calls.push(value); return 'raw'; } } }, ' hello ');
  assert.equal(result, 'raw');
  assert.deepEqual(calls, ['hello']);
  assert.equal(await replyText({ reply: () => { throw new Error('unsupported'); } }, 'text', () => 'fallback'), 'fallback');
});

test('\u56de\u590d\u6bb5\u7ed3\u6784\u5f02\u5e38\u65f6\u4e0d\u629b\u9519', async () => {
  const calls = [];
  const result = await replySegments({ reply: (value) => { calls.push(value); return 'ok'; } }, [{ type: 'text', text: '\u4f60\u597d' }, { type: 'at', id: 'u1' }, { type: 'unknown', data: {} }]);
  assert.equal(result, 'ok');
  assert.equal(calls.length, 1);
  assert.match(String(calls[0]), /\u4f60\u597d/u);
  assert.doesNotThrow(() => replySegments({}, null));
});

test('\u901a\u77e5\u53d1\u9001\u62d2\u7edd\u7a7a\u6d88\u606f\u5e76\u9650\u5236\u76ee\u6807', async () => {
  const bus = new NotificationBus();
  assert.deepEqual(await bus.sendToTarget({ sendMsg: () => 'sent' }, { groupId: {} }, '   '), { ok: false, reason: '\u6d88\u606f\u5185\u5bb9\u4e3a\u7a7a' });
  assert.deepEqual(await bus.sendToTarget({ sendMsg: () => 'sent' }, { groupId: {} }, 'hello'), { ok: false, reason: '\u6d88\u606f\u76ee\u6807\u65e0\u6548' });
  bus.close();
});
