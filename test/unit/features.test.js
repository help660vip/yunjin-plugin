import test from 'node:test';
import assert from 'node:assert/strict';
import { apps, featureManifests, getRuntime, shutdownRuntime } from '../../index.js';
import { canUseFeature, canWriteConfig } from '../../lib/auth/policy.js';
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
