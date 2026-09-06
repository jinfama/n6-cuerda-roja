// Data loader with in-memory cache + indexed views.
// Loads manifest first, then datasets on demand.
//
// Two on-disk formats are supported and both produce exactly the same shapes
// for the views, so no view has to know which release it is talking to:
//
//   legacy    the full-precision tree built by build/csv_to_json.py
//   columnar  the trimmed web tree built by build/csv_to_json.py --web
//             ({years[], fields[], keys[], data[key][field][year]}), expanded
//             here by expandColumnar*() before anything else sees it.
//
// The cache stores the PROMISE, not the resolved value: two views asking for
// the same file in the same tick share one request instead of firing two.

const CACHE = {};
let _manifest = null;
let _categorySeriesIndex = null;
let _bilateralIndex = null;

function _fetchJson(url) {
  if (CACHE[url]) return CACHE[url];
  const pending = fetch(url).then(res => {
    if (!res.ok) throw new Error(`[DataLoader] ${url} → ${res.status}`);
    return res.json();
  }).catch(err => {
    delete CACHE[url];          // a failed fetch must not poison the cache
    throw err;
  });
  CACHE[url] = pending;
  return pending;
}

// ---------------------------------------------------------------------------
// Columnar adapters
// ---------------------------------------------------------------------------

function isColumnar(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (typeof doc.format === 'string' && doc.format.startsWith('columnar')) return true;
  return Array.isArray(doc.years) && Array.isArray(doc.fields) && Array.isArray(doc.data);
}

// {years, fields, countries, data[country][field][year]} → {iso: {year: {field: v}}}
function expandNested(years, fields, keys, matrix) {
  const out = {};
  for (let k = 0; k < keys.length; k += 1) {
    const cols = matrix[k] || [];
    const series = {};
    for (let y = 0; y < years.length; y += 1) {
      let row = null;
      for (let f = 0; f < fields.length; f += 1) {
        const value = cols[f] ? cols[f][y] : null;
        if (value == null) continue;
        if (!row) row = {};
        row[fields[f]] = value;
      }
      if (row) series[years[y]] = row;
    }
    out[keys[k]] = series;
  }
  return out;
}

// Same, for one series only (regions/world blocks of trade_footprint_flows).
function expandOneSeries(years, fields, cols) {
  const series = {};
  for (let y = 0; y < years.length; y += 1) {
    let row = null;
    for (let f = 0; f < fields.length; f += 1) {
      const value = cols?.[f] ? cols[f][y] : null;
      if (value == null) continue;
      if (!row) row = {};
      row[fields[f]] = value;
    }
    if (row) series[years[y]] = row;
  }
  return series;
}

function expandColumnarCountryYear(doc) {
  if (!isColumnar(doc)) return doc;
  return {
    schema_id: doc.schema_id,
    fields_sum: doc.fields_sum || doc.fields,
    fields_mean: doc.fields_mean || [],
    year_range: doc.year_range || [doc.years[0], doc.years[doc.years.length - 1]],
    country_names: doc.country_names || {},
    data: expandNested(doc.years, doc.fields, doc.countries || doc.keys || [], doc.data),
  };
}

function expandColumnarCategorySeries(doc) {
  if (!isColumnar(doc)) return doc;
  return {
    schema_id: doc.schema_id,
    category_labor: doc.category_labor,
    fields_sum: doc.fields,
    fields_mean: [],
    year_range: doc.year_range || [doc.years[0], doc.years[doc.years.length - 1]],
    country_names: doc.country_names || {},
    data: expandNested(doc.years, doc.fields, doc.countries || [], doc.data),
  };
}

function expandColumnarTradeFootprint(doc) {
  if (!isColumnar(doc)) return doc;
  const regions = {};
  for (const [region, cols] of Object.entries(doc.regions || {})) {
    regions[region] = expandOneSeries(doc.years, doc.fields, cols);
  }
  return {
    schema_id: doc.schema_id,
    year_range: doc.year_range,
    fields: doc.field_notes || doc.fields,
    country_names: doc.country_names || {},
    region_by_iso: doc.region_by_iso || {},
    data: expandNested(doc.years, doc.fields, doc.countries || [], doc.data),
    regions,
    world: expandOneSeries(doc.years, doc.fields, doc.world),
  };
}

