import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent } from '../../lib/runtime/event.js';
import { canUseFeature } from '../../lib/auth/policy.js';

test('\u4e8b\u4ef6 OP \u6807\u8bb0\u4e0e\u7edf\u4e00\u6743\u9650\u5c42\u4fdd\u6301\u4e00\u81f4', () => {
  const event = normalizeEvent({ is_master: '1', sender: { role: '  Admin  ', user_id: 100 } });
  assert.equal(event.isMaster, true);
  assert.equal(event.role, 'Admin');
  assert.equal(canUseFeature(event, { access: 'master' }), true);
});

test('\u7f3a\u5931\u7528\u6237\u8eab\u4efd\u4e0d\u4f1a\u88ab\u4f2a\u7528\u6237\u5b57\u7b26\u4e32\u653e\u884c', () => {
  const event = normalizeEvent({ msg: '#\u4e91\u9526\u5e2e\u52a9' });
  assert.equal(event.userId, '');
  assert.equal(canUseFeature(event, { access: 'user' }), false);
  assert.equal(canUseFeature(event, { access: 'master' }), false);
});

test('\u4e8b\u4ef6\u5f02\u5e38\u8f93\u5165\u4f1a\u56de\u9000\u5230\u7a7a\u5b89\u5168\u503c', () => {
  const empty = normalizeEvent(null);
  const objectIds = normalizeEvent({ user_id: {}, group_id: [], self_id: {}, sender: 'bad' });
  assert.equal(empty.message, '');
  assert.equal(empty.userId, '');
  assert.equal(empty.groupId, '');
  assert.equal(objectIds.userId, '');
  assert.equal(objectIds.groupId, '');
  assert.equal(objectIds.selfId, '');
  assert.equal(objectIds.role, 'member');
});

test('\u4e8b\u4ef6\u5b57\u6bb5\u9650\u5236\u957f\u5ea6\u5e76\u6e05\u7406\u63a7\u5236\u5b57\u7b26', () => {
  const event = normalizeEvent({ user_id: ' u1 ', group_id: 'g\u00001', comment: '  hello  ' });
  assert.equal(event.userId, 'u1');
  assert.equal(event.groupId, '');
  assert.equal(event.comment, 'hello');
  assert.equal(normalizeEvent({ user_id: 'x'.repeat(201) }).userId, '');
});
