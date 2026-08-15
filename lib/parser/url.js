import { validateUrl } from '../http/policy.js';
import { cleanText } from '../core/safe.js';

const MAX_URL_LENGTH = 4096;

function safeValidate(value, options = {}) {
  const raw = String(value ?? '');
  if (!raw || raw.length > MAX_URL_LENGTH || /[\u0000-\u001F\u007F]/u.test(raw)) throw new TypeError('\u94fe\u63a5\u8f93\u5165\u65e0\u6548');
  const text = raw.trim();
  if (!text) throw new TypeError('\u94fe\u63a5\u8f93\u5165\u65e0\u6548');
  const url = validateUrl(text, options);
  if (url.username || url.password) throw new TypeError('链接不允许包含账号凭据');
  return url;
}

function isDomain(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function sensitiveKey(key) {
  const normalized = String(key).toLowerCase().replace(/[-_]/gu, '');
  return ['token', 'secret', 'key', 'auth', 'sign', 'signature', 'password', 'apikey', 'accesstoken', 'refreshtoken'].includes(normalized);
}

export function parseSafeUrl(value, options = {}) {
  const url = safeValidate(value, options);
  return {
    href: url.href,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || '',
    pathname: url.pathname,
    search: url.search,
    query: Object.fromEntries(url.searchParams.entries())
  };
}

export function classifyUrl(value) {
  try {
    const host = safeValidate(value).hostname.toLowerCase();
    if (host === 'b23.tv' || isDomain(host, 'bilibili.com')) return 'bilibili';
    if (host === 'github.com' || isDomain(host, 'github.com')) return 'github';
    if (isDomain(host, 'youtube.com') || host === 'youtu.be') return 'video';
    if (isDomain(host, 'twitter.com') || isDomain(host, 'x.com')) return 'social';
    return 'web';
  } catch {
    return 'invalid';
  }
}

export function redactUrl(value) {
  try {
    const url = safeValidate(value);
    for (const key of [...url.searchParams.keys()]) if (sensitiveKey(key)) url.searchParams.set(key, '[已隐藏]');
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

export function queryValue(value, key, fallback = '') {
  try {
    const url = safeValidate(value);
    return cleanText(url.searchParams.get(String(key)) || fallback, { max: 500 });
  } catch {
    return fallback;
  }
}

export function stripTracking(value) {
  try {
    const url = safeValidate(value);
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^ref$|^spm$/iu.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return '';
  }
}
