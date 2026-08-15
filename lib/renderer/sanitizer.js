const dangerous = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

export function cleanRenderText(value, max = 10000) {
  return String(value ?? '').replace(dangerous, '').slice(0, max);
}

export function escapeHtml(value) {
  return cleanRenderText(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function safeRenderUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.href.slice(0, 2000);
  } catch {
    return '';
  }
}

export function normalizeViewModel(value, options = {}) {
  const maxRows = Number(options.maxRows || 100);
  const input = value && typeof value === 'object' ? value : { value };
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, maxRows).map((row) => ({
    label: cleanRenderText(row?.label ?? '', 200),
    value: cleanRenderText(row?.value ?? row?.text ?? '', 1000),
    url: safeRenderUrl(row?.url)
  })) : [];
  return {
    feature: cleanRenderText(input.feature || 'YunJin', 80),
    view: cleanRenderText(input.view || 'card', 80),
    title: cleanRenderText(input.title || input.feature || 'YunJin', 200),
    subtitle: cleanRenderText(input.subtitle || '', 500),
    rows,
    footer: cleanRenderText(input.footer || 'https://github.com/help660vip/yunjin-plugin', 300)
  };
}

export function textFromViewModel(model) {
  const view = normalizeViewModel(model);
  return [view.title, view.subtitle, ...view.rows.map((row) => [row.label, row.value].filter(Boolean).join('：')), view.footer].filter(Boolean).join('\n');
}
