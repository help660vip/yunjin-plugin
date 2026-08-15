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
  if (action === '\u5217\u8868' || action === 'list' || action === '\u67e5\u770b' || action === 'view') {
    if (args.length > 1) return ctx.usage('\u67e5\u770b');
    const items = await ctx.store.list('items');
    if (!items.length) return '\u6682\u65e0\u8bb0\u5f55\u3002';
    return ['\u5f02\u5e38\u8bb0\u5f55\uff1a', ...items.map((item) => {
      const occurrences = Math.max(1, Number(item.occurrences) || 1);
      return `- ${item.text}${occurrences > 1 ? `\uff08${occurrences} \u6b21\uff09` : ''}`;
    })].join('\n');
  }
  const value = required(action === '\u8bb0\u5f55' || action === 'record' ? args.slice(1).join(' ') : (ctx.value || args.join(' ')), ctx.usage('\u8bb0\u5f55 <\u5f02\u5e38\u63cf\u8ff0>'), '\u8bf7\u63d0\u4f9b\u5f02\u5e38\u63cf\u8ff0\u3002');
  const now = ctx.now;
  const identity = ctx.store.identity();
  const fingerprint = ctx.stable(value);
  const result = await ctx.store.upsert({
    id: randomUUID(),
    ...identity,
    text: value,
    type: 'error',
    fingerprint,
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    time: now
  }, 'items', {
    uniqueBy: 'fingerprint',
    merge(existing, incoming) {
      return {
        ...existing,
        text: incoming.text,
        lastSeenAt: incoming.lastSeenAt,
        updatedAt: incoming.updatedAt,
        time: incoming.time,
        occurrences: Math.max(1, Number(existing.occurrences) || 1) + 1
      };
    }
  });
  await ctx.audit('error.report', { recordId: result.item.id, duplicate: !result.created, occurrences: result.item.occurrences });
  return result.created ? '\u5f02\u5e38\u5df2\u8bb0\u5f55\uff1a' + result.item.id : `\u5f02\u5e38\u5df2\u66f4\u65b0\uff1a${result.item.id}\uff08\u91cd\u590d ${result.item.occurrences} \u6b21\uff09`;
}
export async function handle03(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u6e05\u7406' || action === 'clear') {
    if (args.length > 1) return ctx.usage('\u6e05\u7406');
    const count = await ctx.store.count('items');
    await ctx.store.clear();
    await ctx.audit('log.clear', { count });
    return count > 0 ? `\u5f53\u524d\u4f5c\u7528\u57df\u5df2\u6e05\u7406 ${count} \u6761\u65e5\u5fd7\u3002` : '\u5f53\u524d\u4f5c\u7528\u57df\u6ca1\u6709\u65e5\u5fd7\u3002';
  }
  if (action && !['\u67e5\u770b', 'view', '\u5217\u8868', 'list'].includes(action)) return ctx.usage('\u67e5\u770b|\u6e05\u7406');
  if (args.length > 1) return ctx.usage('\u67e5\u770b');
  await ctx.audit('log.view');
  return listState(ctx, 'items', '\u6e05\u7406');
}
export async function handle04(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const explicitStart = action === '\u5f00\u59cb' || action === 'start';
  const isFinish = action === '\u7ed3\u675f' || action === 'end' || action === '\u5931\u8d25' || action === 'fail';
  const isStart = explicitStart || (!isFinish && args.length === 1);
  if (isStart) {
    if (explicitStart && args.length < 2) return ctx.usage('\u5f00\u59cb <\u540d\u79f0>');
    const name = required(explicitStart ? args.slice(1).join(' ') : (ctx.value || args.join(' ')), ctx.usage('\u5f00\u59cb <\u540d\u79f0>'), '\u8bf7\u63d0\u4f9b\u4e8b\u52a1\u540d\u79f0\u3002');
    const item = await ctx.add({ text: name, status: 'active', startedAt: ctx.now, updatedAt: ctx.now });
    await ctx.audit('transaction.start', { transactionId: item.id });
    return '\u4e8b\u52a1\u5df2\u5f00\u59cb\uff1a' + item.id;
  }
  if (!isFinish) return ctx.usage('\u5f00\u59cb <\u540d\u79f0> | \u7ed3\u675f <\u4e8b\u52a1 ID> | \u5931\u8d25 <\u4e8b\u52a1 ID>');
  if (args.length !== 2) return ctx.usage(action === '\u5931\u8d25' || action === 'fail' ? '\u5931\u8d25 <\u4e8b\u52a1 ID>' : '\u7ed3\u675f <\u4e8b\u52a1 ID>');
  const transactionId = required(args[1], ctx.usage('\u7ed3\u675f <\u4e8b\u52a1 ID>'), '\u8bf7\u63d0\u4f9b\u4e8b\u52a1 ID\u3002');
  const status = action === '\u5931\u8d25' || action === 'fail' ? 'failed' : 'done';
  const result = await ctx.update((state) => {
    const items = Array.isArray(state.items) ? state.items : [];
    const transaction = items.find((item) => item.id === transactionId);
    if (!transaction) return { missing: true, transactionId };
    if (transaction.status !== 'active') return { terminal: true, transaction: { ...transaction } };
    transaction.status = status;
    transaction.finishedAt = ctx.now;
    transaction.updatedAt = ctx.now;
    transaction.durationMs = Math.max(0, Number(transaction.finishedAt) - Number(transaction.startedAt));
    state.items = items;
    return { transaction: { ...transaction }, terminal: false };
  }, { items: [] });
  if (result.missing) return '\u672a\u627e\u5230\u4e8b\u52a1\uff1a' + transactionId;
  if (result.terminal) {
    await ctx.audit('transaction.finish.duplicate', { transactionId, status: result.transaction.status });
    return `\u4e8b\u52a1\u5df2\u5904\u4e8e\u7ec8\u6001\uff1a${transactionId} ${result.transaction.status}`;
  }
  await ctx.audit('transaction.finish', { transactionId, status: result.transaction.status, durationMs: result.transaction.durationMs });
  return `\u4e8b\u52a1\u5df2\u66f4\u65b0\uff1a${result.transaction.id} ${result.transaction.status} ${result.transaction.durationMs}ms`;
}
export async function handle05(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u6dfb\u52a0' || action === 'add') {
    const url = required(args[1], ctx.usage('\u6dfb\u52a0 <URL>'), '\u8bf7\u63d0\u4f9b URL\u3002');
    const target = validateUrl(url);
    const now = ctx.now;
    const identity = ctx.store.identity();
    const result = await ctx.store.upsert({
      id: randomUUID(),
      ...identity,
      url: target.href,
      status: 'unknown',
      checks: 0,
      createdAt: now,
      updatedAt: now,
      time: now
    }, 'items', {
      uniqueBy: 'url',
      merge(existing, incoming) { return { ...existing, url: incoming.url, updatedAt: incoming.updatedAt, time: incoming.time }; }
    });
    const item = result.item;
    let activeTask;
    try {
      activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.monitorId === item.id && ['scheduled', 'running'].includes(entry.status));
    } catch (error) {
      if (result.created) await ctx.store.remove((entry) => entry.id === item.id, 'items');
      try { await ctx.audit('monitor.add.failed', { monitorId: item.id, reason: publicErrorMessage(error) }); } catch {}
      throw error;
    }
    if (activeTask) return '\u76d1\u63a7\u5df2\u5b58\u5728\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + activeTask.id;
    let task;
    try {
      task = await runtime.scheduler.create({ featureId: ctx.id, title: 'Monitor ' + target.href, delayMs: 5 * 60 * 1000, repeatMs: 5 * 60 * 1000, dedupeKey: 'monitor:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'monitor', monitorId: item.id, target: target.href, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    } catch (error) {
      if (result.created) await ctx.store.remove((entry) => entry.id === item.id, 'items');
      try { await ctx.audit('monitor.add.failed', { monitorId: item.id, reason: publicErrorMessage(error) }); } catch {}
      throw error;
    }
    await ctx.audit('monitor.add', { monitorId: item.id, host: target.hostname, taskId: task.id, created: result.created });
    return result.created ? '\u76d1\u63a7\u5df2\u6dfb\u52a0\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + task.id : '\u76d1\u63a7\u5df2\u6062\u590d\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del') {
    const id = required(args[1], ctx.usage('\u5220\u9664 <\u76d1\u63a7 ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'items');
    if (!removed) return '\u672a\u627e\u5230\u76d1\u63a7\u3002';
    const tasks = await runtime.scheduler.list();
    await Promise.all(tasks.filter((task) => task.featureId === ctx.id && task.payload?.monitorId === id && ['scheduled', 'running'].includes(task.status)).map((task) => runtime.scheduler.cancel(task.id).catch(() => false)));
    await ctx.audit('monitor.remove', { monitorId: id });
    return '\u76d1\u63a7\u5df2\u5220\u9664\u3002';
  }
  if (action === '\u68c0\u67e5' || action === 'check') {
    const state = await ctx.store.read({ items: [] });
    const id = args[1];
    const item = (state.items || []).find((entry) => entry.id === id) || state.items?.[0];
    if (!item) return ctx.usage('\u6dfb\u52a0 <URL> | \u68c0\u67e5 <ID>');
    ctx.network();
    const started = ctx.now;
    let status = 'up';
    let errorMessage = '';
    try {
      await fetchText(item.url, { maxBytes: 4096, timeoutMs: 3000, attempts: 1, cache: false });
    } catch (error) {
      status = 'down';
      errorMessage = publicErrorMessage(error);
    }
    const checkedAt = runtime.core.clock.now();
    const latency = Math.max(0, checkedAt - started);
    const updated = await ctx.update((next) => {
      const current = (Array.isArray(next.items) ? next.items : []).find((entry) => entry.id === item.id);
      if (!current) return { missing: true };
      Object.assign(current, { status, error: errorMessage, latency, checkedAt, checks: Number(current.checks || 0) + 1, updatedAt: checkedAt });
      return { item: { ...current }, missing: false };
    }, { items: [] });
    if (updated.missing) return '\u76d1\u63a7\u5df2\u4e0d\u5b58\u5728\u3002';
    return updated.item.url + '\n\u72b6\u6001\uff1a' + updated.item.status + '\n\u5ef6\u8fdf\uff1a' + updated.item.latency + 'ms';
  }
  const state = await ctx.store.read({ items: [] });
  return listMessage(ctx, state.items || [], { usage: '\u6dfb\u52a0 <URL> | \u68c0\u67e5 <ID> | \u5220\u9664 <ID>' });
}
export async function handle06(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const manager = isGroupAdmin(event);
  const inScope = (task) => task.featureId === ctx.id && task.botId === ctx.botId && task.groupId === ctx.groupId && (manager || task.userId === ctx.userId);
  if (action === '\u5217\u8868' || action === 'list' || !args.length) {
    if (args.length > 1) return ctx.usage('\u5217\u8868');
    const tasks = (await runtime.scheduler.list()).filter(inScope);
    await ctx.audit('task.list', { count: tasks.length });
    return tasks.length ? title(ctx) + '\n' + tasks.map((task) => task.id + ' ' + task.status + ' ' + runtime.core.clock.format(task.runAt)).join('\n') : title(ctx) + '\n\u6682\u65e0\u4efb\u52a1\u3002';
  }
  if (action === '\u53d6\u6d88' || action === 'cancel') {
    if (args.length !== 2) return ctx.usage('\u53d6\u6d88 <\u4efb\u52a1 ID>');
    const id = required(args[1], ctx.usage('\u53d6\u6d88 <\u4efb\u52a1 ID>'));
    const task = await runtime.scheduler.find(id);
    if (!task || !inScope(task)) return '\u672a\u627e\u5230\u53ef\u64cd\u4f5c\u4efb\u52a1\u3002';
    const cancelled = await runtime.scheduler.cancel(id);
    if (!cancelled) return '\u672a\u627e\u5230\u4efb\u52a1\u3002';
    await ctx.audit('task.cancel', { taskId: id });
    return '\u4efb\u52a1\u5df2\u53d6\u6d88\u3002';
  }
  const delay = parseDuration(args[0], { defaultUnit: 'm', maxMs: 30 * 86400000 });
  const content = required(args.slice(1).join(' '), ctx.usage('<\u65f6\u957f> <\u63d0\u9192\u5185\u5bb9>'), '\u8bf7\u63d0\u4f9b\u63d0\u9192\u5185\u5bb9\u3002');
  const task = await runtime.scheduler.create({ featureId: ctx.id, title: content, delayMs: delay, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { content, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
  await ctx.audit('task.create', { taskId: task.id, delayMs: delay });
  return '\u4efb\u52a1\u5df2\u521b\u5efa\uff1a' + task.id;
}
export async function handle07(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const raw = String(args[0] || '').toLowerCase();
  const viewAlias = raw === '\u67e5\u770b' || raw === 'view';
  if (viewAlias && args.length > 2) return ctx.usage('\u67e5\u770b [\u9886\u57df]');
  if (!viewAlias && args.length > 1) return ctx.usage('\u67e5\u770b [\u9886\u57df]');
  const area = viewAlias ? String(args[1] || '').toLowerCase() : raw;
  const areas = ['core', 'governance', 'feeds', 'tools', 'media', 'community'];
  if (area && !areas.includes(area)) return ctx.usage('\u67e5\u770b [core|governance|feeds|tools|media|community]');
  const labels = { core: '\u57fa\u7840\u8fd0\u884c', governance: '\u6743\u9650\u7fa4\u7ba1', feeds: '\u8ba2\u9605\u63a8\u9001', tools: '\u65e5\u5e38\u5de5\u5177', media: '\u5185\u5bb9\u5a92\u4f53', community: '\u793e\u533a\u4e92\u52a8' };
  const features = runtime.registry.list(event).filter((item) => !area || item.area === area);
  if (!features.length) return '\u6682\u65e0\u53ef\u7528\u80fd\u529b\u3002';
  const groups = area ? [area] : areas;
  const rows = ['\u4e91\u9526\u5e2e\u52a9'];
  for (const group of groups) {
    const entries = features.filter((item) => item.area === group);
    if (!entries.length) continue;
    rows.push('', `## ${labels[group]}`, ...entries.map((item) => '#\u4e91\u9526' + item.command + '  ' + item.name + ' [' + item.access + ']'));
  }
  await ctx.audit('help.view', { area: area || 'all', count: features.length });
  return rows.join('\n');
}
function normalizeConfigScope(value) {
  const normalized=String(value||"").toLowerCase();
  if (["\u5168\u5c40","global"].includes(normalized)) return "global";
  if (["\u7fa4","group"].includes(normalized)) return "group";
  if (["\u7528\u6237","user"].includes(normalized)) return "user";
  return null;
}
export async function handle08(manifest,event,args,runtime) {
  const ctx=handlerContext(manifest,event,args,runtime)
  const usage='\u67e5\u770b | \u83b7\u53d6 <\u5168\u5c40|\u7fa4|\u7528\u6237> [ID] <\u952e> | \u8bbe\u7f6e <\u5168\u5c40|\u7fa4|\u7528\u6237> [ID] <\u952e> <JSON> | \u91cd\u8f7d | \u6821\u9a8c';
  if (!runtime.config) return '\u914d\u7f6e\u670d\u52a1\u4e0d\u53ef\u7528\u3002';
  const action=String(args[0]||'').toLowerCase();
  if (!args.length || action === '\u67e5\u770b' || action === 'view') {
    if (args.length) return ctx.usage('\u67e5\u770b');
    await ctx.audit('config.view');
    return runtime.config.describeEffective(event);
  }
  if (action === '\u91cd\u8f7d' || action === 'reload') {
    if (args.length > 1) return ctx.usage('\u91cd\u8f7d');
    await runtime.config.reload();
    await ctx.audit('config.reload');
    return '\u914d\u7f6e\u5df2\u91cd\u8f7d\u3002';
  }
  if (action === '\u6821\u9a8c' || action === 'validate') {
    if (args.length > 1) return ctx.usage('\u6821\u9a8c');
    const result=await runtime.config.validate();
    await ctx.audit('config.validate');
    return result;
  }
  if (!['\u83b7\u53d6','get','\u8bbe\u7f6e','set'].includes(action)) return ctx.usage(usage);
  const scopeName=normalizeConfigScope(args[1]);
  if (!scopeName) return '\u4f5c\u7528\u57df\u5fc5\u987b\u662f\u5168\u5c40\u3001\u7fa4\u6216\u7528\u6237\u3002';
  const isGlobal=scopeName==='global';
  const candidate=args[2];
  const knownKey=runtime.config.schemas?.has?.(candidate);
  const keyIndex=isGlobal ? 2 : knownKey ? 2 : 3;
  const id=isGlobal ? undefined : (knownKey ? (scopeName==='group'?ctx.groupId:ctx.userId) : (args[2] || (scopeName==='group'?ctx.groupId:ctx.userId)));
  const key=required(args[keyIndex],ctx.usage(usage));
  if (scopeName==='group' && (!id || id==='private')) return '\u7fa4\u4f5c\u7528\u57df\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  if (scopeName==='user' && !id) return '\u7528\u6237\u4f5c\u7528\u57df\u9700\u8981\u6709\u6548\u7684\u7528\u6237\u3002';
  if (action==='\u83b7\u53d6' || action==='get') {
    if (args.length !== keyIndex+1) return ctx.usage('\u83b7\u53d6 <\u4f5c\u7528\u57df> [ID] <\u952e>');
    const result=await runtime.config.getEffectiveValue({name:scopeName,id},key);
    await ctx.audit('config.get',{key,scope:scopeName,scopeId:id});
    return result;
  }
  if (args.length <= keyIndex+1) return ctx.usage('\u8bbe\u7f6e <\u4f5c\u7528\u57df> [ID] <\u952e> <JSON>');
  const scope={name:scopeName,id};
  if (!canWriteConfig(event,scope)) return '\u53ea\u6709 Yunzai OP\uff0c\u6216\u672c\u4eba/\u672c\u7fa4\u7ba1\u7406\u5458\uff0c\u624d\u80fd\u4fee\u6539\u8be5\u4f5c\u7528\u57df\u914d\u7f6e\u3002';
  let value;
  const valueStart=isGlobal?3:knownKey?3:4;
  try { value=JSON.parse(args.slice(valueStart).join(' ')); } catch { return '\u914d\u7f6e\u503c\u5fc5\u987b\u662f JSON\u3002'; }
  const result=await runtime.config.set(scope,key,value);
  await ctx.audit('config.set',{key,scope:scopeName,scopeId:id});
  return result;
}
export async function handle09(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (args.length > 1 || (args.length && !['\u67e5\u770b', 'view'].includes(action))) return ctx.usage('\u67e5\u770b');
  await ctx.audit('permission.view', {
    isMaster: Boolean(event.isMaster),
    role: event.role || 'member',
    groupId: ctx.groupId || null
  });
  const groupWritable = Boolean(ctx.groupId) && (Boolean(event.isMaster) || isGroupAdmin(event));
  return ctx.summary('\u5f53\u524d\u6743\u9650', [
    { label: '\u8eab\u4efd', value: event.isMaster ? 'Yunzai OP' : event.role || '\u666e\u901a\u7528\u6237' },
    { label: 'Bot', value: ctx.botId },
    { label: '\u7fa4', value: ctx.groupId || '\u79c1\u804a' },
    { label: '\u7528\u6237', value: ctx.userId },
    { label: '\u5168\u5c40\u914d\u7f6e', value: event.isMaster ? '\u53ef\u4fee\u6539' : '\u4ec5 Yunzai OP' },
    { label: '\u7fa4\u914d\u7f6e', value: groupWritable ? '\u53ef\u4fee\u6539' : '\u4ec5\u7fa4\u7ba1\u7406\u5458' },
    { label: '\u7528\u6237\u914d\u7f6e', value: ctx.userId ? '\u53ef\u4fee\u6539\u672c\u4eba' : '\u65e0\u6709\u6548\u7528\u6237' },
    { label: '\u914d\u7f6e\u539f\u5219', value: 'Yunzai OP \u5168\u5c40\uff1b\u7fa4\u7ba1\u7406\u5458\u6309\u7fa4\u751f\u6548' },
    ...contractRows(ctx.id)
  ]);
}
async function listRule(ctx, field, usage) {
  return listMessage(ctx, await ctx.store.list(field), { usage });
}

export async function handle10(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <\u7c7b\u578b> <ID> | \u5220\u9664 <\u7c7b\u578b> <ID> | \u5217\u8868';
  const typeAliases = new Map([
    ['bot', 'bot'],
    ['\u673a\u5668\u4eba', 'bot'],
    ['group', 'group'],
    ['\u7fa4', 'group'],
    ['user', 'user'],
    ['\u7528\u6237', 'user']
  ]);
  const normalizeType = (value) => typeAliases.get(String(value || '').toLowerCase());
  const validateValue = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
    return normalized;
  };
  if (!args.length || action === '\u5217\u8868' || action === 'list' || action === '\u67e5\u770b' || action === 'view') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('namelist.list');
    return listRule(ctx, 'items', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add') {
    if (args.length !== 3) return ctx.usage('\u6dfb\u52a0 <\u7c7b\u578b> <ID>');
    const type = normalizeType(args[1]);
    const value = validateValue(args[2]);
    if (!type) return '\u7c7b\u578b\u5fc5\u987b\u662f bot\u3001\u7fa4\u6216\u7528\u6237\u3002';
    if (!value) return 'ID \u4e0d\u80fd\u4e3a\u7a7a\u3001\u8d85\u8fc7 128 \u5b57\u7b26\u6216\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002';
    const item = await ctx.add({ type, value }, 'items', { uniqueBy: 'value' });
    await ctx.audit('namelist.add', { type, value: item.value });
    return '\u540d\u5355\u5df2\u6dfb\u52a0\uff1a' + item.value;
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 3) return ctx.usage('\u5220\u9664 <\u7c7b\u578b> <ID>');
    const type = normalizeType(args[1]);
    const value = validateValue(args[2]);
    if (!type) return '\u7c7b\u578b\u5fc5\u987b\u662f bot\u3001\u7fa4\u6216\u7528\u6237\u3002';
    if (!value) return 'ID \u4e0d\u80fd\u4e3a\u7a7a\u3001\u8d85\u8fc7 128 \u5b57\u7b26\u6216\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002';
    const count = await ctx.store.remove((item) => item.type === type && item.value === value, 'items');
    await ctx.audit('namelist.delete', { type, value, count });
    return count ? '\u540d\u5355\u5df2\u5220\u9664\u3002' : '\u672a\u627e\u5230\u540d\u5355\u9879\u3002';
  }
  return ctx.usage(usage);
}
export async function handle11(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '\u6b64\u80fd\u529b\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u8bbe\u7f6e' || action === 'set') {
    if (args.length !== 3) return ctx.usage('\u8bbe\u7f6e <\u952e> <\u503c>');
    const key = String(args[1] || '').trim();
    const value = String(args[2] || '').trim();
    if (!key || key.length > 64 || /[\u0000-\u001f\u007f]/.test(key)) return '\u952e\u5fc5\u987b\u662f 1-64 \u4e2a\u5b57\u7b26\u4e14\u4e0d\u80fd\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002';
    if (!value || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) return '\u503c\u5fc5\u987b\u662f 1-512 \u4e2a\u5b57\u7b26\u4e14\u4e0d\u80fd\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002';
    await ctx.update((state) => {
      state.settings = { ...(state.settings || {}), [key]: value };
      return state.settings;
    }, {});
    await ctx.audit('group.setting.set', { key, valueLength: value.length });
    return '\u7fa4\u8bbe\u7f6e\u5df2\u66f4\u65b0\uff1a' + key;
  }
  if (args.length && !['\u67e5\u770b', 'view', '\u5217\u8868', 'list'].includes(action)) return ctx.usage('\u67e5\u770b | \u8bbe\u7f6e <\u952e> <\u503c>');
  if (args.length > 1) return ctx.usage('\u67e5\u770b');
  const state = await ctx.store.read({ settings: {} });
  await ctx.audit('group.setting.view');
  return ctx.summary('\u7fa4\u7ba1\u7406\u72b6\u6001', Object.entries(state.settings || {}).map(([label, value]) => ({ label, value })));
}
export async function handle12(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '\u6b64\u80fd\u529b\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u6e05\u7406' || action === 'clear') {
    if (args.length !== 1) return ctx.usage('\u6e05\u7406');
    const events = await ctx.store.list('events');
    const count = Array.isArray(events) ? events.length : 0;
    await ctx.store.clear();
    await ctx.audit('event.clear', { count });
    return count ? '\u4e8b\u4ef6\u7edf\u8ba1\u5df2\u6e05\u7406\uff1a' + count : '\u6ca1\u6709\u53ef\u6e05\u7406\u7684\u4e8b\u4ef6\u3002';
  }
  if (args.length && !['\u67e5\u770b', 'view', '\u5217\u8868', 'list'].includes(action)) return ctx.usage('\u67e5\u770b | \u6e05\u7406');
  if (args.length > 1) return ctx.usage('\u67e5\u770b');
  await ctx.audit('event.list');
  return listRule(ctx, 'events', '\u67e5\u770b');
}
export async function handle13(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'bot' });
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <\u7fa4\u53f7> | \u5220\u9664 <\u7fa4\u53f7> | \u5217\u8868';
  const validGroupId = (value) => /^[A-Za-z0-9:_-]{1,64}$/.test(String(value || ''));
  if (!args.length || action === '\u5217\u8868' || action === 'list') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('auto-enter.list');
    return listRule(ctx, 'groups', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add') {
    if (args.length !== 2) return ctx.usage('\u6dfb\u52a0 <\u7fa4\u53f7>');
    const value = String(args[1] || '').trim();
    if (!validGroupId(value)) return '\u7fa4\u53f7\u5fc5\u987b\u662f 1-64 \u4e2a\u5b89\u5168\u5b57\u7b26\u3002';
    const item = await ctx.add({ value }, 'groups', { uniqueBy: 'value' });
    await ctx.audit('auto-enter.add', { value: item.value });
    return '\u81ea\u52a8\u5165\u7fa4\u540d\u5355\u5df2\u6dfb\u52a0\uff1a' + item.value;
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 2) return ctx.usage('\u5220\u9664 <\u7fa4\u53f7>');
    const value = String(args[1] || '').trim();
    if (!validGroupId(value)) return '\u7fa4\u53f7\u5fc5\u987b\u662f 1-64 \u4e2a\u5b89\u5168\u5b57\u7b26\u3002';
    const count = await ctx.store.remove((item) => item.value === value, 'groups');
    await ctx.audit('auto-enter.delete', { value, count });
    return count ? '\u81ea\u52a8\u5165\u7fa4\u540d\u5355\u5df2\u5220\u9664\u3002' : '\u672a\u627e\u5230\u7fa4\u53f7\u3002';
  }
  return ctx.usage(usage);
}
export async function handle14(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'bot' });
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <\u7528\u6237 ID> | \u5220\u9664 <\u7528\u6237 ID> | \u5217\u8868';
  const validUserId = (value) => /^[A-Za-z0-9:_-]{1,64}$/.test(String(value || ''));
  if (!args.length || action === '\u5217\u8868' || action === 'list') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('friend-request.list');
    return listRule(ctx, 'users', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add') {
    if (args.length !== 2) return ctx.usage('\u6dfb\u52a0 <\u7528\u6237 ID>');
    const value = String(args[1] || '').trim();
    if (!validUserId(value)) return '\u7528\u6237 ID \u5fc5\u987b\u662f 1-64 \u4f4d\u5b89\u5168\u6807\u8bc6\u7b26\u3002';
    const item = await ctx.add({ value }, 'users', { uniqueBy: 'value' });
    await ctx.audit('friend-request.add', { value: item.value });
    return '\u597d\u53cb\u7533\u8bf7\u540d\u5355\u5df2\u6dfb\u52a0\uff1a' + item.value;
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 2) return ctx.usage('\u5220\u9664 <\u7528\u6237 ID>');
    const value = String(args[1] || '').trim();
    if (!validUserId(value)) return '\u7528\u6237 ID \u5fc5\u987b\u662f 1-64 \u4f4d\u5b89\u5168\u6807\u8bc6\u7b26\u3002';
    const count = await ctx.store.remove((item) => item.value === value, 'users');
    await ctx.audit('friend-request.delete', { value, count });
    return count ? '\u597d\u53cb\u7533\u8bf7\u540d\u5355\u5df2\u5220\u9664\u3002' : '\u672a\u627e\u5230\u7528\u6237 ID\u3002';
  }
  return ctx.usage(usage);
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
  if (!ctx.groupId || ctx.groupId === 'private') return '\u6b64\u80fd\u529b\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <\u8bcd\u8bed> | \u5220\u9664 <\u8bcd\u8bed> | \u5217\u8868';
  const normalizeRule = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
    return normalized;
  };
  if (!args.length || action === '\u5217\u8868' || action === 'list') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('word-filter.list');
    return listRule(ctx, 'rules', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add') {
    const value = normalizeRule(args.slice(1).join(' '));
    if (!value) return ctx.usage('\u6dfb\u52a0 <\u8bcd\u8bed>');
    const item = await ctx.add({ value }, 'rules', { uniqueBy: 'value' });
    await ctx.audit('word-filter.add', { valueLength: item.value.length });
    return '\u8bcd\u8bed\u89c4\u5219\u5df2\u6dfb\u52a0\u3002';
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 2) return ctx.usage('\u5220\u9664 <\u8bcd\u8bed>');
    const value = normalizeRule(args[1]);
    if (!value) return ctx.usage('\u5220\u9664 <\u8bcd\u8bed>');
    const count = await ctx.store.remove((item) => item.value === value, 'rules');
    await ctx.audit('word-filter.delete', { valueLength: value.length, count });
    return count ? '\u8bcd\u8bed\u89c4\u5219\u5df2\u5220\u9664\u3002' : '\u672a\u627e\u5230\u89c4\u5219\u3002';
  }
  return ctx.usage(usage);
}
export async function handle16(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '\u6b64\u80fd\u529b\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <\u8bcd\u8bed\u6216\u57df\u540d> | \u5220\u9664 <\u89c4\u5219> | \u5217\u8868';
  const normalizeRule = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
    if (/^javascript\s*:/i.test(normalized)) return null;
    return normalized;
  };
  if (!args.length || action === '\u5217\u8868' || action === 'list') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('anti-ad.list');
    return listRule(ctx, 'rules', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add') {
    const value = normalizeRule(args.slice(1).join(' '));
    if (!value) return ctx.usage('\u6dfb\u52a0 <\u8bcd\u8bed\u6216\u57df\u540d>');
    const item = await ctx.add({ value }, 'rules', { uniqueBy: 'value' });
    await ctx.audit('anti-ad.add', { valueLength: item.value.length });
    return '\u5e7f\u544a\u89c4\u5219\u5df2\u6dfb\u52a0\u3002';
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 2) return ctx.usage('\u5220\u9664 <\u89c4\u5219>');
    const value = normalizeRule(args[1]);
    if (!value) return ctx.usage('\u5220\u9664 <\u89c4\u5219>');
    const count = await ctx.store.remove((item) => item.value === value, 'rules');
    await ctx.audit('anti-ad.delete', { valueLength: value.length, count });
    return count ? '\u5e7f\u544a\u89c4\u5219\u5df2\u5220\u9664\u3002' : '\u672a\u627e\u5230\u5e7f\u544a\u89c4\u5219\u3002';
  }
  return ctx.usage(usage);
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
