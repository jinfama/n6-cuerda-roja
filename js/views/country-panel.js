// Country profile view: cross-indicator dashboard for one selected country.

import { State } from '../state.js';
import { DataLoader } from '../data-loader.js?v=20260522-tildes1';
import { escapeHtml, formatCategoryLabel, normalizeSearchText } from '../labels.js';
import { bindSvgTooltip, wireTextTooltips } from '../chart-tooltip.js?v=20260522-hover1';

let _root;
let _token = 0;
let _countryList = null;
let _globeFeatures = null;
let _globeIsoMap = null;
let _globeCountryNames = {};
const _globeAnimations = new Map();
let _countryLabourMode = 'workers';
let _countrySectorMode = 'absolute';
let _countryProductivityMode = 'productivity';

export function initCountryPanelView() {
  _root = document.getElementById('country-panel-container');
  if (!_root) return;
  refresh();
  State.subscribe('activeView', refresh);
  State.subscribe('activeCategory', refresh);
  State.subscribe('selectedCountries', refresh);
  State.subscribe('focusedCountry', refresh);
  State.subscribe('currentYear', refresh);
  State.subscribe('language', refresh);
}

async function refresh() {
  if (!_root || State.get('activeView') !== 'country') return;
  const token = ++_token;
  const lang = State.get('language');
  const iso = (State.get('selectedCountries') || [])[0] || State.get('focusedCountry');
  try {
    const [countries] = await Promise.all([loadCountryList(), loadGlobeFeatures()]);
    if (token !== _token) return;
    if (!iso) {
      renderSelector(countries, lang);
      return;
    }
    const year = State.get('currentYear');
    const [agg, footprint, bilateralIndex, bilateralYear, categories] = await Promise.all([
      DataLoader.loadCountryYearIndicators(),
      DataLoader.loadTradeFootprintFlows(),
      DataLoader.loadBilateralIndex(),
      DataLoader.loadBilateralYear(year),
      DataLoader.loadCountryCategories(iso).catch(() => null),
    ]);
    if (token !== _token) return;
    const countryName = bilateralIndex.countries?.[iso] || agg.country_names?.[iso] || footprint.country_names?.[iso] || iso;
    const coreSeries = agg.data?.[iso] || {};
    const fpSeries = footprint.data?.[iso] || {};
    const biCountry = bilateralYear.countries?.[iso] || null;
    const categoryRows = topCategoryRows(categories, year, lang);
    renderProfile({ iso, countryName, year, coreSeries, fpSeries, biCountry, bilateralIndex, categoryRows, countries, lang, globalSeries: agg.data || {} });
  } catch (e) {
    console.warn('[country-panel] failed', e);
    _root.innerHTML = `<div class="country-empty"><strong>${lang === 'en' ? 'Could not load country profile.' : 'No se pudo cargar el panel del país.'}</strong></div>`;
  }
}

async function loadCountryList() {
  if (_countryList) return _countryList;
  const [idx, agg] = await Promise.all([
    DataLoader.loadCategoriesIndex(),
    DataLoader.loadCountryYearIndicators().catch(() => null),
  ]);
  const byIso = new Map();
  for (const c of idx.countries || []) byIso.set(c.iso3, { iso3: c.iso3, country: c.country });
  for (const [iso3, country] of Object.entries(agg?.country_names || {})) {
    if (!byIso.has(iso3)) byIso.set(iso3, { iso3, country });
  }
  _countryList = [...byIso.values()].sort((a, b) => a.country.localeCompare(b.country));
  return _countryList;
}

async function loadGlobeFeatures() {
  if (_globeFeatures) return _globeFeatures;
  const [topo, iso, agg] = await Promise.all([
    DataLoader.loadWorldTopo(),
    DataLoader.loadIsoMapping(),
    DataLoader.loadCountryYearIndicators().catch(() => null),
  ]);
  _globeIsoMap = iso.mapping || {};
  _globeCountryNames = agg?.country_names || {};
  const obj = topo.objects?.countries || topo.objects?.[Object.keys(topo.objects || {})[0]];
  _globeFeatures = topojson.feature(topo, obj).features
    .filter(feature => !isAntarcticFeature(feature))
    .map(feature => {
      const iso3 = globeISO3(feature);
      return {
        ...feature,
        properties: {
          ...(feature.properties || {}),
          iso3,
          name: _globeCountryNames[iso3] || feature.properties?.name || iso3,
        },
      };
    })
    .filter(feature => feature.properties.iso3);
  return _globeFeatures;
}

