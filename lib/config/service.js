import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { CORE_CONFIG_SCHEMA, validateSchemaValue } from './schema.js';

const STATE_VERSION = 1;
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
const scopeAliases = Object.freeze({ global: 'global', '全局': 'global', group: 'group', '群': 'group', '群组': 'group', user: 'user', '用户': 'user' });

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
    this.state = normalizeState(await this.repository.read(fallback));
    try {
      await fsPromises.access(this.repository.filePath);
    } catch (error) {
      if (error.code === 'ENOENT' && typeof this.repository.write === 'function') await this.repository.write(this.state);
    }
    return this.state;
  }

  watch() {
    if (this.watcher || !this.repository?.filePath) return;
    this.watcher = fs.watch(this.repository.filePath, { persistent: false }, () => {
      this.reloadPromise = this.reload().catch((error) => this.logger.warn?.('[config] hot reload failed: ' + error.message));
    });
    this.watcher.on('error', (error) => this.logger.warn?.('[config] watcher failed: ' + error.message));
  }

  async close() {
    this.watcher?.close();
    this.watcher = null;
  }

  async reload() {
    await this.initialize();
    this.state = normalizeState(await this.repository.read(this.state));
    await this.audit?.record({ action: 'config.reload' });
    return { ok: true, action: 'reloaded' };
  }

  getGlobal(key) {
    const definition = this.schemas.get(key);
    if (!definition) return undefined;
    const value = this.state?.global?.[key];
    return value === undefined || validateSchemaValue(definition, value).ok ? value ?? definition.default : definition.default;
  }

  async getEffectiveValue(scope, key) {
    await this.initialize();
    const target = normalizeScope(scope);
    if (!target.valid) return { ok: false, error: 'invalid_scope' };
    if (!this.schemas.has(key)) return { ok: false, error: 'unknown_key', key };
    const effective = this.getEffective(target);
    const result = { ok: true, key, value: redact(key, effective[key]) };
    await this.audit?.record({ action: 'config.get', scope: target.name, scopeId: target.id, key });
    return result;
  }

  async describeEffective(scope) {
    await this.initialize();
    const target = normalizeScope(scope);
    if (!target.valid) return { ok: false, error: 'invalid_scope' };
    const effective = this.getEffective(target);
    const result = { ok: true, scope: target, values: Object.fromEntries([...this.schemas.keys()].sort().map((key) => [key, redact(key, effective[key])])) };
    await this.audit?.record({ action: 'config.view', scope: target.name, scopeId: target.id });
    return result;
  }

  getEffective(scope = {}) {
    const scopeInfo = normalizeScope(scope);
    const values = {};
    for (const [key, schema] of this.schemas) values[key] = schema.default;
    applyConfigBucket(values, this.state?.global, this.schemas);
    if (scopeInfo.groupId) applyConfigBucket(values, this.state?.groups?.[scopeInfo.groupId], this.schemas);
    if (scopeInfo.userId) applyConfigBucket(values, this.state?.users?.[scopeInfo.userId], this.schemas);
    return values;
  }

  async set(scope, key, value) {
    await this.initialize();
    if (dangerousKeys.has(key) || String(key).split('.').some((part) => dangerousKeys.has(part))) return { ok: false, error: 'invalid_key' };
    const schema = this.schemas.get(key);
    const validation = validateSchemaValue(schema, value);
    if (!validation.ok) return { ok: false, error: validation.reason, key };
    const target = normalizeScope(scope);
    if (!target.valid) return { ok: false, error: 'invalid_scope' };
    if (target.name !== 'global' && !target.id) return { ok: false, error: 'missing_scope_id' };
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
  return { version: STATE_VERSION, global: plainObject(state.global), groups: plainObject(state.groups), users: plainObject(state.users) };
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => normalizeIdentity(key) === key).map(([key, item]) => [String(key), item && typeof item === 'object' && !Array.isArray(item) ? plainObject(item) : item]));
}

function ensureBucket(parent, id) {
  if (!isSafeId(id)) throw new Error('invalid_scope_id');
  if (!Object.prototype.hasOwnProperty.call(parent, id) || !parent[id] || typeof parent[id] !== 'object' || Array.isArray(parent[id])) parent[id] = {};
  return parent[id];
}

function applyConfigBucket(target, bucket, schemas) {
  for (const [key, value] of Object.entries(bucket ?? {})) {
    const schema = schemas.get(key);
    if (schema && validateSchemaValue(schema, value).ok) target[key] = value;
  }
}

function normalizeIdentity(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return '';
  const id = String(value).trim();
  if (!id || id.length > 128 || dangerousKeys.has(id)) return '';
  if ([...id].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  })) return '';
  return id;
}

function isSafeId(value) {
  return Boolean(normalizeIdentity(value));
}

function normalizeScope(scope = {}) {
  if (scope !== null && scope !== undefined && typeof scope !== 'string' && (typeof scope !== 'object' || Array.isArray(scope))) return { name: '', id: null, groupId: null, userId: null, valid: false };
  const input = typeof scope === 'string' ? { name: scope } : (scope || {});
  const name = scopeAliases[String(input.name ?? 'global').trim().toLowerCase()] || '';
  const hasId = input.id !== null && input.id !== undefined && input.id !== '';
  const rawId = hasId ? normalizeIdentity(input.id) : null;
  const id = rawId || (hasId ? '' : null);
  const groupId = input.groupId == null ? (name === 'group' ? id : null) : normalizeIdentity(input.groupId);
  const userId = input.userId == null ? (name === 'user' ? id : null) : normalizeIdentity(input.userId);
  const valid = Boolean(name) && (!hasId || Boolean(id));
  return { name, id, groupId: groupId || null, userId: userId || null, valid };
}

function redact(key, value) {
  if (/token|secret|password|passwd|api[_-]?key|cookie/i.test(key)) return value == null ? value : '[已隐藏]';
  return value;
}
