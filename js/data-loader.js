// Data loader with in-memory cache + indexed views.
// Loads manifest first, then datasets on demand.

const CACHE = {};
let _manifest = null;
let _categorySeriesIndex = null;
let _bilateralIndex = null;

async function _fetchJson(url) {
  if (CACHE[url]) return CACHE[url];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[DataLoader] ${url} → ${res.status}`);
  const data = await res.json();
  CACHE[url] = data;
  return data;
}

// Built lazily from regions_categories: { iso3 → { year → { categoryLabor → row } } }
let _countryCategoryIdx = null;

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
  async loadRegionsCategories() { return _fetchJson('data/regions_categories.json'); },
  async loadCategoriesIndex()   { return _fetchJson('data/categories_index.json'); },
  async loadCountryCategories(iso3) { return _fetchJson(`data/categories/${iso3}.json`); },
  async loadCountryItems(iso3)      { return _fetchJson(`data/items/${iso3}.json`); },
  async loadCountryFootprints(iso3) { return _fetchJson(`data/footprints/${iso3}.json`); },
  async loadConditions()        { return _fetchJson('data/conditions.json'); },
  async loadForcedLaborRisk()   { return _fetchJson('data/forced_labor_risk.json'); },
  async loadTradeFootprintFlows() { return _fetchJson('data/trade_footprint_flows.json'); },
  async loadBilateralIndex() {
    if (_bilateralIndex) return _bilateralIndex;
    _bilateralIndex = await _fetchJson('data/bilateral/index.json');
    return _bilateralIndex;
  },
  async loadBilateralYear(year) {
    const index = await this.loadBilateralIndex();
    const years = index.years || [];
    const numericYear = +year;
    let target = years.includes(numericYear) ? numericYear : years[years.length - 1];
    if (!years.includes(numericYear)) {
      target = years.reduce((best, y) => Math.abs(y - numericYear) < Math.abs(best - numericYear) ? y : best, target);
    }
    const file = index.files?.[String(target)] || `years/${target}.json`;
    return _fetchJson(`data/bilateral/${file}`);
  },
  async loadCountryYearIndicators() { return _fetchJson('data/country_year_indicators.json'); },
  async loadCategorySeriesIndex() {
    if (_categorySeriesIndex) return _categorySeriesIndex;
    _categorySeriesIndex = await _fetchJson('data/category_series_index.json');
    return _categorySeriesIndex;
  },
  async loadCategorySeries(category) {
    const index = await this.loadCategorySeriesIndex();
    const entry = (index.categories || []).find(d => d.category_labor === category);
    if (!entry) throw new Error(`[DataLoader] category series not found: ${category}`);
    return _fetchJson(`data/category_series/${entry.file}`);
  },
  async loadIsoMapping()        { return _fetchJson('data/iso_m49.json'); },
};

