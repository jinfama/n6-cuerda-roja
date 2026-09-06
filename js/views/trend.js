// Trend view — line chart of selected countries' indicator over time.

import { State } from '../state.js?v=20260906f';
import { DataLoader } from '../data-loader.js?v=20260906f';
import { getIndicator } from '../indicators.js?v=20260906f';
import { formatCategoryLabel } from '../labels.js?v=20260906f';
import { metricValue, resolveMetric, selectedFootprintFlows, supportsCropCategory } from '../metric.js?v=20260906f';
import { enrichRegionalData } from '../regional-estimates.js?v=20260906f';
import { bindSvgTooltip } from '../chart-tooltip.js?v=20260906f';
import { registerExport } from '../export-csv.js?v=20260906f';

const COLORS = ['#214B52', '#A5534E', '#2F4D63', '#B78B55', '#62735A', '#6F4B8B', '#2D7B7C', '#111827'];
// Chart chrome (axis ink, muted labels, rules, grid), aligned with the cover
// tokens in css/styles.css. MUTE used to be #87979A: 2.4:1 on the paper ground.
// The series palette below (COLORS) is a data encoding and is untouched.
const INK = '#20211E';
const MUTE = '#5C5749';
const RULE = '#C2BBAC';
const GRID = '#D7CFBD';

let _svg;
let _aggregates = null;
let _countryNames = null;
let _refreshToken = 0;
let _lastExport = null;   // series currently painted, for the CSV export

export async function initTrendView() {
  _svg = d3.select('#trend-svg');
  try {
    const agg = await DataLoader.loadCountryYearIndicators();
    _aggregates = agg.data;
    _countryNames = agg.country_names || {};
  } catch (e) {
    console.warn('[trend] failed to load aggregates', e);
  }
  refresh();
  State.subscribe('activeCategory',   refresh);
  State.subscribe('activeIndicator',  refresh);
  State.subscribe('functionalUnit',   refresh);
  State.subscribe('productivityLaborInput', refresh);
  State.subscribe('productivityDirection', refresh);
  State.subscribe('selectedCountries',refresh);
  State.subscribe('selectedRegions',  refresh);
  State.subscribe('trendGeoScope',    refresh);
  State.subscribe('footprintFlow',    refresh);
  State.subscribe('footprintFlows',   refresh);
  State.subscribe('footprintTrendMode', refresh);
  State.subscribe('trendLayout',      refresh);
  State.subscribe('trendFacetBy',     refresh);
  State.subscribe('trendMA',          refresh);
  State.subscribe('trendShowLine',    refresh);
  State.subscribe('trendShowBreaks',  refresh);
  State.subscribe('yAxisZero',        refresh);
  State.subscribe('yearRange',        refresh);
  State.subscribe('currentYear',      refresh);
  State.subscribe('animationYear',    refresh);
  State.subscribe('cropCategoryFilter',refresh);
  State.subscribe('activeView',       refresh);
  State.subscribe('language',         refresh);
  window.addEventListener('resize',   refresh);
}

async function activeDataset(ind) {
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  if (!category) {
    return { data: _aggregates, countryNames: _countryNames || {}, category: null };
  }
  const ds = await DataLoader.loadCategorySeries(category);
  return { data: ds.data || {}, countryNames: ds.country_names || _countryNames || {}, category };
}

async function regionDataset(metric) {
  if (metric.source === 'trade_footprint') {
    const fp = await DataLoader.loadTradeFootprintFlows();
    return {
      data: fp.regions || {},
      world: fp.world || {},
      category: null,
    };
  }
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const category = supportsCropCategory(ind) ? State.get('cropCategoryFilter') : null;
  const source = category ? await DataLoader.loadRegionsCategories() : await DataLoader.loadRegions();
  let data = {};
  for (const row of (source.rows || [])) {
    if (category && row.category_labor !== category) continue;
    const region = row.region_un;
    if (!region) continue;
    if (!data[region]) data[region] = {};
    data[region][row.year] = row;
  }
  if (!category) data = await enrichRegionalData(data, metric);
  return { data, world: data.World || {}, category };
}

async function refresh() {
  if (State.get('activeView') !== 'trend') return;
  const token = ++_refreshToken;
  _lastExport = null;

  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, State.get('language'));
  const empty = document.getElementById('trend-empty');

  _svg.selectAll('*').remove();
  if (!metric || !_aggregates) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  const scope = State.get('trendGeoScope');
  const { allSeries, category, chartMetric } = scope === 'country'
    ? await countrySeries(metric)
    : await regionalSeries(metric, scope);
  if (token !== _refreshToken) return;

  if (!allSeries.length) {
    if (empty) {
      empty.style.display = 'flex';
      empty.textContent = 'No hay datos para los países seleccionados en este indicador.';
    }
    return;
  }
  _lastExport = { allSeries, metric: chartMetric || metric, category };
  drawChart(allSeries, chartMetric || metric, category);
}

