export async function replyText(event, message, fallback = null) {
  if (typeof event?.reply === 'function') return event.reply(message);
  if (typeof fallback === 'function') return fallback(message);
  return message;
}
