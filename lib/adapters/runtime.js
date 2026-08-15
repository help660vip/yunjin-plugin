import { detectCapabilities } from '../message/adapter.js';
import { normalizeId } from '../core/ids.js';

export class RuntimeCapabilities {
  constructor(event = {}, runtime = {}) {
    this.event = event;
    this.runtime = runtime;
    this.bot = event.bot || event.raw?.bot || runtime.bot || null;
    this.render = typeof event.runtime?.render === 'function' || typeof event.raw?.runtime?.render === 'function' || typeof runtime.renderer === 'function';
    this.message = detectCapabilities(event, this.bot);
    this.host = {
      plugin: typeof globalThis.plugin === 'function',
      segment: typeof globalThis.segment === 'object' || typeof globalThis.segment === 'function',
      fetch: typeof globalThis.fetch === 'function',
      structuredClone: typeof globalThis.structuredClone === 'function'
    };
  }

  has(name) {
    return Boolean(this.message[name] || this.host[name] || this[name]);
  }

  require(names) {
    const list = Array.isArray(names) ? names : [names];
    return list.every((name) => this.has(name));
  }

  missing(names) {
    const list = Array.isArray(names) ? names : [names];
    return list.filter((name) => !this.has(name));
  }

  snapshot() {
    return {
      botId: normalizeId(this.event.botId || this.event.selfId, 'default'),
      render: this.render,
      message: { ...this.message },
      host: { ...this.host }
    };
  }
}

export function runtimeCapabilities(event, runtime) {
  return new RuntimeCapabilities(event, runtime);
}