async function countrySeries(metric) {
  const sel = State.get('selectedCountries');
  if (!sel.length) return { allSeries: [], category: null };
  const ds = metric.source === 'trade_footprint'
    ? await DataLoader.loadTradeFootprintFlows().then(fp => ({ data: fp.data || {}, countryNames: fp.country_names || {}, category: null }))
    : await activeDataset(getIndicator(State.get('activeCategory'), State.get('activeIndicator')));
  const allSeries = sel.flatMap(iso => {
    const series = ds.data[iso] || {};
    return buildMetricSeriesActive(iso, ds.countryNames?.[iso] || iso, series, metric);
  }).filter(s => s.points.length);
  return { allSeries, category: ds.category, chartMetric: trendChartMetricActive(metric) };
}

async function regionalSeries(metric, scope) {
  const ds = await regionDataset(metric);
  const selections = scope === 'world' ? ['World'] : State.get('selectedRegions');
  const allSeries = selections.flatMap(region => {
    const series = region === 'World' ? ds.world : ds.data[region] || {};
    return buildMetricSeriesActive(region, region, series, metric);
  }).filter(s => s.points.length);
  return { allSeries, category: ds.category, chartMetric: trendChartMetricActive(metric) };
}

function buildMetricSeriesActive(iso, country, series, metric) {
  if (metric.source === 'trade_footprint') {
    const lang = State.get('language');
    const scope = State.get('trendGeoScope');
    return selectedFootprintFlows().map(flow => {
      const shortFlow = flow.short?.[lang] || flow.label[lang];
      const code = scope === 'world' ? shortFlow : `${iso} - ${shortFlow}`;
      const flowMetric = { ...metric, field: flow.id, footprintFlow: flow, labelText: flow.metricLabel?.[lang] || flow.label[lang] };
      return {
        ...buildSeries(code, `${country} - ${flowMetric.labelText}`, series, flowMetric),
        territoryKey: iso,
        territoryTitle: country,
        flowKey: flow.id,
        flowTitle: flowMetric.labelText,
        lineLabel: flowMetric.labelText,
      };
    });
  }
  return [{ ...buildSeries(iso, country, series, metric), facetKey: iso, facetTitle: country, lineLabel: country }];
}

function trendChartMetricActive(metric) {
  if (metric.source === 'trade_footprint' && selectedFootprintFlows().length > 1) {
    return {
      ...metric,
      labelText: State.get('language') === 'en' ? 'Annual hours: selected flows' : 'Horas anuales: flujos seleccionados',
    };
  }
  return metric;
}

function buildMetricSeries(iso, country, series, metric) {
  if (metric.source === 'trade_footprint' && State.get('footprintTrendMode') === 'all') {
    const lang = State.get('language');
    const scope = State.get('trendGeoScope');
    return selectedFootprintFlows().map(flow => {
      const shortFlow = flow.short?.[lang] || flow.label[lang];
      const code = scope === 'world' ? shortFlow : `${iso} · ${shortFlow}`;
      const flowMetric = { ...metric, field: flow.id, footprintFlow: flow, labelText: flow.metricLabel?.[lang] || flow.label[lang] };
      return buildSeries(code, `${country} · ${flowMetric.labelText}`, series, flowMetric);
    });
  }
  return [buildSeries(iso, country, series, metric)];
}

function trendChartMetric(metric) {
  if (metric.source === 'trade_footprint' && State.get('footprintTrendMode') === 'all') {
    return {
      ...metric,
      labelText: State.get('language') === 'en' ? 'Annual hours: four flows' : 'Horas anuales: cuatro flujos',
    };
  }
  return metric;
}

function buildSeries(iso, country, series, metric) {
  const points = Object.keys(series || {})
    .map(y => ({ year: +y, value: metricValue(series[y], metric) }))
    .filter(p => p.value != null && isFinite(p.value))
    .sort((a, b) => a.year - b.year);
  return { iso, country, points };
}

function trendMAWindow() {
  const value = State.get('trendMA') || 'none';
  const n = +value;
  return Number.isFinite(n) && n > 1 ? n : 0;
}

function movingAveragePoints(points, windowSize) {
  const w = +windowSize;
  if (!w || w < 2 || points.length < 3) return points;
  const half = Math.floor(w / 2);
  return points.map((d, i) => {
    const slice = points
      .slice(Math.max(0, i - half), Math.min(points.length, i + half + 1))
      .filter(p => p.value != null && Number.isFinite(p.value));
    return {
      ...d,
      value: slice.length ? d3.mean(slice, p => p.value) : d.value,
      smoothed: true,
    };
  });
}

function applyMovingAverage(series) {
  const windowSize = trendMAWindow();
  if (!windowSize) return series;
  return series.map(s => ({ ...s, points: movingAveragePoints(s.points, windowSize) }));
}

