import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBuffer, fetchText } from '../../lib/http/client.js';

function mockResponse(body, contentType = 'text/plain') {
  return {
    status: 200,
    ok: true,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body,
    arrayBuffer: async () => Buffer.from(body)
  };
}

async function withFetch(handler, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await callback(); } finally { globalThis.fetch = original; }
}

test('无效超时和缓存时间会回退到有限值', async () => {
  await withFetch(async () => mockResponse('正常'), async () => {
    assert.equal(await fetchText('https://example.com/data', { cache: false, timeoutMs: Number.NaN, cacheTtlMs: Number.POSITIVE_INFINITY }), '正常');
  });
});

test('超大响应不会被无穷 maxBytes 绕过', async () => {
  const body = 'x'.repeat(8 * 1024 * 1024 + 1);
  await withFetch(async () => mockResponse(body), async () => {
    await assert.rejects(() => fetchText('https://example.com/large', { cache: false, attempts: 1, maxBytes: Number.POSITIVE_INFINITY }), (error) => error?.code === 'YUNJIN_NETWORK_RESPONSE');
    await assert.rejects(() => fetchBuffer('https://example.com/large.bin', { attempts: 1, maxBytes: Number.POSITIVE_INFINITY }), (error) => error?.code === 'YUNJIN_NETWORK_RESPONSE');
  });
});

test('已取消的外部信号会立即中断请求', async () => {
  const controller = new AbortController();
  controller.abort(new Error('用户取消'));
  await withFetch(async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    throw new DOMException('Aborted', 'AbortError');
  }, async () => {
    await assert.rejects(() => fetchText('https://example.com/cancelled', { cache: false, attempts: 1, signal: controller.signal }), (error) => error?.code === 'YUNJIN_NETWORK_TIMEOUT');
  });
});
