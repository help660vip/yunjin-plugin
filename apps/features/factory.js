import plugin from '../../lib/runtime/plugin-base.js';
import { getRuntime } from '../../lib/bootstrap.js';
import { canUseFeature } from '../../lib/auth/policy.js';
import { normalizeEvent } from '../../lib/runtime/event.js';
import { replyText, replySegments } from '../../lib/runtime/reply.js';
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

function isSegment(value) {
  return Boolean(value && typeof value === 'object' && ['text', 'image', 'at', 'mention', 'reply', 'video', 'audio', 'file'].includes(String(value.type || value.kind || '').toLowerCase()));
}

function reply(instance, event, message) {
  if (Array.isArray(message) && message.some(isSegment)) return replySegments(event, message, (value) => instance.reply?.(value));
  if (isSegment(message)) return replySegments(event, [message], (value) => instance.reply?.(value));
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
          ...(['12', '15', '16', '41'].includes(manifest.id) ? [{ reg: '^[\\s\\S]+$', fnc: 'scan', permission: 'all' }] : [])
        ]
      });
    }

    async handle() {
      const event = normalizeEvent(this.e);
      const runtime = getRuntime();
      try {
        await runtime.start();
        runtime.core.commandLimit(event, manifest.id);
        if (!runtime.registry.isEnabled(manifest.id, event)) return reply(this, event, '#云锦' + manifest.command + ' 当前已禁用。');
        if (!canUseFeature(event, manifest)) return reply(this, event, '权限不足：此命令需要 ' + permissionFor(manifest) + ' 权限。');
        const parsed = parseCommandArguments(event.message, manifest, { prefix });
        const result = await executeFeature(manifest, event, parsed.args, runtime);
        await runtime.audit.record({ action: 'command.execute', featureId: manifest.id, userId: event.userId, groupId: event.groupId, command: manifest.command });
        const message = isSegment(result) || (Array.isArray(result) && result.some(isSegment))
          ? result
          : (typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        return reply(this, event, message);
      } catch (error) {
        const normalized = normalizeError(error, 'YUNJIN_COMMAND_FAILED');
        try {
          await runtime.audit.record({ action: 'command.error', featureId: manifest.id, userId: event.userId, groupId: event.groupId, code: normalized.code });
        } catch {
          // Auditing must not turn a user-facing fallback into an unhandled rejection.
        }
        return reply(this, event, publicErrorMessage(normalized));
      }
    }

    async scan() {
      const event = normalizeEvent(this.e);
      const runtime = getRuntime();
      try {
        await runtime.start();
        runtime.core.commandLimit(event, manifest.id, manifest.id === '12' ? 0.01 : 0.25);
        const enabled = runtime.registry.isEnabled(manifest.id, event);
        const telemetryEnabled = manifest.id === '12' && ['43', '47', '48'].some((id) => runtime.registry.isEnabled(id, event));
        if (!enabled && !telemetryEnabled) return false;
        return scanFeature(manifest, event, runtime);
      } catch (error) {
        try {
          await runtime.audit.record({ action: 'scan.error', featureId: manifest.id, code: normalizeError(error).code });
        } catch {
          // Keep passive scanners fail-closed when persistence is unavailable.
        }
        return false;
      }
    }
  };
}

export function createRequestPlugin(manifest) {
  return class YunJinRequestPlugin extends plugin {
    constructor() {
      super({
        name: 'YunJin-' + manifest.id + '-' + manifest.slug + '-request',
        dsc: '#\u4e91\u9526' + manifest.command + ' request',
        event: 'request',
        priority: 40,
        rule: [{ reg: '^[\\s\\S]*$', fnc: 'handleRequest', permission: 'all' }]
      });
    }

    async handleRequest() {
      const event = { ...normalizeEvent(this.e), type: 'request', postType: 'request' };
      const runtime = getRuntime();
      try {
        await runtime.start();
        return await handleRequestEvent(manifest, event, runtime);
      } catch (error) {
        try {
          await runtime.audit.record({
            action: 'request.error',
            featureId: manifest.id,
            userId: event.userId,
            groupId: event.groupId,
            code: normalizeError(error).code
          });
        } catch {
          // Request events must fail closed when storage or the bot adapter is unavailable.
        }
        return false;
      }
    }
  };
}
