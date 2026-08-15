import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, YunjinError, errorBoundary, normalizeError, networkTimeout, publicErrorMessage } from '../../lib/core/errors.js';

test('\u9519\u8bef\u6d88\u606f\u548c\u72b6\u6001\u7801\u4f7f\u7528\u5b89\u5168\u8fb9\u754c', () => {
  const error = new YunjinError({ bad: true }, { bad: true }, { status: 999, details: { token: 'secret', nested: { value: 'x'.repeat(600) } } });
  const json = error.toJSON();
  assert.equal(error.code, 'YUNJIN_INTERNAL');
  assert.equal(error.status, 500);
  assert.equal(json.message, 'YUNJIN_INTERNAL');
  assert.equal(json.details.token, '[\u5df2\u9690\u85cf]');
  assert.ok(json.details.nested.value.length <= 500);
});

test('\u5f02\u5e38\u5bf9\u8c61\u4e0d\u4f1a\u53d8\u6210\u5bf9\u8c61\u5b57\u7b26\u4e32', () => {
  const normalized = normalizeError({ message: { bad: true } });
  assert.equal(normalized.code, ERROR_CODES.INTERNAL);
  assert.equal(publicErrorMessage('\u539f\u59cb\u9519\u8bef'), String.fromCodePoint(25805, 20316, 22833, 36133));
  assert.equal(publicErrorMessage(normalized, String.fromCodePoint(25805, 20316, 22833, 36133)), String.fromCodePoint(25805, 20316, 22833, 36133));
});

test('\u9519\u8bef\u56de\u8c03\u629b\u9519\u4e0d\u4f1a\u6253\u65ad\u4e3b\u6d41\u7a0b', async () => {
  const result = await errorBoundary(async () => { throw new Error('failure'); }, { onError: async () => { throw new Error('callback failure'); } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ERROR_CODES.INTERNAL);
});

test('\u7f51\u7edc\u8d85\u65f6\u8be6\u60c5\u5b89\u5168\u9650\u5236', () => {
  const error = networkTimeout({ url: 'bad' }, { password: 'secret', extra: 'ok' });
  assert.equal(error.code, ERROR_CODES.NETWORK_TIMEOUT);
  assert.equal(publicErrorMessage(error), String.fromCodePoint(32593, 32476, 35831, 27714, 36229, 26102, 65292, 35831, 31245, 21518, 20877, 35797));
  assert.equal(error.toJSON().details.password, '[\u5df2\u9690\u85cf]');
});
