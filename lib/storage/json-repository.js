import fs from 'node:fs/promises';
import path from 'node:path';
const locks = new Map();

export class JsonRepository {
  constructor(filePath, { logger = console } = {}) { this.filePath = filePath; this.logger = logger; }
  async read(fallback) { try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); this.logger.warn?.(`[storage] unable to read ${this.filePath}: ${error.message}`); return structuredClone(fallback); } }
  async write(value) { return this.withLock(() => this.writeUnlocked(value)); }
  async update(fallback, updater) { return this.withLock(async () => { const state = await this.read(fallback); const result = await updater(state); await this.writeUnlocked(state); return result; }); }
  async writeUnlocked(value) { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const tempPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`; await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await fs.rename(tempPath, this.filePath); return value; }
  async withLock(operation) { const previous = locks.get(this.filePath) ?? Promise.resolve(); const current = previous.catch(() => {}).then(operation); const tracked = current.finally(() => { if (locks.get(this.filePath) === tracked) locks.delete(this.filePath); }); locks.set(this.filePath, tracked); return current; }
}
