import { normalizeId } from '../core/ids.js';
import { cleanText } from '../core/safe.js';

export class GroupAggregate {
  constructor(options = {}) {
    this.maxMessages = Number(options.maxMessages || 2000);
    this.maxUsers = Number(options.maxUsers || 50000);
    this.clock = options.clock || { now: () => Date.now() };
    this.groups = new Map();
  }

  groupKey(event) {
    return [normalizeId(event?.botId || event?.selfId, 'default'), normalizeId(event?.groupId || event?.group_id, 'private')].join(':');
  }

  ensure(event) {
    const key = this.groupKey(event);
    if (!this.groups.has(key)) this.groups.set(key, { key, createdAt: this.clock.now(), counters: { messages: 0, commands: 0, images: 0, links: 0 }, users: new Map(), messages: [] });
    return this.groups.get(key);
  }

  record(event, options = {}) {
    const group = this.ensure(event);
    const userId = normalizeId(event?.userId || event?.user_id, 'unknown');
    const text = cleanText(event?.message || event?.msg || '', { max: options.maxText || 400 });
    group.counters.messages += 1;
    if (String(text).startsWith('#云锦')) group.counters.commands += 1;
    if (event?.segments?.some((segment) => segment.type === 'image')) group.counters.images += 1;
    if (/https?:\/\//iu.test(text)) group.counters.links += 1;
    const user = group.users.get(userId) || { userId, messages: 0, firstSeenAt: this.clock.now(), lastSeenAt: this.clock.now() };
    user.messages += 1;
    user.lastSeenAt = this.clock.now();
    group.users.set(userId, user);
    group.messages.push({ userId, text, createdAt: this.clock.now(), messageId: String(event?.raw?.message_id || '') });
    while (group.messages.length > this.maxMessages) group.messages.shift();
    while (group.users.size > this.maxUsers) group.users.delete(group.users.keys().next().value);
    return this.snapshot(event);
  }

  recordCommand(event) {
    const group = this.ensure(event);
    group.counters.commands += 1;
    return this.snapshot(event);
  }

  snapshot(event) {
    const group = this.ensure(event);
    return { key: group.key, createdAt: group.createdAt, counters: { ...group.counters }, users: [...group.users.values()].map((item) => ({ ...item })), messages: group.messages.slice(-100).map((item) => ({ ...item })) };
  }

  topUsers(event, limit = 10) {
    return this.snapshot(event).users.sort((a, b) => b.messages - a.messages).slice(0, limit);
  }

  recent(event, limit = 20) {
    return this.snapshot(event).messages.slice(-limit);
  }

  reset(event) {
    return this.groups.delete(this.groupKey(event));
  }

  prune(before = this.clock.now() - 30 * 86400000) {
    let removed = 0;
    for (const [key, group] of this.groups) {
      group.messages = group.messages.filter((item) => item.createdAt >= before);
      if (group.messages.length === 0 && group.createdAt < before) {
        this.groups.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  stats() {
    return { groups: this.groups.size, messages: [...this.groups.values()].reduce((sum, item) => sum + item.messages.length, 0), users: [...this.groups.values()].reduce((sum, item) => sum + item.users.size, 0) };
  }
}

export function groupAggregate(options) {
  return new GroupAggregate(options);
}
