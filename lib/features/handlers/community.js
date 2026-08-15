import { handlerContext, listMessage, dayKey } from './context.js';
import { isGroupAdmin } from '../../auth/policy.js';
import { cleanText } from '../../core/safe.js';
import { publicErrorMessage } from '../../core/errors.js';

const dailyTasks = ['完成一次签到', '添加一条待办', '发送一条有帮助的消息', '参与一次群内讨论', '整理一条个人收藏'];




export async function handle44(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, { ...options, level: 'user' });
  if (!ctx.userId) return '\u7b7e\u5230\u9700\u8981\u8bc6\u522b\u5230\u7528\u6237\u8eab\u4efd\u3002';
  const action = String(ctx.command || '\u7b7e\u5230').toLowerCase();
  if (!['\u7b7e\u5230', '\u67e5\u8be2', 'sign', 'check', 'checkin'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u7b7e\u5230\uff0c\u6216 #\u4e91\u9526\u7b7e\u5230 \u67e5\u8be2\u3002';
  const dateKey = dayKey(ctx);
  try {
    const saved = await ctx.store.read({ points: 0, days: 0, dates: {} });
    const state = saved && typeof saved === 'object' ? saved : { points: 0, days: 0, dates: {} };
    const dates = state.dates && typeof state.dates === 'object' ? state.dates : {};
    const record = dates[dateKey];
    const points = Math.max(0, Number(state.points) || 0);
    if (action === '\u67e5\u8be2' || action === 'check') return record ? '\u4eca\u65e5\u5df2\u7b7e\u5230\uff0c\u8fde\u7eed\u7b7e\u5230 ' + Math.max(1, Number(record.days) || 1) + ' \u5929\uff0c\u7d2f\u8ba1 ' + points + ' \u79ef\u5206\u3002' : '\u4eca\u65e5\u5c1a\u672a\u7b7e\u5230\uff0c\u7d2f\u8ba1 ' + points + ' \u79ef\u5206\u3002';
    if (record) {
      await ctx.audit('daily-sign.repeat', { userId: ctx.userId });
      return '\u4eca\u5929\u5df2\u7ecf\u7b7e\u5230\u8fc7\u4e86\uff0c\u660e\u5929\u518d\u6765\u5427\u3002';
    }
    const nextPoints = Math.min(1000000, points + 1);
    const days = Math.min(36500, (Number(state.days) || 0) + 1);
    await ctx.store.update((next) => {
      next.points = nextPoints;
      next.days = days;
      next.dates = { ...dates, [dateKey]: { points: 1, days, createdAt: Date.now() } };
    }, { points: 0, days: 0, dates: {} });
    await ctx.audit('daily-sign.success', { userId: ctx.userId, points: 1, days });
    return '\u7b7e\u5230\u6210\u529f\uff0c\u83b7\u5f97 1 \u79ef\u5206\uff0c\u8fde\u7eed\u7b7e\u5230 ' + days + ' \u5929\uff0c\u7d2f\u8ba1 ' + nextPoints + ' \u79ef\u5206\u3002';
  } catch (error) {
    await ctx.audit('daily-sign.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u7b7e\u5230\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}


export async function handle45(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, options);
  const action = String(ctx.command || '\u5217\u8868').toLowerCase();
  const quote = cleanText(ctx.args?.slice(1).join(' ') || ctx.value || '', { max: 1000 });
  if (!['\u6dfb\u52a0', '\u5220\u9664', '\u5217\u8868', 'add', 'delete', 'list'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u8bed\u5f55\u6dfb\u52a0 \u5185\u5bb9\u3001#\u4e91\u9526\u8bed\u5f55\u5220\u9664 \u7f16\u53f7\u3001#\u4e91\u9526\u8bed\u5f55\u5217\u8868\u3002';
  const scope = ctx.groupId ? 'group:' + ctx.groupId : 'user:' + ctx.userId;
  try {
    const items = await ctx.store.list('items');
    if (action === '\u5217\u8868' || action === 'list') return listMessage(ctx, items.map((item) => item.text || item.value || item), { max: 1000, usage: '\u6dfb\u52a0 <\u5185\u5bb9>' });
    if (action === '\u6dfb\u52a0' || action === 'add') {
      if (!quote || /[\u0000-\u001f\u007f]/u.test(quote)) return '\u8bed\u5f55\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a\uff0c\u4e14\u4e0d\u80fd\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002';
      if (items.length >= 1000) return '\u8bed\u5f55\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650\u3002';
      const item = { id: Date.now() + '-' + (ctx.userId || 'anonymous'), text: quote, userId: ctx.userId || 'anonymous', createdAt: Date.now() };
      await ctx.store.add(item, 'items', { maxItems: 1000 });
      await ctx.audit('quote.add', { scope, id: item.id });
      return '\u8bed\u5f55\u5df2\u6dfb\u52a0\u3002';
    }
    const index = Number(ctx.args?.[1]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return '\u8bf7\u8f93\u5165\u6709\u6548\u7684\u8bed\u5f55\u7f16\u53f7\u3002';
    const removed = items[index];
    await ctx.store.remove((_, itemIndex) => itemIndex === index, 'items');
    await ctx.audit('quote.delete', { scope, id: removed?.id || String(index + 1) });
    return '\u8bed\u5f55\u5df2\u5220\u9664\u3002';
  } catch (error) {
    await ctx.audit('quote.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u8bed\u5f55\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}


export async function handle46(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, options);
  const action = String(ctx.command || '\u5217\u8868').toLowerCase();
  const inputArgs = Array.isArray(ctx.args) ? ctx.args : [];
  if (!['\u6dfb\u52a0', '\u5220\u9664', '\u5217\u8868', 'add', 'delete', 'list'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u7cbe\u534e\u6dfb\u52a0 \u6d88\u606f\u7f16\u53f7 \u539f\u56e0\u3001#\u4e91\u9526\u7cbe\u534e\u5220\u9664 \u6d88\u606f\u7f16\u53f7\u3001#\u4e91\u9526\u7cbe\u534e\u5217\u8868\u3002';
  const scope = ctx.groupId ? 'group:' + ctx.groupId : 'user:' + ctx.userId;
  try {
    const list = await ctx.store.list('items');
    if (action === '\u5217\u8868' || action === 'list') return listMessage(ctx, list.map((item) => (item.reason ? item.reason + '\uff1a' : '') + (item.messageId || item.id)), { max: 1000, usage: '\u6dfb\u52a0 <\u6d88\u606f\u7f16\u53f7> <\u539f\u56e0>' });
    const messageId = cleanText(inputArgs[1] || ctx.messageId || '', { max: 128 });
    if (!messageId || /[\u0000-\u001f\u007f]/u.test(messageId)) return '\u8bf7\u63d0\u4f9b\u6709\u6548\u7684\u6d88\u606f\u7f16\u53f7\u3002';
    if (action === '\u6dfb\u52a0' || action === 'add') {
      const reason = cleanText(inputArgs.slice(2).join(' '), { max: 300 });
      if (list.some((item) => item.messageId === messageId)) return '\u8fd9\u6761\u6d88\u606f\u5df2\u7ecf\u5728\u7cbe\u534e\u5217\u8868\u4e2d\u3002';
      if (list.length >= 1000) return '\u7cbe\u534e\u6d88\u606f\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650\u3002';
      const item = { id: messageId, messageId, reason, userId: ctx.userId || 'anonymous', createdAt: Date.now() };
      await ctx.store.add(item, 'items', { maxItems: 1000 });
      await ctx.audit('essence.add', { scope, messageId });
      return '\u7cbe\u534e\u6d88\u606f\u5df2\u6536\u5f55\u3002';
    }
    const removed = await ctx.store.remove((item) => item.messageId === messageId || item.id === messageId, 'items');
    if (!removed) return '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u7cbe\u534e\u6d88\u606f\u3002';
    await ctx.audit('essence.delete', { scope, messageId });
    return '\u7cbe\u534e\u6d88\u606f\u5df2\u79fb\u9664\u3002';
  } catch (error) {
    await ctx.audit('essence.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u7cbe\u534e\u6d88\u606f\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}


export async function handle47(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, options);
  if (!ctx.groupId || ctx.groupId === 'private') return '\u7fa4\u6d3b\u8dc3\u7edf\u8ba1\u53ea\u80fd\u5728\u7fa4\u804a\u4e2d\u4f7f\u7528\u3002';
  const action = String(ctx.command || '\u67e5\u770b').toLowerCase();
  if (!['\u67e5\u770b', '\u91cd\u7f6e', 'view', 'reset'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u7fa4\u6d3b\u8dc3\uff0c\u6216 #\u4e91\u9526\u7fa4\u6d3b\u8dc3\u91cd\u7f6e\u3002';
  const key = 'group-heat:' + ctx.groupId;
  try {
    const current = await ctx.store.read({ total: 0, users: {} });
    const data = current && typeof current === 'object' ? current : { total: 0, users: {} };
    if (action === '\u91cd\u7f6e' || action === 'reset') {
      if (!isGroupAdmin(event)) return '\u53ea\u6709\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u4ee5\u91cd\u7f6e\u7fa4\u6d3b\u8dc3\u7edf\u8ba1\u3002';
      await ctx.store.update((state) => { state.total = 0; state.users = {}; });
      await ctx.audit('group-heat.reset', { groupId: ctx.groupId, key });
      return '\u7fa4\u6d3b\u8dc3\u7edf\u8ba1\u5df2\u91cd\u7f6e\u3002';
    }
    const total = Math.max(0, Math.min(10000000, Number(data.total) || 0));
    const users = data.users && typeof data.users === 'object' ? data.users : {};
    const rows = Object.entries(users).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 10).map(([id, count], index) => ({ label: (index + 1) + '. ' + id, value: Math.max(0, Math.min(1000000, Number(count) || 0)) + ' \u6b21' }));
    await ctx.audit('group-heat.view', { groupId: ctx.groupId, count: rows.length });
    return ctx.summary('\u7fa4\u6d3b\u8dc3\u7edf\u8ba1', [{ label: '\u603b\u6d88\u606f\u6570', value: total }, ...rows], { render: true });
  } catch (error) {
    await ctx.audit('group-heat.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u7fa4\u6d3b\u8dc3\u7edf\u8ba1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}


export async function handle48(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, options);
  if (!ctx.groupId || ctx.groupId === 'private') return '\u7fa4\u5386\u53f2\u8bb0\u5f55\u53ea\u80fd\u5728\u7fa4\u804a\u4e2d\u4f7f\u7528\u3002';
  const action = String(ctx.command || '\u67e5\u770b').toLowerCase();
  if (!['\u67e5\u770b', '\u6e05\u7406', 'view', 'clear'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u7fa4\u5386\u53f2\uff0c\u6216 #\u4e91\u9526\u7fa4\u5386\u53f2\u6e05\u7406\u3002';
  const key = 'group-historian:' + ctx.groupId;
  try {
    if (action === '\u6e05\u7406' || action === 'clear') {
      if (!isGroupAdmin(event)) return '\u53ea\u6709\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u4ee5\u6e05\u7406\u7fa4\u5386\u53f2\u3002';
      await ctx.store.update((state) => { state.items = []; });
      await ctx.audit('group-historian.clear', { groupId: ctx.groupId, key });
      return '\u7fa4\u5386\u53f2\u5df2\u6e05\u7406\u3002';
    }
    const records = await ctx.store.list('items');
    const list = records.slice(-20);
    const lines = list.map((item) => {
      const time = Number(item?.createdAt) > 0 ? new Date(Number(item.createdAt)).toLocaleString('zh-CN', { hour12: false }) : '\u672a\u77e5\u65f6\u95f4';
      return time + ' ' + (cleanText(item?.text || item?.message || item?.value || '', { max: 240 }) || '\uff08\u7a7a\u6d88\u606f\uff09');
    });
    await ctx.audit('group-historian.view', { groupId: ctx.groupId, count: list.length });
    return ctx.summary('\u7fa4\u5386\u53f2\uff08\u6700\u8fd1 ' + list.length + ' \u6761\uff09', lines, { render: true });
  } catch (error) {
    await ctx.audit('group-historian.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u7fa4\u5386\u53f2\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}


export async function handle49(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, options);
  if (!ctx.groupId || ctx.groupId === 'private') return '\u62a5\u540d\u53ea\u80fd\u5728\u7fa4\u804a\u4e2d\u4f7f\u7528\u3002';
  const action = String(ctx.command || '\u53c2\u52a0').toLowerCase();
  if (!['\u5f00\u542f', '\u5173\u95ed', '\u53c2\u52a0', '\u5217\u8868', 'open', 'close', 'join', 'list'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u62a5\u540d\u5f00\u542f \u540d\u79f0\u3001#\u4e91\u9526\u62a5\u540d\u53c2\u52a0\u3001#\u4e91\u9526\u62a5\u540d\u5217\u8868\u3002';
  const key = 'lottery-signup:' + ctx.groupId;
  try {
    const current = await ctx.store.read({ name: '', open: false, users: [] });
    const data = current && typeof current === 'object' ? current : { name: '', open: false, users: [] };
    const users = Array.isArray(data.users) ? data.users.slice(0, 10000) : [];
    if (action === '\u5f00\u542f' || action === 'open') {
      if (!isGroupAdmin(event)) return '\u53ea\u6709\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u4ee5\u5f00\u542f\u62a5\u540d\u3002';
      const name = cleanText(ctx.args?.slice(1).join(' ') || '', { max: 80 });
      if (!name || /[\u0000-\u001f\u007f]/u.test(name)) return '\u8bf7\u63d0\u4f9b\u6709\u6548\u7684\u6d3b\u52a8\u540d\u79f0\u3002';
      await ctx.store.update((state) => { state.name = name; state.open = true; state.users = users; state.openedAt = Date.now(); }, { name: '', open: false, users: [] });
      await ctx.audit('lottery.open', { groupId: ctx.groupId, key });
      return '\u62a5\u540d\u5df2\u5f00\u542f\uff1a' + name;
    }
    if (action === '\u5173\u95ed' || action === 'close') {
      if (!isGroupAdmin(event)) return '\u53ea\u6709\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u4ee5\u5173\u95ed\u62a5\u540d\u3002';
      await ctx.store.update((state) => { state.open = false; state.closedAt = Date.now(); state.users = users; }, { name: data.name || '', open: false, users });
      await ctx.audit('lottery.close', { groupId: ctx.groupId, key });
      return '\u62a5\u540d\u5df2\u5173\u95ed\u3002';
    }
    if (action === '\u5217\u8868' || action === 'list') return (listMessage(ctx, users, { max: 10000, usage: '\u53c2\u52a0 <\u540d\u79f0>' }) || '') + '\n\u4eba\u6570?' + users.length + '\n\u72b6\u6001?' + (data.open ? '\u62a5\u540d\u4e2d?' + (data.name || '\u672a\u547d\u540d') : '\u672a\u5f00\u542f');
    let name = data.name || '';
    let open = Boolean(data.open);
    if (!open) {
      const requestedName = cleanText(args?.slice(1).join(' ') || '', { max: 80 });
      if (action === '\u53c2\u52a0' && requestedName) { name = requestedName; open = true; } else return '\u5f53\u524d\u6ca1\u6709\u8fdb\u884c\u4e2d\u7684\u62a5\u540d\u3002';
    }
    const userId = String(ctx.userId || '').trim();
    if (!userId) return '\u62a5\u540d\u9700\u8981\u8bc6\u522b\u5230\u7528\u6237\u8eab\u4efd\u3002';
    if (users.includes(userId)) return '\u4f60\u5df2\u7ecf\u62a5\u540d\u8fc7\u4e86\u3002';
    if (users.length >= 10000) return '\u62a5\u540d\u4eba\u6570\u5df2\u8fbe\u4e0a\u9650\u3002';
    users.push(userId);
    await ctx.store.update((state) => { state.name = name || '\u672a\u547d\u540d'; state.open = open; state.users = users; }, { name, open, users: [] });
    await ctx.audit('lottery.join', { groupId: ctx.groupId, userId });
    return '\u62a5\u540d\u6210\u529f?' + (name || '\u672a\u547d\u540d') + '?\u4eba\u6570 ' + users.length + '\u3002';
  } catch (error) {
    await ctx.audit('lottery.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u62a5\u540d\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}


export async function handle50(manifest, event, args, runtime, options = {}) {
  const ctx = handlerContext(manifest, event, args, runtime, { ...options, level: 'user' });
  if (!ctx.userId) return '\u65e5\u4efb\u52a1\u9700\u8981\u8bc6\u522b\u5230\u7528\u6237\u8eab\u4efd\u3002';
  const action = String(ctx.command || '\u67e5\u770b').toLowerCase();
  if (!['\u67e5\u770b', '\u5b8c\u6210', 'view', 'done'].includes(action)) return '\u7528\u6cd5\uff1a#\u4e91\u9526\u65e5\u4efb\u52a1\uff0c\u5b8c\u6210\u540e\u4f7f\u7528 #\u4e91\u9526\u65e5\u4efb\u52a1 \u5b8c\u6210\u3002';
  const key = 'daily-task:' + ctx.userId + ':' + dayKey(ctx);
  try {
    const saved = await ctx.store.read({});
    const state = saved && typeof saved === 'object' ? saved : {};
    const task = state.task && typeof state.task === 'object' ? state.task : { title: dailyTasks[new Date().getDate() % dailyTasks.length], done: false };
    if (action === '\u67e5\u770b' || action === 'view') {
      await ctx.audit('daily-task.view', { userId: ctx.userId, done: Boolean(task.done), key });
      return '\u4eca\u65e5\u4efb\u52a1?' + task.title + '\n\u72b6\u6001?' + (task.done ? '\u5df2\u5b8c\u6210' : '\u672a\u5b8c\u6210');
    }
    if (task.done) return '\u4eca\u65e5\u4efb\u52a1\u5df2\u7ecf\u5b8c\u6210\u4e86\u3002';
    task.done = true;
    task.completedAt = Date.now();
    await ctx.store.update((next) => { next.task = task; }, {});
    await ctx.audit('daily-task.done', { userId: ctx.userId, key });
    return '\u4eca\u65e5\u4efb\u52a1\u5df2\u5b8c\u6210?' + task.title;
  } catch (error) {
    await ctx.audit('daily-task.failed', { code: error?.code || 'STORE_ERROR' });
    return publicErrorMessage(error, '\u65e5\u4efb\u52a1\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }
}
