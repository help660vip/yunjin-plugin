import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.plugin = class MockTrssPlugin {
  constructor(metadata) { Object.assign(this, metadata); }
  async reply(message) { this.lastReply = message; return message; }
};

const { default: apps } = await import('../../index.js');

test('TRSS-shaped host can instantiate exported app', async () => {
  const App = apps[0];
  const instance = new App();
  assert.equal(instance.event, 'message');
  assert.equal(typeof instance.rule[0].fnc, 'string');
});
