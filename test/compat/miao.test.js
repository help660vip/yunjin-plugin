import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.plugin = class MockMiaoPlugin {
  constructor(metadata) { Object.assign(this, metadata); }
  async reply(message) { this.lastReply = message; return message; }
};

const { ConfigPlugin } = await import('../../index.js');

test('Miao-shaped host can instantiate config plugin without constructor side effects', () => {
  const instance = new ConfigPlugin();
  assert.equal(instance.event, 'message');
  assert.match(instance.rule[0].reg, /#\u4e91\u9526/u);
});
