import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ConfigService } from '../../lib/config/service.js';
import { JsonRepository } from '../../lib/storage/json-repository.js';
import { makeTempDir } from '../helpers.js';

test('\u914d\u7f6e\u4f5c\u7528\u57df ID \u4f1a\u53bb\u9664\u7a7a\u767d\u5e76\u62d2\u7edd\u5f02\u5e38\u5bf9\u8c61', async () => {
  const dir = await makeTempDir();
  const service = new ConfigService({ repository: new JsonRepository(path.join(dir, 'config.json')) });
  await service.initialize();
  assert.equal((await service.set({ name: 'group', id: ' g1 ' }, 'core.enabled', false)).ok, true);
  assert.equal(service.getEffective({ groupId: 'g1' })['core.enabled'], false);
  assert.equal((await service.set({ name: 'group', id: {} }, 'core.enabled', true)).error, 'invalid_scope');
  assert.equal((await service.set({ name: 'group', id: 'g\u00001' }, 'core.enabled', true)).error, 'invalid_scope');
});

test('\u6301\u4e45\u5316\u914d\u7f6e\u4f1a\u5ffd\u7565\u65e0\u6548\u4f5c\u7528\u57df\u952e', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'config.json');
  const repository = new JsonRepository(file);
  await repository.write({ version: 1, global: {}, groups: { ' g1 ': { 'core.enabled': false }, '\u0000bad': { 'core.enabled': false } }, users: { good: { 'core.enabled': true } } });
  const service = new ConfigService({ repository });
  await service.initialize();
  assert.equal(service.getEffective({ groupId: 'g1' })['core.enabled'], true);
  assert.equal(service.getEffective({ userId: 'good' })['core.enabled'], true);
  assert.equal(Object.hasOwn(service.state.groups, ' g1 '), false);
});

test('\u5f02\u5e38\u81ea\u5b9a\u4e49\u679a\u4e3e\u914d\u7f6e\u4e0d\u4f1a\u629b\u51fa', async () => {
  const dir = await makeTempDir();
  const service = new ConfigService({ repository: new JsonRepository(path.join(dir, 'config.json')) });
  service.registerSchema('22', { 'custom.mode': { type: 'enum', values: null, default: 'safe' } });
  await service.initialize();
  const result = await service.set({ name: 'global' }, 'custom.mode', 'safe');
  assert.deepEqual(result, { ok: false, error: 'invalid_enum', key: 'custom.mode' });
});