// {keys, fields, country_year, data[key][field][year]} → flat rows, one per
// key × year, exactly the shape the legacy `rows` array had.
function expandColumnarRows(doc, keyField, identity = {}) {
  if (!isColumnar(doc)) return doc;
  // The columnar files do not all name their key list the same way: categories/<ISO>.json
  // and regions_categories.json use `keys`, while items/<ISO>.json uses `items`. Reading
  // only `keys` threw a TypeError on the item files of the trimmed release.
  const { years, fields, data } = doc;
  const keys = doc.keys || doc.items || [];
  const countryYear = doc.country_year || {};
  const countryYearFields = Object.keys(countryYear);
  const rows = [];
  for (let k = 0; k < keys.length; k += 1) {
    const cols = data[k] || [];
    for (let y = 0; y < years.length; y += 1) {
      let row = null;
      for (let f = 0; f < fields.length; f += 1) {
        const value = cols[f] ? cols[f][y] : null;
        if (value == null) continue;
        if (!row) row = {};
        row[fields[f]] = value;
      }
      if (!row) continue;
      row[keyField] = keys[k];
      row.year = years[y];
      for (const field of countryYearFields) {
        const value = countryYear[field][y];
        if (value != null) row[field] = value;
      }
      Object.assign(row, identity);
      rows.push(row);
    }
  }
  return rows;
}

function expandColumnarCategories(doc) {
  if (!isColumnar(doc)) return doc;
  return {
    schema_id: doc.schema_id,
    iso3: doc.iso3,
    country: doc.country,
    year_range: doc.year_range,
    categories: doc.keys,
    rows: expandColumnarRows(doc, 'category_labor', { iso3: doc.iso3, country: doc.country }),
  };
}

function expandColumnarItems(doc) {
  if (!isColumnar(doc)) return doc;
  const rows = expandColumnarRows(doc, 'item_primary', {
    iso3: doc.iso3, country: doc.country, area_code: doc.area_code,
  });
  const categoryOf = {};
  (doc.items || []).forEach((item, i) => { categoryOf[item] = (doc.item_category || [])[i]; });
  for (const row of rows) row.category_labor = categoryOf[row.item_primary] ?? null;
  return {
    schema_id: doc.schema_id,
    iso3: doc.iso3,
    country: doc.country,
    year_range: doc.year_range,
    items: doc.items,
    items_all: doc.items_all || doc.items,
    n_items_source: doc.n_items_source,
    n_items_other: doc.n_items_other,
    hours_share_kept: doc.hours_share_kept,
    note: doc.note,
    rows,
  };
}

function expandColumnarRegionsCategories(doc) {
  if (!isColumnar(doc)) return doc;
  // The columnar files do not all name their key list the same way: categories/<ISO>.json
  // and regions_categories.json use `keys`, while items/<ISO>.json uses `items`. Reading
  // only `keys` threw a TypeError on the item files of the trimmed release.
  const { years, fields, data } = doc;
  const keys = doc.keys || doc.items || [];
  const rows = [];
  for (let k = 0; k < keys.length; k += 1) {
    const [region, category] = keys[k];
    const cols = data[k] || [];
    for (let y = 0; y < years.length; y += 1) {
      let row = null;
      for (let f = 0; f < fields.length; f += 1) {
        const value = cols[f] ? cols[f][y] : null;
        if (value == null) continue;
        if (!row) row = {};
        row[fields[f]] = value;
      }
      if (!row) continue;
      row.region_un = region;
      row.category_labor = category;
      row.year = years[y];
      row.is_livestock = (doc.is_livestock || [])[k];
      rows.push(row);
    }
  }
  return {
    schema_id: doc.schema_id,
    year_range: doc.year_range,
    categories: doc.categories || [],
    rows,
  };
}

