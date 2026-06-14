// Centralized pub/sub state.

const _state = {
  language:           'es',
  activeView:         'map',          // map | trend | ranking | treemap | table | country | about
  activeCategory:     'labour',
  activeIndicator:    'workers',
  selectedCountries: [],              // array of ISO3 codes
  selectedRegions: ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'],
  trendGeoScope: 'country',           // country | region | world
  currentYear:        2020,
  animationYear:      2020,
  yearRange:         [1962, 2021],
  geoLevel:           'country',
  rightPanelVisible:  true,
  playing:            false,
  speed:              2,
  // Subset of crop categories applied as a filter (null = all).
  cropCategoryFilter: null,
  perCapita:          false,
  functionalUnit:     'tonne',        // tonne | ha | LU
  productivityLaborInput: 'hours',    // hours | workers
  productivityDirection: 'unit_per_hour',  // hours_per_unit | unit_per_hour
  footprintFlow:      'footprint',    // footprint | imports | exports | domestic
  footprintFlows:     ['footprint', 'imports', 'exports', 'domestic'], // multi-select flows for footprint trends
  footprintTrendMode: 'all',          // selected | all
  trendLayout:        'facet',        // overlay | facet
  trendFacetBy:       'territory',    // territory | flow
  trendMA:            'none',         // none | 5 | 10 | 20
  trendShowLine:      false,
  trendShowBreaks:    false,
  yAxisZero:          true,
  treemapMode:        'products',     // products | countries | products_by_country
  tradeFlow:          'both',         // both | imports | exports
  tradeProduct:       '__total__',    // __total__ | __other__ | item_cbs
  tradeTopN:          10,             // 5 | 10
  focusedCountry:     null,
};

const _subs = {};

export const State = {
  get(key) { return _state[key]; },
  getAll() { return { ..._state }; },

  set(key, value) {
    _state[key] = value;
    (_subs[key] || []).forEach(fn => fn(value));
    (_subs['*'] || []).forEach(fn => fn(key, value));
  },

  setMany(obj) {
    const keys = Object.keys(obj);
    keys.forEach(k => { _state[k] = obj[k]; });
    keys.forEach(k => (_subs[k] || []).forEach(fn => fn(_state[k])));
    (_subs['*'] || []).forEach(fn => fn(keys, obj));
  },

  subscribe(key, fn) {
    if (!_subs[key]) _subs[key] = [];
    _subs[key].push(fn);
    return () => { _subs[key] = _subs[key].filter(f => f !== fn); };
  },

  toggleCountry(iso3) {
    const cur = _state.selectedCountries;
    const next = cur.includes(iso3) ? cur.filter(c => c !== iso3) : [...cur, iso3];
    this.set('selectedCountries', next);
  },

  clearCountries() { this.set('selectedCountries', []); },
  focusCountry(iso3) {
    this.setMany({
      focusedCountry: iso3 || null,
      selectedCountries: iso3 ? [iso3] : [],
      trendGeoScope: 'country',
    });
  },
  toggleRegion(region) {
    const cur = _state.selectedRegions;
    const next = cur.includes(region) ? cur.filter(r => r !== region) : [...cur, region];
    this.set('selectedRegions', next);
  },
  clearRegions() { this.set('selectedRegions', []); },
  toggleFootprintFlow(flow) {
    const cur = _state.footprintFlows || [];
    const next = cur.includes(flow) ? cur.filter(f => f !== flow) : [...cur, flow];
    this.setMany({
      footprintFlows: next,
      footprintFlow: next[0] || _state.footprintFlow || 'footprint',
      footprintTrendMode: next.length > 1 ? 'all' : 'selected',
    });
  },
  setFootprintFlows(flows) {
    const next = [...new Set(flows || [])];
    this.setMany({
      footprintFlows: next,
      footprintFlow: next[0] || _state.footprintFlow || 'footprint',
      footprintTrendMode: next.length > 1 ? 'all' : 'selected',
    });
  },
};

