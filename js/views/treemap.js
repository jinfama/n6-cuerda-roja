// Treemap view: composition by product category or by countries.

import { State } from '../state.js';
import { DataLoader } from '../data-loader.js?v=20260522-tildes1';
import { getIndicator } from '../indicators.js?v=20260522-tildes1';
import { formatCategoryLabel } from '../labels.js';
import { metricValue, resolveMetric, supportsCropCategory } from '../metric.js?v=20260522-tildes1';
import { bindSvgTooltip } from '../chart-tooltip.js?v=20260522-hover1';

const PALETTE = ['#214B52', '#8DBBC8', '#2F4D63', '#A5534E', '#62735A', '#B78B55', '#6F4B8B', '#2D7B7C', '#7D8B72', '#263F46'];
let _countryData = null;

export function initTreemapView() {
  refresh();
  State.subscribe('activeCategory', refresh);
  State.subscribe('activeIndicator', refresh);
  State.subscribe('functionalUnit', refresh);
  State.subscribe('productivityLaborInput', refresh);
  State.subscribe('productivityDirection', refresh);
  State.subscribe('currentYear', refresh);
  State.subscribe('selectedCountries', refresh);
  State.subscribe('cropCategoryFilter', refresh);
  State.subscribe('treemapMode', refresh);
  State.subscribe('language', refresh);
  window.addEventListener('resize', refresh);
}

async function refresh() {
  const header = document.getElementById('treemap-header');
  const chart  = document.getElementById('treemap-chart');
  if (!chart) return;
  const sel = State.get('selectedCountries');
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  const year = State.get('currentYear');
  const mode = supportsCropCategory(ind) ? State.get('treemapMode') : 'countries';
  if (!metric) return;

  if (mode === 'countries') {
    if (header) header.textContent = `Composición por países - ${metric.labelText} (${year})`;
    await renderCountryTreemap(chart, metric, year);
    return;
  }

  if (mode === 'products_by_country') {
    if (!sel.length) {
      chart.innerHTML = '<div style="padding:24px;color:var(--c-text-3)">Selecciona países para comparar productos por país.</div>';
      if (header) header.textContent = 'Productos por país';
      return;
    }
    if (!supportsCropCategory(ind)) {
      chart.innerHTML = '<div style="padding:24px;color:var(--c-text-3)">Este indicador no tiene composición por productos.</div>';
      if (header) header.textContent = 'Composición no disponible por productos';
      return;
    }
    if (header) header.textContent = `Productos por país - ${metric.labelText} (${year})`;
    await renderProductFacets(chart, sel.slice(0, 12), metric, year, ind);
    return;
  }

  if (!sel.length) {
    chart.innerHTML = '';
    if (header) header.textContent = 'Selecciona un país para ver la composición por productos';
    return;
  }
  if (!supportsCropCategory(ind)) {
    chart.innerHTML = '<div style="padding:24px;color:var(--c-text-3)">Este indicador no tiene composición por productos. Cambia a composición por países.</div>';
    if (header) header.textContent = 'Composición no disponible por productos';
    return;
  }

  const iso = sel[0];
  if (header) header.textContent = `Composición por productos - ${metric.labelText} en ${iso} (${year})`;
  let data;
  try {
    data = await DataLoader.loadCountryCategories(iso);
  } catch (_) {
    chart.innerHTML = '<div style="padding:24px;color:var(--c-text-3)">Sin datos para este país.</div>';
    return;
  }
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  const rows = (data.rows || [])
    .filter(r => r.year === year && (!category || r.category_labor === category))
    .map(r => ({ name: formatCategoryLabel(r.category_labor, State.get('language')), value: metricValue(r, metric) }))
    .filter(r => r.value != null && isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value);
  renderTreemap(chart, rows, metric);
}

async function renderCountryTreemap(chart, metric, year) {
  if (!_countryData) _countryData = await DataLoader.loadCountryYearIndicators();
  const rows = Object.entries(_countryData.data || {})
    .map(([iso, series]) => ({ name: _countryData.country_names?.[iso] || iso, value: metricValue(series?.[year], metric) }))
    .filter(r => r.value != null && isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 80);
  renderTreemap(chart, rows, metric);
}

