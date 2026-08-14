import test from 'node:test';
import assert from 'node:assert/strict';
import { renderConfigHelp, renderConfigResult } from '../../lib/renderer/text.js';

test('renderer provides readable text fallback', () => {
  assert.match(renderConfigHelp(), /#云锦 配置 查看/u);
  assert.match(renderConfigResult({ ok: true, key: 'core.reply_mode', value: 'text' }), /core.reply_mode: text/u);
  assert.match(renderConfigResult({ ok: true, values: { 'core.hot_reload': true } }), /core.hot_reload: true/u);
});