function linearRegression(points) {
  const pts = points.filter(d => d.value != null && Number.isFinite(d.value));
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumX = d3.sum(pts, d => d.year);
  const sumY = d3.sum(pts, d => d.value);
  const sumXY = d3.sum(pts, d => d.year * d.value);
  const sumX2 = d3.sum(pts, d => d.year * d.year);
  const denom = n * sumX2 - sumX * sumX;
  if (!denom) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function structuralBreaks(points, maxBreaks = 3) {
  const valid = points
    .filter(d => d.value != null && Number.isFinite(d.value))
    .sort((a, b) => a.year - b.year);
  if (valid.length < 10) return [];
  const changes = [];
  for (let i = 1; i < valid.length; i += 1) {
    const prev = valid[i - 1];
    const cur = valid[i];
    if (!prev.value) continue;
    const pct = (cur.value / prev.value - 1) * 100;
    if (Number.isFinite(pct)) {
      changes.push({ year: cur.year, pct, value: cur.value, abs: Math.abs(pct) });
    }
  }
  if (!changes.length) return [];
  const mean = d3.mean(changes, d => d.abs) || 0;
  const sd = d3.deviation(changes, d => d.abs) || 0;
  const picked = [];
  changes
    .filter(d => d.abs > mean + 1.5 * sd)
    .sort((a, b) => b.abs - a.abs)
    .forEach(d => {
      if (picked.length < maxBreaks && !picked.some(p => Math.abs(p.year - d.year) < 8)) {
        picked.push(d);
      }
    });
  return picked.sort((a, b) => a.year - b.year);
}

function drawTrendAnalysis(layer, series, x, y, innerWidth, innerHeight, playbackYear, opts = {}) {
  const showTrendLine = Boolean(State.get('trendShowLine'));
  const showBreaks = Boolean(State.get('trendShowBreaks'));
  if (!showTrendLine && !showBreaks) return;
  const compact = Boolean(opts.compact);
  const maxAnalyticSeries = compact ? 8 : 24;
  if (series.length > maxAnalyticSeries) return;
  const maxBreaks = compact || series.length > 4 ? 1 : 3;

  series.forEach((s, i) => {
    const c = COLORS[i % COLORS.length];
    const visible = visiblePoints(s.points, playbackYear).filter(d => d.value != null && Number.isFinite(d.value));
    if (visible.length < 2) return;

    if (showTrendLine) {
      const reg = linearRegression(visible);
      if (reg) {
        const x1 = d3.min(visible, d => d.year);
        const x2 = d3.max(visible, d => d.year);
        layer.append('line')
          .attr('class', 'trend-analysis-line')
          .attr('x1', x(x1)).attr('x2', x(x2))
          .attr('y1', y(reg.slope * x1 + reg.intercept))
          .attr('y2', y(reg.slope * x2 + reg.intercept))
          .attr('stroke', c)
          .attr('stroke-width', compact ? 1.25 : 1.7)
          .attr('stroke-dasharray', '5 4')
          .attr('stroke-opacity', compact ? 0.55 : 0.68)
          .attr('pointer-events', 'none')
          .append('title')
          .text(`${s.lineLabel || s.country}: ${State.get('language') === 'en' ? 'linear trend' : 'tendencia lineal'}`);
      }
    }

    if (showBreaks) {
      structuralBreaks(visible, maxBreaks).forEach((d, j) => {
        const xPos = x(d.year);
        layer.append('line')
          .attr('class', 'trend-break-line')
          .attr('x1', xPos).attr('x2', xPos)
          .attr('y1', 0).attr('y2', innerHeight)
          .attr('stroke', c)
          .attr('stroke-width', compact ? 1 : 1.25)
          .attr('stroke-dasharray', '2 4')
          .attr('stroke-opacity', compact ? 0.38 : 0.48)
          .attr('pointer-events', 'none')
          .append('title')
          .text(`${s.lineLabel || s.country} - ${d.year}: ${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`);
        if ((!compact && series.length <= 4) || (compact && series.length <= 2)) {
          layer.append('text')
            .attr('class', 'trend-break-label')
            .attr('x', Math.min(innerWidth - 28, Math.max(28, xPos)))
            .attr('y', 13 + j * 14)
            .attr('fill', c)
            .attr('text-anchor', 'middle')
            .style('font-size', compact ? '8px' : '9px')
            .style('font-weight', '700')
            .style('pointer-events', 'none')
            .text(`B ${d.year}`);
        }
      });
    }
  });
}

function pointTooltip(series, point, metric) {
  return {
    title: series.lineLabel || series.country || series.iso,
    subtitle: String(Math.round(point.year)),
    rows: [{
      label: metric.labelText,
      value: formatTick(point.value),
      unit: metric.unit,
    }],
    footer: point.interpolated
      ? (State.get('language') === 'en' ? 'Interpolated playback value' : 'Valor interpolado del timelapse')
      : '',
  };
}

function barTooltip(bar, metric, year) {
  return {
    title: bar.label || bar.key,
    subtitle: String(year),
    rows: [{
      label: metric.labelText,
      value: formatTick(bar.value),
      unit: metric.unit,
    }],
  };
}

function yDomainFromValues(values, opts = {}) {
  const finite = values.filter(v => v != null && Number.isFinite(v));
  if (!finite.length) return [0, 1];
  const [rawYMin, rawYMax] = d3.extent(finite);
  const zeroFloor = State.get('yAxisZero') !== false && rawYMin >= 0;
  if (zeroFloor) {
    const max = rawYMax === 0 ? 1 : rawYMax * (opts.padTop ?? 1.08);
    return [0, max];
  }
  let [yMin, yMax] = [rawYMin, rawYMax];
  if (yMin === yMax) {
    const delta = Math.abs(yMin || 1) * 0.08 || 1;
    yMin -= delta;
    yMax += delta;
  } else {
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
  }
  if (rawYMin >= 0 && yMin < 0) yMin = 0;
  return [yMin, yMax];
}

function drawChart(allSeries, metric, category) {
  const container = document.getElementById('trend-svg').parentElement;
  const W = container.clientWidth;
  const H = container.clientHeight;
  if (State.get('trendLayout') === 'facet' && allSeries.length > 1 && allSeries.length <= 16) {
    drawFacetedChart(allSeries, metric, category, W, H);
    return;
  }
  const m = chartMargins(W, H);
  if (W < 180 || H < 160) return;

  _svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const root = _svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  const iw = Math.max(80, W - m.left - m.right);
  const ih = Math.max(80, H - m.top - m.bottom);

  const [requestedFrom, requestedTo] = State.get('yearRange');
  const rangedSeries = applyMovingAverage(allSeries
    .map(s => ({ ...s, points: s.points.filter(p => p.year >= requestedFrom && p.year <= requestedTo) }))
    .filter(s => s.points.length));
  const allPoints = rangedSeries.flatMap(s => s.points);
  if (!allPoints.length) {
    const empty = document.getElementById('trend-empty');
    if (empty) {
      empty.style.display = 'flex';
      empty.textContent = State.get('language') === 'en'
        ? 'No data in the selected range.'
        : 'No hay datos en el rango seleccionado.';
    }
    return;
  }

  const availableYears = [...new Set(allPoints.map(p => p.year))].sort((a, b) => a - b);
  const dataFrom = availableYears[0];
  const dataTo = availableYears[availableYears.length - 1];
  const oneYear = dataFrom === dataTo;
  const sparseMode = isSparseSeries(availableYears);
  const playbackYear = playbackYearFor(dataFrom, dataTo);
  if (oneYear) {
    _svg.selectAll('*').remove();
    drawSingleYearBars(rangedSeries, metric, category, W, H, dataFrom);
    return;
  }
  const xDomain = oneYear ? [dataFrom - 1, dataFrom + 1] : [dataFrom, dataTo];
  const x = d3.scaleLinear().domain(xDomain).range([0, iw]);

  const [yMin, yMax] = yDomainFromValues(allPoints.map(d => d.value));
  const y = d3.scaleLinear()
    .domain([yMin, yMax]).nice()
    .range([ih, 0]);
  const yDomain = y.domain();
  const baselineY = yDomain[0] <= 0 && yDomain[1] >= 0 ? y(0) : ih;

  root.append('g')
    .attr('class', 'trend-grid')
    .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(''))
    .call(g => g.selectAll('line').attr('stroke', GRID).attr('stroke-dasharray', '2 4'))
    .call(g => g.select('path').remove());

  root.append('g').attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickValues(oneYear ? [dataFrom] : yearTicks(dataFrom, dataTo, iw)).tickFormat(d3.format('d')))
    .call(g => g.selectAll('text').attr('fill', MUTE).style('font-size', '12px'))
    .call(g => g.selectAll('line, path').attr('stroke', RULE));
  root.append('g')
    .call(d3.axisLeft(y).tickValues(valueTicks(yDomain[0], yDomain[1])).tickFormat(v => formatTick(v)))
    .call(g => g.selectAll('text').attr('fill', INK).style('font-size', '12px'))
    .call(g => g.selectAll('line, path').attr('stroke', RULE));

  root.append('text').attr('x', 0).attr('y', -20).attr('fill', INK)
    .style('font-size', '13px').style('font-weight', '700')
    .text(`${metric.labelText} (${metric.unit})`);
  if (category) {
    root.append('text').attr('x', iw).attr('y', -20).attr('fill', MUTE)
      .style('font-size', '11px').style('font-weight', '600').attr('text-anchor', 'end')
      .text(formatCategoryLabel(category, State.get('language')));
  }

  const currentYear = State.get('currentYear');
  const markerYear = Math.max(dataFrom, Math.min(dataTo, currentYear));
  if (markerYear !== currentYear) {
    window.setTimeout(() => {
      if (State.get('activeView') === 'trend' && State.get('activeIndicator') === metric.baseId) {
        State.set('currentYear', markerYear);
      }
    }, 0);
  }

  const clipId = `trend-clip-${Math.random().toString(36).slice(2)}`;
  _svg.append('defs').append('clipPath').attr('id', clipId)
    .append('rect').attr('x', 0).attr('y', 0).attr('width', iw).attr('height', ih);

  const line = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value));
  const seriesLayer = root.append('g').attr('clip-path', `url(#${clipId})`);
  const hitLayer = root.append('g').attr('class', 'trend-hit-layer').attr('clip-path', `url(#${clipId})`);
  rangedSeries.forEach((s, i) => {
    const c = COLORS[i % COLORS.length];
    const visible = visiblePoints(s.points, playbackYear);
    if (!visible.length) return;
    if (sparseMode) {
      seriesLayer.selectAll(`line.sparse-stem-${i}`)
        .data(visible)
        .enter().append('line')
        .attr('x1', d => x(d.year)).attr('x2', d => x(d.year))
        .attr('y1', baselineY).attr('y2', d => y(d.value))
        .attr('stroke', c)
        .attr('stroke-opacity', 0.55)
        .attr('stroke-width', 1.5);
      return;
    }
    if (visible.length < 2) return;
    seriesLayer.append('path').datum(visible)
      .attr('fill', 'none')
      .attr('stroke', c)
      .attr('stroke-width', 2.6)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', line)
      .append('title')
      .text(`${s.country}: ${metric.labelText}`);
  });

  rangedSeries.forEach((s, i) => {
    const visible = visiblePoints(s.points, playbackYear);
    if (!visible.length) return;
    const hits = hitLayer.selectAll(`circle.chart-hit-point-${i}`)
      .data(visible)
      .enter().append('circle')
      .attr('class', 'chart-hit-point')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.value))
      .attr('r', sparseMode ? 8 : 7);
    bindSvgTooltip(hits, d => pointTooltip(s, d, metric));
  });

  drawTrendAnalysis(seriesLayer, rangedSeries, x, y, iw, ih, playbackYear);

  const labels = [];
  rangedSeries.forEach((s, i) => {
    const c = COLORS[i % COLORS.length];
    const visible = visiblePoints(s.points, playbackYear);
    if (!visible.length) return;
    root.selectAll(`circle.point-${i}`)
      .data(sparseMode ? visible : visible.filter((_, idx) => idx === 0 || idx === visible.length - 1))
      .enter().append('circle')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.value))
      .attr('r', sparseMode ? 4.2 : 3.2)
      .attr('fill', '#fff')
      .attr('stroke', c)
      .attr('stroke-width', 1.8)
      .style('pointer-events', 'none')
      .append('title')
      .text(d => `${s.country} - ${d.year}: ${formatTick(d.value)} ${metric.unit}`);
    const last = visible.slice(-1)[0];
    if (last) {
      labels.push({ x: Math.min(iw + 8, x(last.year) + 7), y: y(last.value) + 4, iso: s.iso, color: c });
    }
  });
  placeEndLabels(root, labels, ih);
}

