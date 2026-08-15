import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent } from '../../lib/runtime/event.js';

test('event normalization handles message segments and runtime bot', () => {
  const bot = { id: 'bot' };
  const event = normalizeEvent({ message: [{ type: 'text', text: '#\u4e91\u9526\u5e2e\u52a9' }], bot, user_id: 1, group_id: 2 });
  assert.equal(event.message, '#\u4e91\u9526\u5e2e\u52a9');
  assert.equal(event.bot, bot);
  assert.equal(event.userId, '1');
  assert.equal(event.groupId, '2');
});


test('事件主人标记兼容并保留角色', () => {
  const stringOwner = normalizeEvent({ msg: '云锦', isMaster: 'true', sender: { role: 'admin', user_id: 'u1' } });
  const snakeOwner = normalizeEvent({ msg: '云锦', is_master: 1, sender: { role: 'owner', user_id: 'u2' } });
  const falseOwner = normalizeEvent({ msg: '云锦', isMaster: 'false', sender: { role: 'member', user_id: 'u3' } });
  assert.equal(stringOwner.isMaster, true);
  assert.equal(stringOwner.role, 'admin');
  assert.equal(snakeOwner.isMaster, true);
  assert.equal(falseOwner.isMaster, false);
});
