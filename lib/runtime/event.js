import { normalizeMessage } from '../message/adapter.js';

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return ['true', '1'].includes(String(value).trim().toLowerCase());
}

function asString(value, fallback = '', max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return fallback;
  const text = String(value).trim();
  if (!text || text.length > max || [...text].some((char) => { const code = char.charCodeAt(0); return code < 32 || code === 127; })) return fallback;
  return text;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeEvent(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const sender = asObject(source.sender);
  const member = asObject(source.member);
  const message = normalizeMessage(source.message ?? source.raw_message ?? source.msg ?? '');
  const rawReply = typeof source.reply === 'function' ? source.reply.bind(source) : null;
  const userId = asString(source.user_id ?? source.userId ?? sender.user_id ?? sender.id, '');
  const groupId = asString(source.group_id ?? source.groupId ?? source.group?.group_id, '');
  const selfId = asString(source.self_id ?? source.selfId ?? source.bot?.uin ?? source.bot?.id, '');
  return {
    type: asString(source.type ?? source.post_type ?? source.postType, 'message'),
    postType: asString(source.post_type ?? source.postType ?? source.type, 'message'),
    requestType: asString(source.request_type ?? source.requestType, ''),
    subType: asString(source.sub_type ?? source.subType, ''),
    flag: asString(source.flag, ''),
    comment: asString(source.comment, ''),
    raw: source,
    msg: message.text,
    rawMessage: source.raw_message ?? source.msg ?? message.text,
    message: message.text,
    segments: message.segments,
    hasSegment: message.has,
    userId,
    groupId,
    selfId,
    botId: selfId || 'default',
    isMaster: asBoolean(source.isMaster ?? source.is_master ?? sender.isMaster ?? sender.is_master),
    role: asString(sender.role ?? member.role ?? source.role, 'member', 80),
    sender,
    member: Object.keys(member).length ? member : sender,
    bot: source.bot ?? source.runtime?.bot ?? null,
    runtime: source.runtime ?? null,
    reply: rawReply
  };
}
