function messageText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return value == null ? '' : String(value);
  return value.map((item) => {
    if (!item) return '';
    if (item.type === 'text') return String(item.text || '');
    if (item.type === 'at') return ` [at:${item.qq || item.user_id || ''}] `;
    if (item.type === 'image') return ` [image:${item.url || item.file || ''}] `;
    return '';
  }).join('');
}

export function normalizeEvent(input = {}) {
  const sender = input.sender ?? {};
  const member = input.member ?? sender;
  const rawMessage = input.raw_message ?? input.msg ?? input.message ?? '';
  const groupId = input.group_id ?? input.groupId ?? null;
  const userId = input.user_id ?? input.userId ?? sender.user_id ?? sender.userId ?? null;
  return Object.freeze({
    raw: input,
    message: messageText(rawMessage).trim(),
    rawMessage: messageText(rawMessage).trim(),
    userId: userId == null ? null : String(userId),
    groupId: groupId == null ? null : String(groupId),
    selfId: input.self_id == null ? null : String(input.self_id),
    isPrivate: groupId == null,
    isMaster: input.isMaster === true || input.is_master === true,
    sender,
    member,
    role: member.role ?? sender.role ?? null,
    bot: input.bot ?? input.runtime?.bot ?? null,
    runtime: input.runtime ?? {},
    reply: input.reply
  });
}