function renderSelector(countries, lang) {
  const labels = lang === 'en'
    ? {
      title: 'Select a country',
      lead: 'Search a country or rotate the globe and select it directly.',
      search: 'Search country...',
    }
    : {
      title: 'Selecciona un país',
      lead: 'Busca un país o gira el globo y selecciónalo directamente.',
      search: 'Buscar país...',
    };
  _root.innerHTML = `
    <section class="country-selector-screen">
      <div class="country-selector-copy">
        <div class="country-kicker">${escapeHtml(lang === 'en' ? 'Country profile' : 'Panel país')}</div>
        <h2>${escapeHtml(labels.title)}</h2>
        <p>${escapeHtml(labels.lead)}</p>
        <div class="country-selector-search">
          <input type="text" id="country-profile-search" placeholder="${escapeHtml(labels.search)}" autocomplete="off">
          <div class="country-search-results" id="country-profile-list"></div>
        </div>
      </div>
      <div class="country-globe-shell country-globe-shell-large" id="country-selector-globe" aria-label="${escapeHtml(labels.title)}"></div>
    </section>
  `;
  wireCountrySearch(countries, 'country-profile-search', 'country-profile-list', 6);
  drawCountryGlobe('country-selector-globe', null, { large: true, spin: true });
}

function renderProfile(ctx) {
  const { iso, countryName, year, coreSeries, fpSeries, biCountry, bilateralIndex, categoryRows, countries, lang, globalSeries } = ctx;
  const labels = lang === 'en'
    ? {
      profile: 'Country profile',
      search: 'Change country...',
      dataYear: 'selected year',
      labour: 'Agrarian labour',
      labourWorkers: 'Workers',
      labourHours: 'Hours',
      sector: 'By sector',
      sectorAbsolute: 'Absolute',
      sectorShare: 'Share',
      productivity: 'Productivity',
      productivityMode: 'Productivity',
      intensityMode: 'Intensity',
      footprint: 'Labour footprint and flows',
      conditions: 'Labour conditions',
      categories: 'Main categories',
      yearData: 'Year data',
      partners: 'Trade partners',
      categoryUnit: 'Main categories by embedded hours; tonnes as context',
      yearDataUnit: 'Selected or nearest available year',
      partnerUnit: 'Embedded labour hours (h/year); tonnes as context',
      imp: 'Imports',
      exp: 'Exports',
      noTrade: 'No bilateral flows for the selected year.',
      categoriesSubhead: 'Categories',
    }
    : {
      profile: 'Panel país',
      search: 'Cambiar país...',
      dataYear: 'año seleccionado',
      labour: 'Trabajo agrario',
      labourWorkers: 'Trabajadores',
      labourHours: 'Horas',
      sector: 'Trab. por sector',
      sectorAbsolute: 'Absoluto',
      sectorShare: 'Porcentaje',
      productivity: 'Productividad',
      productivityMode: 'Productividad',
      intensityMode: 'Intensidad',
      footprint: 'Huellas y flujos laborales',
      conditions: 'Condiciones laborales',
      categories: 'Categorías principales',
      yearData: 'Datos del año',
      partners: 'Socios comerciales',
      categoryUnit: 'Categorías principales por horas embebidas; toneladas como contexto',
      yearDataUnit: 'Año seleccionado o año disponible más cercano',
      partnerUnit: 'Horas laborales embebidas (h/año); toneladas como contexto',
      imp: 'Importaciones',
      exp: 'Exportaciones',
      noTrade: 'No hay flujos bilaterales para el año seleccionado.',
      categoriesSubhead: 'Categorías',
    };

  _root.innerHTML = `
    <section class="country-dashboard">
      <aside class="country-id-card">
        <div class="country-id-top">
          <div>
            <div class="country-kicker">${escapeHtml(labels.profile)} · ${escapeHtml(iso)}</div>
            <h2>${escapeHtml(countryName)}</h2>
          </div>
          <div class="country-year-chip">
            <strong>${escapeHtml(String(year))}</strong>
            <span>${escapeHtml(labels.dataYear)}</span>
          </div>
        </div>
        <div class="country-id-bottom">
          <div class="country-inline-search">
            <input type="text" id="country-profile-inline-search" placeholder="${escapeHtml(labels.search)}" autocomplete="off">
            <div class="country-search-results country-search-results-inline" id="country-profile-inline-list"></div>
          </div>
          <div class="country-globe-shell country-globe-shell-small" id="country-profile-globe"></div>
          ${renderIdentityStats(coreSeries, year, lang)}
        </div>
      </aside>

      <article class="country-card country-chart-card country-labour-card">
        <div class="country-card-head">
          <h3>${escapeHtml(labels.labour)}</h3>
          <div class="country-card-toggle" role="group">
            <button type="button" class="${_countryLabourMode === 'workers' ? 'active' : ''}" data-country-labour-mode="workers">${escapeHtml(labels.labourWorkers)}</button>
            <button type="button" class="${_countryLabourMode === 'hours' ? 'active' : ''}" data-country-labour-mode="hours">${escapeHtml(labels.labourHours)}</button>
          </div>
        </div>
        <div class="country-chart-body" id="country-labour-chart"></div>
      </article>

      <article class="country-card country-chart-card country-footprint-card">
        <div class="country-card-head">
          <h3>${escapeHtml(labels.footprint)}</h3>
        </div>
        ${renderFootprintLegend(lang)}
        <div class="country-chart-body" id="country-footprint-chart"></div>
      </article>

      <article class="country-card country-chart-card country-productivity-card">
        <div class="country-card-head">
          <h3>${escapeHtml(labels.productivity)}</h3>
          <div class="country-card-toggle" role="group">
            <button type="button" class="${_countryProductivityMode === 'productivity' ? 'active' : ''}" data-country-productivity-mode="productivity">${escapeHtml(labels.productivityMode)}</button>
            <button type="button" class="${_countryProductivityMode === 'intensity' ? 'active' : ''}" data-country-productivity-mode="intensity">${escapeHtml(labels.intensityMode)}</button>
          </div>
        </div>
        <div class="country-chart-body" id="country-productivity-chart"></div>
      </article>

      <article class="country-card country-conditions-card">
        <div class="country-card-head">
          <h3>${escapeHtml(labels.conditions)}</h3>
        </div>
        ${renderConditionsPanel(coreSeries, globalSeries, year, lang)}
      </article>

      <article class="country-card country-categories-card">
        <div class="country-card-head">
          <h3>${escapeHtml(labels.yearData)}</h3>
        </div>
        <div class="country-card-unit">${escapeHtml(labels.yearDataUnit)}</div>
        ${renderYearDataPanel(coreSeries, fpSeries, categoryRows, year, labels, lang)}
      </article>

      <article class="country-card country-partners-card">
        <div class="country-card-head">
          <h3>${escapeHtml(labels.partners)}</h3>
        </div>
        <div class="country-card-unit">${escapeHtml(labels.partnerUnit)}</div>
        ${renderPartners(biCountry, bilateralIndex, labels, lang)}
      </article>
    </section>
  `;
  wireCountrySearch(countries, 'country-profile-inline-search', 'country-profile-inline-list', 6);
  drawCountryGlobe('country-profile-globe', iso, { large: false, spin: false });
  wireDashboardControls(ctx);
  wireTextTooltips(_root);
  requestAnimationFrame(() => renderCountryCharts(ctx));
}

