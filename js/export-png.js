// PNG export of what the active view is actually showing.
//
// The CSV sibling (export-csv.js) makes the numbers citable; this makes the
// figure citable. The active panel's SVG is cloned, its computed styles are
// inlined (CSS classes do not travel inside a serialised SVG), and the result
// is drawn on the paper ground with a caption strip that repeats indicator,
// year and source — so a screenshot pasted into a slide still reads alone.

import { State } from './state.js?v=20260906f';
import { resolveMetric } from './metric.js?v=20260906f';
import { getIndicator } from './indicators.js?v=20260906f';

const SCALE = 2;               // export at 2x for a crisp figure in a slide
const CAPTION_H = 62;          // caption strip in CSS px, before scaling
// The caption strip has to wear the same chrome as the page the figure came
// from, so its four colours are read off the stylesheet tokens at draw time
// instead of being frozen here (they had already drifted once).
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (_) { return fallback; }
}
const chrome = () => ({
  paper: token('--c-bg', '#EBE2CF'),
  ink: token('--c-text', '#20211E'),
  ink2: token('--c-text-2', '#4C4C44'),
  hot: token('--c-hot', '#BE7A14'),
});
const CAPTION_FF = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Only the properties a serialised SVG actually needs to look like itself.
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin',
  'opacity', 'display', 'visibility',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'text-anchor', 'dominant-baseline', 'text-transform',
  'paint-order', 'mix-blend-mode', 'shape-rendering',
];

function slug(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'figura';
}

function activeSvg() {
  const panel = document.querySelector('.viz-panel.active');
  if (!panel) return null;
  const svgs = [...panel.querySelectorAll('svg')]
    .filter(s => s.getBoundingClientRect().width > 60 && s.getBoundingClientRect().height > 60);
  if (!svgs.length) return null;
  // The biggest one is the figure; the rest are icons.
  return svgs.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return (rb.width * rb.height) - (ra.width * ra.height);
  })[0];
}

function inlineStyles(source, clone) {
  const from = source.querySelectorAll('*');
  const to = clone.querySelectorAll('*');
  const apply = (src, dst) => {
    const cs = window.getComputedStyle(src);
    let text = '';
    for (const prop of STYLE_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (value && value !== 'normal' && value !== 'auto') text += `${prop}:${value};`;
    }
    dst.setAttribute('style', text);
  };
  apply(source, clone);
  for (let i = 0; i < from.length && i < to.length; i++) apply(from[i], to[i]);
}

// Caption text: what the reader needs to understand the figure without the app.
export function captionFor(lang = State.get('language')) {
  const isEn = lang === 'en';
  const view = State.get('activeView');
  let title = '';
  let unit = '';
  try {
    const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
    const metric = ind ? resolveMetric(ind, lang) : null;
    title = metric?.labelText || ind?.label?.[lang] || State.get('activeIndicator') || '';
    unit = metric?.unit || '';
  } catch (_) {
    title = State.get('activeIndicator') || '';
  }
  let when = String(State.get('currentYear'));
  if (view === 'trend') {
    const [from, to] = State.get('yearRange') || [];
    if (from != null && to != null) when = `${from}–${to}`;
  }
  const source = document.getElementById('footer-source')?.textContent
    || (isEn ? 'Source: FAO · ILO · World Bank · GSI' : 'Fuente: FAO · ILO · World Bank · GSI');
  return {
    title: unit ? `${title} (${unit})` : title,
    when,
    source,
    brand: isEn ? 'Agricultural Workers of the World' : 'Agricultores del Mundo',
  };
}

function drawCaption(ctx, W, H, caption) {
  ctx.save();
  ctx.scale(SCALE, SCALE);
  const w = W / SCALE, h = H / SCALE;
  const C = chrome();
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, h - CAPTION_H, w, CAPTION_H);
  ctx.fillStyle = C.hot;
  ctx.fillRect(18, h - CAPTION_H + 8, 44, 3);
  ctx.fillStyle = C.ink;
  ctx.font = `700 16px ${CAPTION_FF}`;
  ctx.textBaseline = 'alphabetic';
  const head = caption.when ? `${caption.title} · ${caption.when}` : caption.title;
  ctx.fillText(head, 18, h - CAPTION_H + 32);
  ctx.fillStyle = C.ink2;
  ctx.font = `400 11px ${CAPTION_FF}`;
  ctx.fillText(caption.source, 18, h - CAPTION_H + 50);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ink2;
  ctx.font = `600 11px ${CAPTION_FF}`;
  ctx.fillText(caption.brand, w - 18, h - CAPTION_H + 50);
  ctx.restore();
}

function notify(message) {
  let box = document.getElementById('export-toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'export-toast';
    box.className = 'export-toast';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add('visible');
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('visible'), 3200);
}

export function hasPng() {
  return !!activeSvg();
}

export async function exportActivePng() {
  const lang = State.get('language');
  const svg = activeSvg();
  if (!svg) {
    notify(lang === 'en'
      ? 'This view is a table, not a figure: use the CSV download.'
      : 'Esta vista es una tabla, no una figura: usa la descarga en CSV.');
    return null;
  }
  const rect = svg.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.max(240, Math.round(rect.height));

  const clone = svg.cloneNode(true);
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  // Interactive-only chrome must not travel into the figure.
  clone.querySelectorAll('.is-hovered').forEach(el => el.classList.remove('is-hovered'));

  const markup = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);

  const caption = captionFor(lang);
  const canvas = document.createElement('canvas');
  canvas.width = w * SCALE;
  canvas.height = (h + CAPTION_H) * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = chrome().paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const image = new Image();
  const drawn = await new Promise(resolve => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  if (!drawn) {
    notify(lang === 'en' ? 'The figure could not be rendered.' : 'No se ha podido componer la figura.');
    return null;
  }
  ctx.drawImage(image, 0, 0, w * SCALE, h * SCALE);
  drawCaption(ctx, canvas.width, canvas.height, caption);

  const name = [
    'agricultores',
    slug(State.get('activeIndicator')),
    slug(caption.when),
    slug(State.get('activeView')),
  ].join('_') + '.png';

  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) {
    notify(lang === 'en' ? 'The figure could not be saved.' : 'No se ha podido guardar la figura.');
    return null;
  }
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  notify(lang === 'en' ? `Downloaded ${name}` : `Descargado ${name}`);
  return name;
}

export function wirePngButtons() {
  document.querySelectorAll('[data-export-png]').forEach(btn => {
    btn.addEventListener('click', () => { exportActivePng(); });
  });
}
