// Shared chart tooltip used by SVG charts and dense HTML mini-panels.

let _tooltipEl = null;

function ensureTooltip() {
  if (_tooltipEl && document.body.contains(_tooltipEl)) return _tooltipEl;
  _tooltipEl = document.getElementById('chart-tooltip');
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.id = 'chart-tooltip';
    _tooltipEl.className = 'chart-tooltip';
    _tooltipEl.setAttribute('role', 'status');
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function tooltipHtml(payload = {}) {
  const title = payload.title ? `<div class="chart-tooltip-title">${escapeHtml(payload.title)}</div>` : '';
  const subtitle = payload.subtitle ? `<div class="chart-tooltip-subtitle">${escapeHtml(payload.subtitle)}</div>` : '';
  const rows = (payload.rows || [])
    .filter(row => row && (row.label || row.value || row.unit))
    .map(row => {
      const color = row.color ? `<i style="background:${escapeHtml(row.color)}"></i>` : '';
      const value = row.unit ? `${row.value} ${row.unit}` : row.value;
      return `
        <div class="chart-tooltip-row">
          <span>${color}${escapeHtml(row.label || '')}</span>
          <strong>${escapeHtml(value || '')}</strong>
        </div>
      `;
    }).join('');
  const footer = payload.footer ? `<div class="chart-tooltip-footer">${escapeHtml(payload.footer)}</div>` : '';
  return `${title}${subtitle}${rows}${footer}`;
}

function positionTooltip(event, el) {
  const pointerX = event?.clientX ?? 0;
  const pointerY = event?.clientY ?? 0;
  const offset = 14;
  const pad = 8;
  const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
  const vh = window.innerHeight || document.documentElement.clientHeight || 768;
  const rect = el.getBoundingClientRect();
  let x = pointerX + offset;
  let y = pointerY + offset;
  if (x + rect.width + pad > vw) x = pointerX - rect.width - offset;
  if (y + rect.height + pad > vh) y = pointerY - rect.height - offset;
  el.style.left = `${Math.max(pad, Math.min(x, vw - rect.width - pad))}px`;
  el.style.top = `${Math.max(pad, Math.min(y, vh - rect.height - pad))}px`;
}

export function showChartTooltip(event, payload) {
  const el = ensureTooltip();
  el.innerHTML = tooltipHtml(payload);
  el.classList.add('visible');
  positionTooltip(event, el);
}

export function hideChartTooltip() {
  const el = ensureTooltip();
  el.classList.remove('visible');
}

export function bindSvgTooltip(selection, payloadFactory) {
  selection
    .on('mousemove', function (event, datum) {
      d3.select(this).classed('is-hovered', true);
      showChartTooltip(event, payloadFactory(datum, this));
    })
    .on('mouseenter', function (event, datum) {
      d3.select(this).classed('is-hovered', true);
      showChartTooltip(event, payloadFactory(datum, this));
    })
    .on('mouseleave', function () {
      d3.select(this).classed('is-hovered', false);
      hideChartTooltip();
    });
}

export function wireTextTooltips(root = document) {
  root.querySelectorAll('[data-chart-tooltip]').forEach(el => {
    if (el.dataset.chartTooltipWired === '1') return;
    el.dataset.chartTooltipWired = '1';
    const build = () => ({
      title: el.dataset.tooltipTitle || '',
      subtitle: el.dataset.tooltipSubtitle || '',
      rows: [{
        label: el.dataset.tooltipLabel || '',
        value: el.dataset.tooltipValue || el.dataset.chartTooltip || '',
        unit: el.dataset.tooltipUnit || '',
      }],
      footer: el.dataset.tooltipFooter || '',
    });
    el.addEventListener('mousemove', event => showChartTooltip(event, build()));
    el.addEventListener('mouseenter', event => showChartTooltip(event, build()));
    el.addEventListener('mouseleave', hideChartTooltip);
  });
}
