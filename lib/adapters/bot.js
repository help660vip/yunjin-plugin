import { detectCapabilities, safeBotCall, createMessageFactory } from '../message/adapter.js';
import { cleanText } from '../core/safe.js';
import { dependencyMissing, publicErrorMessage } from '../core/errors.js';

function method(bot, names) {
  const list = Array.isArray(names) ? names : [names];
  return list.find((name) => typeof bot?.[name] === 'function');
}

export class BotAdapter {
  constructor(event = {}, options = {}) {
    this.event = event;
    this.bot = options.bot || event.bot || event.raw?.bot || {};
    this.segment = options.segment || globalThis.segment;
    this.capabilities = detectCapabilities(event, this.bot);
    this.message = createMessageFactory(this.segment);
  }

  id() {
    return String(this.event.botId || this.event.selfId || this.bot.uin || this.bot.id || 'default');
  }

  target(target = {}) {
    return {
      botId: String(target.botId || this.id()),
      groupId: String(target.groupId || target.group_id || this.event.groupId || ''),
      userId: String(target.userId || target.user_id || this.event.userId || '')
    };
  }

  async send(message, target = {}, options = {}) {
    const destination = this.target(target);
    const content = typeof message === 'string' ? cleanText(message, { max: options.maxLength || 4000 }) : message;
    if (destination.groupId && typeof this.bot.pickGroup === 'function') {
      const group = this.bot.pickGroup(destination.groupId);
      if (typeof group?.sendMsg === 'function') return group.sendMsg(content);
    }
    if (destination.userId && typeof this.bot.pickUser === 'function') {
      const user = this.bot.pickUser(destination.userId);
      if (typeof user?.sendMsg === 'function') return user.sendMsg(content);
    }
    const send = method(this.bot, ['sendMsg', 'sendMessage']);
    if (send) return this.bot[send](destination.groupId || destination.userId, content);
    if (typeof this.event.reply === 'function' && !options.forceTarget) return this.event.reply(content);
    return { ok: false, reason: 'send capability missing', target: destination };
  }

  async reply(message) {
    if (typeof this.event.reply === 'function') return this.event.reply(cleanText(message, { max: 4000 }));
    return this.send(message);
  }

  async delete(messageId, options = {}) {
    if (!this.capabilities.deleteMsg) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持撤回。' };
    try {
      return { ok: true, value: await this.bot.deleteMsg(String(messageId), options) };
    } catch (error) {
      return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error), cause: error };
    }
  }

  async groupInfo(groupId) {
    const id = String(groupId || this.event.groupId || '');
    if (!id) return { ok: false, code: 'GROUP_REQUIRED' };
    const pick = typeof this.bot.pickGroup === 'function' ? this.bot.pickGroup(id) : null;
    const getter = method(pick || this.bot, ['getInfo', 'getGroupInfo']);
    if (!getter) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持群信息查询。' };
    try { return { ok: true, value: await (pick || this.bot)[getter]() }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async memberInfo(groupId, userId) {
    const group = typeof this.bot.pickGroup === 'function' ? this.bot.pickGroup(String(groupId)) : null;
    const getter = method(group || this.bot, ['getMemberInfo', 'getMember']);
    if (!getter) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持成员信息查询。' };
    try { return { ok: true, value: await (group || this.bot)[getter](String(userId)) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async kick(groupId, userId, options = {}) {
    const group = typeof this.bot.pickGroup === 'function' ? this.bot.pickGroup(String(groupId)) : null;
    const target = group || this.bot;
    const name = method(target, ['kickMember', 'setGroupKick']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持踢出成员。' };
    try { return { ok: true, value: await target[name](String(userId), options) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async ban(groupId, userId, duration, options = {}) {
    const group = typeof this.bot.pickGroup === 'function' ? this.bot.pickGroup(String(groupId)) : null;
    const target = group || this.bot;
    const name = method(target, ['muteMember', 'setGroupBan']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持禁言。' };
    try { return { ok: true, value: await target[name](String(userId), Number(duration), options) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async wholeBan(groupId, enabled = true) {
    const group = typeof this.bot.pickGroup === 'function' ? this.bot.pickGroup(String(groupId)) : null;
    const target = group || this.bot;
    const name = method(target, ['setWholeBan', 'setGroupWholeBan']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持全体禁言。' };
    try { return { ok: true, value: await target[name](Boolean(enabled)) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async setAdmin(groupId, userId, enabled = true) {
    const group = typeof this.bot.pickGroup === 'function' ? this.bot.pickGroup(String(groupId)) : null;
    const target = group || this.bot;
    const name = method(target, ['setAdmin', 'setGroupAdmin']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持群管理员操作。' };
    try { return { ok: true, value: await target[name](String(userId), Boolean(enabled)) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async approveFriend(request) {
    const name = method(this.bot, ['setFriendAddRequest', 'approveFriend']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持好友申请处理。' };
    try { return { ok: true, value: await this.bot[name](request) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async approveGroup(request) {
    const name = method(this.bot, ['setGroupAddRequest', 'approveGroup']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持入群申请处理。' };
    try { return { ok: true, value: await this.bot[name](request) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async sendForward(nodes, target = {}) {
    const name = method(this.bot, ['sendForwardMsg', 'sendForward']);
    if (!name) return { ok: false, code: 'CAPABILITY_MISSING', message: '当前协议不支持合并转发。' };
    try { return { ok: true, value: await this.bot[name](this.target(target).groupId || this.target(target).userId, nodes) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  async call(names, args = [], fallback = { ok: false, code: 'CAPABILITY_MISSING' }) {
    const name = method(this.bot, names);
    if (!name) return fallback;
    try { return { ok: true, value: await this.bot[name](...args) }; } catch (error) { return { ok: false, code: 'BOT_ERROR', message: publicErrorMessage(error) }; }
  }

  summary() {
    return { botId: this.id(), capabilities: this.capabilities, eventGroup: String(this.event.groupId || ''), eventUser: String(this.event.userId || '') };
  }
}

export function botAdapter(event, options) {
  return new BotAdapter(event, options);
}
