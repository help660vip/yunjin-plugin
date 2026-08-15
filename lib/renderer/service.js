import { renderFailed, normalizeError } from '../core/errors.js';
import { cleanRenderText, normalizeViewModel, textFromViewModel } from './sanitizer.js';
import { renderCardHtml, renderDashboardHtml, renderListHtml, renderTableHtml } from './templates.js';

export function renderText(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => {
    if (item && typeof item === 'object') return item.text ?? item.value ?? '';
    return item;
  }).map((item) => cleanRenderText(item)).filter(Boolean).join('\n');
}

function rendererOf(event, runtime) {
  return runtime?.renderer || event?.runtime?.render || event?.raw?.runtime?.render || event?.raw?.runtime?.renderer;
}

function templateFor(view) {
  if (view === 'dashboard') return renderDashboardHtml;
  if (view === 'list') return renderListHtml;
  if (view === 'table') return renderTableHtml;
  return renderCardHtml;
}

function validRenderResult(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => validRenderResult(item));
  if (!value || typeof value !== 'object') return false;
  const type = typeof value.type === 'string' ? value.type.trim() : '';
  if (!type) return false;
  return ['url', 'file', 'path', 'text', 'data', 'message', 'id'].some((key) => {
    const item = value[key];
    return typeof item === 'string' ? Boolean(item.trim()) : Array.isArray(item) ? item.length > 0 : item && typeof item === 'object' ? Object.keys(item).length > 0 : item !== undefined && item !== null;
  });
}

export async function renderCard(event, options = {}) {
  const viewModel = normalizeViewModel(options.data || options.viewModel || {});
  const fallbackText = renderText(options.fallbackText ?? textFromViewModel(viewModel)) || textFromViewModel(viewModel);
  const renderer = rendererOf(event, options.runtime);
  if (typeof renderer !== 'function' || options.disable === true) return fallbackText;
  const html = templateFor(viewModel.view)(viewModel);
  try {
    const result = await renderer.call(options.runtime || event?.runtime || event?.raw?.runtime, options.plugin || null, options.path || 'yunjin-card', { ...viewModel, html }, options.config || {});
    return validRenderResult(result) ? result : fallbackText;
  } catch (error) {
    if (options.onError) {
      try {
        await options.onError(normalizeError(error));
      } catch {}
    }
    if (options.throwOnError) throw renderFailed(error, { feature: viewModel.feature });
    return fallbackText;
  }
}

export function cardView(feature, title, rows, options = {}) {
  return normalizeViewModel({ feature, title, rows, footer: options.footer, view: options.view || 'card' });
}
