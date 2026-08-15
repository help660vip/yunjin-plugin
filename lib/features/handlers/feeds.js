import { fetchJson, fetchText } from '../../http/client.js';
import { validateUrl } from '../../http/policy.js';
import { parseDuration } from '../../parser/command.js';
import { hash } from '../../core/ids.js';
import { publicErrorMessage } from '../../core/errors.js';
import { handlerContext, required, actionIs, listMessage } from './context.js';
import { isGroupAdmin } from '../../auth/policy.js';

function listState(ctx, field = 'items', usage = '添加 <内容>') {
  return ctx.store.list(field).then((values) => listMessage(ctx, values, { usage }));
}

function extractTitles(raw) {
  const values = [];
  for (const match of String(raw).matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/giu)) {
    const value = match[1].replace(/<!\[CDATA\[|\]\]>/gu, '').replace(/<[^>]+>/gu, '').trim();
    if (value && !values.includes(value)) values.push(value);
  }
  return values.slice(0, 10);
}

export async function handle18(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '\u6b64\u80fd\u529b\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <\u76ee\u6807> [\u5468\u671f] | \u5220\u9664 <\u8ba2\u9605 ID> | \u5217\u8868';
  const normalizeTarget = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
    return normalized;
  };
  const schedulerReady = Boolean(runtime.scheduler && typeof runtime.scheduler.list === 'function' && typeof runtime.scheduler.create === 'function');
  if (!args.length || action === '\u5217\u8868' || action === 'list') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('subscription.list');
    return listState(ctx, 'subscriptions', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add' || action === '\u8ba2\u9605' || action === 'subscribe') {
    if (args.length < 2 || args.length > 3) return ctx.usage('\u6dfb\u52a0 <\u76ee\u6807> [\u5468\u671f]');
    if (!schedulerReady) return '\u8c03\u5ea6\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u8ba2\u9605\u672a\u521b\u5efa\u3002';
    const target = normalizeTarget(args[1]);
    if (!target) return '\u76ee\u6807\u4e0d\u80fd\u4e3a\u7a7a\u3001\u8d85\u8fc7 256 \u5b57\u7b26\u6216\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002';
    const interval = args[2] || '30m';
    const delayMs = parseDuration(interval, { defaultUnit: 'm', maxMs: 30 * 86400000 });
    if (!Number.isFinite(delayMs) || delayMs < 60 * 1000) return '\u5468\u671f\u5fc5\u987b\u81f3\u5c11 1 \u5206\u949f\u4e14\u4e0d\u8d85\u8fc7 30 \u5929\u3002';
    const existing = (await ctx.store.list('subscriptions')).find((item) => item.target === target);
    const item = existing || await ctx.add({ target, interval, enabled: true, lastSentKey: '' }, 'subscriptions', { uniqueBy: 'target' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.subscriptionId === item.id && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) {
      await ctx.audit('subscription.exists', { subscriptionId: item.id, taskId: activeTask.id });
      return '\u8ba2\u9605\u5df2\u5b58\u5728\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + activeTask.id;
    }
    let task;
    try {
      task = await runtime.scheduler.create({ featureId: ctx.id, title: target, delayMs, repeatMs: delayMs, dedupeKey: 'subscription:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'subscription', subscriptionId: item.id, target, interval, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    } catch (error) {
      if (!existing) await ctx.store.remove((entry) => entry.id === item.id, 'subscriptions');
      await ctx.audit('subscription.create.error', { subscriptionId: item.id });
      return '\u8ba2\u9605\u4efb\u52a1\u521b\u5efa\u5931\u8d25\uff0c\u8bb0\u5f55\u5df2\u56de\u6eda\u3002';
    }
    await ctx.audit('subscription.add', { subscriptionId: item.id, taskId: task.id });
    return '\u8ba2\u9605\u5df2\u6dfb\u52a0\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 2) return ctx.usage('\u5220\u9664 <\u8ba2\u9605 ID>');
    const id = String(args[1] || '').trim();
    if (!id) return ctx.usage('\u5220\u9664 <\u8ba2\u9605 ID>');
    const removed = await ctx.store.remove((item) => item.id === id, 'subscriptions');
    if (!removed) {
      await ctx.audit('subscription.delete', { subscriptionId: id, removed: false, cancelled: 0 });
      return '\u672a\u627e\u5230\u8ba2\u9605\u3002';
    }
    let cancelled = 0;
    if (runtime.scheduler && typeof runtime.scheduler.list === 'function' && typeof runtime.scheduler.cancel === 'function') {
      const tasks = await runtime.scheduler.list();
      const active = tasks.filter((task) => task.featureId === ctx.id && task.payload?.subscriptionId === id && ['scheduled', 'running'].includes(task.status));
      await Promise.all(active.map(async (task) => {
        if (await runtime.scheduler.cancel(task.id).catch(() => false)) cancelled += 1;
      }));
    }
    await ctx.audit('subscription.delete', { subscriptionId: id, removed: true, cancelled });
    return '\u8ba2\u9605\u5df2\u5220\u9664\u3002';
  }
  return ctx.usage(usage);
}
export async function handle19(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '\u6b64\u80fd\u529b\u53ea\u80fd\u5728\u7fa4\u804a\u4f7f\u7528\u3002';
  const action = String(args[0] || '').toLowerCase();
  const usage = '\u6dfb\u52a0 <RSS URL> | \u8bfb\u53d6 [RSS ID] | \u5220\u9664 <RSS ID> | \u5217\u8868';
  const schedulerReady = Boolean(runtime.scheduler && typeof runtime.scheduler.list === 'function' && typeof runtime.scheduler.create === 'function');
  if (!args.length || action === '\u5217\u8868' || action === 'list') {
    if (args.length > 1) return ctx.usage(usage);
    await ctx.audit('rss.list');
    return listState(ctx, 'feeds', usage);
  }
  if (action === '\u6dfb\u52a0' || action === 'add' || action === '\u8ba2\u9605' || action === 'subscribe') {
    if (args.length !== 2) return ctx.usage('\u6dfb\u52a0 <RSS URL>');
    if (!schedulerReady) return '\u8c03\u5ea6\u670d\u52a1\u4e0d\u53ef\u7528\uff0cRSS \u8ba2\u9605\u672a\u521b\u5efa\u3002';
    const value = required(args[1], ctx.usage('\u6dfb\u52a0 <RSS URL>'));
    const url = validateUrl(value);
    const existing = (await ctx.store.list('feeds')).find((item) => item.url === url.href);
    const item = existing || await ctx.add({ url: url.href, title: '', lastHash: '' }, 'feeds', { uniqueBy: 'url' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.target === item.url && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) {
      await ctx.audit('rss.exists', { feedId: item.id, taskId: activeTask.id });
      return 'RSS \u8ba2\u9605\u5df2\u5b58\u5728\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + activeTask.id;
    }
    let task;
    try {
      task = await runtime.scheduler.create({ featureId: ctx.id, title: 'RSS ' + item.url, delayMs: 30 * 60 * 1000, repeatMs: 30 * 60 * 1000, dedupeKey: 'rss:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'rss', target: item.url, feedId: item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    } catch (error) {
      if (!existing) await ctx.store.remove((entry) => entry.id === item.id, 'feeds');
      await ctx.audit('rss.create.error', { feedId: item.id });
      return 'RSS \u8ba2\u9605\u4efb\u52a1\u521b\u5efa\u5931\u8d25\uff0c\u8bb0\u5f55\u5df2\u56de\u6eda\u3002';
    }
    await ctx.audit('rss.add', { feedId: item.id, taskId: task.id });
    return 'RSS \u8ba2\u9605\u5df2\u6dfb\u52a0\uff1a' + item.id + '\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del' || action === 'delete') {
    if (args.length !== 2) return ctx.usage('\u5220\u9664 <RSS ID>');
    const id = String(args[1] || '').trim();
    if (!id) return ctx.usage('\u5220\u9664 <RSS ID>');
    const removed = await ctx.store.remove((item) => item.id === id, 'feeds');
    if (!removed) {
      await ctx.audit('rss.delete', { feedId: id, removed: false, cancelled: 0 });
      return '\u672a\u627e\u5230 RSS \u8ba2\u9605\u3002';
    }
    let cancelled = 0;
    if (runtime.scheduler && typeof runtime.scheduler.list === 'function' && typeof runtime.scheduler.cancel === 'function') {
      const tasks = await runtime.scheduler.list();
      const active = tasks.filter((task) => task.featureId === ctx.id && task.payload?.feedId === id && ['scheduled', 'running'].includes(task.status));
      await Promise.all(active.map(async (task) => {
        if (await runtime.scheduler.cancel(task.id).catch(() => false)) cancelled += 1;
      }));
    }
    await ctx.audit('rss.delete', { feedId: id, removed: true, cancelled });
    return 'RSS \u8ba2\u9605\u5df2\u5220\u9664\u3002';
  }
  if (action === '\u8bfb\u53d6' || action === 'read') {
    if (args.length > 2) return ctx.usage('\u8bfb\u53d6 [RSS ID]');
    const state = await ctx.store.read({ feeds: [] });
    const item = state.feeds?.find((entry) => entry.id === args[1]) || (args.length === 1 ? state.feeds?.[0] : undefined);
    if (!item) return '\u8bf7\u5148\u6dfb\u52a0 RSS URL\u3002';
    ctx.network();
    try {
      const raw = await fetchText(item.url, { maxBytes: 256 * 1024, timeoutMs: 5000, attempts: 2, cacheTtlMs: 60000, cacheStaleMs: 300000 });
      const titles = extractTitles(raw);
      item.title = titles[0] || item.title;
      item.lastHash = hash(raw);
      item.checkedAt = ctx.now;
      await ctx.update((next) => { next.feeds = state.feeds; return titles.length ? titles.join('\n') : '\u672a\u8bfb\u53d6\u5230\u6587\u7ae0\u6807\u9898\u3002'; }, { feeds: [] });
      await ctx.audit('rss.read', { feedId: item.id, count: titles.length });
      return titles.length ? titles.join('\n') : '\u672a\u8bfb\u53d6\u5230\u6587\u7ae0\u6807\u9898\u3002';
    } catch (error) {
      await ctx.audit('rss.read.error', { feedId: item.id });
      return 'RSS \u8bfb\u53d6\u5931\u8d25\uff1a' + publicErrorMessage(error);
    }
  }
  return ctx.usage(usage);
}
export async function handle20(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!event?.groupId || event.groupId === 'private') return '\u53ea\u80fd\u5728\u7fa4\u804a\u4e2d\u4f7f\u7528\u8be5\u529f\u80fd\u3002';
  const action = String(args[0] || '').toLowerCase();
  const usageAdd = ctx.usage('\u6dfb\u52a0 <B \u7ad9 UID \u6216\u94fe\u63a5>');
  const usageDelete = ctx.usage('\u5220\u9664 <\u8ba2\u9605 ID>');
  const usageList = ctx.usage('\u5217\u8868');

  const parseUid = (value) => {
    const target = String(value || '').trim();
    if (/^[0-9]{1,20}$/u.test(target)) return target;
    try {
      const url = new URL(target);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || !['bilibili.com', 'www.bilibili.com', 'space.bilibili.com'].includes(host)) return undefined;
      const pathUid = url.pathname.match(/^\/(?:space\/)?([0-9]{1,20})(?:\/|$)/u)?.[1];
      const queryUid = url.searchParams.get('mid') || url.searchParams.get('uid');
      return pathUid || (/^[0-9]{1,20}$/u.test(queryUid || '') ? queryUid : undefined);
    } catch {
      return undefined;
    }
  };

  if (action === '\u6dfb\u52a0' || action === 'add' || action === '\u8ba2\u9605') {
    if (args.length !== 2) return usageAdd;
    const target = required(args[1], usageAdd);
    const uid = parseUid(target);
    if (!uid) return '\u8bf7\u63d0\u4f9b\u6709\u6548\u7684 B \u7ad9 UID \u6216 https \u7528\u6237\u7a7a\u95f4\u94fe\u63a5\u3002';
    const api = 'https://api.bilibili.com/x/space/arc/search?mid=' + uid + '&ps=1&pn=1&order=pubdate&jsonp=jsonp';
    const state = await ctx.store.read({ subscriptions: [] });
    const existing = (state.subscriptions || []).find((entry) => entry.target === uid);
    const item = existing || await ctx.add({ target: uid, api, lastVideo: '', enabled: true }, 'subscriptions', { uniqueBy: 'target' });
    const scheduler = runtime.scheduler;
    if (!scheduler?.list || !scheduler?.create) {
      await ctx.audit('bili.subscribe', { subscriptionId: item.id, scheduler: 'unavailable', created: !existing });
      return 'B \u7ad9\u8ba2\u9605\u5df2\u4fdd\u5b58\uff1a' + item.id + '\\n\u8c03\u5ea6\u5668\u4e0d\u53ef\u7528\uff0c\u5df2\u964d\u7ea7\u4e3a\u624b\u52a8\u68c0\u67e5\u3002';
    }
    const activeTask = (await scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.biliId === item.id && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) {
      await ctx.audit('bili.subscribe', { subscriptionId: item.id, taskId: activeTask.id, duplicate: true });
      return '\u8ba2\u9605\u5df2\u5b58\u5728\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + activeTask.id;
    }
    let task;
    try {
      task = await scheduler.create({ featureId: ctx.id, title: 'Bili ' + uid, delayMs: 30 * 60 * 1000, repeatMs: 30 * 60 * 1000, dedupeKey: 'bili:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'bili', target: api, biliId: item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    } catch (error) {
      if (!existing) await ctx.store.remove((entry) => entry.id === item.id, 'subscriptions');
      await ctx.audit('bili.subscribe.failed', { subscriptionId: item.id, rolledBack: !existing, error: String(error?.message || error).slice(0, 160) });
      return 'B \u7ad9\u8ba2\u9605\u4efb\u52a1\u521b\u5efa\u5931\u8d25\uff0c\u5df2\u56de\u6eda\u672c\u6b21\u65b0\u589e\u3002';
    }
    await ctx.audit('bili.subscribe', { subscriptionId: item.id, taskId: task.id, created: !existing });
    return 'B \u7ad9\u8ba2\u9605\u5df2\u6dfb\u52a0\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del') {
    if (args.length !== 2) return usageDelete;
    const id = required(args[1], usageDelete);
    const removed = await ctx.store.remove((item) => item.id === id, 'subscriptions');
    if (!removed) return '\u672a\u627e\u5230\u8ba2\u9605\u3002';
    const scheduler = runtime.scheduler;
    let cancelled = 0;
    if (scheduler?.list && scheduler?.cancel) {
      const tasks = await scheduler.list();
      const matches = tasks.filter((task) => task.featureId === ctx.id && task.payload?.biliId === id && ['scheduled', 'running'].includes(task.status));
      const results = await Promise.all(matches.map((task) => scheduler.cancel(task.id).catch(() => false)));
      cancelled = results.filter(Boolean).length;
    }
    await ctx.audit('bili.unsubscribe', { subscriptionId: id, cancelled });
    return 'B \u7ad9\u8ba2\u9605\u5df2\u5220\u9664\u3002';
  }
  if (action === '\u5217\u8868' || action === 'list' || !args.length) {
    if (args.length > 1) return usageList;
    await ctx.audit('bili.list', { scheduler: Boolean(runtime.scheduler?.list) });
    return listState(ctx, 'subscriptions', usageAdd);
  }
  return usageList;
}

export async function handle21(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!event?.groupId || event.groupId === 'private') return '\u53ea\u80fd\u5728\u7fa4\u804a\u4e2d\u4f7f\u7528\u8be5\u529f\u80fd\u3002';
  const action = String(args[0] || '').toLowerCase();
  const usageList = ctx.usage('\u5217\u8868');
  const usageCancel = ctx.usage('\u53d6\u6d88 <\u4efb\u52a1 ID>');
  const usageCreate = ctx.usage('<\u65f6\u957f> <\u5185\u5bb9>');
  const scheduler = runtime.scheduler;
  if (!scheduler?.list || !scheduler?.create) return '\u8c03\u5ea6\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u65e0\u6cd5\u7ba1\u7406\u5e7f\u64ad\u3002';
  const manager = isGroupAdmin(event);
  const inScope = (task) => task.featureId === ctx.id && task.groupId === ctx.groupId && (manager || task.userId === ctx.userId);
  const listTasks = async () => (await scheduler.list()).filter(inScope);
  const formatTask = (task) => task.id + ' ' + task.status + ' ' + runtime.core.clock.format(task.runAt);

  if (action === '\u5217\u8868' || action === 'list' || !args.length) {
    if (args.length > 1) return usageList;
    const tasks = await listTasks();
    const visible = tasks.filter((task) => !['cancelled', 'completed'].includes(task.status));
    await ctx.audit('broadcast.list', { count: visible.length, manager });
    return visible.length ? visible.map(formatTask).join('\\n') : '\u6682\u65e0\u5e7f\u64ad\u4efb\u52a1\u3002';
  }
  if (action === '\u53d6\u6d88' || action === 'cancel') {
    if (args.length !== 2) return usageCancel;
    const id = required(args[1], usageCancel);
    const task = typeof scheduler.find === 'function' ? await scheduler.find(id) : (await scheduler.list()).find((entry) => entry.id === id);
    if (!task || !inScope(task)) return '\u672a\u627e\u5230\u53ef\u64cd\u4f5c\u5e7f\u64ad\u3002';
    const cancelled = typeof scheduler.cancel === 'function' ? await scheduler.cancel(id) : false;
    await ctx.audit('broadcast.cancel', { taskId: id, cancelled: Boolean(cancelled), manager });
    return cancelled ? '\u5e7f\u64ad\u5df2\u53d6\u6d88\u3002' : '\u672a\u627e\u5230\u53ef\u64cd\u4f5c\u5e7f\u64ad\u3002';
  }
  if (args.length < 2) return usageCreate;
  let delayMs;
  try {
    delayMs = parseDuration(args[0], { defaultUnit: 'm', maxMs: 365 * 86400000 });
  } catch {
    return usageCreate;
  }
  if (!Number.isFinite(delayMs) || delayMs <= 0) return usageCreate;
  const content = required(args.slice(1).join(' '), usageCreate);
  const hasControl = [...content].some((character) => {
    const code = character.codePointAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
  if (content.length > 1000 || hasControl) return usageCreate;
  let task;
  try {
    task = await scheduler.create({ featureId: ctx.id, title: content, delayMs, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { content, groupId: ctx.groupId, botId: ctx.botId } });
  } catch (error) {
    await ctx.audit('broadcast.create.failed', { error: String(error?.message || error).slice(0, 160) });
    return '\u5e7f\u64ad\u4efb\u52a1\u521b\u5efa\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
  }
  await ctx.audit('broadcast.create', { taskId: task.id, delayMs });
  return '\u5e7f\u64ad\u4efb\u52a1\u5df2\u521b\u5efa\uff1a' + task.id;
}

export async function handle22(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const state = await ctx.store.read({ reports: [] });
  const report = { id: ctx.newId(), createdAt: ctx.now, scope: ctx.groupId || 'private', messages: Number(state.messageCount || 0), commands: Number(state.commandCount || 0), records: Number(state.reports?.length || 0) };
  await ctx.update((next) => { next.reports = [report, ...(next.reports || [])].slice(0, 50); return report; }, { reports: [] });
  await ctx.audit('report.generate', { reportId: report.id });
  return ctx.summary('群组报告', [
    { label: '作用域', value: report.scope },
    { label: '命令数', value: report.commands },
    { label: '记录数', value: report.records },
    { label: '生成时间', value: runtime.core.clock.format(report.createdAt) }
  ]);
}

export async function handle23(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u91cd\u8bd5' || action === 'retry') {
    const id = required(args[1], ctx.usage('\u91cd\u8bd5 <\u63a8\u9001 ID>'));
    const state = await ctx.store.read({ items: [] });
    const item = state.items?.find((entry) => entry.id === id);
    if (!item) return '\u672a\u627e\u5230\u63a8\u9001\u8bb0\u5f55\u3002';
    if (!runtime.notifications?.publish) return '\u901a\u77e5\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u65e0\u6cd5\u91cd\u8bd5\u3002';
    const result = await runtime.notifications.publish('task.execute', {
      taskId: item.taskId,
      featureId: item.featureId,
      runAt: item.runAt || ctx.now,
      payload: item.payload || {}
    }, { dedupe: false, attempts: 1 });
    await ctx.update((next) => {
      const items = Array.isArray(next.items) ? next.items : [];
      const current = items.find((entry) => entry.id === id);
      if (current) {
        current.status = result.ok ? 'sent' : 'failed';
        current.retryCount = Number(current.retryCount || 0) + 1;
        current.updatedAt = ctx.now;
        if (!result.ok) current.error = String(result.results?.find((entry) => !entry.ok)?.error || 'notification delivery failed').slice(0, 300);
      }
      next.items = items;
      return current;
    }, { items: [] });
    return result.ok ? '\u63a8\u9001\u91cd\u8bd5\u6210\u529f\uff1a' + id : '\u63a8\u9001\u91cd\u8bd5\u5931\u8d25\uff1a' + id;
  }
  return listState(ctx, 'items', '\u91cd\u8bd5 <\u63a8\u9001 ID>');
}

export async function handle24(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const state = await ctx.store.read({ sources: [] });
  if (action === '添加' || action === 'add') {
    const url = required(args[1], ctx.usage('添加 <信息源 URL>'));
    const target = validateUrl(url);
    const item = await ctx.add({ url: target.href, enabled: true }, 'sources', { uniqueBy: 'url' });
    return '信息源已添加：' + item.id;
  }
  if (action === '刷新' || action === 'refresh') {
    ctx.network();
    const output = [];
    for (const source of (state.sources || []).slice(0, 10)) {
      try {
        const raw = await fetchText(source.url, { maxBytes: 128 * 1024, timeoutMs: 4000, attempts: 1, cacheTtlMs: 300000, cacheStaleMs: 600000 });
        const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.trim();
        if (title) output.push(title);
      } catch {}
    }
    return output.length ? output.join('\n') : '没有可用信息源，已保留文本降级。';
  }
  return listState(ctx, 'sources', '添加 <信息源 URL> | 刷新');
}

export async function handle25(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'bot' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u6dfb\u52a0' || action === 'add') {
    const url = required(args[1], ctx.usage('\u6dfb\u52a0 <Git URL>'));
    const target = validateUrl(url);
    const item = await ctx.add({ url: target.href, lastHash: '', lastCheckedAt: 0 }, 'repositories', { uniqueBy: 'url' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.repoId === item.id && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) return '\u8f6e\u8be2\u5df2\u5b58\u5728\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + activeTask.id;
    const task = await runtime.scheduler.create({ featureId: ctx.id, title: 'Git ' + target.href, delayMs: 30 * 60 * 1000, repeatMs: 30 * 60 * 1000, dedupeKey: 'git:' + ctx.botId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'git', repoId: item.id, target: target.href, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    await ctx.audit('git.add', { repositoryId: item.id, taskId: task.id });
    return '\u8f6e\u8be2\u76ee\u6807\u5df2\u6dfb\u52a0\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del') {
    const id = required(args[1], ctx.usage('\u5220\u9664 <\u76ee\u6807 ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'repositories');
    if (!removed) return '\u672a\u627e\u5230\u8f6e\u8be2\u76ee\u6807\u3002';
    const tasks = await runtime.scheduler.list();
    await Promise.all(tasks.filter((task) => task.featureId === ctx.id && task.payload?.repoId === id && ['scheduled', 'running'].includes(task.status)).map((task) => runtime.scheduler.cancel(task.id).catch(() => false)));
    return '\u8f6e\u8be2\u76ee\u6807\u5df2\u5220\u9664\u3002';
  }
  if (action === '\u68c0\u67e5' || action === 'check') {
    const state = await ctx.store.read({ repositories: [] });
    const item = state.repositories?.find((entry) => entry.id === args[1]) || state.repositories?.[0];
    if (!item) return ctx.usage('\u6dfb\u52a0 <Git URL> | \u68c0\u67e5 [\u76ee\u6807 ID]');
    ctx.network();
    try {
      const raw = await fetchText(item.url, { maxBytes: 128 * 1024, timeoutMs: 5000, attempts: 2, cache: false });
      const nextHash = hash(raw);
      const changed = item.lastHash && item.lastHash !== nextHash;
      item.lastHash = nextHash;
      item.lastCheckedAt = ctx.now;
      await ctx.update((next) => { next.repositories = state.repositories; return item; }, { repositories: [] });
      return '\u68c0\u67e5\u5b8c\u6210\uff1a' + (changed ? '\u53d1\u73b0\u5185\u5bb9\u53d8\u5316\u3002' : '\u65e0\u53d8\u5316\u3002');
    } catch (error) {
      return 'Git \u8f6e\u8be2\u5931\u8d25\uff1a' + publicErrorMessage(error);
    }
  }
  return listState(ctx, 'repositories', '\u6dfb\u52a0 <Git URL> | \u68c0\u67e5 [\u76ee\u6807 ID] | \u5220\u9664 <ID>');
}

export async function handle26(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const city = required(args.join(' '), ctx.usage('<城市>'), '请提供城市。');
  ctx.network();
  try {
    const geo = await fetchJson('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh&format=json', { hosts: ['open-meteo.com'], timeoutMs: 5000, attempts: 2 });
    const place = geo.results?.[0];
    if (!place) return '未找到城市。';
    const weather = await fetchJson('https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(place.latitude) + '&longitude=' + encodeURIComponent(place.longitude) + '&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FShanghai', { hosts: ['open-meteo.com'], timeoutMs: 5000, attempts: 2 });
    const current = weather.current || {};
    return ctx.summary(place.name, [
      { label: '温度', value: String(current.temperature_2m ?? '-') + ' C' },
      { label: '湿度', value: String(current.relative_humidity_2m ?? '-') + '%' },
      { label: '更新时间', value: current.time ? String(current.time) : '-' }
    ]);
  } catch (error) {
    return '天气服务不可用：' + publicErrorMessage(error);
  }
}
