import { cleanText } from '../core/safe.js';

function decodeXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, '$1').replace(/&amp;/giu, '&').replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/&quot;/giu, '"').replace(/&#39;/giu, "'");
}

function tags(xml, name) {
  const values = [];
  const pattern = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\\\s\\\\S]*?)</' + name + '>', 'giu');
  for (const match of String(xml).matchAll(pattern)) values.push(decodeXml(match[1]));
  return values;
}

export function parseFeed(xml, options = {}) {
  const maxItems = Number(options.maxItems || 50);
  const text = String(xml || '').slice(0, Number(options.maxBytes || 1024 * 1024));
  const rssItems = [...text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].map((match) => match[1]);
  const atomItems = [...text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/giu)].map((match) => match[1]);
  const chunks = [...rssItems, ...atomItems].slice(0, maxItems);
  const items = chunks.map((chunk) => {
    const title = cleanText(tags(chunk, 'title')[0] || '', { max: 500 });
    const description = cleanText(tags(chunk, 'description')[0] || tags(chunk, 'summary')[0] || '', { max: 1000 });
    const link = tags(chunk, 'link')[0] || chunk.match(/<link[^>]+href=["']([^"']+)["']/iu)?.[1] || '';
    const published = tags(chunk, 'pubDate')[0] || tags(chunk, 'published')[0] || tags(chunk, 'updated')[0] || '';
    return { title, description, link: cleanText(link, { max: 2000 }), published: cleanText(published, { max: 100 }) };
  }).filter((item) => item.title || item.link);
  const channelTitle = cleanText(tags(text, 'channel')[0] ? tags(tags(text, 'channel')[0], 'title')[0] : tags(text, 'title')[0] || '', { max: 300 });
  return { title: channelTitle, items, format: rssItems.length ? 'rss' : atomItems.length ? 'atom' : 'unknown', truncated: Buffer.byteLength(text, 'utf8') >= Number(options.maxBytes || 1024 * 1024) };
}

export function feedTitles(feed, limit = 10) {
  return (feed?.items || []).slice(0, limit).map((item) => item.title).filter(Boolean);
}

export function dedupeFeedItems(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item.link || item.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
