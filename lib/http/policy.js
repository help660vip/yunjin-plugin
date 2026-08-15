import dns from 'node:dns/promises';
import net from 'node:net';
import { networkBlocked, invalidInput } from '../core/errors.js';

const PRIVATE_V4 = [
  [/^10\./, 'private'],
  [/^127\./, 'loopback'],
  [/^169\.254\./, 'link-local'],
  [/^172\.(1[6-9]|2\d|3[0-1])\./, 'private'],
  [/^192\.168\./, 'private'],
  [/^0\./, 'unspecified']
];

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/u, '');
}

export function isPrivateAddress(value) {
  const address = normalizeHost(value);
  if (net.isIPv4(address)) return PRIVATE_V4.some(([pattern]) => pattern.test(address));
  if (net.isIPv6(address)) {
    const compact = address.toLowerCase();
    return compact === '::1' || compact === '::' || compact.startsWith('fc') || compact.startsWith('fd') || compact.startsWith('fe8') || compact.startsWith('fe9') || compact.startsWith('fea') || compact.startsWith('feb');
  }
  return false;
}

export function hostAllowed(host, allowlist = []) {
  if (!allowlist?.length) return true;
  const value = normalizeHost(host);
  return allowlist.some((entry) => {
    const rule = normalizeHost(entry);
    return value === rule || value.endsWith('.' + rule);
  });
}

export function validateUrl(value, options = {}) {
  let url;
  try { url = value instanceof URL ? new URL(value.href) : new URL(String(value)); } catch { throw invalidInput('URL 格式不正确。'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw networkBlocked('只允许 HTTP 或 HTTPS URL。', { protocol: url.protocol });
  const hostname = normalizeHost(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw networkBlocked('本地地址不允许被外部请求。', { hostname });
  if (!hostAllowed(hostname, options.hosts || options.allowlist || [])) throw networkBlocked('目标主机不在允许列表中。', { hostname });
  if (!options.allowPrivate && isPrivateAddress(hostname)) throw networkBlocked('私网或环回地址不允许被请求。', { hostname });
  if (url.username || url.password) throw networkBlocked('URL 不允许携带账号密码。');
  url.hash = '';
  return url;
}

export async function resolveAndValidate(url, options = {}) {
  const validated = validateUrl(url, options);
  if (net.isIP(validated.hostname)) return validated;
  let records;
  try {
    records = await dns.lookup(validated.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw networkBlocked('目标主机无法解析。', { hostname: validated.hostname, cause: error.message });
  }
  if (!records.length) throw networkBlocked('目标主机没有可用地址。', { hostname: validated.hostname });
  if (!options.allowPrivate && records.some((record) => isPrivateAddress(record.address))) {
    throw networkBlocked('目标主机解析到了私网地址。', { hostname: validated.hostname });
  }
  return validated;
}

export function validateResponse(response, options = {}) {
  const maxBytes = Number(options.maxBytes || 1024 * 1024);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw networkBlocked('响应体超过大小限制。', { length, maxBytes });
  if (options.mime) {
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const allowed = Array.isArray(options.mime) ? options.mime : [options.mime];
    if (contentType && !allowed.some((value) => contentType === value || contentType.startsWith(String(value).replace('*', '')))) {
      throw networkBlocked('响应 MIME 类型不受支持。', { contentType });
    }
  }
  return response;
}

export function redirectAllowed(from, target, options = {}) {
  const previous = validateUrl(from, options);
  const next = validateUrl(target, options);
  if (options.sameOrigin && previous.origin !== next.origin) throw networkBlocked('不允许跨站重定向。');
  return next;
}
