// Right panel: controls, crop categories and countries.

import { State } from './state.js';
import { DataLoader } from './data-loader.js?v=20260522-tildes1';
import { getCategory, getIndicator } from './indicators.js?v=20260522-tildes1';
import { indicatorInfo } from './indicator-info.js?v=20260522-tildes1';
import { escapeHtml, formatCategoryLabel, normalizeSearchText } from './labels.js';
import {
  FUNCTIONAL_UNITS,
  FOOTPRINT_FLOWS,
  PRODUCTIVITY_LABOR_INPUTS,
  PRODUCTIVITY_DIRECTIONS,
  isFootprintFlowIndicator,
  isFunctionalUnitIndicator,
  resolveMetric,
  selectedFootprintFlows,
  supportsCropCategory,
} from './metric.js?v=20260522-tildes1';

export async function initRightPanel() {
  initPanelSections();
  renderOptions();
  await renderTerritories();
  await renderCropCategories();

  State.subscribe('language', () => { renderOptions(); renderCropCategories(); });
  State.subscribe('activeCategory', () => { renderOptions(); renderCropCategories(); renderTerritories(); });
  State.subscribe('activeIndicator', () => { renderOptions(); renderCropCategories(); });
  State.subscribe('functionalUnit', renderOptions);
  State.subscribe('productivityLaborInput', renderOptions);
  State.subscribe('productivityDirection', renderOptions);
  State.subscribe('footprintFlow', renderOptions);
  State.subscribe('footprintFlows', renderOptions);
  State.subscribe('footprintTrendMode', renderOptions);
  State.subscribe('trendGeoScope', renderTerritories);
  State.subscribe('activeView', () => { renderOptions(); renderTerritories(); });
  State.subscribe('trendLayout', renderOptions);
  State.subscribe('trendFacetBy', renderOptions);
  State.subscribe('trendMA', renderOptions);
  State.subscribe('trendShowLine', renderOptions);
  State.subscribe('trendShowBreaks', renderOptions);
  State.subscribe('yAxisZero', renderOptions);
  State.subscribe('treemapMode', renderOptions);
  State.subscribe('cropCategoryFilter', renderOptions);
  State.subscribe('selectedRegions', renderTerritoriesHighlight);
  State.subscribe('selectedCountries', () => { renderTerritoriesHighlight(); renderOptions(); });
  State.subscribe('currentYear', renderOptions);
  State.subscribe('tradeFlow', renderOptions);
  State.subscribe('tradeProduct', renderOptions);
}

function initPanelSections() {
  document.querySelectorAll('.rp-section').forEach((section, index) => {
    const header = section.querySelector('.rp-section-header');
    const body = section.querySelector('.rp-section-body');
    if (!header || !body) return;
    if (body.id === 'rp-crop-body') section.classList.add('collapsed');
    const expanded = !section.classList.contains('collapsed');
    header.setAttribute('aria-expanded', String(expanded));
    header.setAttribute('aria-controls', body.id || `rp-section-body-${index}`);
    if (!body.id) body.id = `rp-section-body-${index}`;
    header.addEventListener('click', () => {
      const nextExpanded = section.classList.toggle('collapsed') === false;
      header.setAttribute('aria-expanded', String(nextExpanded));
    });
  });
}

