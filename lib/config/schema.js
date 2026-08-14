export const CORE_CONFIG_SCHEMA = Object.freeze({
  'core.enabled': { type: 'boolean', default: true, description: '是否启用云锦' },
  'core.hot_reload': { type: 'boolean', default: true, description: '是否监听配置文件变化' },
  'core.reply_mode': { type: 'enum', values: ['auto', 'text'], default: 'auto', description: '回复模式' },
  'core.audit_retention_days': { type: 'integer', min: 1, max: 3650, default: 30, description: '审计保留天数' }
});

export function validateSchemaValue(schema, value) {
  if (!schema) return { ok: false, reason: 'unknown_key' };
  if (schema.type === 'boolean' && typeof value !== 'boolean') return { ok: false, reason: 'expected_boolean' };
  if (schema.type === 'string' && typeof value !== 'string') return { ok: false, reason: 'expected_string' };
  if (schema.type === 'integer' && (!Number.isInteger(value) || value < schema.min || value > schema.max)) return { ok: false, reason: 'invalid_integer' };
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return { ok: false, reason: 'expected_number' };
  if (schema.type === 'enum' && !schema.values.includes(value)) return { ok: false, reason: 'invalid_enum' };
  return { ok: true };
}
