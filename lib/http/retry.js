import { systemClock } from '../core/clock.js';
import { normalizeError } from '../core/errors.js';

function retryable(error) {
  const code = normalizeError(error).code;
  return ['YUNJIN_NETWORK_TIMEOUT', 'YUNJIN_NETWORK_RESPONSE'].includes(code) || error?.name === 'TypeError';
}

export async function withRetry(operation, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 1));
  const baseMs = Math.max(0, Number(options.baseMs || 100));
  const maxMs = Math.max(baseMs, Number(options.maxMs || 2000));
  const clock = options.clock || systemClock;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || (typeof options.shouldRetry === 'function' ? !options.shouldRetry(error, attempt) : !retryable(error))) throw error;
      const jitter = Math.floor(Math.random() * Math.max(1, baseMs));
      await clock.sleep(Math.min(maxMs, baseMs * 2 ** (attempt - 1) + jitter), options.signal);
    }
  }
  throw lastError;
}

export function retryAfterMs(response, fallback = 0) {
  const value = response?.headers?.get?.('retry-after');
  if (!value) return fallback;
  if (/^\d+$/u.test(value)) return Number(value) * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed - Date.now()) : fallback;
}
