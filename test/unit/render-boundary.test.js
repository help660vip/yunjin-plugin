import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCard, renderText } from '../../lib/renderer/service.js';
import { normalizeViewModel } from '../../lib/renderer/sanitizer.js';

test('\u6e32\u67d3\u5668\u4f1a\u62d2\u7edd\u7a7a\u5bf9\u8c61\u5e76\u4fdd\u7559\u6709\u6548\u6d88\u606f', async () => {
  const fallback = '????';
  assert.equal(await renderCard({ runtime: { render: async () => ({}) } }, { data: { title: '??' }, fallbackText: fallback }), fallback);
  assert.equal(await renderCard({ runtime: { render: async () => [{}] } }, { data: { title: '??' }, fallbackText: fallback }), fallback);
  const image = { type: 'image', url: 'https://example.com/a.png' };
  assert.equal(await renderCard({ runtime: { render: async () => image } }, { data: { title: '??' }, fallbackText: fallback }), image);
});

test('\u6e32\u67d3\u6a21\u578b\u4e0d\u628a\u5f02\u5e38\u5bf9\u8c61\u62fc\u5165\u6587\u672c', () => {
  const model = normalizeViewModel({ feature: {}, title: {}, rows: [{ label: {}, value: { bad: true } }] }, { maxRows: 0 });
  assert.equal(model.feature, 'YunJin');
  assert.equal(model.title, 'YunJin');
  assert.equal(model.rows.length, 0);
  assert.equal(renderText([{ value: '??' }, { bad: true }]), '??');
});

test('\u6e32\u67d3\u884c\u6570\u4f7f\u7528\u6709\u754c\u6574\u6570', () => {
  const model = normalizeViewModel({ rows: [{ label: '?', value: '1' }, { label: '?', value: '2' }] }, { maxRows: 1.9 });
  assert.equal(model.rows.length, 1);
  assert.equal(normalizeViewModel({ rows: [{ label: '?', value: '1' }] }, { maxRows: Infinity }).rows.length, 1);
});
