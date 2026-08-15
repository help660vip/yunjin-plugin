import { fetchJson, fetchText } from '../http/client.js';
import { validateUrl } from '../http/policy.js';
import { cleanText } from '../core/safe.js';
import { publicErrorMessage } from '../core/errors.js';

export class ProviderContext {
  constructor(options = {}) {
    this.runtime = options.runtime;
    this.event = options.event;
    this.featureId = String(options.featureId || 'shared');
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
    try {
      const value = await options.operation();
      return { ok: true, value, source: options.source || 'provider', cached: false };
    } catch (error) {
      this.logger?.warn?.('provider failed', { featureId: this.featureId, provider: options.source, message: publicErrorMessage(error) });
      if (options.fallback !== undefined) return { ok: true, value: options.fallback, source: 'fallback', cached: true, error: publicErrorMessage(error) };
      return { ok: false, error: publicErrorMessage(error), source: options.source || 'provider' };
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
    const key = String(name).toLowerCase();
    if (typeof provider !== 'function' && typeof provider?.query !== 'function') throw new TypeError('provider must be callable');
    this.providers.set(key, { name: key, provider, enabled: options.enabled !== false, metadata: { ...options.metadata } });
    return this;
  }

  remove(name) {
    return this.providers.delete(String(name).toLowerCase());
  }

  has(name) {
    return this.providers.get(String(name).toLowerCase())?.enabled === true;
  }

  names() {
    return [...this.providers.values()].filter((item) => item.enabled).map((item) => item.name);
  }

  async query(name, context, input, options = {}) {
    const entry = this.providers.get(String(name).toLowerCase());
    if (!entry || !entry.enabled) return { ok: false, error: 'provider unavailable', provider: String(name) };
    try {
      const operation = typeof entry.provider === 'function' ? entry.provider : entry.provider.query.bind(entry.provider);
      const value = await operation(input, context, options);
      return { ok: true, value, provider: entry.name };
    } catch (error) {
      this.logger?.warn?.('provider query failed', { provider: entry.name, message: error.message });
      return { ok: false, error: publicErrorMessage(error), provider: entry.name };
    }
  }

  describe() {
    return [...this.providers.values()].map((item) => ({ name: item.name, enabled: item.enabled, metadata: item.metadata }));
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
