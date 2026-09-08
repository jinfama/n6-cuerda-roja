// Choropleth map view — D3 + TopoJSON world-110m.
// Reads the active indicator from State and paints countries from the
// precomputed country_year_indicators.json bundle.

import { State } from '../state.js?v=20260906f';
import { DataLoader } from '../data-loader.js?v=20260906f';
import { getIndicator } from '../indicators.js?v=20260906f';
import { escapeHtml, formatCategoryLabel } from '../labels.js?v=20260906f';
import { metricValue, metricYearRange, resolveMetric, supportsCropCategory } from '../metric.js?v=20260906f';
import { enrichRegionalData } from '../regional-estimates.js?v=20260906f';
import { registerExport } from '../export-csv.js?v=20260906f';

// ---------------------------------------------------------------------------
// Data ramps of the map. Reviewed on 6 September 2026 at the author's request
// (see CLAUDE.md, section "Escalas de mapa"). They are NOT chrome: they are the
// encoding, and they are chosen by measurement, not by taste.
//
// Three sequential families plus a neutral base for the trade layer, all born
// of the approved cover V5_columna-desdoblada (lino, dril, ocre):
//   dril    quantities and rhythms       cool linen -> #2C4A6E -> #1B2F47
//   patina  money per person             oxidised-brass green
//   oxido   alarm indicators (ind.warn)  rust red, never brass
//   arena   base under the trade arcs    neutral earth, so the arcs read on top
// The ocre #BE7A14 is the chrome accent (selection ring, rules, buttons) and is
// therefore absent from every data ramp: a datum must never look like a button.
//
// Measured on the real map (177 units, 2021, pooled 1962-2021 domain): the 7
// classes plus "sin dato" plus "cero" give 9/9 tones separable at dE76 >= 5,
// 9/9 at CIEDE2000 >= 5, and 9/9 under both deuteranopia and protanopia
// (Vienot-Brettel-Mollon 1999). Smallest step between contiguous classes:
// 10.7 dE76 / 8.2 dE2000 (dril), 10.1 / 7.5 (arena).
const PALETTES = {
  dril:   ['#C3D0E3', '#A0B4D1', '#7E98BD', '#5C7EA9', '#3C6491', '#2C4A6E', '#1B2F47'],
  patina: ['#B9D4BD', '#93BB9E', '#6CA384', '#478A6D', '#286F58', '#115444', '#063A30'],
  oxido:  ['#EBC9C0', '#E0A79B', '#D38476', '#C26155', '#A7423D', '#812C2B', '#571D1E'],
  arena:  ['#D3C5A9', '#BAA98D', '#9F8E75', '#847560', '#6A5C4B'],
};
PALETTES.default = PALETTES.dril;

// Categories that are not magnitudes. Neither belongs to any ramp.
//   NO_DATA graphite grey: >= 14.4 dE76 from every class of every family and
//           1.64:1 against the linen canvas. The old '#DCE8E9' sat 1.4 dE76
//           from class 2 of the teal ramp and 1.03:1 from the canvas, so a
//           country with no data was indistinguishable both from a real class
//           and from the sea around it.
//   ZERO    unprinted paper for an exact zero: 24.9 dE76 from NO_DATA and
//           >= 19.2 dE76 from the lightest class of any family.
const NO_DATA = '#B0B3B4';
const ZERO    = '#F8F8F4';

// Two inks for the flow layer. 31.1 dE76 apart under protanopia over the linen
// canvas, 14.8 at worst over the darkest class of arena (they blend multiply).
const TRADE_COLORS = {
  imports: '#2C4A6E',
  exports: '#A7423D',
};

// workers / hours_total / fp_hours_total used to carry a ramp of their own that
// sat 0.4-6.9 dE76 from the generic one class by class -- four of the seven
// pairs below the dE 5 threshold: two palettes no eye could tell apart. They
// now share 'dril' with the rest of the quantities.
function paletteFor(ind) {
  if (!ind) return PALETTES.dril;
  if (ind.source === 'bilateral_trade') return PALETTES.arena;
  if (ind.warn) return PALETTES.oxido;
  if (ind.id === 'monthly_wage' || ind.id === 'va_per_worker') return PALETTES.patina;
  return PALETTES.dril;
}

function strictlyIncreasing(arr) {
  for (let i = 1; i < arr.length; i++) if (!(arr[i] > arr[i - 1])) return false;
  return true;
}

// The class ladder the map paints AND the legend prints, built once so the two
// cannot disagree.
//
// Exact zeros come out of the ramp before anything else: a zero is a category,
// not a magnitude, and a mass of them destroys the quantiles. Measured on this
// dataset, pct_extreme_poverty only ever takes the values 0 and 100; with the
// zeros inside the domain the six quantile breaks all landed on 0 and d3
// painted all 182 countries in the darkest class -- a whole world at the
// maximum while 180 of them were at zero. One single tone on the map.
function buildClasses(values, palette) {
  const positive = values.filter(v => v !== 0);
  const base = positive.length ? positive : values;
  const uniq = Array.from(new Set(base)).sort(d3.ascending);
  const n = palette.length;
  const extent = d3.extent(base);

  if (uniq.length <= 1) {
    return { kind: 'single', breaks: [], colors: [palette[n - 1]], values: uniq, extent };
  }
  if (uniq.length < n) {
    // Fewer observed values than classes: one cell per value, spread over the
    // whole ramp. A quantile scale here invents breaks that do not exist.
    const colors = uniq.map((_, k) => palette[Math.round(k * (n - 1) / (uniq.length - 1))]);
    return { kind: 'values', breaks: [], colors, values: uniq, extent };
  }
  if (base.length >= n * 3) {
    const breaks = d3.scaleQuantile().domain(base).range(palette).quantiles();
    if (strictlyIncreasing(breaks)) {
      return { kind: 'quantile', breaks, colors: palette.slice(), values: null, extent };
    }
    // Ties collapsed the breaks: reclassify over the distinct values.
    const b2 = d3.scaleQuantile().domain(uniq).range(palette).quantiles();
    if (strictlyIncreasing(b2)) {
      return { kind: 'quantile', breaks: b2, colors: palette.slice(), values: null, extent };
    }
  }
  const [lo, hi] = extent;
  const breaks = d3.range(1, n).map(i => lo + (hi - lo) * i / n);
  return { kind: 'equal', breaks, colors: palette.slice(), values: null, extent };
}

function makeScale(classes) {
  const fn = (v) => {
    if (v === 0) return ZERO;
    if (classes.kind === 'single') return classes.colors[0];
    if (classes.kind === 'values') {
      const i = Math.min(d3.bisectLeft(classes.values, v), classes.colors.length - 1);
      return classes.colors[Math.max(0, i)];
    }
    return classes.colors[d3.bisectRight(classes.breaks, v)];
  };
  fn.classes = classes;
  return fn;
}

