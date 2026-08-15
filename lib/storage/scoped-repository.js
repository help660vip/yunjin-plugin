import { normalizeId, scopeKey } from '../core/ids.js';
import { storageFailure } from '../core/errors.js';

export class ScopedRepository {
  constructor(repository, options = {}) {
    this.repository = repository;
    this.prefix = String(options.prefix || 'Yunjin');
    this.serialize = options.serialize || ((value) => value);
    this.deserialize = options.deserialize || ((value) => value);
  }

  key(event, suffix = 'state', options = {}) {
    return this.prefix + ':' + normalizeId(options.feature || 'shared') + ':' + scopeKey(event, options) + ':' + normalizeId(suffix);
  }

  async read(event, fallback, suffix = 'state', options = {}) {
    const key = this.key(event, suffix, options);
    try {
      const root = await this.repository.read({});
      return this.deserialize(root[key] === undefined ? fallback : root[key]);
    } catch (error) {
      throw storageFailure('作用域数据读取失败。', error, { key });
    }
  }

  async update(event, fallback, updater, suffix = 'state', options = {}) {
    const key = this.key(event, suffix, options);
    try {
      return await this.repository.update({}, async (root) => {
        const current = root[key] === undefined ? this.serialize(fallback) : root[key];
        const next = await updater(this.deserialize(current));
        root[key] = this.serialize(next === undefined ? current : next);
        return next === undefined ? root[key] : next;
      });
    } catch (error) {
      throw storageFailure('作用域数据写入失败。', error, { key });
    }
  }

  async delete(event, suffix = 'state', options = {}) {
    const key = this.key(event, suffix, options);
    return this.repository.update({}, (root) => {
      const existed = Object.prototype.hasOwnProperty.call(root, key);
      delete root[key];
      return existed;
    });
  }

  async list(prefix = '') {
    const root = await this.repository.read({});
    const start = this.prefix + ':' + prefix;
    return Object.entries(root).filter(([key]) => key.startsWith(start)).map(([key, value]) => ({ key, value }));
  }

  static scope(event, options) {
    return scopeKey(event, options);
  }
}
