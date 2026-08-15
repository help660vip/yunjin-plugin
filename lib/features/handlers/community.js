import { handlerContext, required, actionIs, listMessage, dayKey } from './context.js';
import { isGroupAdmin } from '../../auth/policy.js';
import { cleanText } from '../../core/safe.js';

const dailyTasks = ['完成一次签到', '添加一条待办', '发送一条有帮助的消息', '参与一次群内讨论', '整理一条个人收藏'];

export async function handle44(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'member' });
  const today = dayKey(ctx);
  const state = await ctx.store.read({ users: {} });
  const user = state.users?.[ctx.userId] || { points: 0, days: 0 };
  if (user.day === today) return '今天已签到，积分：' + user.points;
  user.day = today;
  user.days = Number(user.days || 0) + 1;
  user.points = Number(user.points || 0) + 1 + (Number(ctx.stable(today).slice(0, 2), 16) % 5);
  state.users = { ...(state.users || {}), [ctx.userId]: user };
  await ctx.update((next) => { next.users = state.users; return user; }, { users: {} });
  await ctx.audit('daily-sign.success', { days: user.days });
  return '签到成功，累计天数：' + user.days + '，积分：' + user.points;
}

export async function handle45(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add') {
    const value = required(args.slice(1).join(' '), ctx.usage('添加 <引用内容>'));
    const item = await ctx.add({ text: cleanText(value, { max: 1000 }), authorId: ctx.userId }, 'quotes');
    return '引用已保存：' + item.id;
  }
  if (action === '删除' || action === 'del') return (await ctx.store.remove((item) => item.id === args[1], 'quotes')) ? '引用已删除。' : '未找到引用。';
  return listMessage(ctx, await ctx.store.list('quotes'), { usage: '添加 <引用内容>' });
}

export async function handle46(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '添加' || action === 'add' || action === '设为精华') {
    const messageId = required(args[1], ctx.usage('添加 <消息 ID>'));
    const item = await ctx.add({ messageId, reason: cleanText(args.slice(2).join(' '), { max: 300 }) }, 'messages', { uniqueBy: 'messageId' });
    await ctx.audit('essence.add', { messageId });
    return '精华消息已记录：' + item.id;
  }
  if (action === '删除' || action === 'del') return (await ctx.store.remove((item) => item.messageId === args[1], 'messages')) ? '精华消息已删除。' : '未找到精华消息。';
  return listMessage(ctx, await ctx.store.list('messages'), { usage: '添加 <消息 ID>' });
}

export async function handle47(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  const action = String(args[0] || '').toLowerCase();
  if (action === '重置' || action === 'reset') {
    await ctx.store.clear();
    return '群活跃统计已重置。';
  }
  const state = await ctx.store.read({ users: {}, counters: {} });
  const rows = Object.entries(state.users || {}).map(([userId, value]) => ({ label: userId.slice(0, 8), value: String(value.messages || 0) })).sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 10);
  return ctx.summary('群活跃度', [
    { label: '群', value: ctx.groupId || '私聊' },
    { label: '总消息', value: String(state.counters?.messages || 0) },
    ...rows
  ]);
}

export async function handle48(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (actionIs(ctx, '清理', 'clear')) {
    await ctx.store.clear();
    return '群历史统计已清理。';
  }
  const state = await ctx.store.read({ messages: [], counters: {} });
  return ctx.summary('群历史', [
    { label: '群', value: ctx.groupId || '私聊' },
    { label: '消息数', value: String(state.counters?.messages || state.messages?.length || 0) },
    { label: '首次记录', value: state.messages?.[0]?.createdAt ? runtime.core.clock.format(state.messages[0].createdAt) : '暂无' },
    { label: '最近记录', value: state.messages?.at(-1)?.createdAt ? runtime.core.clock.format(state.messages.at(-1).createdAt) : '暂无' }
  ]);
}

export async function handle49(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'group' });
  if (!ctx.groupId || ctx.groupId === 'private') return '报名能力只能在群聊使用。';
  const action = String(args[0] || '').toLowerCase();
  const name = String(args[1] || 'default').slice(0, 80);
  if (['开启', 'open', '关闭', 'close'].includes(action) && !isGroupAdmin(event)) return '只有本群管理员或 Yunzai OP 可以管理报名活动。';
  const state = await ctx.store.read({ events: {} });
  const item = state.events?.[name] || { name, open: true, users: [], createdAt: ctx.now };
  if (action === '开启' || action === 'open') item.open = true;
  else if (action === '关闭' || action === 'close') item.open = false;
  else if (action === '参加' || action === 'join' || action === '报名') {
    if (!item.open) return '活动已关闭。';
    if (!item.users.includes(ctx.userId)) item.users.push(ctx.userId);
  } else if (action === '列表' || action === 'list' || !args.length) {
    return '活动：' + name + '\n状态：' + (item.open ? '进行中' : '已关闭') + '\n人数：' + item.users.length;
  } else {
    return ctx.usage('开启|关闭|参加|列表 <活动名>');
  }
  state.events = { ...(state.events || {}), [name]: item };
  await ctx.update((next) => { next.events = state.events; return item; }, { events: {} });
  await ctx.audit('lottery-signup.update', { name, action });
  return '活动 ' + name + ' 已更新：' + (item.open ? '进行中' : '已关闭') + '，人数 ' + item.users.length;
}

export async function handle50(manifest, event, args, runtime) {
  const ctx = handlerContext(manifest, event, args, runtime, { level: 'user' });
  const today = dayKey(ctx);
  const state = await ctx.store.read({ days: {} });
  let task = state.days?.[today];
  if (!task) {
    const index = Number.parseInt(ctx.stable(today).slice(0, 8), 16) % dailyTasks.length;
    task = { day: today, text: dailyTasks[index], done: false, createdAt: ctx.now };
  }
  const action = String(args[0] || '').toLowerCase();
  if (action === '完成' || action === 'done') task.done = true;
  state.days = { ...(state.days || {}), [today]: task };
  await ctx.update((next) => { next.days = state.days; return task; }, { days: {} });
  return ctx.summary('今日任务', [{ label: '日期', value: today }, { label: '任务', value: task.text }, { label: '状态', value: task.done ? '已完成' : '进行中' }]);
}
