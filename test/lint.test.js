import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('source tree has no Windows absolute paths or forbidden copied inputs', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = await walk(root);
  const sourceFiles = files.filter((file) => /\.(js|json|md)$/u.test(file) && !file.includes(`${path.sep}test${path.sep}`));
  for (const file of sourceFiles) {
    const content = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(content, /[A-Z]:\\/u, file);
    assert.doesNotMatch(content, /upstream-plugins|pasted-text|help660\\.codex/u, file);
  }
});

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', '.git', '.workstate', 'test'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
