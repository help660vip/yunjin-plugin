import { randomUUID } from 'node:crypto';
import { featureStore } from '../store.js';
import { contractFor } from '../contracts.js';
import { commandUsage, paginate } from '../../parser/command.js';
import { cleanText, limitArray, parseBoolean, parseNumber } from '../../core/safe.js';
import { normalizeId, normalizeUserId, normalizeGroupId, normalizeBotId, stableId } from '../../core/ids.js';
import { FEATURE_LIMITS } from '../../core/constants.js';
import { invalidInput, publicErrorMessage } from '../../core/errors.js';

export function handlerContext(manifest, event, args, runtime, options = {}) {
  const id = String(manifest.id).padStart(2, '0');
  const contract = contractFor(id) || {};
  const command = String(args?.[0] || '').toLowerCase();
  const value = cleanText((args || []).slice(1).join(' '), { max: options.maxText || FEATURE_LIMITS.commandText });
  const store = featureStore(runtime, id, event, { level: options.level || (event?.groupId ? 'group' : 'user'), maxItems: options.maxItems });
  return {
    id,
    manifest,
    contract,
    event,
    args: args || [],
    command,
    value,
    runtime,
    store,
    userId: normalizeUserId(event),
    groupId: normalizeGroupId(event),
    botId: normalizeBotId(event),
    now: runtime.core.clock.now(),
    usage: (text) => commandUsage(manifest, text),
    newId: () => randomUUID(),
    stable: (...parts) => stableId([id, ...parts]),
    async audit(action, details = {}) {
      return runtime.audit.record({ action, featureId: id, userId: this.userId, groupId: this.groupId, botId: this.botId, ...details });
    },
    network() {
      return runtime.core.networkLimit(event, id);
    },
    render() {
      return runtime.core.renderLimit(event, id);
    },
    quota(name, count = 1) {
      return runtime.core.consumeQuota(event, name, count);
    },
    async records(field = 'items', page = 1, size = 20) {
      const values = await store.list(field);
      return paginate(values, page, size);
    },
    async add(item, field = 'items', options = {}) {
      return store.add({ id: item.id || randomUUID(), createdAt: item.createdAt || this.now, userId: item.userId || this.userId, groupId: item.groupId || this.groupId, botId: item.botId || this.botId, ...item }, field, options);
    },
    async update(mutator, fallback = {}) {
      return store.update(mutator, fallback);
    },
    async summary(title, rows = [], options = {}) {
      const text = [title, ...rows.map((row) => {
        if (typeof row === 'string') return row;
        return [row.label, row.value].filter(Boolean).join('：');
      })].filter(Boolean).join('\n');
      return options.viewModel ? { text, viewModel: options.viewModel } : text;
    }
  };
}

export function required(value, usage, message = '缺少必要参数。') {
  if (!String(value || '').trim()) throw invalidInput(message + ' 用法：' + usage);
  return String(value).trim();
}

export function actionIs(ctx, ...names) {
  return names.includes(ctx.command) || names.includes(String(ctx.args?.[0] || ''));
}

export function listMessage(ctx, values, options = {}) {
  const page = Number(ctx.args?.find((value) => /^\d+$/.test(value)) || 1);
  const result = paginate(limitArray(values, options.max || FEATURE_LIMITS.maxItemsPerScope), page, options.size || 20);
  if (!result.total) return ctx.manifest.name + '\n暂无记录。\n用法：' + ctx.usage(options.usage || '添加 <内容>');
  const lines = result.items.map((item, index) => {
    const value = item?.text || item?.value || item?.name || item?.url || item?.id || JSON.stringify(item);
    return (result.offset + index + 1) + '. ' + cleanText(value, { max: 500 });
  });
  const suffix = result.totalPages > 1 ? '\n第 ' + result.page + '/' + result.totalPages + ' 页' : '';
  return ctx.manifest.name + '\n' + lines.join('\n') + suffix;
}

export function parseScope(value, event) {
  const text = String(value || '').toLowerCase();
  if (text === 'bot') return { level: 'bot' };
  if (text === 'user' || text === 'me') return { level: 'user' };
  if (text === 'member') return { level: 'member' };
  return { level: event?.groupId ? 'group' : 'user' };
}

export function resultText(value) {
  if (typeof value === 'string') return value;
  if (value?.text) return value.text;
  try { return JSON.stringify(value, null, 2); } catch { return publicErrorMessage(new Error('unserializable')); }
}

export function dayKey(ctx) {
  return ctx.runtime.core.clock.dayKey(ctx.now, ctx.runtime.core.clock.timeZone);
}

export function parseLimit(value, fallback = 20, max = 100) {
  return parseNumber(value, { min: 1, max, fallback });
}

export function bool(value, fallback = false) {
  return parseBoolean(value, fallback);
}
