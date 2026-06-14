// Choropleth map view — D3 + TopoJSON world-110m.
// Reads the active indicator from State and paints countries from the
// precomputed country_year_indicators.json bundle.

import { State } from '../state.js';
import { DataLoader } from '../data-loader.js?v=20260522-tildes1';
import { getIndicator } from '../indicators.js?v=20260522-tildes1';
import { escapeHtml, formatCategoryLabel } from '../labels.js';
import { metricValue, resolveMetric, supportsCropCategory } from '../metric.js?v=20260522-tildes1';
import { enrichRegionalData } from '../regional-estimates.js?v=20260522-tildes1';

const PALETTES = {
  workers_hours: ['#edf5f5', '#d7e8ea', '#b8d3d8', '#92b8c0', '#6798a2', '#3f717b', '#21454d'],
  wages:         ['#eef3ef', '#d8e5df', '#b4cdbf', '#88ad9c', '#628b7b', '#3e685f', '#20443f'],
  child_forced:  ['#f8efed', '#e8c7bd', '#d99a86', '#c56b52', '#a44c3c', '#733025', '#3e1712'],
  default:       ['#eef5f5', '#d7e5e6', '#b8ced2', '#8fadb5', '#668991', '#42636b', '#263f46'],
};
const TRADE_COLORS = {
  imports: '#72B9C7',
  exports: '#D49B8D',
};
function paletteFor(ind) {
  if (!ind) return PALETTES.default;
  if (ind.warn) return PALETTES.child_forced;
  if (ind.id === 'monthly_wage' || ind.id === 'va_per_worker') return PALETTES.wages;
  if (ind.id === 'workers' || ind.id === 'hours_total' || ind.id === 'fp_hours_total') return PALETTES.workers_hours;
  return PALETTES.default;
}

