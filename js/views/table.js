// Table view — minimal table of selected countries' rows at currentYear.

import { State } from '../state.js';
import { DataLoader } from '../data-loader.js?v=20260522-tildes1';
import { getIndicator } from '../indicators.js?v=20260522-tildes1';
import { escapeHtml, formatCategoryLabel } from '../labels.js';
import { metricValue, resolveMetric, supportsCropCategory } from '../metric.js?v=20260522-tildes1';
import { enrichRegionalRow } from '../regional-estimates.js?v=20260522-tildes1';

let _countryData = null;
let _regionRows = null;
let _regionCategoryRows = null;

export function initTableView() {
  refresh();
  State.subscribe('activeCategory', refresh);
  State.subscribe('activeIndicator', refresh);
  State.subscribe('functionalUnit', refresh);
  State.subscribe('productivityLaborInput', refresh);
  State.subscribe('productivityDirection', refresh);
  State.subscribe('currentYear', refresh);
  State.subscribe('selectedCountries', refresh);
  State.subscribe('selectedRegions', refresh);
  State.subscribe('trendGeoScope', refresh);
  State.subscribe('cropCategoryFilter', refresh);
  State.subscribe('activeView', refresh);
  State.subscribe('language', refresh);
}

async function refresh() {
  const container = document.getElementById('table-container');
  if (!container) return;
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  const year = State.get('currentYear');
  const scope = State.get('trendGeoScope');

  if (!metric) return;
  if (metric.source && metric.source !== 'regions') {
    container.innerHTML = `<div style="color:var(--c-text-3); padding: 32px 0;">
      Tabla de ${escapeHtml(metric.labelText)} próximamente.</div>`;
    return;
  }

  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  const sourceRows = await tableRows(scope, category, metric, year);
  if (!sourceRows.selectionOk) {
    container.innerHTML = `<div style="color:var(--c-text-3); padding: 32px 0;">${sourceRows.message}</div>`;
    return;
  }
  const rows = sourceRows.rows.map(r => ({ ...r, __metric: metricValue(r, metric) }))
    .filter(r => r.__metric != null && isFinite(r.__metric));

  if (!rows.length) {
    container.innerHTML = `<div style="color:var(--c-text-3); padding: 32px 0;">Sin datos para ${year}.</div>`;
    return;
  }
  rows.sort((a, b) => (b.__metric || 0) - (a.__metric || 0));

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>Territorio</th><th>Ámbito</th><th>Categoría</th>
        <th style="text-align:right;">${metric.labelText} (${metric.unit})</th>
        <th style="text-align:right;">Trabajadores</th>
        <th style="text-align:right;">Horas totales</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${escapeHtml(r.__territory || '')}</td>
          <td>${escapeHtml(r.__scope || '')}</td>
          <td>${escapeHtml(r.__category || '')}</td>
          <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmt(r.__metric)}</td>
          <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmt(r.workers)}</td>
          <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmt(r.hours_total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function tableRows(scope, category, metric, year) {
  if (scope === 'region') return regionTableRows(category, metric, year);
  if (scope === 'world') return worldTableRows(category, metric, year);
  return countryTableRows(category, year);
}

async function countryTableRows(category, year) {
  const sel = State.get('selectedCountries') || [];
  if (!sel.length) {
    return {
      selectionOk: false,
      message: 'Selecciona uno o más países en el panel derecho para ver sus datos en tabla.',
      rows: [],
    };
  }
  if (category) {
    const all = await Promise.all(sel.map(async iso => {
      try {
        const data = await DataLoader.loadCountryCategories(iso);
        return (data.rows || [])
          .filter(r => r.year === year && r.category_labor === category)
          .map(r => decorateRow(r, r.country || iso, 'País', formatCategoryLabel(r.category_labor, State.get('language'))));
      } catch (_) {
        return [];
      }
    }));
    return { selectionOk: true, rows: all.flat() };
  }

  if (!_countryData) _countryData = await DataLoader.loadCountryYearIndicators();
  const rows = sel
    .map(iso => {
      const row = _countryData.data?.[iso]?.[year];
      if (!row) return null;
      return decorateRow({ ...row, iso3: iso, country: _countryData.country_names?.[iso] || iso }, _countryData.country_names?.[iso] || iso, 'País', totalProductionLabel());
    })
    .filter(Boolean);
  return { selectionOk: true, rows };
}

async function regionTableRows(category, metric, year) {
  const sel = State.get('selectedRegions') || [];
  if (!sel.length) {
    return {
      selectionOk: false,
      message: 'Selecciona una o más regiones en el panel derecho para ver sus datos en tabla.',
      rows: [],
    };
  }
  if (category) {
    if (!_regionCategoryRows) _regionCategoryRows = (await DataLoader.loadRegionsCategories()).rows || [];
    return {
      selectionOk: true,
      rows: _regionCategoryRows
        .filter(r => r.year === year && r.category_labor === category && sel.includes(r.region_un))
        .map(r => decorateRow(r, r.region_un, 'Región', formatCategoryLabel(r.category_labor, State.get('language')))),
    };
  }
  if (!_regionRows) _regionRows = (await DataLoader.loadRegions()).rows || [];
  const rows = await Promise.all(_regionRows
    .filter(r => r.year === year && sel.includes(r.region_un))
    .map(async r => decorateRow(await enrichRegionalMetric(r, metric, year, r.region_un), r.region_un, 'Región', totalProductionLabel())));
  return {
    selectionOk: true,
    rows,
  };
}

async function worldTableRows(category, metric, year) {
  if (category) {
    if (!_regionCategoryRows) _regionCategoryRows = (await DataLoader.loadRegionsCategories()).rows || [];
    return {
      selectionOk: true,
      rows: _regionCategoryRows
        .filter(r => r.year === year && r.category_labor === category && r.region_un === 'World')
        .map(r => decorateRow(r, 'Mundo', 'Mundo', formatCategoryLabel(r.category_labor, State.get('language')))),
    };
  }
  if (!_regionRows) _regionRows = (await DataLoader.loadRegions()).rows || [];
  const rows = await Promise.all(_regionRows
    .filter(r => r.year === year && r.region_un === 'World')
    .map(async r => decorateRow(await enrichRegionalMetric(r, metric, year, 'World'), 'Mundo', 'Mundo', totalProductionLabel())));
  return {
    selectionOk: true,
    rows,
  };
}

async function enrichRegionalMetric(row, metric, year, region) {
  return enrichRegionalRow(row, metric, year, region);
}

function decorateRow(row, territory, scope, category) {
  return {
    ...row,
    __territory: territory,
    __scope: scope,
    __category: category,
  };
}

function totalProductionLabel() {
  return State.get('language') === 'en' ? 'Total production' : 'Toda la producción';
}

function fmt(v) {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

