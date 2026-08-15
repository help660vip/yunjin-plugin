import { fetchJson } from '../../http/client.js';
import { validateUrl } from '../../http/policy.js';
import { publicErrorMessage } from '../../core/errors.js';
import { handlerContext, required, actionIs, listMessage } from './context.js';
import { providerContext } from '../../adapters/providers.js';

const dictionary = new Map([
  ['hello', '你好'],
  ['world', '世界'],
  ['thanks', '谢谢'],
  ['你好', 'hello'],
  ['世界', 'world']
]);

export async function handle27(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const usage = ctx.usage('<\u6587\u672c>');
  const input = required(args.join(' '), usage);
  const hasControl = [...input].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });
  if (input.length > 1000 || hasControl) return usage;
  const direct = dictionary.get(input.toLowerCase());
  if (direct) {
    await ctx.audit('translation.local', { length: input.length });
    return '\u8bd1\u6587\uff1a' + direct + '\\n\u6765\u6e90\uff1a\u672c\u5730\u57fa\u7840\u8bcd\u5178';
  }
  const provider = runtime.config?.getGlobal?.('providers.translation') || '';
  if (!provider || !runtime.providers?.query) {
    await ctx.audit('translation.fallback', { provider: Boolean(provider), length: input.length });
    return '\u539f\u6587\uff1a' + input + '\\n\u672a\u914d\u7f6e\u5728\u7ebf\u7ffb\u8bd1\u670d\u52a1\uff0c\u5df2\u5b89\u5168\u4fdd\u7559\u539f\u6587\u3002';
  }
  let result;
  try {
    result = await runtime.providers.query(provider, providerContext({ runtime, event, featureId: ctx.id, config: runtime.config, logger: runtime.logger }), { text: input, query: input });
  } catch (error) {
    await ctx.audit('translation.failed', { provider, error: String(error?.message || error).slice(0, 160) });
    return '\u7ffb\u8bd1\u670d\u52a1\u4e0d\u53ef\u7528\uff1a' + publicErrorMessage(error) + '\\n\u539f\u6587\uff1a' + input;
  }
  if (!result?.ok) {
    await ctx.audit('translation.failed', { provider, error: String(result?.error || 'provider error').slice(0, 160) });
    return '\u7ffb\u8bd1\u670d\u52a1\u4e0d\u53ef\u7528\uff1a' + String(result?.error || '\u672a\u77e5\u9519\u8bef').slice(0, 160) + '\\n\u539f\u6587\uff1a' + input;
  }
  const translated = typeof result.value === 'string' ? result.value : result.value?.translation ?? result.value?.text ?? '';
  const output = String(translated || input).slice(0, 1000);
  await ctx.audit('translation.provider', { provider: result.provider || provider, length: output.length });
  return '\u8bd1\u6587\uff1a' + output + '\\n\u6765\u6e90\uff1a' + String(result.provider || provider).slice(0, 80);
}

export async function handle28(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const usage = ctx.usage('<\u5173\u952e\u8bcd>');
  const query = required(args.join(' '), usage);
  const hasControl = [...query].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });
  if (query.length > 128 || hasControl) return usage;
  try {
    ctx.quota('savedItemsDaily', 1);
  } catch (error) {
    await ctx.audit('image.search.denied', { reason: 'quota', error: String(error?.message || error).slice(0, 120) });
    return '\u914d\u989d\u4e0d\u8db3\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
  }
  const url = 'https://www.bing.com/images/search?q=' + encodeURIComponent(query);
  await ctx.audit('image.search', { length: query.length });
  return ctx.summary('\u56fe\u7247\u641c\u7d22', [{ label: '\u5173\u952e\u8bcd', value: query }, { label: '\u7ed3\u679c', value: url }], { render: true });
}

function qrUrl(value, size) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(value);
}

export async function handle29(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const usage = ctx.usage('<\u6587\u672c\u6216 URL>');
  const value = required(args.join(' '), usage);
  const hasControl = [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });
  if (value.length > 2048 || hasControl) return usage;
  await ctx.audit('qr.generate', { length: value.length, size: 300 });
  return ctx.summary('\u4e8c\u7ef4\u7801', [{ label: '\u5185\u5bb9', value }, { label: '\u56fe\u7247\u94fe\u63a5', value: qrUrl(value, 300) }], { render: true });
}