function scaleFor(values, palette) {
  return makeScale(buildClasses(values, palette));
}

// Fill helper that also counts the units that fell outside the ramp, so the
// legend prints the "sin dato" and "0" keys only when they are on screen.
function makeTally() {
  return { zero: 0, nodata: 0 };
}
function fillOf(v, scale, tally) {
  if (v == null || !isFinite(v)) { if (tally) tally.nodata++; return NO_DATA; }
  const c = scale(v);
  if (tally && c === ZERO) tally.zero++;
  return c;
}

let _svg, _g, _projection, _path, _topo, _countries;
let _aggregates = null;    // { "ISO3": { year: {field: value, ...}, ... }, ... }
let _isoMap     = null;    // { "724": "ESP", ... } M49 → ISO3
let _countryNames = null;  // { "ESP": "Spain" }
let _tooltip;
let _paintToken = 0;
let _currentData = null;
let _currentCountryNames = null;
let _currentScope = 'country';
let _regionByIso = null;
let _regionData = null;
let _regionCategoryData = null;
let _tradeFootprint = null;
let _regionFeatures = [];
let _tradeFlowRows = null;   // last painted arcs, for the CSV export
let _tradeExportMeta = null;

function formatVal(v) {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + ' B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + ' M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + ' k';
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

// formatVal() is right for a tooltip and wrong for a class break: it rounds
// anything under 0.005 to "0.00", so the seven breaks of h_per_functional_unit
// all printed "0.00" and six of the seven cells carried the title
// "0.00 - 0.00 t/h" over a map that really does paint seven different classes.
// Ticks keep two significant figures below 1; everything else is unchanged.
function formatTick(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a > 0 && a < 1) return Number(v.toPrecision(2)).toString();
  return formatVal(v);
}

function getISO3(feature) {
  // Resolve M49 numeric ID via our mapping table.
  if (!_isoMap) return null;
  const raw = String(feature.id);
  return _isoMap[raw] || _isoMap[raw.replace(/^0+/, '')] || null;
}

function getGeometryISO3(geom) {
  if (!_isoMap || !geom) return null;
  const raw = String(geom.id);
  return _isoMap[raw] || _isoMap[raw.replace(/^0+/, '')] || null;
}

function topoCountryObject() {
  if (!_topo?.objects) return null;
  return _topo.objects.countries || _topo.objects[Object.keys(_topo.objects)[0]];
}

async function activeDataset(ind) {
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  if (!category) {
    return { data: _aggregates, countryNames: _countryNames || {}, category: null };
  }
  const ds = await DataLoader.loadCategorySeries(category);
  return { data: ds.data || {}, countryNames: ds.country_names || _countryNames || {}, category };
}

async function activeTradeFootprintDataset() {
  const fp = await loadTradeFootprint();
  return { data: fp.data || {}, countryNames: fp.country_names || {}, category: null };
}

async function loadTradeFootprint() {
  if (_tradeFootprint) return _tradeFootprint;
  _tradeFootprint = await DataLoader.loadTradeFootprintFlows();
  return _tradeFootprint;
}

async function loadRegionByIso() {
  if (_regionByIso) return _regionByIso;
  const fp = await loadTradeFootprint();
  _regionByIso = fp.region_by_iso || {};
  return _regionByIso;
}

function indexRegionRows(rows, category = null) {
  const data = {};
  for (const row of rows || []) {
    if (category && row.category_labor !== category) continue;
    const region = row.region_un;
    if (!region) continue;
    if (!data[region]) data[region] = {};
    data[region][row.year] = row;
  }
  return data;
}

async function activeRegionDataset(metric) {
  if (metric.source === 'trade_footprint') {
    const fp = await loadTradeFootprint();
    return {
      data: fp.regions || {},
      world: fp.world || {},
      regionByIso: fp.region_by_iso || {},
      category: null,
    };
  }
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  if (category) {
    if (!_regionCategoryData) _regionCategoryData = await DataLoader.loadRegionsCategories();
    const data = indexRegionRows(_regionCategoryData.rows || [], category);
    return { data, world: data.World || {}, regionByIso: await loadRegionByIso(), category };
  }
  if (!_regionData) {
    const regions = await DataLoader.loadRegions();
    _regionData = indexRegionRows(regions.rows || []);
  }
  const data = await enrichRegionalData(_regionData, metric);
  return { data, world: data.World || {}, regionByIso: await loadRegionByIso(), category: null };
}

function isAntarcticFeature(feature) {
  const name = feature?.properties?.name || feature?.properties?.NAME || '';
  return name === 'Antarctica' || name === 'Fr. S. Antarctic Lands';
}

function isAntarcticGeometry(geom) {
  const name = geom?.properties?.name || geom?.properties?.NAME || '';
  return name === 'Antarctica' || name === 'Fr. S. Antarctic Lands';
}

export async function initMapView() {
  _svg = d3.select('#map-svg');
  _svg.append('defs').html(`
    <marker id="trade-arrow-import" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="${TRADE_COLORS.imports}"></path>
    </marker>
    <marker id="trade-arrow-export" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="${TRADE_COLORS.exports}"></path>
    </marker>
  `);
  _g   = _svg.append('g');
  _tooltip = d3.select('#map-tooltip');

  // Parallel load: topology + aggregates + iso mapping.
  try {
    const [topo, agg, iso] = await Promise.all([
      DataLoader.loadWorldTopo(),
      DataLoader.loadCountryYearIndicators(),
      DataLoader.loadIsoMapping(),
    ]);
    _topo = topo;
    _aggregates = agg.data;
    _countryNames = agg.country_names || {};
    _isoMap = iso.mapping;
  } catch (e) {
    console.error('[map] failed to load core data', e);
    return;
  }

  const objects = _topo.objects;
  const key = objects.countries ? 'countries' : Object.keys(objects)[0];
  _countries = topojson.feature(_topo, objects[key]).features
    .filter(feature => !isAntarcticFeature(feature));

  resize();
  drawCountries();
  paint();

  // Tapping the empty map (ocean) dismisses the anchored card.
  _svg.on('click', event => {
    if (event.target === _svg.node() && _tooltip.classed('anchored')) hideTooltip();
  });

  refreshCanvasCaption();
  ['activeIndicator', 'activeCategory', 'currentYear', 'language', 'cropCategoryFilter']
    .forEach(k => State.subscribe(k, refreshCanvasCaption));

  State.subscribe('activeIndicator',   paint);
  State.subscribe('activeCategory',    paint);
  State.subscribe('functionalUnit',    paint);
  State.subscribe('productivityLaborInput', paint);
  State.subscribe('productivityDirection', paint);
  State.subscribe('footprintFlow',     paint);
  State.subscribe('tradeFlow',         paint);
  State.subscribe('tradeProduct',      paint);
  State.subscribe('tradeTopN',         paint);
  State.subscribe('currentYear',       paint);
  State.subscribe('yearRange',         paint);
  State.subscribe('cropCategoryFilter',paint);
  State.subscribe('selectedCountries', paintSelection);
  State.subscribe('selectedRegions',   paintSelection);
  State.subscribe('trendGeoScope',     paint);
  State.subscribe('language',          paint);
  window.addEventListener('resize', () => { resize(); drawCountries(); paint(); });
}

