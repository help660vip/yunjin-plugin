import { validateUrl } from '../http/policy.js';
import { cleanText } from '../core/safe.js';

export function parseSafeUrl(value, options = {}) {
  const url = validateUrl(value, options);
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
    const url = validateUrl(value);
    const host = url.hostname.toLowerCase();
    if (host === 'b23.tv' || host.endsWith('.bilibili.com')) return 'bilibili';
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    if (host.includes('youtube.com') || host === 'youtu.be') return 'video';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'social';
    return 'web';
  } catch {
    return 'invalid';
  }
}

export function redactUrl(value) {
  try {
    const url = validateUrl(value);
    for (const key of [...url.searchParams.keys()]) if (/token|secret|key|auth|sign/iu.test(key)) url.searchParams.set(key, '[redacted]');
    return url.href;
  } catch {
    return '';
  }
}

export function queryValue(value, key, fallback = '') {
  try {
    const url = validateUrl(value);
    return cleanText(url.searchParams.get(key) || fallback, { max: 500 });
  } catch {
    return fallback;
  }
}

export function stripTracking(value) {
  try {
    const url = validateUrl(value);
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^ref$|^spm$/iu.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return '';
  }
}