// GSI base + exceptions → the flat rows the legacy file had.
function expandForcedLaborRisk(doc) {
  if (!doc || doc.format !== 'base-plus-exceptions') return doc;
  const byPair = new Map();
  for (const ex of doc.exceptions || []) {
    const [iso3, itemCode, riskLevel, riskWeight, pct, evidenceStep, manual] = ex;
    byPair.set(`${iso3}|${itemCode}`, {
      iso3, item_code: itemCode, product: doc.products?.[String(itemCode)] ?? null,
      risk_level: riskLevel, risk_weight: riskWeight, forced_labor_pct: pct,
      evidence_step: evidenceStep, manual_harvest: !!manual,
      gsi_base_rate: doc.countries?.[iso3]?.[0] ?? null,
      gsi_method: doc.countries?.[iso3]?.[2] ?? null,
    });
  }
  const rows = [];
  for (const [iso3, base] of Object.entries(doc.countries || {})) {
    for (const [code, product] of Object.entries(doc.products || {})) {
      const hit = byPair.get(`${iso3}|${code}`);
      rows.push(hit || {
        iso3, item_code: +code, product,
        risk_level: 'Low', risk_weight: null, forced_labor_pct: base[1],
        evidence_step: null, manual_harvest: false,
        gsi_base_rate: base[0], gsi_method: base[2],
      });
    }
  }
  return { schema_id: doc.schema_id, has_year: false, rows };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const DataLoader = {
  async loadManifest() {
    if (_manifest) return _manifest;
    try {
      _manifest = await _fetchJson('data/manifest.json');
    } catch (_) {
      _manifest = await _fetchJson('data/manifest_provisional.json');
    }
    return _manifest;
  },
  getManifest() { return _manifest; },

  async loadWorldTopo()         { return _fetchJson('data/world-110m.json'); },
  async loadRegions()           { return _fetchJson('data/regions.json'); },
  async loadRegionsLabor()      { return _fetchJson('data/regions_labor.json'); },
  async loadRegionsCategories() {
    return expandColumnarRegionsCategories(await _fetchJson('data/regions_categories.json'));
  },
  async loadCategoriesIndex()   { return _fetchJson('data/categories_index.json'); },
  async loadCountryCategories(iso3) {
    return expandColumnarCategories(await _fetchJson(`data/categories/${iso3}.json`));
  },
  async loadCountryItems(iso3) {
    return expandColumnarItems(await _fetchJson(`data/items/${iso3}.json`));
  },
  async loadCountryFootprints(iso3) { return _fetchJson(`data/footprints/${iso3}.json`); },
  async loadConditions()        { return _fetchJson('data/conditions.json'); },
  async loadForcedLaborRisk()   {
    return expandForcedLaborRisk(await _fetchJson('data/forced_labor_risk.json'));
  },
  async loadTradeFootprintFlows() {
    return expandColumnarTradeFootprint(await _fetchJson('data/trade_footprint_flows.json'));
  },
  async loadBilateralIndex() {
    if (_bilateralIndex) return _bilateralIndex;
    _bilateralIndex = await _fetchJson('data/bilateral/index.json');
    return _bilateralIndex;
  },
  async resolveBilateralYear(year) {
    const index = await this.loadBilateralIndex();
    const years = index.years || [];
    const numericYear = +year;
    if (!years.length) return numericYear;
    if (years.includes(numericYear)) return numericYear;
    return years.reduce((best, y) =>
      Math.abs(y - numericYear) < Math.abs(best - numericYear) ? y : best, years[years.length - 1]);
  },
  async loadBilateralYear(year) {
    const index = await this.loadBilateralIndex();
    const target = await this.resolveBilateralYear(year);
    const file = index.files?.[String(target)] || `years/${target}.json`;
    return _fetchJson(`data/bilateral/${file}`);
  },
  // Web release only: product × partner detail for one country, all years.
  // Returns null on the legacy tree, where the year file already carries it.
  async loadBilateralCountry(iso3) {
    const index = await this.loadBilateralIndex();
    const file = index.countries_files?.[iso3];
    if (!file) return null;
    try {
      return await _fetchJson(`data/bilateral/${file}`);
    } catch (_) {
      return null;
    }
  },
  // Web release only: directed arcs for the global top products of one year.
  async loadBilateralProducts(year) {
    const index = await this.loadBilateralIndex();
    const target = await this.resolveBilateralYear(year);
    const file = index.product_files?.[String(target)];
    if (!file) return null;
    try {
      return await _fetchJson(`data/bilateral/${file}`);
    } catch (_) {
      return null;
    }
  },
  async loadCountryYearIndicators() {
    return expandColumnarCountryYear(await _fetchJson('data/country_year_indicators.json'));
  },
  async loadCategorySeriesIndex() {
    if (_categorySeriesIndex) return _categorySeriesIndex;
    _categorySeriesIndex = await _fetchJson('data/category_series_index.json');
    return _categorySeriesIndex;
  },
  async loadCategorySeries(category) {
    const index = await this.loadCategorySeriesIndex();
    const entry = (index.categories || []).find(d => d.category_labor === category);
    if (!entry) throw new Error(`[DataLoader] category series not found: ${category}`);
    return expandColumnarCategorySeries(await _fetchJson(`data/category_series/${entry.file}`));
  },
  async loadIsoMapping()        { return _fetchJson('data/iso_m49.json'); },
};
