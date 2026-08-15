import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fetchText } from '../../http/client.js';
import { validateUrl } from '../../http/policy.js';
import { canWriteConfig } from '../../auth/policy.js';
import { contractRows } from '../contracts.js';
import { parseDuration } from '../../parser/command.js';
import { formatUptime } from '../../core/format.js';
import { invalidInput, publicErrorMessage } from '../../core/errors.js';
import { handlerContext, required, actionIs, listMessage, dayKey, parseLimit } from './context.js';

function title(ctx) {
  return 'YunJin ' + ctx.id + ' ' + ctx.manifest.name;
}

function itemText(item) {
  return item?.text || item?.value || item?.name || item?.url || item?.id || JSON.stringify(item);
}

function listState(ctx, field = 'items', usage = '添加 <内容>') {
  return ctx.store.list(field).then((values) => listMessage(ctx, values, { usage }));
}

export async function handle01(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const memory = process.memoryUsage();
  const enabled = runtime.registry.list(event).filter((item) => item.enabled).length;
  return ctx.summary('YunJin 运行状态', [
    { label: '运行时间', value: formatUptime(process.uptime()) },
    { label: '内存', value: Math.round(memory.rss / 1024 / 1024) + ' MB' },
    { label: '已启用', value: enabled + '/50' },
    { label: 'Node', value: process.version },
    { label: '平台', value: os.platform() },
    { label: '作用域', value: ctx.botId + ' / ' + (ctx.groupId || 'private') }
  ]);
}

export async function handle02(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if ((action === '列表' || action === 'list' || action === '查看' || action === 'view') && args.length <= 1) return listState(ctx, 'items', '记录 <异常描述>');
  const value = action === '记录' || action === 'record' ? args.slice(1).join(' ') : ctx.value;
  const item = await ctx.add({ text: required(value, ctx.usage('记录 <异常描述>'), '请提供异常描述。'), type: 'error', fingerprint: ctx.stable(value) });
  await ctx.audit('error.report', { recordId: item.id });
  return '异常已记录：' + item.id;
}

export async function handle03(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  if (actionIs(ctx, '清理', 'clear')) {
    await ctx.store.clear();
    await ctx.audit('log.clear');
    return '当前作用域日志已清理。';
  }
  await ctx.audit('log.view');
  return listState(ctx, 'items', '清理');
}

export async function handle04(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (action === '开始' || action === 'start' || (!action && ctx.value)) {
    const name = required(ctx.value || args[0], ctx.usage('开始 <名称>'), '请提供事务名称。');
    const item = await ctx.add({ text: name, status: 'active', startedAt: ctx.now });
    await ctx.audit('transaction.start', { transactionId: item.id });
    return '事务已开始：' + item.id;
  }
  const transactionId = required(args[1] || args[0], ctx.usage('结束 <事务 ID>'), '请提供事务 ID。');
  const state = await ctx.store.read({ items: [] });
  const transaction = (state.items || []).find((item) => item.id === transactionId);
  if (!transaction) return '未找到事务：' + transactionId;
  transaction.status = action === '失败' || action === 'fail' ? 'failed' : 'done';
  transaction.finishedAt = ctx.now;
  transaction.durationMs = Math.max(0, transaction.finishedAt - transaction.startedAt);
  await ctx.update((next) => { next.items = state.items; return transaction; }, { items: [] });
  await ctx.audit('transaction.finish', { transactionId, status: transaction.status });
  return '事务已更新：' + transaction.id + ' ' + transaction.status + ' ' + transaction.durationMs + 'ms';
}

export async function handle05(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const state = await ctx.store.read({ items: [] });
  if (action === '添加' || action === 'add') {
    const url = required(args[1], ctx.usage('添加 <URL>'), '请提供 URL。');
    const target = validateUrl(url);
    const item = await ctx.add({ url: target.href, status: 'unknown', checks: 0 });
    await ctx.audit('monitor.add', { monitorId: item.id, host: target.hostname });
    return '监控已添加：' + item.id;
  }
  if (action === '检查' || action === 'check') {
    const id = args[1];
    const item = (state.items || []).find((entry) => entry.id === id) || state.items?.[0];
    if (!item) return ctx.usage('添加 <URL> | 检查 <ID>');
    ctx.network();
    const started = ctx.now;
    try {
      await fetchText(item.url, { maxBytes: 4096, timeoutMs: 3000, attempts: 1, cache: false });
      item.status = 'up';
      item.error = '';
    } catch (error) {
      item.status = 'down';
      item.error = publicErrorMessage(error);
    }
    item.latency = Math.max(0, runtime.core.clock.now() - started);
    item.checkedAt = runtime.core.clock.now();
    item.checks = Number(item.checks || 0) + 1;
    await ctx.update((next) => { next.items = state.items; return item; }, { items: [] });
    return item.url + '\n状态：' + item.status + '\n延迟：' + item.latency + 'ms';
  }
  return listMessage(ctx, state.items || [], { usage: '添加 <URL> | 检查 <ID>' });
}