function wireDashboardControls(ctx) {
  document.querySelectorAll('[data-country-labour-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      _countryLabourMode = btn.dataset.countryLabourMode || 'workers';
      renderProfile(ctx);
    });
  });
  document.querySelectorAll('[data-country-sector-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      _countrySectorMode = btn.dataset.countrySectorMode || 'absolute';
      renderProfile(ctx);
    });
  });
  document.querySelectorAll('[data-country-productivity-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      _countryProductivityMode = btn.dataset.countryProductivityMode || 'productivity';
      renderProfile(ctx);
    });
  });
}

function renderCountryCharts(ctx) {
  const { coreSeries, fpSeries, year, lang } = ctx;
  const isEn = lang === 'en';
  const labourField = _countryLabourMode === 'hours' ? 'hours_total' : 'workers';
  renderLineChart('country-labour-chart', [{
    label: _countryLabourMode === 'hours'
      ? (isEn ? 'Hours' : 'Horas')
      : (isEn ? 'Workers' : 'Trab.'),
    unit: _countryLabourMode === 'hours' ? 'h/año' : (isEn ? 'people' : 'personas'),
    color: '#214B52',
    points: pointsFromField(coreSeries, labourField),
  }], { year });

  const productivityIsInverse = _countryProductivityMode === 'productivity';
  renderLineChart('country-productivity-chart', [{
    label: productivityIsInverse
      ? (isEn ? 'Productivity' : 'Prod.')
      : (isEn ? 'Intensity' : 'Intensidad'),
    unit: productivityIsInverse ? 't / 1k h' : 'h/t',
    color: productivityIsInverse ? '#2F4D63' : '#A5534E',
    points: pointsFromField(coreSeries, 'h_per_tonne', v => {
      const n = +v;
      if (!isFinite(n) || n <= 0) return null;
      return productivityIsInverse ? 1000 / n : n;
    }),
  }], { year });

  renderLineChart('country-footprint-chart', [
    { field: 'footprint', label: isEn ? 'Footprint' : 'Huella', color: '#214B52' },
    { field: 'production', label: isEn ? 'Production' : 'Producción', color: '#62735A' },
    { field: 'imports', label: isEn ? 'Imports' : 'Import.', color: '#72B9C7' },
    { field: 'exports', label: isEn ? 'Exports' : 'Export.', color: '#D49B8D' },
  ].map(d => ({
    label: d.label,
    unit: 'h/año',
    color: d.color,
    points: pointsFromField(fpSeries, d.field),
  })), { year, right: 18, endLabels: false });
}

function renderFootprintLegend(lang) {
  const isEn = lang === 'en';
  const rows = [
    ['#214B52', isEn ? 'Footprint' : 'Huella'],
    ['#62735A', isEn ? 'Production' : 'Producción'],
    ['#72B9C7', isEn ? 'Imports' : 'Importaciones'],
    ['#D49B8D', isEn ? 'Exports' : 'Exportaciones'],
  ];
  return `
    <div class="country-chart-legend">
      ${rows.map(([color, label]) => `
        <span><i style="background:${color}"></i>${escapeHtml(label)}</span>
      `).join('')}
    </div>
  `;
}

