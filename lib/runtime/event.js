import { normalizeMessage } from '../message/adapter.js';

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return String(value).trim().toLowerCase() === 'true';
}

function asString(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

export function normalizeEvent(input = {}) {
  const message = normalizeMessage(input.message ?? input.raw_message ?? input.msg ?? '');
  const rawReply = typeof input.reply === 'function' ? input.reply.bind(input) : null;
  return {
    type: asString(input.type ?? input.post_type ?? input.postType, 'message'),
    postType: asString(input.post_type ?? input.postType ?? input.type, 'message'),
    requestType: asString(input.request_type ?? input.requestType, ''),
    subType: asString(input.sub_type ?? input.subType, ''),
    flag: asString(input.flag, ''),
    comment: asString(input.comment, ''),
    raw: input,
    msg: message.text,
    rawMessage: input.raw_message ?? input.msg ?? message.text,
    message: message.text,
    segments: message.segments,
    hasSegment: message.has,
    userId: asString(input.user_id ?? input.userId ?? input.sender?.user_id ?? input.sender?.id, 'unknown'),
    groupId: asString(input.group_id ?? input.groupId ?? input.group?.group_id, ''),
    selfId: asString(input.self_id ?? input.selfId ?? input.bot?.uin ?? input.bot?.id, ''),
    botId: asString(input.self_id ?? input.selfId ?? input.bot?.uin ?? input.bot?.id, 'default'),
    isMaster: asBoolean(input.isMaster ?? input.is_master ?? input.sender?.isMaster ?? input.sender?.is_master),
    role: asString(input.sender?.role ?? input.member?.role ?? input.role, 'member'),
    sender: input.sender ?? input.member ?? {},
    member: input.member ?? input.sender ?? {},
    bot: input.bot ?? input.runtime?.bot ?? null,
    runtime: input.runtime ?? null,
    reply: rawReply
  };
}
