import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { CORE_CONFIG_SCHEMA, validateSchemaValue } from './schema.js';

const STATE_VERSION = 1;
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);

export class ConfigService {
  constructor({ repository, logger = console, audit = null } = {}) {
    this.repository = repository;
    this.logger = logger;
    this.audit = audit;
    this.schemas = new Map(Object.entries(CORE_CONFIG_SCHEMA));
    this.state = null;
    this.watcher = null;
    this.reloadPromise = null;
  }

  registerSchema(featureId, schema) {
    for (const [key, definition] of Object.entries(schema ?? {})) {
      if (this.schemas.has(key)) continue;
      this.schemas.set(key, { ...definition, featureId });
    }
  }

  async initialize() {
    if (this.state) return this.state;
    const fallback = { version: STATE_VERSION, global: {}, groups: {}, users: {} };
    this.state = await this.repository.read(fallback);
    this.state = normalizeState(this.state);
    try {
      await fsPromises.access(this.repository.filePath);
    } catch (error) {
      if (error.code === 'ENOENT') await this.repository.write(this.state);
    }
    return this.state;
  }

  watch() {
    if (this.watcher || !this.repository?.filePath) return;
    this.watcher = fs.watch(this.repository.filePath, { persistent: false }, () => {
      this.reloadPromise = this.reload().catch((error) => {
        this.logger.warn?.(`[config] hot reload failed: ${error.message}`);
      });
    });
    this.watcher.on('error', (error) => this.logger.warn?.(`[config] watcher failed: ${error.message}`));
  }

  async close() {
    this.watcher?.close();
    this.watcher = null;
  }

  async reload() {
    await this.initialize();
    const loaded = await this.repository.read(this.state);
    this.state = normalizeState(loaded);
    await this.audit?.record({ action: 'config.reload' });
    return { ok: true, action: 'reloaded' };
  }

  getGlobal(key) {
    const definition = this.schemas.get(key);
    return this.state?.global?.[key] ?? definition?.default;
  }

  async getEffectiveValue(scope, key) {
    await this.initialize();
    if (!this.schemas.has(key)) return { ok: false, error: 'unknown_key', key };
    const effective = this.getEffective(scope);
    const result = { ok: true, key, value: redact(key, effective[key]) };
    await this.audit?.record({ action: 'config.get', scope: normalizeScope(scope).name, key });
    return result;
  }

  async describeEffective(scope) {
    await this.initialize();
    const effective = this.getEffective(scope);
    const result = {
      ok: true,
      scope,
      values: Object.fromEntries([...this.schemas.keys()].sort().map((key) => [key, redact(key, effective[key])] ))
    };
    await this.audit?.record({ action: 'config.view', scope: normalizeScope(scope).name });
    return result;
  }

  getEffective(scope = {}) {
    const scopeInfo = normalizeScope(scope);
    const groupId = scopeInfo.groupId ?? (scopeInfo.name === 'group' ? scopeInfo.id : null);
    const userId = scopeInfo.userId ?? (scopeInfo.name === 'user' ? scopeInfo.id : null);
    const values = {};
    for (const [key, schema] of this.schemas) values[key] = schema.default;
    Object.assign(values, this.state?.global ?? {});
    if (groupId) Object.assign(values, this.state?.groups?.[groupId] ?? {});
    if (userId) Object.assign(values, this.state?.users?.[userId] ?? {});
    return values;
  }

  async set(scope, key, value) {
    await this.initialize();
    if (dangerousKeys.has(key) || key.split('.').some((part) => dangerousKeys.has(part))) return { ok: false, error: 'invalid_key' };
    const schema = this.schemas.get(key);
    const validation = validateSchemaValue(schema, value);
    if (!validation.ok) return { ok: false, error: validation.reason, key };
    const target = normalizeScope(scope);
    if (!target.id && target.name !== 'global') return { ok: false, error: 'missing_scope_id' };
    const bucket = target.name === 'global' ? this.state.global : target.name === 'group' ? ensureBucket(this.state.groups, target.id) : ensureBucket(this.state.users, target.id);
    bucket[key] = value;
    await this.repository.write(this.state);
    await this.audit?.record({ action: 'config.set', scope: target.name, scopeId: target.id, key, value: redact(key, value) });
    return { ok: true, action: 'updated', scope: target.name, key, value: redact(key, value) };
  }

  async validate() {
    await this.initialize();
    const errors = [];
    for (const bucket of [this.state.global, ...Object.values(this.state.groups), ...Object.values(this.state.users)]) {
      for (const [key, value] of Object.entries(bucket)) {
        const result = validateSchemaValue(this.schemas.get(key), value);
        if (!result.ok) errors.push({ key, error: result.reason });
      }
    }
    const result = errors.length ? { ok: false, errors } : { ok: true, action: 'valid' };
    await this.audit?.record({ action: 'config.validate', ok: result.ok, errorCount: errors.length });
    return result;
  }
}

function normalizeState(value) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    version: STATE_VERSION,
    global: plainObject(state.global),
    groups: plainObject(state.groups),
    users: plainObject(state.users)
  };
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function ensureBucket(parent, id) {
  if (!parent[id]) parent[id] = {};
  return parent[id];
}

function normalizeScope(scope = {}) {
  if (typeof scope === 'string') return { name: scope, id: null };
  const name = scope.name ?? 'global';
  const id = scope.id == null ? null : String(scope.id);
  return {
    name,
    id,
    groupId: scope.groupId == null ? (name === 'group' ? id : null) : String(scope.groupId),
    userId: scope.userId == null ? (name === 'user' ? id : null) : String(scope.userId)
  };
}

function redact(key, value) {
  if (/token|secret|password|passwd|api[_-]?key|cookie/i.test(key)) return value == null ? value : '[已隐藏]';
  return value;
}
