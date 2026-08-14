import fs from 'node:fs/promises';
import path from 'node:path';

const locks = new Map();

export class JsonRepository {
  constructor(filePath, { logger = console } = {}) {
    this.filePath = filePath;
    this.logger = logger;
  }

  async read(fallback) {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(fallback);
      this.logger.warn?.(`[storage] unable to read ${this.filePath}: ${error.message}`);
      return structuredClone(fallback);
    }
  }

  async write(value) {
    return this.withLock(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tempPath, this.filePath);
      return value;
    });
  }

  async withLock(operation) {
    const previous = locks.get(this.filePath) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    locks.set(this.filePath, current.finally(() => {
      if (locks.get(this.filePath) === current) locks.delete(this.filePath);
    }));
    return current;
  }
}
