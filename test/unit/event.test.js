import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent } from '../../lib/runtime/event.js';

test('event normalization handles group and private event variants', () => {
  const group = normalizeEvent({ raw_message: 'hello', user_id: 1, group_id: 2, sender: { role: 'admin' } });
  assert.equal(group.userId, '1');
  assert.equal(group.groupId, '2');
  assert.equal(group.role, 'admin');
  assert.equal(group.isPrivate, false);
  const privateEvent = normalizeEvent({ msg: 'hi', userId: 3 });
  assert.equal(privateEvent.userId, '3');
  assert.equal(privateEvent.isPrivate, true);
});
