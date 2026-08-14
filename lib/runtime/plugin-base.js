import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadHostPlugin() {
  if (typeof globalThis.plugin === 'function') return globalThis.plugin;
  try {
    const host = require(`${process.cwd()}/lib/plugins/plugin.js`);
    return host.default ?? host;
  } catch {
    return class PluginFallback {
      constructor(metadata = {}) {
        Object.assign(this, metadata);
      }

      async reply(message) {
        return message;
      }
    };
  }
}

const plugin = loadHostPlugin();
export default plugin;
