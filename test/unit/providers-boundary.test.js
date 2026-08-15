import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderContext, ProviderRegistry } from '../../lib/adapters/providers.js';

const invalidNameMessage = '\u63d0\u4f9b\u65b9\u540d\u79f0\u65e0\u6548';
const callableMessage = '\u63d0\u4f9b\u65b9\u5fc5\u987b\u53ef\u8c03\u7528';
const unavailableMessage = '\u63d0\u4f9b\u65b9\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';

test('\u63d0\u4f9b\u65b9\u6807\u8bc6\u548c\u542f\u7528\u6807\u8bb0\u4f7f\u7528\u4e25\u683c\u89c4\u5219', () => {
  const registry = new ProviderRegistry();
  registry.register(' Z.Provider ', () => 'ok', { enabled: 'false', metadata: { protocol: 'https', secret: { value: 'bad' } } });
  registry.register('a-provider', () => 'ok', { metadata: { cache: true } });
  assert.equal(registry.has('z.provider'), false);
  assert.deepEqual(registry.names(), ['a-provider']);
  assert.throws(() => registry.register({}, () => 'bad'), (error) => error instanceof TypeError && error.message === invalidNameMessage);
  assert.throws(() => registry.register('bad', {}), (error) => error instanceof TypeError && error.message === callableMessage);
  assert.equal(registry.describe().find((item) => item.name === 'z.provider').metadata.secret, undefined);
});

test('\u63d0\u4f9b\u65b9\u67e5\u8be2\u5f02\u5e38\u4f7f\u7528\u4e2d\u6587\u56de\u9000', async () => {
  const registry = new ProviderRegistry();
  registry.register('failing', async () => { throw new Error('private detail'); });
  const result = await registry.query('FAILING', {}, {});
  assert.deepEqual(result, { ok: false, error: unavailableMessage, provider: 'failing' });
  assert.equal((await registry.query({}, {}, {})).provider, 'unknown');
});

test('\u63d0\u4f9b\u65b9\u5b89\u5168\u8c03\u7528\u4f1a\u4fdd\u7559\u56de\u9000\u503c', async () => {
  const context = new ProviderContext({ featureId: {} });
  const fallback = await context.safe(null, { operation: null, source: 'local', fallback: '\u5907\u7528' });
  assert.deepEqual(fallback, { ok: true, value: '\u5907\u7528', source: 'fallback', cached: true, error: unavailableMessage });
  const failed = await context.safe(null, { operation: async () => { throw new Error('failed'); } });
  assert.equal(failed.ok, false);
  assert.equal(failed.source, 'provider');
});
