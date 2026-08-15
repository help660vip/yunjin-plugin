import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCard } from '../../lib/renderer/service.js';

const model = { feature: 'test', title: '测试', rows: [{ label: '状态', value: '正常' }] };

test('渲染器空结果会回退文本', async () => {
  const event = { runtime: { render: async () => '   ' } };
  assert.equal(await renderCard(event, { data: model, fallbackText: '文本回退' }), '文本回退');
  const empty = { runtime: { render: async () => [] } };
  assert.equal(await renderCard(empty, { data: model, fallbackText: '空回退' }), '空回退');
});

test('渲染器和错误回调抛错时仍保留文本降级', async () => {
  const event = { runtime: { render: async () => { throw new Error('render failed'); } } };
  const result = await renderCard(event, { data: model, fallbackText: '错误回退', onError: async () => { throw new Error('callback failed'); } });
  assert.equal(result, '错误回退');
});

test('渲染器返回有效消息对象时不被误判为空值', async () => {
  const image = { type: 'image', url: 'https://example.com/card.png' };
  const event = { runtime: { render: async () => image } };
  assert.equal(await renderCard(event, { data: model, fallbackText: '回退' }), image);
});
