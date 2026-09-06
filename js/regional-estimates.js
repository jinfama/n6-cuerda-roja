// Regional estimates for indicators that exist at country level but are not
// stored directly in the regional aggregate files.

import { DataLoader } from './data-loader.js?v=20260906f';

let _countryData = null;
let _regionByIso = null;
const _estimateCache = new Map();

const WORKER_WEIGHTED_FIELDS = new Set(['monthly_wage', 'va_per_worker']);
const HOURS_WEIGHTED_RATE_FIELDS = new Set([
  'pct_child_labor',
  'pct_forced_labor',
  'pct_extreme_poverty',
  'pct_not_covered',
]);

function estimateFieldFor(metric) {
  if (!metric) return null;
  if (WORKER_WEIGHTED_FIELDS.has(metric.field)) return metric.field;
  if (HOURS_WEIGHTED_RATE_FIELDS.has(metric.field)) return metric.field;
  if (HOURS_WEIGHTED_RATE_FIELDS.has(metric.rateField)) return metric.rateField;
  return null;
}

export async function enrichRegionalData(data, metric) {
  const field = estimateFieldFor(metric);
  if (!field || !data) return data;
  const entries = await Promise.all(Object.entries(data).map(async ([region, series]) => {
    const enrichedYears = await Promise.all(Object.entries(series || {}).map(async ([year, row]) => {
      const enriched = await enrichRegionalRow(row, metric, +year, region);
      return [year, enriched];
    }));
    return [region, Object.fromEntries(enrichedYears)];
  }));
  return Object.fromEntries(entries);
}

export async function enrichRegionalRow(row, metric, year, region) {
  const field = estimateFieldFor(metric);
  if (!field || !row || row[field] != null) return row;
  const value = await estimateRegionalField(field, year, region);
  return value == null ? row : { ...row, [field]: value };
}

async function estimateRegionalField(field, year, region) {
  const key = `${field}:${year}:${region}`;
  if (_estimateCache.has(key)) return _estimateCache.get(key);

  if (!_countryData) _countryData = await DataLoader.loadCountryYearIndicators();
  if (!_regionByIso) {
    const fp = await DataLoader.loadTradeFootprintFlows();
    _regionByIso = fp.region_by_iso || {};
  }

  const weightField = WORKER_WEIGHTED_FIELDS.has(field) ? 'workers' : 'hours_total';
  let weighted = 0;
  let weight = 0;
  for (const [iso, series] of Object.entries(_countryData.data || {})) {
    if (region !== 'World' && _regionByIso[iso] !== region) continue;
    const row = series?.[year];
    const value = row?.[field];
    const w = row?.[weightField];
    if (value == null || !isFinite(value) || w == null || !isFinite(w) || w <= 0) continue;
    weighted += value * w;
    weight += w;
  }
  const result = weight > 0 ? weighted / weight : null;
  _estimateCache.set(key, result);
  return result;
}