function drawFacetedChart(allSeries, metric, category, W, H) {
  if (W < 220 || H < 180) return;
  _svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const [requestedFrom, requestedTo] = State.get('yearRange');
  const rangedSeries = applyMovingAverage(allSeries
    .map(s => ({ ...s, points: s.points.filter(p => p.year >= requestedFrom && p.year <= requestedTo) }))
    .filter(s => s.points.length));
  if (!rangedSeries.length) return;

  const groups = facetGroups(rangedSeries, metric);
  const n = groups.length;
  const cols = Math.min(n, W < 720 ? 2 : W < 1100 ? 3 : 4);
  const rows = Math.ceil(n / cols);
  const headerH = 34;
  const gap = 14;
  const cellW = (W - gap * (cols + 1)) / cols;
  const cellH = Math.max(120, (H - headerH - gap * (rows + 1)) / rows);
  const allPoints = groups.flatMap(g => g.series.flatMap(s => s.points));
  const years = [...new Set(allPoints.map(p => p.year))].sort((a, b) => a - b);
  const dataFrom = years[0];
  const dataTo = years[years.length - 1];
  const oneYear = dataFrom === dataTo;
  const playbackYear = playbackYearFor(dataFrom, dataTo);
  const [yMin, yMax] = yDomainFromValues(allPoints.map(d => d.value));

  _svg.append('text')
    .attr('x', 18).attr('y', 22)
    .attr('fill', INK)
    .style('font-size', '13px').style('font-weight', '700')
    .text(`${metric.labelText} (${metric.unit})`);
  if (category) {
    _svg.append('text')
      .attr('x', W - 18).attr('y', 22)
      .attr('fill', MUTE)
      .style('font-size', '11px').style('font-weight', '600').attr('text-anchor', 'end')
      .text(formatCategoryLabel(category, State.get('language')));
  }

  groups.forEach((group, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = gap + col * (cellW + gap);
    const y0 = headerH + gap + row * (cellH + gap);
    const m = { top: 24, right: 12, bottom: 28, left: 42 };
    const iw = Math.max(60, cellW - m.left - m.right);
    const ih = Math.max(56, cellH - m.top - m.bottom);
    const root = _svg.append('g').attr('transform', `translate(${x0 + m.left},${y0 + m.top})`);
    const x = d3.scaleLinear().domain(oneYear ? [dataFrom - 1, dataTo + 1] : [dataFrom, dataTo]).range([0, iw]);
    const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([ih, 0]);
    const yDomain = y.domain();
    const baseline = yDomain[0] <= 0 && yDomain[1] >= 0 ? y(0) : ih;
    _svg.append('text')
      .attr('x', x0 + 8).attr('y', y0 + 15)
      .attr('fill', INK)
      .style('font-size', '11px').style('font-weight', '700')
      .text(group.title.length > 28 ? `${group.title.slice(0, 26)}...` : group.title);

    root.append('g')
      .attr('class', 'trend-grid')
      .call(d3.axisLeft(y).tickValues(valueTicks(yDomain[0], yDomain[1]).slice(0, 3)).tickSize(-iw).tickFormat(''))
      .call(g => g.selectAll('line').attr('stroke', GRID).attr('stroke-dasharray', '2 4'))
      .call(g => g.select('path').remove());
    if (!oneYear) {
      root.append('g').attr('transform', `translate(0,${ih})`)
        .call(d3.axisBottom(x).tickValues(facetYearTicks(dataFrom, dataTo, iw)).tickFormat(d3.format('d')))
        .call(g => g.selectAll('text').attr('fill', MUTE).style('font-size', '10.5px'))
        .call(g => g.selectAll('line, path').attr('stroke', RULE));
    }
    root.append('g')
      .call(d3.axisLeft(y).tickValues(valueTicks(yDomain[0], yDomain[1]).slice(0, 3)).tickFormat(v => formatTick(v)))
      .call(g => g.selectAll('text').attr('fill', MUTE).style('font-size', '10.5px'))
      .call(g => g.selectAll('line, path').attr('stroke', RULE));

    if (oneYear) {
      const bars = group.series
        .map((s, j) => ({
          key: s.lineLabel || s.iso,
          label: s.lineLabel || s.country,
          value: s.points[0]?.value,
          color: COLORS[j % COLORS.length],
        }))
        .filter(d => d.value != null && isFinite(d.value));
      const xBar = d3.scaleBand()
        .domain(bars.map(d => d.key))
        .range([0, iw])
        .padding(0.32);
      const facetBars = root.selectAll(`rect.trend-facet-bar-${i}`)
        .data(bars)
        .enter().append('rect')
        .attr('class', 'trend-facet-bar')
        .attr('x', d => xBar(d.key))
        .attr('y', d => y(Math.max(d.value, 0)))
        .attr('width', xBar.bandwidth())
        .attr('height', d => Math.max(2, Math.abs(y(d.value) - baseline)))
        .attr('fill', d => d.color)
        .attr('fill-opacity', 0.9);
      bindSvgTooltip(facetBars, d => barTooltip(d, metric, dataFrom));
      facetBars
        .append('title')
        .text(d => `${d.label} - ${dataFrom}: ${formatTick(d.value)} ${metric.unit}`);
      root.append('g').attr('transform', `translate(0,${ih})`)
        .call(d3.axisBottom(xBar).tickFormat(d => d.length > 8 ? `${d.slice(0, 7)}...` : d))
        .call(g => g.selectAll('text').attr('fill', MUTE).style('font-size', '10px'))
        .call(g => g.selectAll('line, path').attr('stroke', RULE));
      return;
    }

    drawFacetLegend(root, group.series, iw);
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value));
    group.series.forEach((s, j) => {
      const c = COLORS[j % COLORS.length];
      const visible = visiblePoints(s.points, playbackYear);
      if (visible.length > 1) {
        root.append('path')
          .datum(visible)
          .attr('fill', 'none')
          .attr('stroke', c)
          .attr('stroke-width', 2)
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .attr('d', line)
          .append('title')
          .text(`${s.lineLabel || s.country}: ${metric.labelText}`);
      }
      root.selectAll(`circle.facet-point-${i}-${j}`)
        .data(visible.filter((_, idx) => idx === 0 || idx === visible.length - 1))
        .enter().append('circle')
        .attr('class', `facet-point-${i}-${j}`)
        .attr('cx', d => x(d.year))
        .attr('cy', d => y(d.value))
        .attr('r', 2.8)
        .attr('fill', '#fff')
        .attr('stroke', c)
        .attr('stroke-width', 1.5)
        .style('pointer-events', 'none')
        .append('title')
        .text(d => `${s.lineLabel || s.country} - ${d.year}: ${formatTick(d.value)} ${metric.unit}`);
      const hits = root.selectAll(`circle.chart-facet-hit-${i}-${j}`)
        .data(visible)
        .enter().append('circle')
        .attr('class', 'chart-hit-point chart-hit-point-facet')
        .attr('cx', d => x(d.year))
        .attr('cy', d => y(d.value))
        .attr('r', 6);
      bindSvgTooltip(hits, d => pointTooltip(s, d, metric));
    });
    drawTrendAnalysis(root, group.series, x, y, iw, ih, playbackYear, { compact: true });
  });
}

