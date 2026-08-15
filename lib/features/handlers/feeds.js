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
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add' || action === '订阅' || action === 'subscribe') {
    const target = required(args[1], ctx.usage('添加 <目标> [周期]'));
    const interval = args[2] || '30m';
    const delayMs = parseDuration(interval, { defaultUnit: 'm', maxMs: 30 * 86400000 });
    if (!Number.isFinite(delayMs) || delayMs < 60 * 1000) return '\u8bf7\u8bbe\u7f6e\u81f3\u5c11 1 \u5206\u949f';
    const item = await ctx.add({ target, interval, enabled: true, lastSentKey: '' }, 'subscriptions', { uniqueBy: 'target' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.subscriptionId === item.id && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) return '\u8ba2\u9605\u5df2\u5b58\u5728?' + item.id + '\n\u4efb\u52a1?' + activeTask.id;
    const task = await runtime.scheduler.create({ featureId: ctx.id, title: target, delayMs, repeatMs: delayMs, dedupeKey: 'subscription:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'subscription', subscriptionId: item.id, target, interval, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    await ctx.audit('subscription.add', { subscriptionId: item.id, taskId: task.id });
    return '订阅已添加：' + item.id + '\n任务：' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del') {
    const id = required(args[1], ctx.usage('\u5220\u9664 <\u8ba2\u9605 ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'subscriptions');
    if (!removed) return '\u672a\u627e\u5230\u8ba2\u9605\u3002';
    const tasks = await runtime.scheduler.list();
    await Promise.all(tasks.filter((task) => task.featureId === ctx.id && task.payload?.subscriptionId === id && ['scheduled', 'running'].includes(task.status)).map((task) => runtime.scheduler.cancel(task.id).catch(() => false)));
    return '\u8ba2\u9605\u5df2\u5220\u9664\u3002';
  }
  return listState(ctx, 'subscriptions', '添加 <目标> [周期]');
}

export async function handle19(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add' || action === '订阅') {
    const value = required(args[1], ctx.usage('添加 <RSS URL>'));
    const url = validateUrl(value);
    const item = await ctx.add({ url: url.href, title: '', lastHash: '' }, 'feeds', { uniqueBy: 'url' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.target === item.url && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) return '订阅已存在?' + item.id + '\n任务?' + activeTask.id;
    const task = await runtime.scheduler.create({ featureId: ctx.id, title: 'RSS ' + item.url, delayMs: 30 * 60 * 1000, repeatMs: 30 * 60 * 1000, dedupeKey: 'rss:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'rss', target: item.url, feedId: item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    await ctx.audit('rss.add', { feedId: item.id, taskId: task.id });
    return 'RSS ' + item.id + '\n任务?' + task.id;
  }
  if (action === '删除' || action === 'del') {
    const id = required(args[1], ctx.usage('删除 <RSS ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'feeds');
    if (!removed) return '未找到 RSS?';
    const tasks = await runtime.scheduler.list();
    await Promise.all(tasks.filter((task) => task.featureId === ctx.id && task.payload?.feedId === id && ['scheduled', 'running'].includes(task.status)).map((task) => runtime.scheduler.cancel(task.id).catch(() => false)));
    return 'RSS 已删除?';
  }
  if (action === '读取' || action === 'read') {
    const state = await ctx.store.read({ feeds: [] });
    const item = state.feeds?.find((entry) => entry.id === args[1]) || state.feeds?.[0];
    if (!item) return '请先添加 RSS URL。';
    ctx.network();
    try {
      const raw = await fetchText(item.url, { maxBytes: 256 * 1024, timeoutMs: 5000, attempts: 2, cacheTtlMs: 60000, cacheStaleMs: 300000 });
      const titles = extractTitles(raw);
      item.title = titles[0] || item.title;
      item.lastHash = hash(raw);
      item.checkedAt = ctx.now;
      await ctx.update((next) => { next.feeds = state.feeds; return titles.length ? titles.join('\n') : '未读取到文章标题。'; }, { feeds: [] });
      await ctx.audit('rss.read', { feedId: item.id, count: titles.length });
      return titles.length ? titles.join('\n') : '未读取到文章标题。';
    } catch (error) {
      return 'RSS 读取失败：' + publicErrorMessage(error);
    }
  }
  return listState(ctx, 'feeds', '添加 <RSS URL> | 读取 [RSS ID]');
}

export async function handle20(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '\u6dfb\u52a0' || action === 'add' || action === '\u8ba2\u9605') {
    const target = required(args[1], ctx.usage('\u6dfb\u52a0 <B \u7ad9 UID \u6216\u94fe\u63a5>'));
    const direct = /^[0-9]{1,20}$/u.test(target.trim());
    const numeric = target.match(/[0-9]{1,20}/u)?.[0];
    const uid = direct ? target.trim() : target.includes('bilibili.com') ? numeric : undefined;
    if (!uid) return '\u8bf7\u63d0\u4f9b\u6709\u6548\u7684 B \u7ad9 UID \u6216\u7528\u6237\u7a7a\u95f4\u94fe\u63a5\u3002';
    const api = 'https://api.bilibili.com/x/space/arc/search?mid=' + uid + '&ps=1&pn=1&order=pubdate&jsonp=jsonp';
    const item = await ctx.add({ target: uid, api, lastVideo: '', enabled: true }, 'subscriptions', { uniqueBy: 'target' });
    const activeTask = (await runtime.scheduler.list()).find((entry) => entry.featureId === ctx.id && entry.payload?.biliId === item.id && ['scheduled', 'running'].includes(entry.status));
    if (activeTask) return '\u8ba2\u9605\u5df2\u5b58\u5728\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + activeTask.id;
    const task = await runtime.scheduler.create({ featureId: ctx.id, title: 'Bili ' + uid, delayMs: 30 * 60 * 1000, repeatMs: 30 * 60 * 1000, dedupeKey: 'bili:' + ctx.botId + ':' + ctx.groupId + ':' + item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { kind: 'bili', target: api, biliId: item.id, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId } });
    await ctx.audit('bili.subscribe', { subscriptionId: item.id, taskId: task.id });
    return 'B \u7ad9\u8ba2\u9605\u5df2\u6dfb\u52a0\uff1a' + item.id + '\\n\u4efb\u52a1\uff1a' + task.id;
  }
  if (action === '\u5220\u9664' || action === 'del') {
    const id = required(args[1], ctx.usage('\u5220\u9664 <\u8ba2\u9605 ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'subscriptions');
    if (!removed) return '\u672a\u627e\u5230\u8ba2\u9605\u3002';
    const tasks = await runtime.scheduler.list();
    await Promise.all(tasks.filter((task) => task.featureId === ctx.id && task.payload?.biliId === id && ['scheduled', 'running'].includes(task.status)).map((task) => runtime.scheduler.cancel(task.id).catch(() => false)));
    return 'B \u7ad9\u8ba2\u9605\u5df2\u5220\u9664\u3002';
  }
  return listState(ctx, 'subscriptions', '\u6dfb\u52a0 <B \u7ad9 UID \u6216\u94fe\u63a5>');
}

export async function handle21(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  const manager = isGroupAdmin(event);
  const inScope = (task) => task.featureId === ctx.id && task.botId === ctx.botId && task.groupId === ctx.groupId && (manager || task.userId === ctx.userId);
  if (action === '\u5217\u8868' || action === 'list' || !args.length) {
    const tasks = (await runtime.scheduler.list()).filter(inScope);
    return tasks.length ? tasks.map((task) => task.id + ' ' + task.status + ' ' + runtime.core.clock.format(task.runAt)).join('\\n') : '\u6682\u65e0\u5e7f\u64ad\u4efb\u52a1\u3002';
  }
  if (action === '\u53d6\u6d88' || action === 'cancel') {
    const id = required(args[1], ctx.usage('\u53d6\u6d88 <\u4efb\u52a1 ID>'));
    const task = await runtime.scheduler.find(id);
    if (!task || !inScope(task)) return '\u672a\u627e\u5230\u53ef\u64cd\u4f5c\u5e7f\u64ad\u3002';
    return await runtime.scheduler.cancel(id) ? '\u5e7f\u64ad\u5df2\u53d6\u6d88\u3002' : '\u672a\u627e\u5230\u5e7f\u64ad\u3002';
  }
  const delayMs = parseDuration(args[0], { defaultUnit: 'm', maxMs: 365 * 86400000 });
  const content = required(args.slice(1).join(' '), ctx.usage('<\u65f6\u957f> <\u5185\u5bb9>'));
  const task = await runtime.scheduler.create({ featureId: ctx.id, title: content, delayMs, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { content, groupId: ctx.groupId, botId: ctx.botId } });
  await ctx.audit('broadcast.create', { taskId: task.id });
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