function scaleFor(values, palette) {
  const ext = d3.extent(values);
  if (ext[0] === ext[1]) {
    const delta = Math.abs(ext[0] || 1) * 0.02 || 1;
    return d3.scaleQuantize().domain([ext[0] - delta, ext[1] + delta]).range(palette);
  }
  if (values.length >= palette.length * 3) {
    return d3.scaleQuantile().domain(values).range(palette);
  }
  return d3.scaleQuantize().domain(ext).range(palette);
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

function formatVal(v) {
  if (v == null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + ' B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + ' M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + ' k';
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
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

function resize() {
  const container = document.getElementById('map-container');
  const W = container.clientWidth;
  const H = container.clientHeight;
  _svg.attr('width', W).attr('height', H);
  const mobile = W <= 700;
  const topPad = mobile ? 54 : 24;
  const bottomPad = mobile ? Math.min(150, Math.max(108, H * 0.18)) : 22;
  const geo = _countries && _countries.length
    ? { type: 'FeatureCollection', features: _countries }
    : { type: 'Sphere' };
  _projection = d3.geoNaturalEarth1().fitExtent([[mobile ? 10 : 20, topPad], [W - (mobile ? 10 : 20), H - bottomPad]], geo);
  _path = d3.geoPath(_projection);
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
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove',  (event)    => moveTooltip(event))
      .on('mouseleave', () => hideTooltip())
      .on('click', (event, d) => {
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

async function paint() {
  const token = ++_paintToken;
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  if (!metric) return;
  if (metric.source === 'bilateral_trade') {
    await paintTradeMap(metric);
    return;
  }
  clearTradeLayer();
  // Indicators sourced from footprints/conditions live in other files for now.
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
    _g.selectAll('path.country-path').style('fill', '#DCE8E9');
    d3.select('#map-legend').html('');
    return;
  }
  const scale = scaleFor(values, palette);

  if (scope === 'region') {
    paintRegionMap(data, metric, year, values, palette, scale, category);
    return;
  }

  clearRegionLayer();
  _g.selectAll('path.country-path').style('display', null);
  _g.selectAll('path.country-path').style('fill', d => {
    const key = featureDataKey(d);
    if (!key) return '#DCE8E9';
    const v = valueFor(data, key, metric, year);
    return (v == null || !isFinite(v)) ? '#DCE8E9' : scale(v);
  });

  paintSelection();
  paintLegend(values, palette, metric, scale, category);
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
      .style('fill', d => {
        const v = d.properties.value;
        return (v == null || !isFinite(v)) ? '#DCE8E9' : scale(v);
      })
      .on('mouseenter', (event, d) => showRegionTooltip(event, d, metric))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', () => hideTooltip())
      .on('click', (event, d) => State.toggleRegion(d.properties.region));

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
  paintLegend(values, palette, metric, scale, category);
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

function paintLegend(values, palette, metric, scale, category) {
  const box = d3.select('#map-legend');
  if (!box.node()) return;
  const ext = d3.extent(values);
  const lang = State.get('language');
  const stops = palette.map(c => `<span class="map-legend-cell" style="background:${c};"></span>`).join('');
  box.html(`
    <div class="map-legend-title">${metric.labelText} <span style="opacity:0.62">(${metric.unit})</span></div>
    ${category ? `<div class="map-legend-filter">${escapeHtml(formatCategoryLabel(category, lang))}</div>` : ''}
    <div class="map-legend-bar">${stops}</div>
    <div class="map-legend-labels">
      <span>${formatVal(ext[0])}</span><span>${formatVal(ext[1])}</span>
    </div>
  `);
}

function clearTradeLayer() {
  _g.selectAll('.trade-arc').remove();
  _g.selectAll('.trade-node').remove();
  _g.selectAll('.trade-label').remove();
  _g.selectAll('.trade-focus-ring').remove();
  d3.select('#map-container').selectAll('.trade-map-controls').remove();
}

function tradeMeasureIndex() {
  return 0;
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
      total += +block.total?.[tradeMeasureIndex()] || 0;
    } else {
      const row = (block.products || []).find(d => d[0] === product);
      total += +row?.[tradeMeasureIndex()] || 0;
    }
  }
  return total;
}

function tradePartnerRows(country, flow, product) {
  if (!country) return [];
  const flows = flow === 'both' ? ['imports', 'exports'] : [flow];
  const rows = [];
  for (const f of flows) {
    const block = country[f];
    if (!block) continue;
    const partners = product === '__total__'
      ? (block.partners || [])
      : (block.product_partners?.[product] || []);
    for (const p of partners) {
      rows.push({ flow: f, partner: p[0], tonnes: +p[1] || 0, hours: +p[2] || 0 });
    }
  }
  return rows.filter(d => d.partner && d.partner !== '__other__' && d.tonnes > 0);
}

function directionalTradeRows(countryIso, country, flow, product) {
  return tradePartnerRows(country, flow, product)
    .map(row => ({
      ...row,
      source: row.flow === 'imports' ? row.partner : countryIso,
      target: row.flow === 'imports' ? countryIso : row.partner,
    }))
    .filter(row => row.source && row.target && row.source !== row.target);
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
  const palette = PALETTES.default;
  const scale = values.length ? scaleFor(values, palette) : null;
  _g.selectAll('path.country-path').style('fill', d => {
    const iso = getISO3(d);
    const v = iso ? tradeCountryValue(countries[iso], flow, product) : 0;
    return scale && v > 0 ? scale(v) : '#DCE8E9';
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
  const rawRows = hasSelection
    ? directionalTradeRows(selected, countries[selected], flow, product)
    : globalTradeRows(countries, flow, product, centroids, topN);
  const flowRows = withCurveSides(rawRows
    .filter(row => centroids.has(row.source) && centroids.has(row.target))
    .sort((a, b) => b.tonnes - a.tonnes)
    .slice(0, topN));

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
      const source = index.countries?.[d.source] || d.source;
      const target = index.countries?.[d.target] || d.target;
      const flowLabel = d.flow === 'imports'
        ? (lang === 'en' ? 'reported as import' : 'registrado como importación')
        : (lang === 'en' ? 'reported as export' : 'registrado como exportación');
      _tooltip.html(`<strong>${escapeHtml(source)} &rarr; ${escapeHtml(target)}</strong>${escapeHtml(flowLabel)}<br>${formatVal(d.tonnes)} ${tradeUnit()}${d.hours ? `<br>${formatVal(d.hours)} h` : ''}`);
      _tooltip.classed('visible', true);
      moveTooltip(event);
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave', hideTooltip);

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
  d3.select('#map-legend').html(`
    <div class="map-legend-title">${hasSelection ? escapeHtml(index.countries?.[selected] || selected) : (lang === 'en' ? 'Main world flows' : 'Principales flujos mundiales')}</div>
    <div class="map-legend-filter">${escapeHtml(productTitle)} &middot; ${escapeHtml(flowTitle)} &middot; ${escapeHtml(`Top ${topN}`)}</div>
    <div class="map-flow-keys"><span class="flow-key imports"></span>${lang === 'en' ? 'Imports' : 'Importaciones'} <span class="flow-key exports"></span>${lang === 'en' ? 'Exports' : 'Exportaciones'}</div>
    <div class="map-flow-list">${list}</div>
    ${hasSelection ? '' : `<div class="map-legend-note">${lang === 'en' ? 'Select a country to focus its partner flows.' : 'Selecciona un país para enfocar sus socios.'}</div>`}
  `);
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
  _tooltip.html(`<strong>${name}</strong>${metric ? metric.labelText : ''}: ${formatVal(v)}${metric ? ' ' + metric.unit : ''}`);
  _tooltip.classed('visible', true);
  moveTooltip(event);
}
function showRegionTooltip(event, d, metric) {
  const region = d.properties.region;
  const v = valueFor(_currentData, region, metric, State.get('currentYear'));
  _tooltip.html(`<strong>${region}</strong>${metric.labelText}: ${formatVal(v)} ${metric.unit}`);
  _tooltip.classed('visible', true);
  moveTooltip(event);
}
function moveTooltip(event) {
  const container = document.getElementById('map-container').getBoundingClientRect();
  const x = event.clientX - container.left + 12;
  const y = event.clientY - container.top + 12;
  _tooltip.style('left', `${x}px`).style('top', `${y}px`);
}
function hideTooltip() { _tooltip.classed('visible', false); }