function drawFacetLegend(root, series, innerWidth) {
  if (series.length < 2 || series.length > 6) return;
  const itemW = Math.max(68, Math.min(118, innerWidth / Math.min(series.length, 4)));
  const legend = root.append('g')
    .attr('class', 'trend-facet-legend')
    .attr('transform', 'translate(2,6)');
  series.forEach((s, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = col * itemW;
    const y = row * 13;
    const label = s.lineLabel || s.country || s.iso;
    const shortLabel = label.length > 14 ? `${label.slice(0, 12)}...` : label;
    const item = legend.append('g').attr('transform', `translate(${x},${y})`);
    item.append('line')
      .attr('x1', 0).attr('x2', 12)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', COLORS[i % COLORS.length])
      .attr('stroke-width', 2.4)
      .attr('stroke-linecap', 'round');
    item.append('text')
      .attr('x', 16).attr('y', 3)
      .attr('fill', MUTE)
      .style('font-size', '8.5px')
      .style('font-weight', '650')
      .text(shortLabel)
      .append('title')
      .text(label);
  });
}

function drawSingleYearBars(rangedSeries, metric, category, W, H, year) {
  const m = chartMargins(W, H);
  if (W < 180 || H < 160) return;

  _svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const root = _svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  const iw = Math.max(80, W - m.left - m.right);
  const ih = Math.max(80, H - m.top - m.bottom);
  const bars = rangedSeries
    .map((s, i) => ({
      key: s.iso,
      label: s.lineLabel || s.country,
      value: s.points[0]?.value,
      color: COLORS[i % COLORS.length],
    }))
    .filter(d => d.value != null && isFinite(d.value));
  if (!bars.length) return;

  const x = d3.scaleBand()
    .domain(bars.map(d => d.key))
    .range([0, iw])
    .padding(Math.min(0.42, Math.max(0.16, 0.8 / Math.max(1, bars.length))));

  const [yMin, yMax] = yDomainFromValues(bars.map(d => d.value));

  const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([ih, 0]);
  const yDomain = y.domain();
  const baseline = yDomain[0] <= 0 && yDomain[1] >= 0 ? y(0) : ih;

  root.append('g')
    .attr('class', 'trend-grid')
    .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(''))
    .call(g => g.selectAll('line').attr('stroke', GRID).attr('stroke-dasharray', '2 4'))
    .call(g => g.select('path').remove());
  root.append('g').attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickFormat(d => d.length > 10 ? `${d.slice(0, 9)}...` : d))
    .call(g => g.selectAll('text').attr('fill', MUTE).style('font-size', '11px'))
    .call(g => g.selectAll('line, path').attr('stroke', RULE));
  root.append('g')
    .call(d3.axisLeft(y).tickValues(valueTicks(yDomain[0], yDomain[1])).tickFormat(v => formatTick(v)))
    .call(g => g.selectAll('text').attr('fill', INK).style('font-size', '12px'))
    .call(g => g.selectAll('line, path').attr('stroke', RULE));

  root.append('text').attr('x', 0).attr('y', -20).attr('fill', INK)
    .style('font-size', '13px').style('font-weight', '700')
    .text(`${metric.labelText} (${metric.unit}), ${year}`);
  if (category) {
    root.append('text').attr('x', iw).attr('y', -20).attr('fill', MUTE)
      .style('font-size', '11px').style('font-weight', '600').attr('text-anchor', 'end')
      .text(formatCategoryLabel(category, State.get('language')));
  }

  const barsSelection = root.selectAll('rect.trend-bar')
    .data(bars)
    .enter().append('rect')
    .attr('class', 'trend-bar')
    .attr('x', d => x(d.key))
    .attr('y', d => y(Math.max(d.value, 0)))
    .attr('width', x.bandwidth())
    .attr('height', d => Math.max(2, Math.abs(y(d.value) - baseline)))
    .attr('fill', d => d.color)
    .attr('fill-opacity', 0.9);
  bindSvgTooltip(barsSelection, d => barTooltip(d, metric, year));
  barsSelection
    .append('title')
    .text(d => `${d.label} - ${year}: ${formatTick(d.value)} ${metric.unit}`);
}