function wireCountrySearch(countries, inputId, listId, limit) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  function paint(filter) {
    const f = normalizeSearchText(filter || '');
    if (f.length < 2) {
      list.innerHTML = '';
      list.classList.remove('visible');
      return [];
    }
    const rows = countries
      .filter(c => !f || normalizeSearchText(`${c.country} ${c.iso3}`).includes(f))
      .slice(0, limit);
    list.innerHTML = rows.map(c => `
      <button type="button" class="country-selector-row" data-iso="${escapeHtml(c.iso3)}">
        <span>${escapeHtml(c.country)}</span><small>${escapeHtml(c.iso3)}</small>
      </button>
    `).join('');
    list.classList.toggle('visible', rows.length > 0);
    list.querySelectorAll('[data-iso]').forEach(btn => {
      btn.addEventListener('click', () => State.focusCountry(btn.dataset.iso));
    });
    return rows;
  }
  paint(input.value);
  input.addEventListener('input', () => paint(input.value));
  input.addEventListener('focus', () => paint(input.value));
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const rows = paint(input.value);
    if (rows && rows[0]) State.focusCountry(rows[0].iso3);
  });
}

function drawCountryGlobe(containerId, selectedIso, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container || !_globeFeatures?.length || typeof d3 === 'undefined') return;
  if (_globeAnimations.has(containerId)) cancelAnimationFrame(_globeAnimations.get(containerId));
  _globeAnimations.delete(containerId);

  const rect = container.getBoundingClientRect();
  const width = Math.max(260, Math.round(rect.width || container.clientWidth || (opts.large ? 620 : 220)));
  const height = Math.max(220, Math.round(rect.height || container.clientHeight || width));
  const size = Math.min(width, height);
  const selectedFeature = selectedIso ? _globeFeatures.find(f => f.properties.iso3 === selectedIso) : null;
  const centroid = selectedFeature ? d3.geoCentroid(selectedFeature) : null;
  let rotation = centroid ? [-centroid[0], -centroid[1], 0] : [-12, -18, 0];

  const projection = d3.geoOrthographic()
    .translate([width / 2, height / 2])
    .scale(size * (opts.large ? 0.47 : 0.46))
    .clipAngle(90)
    .precision(0.5)
    .rotate(rotation);
  const path = d3.geoPath(projection);
  const graticule = d3.geoGraticule10();
  const svg = d3.select(container).html('').append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Globo de selección de país');

  svg.append('path')
    .datum({ type: 'Sphere' })
    .attr('class', 'country-globe-ocean')
    .attr('d', path);
  svg.append('path')
    .datum(graticule)
    .attr('class', 'country-globe-graticule')
    .attr('d', path);
  const countries = svg.append('g')
    .selectAll('path')
    .data(_globeFeatures)
    .join('path')
    .attr('class', d => `country-globe-country ${d.properties.iso3 === selectedIso ? 'selected' : ''}`)
    .attr('d', path)
    .on('mouseenter', function () { d3.select(this).classed('hovered', true); })
    .on('mouseleave', function () { d3.select(this).classed('hovered', false); })
    .on('click', (event, d) => {
      event.stopPropagation();
      if (d.properties.iso3) State.focusCountry(d.properties.iso3);
    });
  countries.append('title').text(d => d.properties.name || d.properties.iso3);

  function repaint() {
    projection.rotate(rotation);
    svg.select('.country-globe-ocean').attr('d', path);
    svg.select('.country-globe-graticule').attr('d', path);
    countries.attr('d', path);
  }

  let spin = !!opts.spin;
  function tick() {
    if (!spin || !document.body.contains(container)) return;
    rotation = [rotation[0] + 0.035, rotation[1], rotation[2]];
    repaint();
    _globeAnimations.set(containerId, requestAnimationFrame(tick));
  }
  if (spin) _globeAnimations.set(containerId, requestAnimationFrame(tick));

  let startRotation;
  let startPointer;
  svg.call(d3.drag()
    .on('start', event => {
      spin = false;
      if (_globeAnimations.has(containerId)) cancelAnimationFrame(_globeAnimations.get(containerId));
      startRotation = rotation.slice();
      startPointer = [event.x, event.y];
      container.classList.add('dragging');
    })
    .on('drag', event => {
      const dx = event.x - startPointer[0];
      const dy = event.y - startPointer[1];
      rotation = [
        startRotation[0] + dx * 0.42,
        Math.max(-55, Math.min(55, startRotation[1] - dy * 0.36)),
        0,
      ];
      repaint();
    })
    .on('end', () => container.classList.remove('dragging')));
}

function globeISO3(feature) {
  if (!_globeIsoMap) return null;
  const raw = String(feature.id);
  return _globeIsoMap[raw] || _globeIsoMap[raw.replace(/^0+/, '')] || null;
}