export async function handle30(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const value = required(args.join(' '), ctx.usage('<文本或 URL>'));
  return ctx.summary('二维码渲染', [{ label: '内容', value }, { label: '图片链接', value: qrUrl(value, 500) }], { render: true });
}

export async function handle31(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  const state = await ctx.store.read({ links: {} });
  if (action === '解析' || action === 'resolve') {
    const code = required(args[1], ctx.usage('解析 <短码>'));
    return state.links?.[code] ? '原链接：' + state.links[code] : '未找到短码。';
  }
  const value = required(args[0] === '生成' || action === 'create' ? args.slice(1).join(' ') : args.join(' '), ctx.usage('<URL>'));
  const url = validateUrl(value);
  const code = ctx.stable(url.href, ctx.now).slice(0, 8);
  state.links = { ...(state.links || {}), [code]: url.href };
  await ctx.update((next) => { next.links = state.links; return code; }, { links: {} });
  return ctx.summary('短链接', [{ label: '短码', value: code }, { label: '原链接', value: url.href }]);
}

export async function handle32(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const query = required(args.join(' '), ctx.usage('<关键词>'));
  ctx.network();
  try {
    const data = await fetchJson('https://zh.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query), { hosts: ['wikipedia.org'], timeoutMs: 5000, attempts: 2, cacheTtlMs: 300000, cacheStaleMs: 600000 });
    return ctx.summary(data.title || query, [
      { label: '摘要', value: data.extract || '暂无摘要' },
      { label: '来源', value: data.content_urls?.desktop?.page || '' }
    ]);
  } catch (error) {
    return '百科服务不可用：' + publicErrorMessage(error);
  }
}

export async function handle33(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const amount = Number(args[0]);
  const from = String(args[1] || 'CNY').toUpperCase();
  const to = String(args[2] || 'USD').toUpperCase();
  if (!Number.isFinite(amount) || amount < 0) return ctx.usage('<金额> <源货币> <目标货币>');
  if (!/^[A-Z]{3}$/u.test(from) || !/^[A-Z]{3}$/u.test(to)) return '货币代码必须是 3 位字母。';
  ctx.network();
  try {
    const data = await fetchJson('https://api.frankfurter.app/latest?amount=' + amount + '&from=' + from + '&to=' + to, { hosts: ['frankfurter.app'], timeoutMs: 5000, attempts: 2, cacheTtlMs: 300000, cacheStaleMs: 600000 });
    return ctx.summary('汇率换算', [{ label: '输入', value: amount + ' ' + from }, { label: '结果', value: String(data.rates?.[to] ?? '-') + ' ' + to }]);
  } catch (error) {
    return '汇率服务不可用：' + publicErrorMessage(error);
  }
}

export async function handle34(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') {
    const value = required(args.slice(1).join(' '), ctx.usage('添加 <内容>'));
    const item = await ctx.add({ text: value, done: false }, 'items');
    return '待办已添加：' + item.id;
  }
  if (action === '完成' || action === 'done') {
    const id = required(args[1], ctx.usage('完成 <待办 ID>'));
    const state = await ctx.store.read({ items: [] });
    const item = state.items?.find((entry) => entry.id === id);
    if (!item) return '未找到待办。';
    item.done = true;
    item.completedAt = ctx.now;
    await ctx.update((next) => { next.items = state.items; return item; }, { items: [] });
    return '待办已完成：' + id;
  }
  const items = (await ctx.store.list('items')).filter((item) => !item.done);
  return listMessage(ctx, items, { usage: '添加 <内容> | 完成 <待办 ID>' });
}

export async function handle35(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const timeZone = args[0] || runtime.config.getGlobal('core.timezone') || ctx.runtime.core.clock.timeZone;
  try {
    const value = ctx.runtime.core.clock.format(ctx.now, { timeZone });
    return ctx.summary('当前时间', [{ label: '时区', value: timeZone }, { label: '时间', value }, { label: '时间戳', value: String(ctx.now) }]);
  } catch {
    return '时区无效，请使用 IANA 时区名称。';
  }
}
