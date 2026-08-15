import { featureStorageKey, normalizeBotId, normalizeGroupId, normalizeUserId, scopeKey } from '../core/ids.js';
import { FEATURE_LIMITS } from '../core/constants.js';
import { storageFailure } from '../core/errors.js';

function clone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function defaultState(value = {}) {
  return value && typeof value === 'object' ? value : {};
}

export class FeatureStore {
  constructor(runtime, featureId, event, options = {}) {
    this.runtime = runtime;
    this.featureId = String(featureId).padStart(2, '0');
    this.event = event;
    this.level = options.level || (event?.groupId && event.groupId !== 'private' ? 'group' : 'user');
    this.maxItems = Number(options.maxItems || FEATURE_LIMITS.maxItemsPerScope);
  }

  key(suffix = 'state') {
    return featureStorageKey(this.featureId, this.event, suffix, { level: this.level });
  }

  scope() {
    return scopeKey(this.event, { level: this.level });
  }

  identity() {
    return {
      botId: normalizeBotId(this.event),
      groupId: normalizeGroupId(this.event),
      userId: normalizeUserId(this.event),
      scope: this.scope()
    };
  }

  async read(fallback = {}) {
    const key = this.key();
    try {
      const root = await this.runtime.stateRepository.read({});
      return defaultState(root[key] === undefined ? clone(fallback) : root[key]);
    } catch (error) {
      throw storageFailure('能力状态读取失败。', error, { featureId: this.featureId, key });
    }
  }

  async update(mutator, fallback = {}) {
    const key = this.key();
    try {
      return await this.runtime.stateRepository.update({}, async (root) => {
        const current = defaultState(root[key] === undefined ? clone(fallback) : root[key]);
        const result = await mutator(current, this.identity());
        root[key] = clone(current);
        return result === undefined ? clone(current) : result;
      });
    } catch (error) {
      throw storageFailure('能力状态写入失败。', error, { featureId: this.featureId, key });
    }
  }

  async clear() {
    const key = this.key();
    return this.runtime.stateRepository.update({}, (root) => {
      const existed = Object.prototype.hasOwnProperty.call(root, key);
      delete root[key];
      return existed;
    });
  }

  async list(field = 'items') {
    const state = await this.read({ [field]: [] });
    return Array.isArray(state[field]) ? state[field].slice(0, this.maxItems) : [];
  }

  async add(item, field = 'items', options = {}) {
    return this.update((state) => {
      const items = Array.isArray(state[field]) ? state[field] : [];
      const value = options.uniqueBy ? items.filter((entry) => entry?.[options.uniqueBy] !== item?.[options.uniqueBy]) : items;
      state[field] = [item, ...value].slice(0, options.maxItems || this.maxItems);
      return item;
    }, { [field]: [] });
  }

  async upsert(item, field = 'items', options = {}) {
    return this.update((state) => {
      const items = Array.isArray(state[field]) ? state[field] : [];
      const uniqueBy = options.uniqueBy ? String(options.uniqueBy) : '';
      const index = uniqueBy ? items.findIndex((entry) => entry?.[uniqueBy] === item?.[uniqueBy]) : -1;
      if (index >= 0) {
        const existing = items[index];
        const merged = typeof options.merge === 'function'
          ? (options.merge(clone(existing), clone(item)) || existing)
          : { ...existing, ...item };
        const next = items.slice();
        next[index] = merged;
        state[field] = next.slice(0, options.maxItems || this.maxItems);
        return { item: merged, created: false };
      }
      state[field] = [item, ...items].slice(0, options.maxItems || this.maxItems);
      return { item, created: true };
    }, { [field]: [] });
  }

  async remove(predicate, field = 'items') {
    return this.update((state) => {
      const items = Array.isArray(state[field]) ? state[field] : [];
      const before = items.length;
      state[field] = items.filter((item, index) => !predicate(item, index));
      return before - state[field].length;
    }, { [field]: [] });
  }

  async find(predicate, field = 'items') {
    const items = await this.list(field);
    return items.find(predicate);
  }

  async count(field = 'items') {
    return (await this.list(field)).length;
  }

  async withLock(operation) {
    const key = this.key();
    return this.runtime.core.mutex.runExclusive(key, operation, { timeoutMs: 5000 });
  }
}

export function featureStore(runtime, featureId, event, options) {
  return new FeatureStore(runtime, featureId, event, options);
}
