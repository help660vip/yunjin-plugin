import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fetchText } from '../../http/client.js';
import { validateUrl } from '../../http/policy.js';
import { canWriteConfig, isGroupAdmin } from '../../auth/policy.js';
import { contractRows } from '../contracts.js';
import { parseDuration } from '../../parser/command.js';
import { formatUptime } from '../../core/format.js';
import { cleanText } from '../../core/safe.js';
import { invalidInput, publicErrorMessage } from '../../core/errors.js';
import { handlerContext, required, actionIs, listMessage, dayKey, parseLimit } from './context.js';
import { botAdapter } from '../../adapters/bot.js';

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
  let tasks = [];
  try {
    const value = await runtime.scheduler?.list?.();
    if (Array.isArray(value)) tasks = value;
  } catch {
    // Status must remain available when the optional scheduler store is degraded.
  }
  let notificationSnapshot = {};
  try {
    notificationSnapshot = runtime.notifications?.snapshot?.() || {};
  } catch {
    // Notification health is informational and must not break the status command.
  }
  let capabilities = {};
  try {
    capabilities = typeof runtime.capabilities === 'function' ? runtime.capabilities(event) || {} : {};
  } catch {
    // A host capability probe may be unavailable during early startup.
  }
  const scheduled = tasks.filter((item) => item.status === 'scheduled').length;
  const queueSize = Array.isArray(notificationSnapshot.queue) ? notificationSnapshot.queue.length : 0;
  const topicCount = Array.isArray(notificationSnapshot.topics) ? notificationSnapshot.topics.length : 0;
  const messageCapabilityCount = Object.values(capabilities.message || {}).filter(Boolean).length;
  return ctx.summary('YunJin \u8fd0\u884c\u72b6\u6001', [
    { label: '\u8fd0\u884c\u65f6\u95f4', value: formatUptime(process.uptime()) },
    { label: '\u5185\u5b58', value: Math.round(memory.rss / 1024 / 1024) + ' MB' },
    { label: '\u5df2\u542f\u7528', value: enabled + '/50' },
    { label: 'Node', value: process.version },
    { label: '\u5e73\u53f0', value: os.platform() },
    { label: '\u4f5c\u7528\u57df', value: ctx.botId + ' / ' + (ctx.groupId || 'private') },
    { label: '\u8c03\u5ea6\u4efb\u52a1', value: scheduled + '/' + tasks.length },
    { label: '\u901a\u77e5\u961f\u5217', value: queueSize + ' / ' + topicCount + ' topics' },
    { label: '\u6e32\u67d3', value: capabilities.render ? '\u53ef\u7528' : '\u6587\u672c\u964d\u7ea7' },
    { label: '\u6d88\u606f\u9002\u914d', value: String(messageCapabilityCount) }
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
  if (action === '\u6dfb\u52a0' || action === 'add') {
    const url = required(args[1], ctx.usage('\u6dfb\u52a0 <URL>'), '\u8bf7\u63d0\u4f9b URL\u3002');
    const target = validateUrl(url);
    const item = await ctx.add({ url: target.href, status: 'unknown', checks: 0 }, 'items', { uniqueBy: 'url' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.monitorId === item.id && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) return '\u76d1\u63a7\u5df2\u5b58\u5728\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + activeTask.id;
    const task = await runtime.scheduler.create({ featureId: ctx.id, title: 'Monitor ' + target.href, delayMs: 5 * 60 * 1000, repeatMs: 5 * 60 * 1000, dedupeKey: 'monitor:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'monitor', monitorId: item.id, target: target.href, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    await ctx.audit('monitor.add', { monitorId: item.id, host: target.hostname, taskId: task.id });
    return '\u76d1\u63a7\u5df2\u6dfb\u52a0\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del') {
    const id = required(args[1], ctx.usage('\u5220\u9664 <\u76d1\u63a7 ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'items');
    if (!removed) return '\u672a\u627e\u5230\u76d1\u63a7\u3002';
    const tasks = await runtime.scheduler.list();
    await Promise.all(tasks.filter((task) => task.featureId === ctx.id && task.payload?.monitorId === id && ['scheduled', 'running'].includes(task.status)).map((task) => runtime.scheduler.cancel(task.id).catch(() => false)));
    return '\u76d1\u63a7\u5df2\u5220\u9664\u3002';
  }
  if (action === '\u68c0\u67e5' || action === 'check') {
    const id = args[1];
    const item = (state.items || []).find((entry) => entry.id === id) || state.items?.[0];
    if (!item) return ctx.usage('\u6dfb\u52a0 <URL> | \u68c0\u67e5 <ID>');
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
    return item.url + '\\n\u72b6\u6001\uff1a' + item.status + '\\n\u5ef6\u8fdf\uff1a' + item.latency + 'ms';
  }
  return listMessage(ctx, state.items || [], { usage: '\u6dfb\u52a0 <URL> | \u68c0\u67e5 <ID> | \u5220\u9664 <ID>' });
}

export async function handle06(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const manager = isGroupAdmin(event);
  const inScope = (task) => task.featureId === ctx.id && task.botId === ctx.botId && task.groupId === ctx.groupId && (manager || task.userId === ctx.userId);
  if (action === '\u5217\u8868' || action === 'list' || !args.length) {
    const tasks = (await runtime.scheduler.list()).filter(inScope);
    return tasks.length ? title(ctx) + '\\n' + tasks.map((task) => task.id + ' ' + task.status + ' ' + runtime.core.clock.format(task.runAt)).join('\\n') : title(ctx) + '\\n\u6682\u65e0\u4efb\u52a1\u3002';
  }
  if (action === '\u53d6\u6d88' || action === 'cancel') {
    const id = required(args[1], ctx.usage('\u53d6\u6d88 <\u4efb\u52a1 ID>'));
    const task = await runtime.scheduler.find(id);
    if (!task || !inScope(task)) return '\u672a\u627e\u5230\u53ef\u64cd\u4f5c\u4efb\u52a1\u3002';
    return await runtime.scheduler.cancel(id) ? '\u4efb\u52a1\u5df2\u53d6\u6d88\u3002' : '\u672a\u627e\u5230\u4efb\u52a1\u3002';
  }
  const delay = parseDuration(args[0], { defaultUnit: 'm', maxMs: 30 * 86400000 });
  const content = required(args.slice(1).join(' '), ctx.usage('<\u65f6\u957f> <\u63d0\u9192\u5185\u5bb9>'), '\u8bf7\u63d0\u4f9b\u63d0\u9192\u5185\u5bb9\u3002');
  const task = await runtime.scheduler.create({ featureId: ctx.id, title: content, delayMs: delay, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { content, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
  await ctx.audit('task.create', { taskId: task.id });
  return '\u4efb\u52a1\u5df2\u521b\u5efa\uff1a' + task.id;
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
  const id = isGlobal ? undefined : (knownKey ? (scopeName === 'group' ? ctx.groupId : ctx.userId) : (args[2] || (scopeName === 'group' ? ctx.groupId : ctx.userId)));
  const key = required(args[keyIndex], ctx.usage('获取 <作用域> <键> | 设置 <作用域> <键> <JSON>'));
  const scope = { name: scopeName, id };
  if (action === '获取' || action === 'get') return runtime.config.getEffectiveValue(scope, key);
  if (!canWriteConfig(event, scope)) return '只有 Yunzai OP，或本人/本群管理员，才能修改该作用域配置。';
  let value;
  const valueStart = isGlobal ? 3 : knownKey ? 3 : 4;
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

function requestDetails(event) {
  const raw = event?.raw && typeof event.raw === 'object' ? event.raw : event || {};
  const requestType = String(event?.requestType ?? raw.request_type ?? raw.requestType ?? '').toLowerCase();
  const subType = String(event?.subType ?? raw.sub_type ?? raw.subType ?? '').toLowerCase();
  const flag = String(event?.flag ?? raw.flag ?? '').trim();
  const comment = cleanText(event?.comment ?? raw.comment ?? '', { max: 300 });
  return {
    raw,
    requestType,
    subType,
    flag,
    comment,
    groupId: String(event?.groupId ?? raw.group_id ?? raw.groupId ?? '').trim(),
    userId: String(event?.userId ?? raw.user_id ?? raw.userId ?? '').trim()
  };
}

async function recordRequest(ctx, value) {
  await ctx.store.update((state) => {
    const requests = Array.isArray(state.requests) ? state.requests : [];
    const key = String(value.key || '');
    state.requests = [{ ...value }, ...requests.filter((item) => item?.key !== key)].slice(0, 100);
    return state.requests[0];
  }, { requests: [] });
}

export async function handleRequestEvent(manifest, event, runtime) {
  const id = String(manifest?.id || '').padStart(2, '0');
  if (!['13', '14'].includes(id)) return false;
  if (runtime.registry?.isEnabled && !runtime.registry.isEnabled(id, event)) return false;

  const request = requestDetails(event);
  const eventType = String(event?.postType ?? event?.type ?? request.raw?.post_type ?? request.raw?.type ?? '').toLowerCase();
  if (eventType !== 'request') return false;
  const expectedType = id === '13' ? 'group' : 'friend';
  if (request.requestType !== expectedType) return false;
  if (id === '13' && !request.groupId) return false;
  if (id === '14' && !request.userId) return false;

  const ctx = handlerContext(manifest, event, [], runtime, { level: 'bot', maxItems: 100 });
  const field = id === '13' ? 'groups' : 'users';
  const targetId = id === '13' ? request.groupId : request.userId;
  const allowed = await ctx.store.list(field);
  const matched = allowed.some((item) => String(item?.value ?? item?.id ?? '').trim() === targetId);
  const key = request.flag || [id, request.requestType, request.subType, targetId].join(':');

  if (!matched || !request.flag) {
    await recordRequest(ctx, {
      key,
      requestType: request.requestType,
      subType: request.subType,
      targetId,
      userId: request.userId,
      groupId: request.groupId,
      flag: request.flag,
      comment: request.comment,
      action: matched ? 'ignored:no-flag' : 'ignored:not-allowed',
      at: ctx.now
    });
    return false;
  }

  const previous = (await ctx.store.list('requests')).find((item) => item?.key === key);
  if (previous?.action === 'approved') return false;

  const payload = {
    flag: request.flag,
    request_type: request.requestType,
    sub_type: request.subType || (id === '13' ? 'add' : 'add'),
    group_id: request.groupId,
    user_id: request.userId,
    approve: true,
    reason: 'YunJin allow list'
  };
  const adapter = botAdapter(event);
  const result = id === '13' ? await adapter.approveGroup(payload) : await adapter.approveFriend(payload);
  const action = result?.ok ? 'approved' : 'failed:' + String(result?.code || 'unknown');

  await recordRequest(ctx, {
    key,
    requestType: request.requestType,
    subType: request.subType,
    targetId,
    userId: request.userId,
    groupId: request.groupId,
    flag: request.flag,
    comment: request.comment,
    action,
    at: ctx.now
  });
  await ctx.audit('request.' + (result?.ok ? 'auto-approved' : 'auto-approval-failed'), {
    targetId,
    requestType: request.requestType,
    flag: request.flag,
    code: result?.code || ''
  });
  return { handled: true, approved: Boolean(result?.ok), targetId, code: result?.code || '' };
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
  if (!args.some((item) => ['\u786e\u8ba4', 'confirm'].includes(String(item).toLowerCase()))) return ctx.usage('\u64a4\u56de <\u6d88\u606f ID> [\u6d88\u606f ID...] \u786e\u8ba4');
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
