import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonRepository } from '../../lib/storage/json-repository.js';
import { makeTempDir } from '../helpers.js';

test('资料仓库并发更新不互相覆盖', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'state.json');
  const first = new JsonRepository(file);
  const second = new JsonRepository(file);
  await Promise.all([
    first.update({ values: {} }, (state) => { state.values.first = true; return state; }),
    second.update({ values: {} }, (state) => { state.values.second = true; return state; })
  ]);
  assert.deepEqual((await first.read({ values: {} })).values, { first: true, second: true });
});

test('资料仓库序列化失败会清理临时文件', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'state.json');
  const repository = new JsonRepository(file);
  await assert.rejects(() => repository.write({ value: 1n }), TypeError);
  const names = await fs.readdir(dir);
  assert.equal(names.some((name) => name.includes('.tmp.')), false);
});
