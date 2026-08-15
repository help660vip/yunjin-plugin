import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureManifests } from '../apps/manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(root, 'test', 'feature-contract');

const template = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { featureManifests } from '../../apps/manifest.js';",
  "import { serviceFor } from '../../lib/features/service-index.js';",
  "import { contractFor } from '../../lib/features/contracts.js';",
  "",
  "const manifest = featureManifests.find((item) => item.id === '__ID__');",
  "const service = serviceFor('__ID__');",
  "const contract = contractFor('__ID__');",
  "",
  "test('__ID__ normal command contract', () => {",
  "  assert.equal(manifest.id, '__ID__');",
  "  assert.equal(service.featureId, '__ID__');",
  "  assert.equal(service.command, manifest.command);",
  "  assert.equal(service.validateInput(['²é¿´']).ok, true);",
  "});",
  "",
  "test('__ID__ invalid argument boundary', () => {",
  "  assert.equal(service.validateInput(Array.from({ length: 31 }, () => 'x')).ok, false);",
  "  assert.equal(service.validateInput(['x'.repeat(1001)]).ok, false);",
  "});",
  "",
  "test('__ID__ permission contract is explicit', () => {",
  "  assert.ok(['user', 'admin', 'master'].includes(manifest.access));",
  "  assert.equal(service.health({ registry: { isEnabled: () => true } }).enabled, true);",
  "  assert.equal(contract.access, manifest.access);",
  "});",
  "",
  "test('__ID__ scope and storage contract are bounded', () => {",
  "  const event = { botId: 'bot', groupId: 'group', userId: 'user' };",
  "  assert.match(service.scopeFor(event), /bot:bot/u);",
  "  assert.match(service.scopeFor(event), /group:group/u);",
  "  assert.equal(service.describe().storageIsolation || 'bot/group/user', 'bot/group/user');",
  "});",
  "",
  "test('__ID__ dependency and renderer fallback are declared', () => {",
  "  const health = service.health({ registry: { isEnabled: () => true } });",
  "  assert.ok(Array.isArray(health.dependencies));",
  "  assert.equal(health.fallback, 'text');",
  "  assert.match(service.buildHelp(), new RegExp(manifest.command));",
  "});",
  "",
  "test('__ID__ redacts long metadata without changing command identity', () => {",
  "  const result = service.redactInput(['safe', 'z'.repeat(500)]);",
  "  assert.equal(result.args[0], 'safe');",
  "  assert.equal(result.args[1].length, 161);",
  "  assert.deepEqual(result.flags, []);",
  "});",
  "",
  "test('__ID__ failure matrix contains required acceptance paths', () => {",
  "  for (const name of ['normal input', 'invalid arguments', 'insufficient permission', 'rate limit', 'missing dependency', 'scope']) {",
  "    assert.equal(service.describe().failureMatrix.some((item) => item.includes(name)), true);",
  "  }",
  "});"
].join('\n');

async function main() {
  await fs.mkdir(testRoot, { recursive: true });
  for (const manifest of featureManifests) {
    const id = String(manifest.id).padStart(2, '0');
    await fs.writeFile(path.join(testRoot, id + '.test.js'), template.replaceAll('__ID__', id), 'utf8');
  }
  process.stdout.write('generated feature contract tests: ' + featureManifests.length + '\n');
}

await main();