function renderTreemap(chart, rows, metric) {
  if (!rows.length) {
    chart.innerHTML = '<div style="padding:24px;color:var(--c-text-3)">Sin datos en este año.</div>';
    return;
  }
  const W = chart.clientWidth;
  const H = chart.clientHeight || 400;
  chart.innerHTML = '';
  const svg = d3.select(chart).append('svg').attr('width', W).attr('height', H);
  const root = d3.hierarchy({ children: rows }).sum(d => d.value || 0);
  d3.treemap().size([W, H]).paddingInner(2)(root);
  svg.selectAll('g').data(root.leaves()).enter().append('g')
    .attr('transform', d => `translate(${d.x0},${d.y0})`)
    .each(function (d, i) {
      const g = d3.select(this);
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      const rect = g.append('rect').attr('width', w).attr('height', h)
        .attr('fill', PALETTE[i % PALETTE.length]).attr('opacity', 0.92);
      bindSvgTooltip(rect, () => ({
        title: d.data.name,
        rows: [{
          label: metric.labelText,
          value: d3.format(',.3~s')(d.data.value),
          unit: metric.unit,
        }],
      }));
      rect
        .append('title')
        .text(`${d.data.name}: ${d3.format(',.3~s')(d.data.value)} ${metric.unit}`);
      if (w > 60 && h > 28) {
        g.append('text').attr('x', 6).attr('y', 16)
          .attr('fill', '#fff').style('font-size', '11px').style('font-weight', 600)
          .text(d.data.name);
        g.append('text').attr('x', 6).attr('y', 30)
          .attr('fill', 'rgba(255,255,255,0.78)').style('font-size', '10px')
          .text(d3.format(',.2~s')(d.data.value));
      }
    });
}

async function renderProductFacets(chart, countries, metric, year, ind) {
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  const facets = await Promise.all(countries.map(async iso => {
    try {
      const data = await DataLoader.loadCountryCategories(iso);
      const rows = (data.rows || [])
        .filter(r => r.year === year && (!category || r.category_labor === category))
        .map(r => ({ name: formatCategoryLabel(r.category_labor, State.get('language')), value: metricValue(r, metric) }))
        .filter(r => r.value != null && isFinite(r.value) && r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 24);
      return { iso, rows };
    } catch (_) {
      return { iso, rows: [] };
    }
  }));
  const W = chart.clientWidth;
  const H = chart.clientHeight || 400;
  chart.innerHTML = '';
  const svg = d3.select(chart).append('svg').attr('width', W).attr('height', H);
  const n = facets.length;
  const cols = Math.min(n, W < 720 ? 2 : W < 1100 ? 3 : 4);
  const rowsN = Math.ceil(n / cols);
  const gap = 14;
  const titleH = 20;
  const cellW = (W - gap * (cols + 1)) / cols;
  const cellH = Math.max(120, (H - gap * (rowsN + 1)) / rowsN);
  facets.forEach((facet, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = gap + col * (cellW + gap);
    const y0 = gap + row * (cellH + gap);
    svg.append('text')
      .attr('x', x0).attr('y', y0 + 12)
      .attr('fill', 'var(--c-text)')
      .style('font-size', '11px').style('font-weight', 700)
      .text(facet.iso);
    const root = d3.hierarchy({ children: facet.rows }).sum(d => d.value || 0);
    d3.treemap().size([cellW, Math.max(80, cellH - titleH)]).paddingInner(1.5)(root);
    const g0 = svg.append('g').attr('transform', `translate(${x0},${y0 + titleH})`);
    g0.selectAll('g').data(root.leaves()).enter().append('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)
      .each(function (d, j) {
        const g = d3.select(this);
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        const rect = g.append('rect').attr('width', w).attr('height', h)
          .attr('fill', PALETTE[j % PALETTE.length]).attr('opacity', 0.92);
        bindSvgTooltip(rect, () => ({
          title: d.data.name,
          subtitle: facet.iso,
          rows: [{
            label: metric.labelText,
            value: d3.format(',.3~s')(d.data.value),
            unit: metric.unit,
          }],
        }));
        rect
          .append('title')
          .text(`${facet.iso} - ${d.data.name}: ${d3.format(',.3~s')(d.data.value)} ${metric.unit}`);
        if (w > 56 && h > 26) {
          g.append('text').attr('x', 5).attr('y', 14)
            .attr('fill', '#fff').style('font-size', '10px').style('font-weight', 650)
            .text(d.data.name);
        }
      });
  });
}

