import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from '../../lib/config/service.js';
import { JsonRepository } from '../../lib/storage/json-repository.js';
import { makeTempDir } from '../helpers.js';

test('config service applies default, global, group and user precedence', async () => {
  const dir = await makeTempDir();
  const service = new ConfigService({ repository: new JsonRepository(path.join(dir, 'config.json')) });
  await service.initialize();
  await service.set({ name: 'global' }, 'core.reply_mode', 'text');
  await service.set({ name: 'group', id: 'g1' }, 'core.reply_mode', 'auto');
  await service.set({ name: 'user', id: 'u1' }, 'core.hot_reload', false);
  assert.equal(service.getEffective({ groupId: 'g1', userId: 'u1' })['core.reply_mode'], 'auto');
  assert.equal(service.getEffective({ groupId: 'g1', userId: 'u1' })['core.hot_reload'], false);
  assert.equal(service.getEffective({ groupId: 'g2', userId: 'u2' })['core.reply_mode'], 'text');
});

test('config service rejects unknown, invalid and dangerous keys', async () => {
  const dir = await makeTempDir();
  const service = new ConfigService({ repository: new JsonRepository(path.join(dir, 'config.json')) });
  await service.initialize();
  assert.equal((await service.set({ name: 'global' }, 'unknown.key', true)).ok, false);
  assert.equal((await service.set({ name: 'global' }, 'core.hot_reload', 'yes')).ok, false);
  assert.equal((await service.set({ name: 'global' }, '__proto__.polluted', true)).ok, false);
});

test('config writes are atomic JSON and reloadable', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'config.json');
  const service = new ConfigService({ repository: new JsonRepository(file) });
  await service.initialize();
  await service.set({ name: 'global' }, 'core.audit_retention_days', 90);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).global['core.audit_retention_days'], 90);
  await fs.writeFile(file, JSON.stringify({ version: 1, global: { 'core.reply_mode': 'text' } }));
  await service.reload();
  assert.equal(service.getGlobal('core.reply_mode'), 'text');
});
