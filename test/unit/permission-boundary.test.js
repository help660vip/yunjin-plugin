import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadConfig, canUseFeature, canWriteConfig, isGroupAdmin, isYunzaiOwner } from '../../lib/auth/policy.js';

test('\u6743\u9650\u5b57\u6bb5\u5141\u8bb8\u7a33\u5b9a\u7684\u7a7a\u767d\u548c\u5927\u5c0f\u5199\u5f62\u5f0f', () => {
  const admin = { userId: 'u1', groupId: 'g1', role: '  AdMiN  ' };
  assert.equal(isGroupAdmin(admin), true);
  assert.equal(canUseFeature(admin, { access: ' ADMIN ' }), true);
  assert.equal(canWriteConfig(admin, { name: '\u7fa4', id: ' g1 ' }), true);
});

test('\u672a\u77e5\u7684\u80fd\u529b\u6743\u9650\u503c\u76f4\u63a5\u62d2\u7edd', () => {
  const member = { userId: 'u1', groupId: 'g1', role: 'member' };
  assert.equal(canUseFeature(member, { access: 'master ' }), false);
  assert.equal(canUseFeature(member, { access: 'unknown' }), false);
  assert.equal(canUseFeature(member, { access: {} }), false);
});

test('\u8eab\u4efd\u6807\u8bb0\u4ec5\u63a5\u53d7\u5b89\u5168\u7684\u6807\u91cf\u503c', () => {
  assert.equal(isYunzaiOwner({ isMaster: '1' }), true);
  assert.equal(isYunzaiOwner({ isMaster: 'yes' }), false);
  assert.equal(isYunzaiOwner({ isMaster: {} }), false);
  assert.equal(canReadConfig({ userId: {} }), false);
  assert.equal(canUseFeature({ userId: [] }, { access: 'user' }), false);
});

test('\u914d\u7f6e\u4f5c\u7528\u57df\u8eab\u4efd\u4e0d\u4f1a\u88ab\u5f02\u5e38\u5bf9\u8c61\u7ed5\u8fc7', () => {
  const admin = { userId: 'u1', groupId: 'g1', role: 'admin' };
  assert.equal(canWriteConfig(admin, { name: 'group', id: {} }), true);
  assert.equal(canWriteConfig(admin, { name: 'group', id: 'g2' }), false);
  assert.equal(canWriteConfig({ userId: {}, groupId: 'g1', role: 'admin' }, { name: 'group' }), true);
});