function isAntarcticFeature(feature) {
  const name = feature?.properties?.name || feature?.properties?.NAME || '';
  return name === 'Antarctica' || name === 'Fr. S. Antarctic Lands';
}

function card(series, requested, field, label, unit) {
  const hit = nearestValue(series, requested, field);
  return { label, value: fmt(hit?.value), unit, year: hit?.year || null };
}

function nearestValue(series, requested, field) {
  const rows = Object.entries(series || {})
    .map(([year, row]) => ({ year: +year, value: row?.[field] }))
    .filter(d => d.value != null && isFinite(+d.value))
    .sort((a, b) => Math.abs(a.year - requested) - Math.abs(b.year - requested));
  return rows[0] || null;
}

function nearestYear(series, requested) {
  const years = Object.keys(series || {}).map(Number).sort((a, b) => a - b);
  if (!years.length) return null;
  if (years.includes(+requested)) return +requested;
  return years.reduce((best, y) => Math.abs(y - requested) < Math.abs(best - requested) ? y : best, years[0]);
}

function topCategoryRows(categories, requestedYear, lang) {
  const exact = (categories?.rows || []).filter(r => +r.year === +requestedYear);
  const fallbackYear = exact.length ? requestedYear : nearestYear(indexRowsByYear(categories?.rows || []), requestedYear);
  const source = (categories?.rows || []).filter(r => +r.year === +fallbackYear);
  return source
    .filter(r => isFinite(+r.hours_total) && +r.hours_total > 0)
    .sort((a, b) => (+b.hours_total || 0) - (+a.hours_total || 0))
    .slice(0, 8)
    .map(r => ({
      label: formatCategoryLabel(r.category_labor, lang),
      value: +r.hours_total || 0,
      tonnes: +r.production_tonnes || null,
    }));
}

function indexRowsByYear(rows) {
  const out = {};
  for (const row of rows || []) {
    if (!out[row.year]) out[row.year] = true;
  }
  return out;
}

