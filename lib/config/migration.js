import { redactSecrets, isPlainObject, parseBoolean, parseNumber } from '../core/safe.js';
import { DATA_VERSION } from '../core/constants.js';
import { invalidInput } from '../core/errors.js';

function clone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

export class ConfigMigrationPipeline {
  constructor(options = {}) {
    this.currentVersion = Number(options.currentVersion || DATA_VERSION);
    this.migrations = new Map();
    this.validators = new Map();
  }

  register(version, migrate, options = {}) {
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1 || typeof migrate !== 'function') throw new TypeError('invalid migration');
    this.migrations.set(number, { migrate, name: options.name || 'migration-' + number });
    if (typeof options.validate === 'function') this.validators.set(number, options.validate);
    return this;
  }

  addValidator(version, validator) {
    this.validators.set(Number(version), validator);
    return this;
  }

  async migrate(input = {}) {
    const source = clone(input);
    let version = Number(source.version || 1);
    if (!Number.isInteger(version) || version < 1) throw invalidInput('配置版本不正确。');
    const applied = [];
    while (version < this.currentVersion) {
      const next = version + 1;
      const migration = this.migrations.get(next);
      if (!migration) throw new Error('missing config migration ' + next);
      const result = await migration.migrate(clone(source));
      Object.keys(source).forEach((key) => delete source[key]);
      Object.assign(source, result && typeof result === 'object' ? result : {});
      source.version = next;
      version = next;
      applied.push(migration.name);
    }
    const validator = this.validators.get(version);
    if (validator) {
      const result = await validator(source);
      if (result === false) throw invalidInput('配置校验失败。');
    }
    source.version = version;
    return { value: source, applied, changed: applied.length > 0 };
  }

  describe() {
    return { currentVersion: this.currentVersion, migrations: [...this.migrations.entries()].map(([version, item]) => ({ version, name: item.name })) };
  }
}

export class ConfigTransaction {
  constructor(initial = {}) {
    this.original = clone(initial);
    this.value = clone(initial);
    this.changes = [];
  }

  set(path, value) {
    setPath(this.value, path, value);
    this.changes.push({ type: 'set', path: String(path), value: redactSecrets(value) });
    return this;
  }

  delete(path) {
    deletePath(this.value, path);
    this.changes.push({ type: 'delete', path: String(path) });
    return this;
  }

  get(path, fallback) {
    return getPath(this.value, path, fallback);
  }

  diff() {
    return diffConfig(this.original, this.value);
  }

  commit() {
    return { value: clone(this.value), changes: clone(this.changes), diff: this.diff() };
  }

  rollback() {
    this.value = clone(this.original);
    this.changes = [];
    return this;
  }
}

export function getPath(value, path, fallback) {
  const parts = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return fallback;
    current = current[part];
  }
  return current;
}

export function setPath(value, path, next) {
  const parts = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
  if (!parts.length) throw invalidInput('配置键不能为空。');
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = clone(next);
  return value;
}

export function deletePath(value, path) {
  const parts = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
  if (!parts.length) return value;
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!current || typeof current !== 'object') return value;
    current = current[part];
  }
  if (current && typeof current === 'object') delete current[parts.at(-1)];
  return value;
}

export function flattenConfig(value, prefix = '', result = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) result[prefix] = value;
    return result;
  }
  for (const [key, child] of Object.entries(value)) flattenConfig(child, prefix ? prefix + '.' + key : key, result);
  return result;
}

export function unflattenConfig(value = {}) {
  const result = {};
  for (const [key, child] of Object.entries(value)) setPath(result, key, child);
  return result;
}

export function diffConfig(left, right, prefix = '', result = []) {
  const a = flattenConfig(left);
  const b = flattenConfig(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of [...keys].sort()) {
    const same = JSON.stringify(a[key]) === JSON.stringify(b[key]);
    if (!same) result.push({ path: prefix ? prefix + '.' + key : key, before: redactSecrets(a[key]), after: redactSecrets(b[key]) });
  }
  return result;
}

export function normalizeConfigValue(value, schema = {}) {
  if (schema.type === 'boolean') return parseBoolean(value, schema.default);
  if (schema.type === 'number') return parseNumber(value, { min: schema.min, max: schema.max, fallback: schema.default });
  if (schema.type === 'string') return String(value ?? schema.default ?? '').slice(0, Number(schema.maxLength || 4000));
  if (schema.type === 'array') return Array.isArray(value) ? value.slice(0, Number(schema.maxItems || 100)) : (schema.default || []);
  return value;
}
