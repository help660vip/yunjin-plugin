import { handle01, handle02, handle03, handle04, handle05, handle06, handle07, handle08, handle09, handle10, handle11, handle12, handle13, handle14, handle15, handle16, handle17 } from './core.js';
import { handle18, handle19, handle20, handle21, handle22, handle23, handle24, handle25, handle26 } from './feeds.js';
import { handle27, handle28, handle29, handle30, handle31, handle32, handle33, handle34, handle35 } from './tools.js';
import { handle36, handle37, handle38, handle39, handle40, handle41, handle42, handle43 } from './media.js';
import { handle44, handle45, handle46, handle47, handle48, handle49, handle50 } from './community.js';
import { serviceFor } from '../service-index.js';

export const FEATURE_HANDLERS = Object.freeze({
  '01': handle01, '02': handle02, '03': handle03, '04': handle04, '05': handle05,
  '06': handle06, '07': handle07, '08': handle08, '09': handle09, '10': handle10,
  '11': handle11, '12': handle12, '13': handle13, '14': handle14, '15': handle15,
  '16': handle16, '17': handle17, '18': handle18, '19': handle19, '20': handle20,
  '21': handle21, '22': handle22, '23': handle23, '24': handle24, '25': handle25,
  '26': handle26, '27': handle27, '28': handle28, '29': handle29, '30': handle30,
  '31': handle31, '32': handle32, '33': handle33, '34': handle34, '35': handle35,
  '36': handle36, '37': handle37, '38': handle38, '39': handle39, '40': handle40,
  '41': handle41, '42': handle42, '43': handle43, '44': handle44, '45': handle45,
  '46': handle46, '47': handle47, '48': handle48, '49': handle49, '50': handle50
});

export function handlerFor(id) {
  return FEATURE_HANDLERS[String(id).padStart(2, '0')];
}

export async function dispatchFeature(manifest, event, args, runtime) {
  const handler = handlerFor(manifest.id);
  if (typeof handler !== 'function') return undefined;
  const service = serviceFor(manifest.id);
  const validation = service?.validateInput ? service.validateInput(args) : { ok: true, value: { args } };
  if (!validation.ok) return validation.errors.join('\n');
  return handler(manifest, event, validation.value.args, runtime);
}

export function validateHandlerSet(manifests) {
  const ids = new Set((manifests || []).map((manifest) => String(manifest.id).padStart(2, '0')));
  const missing = [...ids].filter((id) => typeof FEATURE_HANDLERS[id] !== 'function');
  const extra = Object.keys(FEATURE_HANDLERS).filter((id) => !ids.has(id));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra, count: Object.keys(FEATURE_HANDLERS).length };
}
