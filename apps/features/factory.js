import plugin from '../../lib/runtime/plugin-base.js';
import { getRuntime } from '../../lib/bootstrap.js';
import { canUseFeature } from '../../lib/auth/policy.js';
import { normalizeEvent } from '../../lib/runtime/event.js';
import { replyText } from '../../lib/runtime/reply.js';
import { executeFeature, scanFeature } from '../../lib/features/service.js';
import { parseCommandArguments } from '../../lib/parser/command.js';
import { publicErrorMessage, normalizeError } from '../../lib/core/errors.js';

const prefix = '#云锦';

function escape(value) {
  return String(value).split('').map((char) => '.^$*+?()[]{}|\\'.includes(char) ? '\\' + char : char).join('');
}

function ruleFor(manifest) {
  return '^' + escape(prefix) + '\\s*' + escape(manifest.command) + '(?:\\s+.*)?$';
}

function permissionFor(manifest) {
  if (manifest.access === 'master') return 'master';
  if (manifest.access === 'admin') return 'admin';
  return 'all';
}

function reply(instance, event, message) {
  return replyText(event, String(message), (value) => instance.reply?.(value));
}

export function createFeaturePlugin(manifest) {
  return class YunJinFeaturePlugin extends plugin {
    constructor() {
      super({
        name: 'YunJin-' + manifest.id + '-' + manifest.slug,
        dsc: '#云锦' + manifest.command,
        event: 'message',
        priority: 50,
        rule: [
          { reg: ruleFor(manifest), fnc: 'handle', permission: permissionFor(manifest) },
          ...(manifest.id === '15' || manifest.id === '16' || manifest.id === '41' ? [{ reg: '^[\\s\\S]+$', fnc: 'scan', permission: 'all' }] : [])
        ]
      });
    }

    async handle() {
      const event = normalizeEvent(this.e);
      const runtime = getRuntime();
      await runtime.start();
      try {
        runtime.core.commandLimit(event, manifest.id);
        if (!runtime.registry.isEnabled(manifest.id, event)) return reply(this, event, '#云锦' + manifest.command + ' 当前已禁用。');
        if (!canUseFeature(event, manifest)) return reply(this, event, '权限不足：此命令需要 ' + permissionFor(manifest) + ' 权限。');
        const parsed = parseCommandArguments(event.message, manifest, { prefix });
        const result = await executeFeature(manifest, event, parsed.args, runtime);
        await runtime.audit.record({ action: 'command.execute', featureId: manifest.id, userId: event.userId, groupId: event.groupId, command: manifest.command });
        return reply(this, event, typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      } catch (error) {
        const normalized = normalizeError(error, 'YUNJIN_COMMAND_FAILED');
        await runtime.audit.record({ action: 'command.error', featureId: manifest.id, userId: event.userId, groupId: event.groupId, code: normalized.code });
        return reply(this, event, publicErrorMessage(normalized));
      }
    }

    async scan() {
      const event = normalizeEvent(this.e);
      const runtime = getRuntime();
      await runtime.start();
      try {
        runtime.core.commandLimit(event, manifest.id, 0.25);
        if (!runtime.registry.isEnabled(manifest.id, event)) return false;
        return scanFeature(manifest, event, runtime);
      } catch (error) {
        await runtime.audit.record({ action: 'scan.error', featureId: manifest.id, code: normalizeError(error).code });
        return false;
      }
    }
  };
}
