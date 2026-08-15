import { cleanText, limitArray } from '../../../lib/core/safe.js';
import { normalizeBotId, normalizeGroupId, normalizeUserId, scopeKey } from '../../../lib/core/ids.js';
import { contractFor } from '../../../lib/features/contracts.js';

export const featureId = '33';
export const featureSlug = 'exchange-rate';
export const contract = Object.freeze(contractFor(featureId));
export const actions = Object.freeze([...(contract?.actions || [])]);
export const dependencies = Object.freeze([...(contract?.dependencies || [])]);
export const command = '汇率';

function valueOf(input) {
  if (Array.isArray(input)) return input.map((item) => cleanText(item, { max: 1000 }));
  if (input && typeof input === 'object') return normalizeInput(input);
  return cleanText(input, { max: 1000 });
}

export function normalizeInput(input = []) {
  const args = Array.isArray(input) ? input : input.args || input.tokens || [];
  const rawArgs = args.map((item) => String(item ?? ''));
  const cleanedArgs = rawArgs.map((item) => cleanText(item, { max: 1000 }));
  return {
    args: limitArray(cleanedArgs, 30),
    inputCount: cleanedArgs.length,
    oversizedArgs: rawArgs.filter((item) => item.length > 1000).length,
    raw: cleanText(input.raw || '', { max: 2000 }),
    flags: input.flags && typeof input.flags === 'object' ? { ...input.flags } : {}
  };
}

export function validateInput(input = []) {
  const normalized = normalizeInput(input);
  const errors = [];
  if (normalized.inputCount > 30) errors.push('参数数量超过上限。');
  if (normalized.oversizedArgs > 0) errors.push('argument exceeds limit');
  return { ok: errors.length === 0, errors, value: normalized };
}

export function scopeFor(event, level) {
  return scopeKey(event, { level: level || (event?.groupId ? 'group' : 'user') });
}

export function identityFor(event) {
  return { botId: normalizeBotId(event), groupId: normalizeGroupId(event), userId: normalizeUserId(event) };
}

export function redactInput(input) {
  const normalized = normalizeInput(input);
  return { args: normalized.args.map((item) => item.length > 160 ? item.slice(0, 160) + '…' : item), flags: Object.keys(normalized.flags) };
}

export function buildHelp() {
  const usage = (contract?.args || []).join(' ');
  const actionText = (contract?.actions || []).join(' | ');
  return ['#云锦' + command, contract?.usage || '', actionText ? '操作：' + actionText : '', usage ? '参数：' + usage : '', '权限：' + (contract?.access || 'user'), '依赖：' + dependencies.join('、')].filter(Boolean).join('\n');
}

export function health(runtime) {
  const enabled = runtime?.registry?.isEnabled ? runtime.registry.isEnabled(featureId, {}) : true;
  return { featureId, command, enabled, dependencies: [...dependencies], scope: 'bot/group/user', fallback: 'text' };
}

export function resultMeta(value) {
  return { featureId, command, type: typeof value, length: String(value ?? '').length, generatedAt: Date.now() };
}

export async function run(event, args, runtime) {
  const validation = validateInput(args);
  if (!validation.ok) return validation.errors.join('\n');
  const manifestModule = await import('../../manifest.js');
  const handlers = await import('../../../lib/features/handlers/index.js');
  const manifest = manifestModule.getFeatureManifest(featureId);
  const handler = handlers.handlerFor(featureId);
  if (!manifest || typeof handler !== 'function') return '能力 handler 尚未注册。';
  return handler(manifest, event, validation.value.args, runtime);
}

export const operationPolicy = Object.freeze({ maxArgs: 30, maxArgLength: 1000, maxOutputLength: 3000, rateWindowMs: 60000, ratePoints: 20, dailyQuota: 100, actions: [...actions], dependencies: [...dependencies] });

export function actionOf(input) {
  const candidate = normalizeInput(input).args[0] || actions[0] || 'view';
  return actions.includes(candidate) ? candidate : actions[0] || candidate;
}

export function actionAllowed(action) {
  return actions.includes(cleanText(action, { max: 80 }));
}

export function quotaCost(input) {
  const normalized = normalizeInput(input);
  return Math.max(1, Math.min(10, 1 + Math.floor(normalized.inputCount / 5)));
}

export function rateKey(event) {
  return 'Yunjin:' + featureId + ':rate:' + scopeFor(event);
}

export function storageKey(event, suffix = 'state') {
  const safeSuffix = cleanText(suffix, { max: 80 }).replace(/[^a-zA-Z0-9._-]/gu, '_') || 'state';
  return 'Yunjin:' + featureId + ':' + scopeFor(event) + ':' + safeSuffix;
}

export function auditPayload(event, input, action) {
  const identity = identityFor(event);
  return { featureId, action: cleanText(action, { max: 80 }), scope: scopeFor(event), botId: identity.botId, groupId: identity.groupId, userId: identity.userId, input: redactInput(input) };
}