function renderIdentityStats(coreSeries, year, lang) {
  const isEn = lang === 'en';
  const workers = nearestValue(coreSeries, year, 'workers');
  const hours = nearestValue(coreSeries, year, 'hours_total');
  const rows = [
    {
      label: isEn ? 'Agricultural workers' : 'Trabajadores agrarios',
      value: workers?.value,
      unit: isEn ? 'people' : 'personas',
      year: workers?.year,
    },
    {
      label: isEn ? 'Agricultural hours' : 'Horas agrarias',
      value: hours?.value,
      unit: 'h/año',
      year: hours?.year,
    },
  ];
  return `
    <div class="country-id-stats">
      ${rows.map(d => `
        <div>
          <span>${escapeHtml(d.label)}</span>
          <strong>${escapeHtml(fmt(d.value))}</strong>
          <small>${escapeHtml(d.unit)}${d.year ? ` · ${escapeHtml(String(d.year))}` : ''}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderYearDataPanel(coreSeries, fpSeries, categoryRows, year, labels, lang) {
  const isEn = lang === 'en';
  const hPerTonne = nearestValue(coreSeries, year, 'h_per_tonne');
  const productivity = hPerTonne && +hPerTonne.value > 0
    ? { year: hPerTonne.year, value: 1000 / +hPerTonne.value }
    : null;
  const area = nearestValue(coreSeries, year, 'area_ha') || nearestValue(coreSeries, year, 'area_harvested');
  const kpis = [
    {
      label: isEn ? 'Workers' : 'Trabajadores',
      hit: nearestValue(coreSeries, year, 'workers'),
      unit: isEn ? 'people' : 'personas',
    },
    {
      label: isEn ? 'Hours' : 'Horas',
      hit: nearestValue(coreSeries, year, 'hours_total'),
      unit: 'h/año',
    },
    {
      label: isEn ? 'Production' : 'Producción',
      hit: nearestValue(coreSeries, year, 'production_tonnes'),
      unit: 't',
    },
    {
      label: isEn ? 'Area' : 'Superficie',
      hit: area,
      unit: 'ha',
    },
    {
      label: isEn ? 'Productivity' : 'Productividad',
      hit: productivity,
      unit: 't/1k h',
    },
    {
      label: isEn ? 'Footprint' : 'Huella',
      hit: nearestValue(fpSeries, year, 'footprint'),
      unit: 'h/año',
    },
  ].filter(d => d.hit?.value != null && isFinite(+d.hit.value));

  return `
    <div class="country-year-kpis">
      ${kpis.map(d => `
        <div class="country-year-kpi" title="${escapeHtml(d.label)} · ${escapeHtml(fmt(d.hit.value))} ${escapeHtml(d.unit)} · ${escapeHtml(String(d.hit.year || year))}">
          <span>${escapeHtml(d.label)}</span>
          <strong>${escapeHtml(fmt(d.hit.value))}</strong>
          <small>${escapeHtml(d.unit)}${d.hit.year ? ` · ${escapeHtml(String(d.hit.year))}` : ''}</small>
        </div>
      `).join('')}
    </div>
    <div class="country-year-subhead">
      <span>${escapeHtml(labels.categoriesSubhead)}</span>
      <small>${escapeHtml(labels.categoryUnit)}</small>
    </div>
    ${renderBars(categoryRows)}
  `;
}

function renderSectorPanel(coreSeries, year, lang) {
  const isEn = lang === 'en';
  const workers = nearestValue(coreSeries, year, 'workers');
  const hours = nearestValue(coreSeries, year, 'hours_total');
  const note = isEn
    ? 'Sector shares need total employment by sector. The current files provide agricultural work only.'
    : 'El porcentaje sectorial requiere empleo total por sectores. En los archivos actuales está el trabajo agrario.';
  if (_countrySectorMode === 'share') {
    return `
      <div class="country-sector-body">
        <div class="country-sector-empty">
          <strong>${escapeHtml(isEn ? 'Share pending' : 'Porcentaje pendiente')}</strong>
          <span>${escapeHtml(note)}</span>
        </div>
      </div>
    `;
  }
  const workerValue = workers?.value || null;
  const hourValue = hours?.value || null;
  return `
    <div class="country-sector-body">
      <div class="country-sector-row">
        <span>${escapeHtml(isEn ? 'Agricultural workers' : 'Trabajadores agrarios')}</span>
        <strong>${escapeHtml(fmt(workerValue))}</strong>
        <small>${escapeHtml(isEn ? 'people' : 'personas')}${workers?.year ? ` · ${escapeHtml(String(workers.year))}` : ''}</small>
        <div><i style="width:${workerValue ? 100 : 0}%"></i></div>
      </div>
      <div class="country-sector-row country-sector-row-secondary">
        <span>${escapeHtml(isEn ? 'Agricultural hours' : 'Horas agrarias')}</span>
        <strong>${escapeHtml(fmt(hourValue))}</strong>
        <small>h/año${hours?.year ? ` · ${escapeHtml(String(hours.year))}` : ''}</small>
        <div><i style="width:${hourValue ? 100 : 0}%"></i></div>
      </div>
    </div>
  `;
}

function renderConditionsPanel(coreSeries, globalSeries, year, lang) {
  const isEn = lang === 'en';
  const rows = [
    { field: 'monthly_wage', label: isEn ? 'Monthly wage' : 'Salario mensual', unit: 'USD-PPP' },
    { field: 'va_per_worker', label: isEn ? 'Value added / worker' : 'Valor añadido / trabajador', unit: 'USD' },
    { field: 'pct_child_labor', label: isEn ? 'Child labour' : 'Trabajo infantil', unit: '%', pct: true },
    { field: 'pct_forced_labor', label: isEn ? 'Forced labour' : 'Trabajo forzoso', unit: '%', pct: true },
    { field: 'pct_not_covered', label: isEn ? 'Without social protection' : 'Sin protección social', unit: '%', pct: true },
  ].map(d => ({
    ...d,
    hit: nearestValue(coreSeries, year, d.field),
    global: globalWeightedValue(globalSeries, year, d.field),
  }));
  const available = rows.filter(d => d.hit);
  if (!available.length) return `<div class="country-note">${escapeHtml(isEn ? 'No data.' : 'Sin datos.')}</div>`;
  return `
    <div class="country-condition-legend">
      <span><i class="country"></i>${escapeHtml(isEn ? 'Country' : 'País')}</span>
      <span><i class="global"></i>${escapeHtml(isEn ? 'World average' : 'Promedio global')}</span>
    </div>
    <div class="country-condition-list">
      ${available.map(d => {
        const value = +d.hit.value;
        const compareGlobal = d.global?.value != null && isFinite(+d.global.value);
        const globalValue = compareGlobal ? +d.global.value : null;
        const max = Math.max(Math.abs(value), Math.abs(globalValue || 0), 1);
        const countryWidth = Math.max(2, Math.min(100, Math.abs(value) / max * 100));
        const globalWidth = globalValue == null ? 0 : Math.max(2, Math.min(100, Math.abs(globalValue) / max * 100));
        return `
          <div class="country-condition-row" title="${escapeHtml(d.label)} · ${escapeHtml(fmt(value))} ${escapeHtml(d.unit)} · ${escapeHtml(String(d.hit.year))}">
            <span>${escapeHtml(d.label)}</span>
            <strong>${escapeHtml(fmt(value))}<small>${escapeHtml(d.unit)}</small></strong>
            ${compareGlobal ? `
              <div class="country-condition-compare dual">
                <i class="country" style="width:${countryWidth}%"></i>
                ${globalValue == null ? '' : `<i class="global" style="width:${globalWidth}%"></i>`}
              </div>
              ${globalValue == null ? '' : `<em>${escapeHtml(isEn ? 'World' : 'Global')}: ${escapeHtml(fmt(globalValue))} ${escapeHtml(d.unit)}</em>`}
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function globalWeightedValue(allSeries, year, field) {
  let weightedSum = 0;
  let totalWeight = 0;
  let simpleSum = 0;
  let simpleN = 0;
  for (const series of Object.values(allSeries || {})) {
    const hit = nearestValue(series, year, field);
    if (!hit || hit.value == null || !isFinite(+hit.value)) continue;
    const weight = nearestValue(series, hit.year, 'workers')?.value;
    simpleSum += +hit.value;
    simpleN += 1;
    if (weight != null && isFinite(+weight) && +weight > 0) {
      weightedSum += (+hit.value) * (+weight);
      totalWeight += +weight;
    }
  }
  if (totalWeight > 0) return { value: weightedSum / totalWeight, year };
  if (simpleN > 0) return { value: simpleSum / simpleN, year };
  return null;
}

function pointsFromField(series, field, transform = v => +v) {
  return Object.entries(series || {})
    .map(([year, row]) => {
      const raw = row?.[field];
      const value = raw == null ? null : transform(raw, row, +year);
      return { year: +year, value };
    })
    .filter(d => isFinite(d.year) && d.value != null && isFinite(+d.value))
    .sort((a, b) => a.year - b.year);
}

function renderLineChart(containerId, seriesDefs, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container || typeof d3 === 'undefined') return;
  const defs = (seriesDefs || []).map(d => ({
    ...d,
    points: (d.points || []).filter(p => p.value != null && isFinite(+p.value)),
  })).filter(d => d.points.length);
  if (!defs.length) {
    container.innerHTML = '<div class="country-chart-empty">Sin datos.</div>';
    return;
  }
  const allPoints = defs.flatMap(d => d.points);
  const rect = container.getBoundingClientRect();
  const width = Math.max(260, Math.round(rect.width || container.clientWidth || 420));
  const height = Math.max(135, Math.round(rect.height || container.clientHeight || 190));
  const margin = { top: 12, right: opts.right || 58, bottom: 24, left: 42 };
  const xExtent = d3.extent(allPoints, d => d.year);
  const x = d3.scaleLinear()
    .domain(xExtent[0] === xExtent[1] ? [xExtent[0] - 1, xExtent[1] + 1] : xExtent)
    .range([margin.left, width - margin.right]);
  const xTickValues = countryYearTicks(x.domain()[0], x.domain()[1], width - margin.left - margin.right);
  const values = allPoints.map(d => +d.value);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  yMin = yMin < 0 ? yMin : 0;
  if (yMin === yMax) {
    yMax = yMax || 1;
    if (yMin < 0) yMin *= 1.05;
  }
  const y = d3.scaleLinear()
    .domain([yMin, yMax * (yMax >= 0 ? 1.06 : 0.94)])
    .nice(4)
    .range([height - margin.bottom, margin.top]);
  const line = d3.line()
    .defined(d => d.value != null && isFinite(+d.value))
    .x(d => x(d.year))
    .y(d => y(+d.value));
  const svg = d3.select(container).html('').append('svg')
    .attr('class', 'country-profile-chart')
    .attr('viewBox', `0 0 ${width} ${height}`);

  svg.append('g')
    .attr('class', 'country-chart-grid')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickValues(xTickValues).tickFormat(d3.format('d')).tickSize(-(height - margin.top - margin.bottom)))
    .call(g => g.select('.domain').remove());
  svg.append('g')
    .attr('class', 'country-chart-axis')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3).tickFormat(formatAxis).tickSizeOuter(0))
    .call(g => g.select('.domain').remove());
  svg.append('g')
    .attr('class', 'country-chart-axis country-chart-axis-x')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickValues(xTickValues).tickFormat(d3.format('d')).tickSizeOuter(0))
    .call(g => g.select('.domain').remove());

  const currentYear = +opts.year;
  if (isFinite(currentYear) && currentYear >= x.domain()[0] && currentYear <= x.domain()[1]) {
    svg.append('line')
      .attr('class', 'country-chart-year')
      .attr('x1', x(currentYear))
      .attr('x2', x(currentYear))
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom);
  }

  const primaryFocus = nearestPoint(defs[0].points, currentYear);
  if (primaryFocus) {
    container.insertAdjacentHTML('beforeend', `
      <div class="country-chart-current">
        <span>${escapeHtml(String(primaryFocus.year))}</span>
        <strong>${escapeHtml(fmt(primaryFocus.value))}</strong>
        <small>${escapeHtml(defs[0].unit || '')}</small>
      </div>
    `);
  }

  defs.forEach(def => {
    const color = def.color || '#214B52';
    svg.append('path')
      .datum(def.points)
      .attr('class', 'country-chart-line')
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('d', line);
    const last = def.points[def.points.length - 1];
    if (opts.endLabels !== false) {
      svg.append('text')
        .attr('class', 'country-chart-label')
        .attr('x', Math.min(width - 4, x(last.year) + 6))
        .attr('y', y(last.value))
        .attr('fill', color)
        .attr('dy', '0.32em')
        .text(def.label);
    }
    const focus = nearestPoint(def.points, currentYear);
    if (focus) {
      svg.append('circle')
        .attr('class', 'country-chart-focus')
        .attr('cx', x(focus.year))
        .attr('cy', y(focus.value))
        .attr('r', 3.4)
        .attr('fill', '#fff')
        .attr('stroke', color);
    }
    const hits = svg.append('g')
      .selectAll('circle')
      .data(def.points)
      .join('circle')
      .attr('class', 'country-chart-hit')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.value))
      .attr('r', 7);
    bindSvgTooltip(hits, d => ({
      title: def.label,
      subtitle: String(d.year),
      rows: [{
        label: def.unit || '',
        value: fmt(d.value),
      }],
    }));
    hits
      .append('title')
      .text(d => `${def.label} · ${d.year}: ${fmt(d.value)} ${def.unit || ''}`);
  });
}

function nearestPoint(points, year) {
  if (!points?.length || !isFinite(+year)) return points?.[points.length - 1] || null;
  return points.reduce((best, p) => Math.abs(p.year - year) < Math.abs(best.year - year) ? p : best, points[0]);
}

function countryYearTicks(from, to, width) {
  if (from === to) return [from];
  const span = to - from;
  const approx = Math.min(8, Math.max(3, Math.floor(width / 90)));
  const edgeGap = Math.max(1, Math.ceil(span / 18));
  const ticks = d3.scaleLinear().domain([from, to]).ticks(approx).map(Math.round);
  return [...new Set([from, ...ticks.filter(y => y > from + edgeGap && y < to - edgeGap), to])];
}

function formatAxis(v) {
  const n = +v;
  if (!isFinite(n)) return '';
  if (Math.abs(n) >= 1e9) return `${trimZeros((n / 1e9).toFixed(1))}B`;
  if (Math.abs(n) >= 1e6) return `${trimZeros((n / 1e6).toFixed(1))}M`;
  if (Math.abs(n) >= 1e3) return `${trimZeros((n / 1e3).toFixed(1))}k`;
  if (Math.abs(n) > 0 && Math.abs(n) < 1) return trimZeros(n.toFixed(1));
  return trimZeros(n.toFixed(n % 1 ? 1 : 0));
}

function trimZeros(v) {
  return String(v).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function renderKpiGrid(cards) {
  return `<div class="country-kpi-grid">
    ${cards.map(c => `
      <article class="country-kpi">
        <span>${escapeHtml(c.label)}</span>
        <strong>${escapeHtml(c.value)}</strong>
        <small>${escapeHtml(c.unit)}${c.year ? ` · ${escapeHtml(String(c.year))}` : ''}</small>
      </article>
    `).join('')}
  </div>`;
}

function renderBars(rows) {
  if (!rows.length) return '<div class="country-note">Sin datos.</div>';
  const max = Math.max(...rows.map(r => r.value));
  return `<div class="country-bars">
    ${rows.map(r => `
      <div class="country-bar-row">
        <span>${escapeHtml(r.label)}</span>
        <div><i style="width:${Math.max(2, (r.value / max) * 100)}%"></i></div>
        <strong>
          ${escapeHtml(fmt(r.value))} h
          ${r.tonnes ? `<small>${escapeHtml(fmt(r.tonnes))} t</small>` : ''}
        </strong>
      </div>
    `).join('')}
  </div>`;
}

function renderPartners(country, index, labels, lang) {
  if (!country) return `<div class="country-note">${escapeHtml(labels.noTrade)}</div>`;
  const block = flow => (country[flow]?.partners || []).filter(d => d[0] !== '__other__').slice(0, 4);
  const renderFlow = (flow, title) => {
    const rows = block(flow);
    if (!rows.length) return '';
    const maxHours = Math.max(...rows.map(row => +row[2] || 0), 1);
    return `
      <div class="country-partner-flow">
        <h4>${escapeHtml(title)}</h4>
        ${rows.map(row => `
          <div class="country-partner-row">
            <span>${escapeHtml(index.countries?.[row[0]] || row[0])}</span>
            <strong>${escapeHtml(fmt(row[2]))} h<small>${escapeHtml(fmt(row[1]))} t</small></strong>
            <div><i style="width:${Math.max(3, ((+row[2] || 0) / maxHours) * 100)}%"></i></div>
          </div>
        `).join('')}
      </div>
    `;
  };
  return `
    <div class="country-partners">
      ${renderFlow('imports', labels.imp)}
      ${renderFlow('exports', labels.exp)}
    </div>
  `;
}

function fmt(v) {
  if (v == null || !isFinite(+v)) return '—';
  const n = +v;
  if (Math.abs(n) >= 1e9) return `${trimZeros((n / 1e9).toFixed(1))} B`;
  if (Math.abs(n) >= 1e6) return `${trimZeros((n / 1e6).toFixed(1))} M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  if (Math.abs(n) > 0 && Math.abs(n) < 0.1) return trimZeros(n.toFixed(1));
  if (Math.abs(n) > 0 && Math.abs(n) < 1) return trimZeros(n.toFixed(1));
  if (Number.isInteger(n)) return String(n);
  return trimZeros(n.toFixed(1));
}

