// Ranking view — horizontal bars top-N for the active metric at currentYear.

import { State } from '../state.js';
import { DataLoader } from '../data-loader.js?v=20260522-tildes1';
import { getIndicator } from '../indicators.js?v=20260522-tildes1';
import { metricValue, resolveMetric, supportsCropCategory } from '../metric.js?v=20260522-tildes1';
import { hideChartTooltip, showChartTooltip } from '../chart-tooltip.js?v=20260522-hover1';

let _aggregates = null;
let _countryNames = null;
let _refreshToken = 0;

export async function initRankingView() {
  try {
    const agg = await DataLoader.loadCountryYearIndicators();
    _aggregates = agg.data;
    _countryNames = agg.country_names || {};
  } catch (e) {
    console.warn('[ranking] failed to load aggregates', e);
  }
  refresh();
  State.subscribe('activeCategory', refresh);
  State.subscribe('activeIndicator', refresh);
  State.subscribe('functionalUnit', refresh);
  State.subscribe('productivityLaborInput', refresh);
  State.subscribe('productivityDirection', refresh);
  State.subscribe('currentYear', refresh);
  State.subscribe('cropCategoryFilter', refresh);
  State.subscribe('selectedCountries', highlight);
  State.subscribe('language', refresh);
}

async function activeDataset(ind) {
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  if (!category) {
    return { data: _aggregates, countryNames: _countryNames || {}, category: null };
  }
  const ds = await DataLoader.loadCategorySeries(category);
  return { data: ds.data || {}, countryNames: ds.country_names || _countryNames || {}, category };
}

async function refresh() {
  const token = ++_refreshToken;
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  const container = document.getElementById('ranking-container');
  if (!container || !metric) return;

  if (metric.source && metric.source !== 'regions') {
    container.innerHTML = `<div style="color:var(--c-text-3); padding:24px;">
      Ranking de <em>${metric.labelText}</em> próximamente.
    </div>`;
    return;
  }

  const year = State.get('currentYear');
  const { data, countryNames } = await activeDataset(ind);
  if (token !== _refreshToken) return;
  const rows = [];
  for (const iso in (data || {})) {
    const yr = data[iso][year];
    if (!yr) continue;
    const v = metricValue(yr, metric);
    if (v == null || !isFinite(v)) continue;
    rows.push({ iso, country: countryNames[iso] || iso, value: v });
  }
  rows.sort((a, b) => b.value - a.value);

  const top = rows.slice(0, 40);
  const max = top[0] && top[0].value;
  if (!max) {
    container.innerHTML = `<div style="color:var(--c-text-3); padding:24px;">Sin datos para ${year}.</div>`;
    return;
  }

  const sel = State.get('selectedCountries');
  container.innerHTML = `
    <div style="margin-bottom:14px; color:var(--c-text-2); font-size:12px;">
      Ranking de países por <strong>${metric.labelText}</strong> en ${year} · top 40
    </div>
    ${top.map((r, i) => `
      <div class="rk-row" data-iso="${r.iso}" data-rank="${i + 1}" data-country="${r.country}" data-value="${r.value}">
        <div class="rk-rank">${i + 1}</div>
        <div class="rk-name">${r.country} <span style="color:var(--c-text-3); font-size:10px;">${r.iso}</span></div>
        <div class="rk-bar-wrap"><div class="rk-bar" style="width:${(r.value / max) * 100}%; background:${sel.includes(r.iso) ? '#A5534E' : '#214B52'};"></div></div>
        <div class="rk-val">${formatVal(r.value)} ${metric.unit}</div>
      </div>
    `).join('')}
  `;

  container.querySelectorAll('.rk-row').forEach(el => {
    el.addEventListener('click', () => State.toggleCountry(el.dataset.iso));
    el.addEventListener('mousemove', event => {
      showChartTooltip(event, {
        title: el.dataset.country || el.dataset.iso,
        subtitle: `${year} - #${el.dataset.rank}`,
        rows: [{
          label: metric.labelText,
          value: formatVal(+el.dataset.value),
          unit: metric.unit,
        }],
      });
    });
    el.addEventListener('mouseleave', hideChartTooltip);
  });
}

function highlight() {
  refresh();
}

function formatVal(v) {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

