import plugin from '../../lib/runtime/plugin-base.js';
import { getRuntime } from '../../lib/bootstrap.js';
import { canUseFeature } from '../../lib/auth/policy.js';
import { normalizeEvent } from '../../lib/runtime/event.js';
import { replyText } from '../../lib/runtime/reply.js';
import { executeFeature, scanFeature } from '../../lib/features/service.js';

const prefix = '#\u4e91\u9526';
const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function splitArgs(value) { const result = []; let current = ''; let quote = ''; for (const char of String(value || '')) { if (quote) { if (char === quote) quote = ''; else current += char; } else if (char === '"' || char === "'") quote = char; else if (/\s/u.test(char)) { if (current) { result.push(current); current = ''; } } else current += char; } if (current) result.push(current); return result; }
function commandArgs(event, manifest) { const message = String(event.message || '').trim(); const rest = message.slice(prefix.length).trim(); if (!rest.startsWith(manifest.command)) return []; return splitArgs(rest.slice(manifest.command.length).trim()); }
function ruleFor(manifest) { return `^${escape(prefix)}\\s*${escape(manifest.command)}(?:\\s+.*)?$`; }

export function createFeaturePlugin(manifest) {
  return class YunJinFeaturePlugin extends plugin {
    constructor() {
      super({ name: `YunJin-${manifest.id}-${manifest.slug}`, dsc: `#${manifest.command}`, event: 'message', priority: 50, rule: [{ reg: ruleFor(manifest), fnc: 'handle' }, ...(manifest.id === '15' || manifest.id === '16' || manifest.id === '41' ? [{ reg: '^[\\s\\S]+$', fnc: 'scan' }] : [])] });
    }
    async handle() {
      const event = normalizeEvent(this.e);
      const runtime = getRuntime();
      await runtime.start();
      if (!runtime.registry.isEnabled(manifest.id, event)) return replyText(event, `#${manifest.command} \u5f53\u524d\u5df2\u7981\u7528\u3002`, (message) => this.reply?.(message));
      if (!canUseFeature(event, manifest)) return replyText(event, '\u6743\u9650\u4e0d\u8db3\uff1a\u8bf7\u4f7f\u7528 Yunzai OP \u6216\u7fa4\u7ba1\u7406\u5458\u8eab\u4efd\u3002', (message) => this.reply?.(message));
      const args = commandArgs(event, manifest);
      const result = await executeFeature(manifest, event, args, runtime);
      await runtime.audit.record({ action: 'command.execute', featureId: manifest.id, userId: event.userId, groupId: event.groupId, command: manifest.command });
      return replyText(event, typeof result === 'string' ? result : JSON.stringify(result, null, 2), (message) => this.reply?.(message));
    }
    async scan() {
      const event = normalizeEvent(this.e);
      const runtime = getRuntime();
      await runtime.start();
      if (!runtime.registry.isEnabled(manifest.id, event)) return false;
      return scanFeature(manifest, event, runtime);
    }
  };
}
