import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_CODES,
  confirmationRequired,
  dependencyMissing,
  featureDisabled,
  normalizeError,
  notAuthorized,
  publicErrorMessage,
  quotaExceeded,
  rateLimited,
  renderFailed,
  networkResponse,
  networkTimeout
} from '../../lib/core/errors.js';

const chars = (...codes) => String.fromCodePoint(...codes);
const operationFailed = chars(25805, 20316, 22833, 36133);
const permissionDenied = chars(26435, 38480, 19981, 36275);
const networkTimeoutPublic = chars(32593, 32476, 35831, 27714, 36229, 26102, 65292, 35831, 31245, 21518, 20877, 35797);

function assertChineseMessage(value) {
  assert.equal(typeof value, 'string');
  assert.ok(value.trim());
  assert.equal(value.includes('?'), false);
}

test('???????????????', () => {
  const values = [
    notAuthorized().message,
    featureDisabled('demo').message,
    rateLimited(1000).message,
    quotaExceeded().message,
    dependencyMissing('demo').message,
    networkTimeout('https://example.com').message,
    networkResponse().message,
    renderFailed().message,
    confirmationRequired('token').message
  ];
  values.forEach(assertChineseMessage);
  assert.equal(notAuthorized().message, permissionDenied);
  assert.equal(networkTimeout('https://example.com').code, ERROR_CODES.NETWORK_TIMEOUT);
});

test('???????????????', () => {
  const normalized = normalizeError(new Error('token=secret'));
  assert.equal(normalized.toJSON().message, operationFailed);
  assert.equal(publicErrorMessage(normalized), operationFailed);
  assert.equal(publicErrorMessage(networkTimeout('https://example.com')), networkTimeoutPublic);
  assertChineseMessage(publicErrorMessage(networkResponse('upstream')));
});
