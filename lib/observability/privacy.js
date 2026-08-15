import { redactSecrets, redactText, stripControl } from '../core/safe.js';
import { redactId } from '../core/ids.js';

const PRIVATE_FIELDS = new Set(['message', 'rawMessage', 'raw_message', 'content', 'text', 'body', 'cookie', 'token', 'authorization', 'password', 'secret']);

export function sanitizeAudit(input, options = {}) {
  const value = redactSecrets(input, { maxString: options.maxString || 600, maxArray: options.maxArray || 30, maxKeys: options.maxKeys || 60 });
  return scrub(value, options);
}

function scrub(value, options, key = '') {
  if (typeof value === 'string') {
    if (PRIVATE_FIELDS.has(key.toLowerCase()) && !options.allowContent) return '[content-redacted]';
    return redactText(stripControl(value, { max: options.maxString || 600 }), options);
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, options.maxArray || 30).map((item) => scrub(item, options));
  const result = {};
  for (const [name, child] of Object.entries(value).slice(0, options.maxKeys || 60)) {
    if (name.toLowerCase().endsWith('id') && options.redactIds) result[name] = redactId(child);
    else result[name] = scrub(child, options, name);
  }
  return result;
}

export function sanitizeError(error, options = {}) {
  return {
    name: String(error?.name || 'Error'),
    code: String(error?.code || 'INTERNAL'),
    message: options.expose ? stripControl(error?.message || 'unknown', { max: 300 }) : 'internal error',
    retryable: Boolean(error?.retryable),
    details: sanitizeAudit(error?.details || {}, options)
  };
}

export function safeLogMessage(value, options = {}) {
  return stripControl(redactText(value, options), { max: options.max || 1000 });
}

export function retentionDecision(record, options = {}) {
  const now = Number(options.now || Date.now());
  const ttl = Number(options.ttlMs || 30 * 86400000);
  const createdAt = Number(record?.createdAt || record?.time || now);
  return { expired: createdAt + ttl < now, ageMs: Math.max(0, now - createdAt), createdAt };
}
