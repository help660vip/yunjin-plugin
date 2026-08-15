import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = path.join(root, '.workstate', 'state.json');
const auditRoot = path.join(root, '.workstate', 'source-audit');
const expectedRepository = 'https://github.com/help660vip/yunjin-plugin.git';
const expectedBranch = 'main';
const expectedVersion = '1.0.1';
const expectedCount = 50;

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

async function readJson(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return JSON.parse(text.replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail('cannot read JSON: ' + file, { cause: error.message });
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function validateFeature(feature, index) {
  assert(feature && typeof feature === 'object', 'feature ' + (index + 1) + ' is not an object');
  assert(/^[0-9]{2}$/.test(feature.id), 'feature ' + (index + 1) + ' has an invalid id');
  assert(feature.status === 'integrated' || feature.status === 'blocked', 'feature ' + feature.id + ' has an invalid status');
  assert(typeof feature.area === 'string' && feature.area.length > 0, 'feature ' + feature.id + ' has no area');
  assert(typeof feature.sourceAudit === 'string' && feature.sourceAudit.startsWith('source-audit/'), 'feature ' + feature.id + ' has no audit path');
  assert(typeof feature.owner === 'string' && feature.owner.length > 0, 'feature ' + feature.id + ' has no owner');
  assert(typeof feature.branch === 'string' && feature.branch.length > 0, 'feature ' + feature.id + ' has no branch');
  assert(typeof feature.headSha === 'string' && /^[0-9a-f]{40}$/.test(feature.headSha), 'feature ' + feature.id + ' has no valid head SHA');
  assert(typeof feature.releaseVersion === 'string' && /^v[0-9]\.[0-9]\.[0-9]$/.test(feature.releaseVersion), 'feature ' + feature.id + ' has an invalid release version');
  assert(feature.tests && typeof feature.tests === 'object', 'feature ' + feature.id + ' has no test record');
  for (const key of ['unit', 'trss', 'miao']) assert(feature.tests[key], 'feature ' + feature.id + ' is missing ' + key + ' result');
}

async function collectAudits() {
  const names = await fs.readdir(auditRoot);
  return new Set(names.filter((name) => name.endsWith('.md')));
}

async function validateState() {
  assert(await exists(stateFile), 'missing .workstate/state.json');
  assert(await exists(auditRoot), 'missing .workstate/source-audit');
  const state = await readJson(stateFile);
  assert(state.repository === expectedRepository, 'repository does not match the approved origin');
  assert(state.branch === expectedBranch, 'state branch is not main');
  assert(state.currentVersion === expectedVersion, 'state version is not the published package version');
  assert(state.currentTag === 'v' + expectedVersion, 'state tag does not match package version');
  assert(typeof state.lastPushedSha === 'string' && /^[0-9a-f]{40}$/.test(state.lastPushedSha), 'missing last pushed SHA');
  assert(Array.isArray(state.features), 'state.features must be an array');
  assert(state.features.length === expectedCount, 'expected ' + expectedCount + ' feature records, actual ' + state.features.length);
  const ids = new Set();
  const audits = await collectAudits();
  for (let index = 0; index < state.features.length; index += 1) {
    const feature = state.features[index];
    validateFeature(feature, index);
    assert(!ids.has(feature.id), 'duplicate feature id ' + feature.id);
    ids.add(feature.id);
    assert(audits.has(path.basename(feature.sourceAudit)), 'missing audit ' + feature.sourceAudit);
  }
  for (let n = 1; n <= expectedCount; n += 1) {
    const id = String(n).padStart(2, '0');
    assert(ids.has(id), 'missing feature ' + id);
  }
  assert(Array.isArray(state.knownGaps), 'knownGaps must be an array');
  return { state, featureCount: state.features.length, auditCount: audits.size };
}

const result = await validateState();
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ ok: true, featureCount: result.featureCount, auditCount: result.auditCount, version: result.state.currentVersion, sha: result.state.lastPushedSha }, null, 2) + '\n');
} else {
  process.stdout.write('state-ok features=' + result.featureCount + ' audits=' + result.auditCount + ' version=' + result.state.currentVersion + ' sha=' + result.state.lastPushedSha + '\n');
}