function playbackYearFor(from, to) {
  if (!State.get('playing')) return to;
  const y = State.get('animationYear') ?? State.get('currentYear') ?? to;
  return Math.max(from, Math.min(to, +y || from));
}

function visiblePoints(points, playbackYear) {
  if (!State.get('playing')) return points;
  if (!points.length) return [];
  if (playbackYear <= points[0].year) return [points[0]];
  const visible = points.filter(p => p.year <= playbackYear);
  const prev = visible[visible.length - 1];
  const next = points.find(p => p.year > playbackYear);
  if (prev && next && playbackYear > prev.year) {
    const t = (playbackYear - prev.year) / (next.year - prev.year);
    visible.push({
      year: playbackYear,
      value: prev.value + (next.value - prev.value) * t,
      interpolated: true,
    });
  }
  return visible;
}

function facetGroups(series, metric) {
  const byFlow = metric.source === 'trade_footprint' && State.get('trendFacetBy') === 'flow';
  if (metric.source === 'trade_footprint') {
    const map = new Map();
    series.forEach(s => {
      const key = byFlow ? (s.flowKey || s.facetKey || s.iso) : (s.territoryKey || s.iso);
      const title = byFlow ? (s.flowTitle || s.facetTitle || key) : (s.territoryTitle || s.country);
      if (!map.has(key)) map.set(key, { key, title, series: [] });
      map.get(key).series.push({
        ...s,
        lineLabel: byFlow
          ? (s.territoryTitle || s.country)
          : (s.flowTitle || s.lineLabel || s.country),
      });
    });
    return [...map.values()];
  }
  if (!byFlow) {
    return series.map(s => ({ key: s.facetKey || s.iso, title: s.facetTitle || s.country, series: [s] }));
  }
  const map = new Map();
  series.forEach(s => {
    const key = s.facetKey || s.iso;
    if (!map.has(key)) map.set(key, { key, title: s.facetTitle || key, series: [] });
    map.get(key).series.push(s);
  });
  return [...map.values()];
}

