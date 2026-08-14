import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.plugin = class MockMiaoPlugin {
  constructor(metadata) { Object.assign(this, metadata); }
  async reply(message) { this.lastReply = message; return message; }
};

const { ConfigPlugin } = await import('../../index.js');

test('Miao-shaped host can instantiate config plugin without constructor side effects', () => {
  const instance = new ConfigPlugin();
  assert.equal(instance.name, 'YunJin配置中心');
  assert.equal(instance.rule.length, 1);
});
