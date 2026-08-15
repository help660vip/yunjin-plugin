import test from 'node:test';
import assert from 'node:assert/strict';
import { featureManifests } from '../../apps/manifest.js';
import { validateHandlerSet } from '../../lib/features/handlers/index.js';
import { serviceFor, validateServiceSet } from '../../lib/features/service-index.js';

test('every manifest has a matching handler and independent service contract', () => {
  assert.deepEqual(validateHandlerSet(featureManifests), { ok: true, missing: [], extra: [], count: 50 });
  assert.deepEqual(validateServiceSet(featureManifests), { ok: true, missing: [], extra: [], count: 50 });
  for (const manifest of featureManifests) {
    const service = serviceFor(manifest.id);
    assert.equal(service.featureId, manifest.id);
    assert.equal(service.command, manifest.command);
    assert.equal(service.validateInput([]).ok, true);
    assert.match(service.buildHelp(), new RegExp(manifest.command));
    assert.equal(service.health({ registry: { isEnabled: () => true } }).enabled, true);
  }
});

test('service contracts bound arguments and redact long input metadata', () => {
  const service = serviceFor('41');
  const validation = service.validateInput(Array.from({ length: 31 }, () => 'x'));
  assert.equal(validation.ok, false);
  const redacted = service.redactInput(['short', 'x'.repeat(500)]);
  assert.equal(redacted.args[1].length, 161);
  assert.deepEqual(redacted.flags, []);
});