async function renderOptions() {
  const body = document.getElementById('rp-options-body');
  if (!body) return;
  const lang = State.get('language');
  const cat = getCategory(State.get('activeCategory'));
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, lang);
  const selectedFlows = selectedFootprintFlows().map(f => f.id);
  const canShowProducts = supportsCropCategory(ind);
  const isConditions = cat?.id === 'conditions';
  const conditionOption = isConditions ? conditionOptionForIndicator(ind?.id) : null;
  const conditionMeasure = conditionOption ? conditionMeasureForIndicator(conditionOption, ind?.id) : null;
  const treemapMode = canShowProducts ? State.get('treemapMode') : 'countries';
  const trendViewMode = State.get('trendLayout') === 'facet'
    ? `facet_${State.get('trendFacetBy') || 'territory'}`
    : 'overlay';
  if (State.get('activeView') === 'treemap' && !canShowProducts && State.get('treemapMode') !== 'countries') {
    window.setTimeout(() => State.set('treemapMode', 'countries'), 0);
  }
  const labels = lang === 'en'
    ? { indicator: 'Indicator', conditionUnit: 'Unit', laborInput: 'Labour input', unitChoice: 'Functional unit', readingChoice: 'Reading', footprintFlow: 'Footprint flow', all: 'All', clear: 'Clear', noIndicators: 'No indicators available', layout: 'View', overlay: 'One panel', facetTerritory: 'One panel per country/region', facetFlow: 'One panel per flow', composition: 'Composition', products: 'Products', countries: 'Countries', productsByCountry: 'Products by country' }
    : { indicator: 'Indicador', conditionUnit: 'Unidad', laborInput: 'Trabajo', unitChoice: 'Unidad funcional', readingChoice: 'Lectura', footprintFlow: 'Flujo de huella', all: 'Todos', clear: 'Limpiar', noIndicators: 'Sin indicadores disponibles', layout: 'Vista', overlay: 'Un panel', facetTerritory: 'Un panel por país/región', facetFlow: 'Un panel por flujo', composition: 'Composición', products: 'Productos', countries: 'Países', productsByCountry: 'Productos por país' };

  Object.assign(labels, lang === 'en'
    ? {
      trendAnalysis: 'Trend analysis',
      movingAverage: 'Moving average',
      noSmoothing: 'None',
      years: 'years',
      trendLine: 'Trend',
      structuralBreak: 'Break',
      trendAnalysisTitle: 'Optional analytical layers for the current trend chart.',
      movingAverageTitle: 'Smooth the series with a centered moving average.',
      trendLineTitle: 'Show a fitted linear trend line.',
      structuralBreakTitle: 'Mark the largest annual changes as structural breaks.',
      yAxis: 'Y axis',
      yAxisZero: 'From zero',
      yAxisAuto: 'Auto',
      yAxisTitle: 'Choose whether positive charts start at zero or use an automatic vertical range.',
    }
    : {
      trendAnalysis: 'An\u00e1lisis',
      movingAverage: 'Media m\u00f3vil',
      noSmoothing: 'Sin suavizar',
      years: 'a\u00f1os',
      trendLine: 'Tendencia',
      structuralBreak: 'Break',
      trendAnalysisTitle: 'Capas anal\u00edticas opcionales para la gr\u00e1fica de tendencias actual.',
      movingAverageTitle: 'Suaviza la serie con una media m\u00f3vil centrada.',
      trendLineTitle: 'Muestra una recta de tendencia ajustada.',
      structuralBreakTitle: 'Marca los mayores cambios anuales como breaks estructurales.',
      yAxis: 'Eje Y',
      yAxisZero: 'Desde cero',
      yAxisAuto: 'Auto',
      yAxisTitle: 'Elige si las gr\u00e1ficas positivas empiezan en cero o usan un rango vertical autom\u00e1tico.',
    });

  if (cat?.id === 'trade') {
    await renderTradeOptions(body, lang);
    return;
  }

  const indicatorControl = isConditions
    ? `
      <label class="rp-select-row" title="${escapeHtml(indicatorInfo(ind, lang, metric) || '')}">
        <span>${labels.indicator}</span>
        <select data-condition-topic>
          ${CONDITION_OPTIONS.map(opt => `<option value="${escapeHtml(opt.id)}" ${opt.id === conditionOption.id ? 'selected' : ''}>${escapeHtml(opt.label[lang])}</option>`).join('')}
        </select>
      </label>
      ${conditionOption.measures.length > 1 ? `
        <label class="rp-select-row" title="${lang === 'en' ? 'Choose whether the indicator is read as hours or as a share.' : 'Elige si el indicador se lee como horas o como porcentaje.'}">
          <span>${labels.conditionUnit}</span>
          <select data-condition-measure>
            ${conditionOption.measures.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === conditionMeasure.id ? 'selected' : ''}>${escapeHtml(m.label[lang])}</option>`).join('')}
          </select>
        </label>
      ` : ''}
    `
    : `
      <label class="rp-select-row" title="${escapeHtml(indicatorInfo(ind, lang, metric) || '')}">
        <span>${labels.indicator}</span>
        ${cat && cat.indicators.length
          ? `<select data-option-ind>
            ${cat.indicators.map(i => {
              const m = resolveMetric(i, lang);
              const info = indicatorInfo(i, lang, m) || `${m.labelText} (${m.unit})`;
              return `<option value="${escapeHtml(i.id)}" ${i.id === State.get('activeIndicator') ? 'selected' : ''} title="${escapeHtml(info)}">${escapeHtml(m.labelText)} - ${escapeHtml(m.unit)}</option>`;
            }).join('')}
          </select>`
          : `<div class="rp-empty">${labels.noIndicators}</div>`}
      </label>
    `;

  body.innerHTML = `
    ${indicatorControl}

    ${State.get('activeView') === 'trend' ? `
      <label class="rp-select-row" title="${lang === 'en' ? 'Choose one chart or small multiples.' : 'Elige una gráfica única o pequeños paneles.'}">
        <span>${labels.layout}</span>
        <select data-option-trend-view>
          <option value="overlay" ${trendViewMode === 'overlay' ? 'selected' : ''}>${labels.overlay}</option>
          <option value="facet_territory" ${trendViewMode === 'facet_territory' ? 'selected' : ''}>${labels.facetTerritory}</option>
          ${ind && isFootprintFlowIndicator(ind) ? `<option value="facet_flow" ${trendViewMode === 'facet_flow' ? 'selected' : ''}>${labels.facetFlow}</option>` : ''}
        </select>
      </label>
      <div class="rp-select-row rp-analysis-row" title="${escapeHtml(labels.trendAnalysisTitle)}">
        <span>${labels.trendAnalysis}</span>
        <div class="rp-analysis-controls">
          <label class="rp-analysis-select" title="${escapeHtml(labels.movingAverageTitle)}">
            <small>${labels.movingAverage}</small>
            <select data-option-trend-ma>
              <option value="none" ${(State.get('trendMA') || 'none') === 'none' ? 'selected' : ''}>${labels.noSmoothing}</option>
              ${[5, 10, 20].map(w => `<option value="${w}" ${String(State.get('trendMA')) === String(w) ? 'selected' : ''}>${w} ${labels.years}</option>`).join('')}
            </select>
          </label>
          <button type="button" class="rp-analysis-toggle ${State.get('trendShowLine') ? 'selected' : ''}" data-option-trend-toggle="trendShowLine" title="${escapeHtml(labels.trendLineTitle)}">
            ${labels.trendLine}
          </button>
          <button type="button" class="rp-analysis-toggle ${State.get('trendShowBreaks') ? 'selected' : ''}" data-option-trend-toggle="trendShowBreaks" title="${escapeHtml(labels.structuralBreakTitle)}">
            ${labels.structuralBreak}
          </button>
        </div>
      </div>
      <label class="rp-select-row" title="${escapeHtml(labels.yAxisTitle)}">
        <span>${labels.yAxis}</span>
        <select data-option-y-axis>
          <option value="zero" ${State.get('yAxisZero') !== false ? 'selected' : ''}>${labels.yAxisZero}</option>
          <option value="auto" ${State.get('yAxisZero') === false ? 'selected' : ''}>${labels.yAxisAuto}</option>
        </select>
      </label>
    ` : ''}

    ${State.get('activeView') === 'treemap' ? `
      <label class="rp-select-row" title="${lang === 'en' ? 'Switch composition between products and countries.' : 'Cambia la composición entre productos y países.'}">
        <span>${labels.composition}</span>
        <select data-option-treemap-mode>
          ${canShowProducts ? `<option value="products" ${treemapMode === 'products' ? 'selected' : ''}>${labels.products}</option>` : ''}
          <option value="countries" ${treemapMode === 'countries' ? 'selected' : ''}>${labels.countries}</option>
          ${canShowProducts ? `<option value="products_by_country" ${treemapMode === 'products_by_country' ? 'selected' : ''}>${labels.productsByCountry}</option>` : ''}
        </select>
      </label>
    ` : ''}

    ${ind && isFunctionalUnitIndicator(ind) ? `
      <label class="rp-select-row" title="${lang === 'en' ? 'Choose whether labour is measured as hours or persons.' : 'Elige si el trabajo se mide como horas o como trabajadores.'}">
        <span>${labels.laborInput}</span>
        <select data-option-labor-input>
          ${PRODUCTIVITY_LABOR_INPUTS.map(x => `<option value="${x.id}" ${x.id === State.get('productivityLaborInput') ? 'selected' : ''}>${escapeHtml(x.label[lang])}</option>`).join('')}
        </select>
      </label>
      <label class="rp-select-row" title="${lang === 'en' ? 'Choose the denominator used as functional unit.' : 'Elige el denominador usado como unidad funcional.'}">
        <span>${labels.unitChoice}</span>
        <select data-option-unit>
          ${FUNCTIONAL_UNITS.map(u => `<option value="${u.id}" ${u.id === State.get('functionalUnit') ? 'selected' : ''}>${escapeHtml(u.label[lang])} - ${escapeHtml(u.short[lang])}</option>`).join('')}
        </select>
      </label>
      <label class="rp-select-row" title="${lang === 'en' ? 'Switch between hours per unit and its inverse.' : 'Alterna entre horas por unidad y su inversa.'}">
        <span>${labels.readingChoice}</span>
        <select data-option-direction>
          ${PRODUCTIVITY_DIRECTIONS.map(d => `<option value="${d.id}" ${d.id === State.get('productivityDirection') ? 'selected' : ''}>${escapeHtml(productivityReadingLabel(d, lang))}</option>`).join('')}
        </select>
      </label>
    ` : ''}

    ${ind && isFootprintFlowIndicator(ind) ? `
      <div class="rp-select-row rp-flow-row" title="${lang === 'en' ? 'Select one or more footprint flows for trend lines.' : 'Selecciona uno o varios flujos de huella para las tendencias.'}">
        <div class="rp-flow-head">
          <span>${labels.footprintFlow}</span>
          <div>
            <button type="button" class="rp-inline-action" data-flow-all>${labels.all}</button>
            <button type="button" class="rp-inline-action rp-inline-danger" data-flow-clear>${labels.clear}</button>
          </div>
        </div>
        <div class="rp-flow-list">
          ${FOOTPRINT_FLOWS.map(f => `<label class="rp-flow-pill ${selectedFlows.includes(f.id) ? 'selected' : ''}" title="${escapeHtml(f.description?.[lang] || f.label[lang])}">
            <input type="checkbox" value="${f.id}" ${selectedFlows.includes(f.id) ? 'checked' : ''} data-option-flow>
            <span>${escapeHtml(f.short?.[lang] || f.label[lang])}</span>
          </label>`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  body.querySelector('[data-option-ind]')?.addEventListener('change', e => State.set('activeIndicator', e.target.value));
  body.querySelector('[data-condition-topic]')?.addEventListener('change', e => {
    const nextOption = CONDITION_OPTIONS.find(opt => opt.id === e.target.value) || CONDITION_OPTIONS[0];
    const preferredMeasure = conditionMeasure?.id || nextOption.measures[0].id;
    const nextMeasure = nextOption.measures.find(m => m.id === preferredMeasure) || nextOption.measures[0];
    State.set('activeIndicator', nextMeasure.indicator);
  });
  body.querySelector('[data-condition-measure]')?.addEventListener('change', e => {
    const nextMeasure = conditionOption?.measures.find(m => m.id === e.target.value) || conditionOption?.measures[0];
    if (nextMeasure) State.set('activeIndicator', nextMeasure.indicator);
  });
  body.querySelector('[data-option-unit]')?.addEventListener('change', e => State.set('functionalUnit', e.target.value));
  body.querySelector('[data-option-labor-input]')?.addEventListener('change', e => State.set('productivityLaborInput', e.target.value));
  body.querySelector('[data-option-direction]')?.addEventListener('change', e => State.set('productivityDirection', e.target.value));
  body.querySelector('[data-option-trend-view]')?.addEventListener('change', e => {
    if (e.target.value === 'overlay') {
      State.set('trendLayout', 'overlay');
    } else {
      State.setMany({
        trendLayout: 'facet',
        trendFacetBy: e.target.value === 'facet_flow' ? 'flow' : 'territory',
      });
    }
  });
  body.querySelector('[data-option-trend-ma]')?.addEventListener('change', e => State.set('trendMA', e.target.value));
  body.querySelector('[data-option-y-axis]')?.addEventListener('change', e => State.set('yAxisZero', e.target.value === 'zero'));
  body.querySelectorAll('[data-option-trend-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.optionTrendToggle;
      State.set(key, !State.get(key));
    });
  });
  body.querySelector('[data-option-trend-layout]')?.addEventListener('change', e => State.set('trendLayout', e.target.value));
  body.querySelector('[data-option-facet-by]')?.addEventListener('change', e => State.set('trendFacetBy', e.target.value));
  body.querySelector('[data-option-treemap-mode]')?.addEventListener('change', e => State.set('treemapMode', e.target.value));
  body.querySelectorAll('input[data-option-flow]').forEach(input => {
    input.addEventListener('change', () => State.toggleFootprintFlow(input.value));
  });
  body.querySelector('[data-flow-all]')?.addEventListener('click', () => State.setFootprintFlows(FOOTPRINT_FLOWS.map(f => f.id)));
  body.querySelector('[data-flow-clear]')?.addEventListener('click', () => State.setFootprintFlows([]));
}

function renderOptionsLegacy() {
  const body = document.getElementById('rp-options-body');
  if (!body) return;
  const lang = State.get('language');
  const cat = getCategory(State.get('activeCategory'));
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, lang);
  const labels = lang === 'en'
    ? {
      indicator: 'Indicator',
      unitChoice: 'Functional unit',
      readingChoice: 'Reading',
      scope: 'Scope',
      countries: 'Countries',
      regions: 'Regions',
      world: 'World',
      footprintFlow: 'Footprint flow',
      footprintTrend: 'Trend lines',
      selectedFlow: 'One flow',
      allFlows: 'Four flows',
      noIndicators: 'No indicators available',
    }
    : {
      indicator: 'Indicador',
      unitChoice: 'Unidad funcional',
      readingChoice: 'Lectura',
      scope: 'Ámbito',
      countries: 'Países',
      regions: 'Regiones',
      world: 'Mundo',
      footprintFlow: 'Flujo de huella',
      footprintTrend: 'Líneas en tendencia',
      selectedFlow: 'Un flujo',
      allFlows: 'Cuatro flujos',
      noIndicators: 'Sin indicadores disponibles',
    };

  body.innerHTML = `
    <div class="rp-control-group rp-control-group-tight">
      <div class="rp-control-label">${labels.indicator}</div>
      <div class="rp-choice-grid rp-choice-grid-single rp-choice-grid-compact">
        ${cat && cat.indicators.length
          ? cat.indicators.map(i => {
              const m = resolveMetric(i, lang);
              return `<button class="rp-choice ${i.id === State.get('activeIndicator') ? 'selected' : ''}" type="button" data-option-ind="${escapeHtml(i.id)}">
                <span>${escapeHtml(m.labelText)}</span>
                <small>${escapeHtml(m.unit)}</small>
              </button>`;
            }).join('')
          : `<div class="rp-empty">${labels.noIndicators}</div>`}
      </div>
    </div>

    ${ind && isFunctionalUnitIndicator(ind) ? `
      <div class="rp-control-group rp-control-group-tight">
        <div class="rp-control-label">${labels.unitChoice}</div>
        <div class="rp-choice-grid">
          ${FUNCTIONAL_UNITS.map(u => `<button class="rp-choice ${u.id === State.get('functionalUnit') ? 'selected' : ''}" type="button" data-option-unit="${u.id}">
            <span>${escapeHtml(u.label[lang])}</span>
            <small>${escapeHtml(u.short[lang])}</small>
          </button>`).join('')}
        </div>
      </div>
      <div class="rp-control-group rp-control-group-tight">
        <div class="rp-control-label">${labels.readingChoice}</div>
        <div class="rp-choice-grid">
          ${PRODUCTIVITY_DIRECTIONS.map(d => `<button class="rp-choice ${d.id === State.get('productivityDirection') ? 'selected' : ''}" type="button" data-option-direction="${d.id}">
            <span>${escapeHtml(d.label[lang])}</span>
          </button>`).join('')}
        </div>
      </div>
    ` : ''}

    ${ind && isFootprintFlowIndicator(ind) ? `
      <div class="rp-control-group rp-control-group-tight">
        <div class="rp-control-label">${labels.footprintFlow}</div>
        <div class="rp-choice-grid rp-choice-grid-single rp-choice-grid-compact">
          ${FOOTPRINT_FLOWS.map(f => `<button class="rp-choice ${f.id === State.get('footprintFlow') ? 'selected' : ''}" type="button" data-option-flow="${f.id}">
            <span>${escapeHtml(f.label[lang])}</span>
          </button>`).join('')}
        </div>
      </div>
      <div class="rp-control-group rp-control-group-tight">
        <div class="rp-control-label">${labels.footprintTrend}</div>
        <div class="rp-choice-grid">
          ${[
            ['selected', labels.selectedFlow],
            ['all', labels.allFlows],
          ].map(([id, label]) => `<button class="rp-choice ${id === State.get('footprintTrendMode') ? 'selected' : ''}" type="button" data-option-fp-trend="${id}">
            <span>${label}</span>
          </button>`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  body.querySelectorAll('[data-option-ind]').forEach(btn => {
    btn.addEventListener('click', () => State.set('activeIndicator', btn.dataset.optionInd));
  });
  body.querySelectorAll('[data-option-unit]').forEach(btn => {
    btn.addEventListener('click', () => State.set('functionalUnit', btn.dataset.optionUnit));
  });
  body.querySelectorAll('[data-option-direction]').forEach(btn => {
    btn.addEventListener('click', () => State.set('productivityDirection', btn.dataset.optionDirection));
  });
  body.querySelectorAll('[data-option-flow]').forEach(btn => {
    btn.addEventListener('click', () => State.set('footprintFlow', btn.dataset.optionFlow));
  });
  body.querySelectorAll('[data-option-fp-trend]').forEach(btn => {
    btn.addEventListener('click', () => State.set('footprintTrendMode', btn.dataset.optionFpTrend));
  });
}

const CONDITION_OPTIONS = [
  {
    id: 'monthly_wage',
    label: { es: 'Salario mensual', en: 'Monthly wage' },
    measures: [{ id: 'value', indicator: 'monthly_wage', label: { es: 'USD-PPP', en: 'USD-PPP' } }],
  },
  {
    id: 'va_per_worker',
    label: { es: 'Valor añadido / trabajador', en: 'Value added / worker' },
    measures: [{ id: 'value', indicator: 'va_per_worker', label: { es: 'USD', en: 'USD' } }],
  },
  {
    id: 'child_labor',
    label: { es: 'Trabajo infantil', en: 'Child labour' },
    measures: [
      { id: 'hours', indicator: 'hours_child_labor', label: { es: 'Horas', en: 'Hours' } },
      { id: 'percent', indicator: 'pct_child_labor', label: { es: 'Porcentaje', en: 'Share' } },
    ],
  },
  {
    id: 'forced_labor',
    label: { es: 'Trabajo forzoso', en: 'Forced labour' },
    measures: [
      { id: 'hours', indicator: 'hours_forced_labor', label: { es: 'Horas', en: 'Hours' } },
      { id: 'percent', indicator: 'pct_forced_labor', label: { es: 'Porcentaje', en: 'Share' } },
    ],
  },
  {
    id: 'extreme_poverty',
    label: { es: 'Pobreza extrema', en: 'Extreme poverty' },
    measures: [
      { id: 'hours', indicator: 'hours_extreme_poverty', label: { es: 'Horas', en: 'Hours' } },
      { id: 'percent', indicator: 'pct_extreme_poverty', label: { es: 'Porcentaje', en: 'Share' } },
    ],
  },
  {
    id: 'not_covered',
    label: { es: 'Sin protección social', en: 'Without social protection' },
    measures: [
      { id: 'hours', indicator: 'hours_not_covered', label: { es: 'Horas', en: 'Hours' } },
      { id: 'percent', indicator: 'pct_not_covered', label: { es: 'Porcentaje', en: 'Share' } },
    ],
  },
];

function conditionOptionForIndicator(indicatorId) {
  return CONDITION_OPTIONS.find(opt => opt.measures.some(m => m.indicator === indicatorId)) || CONDITION_OPTIONS[0];
}

function conditionMeasureForIndicator(option, indicatorId) {
  return option.measures.find(m => m.indicator === indicatorId) || option.measures[0];
}

function productivityReadingLabel(direction, lang) {
  const unit = FUNCTIONAL_UNITS.find(u => u.id === State.get('functionalUnit')) || FUNCTIONAL_UNITS[0];
  const laborInput = State.get('productivityLaborInput') || 'hours';
  const inverse = direction.id === 'unit_per_hour';
  if (laborInput === 'workers') {
    const text = inverse
      ? (lang === 'en' ? 'Productivity per worker' : 'Productividad por trabajador')
      : (lang === 'en' ? 'Workers / functional unit' : 'Trabajadores / unidad funcional');
    return `${text} (${inverse ? unit.workerInverseUnit : unit.workerUnit})`;
  }
  const text = inverse
    ? (lang === 'en' ? 'Physical productivity' : 'Productividad física')
    : (lang === 'en' ? 'Labour intensity' : 'Intensidad laboral');
  return `${text} (${inverse ? unit.inverseUnit : unit.unit})`;
}

async function renderTradeOptions(body, lang) {
  const labels = lang === 'en'
    ? {
      flow: 'Flow',
      product: 'Product',
      both: 'Imports + exports',
      imports: 'Imports',
      exports: 'Exports',
      total: 'Total',
      rest: 'Other',
      selectCountry: 'Select a country on the map or in the territory list to see its main products.',
      measureNote: 'Map flows use tonnes and embedded hours when available.',
    }
    : {
      flow: 'Flujo',
      product: 'Producto',
      both: 'Importaciones + exportaciones',
      imports: 'Importaciones',
      exports: 'Exportaciones',
      total: 'Total',
      rest: 'Resto',
      selectCountry: 'Selecciona un país en el mapa o en territorio para ver sus productos principales.',
      measureNote: 'El mapa usa toneladas y horas embebidas cuando están disponibles.',
    };
  const selectedIso = (State.get('selectedCountries') || [])[0] || State.get('focusedCountry');
  const currentYear = State.get('currentYear');
  const flow = State.get('tradeFlow') || 'both';
  let options = [{ id: '__total__', label: labels.total }];

  try {
    if (selectedIso) {
      const yearData = await DataLoader.loadBilateralYear(currentYear);
      options = tradeProductsForCountry(yearData, selectedIso, flow, labels);
    } else {
      const index = await DataLoader.loadBilateralIndex();
      options = [
        { id: '__total__', label: labels.total },
        ...(index.global_top_products || []).slice(0, 14).map(([name]) => ({ id: name, label: name })),
        { id: '__other__', label: labels.rest },
      ];
    }
  } catch (e) {
    console.warn('[right-panel] bilateral options unavailable', e);
  }

  const currentProduct = State.get('tradeProduct') || '__total__';
  if (!options.some(opt => opt.id === currentProduct)) {
    window.setTimeout(() => State.set('tradeProduct', '__total__'), 0);
  }

  body.innerHTML = `
    <label class="rp-select-row" title="${escapeHtml(selectedIso ? labels.measureNote : labels.selectCountry)}">
      <span>${labels.product}</span>
      <select data-trade-product>
        ${options.map(opt => `<option value="${escapeHtml(opt.id)}" ${opt.id === currentProduct ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
      </select>
    </label>
    <div class="rp-note">${escapeHtml(selectedIso ? labels.measureNote : labels.selectCountry)}</div>
  `;
  body.querySelector('[data-trade-product]')?.addEventListener('change', e => State.set('tradeProduct', e.target.value));
}

function tradeProductsForCountry(yearData, iso, flow, labels) {
  const country = yearData?.countries?.[iso];
  const totals = new Map();
  const add = row => {
    if (!row || row[0] === '__total__') return;
    const key = row[0];
    totals.set(key, (totals.get(key) || 0) + (+row[1] || 0));
  };
  if (country) {
    if (flow !== 'exports') (country.imports?.products || []).forEach(add);
    if (flow !== 'imports') (country.exports?.products || []).forEach(add);
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return [
    { id: '__total__', label: labels.total },
    ...rows.map(([name]) => ({ id: name, label: name === '__other__' ? labels.rest : name })),
  ];
}

async function renderTerritoriesLegacy() {
  const list = document.getElementById('rp-territory-list');
  const search = document.getElementById('rp-territory-search');
  if (!list) return;
  const lang = State.get('language');
  const scope = State.get('trendGeoScope');
  const section = document.getElementById('rp-territories-body')?.closest('.rp-section');
  const header = section?.querySelector('.rp-section-header');
  if (header) {
    header.firstChild.textContent = scope === 'region'
      ? (lang === 'en' ? 'REGIONS' : 'REGIONES')
      : scope === 'world'
        ? (lang === 'en' ? 'WORLD' : 'MUNDO')
        : (lang === 'en' ? 'COUNTRIES' : 'PAÍSES');
  }
  if (scope === 'world') {
    if (search) search.style.display = 'none';
    list.innerHTML = `<div class="rp-territory selected"><span>${lang === 'en' ? 'World' : 'Mundo'}</span><span style="color:rgba(255,255,255,0.72); font-size:10px;">WORLD</span></div>`;
    return;
  }
  if (search) search.style.display = '';
  if (scope === 'region') {
    let regions = [];
    try {
      const rows = (await DataLoader.loadRegions()).rows || [];
      regions = [...new Set(rows.map(r => r.region_un).filter(r => r && r !== 'World'))].sort();
    } catch (e) {
      list.innerHTML = '<div style="padding:8px 10px; color:var(--c-text-3); font-size:12px;">No se pudo cargar el índice de regiones.</div>';
      return;
    }
    function paintRegions(filter) {
      const f = normalizeSearchText(filter || '');
      const sel = State.get('selectedRegions');
      list.innerHTML = regions
        .filter(r => !f || normalizeSearchText(r).includes(f))
        .map(r => `<div class="rp-region ${sel.includes(r) ? 'selected' : ''}" data-region="${escapeHtml(r)}">
          <span>${escapeHtml(r)}</span>
        </div>`).join('');
      list.querySelectorAll('.rp-region').forEach(el => {
        el.addEventListener('click', () => State.toggleRegion(el.dataset.region));
      });
    }
    paintRegions('');
    if (search) search.oninput = e => paintRegions(e.target.value);
    return;
  }
  let countries = [];
  try {
    const idx = await DataLoader.loadCategoriesIndex();
    countries = (idx && idx.countries) || [];
  } catch (e) {
    list.innerHTML = '<div style="padding:8px 10px; color:var(--c-text-3); font-size:12px;">No se pudo cargar el índice de países.</div>';
    return;
  }
  countries.sort((a, b) => a.country.localeCompare(b.country));

  function paint(filter) {
    const f = (filter || '').toLowerCase();
    const sel = State.get('selectedCountries');
    list.innerHTML = countries
      .filter(c => !f || c.country.toLowerCase().includes(f) || c.iso3.toLowerCase().includes(f))
      .slice(0, 250)
      .map(c => `<div class="rp-territory ${sel.includes(c.iso3) ? 'selected' : ''}" data-iso="${c.iso3}">
        <span>${escapeHtml(c.country)}</span><span style="color:var(--c-text-3); font-size:10px;">${escapeHtml(c.iso3)}</span>
      </div>`).join('');
    list.querySelectorAll('.rp-territory').forEach(el => {
      el.addEventListener('click', () => State.toggleCountry(el.dataset.iso));
    });
  }

  paint('');
  if (search) search.oninput = e => paint(e.target.value);
}

async function renderTerritories() {
  const body = document.getElementById('rp-territories-body');
  if (!body) return;
  const lang = State.get('language');
  const view = State.get('activeView');
  const activeCategory = State.get('activeCategory');
  const rawScope = State.get('trendGeoScope');
  const scope = activeCategory === 'trade' || view === 'country'
    ? 'country'
    : (view === 'map' && rawScope === 'world' ? 'country' : rawScope);
  const section = body.closest('.rp-section');
  const header = section?.querySelector('.rp-section-header');
  if (header) header.firstChild.textContent = lang === 'en' ? 'TERRITORY' : 'TERRITORIO';
  const labels = lang === 'en'
    ? {
      countries: 'Countries',
      regions: 'Regions',
      world: 'World',
      all: 'All',
      clear: 'Clear',
      selectedWorld: 'World selected',
      countrySearch: 'Search country...',
      regionSearch: 'Search region...',
      loadCountriesError: 'Could not load country index.',
      loadRegionsError: 'Could not load region index.',
    }
    : {
      countries: 'Países',
      regions: 'Regiones',
      world: 'Mundo',
      all: 'Todos',
      clear: 'Limpiar',
      selectedWorld: 'Mundo seleccionado',
      countrySearch: 'Buscar país...',
      regionSearch: 'Buscar región...',
      loadCountriesError: 'No se pudo cargar el índice de países.',
      loadRegionsError: 'No se pudo cargar el índice de regiones.',
    };

  body.innerHTML = `
    <div class="rp-territory-mode" role="group" aria-label="Territorio">
      ${(activeCategory === 'trade' || view === 'country'
        ? [
          ['country', labels.countries],
        ]
        : view === 'map'
        ? [
          ['country', labels.countries],
          ['region', labels.regions],
        ]
        : [
          ['country', labels.countries],
          ['region', labels.regions],
          ['world', labels.world],
        ]).map(([id, label]) => `<button class="rp-mini-choice ${id === scope ? 'selected' : ''}" type="button" data-territory-scope="${id}">${label}</button>`).join('')}
    </div>
    <div class="rp-territory-actions" id="rp-territory-actions"></div>
    <div class="rp-search" id="rp-territory-search-wrap">
      <input type="text" id="rp-territory-search" placeholder="${scope === 'region' ? labels.regionSearch : labels.countrySearch}">
    </div>
    <div id="rp-territory-list"></div>
  `;
  body.querySelectorAll('[data-territory-scope]').forEach(btn => {
    btn.addEventListener('click', () => State.set('trendGeoScope', btn.dataset.territoryScope));
  });

  const actions = document.getElementById('rp-territory-actions');
  const list = document.getElementById('rp-territory-list');
  const search = document.getElementById('rp-territory-search');
  const searchWrap = document.getElementById('rp-territory-search-wrap');

  if (scope === 'world') {
    if (searchWrap) searchWrap.style.display = 'none';
    if (actions) actions.innerHTML = `<span class="rp-territory-note">${labels.selectedWorld}</span>`;
    list.innerHTML = `<div class="rp-territory selected"><span>${labels.world}</span><span style="color:rgba(255,255,255,0.72); font-size:10px;">WORLD</span></div>`;
    return;
  }

  if (scope === 'region') {
    let regions = [];
    try {
      const rows = (await DataLoader.loadRegions()).rows || [];
      regions = [...new Set(rows.map(r => r.region_un).filter(r => r && r !== 'World'))].sort();
    } catch (e) {
      list.innerHTML = `<div class="rp-empty">${labels.loadRegionsError}</div>`;
      return;
    }
    if (actions) {
      actions.innerHTML = `
        <button type="button" class="rp-territory-action rp-territory-action-all" data-territory-all>${labels.all}</button>
        <button type="button" class="rp-territory-action rp-territory-action-clear" data-territory-clear>${labels.clear}</button>
      `;
      actions.querySelector('[data-territory-all]')?.addEventListener('click', () => {
        if (State.get('activeView') === 'map') State.clearRegions();
        else State.set('selectedRegions', regions);
      });
      actions.querySelector('[data-territory-clear]')?.addEventListener('click', () => State.clearRegions());
    }
    function paintRegions(filter) {
      const f = normalizeSearchText(filter || '');
      const sel = State.get('selectedRegions');
      list.innerHTML = regions
        .filter(r => !f || normalizeSearchText(r).includes(f))
        .map(r => `<div class="rp-region ${sel.includes(r) ? 'selected' : ''}" data-region="${escapeHtml(r)}">
          <span>${escapeHtml(r)}</span>
        </div>`).join('');
      list.querySelectorAll('.rp-region').forEach(el => {
        el.addEventListener('click', () => State.toggleRegion(el.dataset.region));
      });
    }
    paintRegions('');
    if (search) search.oninput = e => paintRegions(e.target.value);
    return;
  }

  let countries = [];
  try {
    const idx = await DataLoader.loadCategoriesIndex();
    countries = (idx && idx.countries) || [];
  } catch (e) {
    list.innerHTML = `<div class="rp-empty">${labels.loadCountriesError}</div>`;
    return;
  }
  countries.sort((a, b) => a.country.localeCompare(b.country));
  if (actions) {
    actions.innerHTML = `
      <button type="button" class="rp-territory-action rp-territory-action-all" data-territory-all>${labels.all}</button>
      <button type="button" class="rp-territory-action rp-territory-action-clear" data-territory-clear>${labels.clear}</button>
    `;
    actions.querySelector('[data-territory-all]')?.addEventListener('click', () => {
      if (State.get('activeCategory') === 'trade') State.clearCountries();
      else if (State.get('activeView') === 'map') State.clearCountries();
      else State.set('selectedCountries', countries.map(c => c.iso3));
    });
    actions.querySelector('[data-territory-clear]')?.addEventListener('click', () => State.clearCountries());
  }

  function paint(filter) {
    const f = normalizeSearchText(filter || '');
    const sel = State.get('selectedCountries');
    list.innerHTML = countries
      .filter(c => !f || normalizeSearchText(`${c.country} ${c.iso3}`).includes(f))
      .slice(0, 250)
      .map(c => `<div class="rp-territory ${sel.includes(c.iso3) ? 'selected' : ''}" data-iso="${c.iso3}">
        <span>${escapeHtml(c.country)}</span><span style="color:var(--c-text-3); font-size:10px;">${escapeHtml(c.iso3)}</span>
      </div>`).join('');
    list.querySelectorAll('.rp-territory').forEach(el => {
      el.addEventListener('click', () => {
        if (State.get('activeCategory') === 'trade' || State.get('activeView') === 'country') State.focusCountry(el.dataset.iso);
        else State.toggleCountry(el.dataset.iso);
      });
    });
  }

  paint('');
  if (search) search.oninput = e => paint(e.target.value);
}

function renderTerritoriesHighlight() {
  const sel = State.get('selectedCountries');
  document.querySelectorAll('.rp-territory').forEach(el => {
    el.classList.toggle('selected', sel.includes(el.dataset.iso));
  });
  const rsel = State.get('selectedRegions');
  document.querySelectorAll('.rp-region').forEach(el => {
    el.classList.toggle('selected', rsel.includes(el.dataset.region));
  });
}

async function renderCropCategories() {
  const list = document.getElementById('rp-crop-list');
  const search = document.getElementById('rp-crop-search');
  if (!list) return;
  const lang = State.get('language');
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  const metric = resolveMetric(ind, lang);
  const section = list.closest('.rp-section');
  const canFilterCrops = supportsCropCategory(ind);
  if (!canFilterCrops && State.get('cropCategoryFilter') !== null) {
    window.setTimeout(() => State.set('cropCategoryFilter', null), 0);
  }
  if (section) section.style.display = canFilterCrops ? '' : 'none';
  if (!canFilterCrops) {
    list.innerHTML = '';
    if (search) search.oninput = null;
    return;
  }
  let cats = [];
  try {
    const idx = await DataLoader.loadCategoriesIndex();
    cats = (idx && idx.categories_all) || [];
  } catch (e) {
    list.innerHTML = '<div style="padding:8px 10px; color:var(--c-text-3); font-size:12px;">No se pudo cargar el índice de categorías.</div>';
    return;
  }
  cats.sort();

  function paint(filter) {
    const f = normalizeSearchText(filter || '');
    const sel = State.get('cropCategoryFilter');
    list.innerHTML = `
      <div class="rp-crop ${sel === null ? 'selected' : ''}" data-cat=""><span class="rp-crop-name">${escapeHtml(formatCategoryLabel(null, lang))}</span></div>
      ${cats.filter(c => !f || normalizeSearchText(`${c} ${formatCategoryLabel(c, lang)}`).includes(f))
            .map(c => `<div class="rp-crop ${sel === c ? 'selected' : ''}" data-cat="${escapeHtml(c)}">
              <span class="rp-crop-name">${escapeHtml(formatCategoryLabel(c, lang))}</span>
            </div>`)
            .join('')}
    `;
    list.querySelectorAll('.rp-crop').forEach(el => {
      el.addEventListener('click', () => {
        State.set('cropCategoryFilter', el.dataset.cat || null);
        paint(search ? search.value : '');
      });
    });
  }

  paint('');
  if (search) search.oninput = e => paint(e.target.value);
}

