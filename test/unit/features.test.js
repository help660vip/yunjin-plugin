import test from 'node:test';
import assert from 'node:assert/strict';
import { apps, featureManifests, getRuntime, shutdownRuntime } from '../../index.js';
import { canReadConfig, canUseFeature, canWriteConfig } from '../../lib/auth/policy.js';
import { FeatureRegistry } from '../../lib/registry/feature-registry.js';
import { makeTempDir } from '../helpers.js';

test('all 50 capabilities have one unique #yun jin command', () => {
  assert.equal(featureManifests.length, 50);
  assert.equal(new Set(featureManifests.map((item) => item.id)).size, 50);
  assert.equal(new Set(featureManifests.map((item) => item.command)).size, 50);
  for (const manifest of featureManifests) assert.match(manifest.commands[0], /^#\u4e91\u9526/u);
});

test('Yunzai OP is the global owner and group admins are scoped', () => {
  const op = { isMaster: true, userId: '1', groupId: '2', role: 'member' };
  const admin = { isMaster: false, userId: '2', groupId: '2', role: 'admin' };
  assert.equal(canUseFeature(op, { access: 'master' }), true);
  assert.equal(canWriteConfig(op, { name: 'global' }), true);
  assert.equal(canWriteConfig(admin, { name: 'global' }), false);
  assert.equal(canWriteConfig(admin, { name: 'group' }), true);
});

test('every feature plugin handles its primary command without network access', async () => {
  const dataRoot = await makeTempDir('yunjin-features-');
  getRuntime({ dataRoot });
  for (let index = 0; index < apps.length; index += 1) {
    const instance = new apps[index]();
    const replies = [];
    instance.e = { msg: featureManifests[index].commands[0], user_id: '10001', group_id: '20001', isMaster: true, sender: { role: 'owner' }, reply: async (message) => { replies.push(message); return message; } };
    await instance.handle();
    assert.equal(replies.length, 1, `feature ${featureManifests[index].id} did not reply`);
  }
  await shutdownRuntime();
});


test('能力注册表拒绝重复和无效清单', () => {
  const config = { getEffective: () => ({}) };
  assert.throws(() => new FeatureRegistry([featureManifests[0], { ...featureManifests[0] }], config), /重复能力编号/);
  assert.throws(() => new FeatureRegistry([{ ...featureManifests[0], id: 'x' }], config), /能力清单编号无效/);
  assert.throws(() => new FeatureRegistry([{ ...featureManifests[0], commands: [] }], config), /命令列表为空/);
  assert.throws(() => new FeatureRegistry([featureManifests[0], { ...featureManifests[0], id: '51', command: featureManifests[0].command }], config), /\u91cd\u590d\u80fd\u529b\u547d\u4ee4/);
});

test('能力注册表输出稳定且不暴露内部数组', () => {
  const config = { getEffective: () => ({}) };
  const registry = new FeatureRegistry([featureManifests[9], featureManifests[0]], config);
  const list = registry.list();
  assert.deepEqual(list.map((item) => item.id), ['01', '10']);
  list[0].name = '已修改';
  assert.notEqual(registry.get('01').name, '已修改');
});


test('OP 主人标记兼容并拒绝假值', () => {
  const booleanOwner = { isMaster: true };
  const stringOwner = { isMaster: 'true' };
  const numericOwner = { isMaster: 1 };
  const falseOwner = { isMaster: 'false' };
  assert.equal(canUseFeature(booleanOwner, { access: 'master' }), true);
  assert.equal(canUseFeature(stringOwner, { access: 'master' }), true);
  assert.equal(canUseFeature(numericOwner, { access: 'master' }), true);
  assert.equal(canUseFeature(falseOwner, { access: 'master' }), false);
  assert.equal(canReadConfig(falseOwner), false);
  assert.equal(canWriteConfig({ ...stringOwner }, { name: '全局' }), true);
  assert.equal(canWriteConfig({ isMaster: 'false', userId: 'u1' }, { name: '全局' }), false);
});
