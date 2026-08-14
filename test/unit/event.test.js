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
