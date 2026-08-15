import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AuditLog } from '../../lib/observability/audit.js';
import { makeTempDir } from '../helpers.js';

test('审计记录脱敏并限制元数据大小', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'audit.jsonl');
  const audit = new AuditLog(file);
  await audit.record({ action: 'audit.boundary', secret: 'hidden', text: 'x'.repeat(1100), items: Array.from({ length: 70 }, (_, index) => index), nested: { level1: { level2: { level3: { level4: { level5: { value: 'too-deep' } } } } } }, bigint: 1n });
  const event = JSON.parse((await fs.readFile(file, 'utf8')).trim());
  assert.equal(event.secret, '[已隐藏]');
  assert.equal(event.text.length, 1000);
  assert.equal(event.items.length, 50);
  assert.equal(event.nested.level1.level2.level3.level4, '[已截断]');
  assert.equal(event.bigint, '[不可序列化]');
});
