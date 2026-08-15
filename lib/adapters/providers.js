import { fetchJson, fetchText } from '../http/client.js';
import { validateUrl } from '../http/policy.js';
import { cleanText } from '../core/safe.js';
import { publicErrorMessage } from '../core/errors.js';

function scalar(value, fallback = '', max = 100) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'boolean') return fallback;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return text || fallback;
}

function providerKey(value) {
  const key = scalar(value, '', 80).toLowerCase();
  return /^[a-z0-9][a-z0-9._-]*$/u.test(key) ? key : '';
}

function booleanOption(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'on', 'yes'].includes(String(value).trim().toLowerCase());
}

function safeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    const safeKey = scalar(key, '', 80);
    if (!safeKey) continue;
    if (typeof item === 'string' || typeof item === 'boolean') result[safeKey] = scalar(item, '', 200);
    else if (typeof item === 'number' && Number.isFinite(item)) result[safeKey] = item;
  }
  return result;
}


const PROVIDER_MESSAGES = Object.freeze({
  invalidName: String.fromCodePoint(25552, 20379, 26041, 21517, 31216, 26080, 25928),
  notCallable: String.fromCodePoint(25552, 20379, 26041, 24517, 39035, 21487, 35843, 29992),
  operationMissing: String.fromCodePoint(25552, 20379, 26041, 25805, 20316, 19981, 21487, 29992),
  unavailable: String.fromCodePoint(25552, 20379, 26041, 26242, 26102, 19981, 21487, 29992),
  fallback: String.fromCodePoint(25552, 20379, 26041, 26242, 26102, 19981, 21487, 29992, 65292, 35831, 31245, 21518, 20877, 35797, 12290),
  failed: String.fromCodePoint(25552, 20379, 26041, 25191, 34892, 22833, 36133),
  queried: String.fromCodePoint(25552, 20379, 26041, 26597, 35810, 22833, 36133)
});

export class ProviderContext {
  constructor(options = {}) {
    this.runtime = options.runtime;
    this.event = options.event;
    this.featureId = scalar(options.featureId, 'shared', 80);
    this.cache = options.cache;
    this.logger = options.logger;
    this.config = options.config;
  }

  async json(url, options = {}) {
    this.runtime?.core?.networkLimit(this.event, this.featureId);
    return fetchJson(url, options);
  }

  async text(url, options = {}) {
    this.runtime?.core?.networkLimit(this.event, this.featureId);
    return fetchText(url, options);
  }

  async safe(url, options = {}) {
    const source = scalar(options.source, 'provider', 80);
    try {
      if (typeof options.operation !== 'function') throw new TypeError(PROVIDER_MESSAGES.operationMissing);
      const value = await options.operation();
      return { ok: true, value, source, cached: false };
    } catch (error) {
      const message = publicErrorMessage(error, PROVIDER_MESSAGES.fallback);
      this.logger?.warn?.(PROVIDER_MESSAGES.failed, { featureId: this.featureId, provider: source, message });
      if (options.fallback !== undefined) return { ok: true, value: options.fallback, source: 'fallback', cached: true, error: message };
      return { ok: false, error: message, source };
    }
  }
}

export class ProviderRegistry {
  constructor(options = {}) {
    this.providers = new Map();
    this.config = options.config;
    this.logger = options.logger;
  }

  register(name, provider, options = {}) {
    const key = providerKey(name);
    if (!key) throw new TypeError(PROVIDER_MESSAGES.invalidName);
    if (typeof provider !== 'function' && typeof provider?.query !== 'function') throw new TypeError(PROVIDER_MESSAGES.notCallable);
    this.providers.set(key, { name: key, provider, enabled: booleanOption(options.enabled, true), metadata: safeMetadata(options.metadata) });
    return this;
  }

  remove(name) {
    const key = providerKey(name);
    return Boolean(key) && this.providers.delete(key);
  }

  has(name) {
    const key = providerKey(name);
    return Boolean(key) && this.providers.get(key)?.enabled === true;
  }

  names() {
    return [...this.providers.values()].filter((item) => item.enabled).map((item) => item.name).sort();
  }