// The bilateral-trade legend (class strip + top-10 list) is ~330 px wide and ~350 px tall.
// On a wide frame it sat on an opaque plate over Ecuador, Peru and Colombia (checked on the
// 2026-09-08 captures). On frames of 900 px and more the map now fits to the right of a
// reserved left column that holds the caption and that legend: the map is smaller in that
// view, but it is whole. Below 900 px (and on phones, where the legend is a strip under the
// map) the fit is unchanged.
const TRADE_LEGEND_COLUMN = 372;
let _fitLeftPad = null;

function tradeLegendColumn(W, mobile) {
  if (mobile || W < 900) return null;
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  return ind && ind.source === 'bilateral_trade' ? TRADE_LEGEND_COLUMN : null;
}

function resize() {
  const container = document.getElementById('map-container');
  const W = container.clientWidth;
  const H = container.clientHeight;
  _svg.attr('width', W).attr('height', H);
  const mobile = W <= 700;
  const topPad = mobile ? 54 : 24;
  const bottomPad = mobile ? Math.min(150, Math.max(108, H * 0.18)) : 22;
  const leftPad = tradeLegendColumn(W, mobile) ?? (mobile ? 10 : 20);
  _fitLeftPad = leftPad;
  const geo = _countries && _countries.length
    ? { type: 'FeatureCollection', features: _countries }
    : { type: 'Sphere' };
  _projection = d3.geoNaturalEarth1().fitExtent([[leftPad, topPad], [W - (mobile ? 10 : 20), H - bottomPad]], geo);
  _path = d3.geoPath(_projection);
}

// Switching into or out of the trade layer changes the reserved column, so the
// projection has to be refitted and the country paths redrawn before painting.
function syncProjectionToLayer() {
  const container = document.getElementById('map-container');
  if (!container || !_countries) return;
  const W = container.clientWidth;
  const mobile = W <= 700;
  const wanted = tradeLegendColumn(W, mobile) ?? (mobile ? 10 : 20);
  if (wanted === _fitLeftPad) return;
  resize();
  drawCountries();
  paintSelection();
}

function drawCountries() {
  if (!_countries) return;
  _g.selectAll('path.country-path').remove();
  _g.selectAll('path.country-path')
    .data(_countries)
    .enter().append('path')
      .attr('class', 'country-path')
      .attr('d', _path)
      .attr('data-iso', d => getISO3(d) || '')
      // Chromium synthesises mouseenter/mouseleave around a tap, and the
      // synthetic mouseleave arrived ~4 ms after the click and wiped the card
      // we had just anchored. On a coarse pointer the hover pair is inert.
      .on('mouseenter', (event, d) => { if (!isCoarsePointer()) showTooltip(event, d); })
      .on('mousemove',  (event)    => { if (!isCoarsePointer()) moveTooltip(event); })
      .on('mouseleave', () => { if (!isCoarsePointer()) hideTooltip(); })
      .on('click', (event, d) => {
        // Coarse pointer: the tap must also *read* the value, not only select.
        if (isCoarsePointer()) showTooltip(event, d);
        const iso = getISO3(d);
        if (State.get('activeCategory') === 'trade') {
          if (iso) State.focusCountry(iso);
          return;
        }
        const scope = State.get('trendGeoScope') === 'world' ? 'country' : State.get('trendGeoScope');
        if (!iso || scope === 'world') return;
        if (scope === 'region') {
          const region = _regionByIso?.[iso];
          if (region) State.toggleRegion(region);
          return;
        }
        State.toggleCountry(iso);
      });
}

function valueFor(data, iso, metric, year) {
  if (!data) return null;
  const series = data[iso];
  if (!series) return null;
  const yr = series[year];
  if (!yr) return null;
  return metricValue(yr, metric);
}

function valuesForScale(data, metric) {
  const [from, to] = State.get('yearRange');
  const values = [];
  for (const iso in (data || {})) {
    const series = data[iso] || {};
    for (const y in series) {
      const year = +y;
      if (year < from || year > to) continue;
      const v = metricValue(series[y], metric);
      if (v != null && isFinite(v)) values.push(v);
    }
  }
  return values;
}

// Paints fp_hours_child / fp_hours_forced from country_year_indicators.
// Returns false when the loaded tree has no such field, so the caller can fall
// back to the "coming soon" note instead of painting an empty world.
async function paintFootprintsIndicator(metric, token) {
  const data = _aggregates;
  if (!data) return false;
  const values = valuesForScale(data, metric);
  if (!values.length) return false;
  if (token !== _paintToken) return true;
  clearRegionLayer();
  _currentScope = 'country';
  _currentData = data;
  _currentCountryNames = _countryNames || {};
  const year = State.get('currentYear');
  const palette = paletteFor(metric);
  const scale = scaleFor(values, palette);
  const tally = makeTally();
  _g.selectAll('path.country-path').style('display', null);
  _g.selectAll('path.country-path').style('fill', d => {
    const key = featureDataKey(d);
    if (!key) { tally.nodata++; return NO_DATA; }
    return fillOf(valueFor(data, key, metric, year), scale, tally);
  });
  paintSelection();
  paintLegend(values, palette, metric, scale, null, tally);
  return true;
}

