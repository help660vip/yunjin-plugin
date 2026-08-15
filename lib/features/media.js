import { FilePolicy, sniffMime } from '../adapters/file.js';
import { validateUrl } from '../http/policy.js';
import { cleanText } from '../core/safe.js';

export class MediaPolicy {
  constructor(options = {}) {
    this.file = options.file || new FilePolicy(options);
    this.maxText = Number(options.maxText || 2000);
    this.maxImages = Number(options.maxImages || 10);
    this.allowedImageMime = options.allowedImageMime || ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  }

  imageSegments(event) {
    return (event?.segments || []).filter((segment) => segment.type === 'image').slice(0, this.maxImages).map((segment) => ({ url: String(segment.url || ''), file: String(segment.file || ''), mime: String(segment.mime || '') }));
  }

  safeImageUrls(event, args = []) {
    const values = this.imageSegments(event).map((item) => item.url || item.file).concat(args).filter(Boolean);
    const result = [];
    for (const value of values.slice(0, this.maxImages)) {
      try { result.push(validateUrl(value).href); } catch {}
    }
    return [...new Set(result)];
  }

  textCard(template, text) {
    return { template: cleanText(template || 'text', { max: 100 }), text: cleanText(text, { max: this.maxText }), fallback: true };
  }

  assertImageBuffer(buffer) {
    const mime = sniffMime(buffer);
    if (!this.allowedImageMime.includes(mime)) throw new Error('image mime rejected');
    return this.file.assertBuffer(buffer, { mime, allowedMime: this.allowedImageMime });
  }

  async saveImageUrl(url, options = {}) {
    return this.file.saveUrl(validateUrl(url).href, { ...options, allowedMime: this.allowedImageMime });
  }
}

export function mediaPolicy(options) {
  return new MediaPolicy(options);
}
