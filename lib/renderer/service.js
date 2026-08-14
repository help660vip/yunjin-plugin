export function renderText(value) { return String(value ?? ''); }
export async function renderCard(runtime, card, fallback = '') { const renderer = runtime?.renderer ?? runtime?.render; if (typeof renderer === 'function') { try { return await renderer(card); } catch {} } return renderText(fallback || card?.text || card?.title || ''); }