  async query(name, context, input, options = {}) {
    const key = providerKey(name);
    const entry = key ? this.providers.get(key) : null;
    if (!entry || !entry.enabled) return { ok: false, error: '\u63d0\u4f9b\u65b9\u4e0d\u53ef\u7528\u3002', provider: key || 'unknown' };
    try {
      const operation = typeof entry.provider === 'function' ? entry.provider : entry.provider.query.bind(entry.provider);
      const value = await operation(input, context, options);
      return { ok: true, value, provider: entry.name };
    } catch (error) {
      this.logger?.warn?.(PROVIDER_MESSAGES.queried, { provider: entry.name, message: publicErrorMessage(error) });
      return { ok: false, error: publicErrorMessage(error, '\u63d0\u4f9b\u65b9\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002'), provider: entry.name };
    }
  }

  describe() {
    return [...this.providers.values()].sort((left, right) => left.name.localeCompare(right.name)).map((item) => ({ name: item.name, enabled: item.enabled, metadata: { ...item.metadata } }));
  }
}

export function createDefaultProviders(options = {}) {
  const registry = new ProviderRegistry(options);
  registry.register('weather.open-meteo', async (input, context) => {
    const city = cleanText(input.city || input.query, { max: 80 });
    if (!city) return { error: 'city required' };
    const geo = await context.json('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh&format=json', { hosts: ['open-meteo.com'], timeoutMs: 5000, attempts: 2, cacheTtlMs: 300000, cacheStaleMs: 600000 });
    const place = geo.results?.[0];
    if (!place) return { error: 'city not found' };
    const weather = await context.json('https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude + '&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FShanghai', { hosts: ['open-meteo.com'], timeoutMs: 5000, attempts: 2, cacheTtlMs: 60000, cacheStaleMs: 300000 });
    return { place, current: weather.current || {} };
  }, { metadata: { protocol: 'https', auth: 'none', cache: true } });
  registry.register('wiki.zh', async (input, context) => {
    const query = cleanText(input.query, { max: 100 });
    const data = await context.json('https://zh.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query), { hosts: ['wikipedia.org'], timeoutMs: 5000, attempts: 2, cacheTtlMs: 300000, cacheStaleMs: 600000 });
    return { title: data.title || query, extract: data.extract || '', url: data.content_urls?.desktop?.page || '' };
  }, { metadata: { protocol: 'https', auth: 'none', cache: true } });
  registry.register('exchange.frankfurter', async (input, context) => {
    const amount = Number(input.amount);
    const from = String(input.from || 'CNY').toUpperCase();
    const to = String(input.to || 'USD').toUpperCase();
    if (!Number.isFinite(amount) || !/^[A-Z]{3}$/u.test(from) || !/^[A-Z]{3}$/u.test(to)) return { error: 'invalid currency input' };
    return context.json('https://api.frankfurter.app/latest?amount=' + amount + '&from=' + from + '&to=' + to, { hosts: ['frankfurter.app'], timeoutMs: 5000, attempts: 2, cacheTtlMs: 300000, cacheStaleMs: 600000 });
  }, { metadata: { protocol: 'https', auth: 'none', cache: true } });
  registry.register('rss.generic', async (input, context) => {
    const url = validateUrl(input.url);
    const raw = await context.text(url.href, { maxBytes: 256 * 1024, timeoutMs: 5000, attempts: 2, cacheTtlMs: 60000, cacheStaleMs: 300000 });
    const titles = [...String(raw).matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/giu)].map((match) => cleanText(match[1].replace(/<!\[CDATA\[|\]\]>/gu, '').replace(/<[^>]+>/gu, ''), { max: 500 })).filter(Boolean).slice(0, 20);
    return { url: url.href, titles };
  }, { metadata: { protocol: 'https', auth: 'none', cache: true } });
  registry.register('translation.local', async (input) => {
    const text = cleanText(input.text, { max: 2000 });
    const dictionary = { hello: '你好', world: '世界', thanks: '谢谢', 你好: 'hello' };
    return { text, translation: dictionary[text.toLowerCase()] || text, fallback: !dictionary[text.toLowerCase()] };
  }, { metadata: { protocol: 'local', auth: 'none', cache: false } });
  return registry;
}

export function providerContext(options) {
  return new ProviderContext(options);
}