function chartMargins(width, height) {
  return {
    top: height < 260 ? 34 : 46,
    right: Math.min(138, Math.max(68, width * 0.1)),
    bottom: 42,
    left: Math.min(86, Math.max(60, width * 0.07)),
  };
}

function isSparseSeries(years) {
  if (years.length <= 3) return true;
  const span = years[years.length - 1] - years[0];
  return years.length <= 5 && span / Math.max(1, years.length - 1) > 4;
}

function placeEndLabels(root, labels, innerHeight) {
  labels.sort((a, b) => a.y - b.y);
  const minGap = 13;
  labels.forEach((label, i) => {
    if (i === 0) label.y = Math.max(10, label.y);
    else label.y = Math.max(label.y, labels[i - 1].y + minGap);
  });
  for (let i = labels.length - 1; i >= 0; i--) {
    labels[i].y = Math.min(innerHeight - 4 - (labels.length - 1 - i) * minGap, labels[i].y);
    if (i < labels.length - 1) labels[i].y = Math.min(labels[i].y, labels[i + 1].y - minGap);
    labels[i].y = Math.max(10, labels[i].y);
  }
  labels.forEach(label => {
    root.append('text')
      .attr('x', label.x)
      .attr('y', label.y)
      .attr('fill', label.color)
      .style('font-size', '11px')
      .style('font-weight', '700')
      .text(label.iso);
  });
}

