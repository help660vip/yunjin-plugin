import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUrl, parseSafeUrl, queryValue, redactUrl, stripTracking } from '../../lib/parser/url.js';

test('链接解析会清理外层空白并拒绝危险输入', () => {
  const parsed = parseSafeUrl('  https://example.com/path?q=ok  ');
  assert.equal(parsed.hostname, 'example.com');
  assert.equal(parsed.query.q, 'ok');
  assert.equal(classifyUrl('https://example.com/\n'), 'invalid');
  assert.equal(classifyUrl('https://example.com/' + 'x'.repeat(4097)), 'invalid');
  assert.equal(classifyUrl('https://user:pass@example.com/path'), 'invalid');
});

test('网站分类只允许真实域名和子域名', () => {
  assert.equal(classifyUrl('https://www.youtube.com/watch?v=1'), 'video');
  assert.equal(classifyUrl('https://evil-youtube.com/watch?v=1'), 'web');
  assert.equal(classifyUrl('https://sub.github.com/project'), 'github');
  assert.equal(classifyUrl('https://notgithub.com/project'), 'web');
});

test('脱敏隐藏凭据并移除片段', () => {
  const result = redactUrl('https://example.com/path?token=secret&monkey=value#private');
  const decoded = decodeURIComponent(result);
  assert.match(decoded, /token=\[已隐藏\]/u);
  assert.match(decoded, /monkey=value/u);
  assert.equal(decoded.includes('secret'), false);
  assert.equal(decoded.includes('#private'), false);
  assert.equal(stripTracking('https://example.com/?utm_source=x&keep=y#fragment'), 'https://example.com/?keep=y');
  assert.equal(queryValue('https://example.com/?count=0', 'count'), '0');
});
