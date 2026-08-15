import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveInside, safeFilename, safeExtension } from '../core/safe.js';
import { fileRejected } from '../core/errors.js';
import { fetchBuffer } from '../http/client.js';

const MAGIC = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', text: 'RIFF', offset: 0 },
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }
];

function matches(buffer, signature) {
  if (signature.bytes && signature.bytes.some((byte, index) => buffer[index] !== byte)) return false;
  if (signature.text && buffer.subarray(signature.offset || 0, (signature.offset || 0) + signature.text.length).toString('ascii') !== signature.text) return false;
  return true;
}

export function sniffMime(buffer) {
  const value = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return MAGIC.find((signature) => matches(value, signature))?.mime || 'application/octet-stream';
}

export function isAllowedMime(mime, allowed = []) {
  if (!allowed.length) return true;
  const value = String(mime || '').toLowerCase();
  return allowed.some((pattern) => value === String(pattern).toLowerCase() || (String(pattern).endsWith('/*') && value.startsWith(String(pattern).slice(0, -1))));
}

export class FilePolicy {
  constructor(options = {}) {
    this.root = path.resolve(options.root || path.resolve(process.cwd(), 'temp', 'yunjin-plugin'));
    this.maxBytes = Number(options.maxBytes || 8 * 1024 * 1024);
    this.maxFiles = Number(options.maxFiles || 1000);
    this.ttlMs = Number(options.ttlMs || 24 * 3600000);
    this.allowedMime = options.allowedMime || [];
    this.allowedExtensions = options.allowedExtensions || [];
  }

  async initialize() {
    await fs.mkdir(this.root, { recursive: true });
    return this;
  }

  pathFor(name) {
    const value = String(name || '');
    if (!value || value.includes('/') || value.includes('\\') || value === '.' || value === '..' || path.basename(value) !== value) throw fileRejected('文件名包含非法路径。');
    return resolveInside(this.root, safeFilename(value));
  }

  assertBuffer(buffer, options = {}) {
    const value = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const maxBytes = Number(options.maxBytes || this.maxBytes);
    if (value.length > maxBytes) throw fileRejected('文件超过大小限制。', { size: value.length, maxBytes });
    const mime = options.mime || sniffMime(value);
    const allowed = options.allowedMime || this.allowedMime;
    if (!isAllowedMime(mime, allowed)) throw fileRejected('文件 MIME 类型不受支持。', { mime });
    if (options.extension) safeExtension(options.extension, options.allowedExtensions || this.allowedExtensions);
    return { buffer: value, mime, size: value.length };
  }

  async saveBuffer(buffer, options = {}) {
    await this.initialize();
    const checked = this.assertBuffer(buffer, options);
    const name = safeFilename(options.name || crypto.randomUUID() + '.bin');
    const target = this.pathFor(name);
    const temp = target + '.tmp-' + crypto.randomUUID();
    await fs.writeFile(temp, checked.buffer, { flag: 'wx' });
    await fs.rename(temp, target);
    return { path: target, name, mime: checked.mime, size: checked.size, createdAt: Date.now(), expiresAt: Date.now() + this.ttlMs };
  }

  async saveUrl(url, options = {}) {
    const result = await fetchBuffer(url, { maxBytes: options.maxBytes || this.maxBytes, timeoutMs: options.timeoutMs || 8000, attempts: options.attempts || 2, mime: options.allowedMime || this.allowedMime });
    return this.saveBuffer(result.buffer, { ...options, mime: result.contentType, name: options.name || path.basename(new URL(result.url).pathname) });
  }

  async read(name, options = {}) {
    const target = this.pathFor(name);
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > Number(options.maxBytes || this.maxBytes)) throw fileRejected('文件不可读取。');
    return fs.readFile(target);
  }

  async remove(name) {
    try { await fs.rm(this.pathFor(name), { force: true }); return true; } catch { return false; }
  }

  async cleanup(now = Date.now()) {
    await this.initialize();
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(this.root, entry.name);
      try {
        const stat = await fs.stat(file);
        if (now - stat.mtimeMs > this.ttlMs || entry.name.includes('.tmp-')) {
          await fs.rm(file, { force: true });
          removed += 1;
        }
      } catch {}
    }
    return removed;
  }

  async inventory() {
    await this.initialize();
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) if (entry.isFile()) {
      const file = path.join(this.root, entry.name);
      try {
        const stat = await fs.stat(file);
        files.push({ name: entry.name, size: stat.size, modifiedAt: stat.mtimeMs });
      } catch {}
    }
    return files.slice(0, this.maxFiles);
  }
}

export function filePolicy(options) {
  return new FilePolicy(options);
}
