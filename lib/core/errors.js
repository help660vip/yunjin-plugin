export class YunjinError extends Error {
  constructor(code, message, options = {}) {
    super(String(message || code), { cause: options.cause });
    this.name = 'YunjinError';
    this.code = String(code);
    this.status = Number.isInteger(options.status) ? options.status : 500;
    this.expose = options.expose !== false;
    this.retryable = options.retryable === true;
    this.details = options.details && typeof options.details === 'object' ? options.details : {};
    this.featureId = options.featureId ? String(options.featureId) : undefined;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.expose ? this.message : '内部错误。',
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

export function notAuthorized(message = '没有执行此操作的权限。', details) {
  return new YunjinError(ERROR_CODES.NOT_AUTHORIZED, message, { status: 403, details });
}

export function featureDisabled(featureId) {
  return new YunjinError(ERROR_CODES.FEATURE_DISABLED, '此能力当前已禁用。', { status: 404, featureId });
}

export function rateLimited(retryAfterMs, details) {
  return new YunjinError(ERROR_CODES.RATE_LIMITED, '操作过于频繁，请稍后再试。', {
    status: 429,
    retryable: true,
    details: { retryAfterMs, ...details }
  });
}

export function quotaExceeded(details) {
  return new YunjinError(ERROR_CODES.QUOTA_EXCEEDED, '已达到当前额度。', { status: 429, details });
}

export function dependencyMissing(name) {
  return new YunjinError(ERROR_CODES.DEPENDENCY_MISSING, '缺少可选依赖：' + name, { status: 503 });
}

export function networkBlocked(message, details) {
  return new YunjinError(ERROR_CODES.NETWORK_BLOCKED, message, { status: 400, details });
}

export function networkTimeout(url, details) {
  return new YunjinError(ERROR_CODES.NETWORK_TIMEOUT, '外部服务请求超时。', { status: 504, retryable: true, details: { url, ...details } });
}

export function networkResponse(message, details) {
  return new YunjinError(ERROR_CODES.NETWORK_RESPONSE, message, { status: 502, retryable: true, details });
}

export function storageFailure(message, cause, details) {
  return new YunjinError(ERROR_CODES.STORAGE_FAILURE, message, { status: 500, cause, details, expose: false });
}

export function renderFailed(cause, details) {
  return new YunjinError(ERROR_CODES.RENDER_FAILED, '图片渲染不可用。', { status: 503, retryable: true, cause, details });
}

export function fileRejected(message, details) {
  return new YunjinError(ERROR_CODES.FILE_REJECTED, message, { status: 400, details });
}

export function confirmationRequired(token, details) {
  return new YunjinError(ERROR_CODES.CONFIRMATION_REQUIRED, '此操作需要二次确认。', { status: 409, details: { token, ...details } });
}

export function normalizeError(error, fallbackCode = ERROR_CODES.INTERNAL) {
  if (error instanceof YunjinError) return error;
  if (error?.name === 'AbortError') return networkTimeout(undefined, { cause: error.message });
  return new YunjinError(fallbackCode, error?.message || '未知错误。', { cause: error, expose: false });
}

export function publicErrorMessage(error) {
  const normalized = normalizeError(error);
  if (normalized.expose) return normalized.message;
  if (normalized.code === ERROR_CODES.NETWORK_TIMEOUT) return '外部服务响应超时，请稍后再试。';
  if (normalized.code === ERROR_CODES.NETWORK_RESPONSE) return '外部服务暂时不可用，请稍后再试。';
  return '操作失败，请稍后再试。';
}

export function assertCondition(condition, errorFactory) {
  if (condition) return;
  throw typeof errorFactory === 'function' ? errorFactory() : invalidInput(String(errorFactory || '参数不正确。'));
}

export async function errorBoundary(operation, options = {}) {
  try {
    return await operation();
  } catch (error) {
    const normalized = normalizeError(error, options.fallbackCode);
    if (typeof options.onError === 'function') await options.onError(normalized);
    if (options.rethrow) throw normalized;
    return { ok: false, error: normalized };
  }
}
