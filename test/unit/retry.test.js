import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../../lib/http/retry.js';

test('小数重试次数向下取整并不超过配置', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw new TypeError('测试错误');
  }, { attempts: 2.9, shouldRetry: () => true, baseMs: 0 }), /测试错误/);
  assert.equal(calls, 2);
});

test('无穷和负数重试配置安全退化为一次', async () => {
  for (const attempts of [Number.POSITIVE_INFINITY, Number.NaN, -3]) {
    let calls = 0;
    await assert.rejects(() => withRetry(async () => {
      calls += 1;
      throw new TypeError('测试错误');
    }, { attempts, shouldRetry: () => true }), /测试错误/);
    assert.equal(calls, 1);
  }
});

test('延迟异常时仍保持有限数值', async () => {
  let calls = 0;
  const sleeps = [];
  const clock = { sleep: async (ms) => sleeps.push(ms) };
  const result = await withRetry(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('可重试错误');
    return '成功';
  }, { attempts: 2, baseMs: Number.NaN, maxMs: Number.POSITIVE_INFINITY, clock });
  assert.equal(result, '成功');
  assert.equal(calls, 2);
  assert.equal(sleeps.length, 1);
  assert.equal(Number.isFinite(sleeps[0]), true);
  assert.equal(sleeps[0] >= 0 && sleeps[0] <= 2000, true);
});