async function paint() {
  const token = ++_paintToken;
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  if (!metric) return;
  syncProjectionToLayer();
  if (metric.source === 'bilateral_trade') {
    await paintTradeMap(metric);
    return;
  }
  clearTradeLayer();
  _tradeFlowRows = null;
  // Embedded child/forced labour hours: the web release folds the country-year
  // aggregates of the (unpublished) footprints partitions into
  // country_year_indicators, so they paint from the same bundle as everything
  // else. On a tree without those fields we fall back to the note below.
  if (metric.source === 'footprints') {
    const painted = await paintFootprintsIndicator(metric, token);
    if (painted) return;
  }
  // Indicators sourced from conditions live in other files for now.
  if (metric.source && !['regions', 'trade_footprint'].includes(metric.source)) {
    _g.selectAll('path.country-path').style('fill', 'var(--c-bg-h)');
    d3.select('#map-legend').html(
      `<div class="map-legend-title">${metric.labelText}</div>
       <div class="map-legend-note">Vista pr\u00f3xima: datos en otra fuente.</div>`
    );
    return;
  }

  const requestedScope = State.get('trendGeoScope');
  const scope = requestedScope === 'world' ? 'country' : requestedScope;
  let data;
  let countryNames;
  let category;
  if (scope === 'country') {
    const ds = metric.source === 'trade_footprint'
      ? await activeTradeFootprintDataset()
      : await activeDataset(ind);
    data = ds.data;
    countryNames = ds.countryNames;
    category = ds.category;
  } else {
    const ds = await activeRegionDataset(metric);
    _regionByIso = ds.regionByIso || _regionByIso || {};
    data = Object.fromEntries(Object.entries(ds.data || {}).filter(([key]) => key !== 'World'));
    countryNames = {};
    category = ds.category;
  }
  if (token !== _paintToken) return;
  _currentScope = scope;
  _currentData = data;
  _currentCountryNames = countryNames || _countryNames;
  const year = State.get('currentYear');
  const values = valuesForScale(data, metric);
  const palette = paletteFor(metric);
  if (!values.length) {
    clearRegionLayer();
    _g.selectAll('path.country-path').style('display', null);
    _g.selectAll('path.country-path').style('fill', NO_DATA);
    d3.select('#map-legend').html('');
    return;
  }
  const scale = scaleFor(values, palette);

  if (scope === 'region') {
    paintRegionMap(data, metric, year, values, palette, scale, category);
    return;
  }

  clearRegionLayer();
  const tally = makeTally();
  _g.selectAll('path.country-path').style('display', null);
  _g.selectAll('path.country-path').style('fill', d => {
    const key = featureDataKey(d);
    if (!key) { tally.nodata++; return NO_DATA; }
    return fillOf(valueFor(data, key, metric, year), scale, tally);
  });

  paintSelection();
  paintLegend(values, palette, metric, scale, category, tally);
}

function clearRegionLayer() {
  _g.selectAll('path.region-path').remove();
  _g.selectAll('path.region-border').remove();
  _g.selectAll('path.region-outline').remove();
  _regionFeatures = [];
}

function buildRegionFeatures(data, metric, year) {
  const obj = topoCountryObject();
  const geoms = obj?.geometries || [];
  if (!obj || !geoms.length || !_regionByIso) return [];

  const regionGeometries = new Map();
  for (const geom of geoms) {
    if (isAntarcticGeometry(geom)) continue;
    const iso = getGeometryISO3(geom);
    const region = iso ? _regionByIso[iso] : null;
    if (!region || region === 'World') continue;
    if (!regionGeometries.has(region)) regionGeometries.set(region, []);
    regionGeometries.get(region).push(geom);
  }

  return [...regionGeometries.entries()]
    .filter(([region]) => data && data[region])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, regionGeoms]) => ({
      type: 'Feature',
      geometry: topojson.merge(_topo, regionGeoms),
      properties: {
        region,
        value: valueFor(data, region, metric, year),
      },
    }));
}

function paintRegionMap(data, metric, year, values, palette, scale, category) {
  const tally = makeTally();
  _g.selectAll('path.country-path').style('display', 'none');
  clearRegionLayer();

  _regionFeatures = buildRegionFeatures(data, metric, year);
  if (!_regionFeatures.length) {
    d3.select('#map-legend').html('');
    return;
  }

  _g.selectAll('path.region-path')
    .data(_regionFeatures, d => d.properties.region)
    .enter().append('path')
      .attr('class', 'region-path')
      .attr('d', _path)
      .style('fill', d => fillOf(d.properties.value, scale, tally))
      .on('mouseenter', (event, d) => { if (!isCoarsePointer()) showRegionTooltip(event, d, metric); })
      .on('mousemove', (event) => { if (!isCoarsePointer()) moveTooltip(event); })
      .on('mouseleave', () => { if (!isCoarsePointer()) hideTooltip(); })
      .on('click', (event, d) => {
        if (isCoarsePointer()) showRegionTooltip(event, d, metric);
        State.toggleRegion(d.properties.region);
      });

  const obj = topoCountryObject();
  const regionOf = geom => {
    const iso = getGeometryISO3(geom);
    return iso ? _regionByIso?.[iso] : null;
  };
  const regionBorder = topojson.mesh(_topo, obj, (a, b) => {
    if (!a || !b || a === b) return false;
    const ar = regionOf(a);
    const br = regionOf(b);
    return ar && br && ar !== br;
  });
  _g.append('path')
    .datum(regionBorder)
    .attr('class', 'region-border')
    .attr('d', _path)
    .attr('fill', 'none');

  const outline = topojson.mesh(_topo, obj, (a, b) => a === b);
  _g.append('path')
    .datum(outline)
    .attr('class', 'region-outline')
    .attr('d', _path)
    .attr('fill', 'none');

  paintSelection();
  paintLegend(values, palette, metric, scale, category, tally);
}

function paintSelection() {
  const scope = State.get('trendGeoScope') === 'world' ? 'country' : State.get('trendGeoScope');
  const selectedCountries = State.get('selectedCountries');
  const selectedRegions = State.get('selectedRegions');
  const drawableIso = _countries
    ? _countries.map(getISO3).filter(Boolean)
    : [];
  const selectedSet = new Set(selectedCountries);
  const allCountriesSelected = drawableIso.length > 0 && drawableIso.every(iso => selectedSet.has(iso));
  _g.selectAll('path.country-path').classed('selected', d => {
    const iso = getISO3(d);
    if (!iso || scope === 'world') return false;
    if (scope === 'region') return selectedRegions.includes(_regionByIso?.[iso]);
    if (allCountriesSelected) return false;
    return selectedCountries.includes(iso);
  });
  _g.selectAll('path.region-path').classed('selected', d => {
    if (scope !== 'region') return false;
    const regions = _regionFeatures.map(f => f.properties.region);
    const allRegionsSelected = regions.length > 0 && regions.every(region => selectedRegions.includes(region));
    if (allRegionsSelected) return false;
    return selectedRegions.includes(d.properties.region);
  });
}

function featureDataKey(feature) {
  const iso = getISO3(feature);
  if (_currentScope === 'world') return 'World';
  if (_currentScope === 'region') return iso ? _regionByIso?.[iso] : null;
  return iso;
}

// Title, year and source printed inside the map frame, so a screen capture of
// the map is self-explanatory outside the app.
function paintCanvasCaption(metric, category) {
  const title = document.getElementById('map-caption-title');
  const source = document.getElementById('map-caption-source');
  if (!title || !source) return;
  const lang = State.get('language');
  const bits = [metric ? metric.labelText : ''];
  if (metric && metric.unit) bits.push(`(${metric.unit})`);
  if (category) bits.push('· ' + formatCategoryLabel(category, lang));
  title.textContent = `${bits.filter(Boolean).join(' ')} · ${State.get('currentYear')}`;
  source.textContent = document.getElementById('footer-source')?.textContent || '';
}

// Keeps the in-canvas caption in step with the state even in the trade layer,
// which paints its own legend and never reaches paintLegend().
export function refreshCanvasCaption() {
  let metric = null;
  try {
    const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
    metric = ind ? resolveMetric(ind, State.get('language')) : null;
  } catch (_) { metric = null; }
  paintCanvasCaption(metric, State.get('cropCategoryFilter'));
}

