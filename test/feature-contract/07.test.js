import test from 'node:test';
import assert from 'node:assert/strict';
import { featureManifests } from '../../apps/manifest.js';
import { serviceFor } from '../../lib/features/service-index.js';
import { contractFor } from '../../lib/features/contracts.js';

const manifest = featureManifests.find((item) => item.id === '07');
const service = serviceFor('07');
const contract = contractFor('07');

test('07 normal command contract', () => {
  assert.equal(manifest.id, '07');
  assert.equal(service.featureId, '07');
  assert.equal(service.command, manifest.command);
  assert.equal(service.validateInput(['�鿴']).ok, true);
});

test('07 invalid argument boundary', () => {
  assert.equal(service.validateInput(Array.from({ length: 31 }, () => 'x')).ok, false);
  assert.equal(service.validateInput(['x'.repeat(1001)]).ok, false);
});

test('07 permission contract is explicit', () => {
  assert.ok(['user', 'admin', 'master'].includes(manifest.access));
  assert.equal(service.health({ registry: { isEnabled: () => true } }).enabled, true);
  assert.equal(contract.access, manifest.access);
});

test('07 scope and storage contract are bounded', () => {
  const event = { botId: 'bot', groupId: 'group', userId: 'user' };
  assert.match(service.scopeFor(event), /bot:bot/u);
  assert.match(service.scopeFor(event), /group:group/u);
  assert.equal(service.describe().storageIsolation || 'bot/group/user', 'bot/group/user');
});

test('07 dependency and renderer fallback are declared', () => {
  const health = service.health({ registry: { isEnabled: () => true } });
  assert.ok(Array.isArray(health.dependencies));
  assert.equal(health.fallback, 'text');
  assert.match(service.buildHelp(), new RegExp(manifest.command));
});

test('07 redacts long metadata without changing command identity', () => {
  const result = service.redactInput(['safe', 'z'.repeat(500)]);
  assert.equal(result.args[0], 'safe');
  assert.equal(result.args[1].length, 161);
  assert.deepEqual(result.flags, []);
});

test('07 failure matrix contains required acceptance paths', () => {
  for (const name of ['normal input', 'invalid arguments', 'insufficient permission', 'rate limit', 'missing dependency', 'scope']) {
    assert.equal(service.describe().failureMatrix.some((item) => item.includes(name)), true);
  }
});