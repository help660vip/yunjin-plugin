function safeText(value, fallback = '', max = 500) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'boolean') return fallback;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return text || fallback;
}

const sensitiveKey = /token|secret|password|passwd|authorization|cookie|api[_-]?key/i;

function safeDetails(value, depth = 0) {
  if (depth > 4) return '[\u5df2\u7701\u7565]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return safeText(value, '', 500);
  if (typeof value === 'number') return Number.isFinite(value) ? value : '[\u975e\u6709\u9650\u6570\u5b57]';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeDetails(item, depth + 1));
  if (typeof value !== 'object') return safeText(value, '', 100);
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    const safeKey = safeText(key, '', 100);
    if (!safeKey) continue;
    result[safeKey] = sensitiveKey.test(safeKey) ? '[\u5df2\u9690\u85cf]' : safeDetails(item, depth + 1);
  }
  return result;
}

function safeDetailObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export class YunjinError extends Error {
  constructor(code, message, options = {}) {
    const safeCode = safeText(code, 'YUNJIN_INTERNAL', 100);
    super(safeText(message, safeCode), { cause: options.cause });
    this.name = 'YunjinError';
    this.code = safeCode;
    const status = Number(options.status);
    this.status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
    this.expose = options.expose !== false;
    this.retryable = options.retryable === true;
    this.details = safeDetails(options.details);
    this.featureId = safeText(options.featureId, '', 80) || undefined;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.expose ? this.message : '?????',
      status: this.status,
      retryable: this.retryable,
      featureId: this.featureId,
      details: this.details
    };
  }
}

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'YUNJIN_INVALID_INPUT',
  NOT_AUTHORIZED: 'YUNJIN_NOT_AUTHORIZED',
  FEATURE_DISABLED: 'YUNJIN_FEATURE_DISABLED',
  RATE_LIMITED: 'YUNJIN_RATE_LIMITED',
  QUOTA_EXCEEDED: 'YUNJIN_QUOTA_EXCEEDED',
  DEPENDENCY_MISSING: 'YUNJIN_DEPENDENCY_MISSING',
  NETWORK_BLOCKED: 'YUNJIN_NETWORK_BLOCKED',
  NETWORK_TIMEOUT: 'YUNJIN_NETWORK_TIMEOUT',
  NETWORK_RESPONSE: 'YUNJIN_NETWORK_RESPONSE',
  STORAGE_FAILURE: 'YUNJIN_STORAGE_FAILURE',
  TASK_CONFLICT: 'YUNJIN_TASK_CONFLICT',
  TASK_NOT_FOUND: 'YUNJIN_TASK_NOT_FOUND',
  RENDER_FAILED: 'YUNJIN_RENDER_FAILED',
  FILE_REJECTED: 'YUNJIN_FILE_REJECTED',
  CONFIRMATION_REQUIRED: 'YUNJIN_CONFIRMATION_REQUIRED',
  INTERNAL: 'YUNJIN_INTERNAL'
});

export function invalidInput(message, details) {
  return new YunjinError(ERROR_CODES.INVALID_INPUT, message, { status: 400, details });
}

export function notAuthorized(message = '???????????', details) {
  return new YunjinError(ERROR_CODES.NOT_AUTHORIZED, message, { status: 403, details });
}

export function featureDisabled(featureId) {
  return new YunjinError(ERROR_CODES.FEATURE_DISABLED, '?????????', { status: 404, featureId });
}

export function rateLimited(retryAfterMs, details) {
  return new YunjinError(ERROR_CODES.RATE_LIMITED, '?????????????', {
    status: 429,
    retryable: true,
    details: { retryAfterMs, ...safeDetailObject(details) }
  });
}

export function quotaExceeded(details) {
  return new YunjinError(ERROR_CODES.QUOTA_EXCEEDED, '????????', { status: 429, details });
}

export function dependencyMissing(name) {
  return new YunjinError(ERROR_CODES.DEPENDENCY_MISSING, '???????' + safeText(name, '????', 120), { status: 503 });
}

export function networkBlocked(message, details) {
  return new YunjinError(ERROR_CODES.NETWORK_BLOCKED, message, { status: 400, details });
}

export function networkTimeout(url, details) {
  return new YunjinError(ERROR_CODES.NETWORK_TIMEOUT, '?????????', { status: 504, retryable: true, details: { url: safeText(url, '', 2000), ...safeDetailObject(details) } });
}

export function networkResponse(message, details) {
  return new YunjinError(ERROR_CODES.NETWORK_RESPONSE, message, { status: 502, retryable: true, details });
}

export function storageFailure(message, cause, details) {
  return new YunjinError(ERROR_CODES.STORAGE_FAILURE, message, { status: 500, cause, details, expose: false });
}

export function renderFailed(cause, details) {
  return new YunjinError(ERROR_CODES.RENDER_FAILED, '????????', { status: 503, retryable: true, cause, details });
}

export function fileRejected(message, details) {
  return new YunjinError(ERROR_CODES.FILE_REJECTED, message, { status: 400, details });
}

export function confirmationRequired(token, details) {
  return new YunjinError(ERROR_CODES.CONFIRMATION_REQUIRED, '??????????', { status: 409, details: { token: safeText(token, '', 200), ...safeDetailObject(details) } });
}

export function normalizeError(error, fallbackCode = ERROR_CODES.INTERNAL) {
  if (error instanceof YunjinError) return error;
  if (error?.name === 'AbortError') return networkTimeout(undefined, { cause: safeText(error.message, '', 300) });
  const message = typeof error === 'string' ? error : error?.message;
  return new YunjinError(fallbackCode, safeText(message, '?????'), { cause: error, expose: false });
}

export function publicErrorMessage(error, fallback) {
  const normalized = normalizeError(error);
  const safeFallback = safeText(fallback, '', 300);
  if (safeFallback) return safeFallback;
  if (normalized.code === ERROR_CODES.NETWORK_TIMEOUT) return '???????????????';
  if (normalized.code === ERROR_CODES.NETWORK_RESPONSE) return '????????????????';
  if (normalized.expose) return normalized.message;
  return '???????????';
}

export function assertCondition(condition, errorFactory) {
  if (condition) return;
  throw typeof errorFactory === 'function' ? errorFactory() : invalidInput(String(errorFactory || '??????'));
}

export async function errorBoundary(operation, options = {}) {
  try {
    return await operation();
  } catch (error) {
    const normalized = normalizeError(error, options.fallbackCode);
    if (typeof options.onError === 'function') {
      try { await options.onError(normalized); } catch {}
    }
    if (options.rethrow) throw normalized;
    return { ok: false, error: normalized };
  }
}
