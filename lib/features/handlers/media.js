import { validateUrl } from '../../http/policy.js';
import { cleanText } from '../../core/safe.js';
import { publicErrorMessage } from '../../core/errors.js';
import { handlerContext, required, actionIs, listMessage } from './context.js';

export async function handle36(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const usage = ctx.usage('<URL>');
  const value = String(args.join(' ') || '').trim();
  const hasControl = [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });
  if (!value || value.length > 2048 || hasControl) return usage;
  try {
    const url = validateUrl(value);
    await ctx.audit('url.parse', { protocol: url.protocol, host: url.hostname, length: value.length });
    return ctx.summary('\u94fe\u63a5\u89e3\u6790', [
      { label: '\u534f\u8bae', value: url.protocol.replace(':', '') },
      { label: '\u4e3b\u673a', value: url.hostname },
      { label: '\u7aef\u53e3', value: url.port || '\u9ed8\u8ba4' },
      { label: '\u8def\u5f84', value: url.pathname },
      { label: '\u53c2\u6570\u6570', value: String([...url.searchParams].length) }
    ]);
  } catch (error) {
    await ctx.audit('url.parse.failed', { length: value.length, error: String(error?.message || error).slice(0, 160) });
    return '\u89e3\u6790\u5931\u8d25\uff1a' + publicErrorMessage(error);
  }
}

export async function handle37(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const usage = ctx.usage('添加 <歌曲名> | 随机 | 列表');
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') {
    const name = String(args.slice(1).join(' ') || '').trim();
    const hasControl = [...name].some((character) => {
      const code = character.codePointAt(0);
      return code < 32 && ![9, 10, 13].includes(code) || code === 127;
    });
    if (!name || name.length > 200 || hasControl) return usage;
    try {
      const item = await ctx.add({ name, artist: '', source: 'user' }, 'songs', { uniqueBy: 'name' });
      await ctx.audit('song.add', { itemId: item.id, length: name.length });
      return '歌曲已加入候选：' + item.id;
    } catch (error) {
      await ctx.audit('song.failed', { action: 'add', error: String(error?.message || error).slice(0, 160) });
      return '歌曲服务不可用：' + publicErrorMessage(error);
    }
  }
  try {
    const songs = await ctx.store.list('songs');
    if (!songs.length) return '暂无歌曲候选，请先添加。';
    if (action === '随机' || action === 'random') {
      const item = songs[Math.floor(Math.random() * songs.length)];
      await ctx.audit('song.random', { count: songs.length, itemId: item.id });
      return ctx.summary('歌曲推荐', [{ label: '歌曲', value: item.name }, { label: '歌手', value: item.artist || '未知' }]);
    }
    if (action && action !== '列表' && action !== 'list') return usage;
    await ctx.audit('song.list', { count: songs.length });
    return listMessage(ctx, songs, { usage: '添加 <歌曲名> | 随机 | 列表', max: 100 });
  } catch (error) {
    await ctx.audit('song.failed', { action: action || 'list', error: String(error?.message || error).slice(0, 160) });
    return '歌曲服务不可用：' + publicErrorMessage(error);
  }
}

export async function handle38(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime);
  const usage = ctx.usage('[生成] <模板> <文字>');
  const first = String(args[0] || '').toLowerCase();
  const explicit = first === '生成' || first === 'generate';
  const template = String(args[explicit ? 1 : 0] || '文字卡片').trim();
  const value = String(args.slice(explicit ? 2 : 1).join(' ') || '').trim();
  const hasControl = (input) => [...input].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 && ![9, 10, 13].includes(code) || code === 127;
  });
  if (!value || template.length > 64 || value.length > 800 || hasControl(template) || hasControl(value)) return usage;
  const rows = [
    { label: '模板', value: cleanText(template, { max: 64 }) },
    { label: '文字', value: cleanText(value, { max: 800 }) },
    { label: '降级', value: '图片渲染不可用时保留上述文字' }
  ];
  try {
    const result = await ctx.summary('表情文字内容', rows, { render: true });
    await ctx.audit('meme.generate', { template: cleanText(template, { max: 64 }), length: value.length, rendered: typeof result !== 'string' });
    return result;
  } catch (error) {
    await ctx.audit('meme.failed', { template: cleanText(template, { max: 64 }), length: value.length, error: String(error?.message || error).slice(0, 160) });
    return ctx.summary('表情文字内容', rows);
  }
}

export async function handle39(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const usage = ctx.usage('保存 [图片 URL] | 列表 | 删除 <ID>');
  const action = String(args[0] || '').toLowerCase();
  if (action === '列表' || action === 'list') {
    try {
      const images = await ctx.store.list('images');
      await ctx.audit('image.list', { count: images.length });
      return listMessage(ctx, images, { usage: '保存 [图片 URL] | 列表 | 删除 <ID>', max: 100 });
    } catch (error) {
      await ctx.audit('image.failed', { action: 'list', error: String(error?.message || error).slice(0, 160) });
      return '图片存储不可用：' + publicErrorMessage(error);
    }
  }
  if (action === '删除' || action === 'del' || action === 'delete') {
    const id = String(args[1] || '').trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/u.test(id)) return usage;
    try {
      const removed = await ctx.store.remove((item) => item.id === id, 'images');
      await ctx.audit('image.delete', { itemId: id, removed: Boolean(removed) });
      return removed ? '图片引用已删除。' : '未找到图片引用。';
    } catch (error) {
      await ctx.audit('image.failed', { action: 'delete', error: String(error?.message || error).slice(0, 160) });
      return '图片存储不可用：' + publicErrorMessage(error);
    }
  }
  const explicitSave = action === '保存' || action === 'save';
  const segmentValues = (event.segments || []).filter((segment) => segment.type === 'image').map((segment) => segment.url || segment.file).filter(Boolean);
  const values = segmentValues.length ? segmentValues : (explicitSave ? args.slice(1) : args);
  if (!values.length || values.length > 10) return usage;
  const accepted = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || value.length > 2048) continue;
    try { accepted.push(validateUrl(value).href); } catch {}
  }
  if (!accepted.length) return '没有可保存的安全图片 URL。';
  try {
    for (const url of accepted) await ctx.add({ url, source: 'message' }, 'images', { uniqueBy: 'url' });
    await ctx.audit('image.save', { count: accepted.length });
    return '已保存图片引用：' + accepted.length + ' 张。';
  } catch (error) {
    await ctx.audit('image.failed', { action: 'save', count: accepted.length, error: String(error?.message || error).slice(0, 160) });
    return '图片存储不可用：' + publicErrorMessage(error);
  }
}

export async function handle40(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const media = (event.segments || []).filter((segment) => ['audio', 'video', 'file'].includes(segment.type));
  const values = media.length ? media : args.map((value) => ({ type: 'reference', url: value }));
  if (!values.length) return ctx.usage('发送语音/文件/媒体引用');
  const records = [];
  for (const segment of values.slice(0, 10)) {
    const rawUrl = segment.url || segment.file || '';
    if (!rawUrl) continue;
    let url;
    try { url = validateUrl(rawUrl).href; } catch { continue; }
    records.push(await ctx.add({ type: segment.type, url: cleanText(url, { max: 2000 }), name: cleanText(segment.name || '', { max: 200 }) }, 'media'));
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