// Ticks live in a grid of one column per class, so a label can never land on
// top of its neighbour: the upper bound of class i is right-aligned in column
// i+1, which is exactly the joint it belongs to. Only every other joint is
// printed (six numbers do not fit in 220 px), and never the joints next to the
// ends: a label right-aligned in column 2 butts straight into the minimum,
// which is left-aligned in column 1 and wider than its own column
// ("265.6 k 260.23 M" read as one number). Printing columns 3 and 5 leaves a
// whole cell of air on both sides. The exact range of every class stays in the
// cell tooltip.
function legendTicks(classes) {
  const n = classes.colors.length;
  if (classes.kind === 'single' || classes.kind === 'values') {
    return (classes.values || []).map((v, i) => ({
      col: i + 1, place: 'mid', text: formatTick(v),
    }));
  }
  const [lo, hi] = classes.extent;
  const ticks = [{ col: 1, place: 'start', text: formatTick(lo) }];
  classes.breaks.forEach((b, i) => {
    if ((i + 1) % 2 === 1 && (i + 1) >= 3 && (i + 1) <= n - 2) {
      ticks.push({ col: i + 1, place: 'end', text: formatTick(b) });
    }
  });
  ticks.push({ col: n, place: 'end', text: formatTick(hi) });
  return ticks;
}

function legendTicksHtml(classes) {
  const n = classes.colors.length;
  const cells = legendTicks(classes).map(t =>
    `<span class="map-legend-tick ${t.place}" style="grid-column:${t.col};">${t.text}</span>`
  ).join('');
  return `<div class="map-legend-ticks" style="grid-template-columns:repeat(${n}, 1fr);">${cells}</div>`;
}

function legendCellTitle(classes, i, unit) {
  const u = unit ? ' ' + unit : '';
  if (classes.kind === 'single' || classes.kind === 'values') {
    return `${formatTick((classes.values || [])[i])}${u}`;
  }
  const lo = i === 0 ? classes.extent[0] : classes.breaks[i - 1];
  const hi = i === classes.colors.length - 1 ? classes.extent[1] : classes.breaks[i];
  return `${formatTick(lo)} – ${formatTick(hi)}${u}`;
}

function legendMethodNote(classes, metric, lang) {
  const n = classes.colors.length;
  const [from, to] = metricYearRange(metric) || [];
  const span = (from && to && from !== to) ? ` ${from}\u2013${to}` : (from ? ` ${from}` : '');
  if (classes.kind === 'single' || classes.kind === 'values') {
    return lang === 'en'
      ? `${n} observed value${n === 1 ? '' : 's'}${span}`
      : `${n} valor${n === 1 ? '' : 'es'} observado${n === 1 ? '' : 's'}${span}`;
  }
  if (classes.kind === 'equal') {
    return lang === 'en' ? `${n} equal intervals${span}` : `${n} tramos iguales${span}`;
  }
  return lang === 'en'
    ? `${n} classes of equal count${span}`
    : `${n} clases de igual n\u00famero de casos${span}`;
}

// The legend used to draw seven cells and label only the two ends: it promised
// steps and printed a range, so the reader could not tell where one class ended
// and the next began, nor that the breaks are septiles and not equal intervals.
// It now prints the very ladder the map paints (`scale.classes`): the break
// values at the cell joints, the classification method in words, the full range
// of every class in the cell title, and a key for the two categories that are
// not magnitudes -- shown only when they are actually on screen.
function paintLegend(values, palette, metric, scale, category, tally) {
  paintCanvasCaption(metric, category);
  const box = d3.select('#map-legend');
  if (!box.node()) return;
  const lang = State.get('language');
  const classes = scale && scale.classes
    ? scale.classes
    : buildClasses(values, palette);
  const unit = metric && metric.unit ? metric.unit : '';
  const stops = classes.colors.map((c, i) =>
    `<span class="map-legend-cell" style="background:${c};" title="${escapeHtml(legendCellTitle(classes, i, unit))}"></span>`
  ).join('');
  const keys = [];
  if (tally && tally.zero) {
    keys.push(`<span class="map-legend-key"><i style="background:${ZERO};"></i>${lang === 'en' ? 'exactly 0' : 'cero exacto'}</span>`);
  }
  if (!tally || tally.nodata) {
    keys.push(`<span class="map-legend-key"><i style="background:${NO_DATA};"></i>${lang === 'en' ? 'no data' : 'sin dato'}</span>`);
  }
  box.html(`
    <div class="map-legend-title">${metric.labelText} <span style="opacity:0.62">(${metric.unit})</span></div>
    ${category ? `<div class="map-legend-filter">${escapeHtml(formatCategoryLabel(category, lang))}</div>` : ''}
    <div class="map-legend-bar">${stops}</div>
    ${legendTicksHtml(classes)}
    <div class="map-legend-note">${escapeHtml(legendMethodNote(classes, metric, lang))}</div>
    ${keys.length ? `<div class="map-legend-keys">${keys.join('')}</div>` : ''}
  `);
}

function clearTradeLayer() {
  _g.selectAll('.trade-arc').remove();
  _g.selectAll('.trade-node').remove();
  _g.selectAll('.trade-label').remove();
  _g.selectAll('.trade-focus-ring').remove();
  d3.select('#map-container').selectAll('.trade-map-controls').remove();
  document.getElementById('map-container')?.classList.remove('has-trade-controls');
}

// Row layouts in the bilateral partitions:
//   total             [tonnes, hours]           -> tonnes at index 0
//   products/partners [name, tonnes, hours]     -> tonnes at index 1
// Reading index 0 of a product row returned the product NAME, so the map
// painted zeros for every product other than the total (audit finding).
function tradeMeasureIndex(kind = 'total') {
  return kind === 'named' ? 1 : 0;
}

function tradeUnit() {
  return State.get('language') === 'en' ? 't' : 't';
}

function tradeCountryValue(country, flow, product) {
  if (!country) return 0;
  const flows = flow === 'both' ? ['imports', 'exports'] : [flow];
  let total = 0;
  for (const f of flows) {
    const block = country[f];
    if (!block) continue;
    if (product === '__total__') {
      total += +block.total?.[tradeMeasureIndex('total')] || 0;
    } else {
      const row = (block.products || []).find(d => d[0] === product);
      total += +row?.[tradeMeasureIndex('named')] || 0;
    }
  }
  return total;
}

function tradePartnerRows(country, flow, product, shard = null) {
  if (!country) return [];
  const flows = flow === 'both' ? ['imports', 'exports'] : [flow];
  const rows = [];
  for (const f of flows) {
    const block = country[f];
    if (!block) continue;
    // Web release: product_partners lives in bilateral/countries/<ISO>.json.
    const partners = product === '__total__'
      ? (block.partners || [])
      : (shard?.[f]?.[product] || block.product_partners?.[product] || []);
    for (const p of partners) {
      rows.push({ flow: f, partner: p[0], tonnes: +p[1] || 0, hours: +p[2] || 0 });
    }
  }
  return rows.filter(d => d.partner && d.partner !== '__other__' && d.tonnes > 0);
}

