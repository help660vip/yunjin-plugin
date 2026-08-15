import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, limitArray, parseBoolean, parseNumber, redactSecrets, safeExtension, safeFilename, safeJson, stripControl } from '../../lib/core/safe.js';

const chars = (...codes) => String.fromCodePoint(...codes);

test(chars(23433, 20840, 25991, 26412, 19981, 38543, 24847, 36716, 25442), () => {
  assert.equal(cleanText({ bad: true }), '');
  assert.equal(stripControl('abcdef', { max: Number.POSITIVE_INFINITY }), 'abcdef');
  assert.equal(stripControl('abcdef', { max: -1 }), '');
  assert.equal(safeFilename({ bad: true }, 'fallback.txt'), 'fallback.txt');
  assert.equal(safeExtension({ bad: true }), '');
});

test(chars(33073, 25935, 32467, 26500, 19981, 27745, 26579), () => {
  const input = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"polluted":true},"token":"secret","nested":{"value":"ok"}}');
  const result = redactSecrets(input);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), false);
  assert.equal(result.token, '[redacted]');
  assert.equal(safeJson(input).includes('secret'), false);
});

test(chars(21442, 25968, 21644, 25968, 20540, 36793, 30028), () => {
  assert.equal(parseBoolean('unknown', true), true);
  assert.equal(parseBoolean('off', true), false);
  assert.equal(parseNumber('bad', { fallback: 3, min: 1, max: 5 }), 3);
  assert.equal(parseNumber(99, { fallback: 3, min: 5, max: 1 }), 5);
  assert.equal(limitArray(Array.from({ length: 101 }, (_, index) => index), Number.NaN).length, 100);
  assert.equal(limitArray([1, 2], -1).length, 0);
});
