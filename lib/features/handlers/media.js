import { validateUrl } from '../../http/policy.js';
import { cleanText } from '../../core/safe.js';
import { handlerContext, required, actionIs, listMessage } from './context.js';

export async function handle36(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const value = required(args.join(' '), ctx.usage('<URL>'));
  try {
    const url = validateUrl(value);
    return ctx.summary('链接解析', [
      { label: '协议', value: url.protocol.replace(':', '') },
      { label: '主机', value: url.hostname },
      { label: '端口', value: url.port || '默认' },
      { label: '路径', value: url.pathname },
      { label: '参数数', value: String([...url.searchParams].length) }
    ]);
  } catch (error) {
    return '解析失败：' + error.message;
  }
}

export async function handle37(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') {
    const name = required(args.slice(1).join(' '), ctx.usage('添加 <歌曲名>'));
    const item = await ctx.add({ name, artist: '', source: 'user' }, 'songs');
    return '歌曲已加入候选：' + item.id;
  }
  const songs = await ctx.store.list('songs');
  if (!songs.length) return '暂无歌曲候选，请先添加。';
  if (action === '随机' || action === 'random' || !args.length) {
    const item = songs[Math.floor(Math.random() * songs.length)];
    return ctx.summary('歌曲推荐', [{ label: '歌曲', value: item.name }, { label: '歌手', value: item.artist || '未知' }]);
  }
  return listMessage(ctx, songs, { usage: '添加 <歌曲名> | 随机' });
}

export async function handle38(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const template = args[0] || '文字卡片';
  const value = required(args.slice(1).join(' '), ctx.usage('<模板> <文字>'));
  const safe = cleanText(value, { max: 800 });
  return ctx.summary('梗图文字内容', [
    { label: '模板', value: template },
    { label: '文字', value: safe },
    { label: '降级', value: '图片渲染不可用时保留上述文本' }
  ]);
}

export async function handle39(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const images = (event.segments || []).filter((segment) => segment.type === 'image').map((segment) => segment.url || segment.file).filter(Boolean);
  const values = images.length ? images : args;
  if (!values.length) return ctx.usage('发送图片或提供图片 URL');
  const accepted = [];
  for (const value of values.slice(0, 10)) {
    try { accepted.push(validateUrl(value).href); } catch {}
  }
  if (!accepted.length) return '没有可保存的安全图片 URL。';
  for (const url of accepted) await ctx.add({ url, source: 'message' }, 'images', { uniqueBy: 'url' });
  await ctx.audit('image.save', { count: accepted.length });
  return '已保存图片引用：' + accepted.length + ' 张。';
}

export async function handle40(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const media = (event.segments || []).filter((segment) => ['audio', 'video', 'file'].includes(segment.type));
  const values = media.length ? media : args.map((value) => ({ type: 'reference', url: value }));
  if (!values.length) return ctx.usage('发送语音/文件/媒体引用');
  const records = [];
  for (const segment of values.slice(0, 10)) {
    const url = segment.url || segment.file || '';
    if (url) records.push(await ctx.add({ type: segment.type, url: cleanText(url, { max: 2000 }), name: cleanText(segment.name || '', { max: 200 }) }, 'media'));
  }
  return records.length ? '媒体引用已记录：' + records.length + ' 条。' : '没有可记录的媒体引用。';
}

export async function handle41(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') {
    const trigger = required(args[1], ctx.usage('添加 <触发词> <回复>'));
    const response = required(args.slice(2).join(' '), ctx.usage('添加 <触发词> <回复>'));
    const item = await ctx.add({ trigger: cleanText(trigger, { max: 100 }), response: cleanText(response, { max: 1000 }), enabled: true }, 'rules', { uniqueBy: 'trigger' });
    return '自动回复规则已添加：' + item.id;
  }
  if (action === '删除' || action === 'del') return (await ctx.store.remove((item) => item.trigger === args[1], 'rules')) ? '规则已删除。' : '未找到规则。';
  return listMessage(ctx, await ctx.store.list('rules'), { usage: '添加 <触发词> <回复>' });
}

export async function handle42(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') {
    const word = required(args.slice(1).join(' '), ctx.usage('添加 <词语>'));
    const item = await ctx.add({ word: cleanText(word, { max: 200 }) }, 'words', { uniqueBy: 'word' });
    return '词库已添加：' + item.id;
  }
  if (action === '删除' || action === 'del') return (await ctx.store.remove((item) => item.word === args[1], 'words')) ? '词库项已删除。' : '未找到词库项。';
  return listMessage(ctx, await ctx.store.list('words'), { usage: '添加 <词语>' });
}

export async function handle43(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '清理' || action === 'clear') {
    await ctx.store.clear();
    return '群摘要数据已清理。';
  }
  const state = await ctx.store.read({ messages: [], counters: {} });
  const counters = state.counters || {};
  return ctx.summary('群摘要', [
    { label: '群', value: ctx.groupId || '私聊' },
    { label: '消息计数', value: String(counters.messages || state.messages?.length || 0) },
    { label: '命令计数', value: String(counters.commands || 0) },
    { label: '最近记录', value: state.messages?.slice(-5).map((item) => item.text).filter(Boolean).join(' | ') || '暂无' }
  ]);
}