function directionalTradeRows(countryIso, country, flow, product, shard = null) {
  return tradePartnerRows(country, flow, product, shard)
    .map(row => ({
      ...row,
      source: row.flow === 'imports' ? row.partner : countryIso,
      target: row.flow === 'imports' ? countryIso : row.partner,
    }))
    .filter(row => row.source && row.target && row.source !== row.target);
}

// Web release: with no country selected, per-product world arcs come from the
// precomputed directed-arc file instead of scanning every country's partners.
function globalProductRows(productDoc, flow, product, centroids) {
  const block = productDoc?.products?.[product];
  if (!block) return null;
  const flows = flow === 'both' ? ['imports', 'exports'] : [flow];
  // One arc per directed pair, keeping the larger of the two mirror reports —
  // the same rule globalTradeRows() applies on the legacy tree. Without it the
  // importer-reported and exporter-reported arcs of one pair both survive and
  // the world view lists (and overdraws) the same flow twice.
  const byDirection = new Map();
  for (const f of flows) {
    for (const arc of (block[f] || [])) {
      const [source, target, tonnes, hours] = arc;
      if (!centroids.has(source) || !centroids.has(target) || source === target) continue;
      const row = {
        flow: f,
        partner: f === 'imports' ? source : target,
        source,
        target,
        tonnes: +tonnes || 0,
        hours: +hours || 0,
      };
      const key = `${source}->${target}`;
      const prev = byDirection.get(key);
      if (!prev || row.tonnes > prev.tonnes) byDirection.set(key, row);
    }
  }
  return [...byDirection.values()];
}

function globalTradeRows(countries, flow, product, centroids, limit) {
  const byDirection = new Map();
  Object.entries(countries || {}).forEach(([iso, country]) => {
    directionalTradeRows(iso, country, flow, product).forEach(row => {
      if (!centroids.has(row.source) || !centroids.has(row.target)) return;
      const key = `${row.source}->${row.target}`;
      const prev = byDirection.get(key);
      if (!prev || row.tonnes > prev.tonnes) byDirection.set(key, row);
    });
  });
  return [...byDirection.values()]
    .sort((a, b) => b.tonnes - a.tonnes)
    .slice(0, limit);
}

function withCurveSides(rows) {
  const pairIndex = new Map();
  return rows.map(row => {
    const pair = [row.source, row.target].sort().join('__');
    if (!pairIndex.has(pair)) pairIndex.set(pair, pairIndex.size);
    return { ...row, curveSide: pairIndex.get(pair) % 2 ? -1 : 1 };
  });
}

function centroidByIso() {
  const out = new Map();
  (_countries || []).forEach(feature => {
    const iso = getISO3(feature);
    if (!iso) return;
    const c = _path.centroid(feature);
    if (isFinite(c[0]) && isFinite(c[1])) out.set(iso, c);
  });
  return out;
}

function tradeArcPath(a, b, side = 1) {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(110, Math.max(30, dist * 0.2)) * side;
  const mx = (x1 + x2) / 2 - (dy / dist) * bend;
  const my = (y1 + y2) / 2 + (dx / dist) * bend;
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
}

function tradeProductLabel(product, index) {
  const lang = State.get('language');
  if (product === '__total__') return index.product_labels?.__total__?.[lang] || 'Total';
  if (product === '__other__') return index.product_labels?.__other__?.[lang] || (lang === 'en' ? 'Other' : 'Resto');
  return product;
}

function renderTradeMapControls() {
  const lang = State.get('language');
  const flow = State.get('tradeFlow') || 'both';
  const topN = State.get('tradeTopN') || 10;
  const labels = lang === 'en'
    ? { both: 'Both', imports: 'Imports', exports: 'Exports', top5: 'Top 5', top10: 'Top 10' }
    : { both: 'Ambas', imports: 'Importaciones', exports: 'Exportaciones', top5: 'Top 5', top10: 'Top 10' };
  const box = d3.select('#map-container')
    .selectAll('.trade-map-controls')
    .data([null])
    .join('div')
    .attr('class', 'trade-map-controls');
  // The flow pills live in the same corner as the in-canvas caption: mark the
  // frame so the caption drops below them instead of hiding behind them.
  document.getElementById('map-container')?.classList.add('has-trade-controls');
  box.html(`
    <div class="trade-map-control-group" role="group" aria-label="${lang === 'en' ? 'Trade flow' : 'Flujo comercial'}">
      ${[
        ['both', labels.both],
        ['imports', labels.imports],
        ['exports', labels.exports],
      ].map(([id, label]) => `<button type="button" class="${flow === id ? 'active' : ''}" data-trade-map-flow="${id}">${escapeHtml(label)}</button>`).join('')}
    </div>
    <div class="trade-map-control-group" role="group" aria-label="${lang === 'en' ? 'Number of partners' : 'Número de socios'}">
      ${[
        [5, labels.top5],
        [10, labels.top10],
      ].map(([id, label]) => `<button type="button" class="${topN === id ? 'active' : ''}" data-trade-map-top="${id}">${escapeHtml(label)}</button>`).join('')}
    </div>
  `);
  box.selectAll('[data-trade-map-flow]').on('click', function () {
    State.set('tradeFlow', this.dataset.tradeMapFlow);
  });
  box.selectAll('[data-trade-map-top]').on('click', function () {
    State.set('tradeTopN', +this.dataset.tradeMapTop);
  });
}