export async function handle06(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (action === '列表' || action === 'list' || !args.length) {
    const tasks = (await runtime.scheduler.list()).filter((task) => task.featureId === ctx.id && task.groupId === ctx.groupId && task.userId === ctx.userId);
    return tasks.length ? title(ctx) + '\n' + tasks.map((task) => task.id + ' ' + task.status + ' ' + runtime.core.clock.format(task.runAt)).join('\n') : title(ctx) + '\n暂无任务。';
  }
  if (action === '取消' || action === 'cancel') return await runtime.scheduler.cancel(required(args[1], ctx.usage('取消 <任务 ID>'))) ? '任务已取消。' : '未找到任务。';
  const delay = parseDuration(args[0], { defaultUnit: 'm', maxMs: 30 * 86400000 });
  const content = required(args.slice(1).join(' '), ctx.usage('<时长> <提醒内容>'), '请提供提醒内容。');
  const task = await runtime.scheduler.create({ featureId: ctx.id, title: content, delayMs: delay, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { content, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
  await ctx.audit('task.create', { taskId: task.id });
  return '任务已创建：' + task.id;
}

export async function handle07(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const area = String(args[0] || '').toLowerCase();
  const rows = runtime.registry.list(event).filter((item) => !area || item.area === area).map((item) => '#云锦' + item.command + '  ' + item.name + ' [' + item.access + ']');
  if (!rows.length) return '暂无匹配能力。用法：#云锦帮助 [core|governance|feeds|tools|media|community]';
  return ['YunJin 帮助', '', ...rows].join('\n');
}

function normalizeConfigScope(value) {
  return ({ global: 'global', '全局': 'global', group: 'group', '群': 'group', user: 'user', '用户': 'user' })[String(value || 'global').trim().toLowerCase()] || '';
}

export async function handle08(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (!args.length || action === '查看' || action === 'view') return runtime.config.describeEffective(event);
  if (action === '重载' || action === 'reload') {
    await runtime.config.reload();
    await ctx.audit('config.reload');
    return '配置已重载。';
  }
  if (action === '校验' || action === 'validate') return runtime.config.validate();
  if (!['获取', 'get', '设置', 'set'].includes(action)) return ctx.usage('查看 | 获取 <全局|群|用户> ... | 设置 <全局|群|用户> ... | 重载 | 校验');
  const scopeName = normalizeConfigScope(args[1]);
  if (!scopeName) return '作用域必须是全局、群或用户。';
  const isGlobal = scopeName === 'global';
  const candidate = args[2];
  const knownKey = runtime.config.schemas?.has?.(candidate);
  const keyIndex = isGlobal ? 2 : knownKey ? 2 : 3;
  const id = isGlobal ? undefined : (knownKey ? (args[3] || (scopeName === 'group' ? ctx.groupId : ctx.userId)) : (args[2] || (scopeName === 'group' ? ctx.groupId : ctx.userId)));
  const key = required(args[keyIndex], ctx.usage('获取 <作用域> <键> | 设置 <作用域> <键> <JSON>'));
  const scope = { name: scopeName, id };
  if (action === '获取' || action === 'get') return runtime.config.getEffectiveValue(scope, key);
  if (!canWriteConfig(event, scope)) return '只有 Yunzai OP，或本人/本群管理员，才能修改该作用域配置。';
  let value;
  const valueStart = isGlobal ? 3 : 4;
  try { value = JSON.parse(args.slice(valueStart).join(' ')); } catch { return '配置值必须是 JSON。'; }
  const result = await runtime.config.set(scope, key, value);
  await ctx.audit('config.set', { key, scope: scopeName, scopeId: id });
  return result;
}

export async function handle09(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  return ctx.summary('当前权限', [
    { label: '身份', value: event.isMaster ? 'Yunzai OP' : event.role || '普通用户' },
    { label: 'Bot', value: ctx.botId },
    { label: '群', value: ctx.groupId || '私聊' },
    { label: '用户', value: ctx.userId },
    { label: '配置原则', value: 'Yunzai OP 全局；群管理员按群生效' },
    ...contractRows(ctx.id)
  ]);
}

async function listRule(ctx, field, usage) {
  return listMessage(ctx, await ctx.store.list(field), { usage });
}

export async function handle10(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const type = args[1] || 'user';
  if (action === '添加' || action === 'add') {
    const value = required(args[2], ctx.usage('添加 <类型> <ID>'));
    const item = await ctx.add({ type, value }, 'items', { uniqueBy: 'value' });
    await ctx.audit('namelist.add', { type, value: item.value });
    return '名单已添加：' + item.value;
  }
  if (action === '删除' || action === 'del') {
    const value = required(args[2], ctx.usage('删除 <类型> <ID>'));
    const count = await ctx.store.remove((item) => item.value === value, 'items');
    return count ? '名单已删除。' : '未找到名单项。';
  }
  return listRule(ctx, 'items', '添加 <类型> <ID>');
}

export async function handle11(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '此能力只能在群聊使用。';
  const action = String(args[0] || '').toLowerCase();
  if (action === '设置' || action === 'set') {
    const key = required(args[1], ctx.usage('设置 <键> <值>'));
    const value = required(args[2], ctx.usage('设置 <键> <值>'));
    await ctx.update((state) => { state.settings = { ...(state.settings || {}), [key]: value }; return state.settings; }, {});
    await ctx.audit('group.setting.set', { key });
    return '群设置已更新：' + key;
  }
  const state = await ctx.store.read({ settings: {} });
  return ctx.summary('群管理状态', Object.entries(state.settings || {}).map(([label, value]) => ({ label, value })));
}

export async function handle12(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (actionIs(ctx, '清理', 'clear')) { await ctx.store.clear(); return '事件统计已清理。'; }
  return listRule(ctx, 'events', '清理');
}

export async function handle13(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'bot' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') { const value = required(args[1], ctx.usage('添加 <群号>')); await ctx.add({ value }, 'groups', { uniqueBy: 'value' }); return '自动入群名单已添加。'; }
  if (action === '删除' || action === 'del') { const value = required(args[1], ctx.usage('删除 <群号>')); return (await ctx.store.remove((item) => item.value === value, 'groups')) ? '名单已删除。' : '未找到名单。'; }
  return listRule(ctx, 'groups', '添加 <群号>');
}

export async function handle14(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'bot' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') { const value = required(args[1], ctx.usage('添加 <用户 ID>')); await ctx.add({ value }, 'users', { uniqueBy: 'value' }); return '好友申请名单已添加。'; }
  if (action === '删除' || action === 'del') { const value = required(args[1], ctx.usage('删除 <用户 ID>')); return (await ctx.store.remove((item) => item.value === value, 'users')) ? '名单已删除。' : '未找到名单。'; }
  return listRule(ctx, 'users', '添加 <用户 ID>');
}

export async function handle15(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') { const value = required(args.slice(1).join(' '), ctx.usage('添加 <词语>')); await ctx.add({ value }, 'rules', { uniqueBy: 'value' }); await ctx.audit('word-filter.add'); return '词语规则已添加。'; }
  if (action === '删除' || action === 'del') { const value = required(args[1], ctx.usage('删除 <词语>')); return (await ctx.store.remove((item) => item.value === value, 'rules')) ? '词语规则已删除。' : '未找到规则。'; }
  return listRule(ctx, 'rules', '添加 <词语>');
}

export async function handle16(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') { const value = required(args.slice(1).join(' '), ctx.usage('添加 <词语或域名>')); await ctx.add({ value }, 'rules', { uniqueBy: 'value' }); return '广告规则已添加。'; }
  if (action === '删除' || action === 'del') { const value = required(args[1], ctx.usage('删除 <规则>')); return (await ctx.store.remove((item) => item.value === value, 'rules')) ? '广告规则已删除。' : '未找到规则。'; }
  return listRule(ctx, 'rules', '添加 <词语或域名>');
}

export async function handle17(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const ids = args.flatMap((item) => String(item).split(',')).filter((item) => /^\w[\w:-]{0,100}$/u.test(item)).slice(0, 20);
  if (!ids.length) return ctx.usage('<消息 ID> [消息 ID...]');
  const bot = event.bot;
  if (typeof bot?.deleteMsg !== 'function') {
    await ctx.audit('withdraw.unsupported', { count: ids.length });
    return '当前协议不支持撤回消息，未伪造成功。';
  }
  let done = 0;
  for (const messageId of ids) {
    try { await bot.deleteMsg(messageId); done += 1; } catch (error) { await ctx.audit('withdraw.error', { messageId, error: publicErrorMessage(error) }); }
  }
  await ctx.audit('withdraw.execute', { requested: ids.length, done });
  return '撤回处理完成：' + done + '/' + ids.length + '。';
}
