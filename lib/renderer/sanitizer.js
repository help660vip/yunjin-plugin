const dangerous = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

function scalarText(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'boolean') return '';
  return String(value);
}

function limitValue(max, fallback) {
  const number = Number(max);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

export function cleanRenderText(value, max = 10000) {
  return scalarText(value).replace(dangerous, '').slice(0, limitValue(max, 10000));
}

export function escapeHtml(value) {
  return cleanRenderText(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function safeRenderUrl(value) {
  try {
    const text = cleanRenderText(value, 2000);
    if (!text) return '';
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.href.slice(0, 2000);
  } catch {
    return '';
  }
}

export function normalizeViewModel(value, options = {}) {
  const maxRowsValue = Number(options.maxRows);
  const maxRows = !Number.isFinite(maxRowsValue) || maxRowsValue < 0 ? 100 : Math.min(100, Math.floor(maxRowsValue));
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, maxRows).map((row) => ({
    label: cleanRenderText(row && typeof row === 'object' ? row.label : '', 200),
    value: cleanRenderText(row && typeof row === 'object' ? row.value ?? row.text : '', 1000),
    url: safeRenderUrl(row && typeof row === 'object' ? row.url : '')
  })) : [];
  const feature = cleanRenderText(input.feature, 80) || 'YunJin';
  const title = cleanRenderText(input.title ?? input.feature, 200) || feature;
  return {
    feature,
    view: cleanRenderText(input.view, 80) || 'card',
    title,
    subtitle: cleanRenderText(input.subtitle, 500),
    rows,
    footer: cleanRenderText(input.footer, 300) || 'https://github.com/help660vip/yunjin-plugin'
  };
}

export function textFromViewModel(model) {
  const view = normalizeViewModel(model);
  return [view.title, view.subtitle, ...view.rows.map((row) => [row.label, row.value].filter(Boolean).join('?')), view.footer].filter(Boolean).join('\n');
}
