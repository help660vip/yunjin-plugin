import { dispatchFeature } from './handlers/index.js';
import { featureStore } from './store.js';

export async function executeFeature(manifest, event, args, runtime) {
  return dispatchFeature(manifest, event, args, runtime);
}

export async function scanFeature(manifest, event, runtime) {
  if (!['15', '16', '41'].includes(String(manifest.id).padStart(2, '0'))) return false;
  if (!event?.groupId || event.groupId === 'private') return false;
  const value = String(event.message || '');
  if (!value || value.startsWith('#云锦')) return false;
  const store = featureStore(runtime, manifest.id, event, { level: 'group' });
  const state = await store.read({ rules: [], items: [] });
  const rules = Array.isArray(state.rules) ? state.rules : Array.isArray(state.items) ? state.items : [];
  const ruleValue = (item) => String(item?.value || item?.trigger || item?.word || item || '');
  const id = String(manifest.id).padStart(2, '0');
  const hit = id === '41'
    ? rules.find((item) => item?.enabled !== false && item?.trigger && value.includes(String(item.trigger)))
    : rules.find((item) => ruleValue(item) && value.toLowerCase().includes(ruleValue(item).toLowerCase()));
  const ad = id === '16' && /https?:\/\/|www\./iu.test(value);
  if (!hit && !ad) return false;
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
