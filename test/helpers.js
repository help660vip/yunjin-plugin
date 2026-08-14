import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function makeTempDir(prefix = 'yunjin-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export function makeEvent(overrides = {}) {
  return {
    msg: '#云锦 配置 查看',
    user_id: '10001',
    group_id: '20001',
    sender: { role: 'member' },
    runtime: { name: 'test' },
    ...overrides
  };
}
