import { dispatchFeature } from './handlers/index.js';
import { featureStore } from './store.js';
import { cleanText } from '../core/safe.js';

export async function executeFeature(manifest, event, args, runtime) {
  return dispatchFeature(manifest, event, args, runtime);
}

const commandPrefix = '#\u4e91\u9526';

async function recordGroupTelemetry(event, runtime) {
  const now = runtime.core.clock.now();
  const userId = String(event.userId || 'unknown');
  const textValue = cleanText(event.message || '', { max: 400 });
  const message = { userId, text: textValue, messageId: String(event.raw?.message_id || event.raw?.messageId || ''), createdAt: now };
  const command = textValue.startsWith(commandPrefix);
  const enabled = (id) => typeof runtime.registry?.isEnabled !== 'function' || runtime.registry.isEnabled(id, event);
  const targets = ['12', '43', '47', '48'].filter(enabled);
  if (!targets.length) return;
  const keys = new Map(targets.map((id) => [id, featureStore(runtime, id, event, { level: 'group' }).key()]));
  await runtime.stateRepository.update({}, (root) => {
    if (targets.includes('12')) {
      const key = keys.get('12');
      const state = root[key] && typeof root[key] === 'object' ? root[key] : { events: [] };
      state.events = [...(Array.isArray(state.events) ? state.events : []), message].slice(-200);
      root[key] = state;
    }
    if (targets.includes('43')) {
      const key = keys.get('43');
      const state = root[key] && typeof root[key] === 'object' ? root[key] : { messages: [], counters: {} };
      state.messages = [...(Array.isArray(state.messages) ? state.messages : []), message].slice(-500);
      state.counters = { ...(state.counters || {}), messages: Number(state.counters?.messages || 0) + 1, commands: Number(state.counters?.commands || 0) + (command ? 1 : 0) };
      root[key] = state;
    }
    if (targets.includes('47')) {
      const key = keys.get('47');
      const state = root[key] && typeof root[key] === 'object' ? root[key] : { users: {}, counters: {} };
      const users = state.users && typeof state.users === 'object' ? state.users : {};
      const current = Object.prototype.hasOwnProperty.call(users, userId) ? users[userId] : { userId, messages: 0, firstSeenAt: now };
      users[userId] = { ...current, messages: Number(current.messages || 0) + 1, lastSeenAt: now };
      state.users = users;
      state.counters = { ...(state.counters || {}), messages: Number(state.counters?.messages || 0) + 1 };
      root[key] = state;
    }
    if (targets.includes('48')) {
      const key = keys.get('48');
      const state = root[key] && typeof root[key] === 'object' ? root[key] : { messages: [], counters: {} };
      state.messages = [...(Array.isArray(state.messages) ? state.messages : []), message].slice(-500);
      state.counters = { ...(state.counters || {}), messages: Number(state.counters?.messages || 0) + 1 };
      root[key] = state;
    }
    return true;
  });
}

export async function scanFeature(manifest, event, runtime) {
  const id = String(manifest.id).padStart(2, '0');
  if (!['12', '15', '16', '41'].includes(id)) return false;
  if (!event?.groupId || event.groupId === 'private') return false;
  if (id === '12') {
    await recordGroupTelemetry(event, runtime);
    return false;
  }
  const value = String(event.message || '');
  if (!value || value.startsWith(commandPrefix)) return false;
  const store = featureStore(runtime, id, event, { level: 'group' });
  const state = await store.read({ rules: [], items: [] });
  const rules = Array.isArray(state.rules) ? state.rules : Array.isArray(state.items) ? state.items : [];
  const ruleValue = (item) => String(item?.value ?? item?.trigger ?? item?.word ?? item?.url ?? item ?? '');
  const hit = id === '41'
    ? rules.find((item) => item?.enabled !== false && item?.trigger && value.includes(String(item.trigger)))
    : rules.find((item) => ruleValue(item) && value.toLowerCase().includes(ruleValue(item).toLowerCase()));
  if (!hit) return false;
  const messageId = event.raw?.message_id || event.raw?.messageId;
  let withdrawn = false;
  if (typeof event.bot?.deleteMsg === 'function' && messageId) {
    try {
      await event.bot.deleteMsg(messageId);
      withdrawn = true;
    } catch (error) {
      await runtime.audit.record({ action: 'message.block.error', featureId: id, userId: event.userId, groupId: event.groupId, error: error.message });
    }
  }
  await runtime.audit.record({ action: 'message.block', featureId: id, userId: event.userId, groupId: event.groupId, withdrawn, rule: ruleValue(hit).slice(0, 100) });
  if (id === '41' && hit?.response && typeof event.reply === 'function') await event.reply(String(hit.response).slice(0, 1000));
  return true;
}
