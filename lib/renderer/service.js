import { renderFailed, normalizeError } from '../core/errors.js';
import { cleanRenderText, normalizeViewModel, textFromViewModel } from './sanitizer.js';
import { renderCardHtml, renderDashboardHtml, renderListHtml, renderTableHtml } from './templates.js';

export function renderText(value) {
  if (Array.isArray(value)) return value.map((item) => cleanRenderText(item)).join('\n');
  return cleanRenderText(value);
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

export async function renderCard(event, options = {}) {
  const viewModel = normalizeViewModel(options.data || options.viewModel || {});
  const fallbackText = renderText(options.fallbackText || textFromViewModel(viewModel));
  const renderer = rendererOf(event, options.runtime);
  if (typeof renderer !== 'function' || options.disable === true) return fallbackText;
  const html = templateFor(viewModel.view)(viewModel);
  try {
    const result = await renderer.call(options.runtime || event?.runtime || event?.raw?.runtime, options.plugin || null, options.path || 'yunjin-card', { ...viewModel, html }, options.config || {});
    if (typeof result === 'string') return result.trim() ? result : fallbackText;
    if (Array.isArray(result)) return result.length ? result : fallbackText;
    return result && typeof result === 'object' ? result : fallbackText;
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
