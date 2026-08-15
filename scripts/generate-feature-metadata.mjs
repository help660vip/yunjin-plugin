import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureManifests } from '../apps/manifest.js';
import { contractFor } from '../lib/features/contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureRoot = path.join(root, 'apps', 'features');

const manifestTemplate = [
  "import { getFeatureManifest } from '../../manifest.js';",
  "import { contractFor } from '../../../lib/features/contracts.js';",
  "",
  "export const featureId = '__ID__';",
  "export const manifest = Object.freeze(getFeatureManifest(featureId));",
  "export const contract = Object.freeze(contractFor(featureId));",
  "export const command = manifest.command;",
  "export const access = manifest.access;",
  "export const area = manifest.area;",
  "export const examples = Object.freeze([",
  "  '#云锦' + command,",
  "  '#云锦' + command + ' ' + ((contract?.args || [])[0] || '查看')",
  "]);",
  "export const parameterSchema = Object.freeze({",
  "  maxArgs: 30,",
  "  maxTokenLength: 1000,",
  "  names: Object.freeze([...(contract?.args || [])]),",
  "  actions: Object.freeze([...(contract?.actions || [])])",
  "});",
  "export const securityPolicy = Object.freeze({",
  "  access,",
  "  scope: 'bot/group/user',",
  "  network: Object.freeze({ timeoutMs: 8000, maxBytes: 1048576, privateAddressBlocked: true, redirects: 'manual' }),",
  "  input: Object.freeze({ controlCharactersRemoved: true, maxArgs: parameterSchema.maxArgs }),",
  "  audit: true",
  "});",
  "export const storagePolicy = Object.freeze({",
  "  namespace: 'Yunjin:' + featureId,",
  "  isolation: 'bot/group/user',",
  "  retention: 'bounded',",
  "  redisOptional: true",
  "});",
  "export const renderPolicy = Object.freeze({",
  "  preferredView: contract?.view || 'card',",
  "  renderer: 'shared',",
  "  fallback: 'text',",
  "  maxRows: 100",
  "});",
  "export const dependencyPolicy = Object.freeze({",
  "  required: Object.freeze([...(contract?.dependencies || [])]),",
  "  optional: true,",
  "  missingBehavior: 'explicit-degradation'",
  "});",
  "export const failureMatrix = Object.freeze([",
  "  'normal input returns a user-visible result',",
  "  'invalid arguments return usage without side effects',",
  "  'insufficient permission is rejected by rule and service',",
  "  'rate limit returns a bounded retry response',",
  "  'missing dependency returns explicit fallback',",
  "  'scope and bot identifiers remain isolated'",
  "]);",
  "export const acceptance = Object.freeze({",
  "  featureId,",
  "  command,",
  "  area,",
  "  access,",
  "  contract: contract?.usage || '',",
  "  tests: Object.freeze(['normal', 'invalid-args', 'permission', 'rate-limit', 'dependency-missing', 'scope-isolation'])",
  "});",
  "",
  "export function validateArguments(args = []) {",
  "  const values = Array.isArray(args) ? args : [];",
  "  const errors = [];",
  "  if (values.length > parameterSchema.maxArgs) errors.push('too-many-arguments');",
  "  if (values.some((value) => String(value).length > parameterSchema.maxTokenLength)) errors.push('argument-too-long');",
  "  return { ok: errors.length === 0, errors };",
  "}",
  "",
  "export function describe() {",
  "  return { id: featureId, command, area, access, examples: [...examples], parameters: parameterSchema, security: securityPolicy, storage: storagePolicy, render: renderPolicy, dependencies: dependencyPolicy, failureMatrix: [...failureMatrix] };",
  "}",
  "",
  "export default manifest;"
].join('\n');

const pluginTemplate = [
  "import { createFeaturePlugin } from '../factory.js';",
  "import { manifest, featureId, command, access, area, acceptance } from './manifest.js';",
  "",
  "export const Plugin = createFeaturePlugin(manifest);",
  "export const pluginMeta = Object.freeze({ featureId, command, access, area, acceptance });",
  "export function create() {",
  "  return new Plugin();",
  "}",
  "export default Plugin;"
].join('\n');

async function main() {
  const dirs = await fs.readdir(featureRoot, { withFileTypes: true });
  let count = 0;
  for (const item of featureManifests) {
    const id = String(item.id).padStart(2, '0');
    const dir = dirs.find((entry) => entry.isDirectory() && entry.name.startsWith(id + '-'));
    if (!dir) throw new Error('missing feature directory ' + id);
    const contract = contractFor(id);
    const manifest = manifestTemplate.replaceAll('__ID__', id);
    const plugin = pluginTemplate;
    const destination = path.join(featureRoot, dir.name);
    await fs.writeFile(path.join(destination, 'manifest.js'), manifest + '\n', 'utf8');
    await fs.writeFile(path.join(destination, 'plugin.js'), plugin + '\n', 'utf8');
    if (!contract) throw new Error('missing contract ' + id);
    count += 1;
  }
  process.stdout.write('generated metadata for ' + count + ' features\n');
}

await main();