async function paintTradeMap(metric) {
  const year = State.get('currentYear');
  const flow = State.get('tradeFlow') || 'both';
  const product = State.get('tradeProduct') || '__total__';
  const topN = State.get('tradeTopN') || 10;
  const [index, yearData] = await Promise.all([
    DataLoader.loadBilateralIndex(),
    DataLoader.loadBilateralYear(year),
  ]);
  clearRegionLayer();
  clearTradeLayer();
  renderTradeMapControls();
  _currentScope = 'country';
  _currentData = {};
  _currentCountryNames = index.countries || _countryNames || {};
  _g.selectAll('path.country-path').style('display', null);

  const countries = yearData.countries || {};
  const values = Object.values(countries)
    .map(country => tradeCountryValue(country, flow, product))
    .filter(v => v > 0 && isFinite(v));
  const palette = PALETTES.arena;   // neutral earth: the arcs are the message here
  const scale = values.length ? scaleFor(values, palette) : null;
  // A country absent from the bilateral index has NO DATA; a country that is in
  // the index and moved nothing has an exact ZERO. Painting both alike said
  // "we do not know" of a country we know traded nothing.
  const baseTally = makeTally();
  _g.selectAll('path.country-path').style('fill', d => {
    const iso = getISO3(d);
    if (!iso || !countries[iso]) { baseTally.nodata++; return NO_DATA; }
    const v = tradeCountryValue(countries[iso], flow, product);
    if (!isFinite(v)) { baseTally.nodata++; return NO_DATA; }
    if (!scale || v <= 0) { baseTally.zero++; return ZERO; }
    return scale(v);
  });

  const selected = (State.get('selectedCountries') || [])[0] || State.get('focusedCountry');
  paintSelection();
  const lang = State.get('language');
  const flowTitle = flow === 'imports'
    ? (lang === 'en' ? 'imports' : 'importaciones')
    : flow === 'exports'
      ? (lang === 'en' ? 'exports' : 'exportaciones')
      : (lang === 'en' ? 'imports + exports' : 'importaciones + exportaciones');
  const productTitle = tradeProductLabel(product, index);

  const centroids = centroidByIso();
  const hasSelection = Boolean(selected && countries[selected] && centroids.has(selected));
  const focus = hasSelection ? centroids.get(selected) : null;
  const resolvedYear = yearData.year ?? year;
  let rawRows;
  if (hasSelection) {
    let shard = null;
    if (product !== '__total__') {
      const doc = await DataLoader.loadBilateralCountry(selected);
      shard = doc?.product_partners?.[String(resolvedYear)] || null;
    }
    rawRows = directionalTradeRows(selected, countries[selected], flow, product, shard);
  } else if (product !== '__total__') {
    const productDoc = await DataLoader.loadBilateralProducts(resolvedYear);
    rawRows = globalProductRows(productDoc, flow, product, centroids)
      || globalTradeRows(countries, flow, product, centroids, topN);
  } else {
    rawRows = globalTradeRows(countries, flow, product, centroids, topN);
  }
  const flowRows = withCurveSides(rawRows
    .filter(row => centroids.has(row.source) && centroids.has(row.target))
    .sort((a, b) => b.tonnes - a.tonnes)
    .slice(0, topN));
  _tradeFlowRows = flowRows;
  _tradeExportMeta = { year: resolvedYear, flow, product: productTitle, names: index.countries || {} };

  if (!flowRows.length) {
    d3.select('#map-legend').html(`
      <div class="map-legend-title">${hasSelection ? escapeHtml(index.countries?.[selected] || selected) : (lang === 'en' ? 'Bilateral trade' : 'Comercio bilateral')}</div>
      <div class="map-legend-note">${lang === 'en' ? 'No partner flows in this selection.' : 'No hay flujos de socios para esta selección.'}</div>
      <div class="map-legend-filter">${escapeHtml(productTitle)} &middot; ${escapeHtml(flowTitle)}</div>
    `);
    return;
  }

  const width = d3.scaleSqrt()
    .domain(d3.extent(flowRows, d => d.tonnes))
    .range([1.8, 10.5]);

  if (focus) {
    _g.append('circle')
      .attr('class', 'trade-focus-ring')
      .attr('cx', focus[0])
      .attr('cy', focus[1])
      .attr('r', 9)
      .attr('fill', 'none');
  }

  _g.selectAll('path.trade-arc')
    .data(flowRows)
    .enter()
    .append('path')
    .attr('class', d => `trade-arc trade-arc-${d.flow}`)
    .attr('d', d => tradeArcPath(centroids.get(d.source), centroids.get(d.target), d.curveSide))
    .attr('marker-end', d => d.flow === 'imports' ? 'url(#trade-arrow-import)' : 'url(#trade-arrow-export)')
    .style('stroke-width', d => width(d.tonnes))
    .on('mouseenter', (event, d) => {
      if (isCoarsePointer()) return;
      const source = index.countries?.[d.source] || d.source;
      const target = index.countries?.[d.target] || d.target;
      const flowLabel = d.flow === 'imports'
        ? (lang === 'en' ? 'reported as import' : 'registrado como importación')
        : (lang === 'en' ? 'reported as export' : 'registrado como exportación');
      _tooltip.html(`<strong>${escapeHtml(source)} &rarr; ${escapeHtml(target)}</strong>${escapeHtml(flowLabel)}<br>${formatVal(d.tonnes)} ${tradeUnit()}${d.hours ? `<br>${formatVal(d.hours)} h` : ''}`);
      _tooltip.classed('visible', true);
      moveTooltip(event);
    })
    .on('mousemove', event => { if (!isCoarsePointer()) moveTooltip(event); })
    .on('mouseleave', () => { if (!isCoarsePointer()) hideTooltip(); })
    .on('click', function (event, d) {
      if (!isCoarsePointer()) return;
      event.stopPropagation();
      const source = index.countries?.[d.source] || d.source;
      const target = index.countries?.[d.target] || d.target;
      const flowLabel = d.flow === 'imports'
        ? (lang === 'en' ? 'reported as import' : 'registrado como importación')
        : (lang === 'en' ? 'reported as export' : 'registrado como exportación');
      _tooltip.html(`<strong>${escapeHtml(source)} &rarr; ${escapeHtml(target)}</strong>${escapeHtml(flowLabel)}<br>${formatVal(d.tonnes)} ${tradeUnit()}${d.hours ? `<br>${formatVal(d.hours)} h` : ''}`);
      _tooltip.classed('visible', true);
      anchorTooltip();
    });

  const nodeMap = new Map();
  flowRows.forEach(row => {
    [row.source, row.target].forEach(iso => {
      if (!centroids.has(iso)) return;
      const prev = nodeMap.get(iso);
      if (!prev || row.tonnes > prev.tonnes) nodeMap.set(iso, { iso, flow: row.flow, tonnes: row.tonnes });
    });
  });
  _g.selectAll('circle.trade-node')
    .data([...nodeMap.values()])
    .enter()
    .append('circle')
    .attr('class', d => `trade-node trade-node-${d.flow}`)
    .attr('cx', d => centroids.get(d.iso)[0])
    .attr('cy', d => centroids.get(d.iso)[1])
    .attr('r', d => d.iso === selected ? 4.4 : 3.4);

  const top = flowRows.slice(0, hasSelection ? 6 : Math.min(8, topN));
  const list = top.map(d => {
    const source = index.countries?.[d.source] || d.source;
    const target = index.countries?.[d.target] || d.target;
    const partnerIso = d.source === selected ? d.target : d.source;
    const partner = index.countries?.[partnerIso] || partnerIso;
    const flowLabel = d.flow === 'imports' ? (lang === 'en' ? 'Imp.' : 'Imp.') : (lang === 'en' ? 'Exp.' : 'Exp.');
    const label = hasSelection
      ? `${escapeHtml(flowLabel)} ${escapeHtml(partner)}`
      : `${escapeHtml(source)} &rarr; ${escapeHtml(target)}`;
    return `<div class="map-flow-row"><span>${label}</span><strong>${formatVal(d.tonnes)} t</strong></div>`;
  }).join('');
  const baseClasses = scale && scale.classes ? scale.classes : null;
  const baseStrip = baseClasses ? `
    <div class="map-legend-bar">${baseClasses.colors.map((c, i) =>
      `<span class="map-legend-cell" style="background:${c};" title="${escapeHtml(legendCellTitle(baseClasses, i, tradeUnit()))}"></span>`).join('')}</div>
    ${legendTicksHtml(baseClasses)}
    <div class="map-legend-note">${lang === 'en'
      ? `country total, ${baseClasses.colors.length} classes of equal count`
      : `total del pa\u00eds, ${baseClasses.colors.length} clases de igual n\u00famero de casos`}</div>
    <div class="map-legend-keys">
      ${baseTally.zero ? `<span class="map-legend-key"><i style="background:${ZERO};"></i>${lang === 'en' ? 'no flow' : 'sin flujo'}</span>` : ''}
      ${baseTally.nodata ? `<span class="map-legend-key"><i style="background:${NO_DATA};"></i>${lang === 'en' ? 'no data' : 'sin dato'}</span>` : ''}
    </div>` : '';
  d3.select('#map-legend').html(`
    <div class="map-legend-title">${hasSelection ? escapeHtml(index.countries?.[selected] || selected) : (lang === 'en' ? 'Main world flows' : 'Principales flujos mundiales')}</div>
    <div class="map-legend-filter">${escapeHtml(productTitle)} &middot; ${escapeHtml(flowTitle)} &middot; ${escapeHtml(`Top ${topN}`)}</div>
    ${baseStrip}
    <div class="map-flow-keys"><span class="flow-key imports"></span>${lang === 'en' ? 'Imports' : 'Importaciones'} <span class="flow-key exports"></span>${lang === 'en' ? 'Exports' : 'Exportaciones'}</div>
    <div class="map-flow-list">${list}</div>
    ${hasSelection ? '' : `<div class="map-legend-note">${lang === 'en' ? 'Select a country to focus its partner flows.' : 'Selecciona un país para enfocar sus socios.'}</div>`}
  `);
}

