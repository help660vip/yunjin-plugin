import { fetchJson, fetchText } from '../../http/client.js';
import { validateUrl } from '../../http/policy.js';
import { parseDuration } from '../../parser/command.js';
import { hash } from '../../core/ids.js';
import { publicErrorMessage } from '../../core/errors.js';
import { handlerContext, required, actionIs, listMessage } from './context.js';

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
    const item = await ctx.add({ target, interval, enabled: true, lastSentKey: '' }, 'subscriptions', { uniqueBy: 'target' });
    const task = await runtime.scheduler.create({ featureId: ctx.id, title: '订阅 ' + target, delayMs, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { subscriptionId: item.id, target } });
    await ctx.audit('subscription.add', { subscriptionId: item.id, taskId: task.id });
    return '订阅已添加：' + item.id + '\n任务：' + task.id;
  }
  if (action === '删除' || action === 'del') {
    const id = required(args[1], ctx.usage('删除 <订阅 ID>'));
    const removed = await ctx.store.remove((item) => item.id === id, 'subscriptions');
    return removed ? '订阅已删除。' : '未找到订阅。';
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
    await ctx.audit('rss.add', { feedId: item.id });
    return 'RSS 已添加：' + item.id;
  }
  if (action === '删除' || action === 'del') {
    const id = required(args[1], ctx.usage('删除 <RSS ID>'));
    return (await ctx.store.remove((item) => item.id === id, 'feeds')) ? 'RSS 已删除。' : '未找到 RSS。';
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
  if (action === '添加' || action === 'add' || action === '订阅') {
    const target = required(args[1], ctx.usage('添加 <UID 或 URL>'));
    const item = await ctx.add({ target, lastVideo: '', enabled: true }, 'subscriptions', { uniqueBy: 'target' });
    await ctx.audit('bili.subscribe', { subscriptionId: item.id });
    return 'B 站订阅已添加：' + item.id;
  }
  if (action === '删除' || action === 'del') return (await ctx.store.remove((item) => item.id === args[1], 'subscriptions')) ? 'B 站订阅已删除。' : '未找到订阅。';
  return listState(ctx, 'subscriptions', '添加 <UID 或 URL>');
}

export async function handle21(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '列表' || action === 'list' || !args.length) {
    const tasks = (await runtime.scheduler.list()).filter((task) => task.featureId === ctx.id && task.groupId === ctx.groupId);
    return tasks.length ? tasks.map((task) => task.id + ' ' + task.status + ' ' + runtime.core.clock.format(task.runAt)).join('\n') : '暂无广播任务。';
  }
  if (action === '取消' || action === 'cancel') return await runtime.scheduler.cancel(required(args[1], ctx.usage('取消 <任务 ID>'))) ? '广播已取消。' : '未找到广播。';
  const delayMs = parseDuration(args[0], { defaultUnit: 'm', maxMs: 365 * 86400000 });
  const content = required(args.slice(1).join(' '), ctx.usage('<时长> <内容>'));
  const task = await runtime.scheduler.create({ featureId: ctx.id, title: content, delayMs, groupId: ctx.groupId, userId: ctx.userId, botId: ctx.botId, payload: { content, groupId: ctx.groupId, botId: ctx.botId } });
  await ctx.audit('broadcast.create', { taskId: task.id });
  return '广播任务已创建：' + task.id;
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
  if (action === '重试' || action === 'retry') {
    const id = required(args[1], ctx.usage('重试 <推送 ID>'));
    const state = await ctx.store.read({ items: [] });
    const item = state.items?.find((entry) => entry.id === id);
    if (!item) return '未找到推送记录。';
    item.status = 'queued';
    item.retryCount = Number(item.retryCount || 0) + 1;
    await ctx.update((next) => { next.items = state.items; return item; }, { items: [] });
    return '推送已重新排队。';
  }
  return listState(ctx, 'items', '重试 <推送 ID>');
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
  if (action === '添加' || action === 'add') {
    const url = required(args[1], ctx.usage('添加 <Git URL>'));
    const target = validateUrl(url);
    const item = await ctx.add({ url: target.href, lastHash: '', lastCheckedAt: 0 }, 'repositories', { uniqueBy: 'url' });
    return 'Git 轮询目标已添加：' + item.id;
  }
  if (action === '检查' || action === 'check') {
    const state = await ctx.store.read({ repositories: [] });
    const item = state.repositories?.find((entry) => entry.id === args[1]) || state.repositories?.[0];
    if (!item) return ctx.usage('添加 <Git URL> | 检查 [目标 ID]');
    ctx.network();
    try {
      const raw = await fetchText(item.url, { maxBytes: 128 * 1024, timeoutMs: 5000, attempts: 2, cache: false });
      const nextHash = hash(raw);
      const changed = item.lastHash && item.lastHash !== nextHash;
      item.lastHash = nextHash;
      item.lastCheckedAt = ctx.now;
      await ctx.update((next) => { next.repositories = state.repositories; return item; }, { repositories: [] });
      return '检查完成：' + (changed ? '发现内容变化。' : '无变化。');
    } catch (error) {
      return 'Git 轮询失败：' + publicErrorMessage(error);
    }
  }
  return listState(ctx, 'repositories', '添加 <Git URL> | 检查 [目标 ID]');
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
