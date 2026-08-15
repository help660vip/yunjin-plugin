import { escapeHtml, normalizeViewModel, safeRenderUrl } from './sanitizer.js';

const css = [
  ':root { color-scheme: dark; font-family: "Noto Sans SC","Noto Sans CJK SC","WenQuanYi Micro Hei","Microsoft YaHei",sans-serif; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; width: 900px; min-height: 240px; color: #f8fafc; background: #111827; }',
  '.shell { padding: 30px; background: linear-gradient(135deg,#111827,#1f2937 58%,#0f172a); }',
  '.card { padding: 26px 30px; border: 1px solid rgba(255,255,255,.18); border-radius: 14px; background: rgba(15,23,42,.82); box-shadow: 0 18px 50px rgba(0,0,0,.28); }',
  '.kicker { color: #93c5fd; font-size: 14px; letter-spacing: .08em; }',
  'h1 { margin: 8px 0 18px; font-size: 30px; text-align: center; }',
  '.subtitle { color: #cbd5e1; text-align: center; white-space: pre-wrap; }',
  '.rows { margin-top: 22px; display: grid; gap: 10px; }',
  '.row { display: grid; grid-template-columns: 190px 1fr; gap: 18px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.12); }',
  '.label { color: #93c5fd; }',
  '.value { color: #f8fafc; overflow-wrap: anywhere; }',
  'a { color: #bfdbfe; }',
  'footer { margin-top: 22px; color: #94a3b8; font-size: 12px; border-top: 1px solid rgba(255,255,255,.12); padding-top: 12px; }'
].join('');

export function renderCardHtml(model) {
  const view = normalizeViewModel(model);
  const rows = view.rows.map((row) => {
    const content = row.url ? '<a href="' + safeRenderUrl(row.url) + '">' + escapeHtml(row.value) + '</a>' : escapeHtml(row.value);
    return '<div class="row"><div class="label">' + escapeHtml(row.label) + '</div><div class="value">' + content + '</div></div>';
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body><main class="shell"><section class="card"><div class="kicker">' + escapeHtml(view.feature) + '</div><h1>' + escapeHtml(view.title) + '</h1><div class="subtitle">' + escapeHtml(view.subtitle) + '</div><div class="rows">' + rows + '</div><footer>' + escapeHtml(view.footer) + '</footer></section></main></body></html>';
}

export function renderListHtml(model) {
  return renderCardHtml({ ...normalizeViewModel(model), view: 'list' });
}

export function renderDashboardHtml(model) {
  return renderCardHtml({ ...normalizeViewModel(model), view: 'dashboard' });
}

export function renderTableHtml(model) {
  return renderCardHtml({ ...normalizeViewModel(model), view: 'table' });
}