function yearTicks(from, to, width) {
  const approx = Math.min(9, Math.max(4, Math.floor(width / 95)));
  const edgeGap = Math.max(2, Math.ceil((to - from) / 14));
  const ticks = d3.scaleLinear().domain([from, to]).ticks(approx).map(Math.round);
  return [...new Set([from, ...ticks.filter(y => y > from + edgeGap && y < to - edgeGap), to])];
}

function facetYearTicks(from, to, width) {
  if (from === to) return [from];
  if (width < 120) return [from, to];
  const ticks = yearTicks(from, to, width);
  if (width < 185 && ticks.length > 4) {
    return ticks.filter((y, i) => y === from || y === to || i % 2 === 0);
  }
  return ticks;
}

function valueTicks(min, max) {
  const middle = d3.scaleLinear().domain([min, max]).ticks(4);
  return [...new Set([min, ...middle.filter(v => v > min && v < max), max])];
}

function formatTick(v) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(abs < 10e9 ? 1 : 0) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(abs < 10e6 ? 1 : 0) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(abs < 10e3 ? 1 : 0) + 'k';
  return d3.format(',.2~f')(v);
}


// --- CSV export -------------------------------------------------------------
// Exports every painted point of every painted series, clipped to the year
// range shown on the timeline.
registerExport('trend', () => {
  if (!_lastExport || !_lastExport.allSeries.length) return null;
  const { allSeries, metric, category } = _lastExport;
  const lang = State.get('language');
  const [from, to] = State.get('yearRange') || [-Infinity, Infinity];
  const rows = [];
  for (const series of allSeries) {
    for (const point of series.points || []) {
      if (point.year < from || point.year > to) continue;
      rows.push({
        serie: series.country || series.iso,
        codigo: series.territoryKey || series.iso,
        anio: point.year,
        indicador: series.flowTitle || metric.labelText,
        valor: point.value,
        unidad: metric.unit,
        categoria_cultivo: category
          ? formatCategoryLabel(category, lang)
          : (lang === 'en' ? 'all production' : 'toda la produccion'),
      });
    }
  }
  if (!rows.length) return null;
  return { rows, indicator: State.get('activeIndicator'), view: 'evolucion' };
});
