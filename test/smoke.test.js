import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigPlugin, shutdownRuntime } from '../index.js';
import { makeEvent, makeTempDir } from './helpers.js';
import { getRuntime } from '../lib/bootstrap.js';

test('config command uses the unified #yun jin command handler', async () => {
  const dataRoot = await makeTempDir('yunjin-smoke-');
  getRuntime({ dataRoot });
  const instance = new ConfigPlugin();
  const replies = [];
  instance.e = { ...makeEvent(), isMaster: true, reply: async (message) => { replies.push(message); return message; } };
  await instance.handle();
  assert.equal(replies.length, 1);
  assert.match(String(replies[0]), /core\.enabled/u);
  await shutdownRuntime();
});
