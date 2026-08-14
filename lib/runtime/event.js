export function normalizeEvent(input = {}) {
  const sender = input.sender ?? {};
  const member = input.member ?? sender;
  const rawMessage = input.raw_message ?? input.msg ?? input.message ?? '';
  const groupId = input.group_id ?? input.groupId ?? null;
  const userId = input.user_id ?? input.userId ?? sender.user_id ?? sender.userId ?? null;
  return Object.freeze({
    raw: input,
    message: String(rawMessage),
    rawMessage: String(rawMessage),
    userId: userId == null ? null : String(userId),
    groupId: groupId == null ? null : String(groupId),
    selfId: input.self_id == null ? null : String(input.self_id),
    isPrivate: groupId == null,
    isMaster: input.isMaster === true || input.is_master === true,
    sender,
    member,
    role: member.role ?? sender.role ?? null,
    runtime: input.runtime ?? {},
    reply: input.reply
  });
}
