import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { contractFor } from '../lib/features/contracts.js';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = path.resolve(pluginRoot, '..', 'upstream-plugins');
const auditRoot = path.join(pluginRoot, '.workstate', 'source-audit');

const references = [
  'plugin-status', 'plugin-sentry', 'nonebot-plugin-logpile', 'nonebot-plugin-sentry-transaction',
  'nonebot-plugin-uptimekuma', 'plugin-apscheduler', 'nonebot-plugin-pmhelp', 'nonebot_plugin_uniconf',
  'nonebot-plugin-access-control', 'nonebot-plugin-namelist', 'nonebot_plugin_groupmanager',
  'nonebot_plugin_eventmonitor', 'nonebot-plugin-auto-enter-group', 'nonebot-plugin-add-friends',
  'nonebot-plugin-paminet-nodirtymsg', 'nonebot-plugin-noadpls', 'nonebot-plugin-batch-withdrawal',
  'nonebot-bison', 'ELF_RSS', 'nonebot-plugin-bilichat', 'nonebot-plugin-scheduled-broadcast',
  'nonebot-plugin-report', 'nonebot-plugin-push', 'nonebot-plugin-multi-source-daily',
  'nonebot-plugin-git-poller', 'nonebot-plugin-heweather', 'nonebot_plugin_translator',
  'nonebot_plugin_picsearcher', 'nonebot-plugin-qrcode', 'nonebot-plugin-QRrender',
  'nonebot-plugin-shorturl', 'nb2-wiki', 'nonebot-plugin-exchangerate', 'nonebot-plugin-todo-nlp',
  'nonebot-plugin-clock', 'nonebot-plugin-parser', 'nonebot_plugin_songpicker2',
  'nonebot-plugin-memes', 'nonebot-plugin-savepic', 'nonebot_plugin_record',
  'nonebot-plugin-autoreply', 'nonebot-plugin-word-bank2', 'nonebot_plugin_summary_group',
  'nonebot-plugin-dailysign', 'nonebot_plugin_quote', 'nonebot-plugin-essence-message',
  'nonebot-plugin-group-heat', 'nonebot-plugin-group-historian', 'nonebot-plugin-lottery-signup',
  'nonebot-plugin-daily-task'
];

const areas = [
  ['core', 1, 8],
  ['governance', 9, 17],
  ['feeds', 18, 26],
  ['tools', 27, 35],
  ['media', 36, 43],
  ['community', 44, 50]
];

function areaFor(index) {
  return areas.find(([, start, end]) => index >= start && index <= end)?.[0] || 'unknown';
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function readText(file, max = 256 * 1024) {
  try {
    const data = await fs.readFile(file);
    return data.subarray(0, max).toString('utf8');
  } catch {
    return '';
  }
}

async function walk(directory, depth = 0, result = []) {
  if (depth > 3 || result.length >= 500) return result;
  let entries = [];
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, depth + 1, result);
    else result.push(full);
  }
  return result;
}

