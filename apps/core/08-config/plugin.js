import plugin from '../../../lib/runtime/plugin-base.js';
import { getRuntime } from '../../../lib/bootstrap.js';
import { normalizeEvent } from '../../../lib/runtime/event.js';
import { canReadConfig, canWriteConfig } from '../../../lib/auth/policy.js';
import { renderConfigHelp, renderConfigResult } from '../../../lib/renderer/text.js';

export default class YunJinConfigPlugin extends plugin {
  constructor() {
    super({
      name: 'YunJin配置中心',
      dsc: '管理云锦的全局、群组和用户配置',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^#云锦(?:帮助|(?:\\s+配置)?(?:\\s+(?:查看|获取|设置|重载|校验|help|帮助))?(?:\\s+.*)?)$',
          fnc: 'configCommand'
        }
      ]
    });
  }

  async configCommand() {
    const event = normalizeEvent(this.e);
    const runtime = getRuntime();
    await runtime.start();
    const reply = (message) => this.e?.reply?.(message) ?? this.reply?.(message) ?? message;

    if (!canReadConfig(event)) {
      return reply('云锦配置：无法识别当前用户身份。');
    }

    const parsed = parseCommand(event.message);
    if (!parsed || parsed.action === 'help') {
      return reply(renderConfigHelp());
    }

    if (parsed.action === 'invalid') {
      return reply('云锦配置：值必须是合法 JSON，或命令参数不完整。');
    }

    if (parsed.action === 'view') {
      const result = await runtime.config.describeEffective(currentScope(event));
      return reply(renderConfigResult(result));
    }

    if (parsed.action === 'get') {
      const result = await runtime.config.getEffectiveValue(scopeForEvent(parsed.scope, event), parsed.key);
      return reply(renderConfigResult(result));
    }

    if (!canWriteConfig(event, parsed.scope)) {
      return reply('云锦配置：当前身份没有修改该作用域的权限。');
    }

    if (parsed.action === 'set') {
      const result = await runtime.config.set(scopeForEvent(parsed.scope, event), parsed.key, parsed.value);
      return reply(renderConfigResult(result));
    }

    if (parsed.action === 'reload') {
      const result = await runtime.config.reload();
      return reply(renderConfigResult(result));
    }

    if (parsed.action === 'validate') {
      const result = await runtime.config.validate();
      return reply(renderConfigResult(result));
    }

    return reply(renderConfigHelp());
  }
}

function parseCommand(message) {
  const text = String(message ?? '').trim();
  if (text === '#云锦帮助') return { action: 'help' };
  const match = text.match(/^#云锦(?:\s+配置)?(?:\s+(.*))?$/u);
  if (!match || !match[1]) return { action: 'help' };

  const tokens = splitArguments(match[1]);
  const action = normalizeAction(tokens.shift());
  if (action === 'view' || action === 'reload' || action === 'validate' || action === 'help') {
    return { action };
  }

  const scope = normalizeScope(tokens.shift());
  if (!scope) return { action: 'help' };
  const key = tokens.shift();
  if (action === 'get' && key) return { action, scope, key };
  if (action === 'set' && key && tokens.length) {
    const rawValue = tokens.join(' ');
    try {
      return { action, scope, key, value: JSON.parse(rawValue) };
    } catch {
      return { action: 'invalid' };
    }
  }
  return { action: 'help' };
}

function splitArguments(value) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (const character of value) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/u.test(character)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function normalizeAction(value) {
  return ({ 查看: 'view', 获取: 'get', 设置: 'set', 重载: 'reload', 校验: 'validate', help: 'help', 帮助: 'help' })[value] ?? 'help';
}

function normalizeScope(value) {
  return ({ 全局: 'global', global: 'global', 群: 'group', group: 'group', 用户: 'user', user: 'user' })[value];
}

function currentScope(event) {
  return event.groupId ? { name: 'group', id: event.groupId } : { name: 'user', id: event.userId };
}

function scopeForEvent(name, event) {
  if (name === 'group') return { name, id: event.groupId };
  if (name === 'user') return { name, id: event.userId };
  return { name: 'global' };
}