// Touch devices have no hover, so the floating tooltip never showed a single
// value on a phone: the tap only selected the country. On a coarse pointer we
// pin the tooltip to the bottom of the map as a card that stays until the next
// tap, with a close button of its own.
function isCoarsePointer() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function anchorTooltip() {
  const node = _tooltip.node();
  if (!node) return;
  _tooltip.classed('anchored', true);
  node.style.left = '';
  node.style.top = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'map-tooltip-close';
  btn.setAttribute('aria-label', State.get('language') === 'en' ? 'Close' : 'Cerrar');
  btn.textContent = '×';
  btn.addEventListener('click', event => { event.stopPropagation(); hideTooltip(); });
  node.appendChild(btn);
}

function placeTooltip(event) {
  if (isCoarsePointer()) anchorTooltip();
  else moveTooltip(event);
}

function showTooltip(event, d) {
  const iso = getISO3(d);
  const key = featureDataKey(d);
  const name = _currentScope === 'world'
    ? (State.get('language') === 'en' ? 'World' : 'Mundo')
    : _currentScope === 'region'
      ? (key || '')
      : ((_currentCountryNames && _currentCountryNames[iso]) || (_countryNames && _countryNames[iso]) || (d.properties && d.properties.name) || iso || '');
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  let v = null;
  if (key && metric) v = valueFor(_currentData || _aggregates, key, metric, State.get('currentYear'));
  // The year belongs in the card: on a phone the pinned card is often read
  // without the timeline in view.
  const year = State.get('currentYear');
  _tooltip.html(`<strong>${name}</strong>${metric ? metric.labelText : ''}: ${formatVal(v)}${metric ? ' ' + metric.unit : ''}<em class="map-tooltip-year">${year}</em>`);
  _tooltip.classed('visible', true);
  placeTooltip(event);
}
function showRegionTooltip(event, d, metric) {
  const region = d.properties.region;
  const v = valueFor(_currentData, region, metric, State.get('currentYear'));
  _tooltip.html(`<strong>${region}</strong>${metric.labelText}: ${formatVal(v)} ${metric.unit}<em class="map-tooltip-year">${State.get('currentYear')}</em>`);
  _tooltip.classed('visible', true);
  placeTooltip(event);
}
function moveTooltip(event) {
  if (_tooltip.classed('anchored')) return;
  const container = document.getElementById('map-container').getBoundingClientRect();
  const x = event.clientX - container.left + 12;
  const y = event.clientY - container.top + 12;
  _tooltip.style('left', `${x}px`).style('top', `${y}px`);
}
function hideTooltip() { _tooltip.classed('visible', false).classed('anchored', false); }


// --- CSV export -------------------------------------------------------------
// Exports the choropleth exactly as painted: same indicator, same year, same
// crop filter, same geographic scope. On the trade map it exports the arcs.
function mapExportRows() {
  const lang = State.get('language');
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, lang);
  if (!metric) return null;
  const year = State.get('currentYear');

  if (metric.source === 'bilateral_trade') {
    if (!_tradeFlowRows || !_tradeFlowRows.length) return null;
    const meta = _tradeExportMeta || {};
    const names = meta.names || {};
    const rows = _tradeFlowRows.map(row => ({
      origen: names[row.source] || row.source,
      origen_iso3: row.source,
      destino: names[row.target] || row.target,
      destino_iso3: row.target,
      registrado_como: row.flow === 'imports'
        ? (lang === 'en' ? 'import' : 'importacion')
        : (lang === 'en' ? 'export' : 'exportacion'),
      anio: meta.year ?? year,
      producto: meta.product || '',
      toneladas: row.tonnes,
      horas: row.hours ?? '',
    }));
    return { rows, indicator: State.get('activeIndicator'), view: 'mapa_comercio' };
  }

  const data = _currentData || _aggregates;
  if (!data) return null;
  const names = _currentCountryNames || _countryNames || {};
  const scope = _currentScope === 'region'
    ? (lang === 'en' ? 'region' : 'region')
    : _currentScope === 'world'
      ? (lang === 'en' ? 'world' : 'mundo')
      : (lang === 'en' ? 'country' : 'pais');
  const cropFilter = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  const rows = [];
  for (const key of Object.keys(data)) {
    const value = valueFor(data, key, metric, year);
    if (value == null || !isFinite(value)) continue;
    rows.push({
      territorio: _currentScope === 'country' ? (names[key] || key) : key,
      codigo: _currentScope === 'country' ? key : '',
      ambito: scope,
      anio: year,
      indicador: metric.labelText,
      valor: value,
      unidad: metric.unit,
      categoria_cultivo: cropFilter ? formatCategoryLabel(cropFilter, lang) : (lang === 'en' ? 'all production' : 'toda la produccion'),
    });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => (b.valor || 0) - (a.valor || 0));
  return { rows, indicator: State.get('activeIndicator'), view: 'mapa' };
}

registerExport('map', mapExportRows);