export function failure(code, detail = '') {
  const messages = { invalid: '?????', permission: '????', rate: '??????', quota: '???????', dependency: '??????', scope: '????????' };
  const message = messages[code] || '????';
  return cleanText(detail ? message + ': ' + detail : message, { max: operationPolicy.maxOutputLength });
}

export function operationPlan(event, input) {
  const action = actionOf(input);
  return { featureId, action, scope: scopeFor(event), key: storageKey(event, action), rateKey: rateKey(event), quotaCost: quotaCost(input), dependencies: [...dependencies], fallback: 'text' };
}

export function normalizeResult(value) {
  if (value === null || value === undefined) return { text: '', type: 'empty' };
  if (typeof value === 'string') return { text: cleanText(value, { max: operationPolicy.maxOutputLength }), type: 'text' };
  return { text: cleanText(JSON.stringify(value), { max: operationPolicy.maxOutputLength }), type: 'data' };
}

export function resultRows(value) {
  const normalized = normalizeResult(value);
  return normalized.text ? normalized.text.split(/\r?\n/gu).slice(0, 50) : [];
}

export function commandExample() {
  const first = actions[0] || '??';
  return String.fromCodePoint(0x23, 0x4e91, 0x9526) + command + (first ? ' ' + first : '');
}

export function dependencySummary(runtime) {
  return dependencies.map((name) => ({ name, available: runtime?.providers?.has?.(name) || runtime?.[name] !== undefined }));
}

export function isDegraded(runtime) {
  return dependencySummary(runtime).some((item) => item.available === false);
}

export function scopeIdentity(event) {
  const identity = identityFor(event);
  return { ...identity, scope: scopeFor(event), isolated: Boolean(identity.botId || identity.groupId || identity.userId) };
}

export function inputSummary(input) {
  const normalized = normalizeInput(input);
  return { count: normalized.inputCount, oversized: normalized.oversizedArgs, hasRaw: Boolean(normalized.raw), flags: Object.keys(normalized.flags) };
}

export function describeAction(action) {
  const name = cleanText(action, { max: 80 });
  return { name, allowed: actionAllowed(name), command, featureId };
}

export function validateScope(event) {
  const identity = scopeIdentity(event);
  return { ok: identity.isolated, scope: identity.scope, error: identity.isolated ? '' : failure('scope') };
}

export function helpRows() {
  return actions.map((action) => ({ action, example: String.fromCodePoint(0x23, 0x4e91, 0x9526) + command + ' ' + action, access: contract?.access || 'user', fallback: 'text' }));
}

export function healthCheck(runtime) {
  const health = health(runtime);
  return { ...health, degraded: isDegraded(runtime), operations: actions.length, policy: { rateWindowMs: operationPolicy.rateWindowMs, dailyQuota: operationPolicy.dailyQuota } };
}

export const privacyPolicy = Object.freeze({ redactArgs: true, maxAuditText: 160, keepUserId: true, keepMessageId: false });
export const renderPolicy = Object.freeze({ preferred: 'runtime.render', fallback: 'text', maxOutputLength: 3000, allowRemoteAsset: false });

export function quotaPolicy(input) {
  return { cost: quotaCost(input), daily: operationPolicy.dailyQuota, scope: 'user' };
}

export function renderPolicyFor(runtime) {
  return { ...renderPolicy, renderer: runtime?.render ? 'runtime' : 'text', degraded: !runtime?.render };
}

export function privacyCheck(input) {
  const summary = inputSummary(input);
  return { safe: privacyPolicy.redactArgs, bounded: summary.oversized === 0, flags: summary.flags };
}

export function acceptanceRows() {
  return failureMatrix.map((name, index) => ({ index: index + 1, name, required: true }));
}

export function dependencyFailure(runtime) {
  const missing = dependencySummary(runtime).filter((item) => !item.available).map((item) => item.name);
  return missing.length ? failure('dependency', missing.join(', ')) : '';
}

export function boundedOutput(value) {
  return normalizeResult(value).text.slice(0, operationPolicy.maxOutputLength);
}

export function policySnapshot(event, input, runtime) {
  return { featureId, command, scope: scopeFor(event), quota: quotaPolicy(input), privacy: privacyCheck(input), render: renderPolicyFor(runtime), dependency: dependencyFailure(runtime) };
}

export const failureMatrix = Object.freeze(['normal input', 'invalid arguments', 'insufficient permission', 'rate limit', 'missing dependency', 'scope isolation']);

export function describe() {
  return { id: featureId, slug: featureSlug, command, contract, actions: [...actions], dependencies: [...dependencies], failureMatrix: [...failureMatrix] };
}

export const helpers = Object.freeze({ valueOf, normalizeInput, validateInput, scopeFor, identityFor, redactInput, buildHelp, health, resultMeta, describe });
