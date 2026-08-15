import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, parseDuration, parseJsonValue, parseNamespace, parsePage, tokenize } from '../../lib/parser/command.js';

test('\u547d\u4ee4\u89e3\u6790\u4f7f\u7528\u4e91\u9526\u524d\u7f00\u5e76\u9650\u5236\u53c2\u6570', () => {
  assert.deepEqual(parseNamespace('#\u4e91\u9526\u914d\u7f6e --scope=\u7fa4 --dry-run'), { matched: true, prefix: '#\u4e91\u9526', command: '\u914d\u7f6e', args: [], flags: { scope: '\u7fa4', 'dry-run': true }, rawTokens: ['--scope=\u7fa4', '--dry-run'] });
  assert.equal(tokenize('x'.repeat(4001), { maxLength: Number.POSITIVE_INFINITY })[0].length, 4000);
  assert.throws(() => parseNamespace(['#\u4e91\u9526', 'x'.repeat(1001)]), /./u);
});

test('\u65e0\u6548\u65d7\u6807\u548c JSON \u8d85\u957f\u8f93\u5165\u4e0d\u4f1a\u653e\u884c', () => {
  assert.throws(() => parseNamespace('#\u4e91\u9526\u72b6\u6001 --=bad'), /./u);
  assert.deepEqual(parseNamespace('#\u4e91\u9526\u72b6\u6001 --'), { matched: true, prefix: '#\u4e91\u9526', command: '\u72b6\u6001', args: [], flags: {}, rawTokens: ['--'] });
  assert.throws(() => parseJsonValue('x'.repeat(20001), null), /./u);
  assert.equal(parseDuration('1m', { maxMs: Number.NaN }), 60000);
});

test('\u5206\u9875\u548c\u65f6\u957f\u53c2\u6570\u5f3a\u5236\u4f7f\u7528\u6709\u9650\u6574\u6570', () => {
  assert.deepEqual(parsePage('2.9', { max: Number.POSITIVE_INFINITY, size: 2.9 }), { page: 2, size: 2, offset: 2 });
  assert.deepEqual(paginate([1, 2, 3], 2.9, 2.9), { page: 2, size: 2, total: 3, totalPages: 2, items: [3] });
});
