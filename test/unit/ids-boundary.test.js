import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeId, normalizeBotId, normalizeGroupId, normalizeUserId, redactId, scopeKey, stableId } from '../../lib/core/ids.js';

const chars = (...codes) => String.fromCodePoint(...codes);

test(chars(36523, 20221, 26631, 35782, 20445, 25345, 23433, 20840), () => {
  assert.equal(normalizeId({ bad: true }, 'fallback'), 'fallback');
  assert.equal(normalizeId(Number.NaN, 'fallback'), 'fallback');
  assert.equal(normalizeId(Number.POSITIVE_INFINITY, 'fallback'), 'fallback');
  assert.equal(normalizeId('  user  '), 'user');
  assert.equal(normalizeId('x'.repeat(300)).length, 160);
  assert.equal(normalizeId({ bad: true }, { bad: true }), 'unknown');
});

test(chars(20316, 29992, 22495, 22478, 21644, 31283, 30028, 26377, 30028, 36793, 30028), () => {
  const event = { botId: { bad: true }, groupId: Number.NaN, userId: { bad: true } };
  assert.equal(normalizeBotId(event), 'default');
  assert.equal(normalizeGroupId(event), 'private');
  assert.equal(normalizeUserId(event), 'unknown');
  assert.equal(scopeKey(event, { level: 'invalid' }), 'bot:default:user:unknown');
  assert.equal(scopeKey(event, null), 'bot:default:user:unknown');
});

test(chars(31283, 23450) + ' ID' + chars(21644, 33073, 25935, 23433, 20840), () => {
  assert.equal(stableId([{ bad: true }], Number.NaN).length, 24);
  assert.equal(stableId('value', Number.POSITIVE_INFINITY).length, 24);
  assert.equal(stableId('value', 3).length, 8);
  assert.equal(stableId('value', 999).length, 64);
  assert.equal(redactId({ bad: true }), '****');
  assert.equal(redactId('123456'), '12***56');
});
