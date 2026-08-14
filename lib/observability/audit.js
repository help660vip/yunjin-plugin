import fs from 'node:fs/promises';
import path from 'node:path';

export class AuditLog {
  constructor(filePath, { logger = console } = {}) {
    this.filePath = filePath;
    this.logger = logger;
    this.chain = Promise.resolve();
  }

  record(entry) {
    const event = { at: new Date().toISOString(), ...sanitize(entry) };
    this.chain = this.chain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 });
    }).catch((error) => {
      this.logger.warn?.('[audit] write failed: ' + error.message);
    });
    return this.chain;
  }
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/token|secret|password|passwd|api[_-]?key|cookie/i.test(key)) return [key, '[已隐藏]'];
    return [key, sanitize(item)];
  }));
}