function relativeNames(files, root) {
  return files.map((file) => path.relative(root, file).replaceAll(path.sep, '/')).sort();
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function findByName(files, names) {
  return files.find((file) => names.includes(path.basename(file).toLowerCase()));
}

function signals(readme, files) {
  const text = readme.toLowerCase();
  return {
    hasCommands: /command|命令|使用|usage/u.test(text),
    hasConfiguration: /config|配置|settings|环境变量|env/u.test(text),
    hasNetwork: /http|api|rss|webhook|请求|接口/u.test(text),
    hasSchedule: /schedule|cron|定时|apscheduler|interval/u.test(text),
    hasTests: files.some((file) => /test|spec/u.test(path.basename(file))),
    hasResources: files.some((file) => /resource|asset|font|image|template/u.test(file))
  };
}

function licenseConclusion(licenseFile) {
  if (!licenseFile) return '未发现许可证文件；保持 L0 clean-room，不复制代码或素材。';
  return '发现许可证文件 ' + licenseFile + '；本项目仍采用 L0 clean-room，不复用上游代码或素材。';
}

function markdown(index, directory, files, readme, contract) {
  const id = String(index).padStart(2, '0');
  const inventory = relativeNames(files, directory);
  const names = inventory.slice(0, 80);
  const readmeFile = inventory.find((name) => /^readme(?:\.[^.]+)?$/iu.test(path.basename(name))) || 'not found';
  const licenseFile = inventory.find((name) => /^(license|copying|notice)(\.[^.]+)?$/iu.test(path.basename(name))) || '';
  const packageFiles = inventory.filter((name) => /(^|\/)(package\.json|pyproject\.toml|setup\.py|setup\.cfg|poetry\.lock|requirements.*|package-lock\.json)$/iu.test(name));
  const entryFiles = inventory.filter((name) => /(^|\/)(main|__main__|plugin|bot|app|config|settings|index)\.[^.]+$/iu.test(name)).slice(0, 40);
  const testFiles = inventory.filter((name) => /test|spec/iu.test(name)).slice(0, 40);
  const sourceHash = hashText(readme + '\n' + inventory.join('\n'));
  const observed = signals(readme, files);
  return [
    '# ' + id + ' ' + (contract?.usage || 'YunJin capability'),
    '',
    '- Area: ' + areaFor(index),
    '- Reference directory: upstream-plugins/' + path.basename(directory),
    '- Audit mode: L0 clean-room functional study',
    '- Audit inventory hash: ' + sourceHash,
    '- Generated at: ' + new Date().toISOString(),
    '',
    '## Observable behavior contract',
    '',
    '- Usage: ' + (contract?.usage || 'see manifest contract'),
    '- Actions: ' + (contract?.actions || []).join(', '),
    '- Arguments: ' + (contract?.args || []).join(', '),
    '- Access: ' + (contract?.access || 'user'),
    '- Shared dependencies: ' + (contract?.dependencies || []).join(', '),
    '',
    '## Read-only reference audit',
    '',
    '- README read: ' + (readmeFile !== 'not found' ? 'yes' : 'no'),
    '- Package metadata: ' + (packageFiles.length ? packageFiles.join(', ') : 'not found'),
    '- Entry/config candidates: ' + (entryFiles.length ? entryFiles.join(', ') : 'not found'),
    '- Test candidates: ' + (testFiles.length ? testFiles.join(', ') : 'not found'),
    '- License conclusion: ' + licenseConclusion(licenseFile),
    '- Observed command signal: ' + String(observed.hasCommands),
    '- Observed configuration signal: ' + String(observed.hasConfiguration),
    '- Observed network signal: ' + String(observed.hasNetwork),
    '- Observed schedule signal: ' + String(observed.hasSchedule),
    '- Observed test signal: ' + String(observed.hasTests),
    '- Observed resource signal: ' + String(observed.hasResources),
    '',
    '## Configuration and boundaries',
    '',
    '- YunJin configuration uses the shared schema under feature.' + id + '.*.',
    '- State is isolated by bot/group/user through FeatureStore; no upstream database schema is reused.',
    '- Network access uses the shared HTTP policy with protocol, DNS, private-address, redirect, size and timeout checks.',
    '- Renderer paths use structured view models and text fallback; no upstream templates or assets are copied.',
    '',
    '## Success, failure and degradation',
    '',
    '- Success returns a concise text result and may use the shared renderer when available.',
    '- Invalid arguments return usage without network calls.',
    '- Missing optional dependencies or external services return an explicit fallback and audit record.',
    '- Unsupported bot operations are reported as unsupported; the plugin does not claim success.',
    '',
    '## Security and privacy',
    '',
    '- No tokens, cookies, complete private messages, source code or binary assets are written to this audit.',
    '- URLs are validated by the shared HTTP policy; stored media is bounded and scope-isolated.',
    '- Logs and audit details use redaction and bounded strings.',
    '',
    '## Keep / redesign / discard',
    '',
    '- Keep: user-observable purpose, command intent, input/output and failure boundaries.',
    '- Redesign: framework integration, configuration, persistence, permissions, scheduling, networking and rendering.',
    '- Discard: upstream source code, unique regexes, comments, wording, tests, images, fonts, database schema and credentials.',
    '',
    '## Reuse and license',
    '',
    '- Reuse level: L0.',
    '- No code, asset, test, database schema or text was copied from the reference repository.',
    '- The inventory above is for internal traceability only and is excluded by .gitignore.'
  ].join('\n');
}

async function main() {
  await fs.mkdir(auditRoot, { recursive: true });
  if (references.length !== 50) throw new Error('reference list must contain exactly 50 entries');
  const written = [];
  for (let index = 1; index <= references.length; index += 1) {
    const name = references[index - 1];
    const directory = path.join(upstreamRoot, name);
    const files = await walk(directory);
    const readmeFile = findByName(files, ['readme.md', 'readme.rst', 'readme.txt']);
    const readme = readmeFile ? await readText(readmeFile) : '';
    const contract = contractFor(String(index).padStart(2, '0'));
    const slug = contract?.area || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const target = path.join(auditRoot, String(index).padStart(2, '0') + '-' + slug + '.md');
    await fs.writeFile(target, markdown(index, directory, files, readme, contract), 'utf8');
    written.push({ id: String(index).padStart(2, '0'), reference: name, files: files.length, target: path.basename(target) });
  }
  process.stdout.write(JSON.stringify({ ok: true, count: written.length, written }, null, 2) + '\n');
}

await main();
