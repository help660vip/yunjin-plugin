import { getFeatureManifest } from '../../manifest.js';
import { contractFor } from '../../../lib/features/contracts.js';

export const featureId = '40';
export const manifest = Object.freeze(getFeatureManifest(featureId));
export const contract = Object.freeze(contractFor(featureId));
export const command = manifest.command;
export const access = manifest.access;
export const area = manifest.area;
export const examples = Object.freeze([
  String.fromCodePoint(0x23, 0x4e91, 0x9526) + command,
  String.fromCodePoint(0x23, 0x4e91, 0x9526) + command + ' ' + ((contract?.args || [])[0] || '\u67e5\u770b')
]);
export const parameterSchema = Object.freeze({
  maxArgs: 30,
  maxTokenLength: 1000,
  names: Object.freeze([...(contract?.args || [])]),
  actions: Object.freeze([...(contract?.actions || [])])
});
export const securityPolicy = Object.freeze({
  access,
  scope: 'bot/group/user',
  network: Object.freeze({ timeoutMs: 8000, maxBytes: 1048576, privateAddressBlocked: true, redirects: 'manual' }),
  input: Object.freeze({ controlCharactersRemoved: true, maxArgs: parameterSchema.maxArgs }),
  audit: true
});
export const storagePolicy = Object.freeze({
  namespace: 'Yunjin:' + featureId,
  isolation: 'bot/group/user',
  retention: 'bounded',
  redisOptional: true
});
export const renderPolicy = Object.freeze({
  preferredView: contract?.view || 'card',
  renderer: 'shared',
  fallback: 'text',
  maxRows: 100
});
export const dependencyPolicy = Object.freeze({
  required: Object.freeze([...(contract?.dependencies || [])]),
  optional: true,
  missingBehavior: 'explicit-degradation'
});
export const failureMatrix = Object.freeze(['\u8bb0\u5f55\u5b89\u5168\u5a92\u4f53\u5f15\u7528', '\u53c2\u6570\u9519\u8bef\u8fd4\u56de\u7528\u6cd5', '\u6743\u9650\u4e0d\u8db3\u88ab\u62d2\u7edd', '\u8bf7\u6c42\u8d85\u9890\u8fd4\u56de\u91cd\u8bd5\u63d0\u793a', '\u5b58\u50a8\u7f3a\u5931\u660e\u786e\u964d\u7ea7', '\u7528\u6237\u8303\u56f4\u4fdd\u6301\u9694\u79bb']);
export const acceptance = Object.freeze({
  featureId,
  command,
  area,
  access,
  contract: contract?.usage || '',
  tests: Object.freeze(['normal', 'invalid-args', 'permission', 'rate-limit', 'dependency-missing', 'scope-isolation'])
});

export function validateArguments(args = []) {
  const values = Array.isArray(args) ? args : [];
  const errors = [];
  if (values.length > parameterSchema.maxArgs) errors.push('too-many-arguments');
  if (values.some((value) => String(value).length > parameterSchema.maxTokenLength)) errors.push('argument-too-long');
  return { ok: errors.length === 0, errors };
}

export function describe() {
  return { id: featureId, command, area, access, examples: [...examples], parameters: parameterSchema, security: securityPolicy, storage: storagePolicy, render: renderPolicy, dependencies: dependencyPolicy, failureMatrix: [...failureMatrix] };
}

export default manifest;
