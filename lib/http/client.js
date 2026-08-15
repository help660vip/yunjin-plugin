import { resolveAndValidate, validateResponse, redirectAllowed, validateUrl } from './policy.js';
import { withRetry } from './retry.js';
import { HttpCache } from './cache.js';
import { networkResponse, networkTimeout, normalizeError } from '../core/errors.js';

const defaultCache = new HttpCache({ defaultTtlMs: 30000, maxEntries: 1000 });

function timeoutSignal(timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => controller.abort(signal.reason || new Error('aborted'));
  signal?.addEventListener('abort', onAbort, { once: true });
  return { signal: controller.signal, close: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } };
}

export function safeUrl(value, options = {}) {
  return validateUrl(value, options);
}

async function request(url, options = {}) {
  const target = await resolveAndValidate(url, options);
  const timeoutMs = Math.max(100, Number(options.timeoutMs || 8000));
  const timed = timeoutSignal(timeoutMs, options.signal);
  try {
    const response = await fetch(target, {
      method: options.method || 'GET',
      headers: { accept: options.accept || '*/*', ...(options.headers || {}) },
      body: options.body,
      signal: timed.signal,
      redirect: 'manual'
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (!options.followRedirects) throw networkResponse('外部服务重定向被拒绝。', { status: response.status });
      const count = Number(options.redirectCount || 0);
      if (count >= Number(options.maxRedirects || 3)) throw networkResponse('外部服务重定向次数过多。');
      const next = redirectAllowed(target, new URL(response.headers.get('location'), target), options);
      return request(next, { ...options, redirectCount: count + 1 });
    }
    validateResponse(response, options);
    if (!response.ok) throw networkResponse('外部服务返回错误状态。', { status: response.status });
    return response;
  } catch (error) {
    if (error?.name === 'AbortError' || error?.message === 'timeout') throw networkTimeout(target.href);
    throw normalizeError(error);
  } finally {
    timed.close();
  }
}

export async function fetchText(url, options = {}) {
  const target = await resolveAndValidate(url, options);
  const cache = options.cache === false ? null : options.cacheStore || defaultCache;
  const cacheOptions = { method: options.method || 'GET', ttlMs: options.cacheTtlMs || 30000, staleMs: options.cacheStaleMs || 0, tags: options.cacheTags };
  const cached = cache?.get(target.href, { ...cacheOptions, allowStale: options.allowStale });
  if (cached !== undefined) return String(cached);
  const response = await withRetry(() => request(target, { ...options, mime: options.mime || ['text/plain', 'text/html', 'application/json', 'application/rss+xml', 'application/xml', 'text/xml'] }), { attempts: options.attempts || 2, baseMs: options.retryBaseMs || 150, maxMs: options.retryMaxMs || 1200, signal: options.signal });
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > Number(options.maxBytes || 1024 * 1024)) throw networkResponse('响应体超过大小限制。');
  cache?.set(target.href, text, cacheOptions);
  return text;
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, { ...options, accept: 'application/json', mime: options.mime || ['application/json', 'text/plain'] });
  try { return JSON.parse(text); } catch (error) { throw networkResponse('外部服务返回了无效 JSON。', { cause: error.message }); }
}

export async function fetchBuffer(url, options = {}) {
  const target = await resolveAndValidate(url, options);
  const response = await withRetry(() => request(target, { ...options, mime: options.mime }), { attempts: options.attempts || 2, baseMs: options.retryBaseMs || 150, signal: options.signal });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > Number(options.maxBytes || 8 * 1024 * 1024)) throw networkResponse('文件响应超过大小限制。');
  return { buffer, contentType: response.headers.get('content-type') || 'application/octet-stream', url: target.href };
}
