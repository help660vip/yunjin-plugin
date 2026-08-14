import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigPlugin, shutdownRuntime } from '../index.js';
import { makeEvent, makeTempDir } from './helpers.js';
import { getRuntime } from '../lib/bootstrap.js';

test('config command performs a complete read path', async () => {
  const dataRoot = await makeTempDir('yunjin-smoke-');
  const runtime = getRuntime({ dataRoot });
  await runtime.start();
  const instance = new ConfigPlugin();
  const replies = [];
  instance.e = { ...makeEvent(), reply: async (message) => replies.push(message) };
  await instance.configCommand();
  assert.equal(replies.length, 1);
  assert.match(replies[0], /core.enabled/u);
  const auditPath = (await import('node:path')).join(dataRoot, 'audit.jsonl');
  assert.match(await (await import('node:fs/promises')).readFile(auditPath, 'utf8'), /config/u);
  await shutdownRuntime();
});
