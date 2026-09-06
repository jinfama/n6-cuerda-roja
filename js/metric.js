// Active metric resolver.
// It keeps UI labels, units, inverted productivity readings and year ranges
// consistent across map, trends, ranking, table and options.

import { State } from './state.js?v=20260906f';

export const FUNCTIONAL_UNITS = [
  {
    id: 'tonne',
    field: 'h_per_tonne',
    label: { es: 'Producción (t)', en: 'Production (t)' },
    short: { es: 't', en: 't' },
    unit: 'h/t',
    inverseUnit: 't/h',
  },
  {
    id: 'ha',
    field: 'h_per_ha',
    label: { es: 'Tierra (ha)', en: 'Land (ha)' },
    short: { es: 'ha', en: 'ha' },
    unit: 'h/ha',
    inverseUnit: 'ha/h',
  },
  {
    id: 'LU',
    field: 'h_per_LU',
    label: { es: 'Ganado (UG)', en: 'Livestock (LU)' },
    short: { es: 'UG', en: 'LU' },
    unit: 'h/UG',
    inverseUnit: 'UG/h',
    denominator: 'livestock_units',
    workerUnit: 'trab./UG',
    workerInverseUnit: 'UG/trab.',
  },
  {
    id: 'GJ',
    field: 'h_per_GJ',
    label: { es: 'Energía (GJ)', en: 'Energy (GJ)' },
    short: { es: 'GJ', en: 'GJ' },
    unit: 'h/GJ',
    inverseUnit: 'GJ/h',
    denominator: 'production_GJ',
    workerUnit: 'trab./GJ',
    workerInverseUnit: 'GJ/trab.',
  },
];

FUNCTIONAL_UNITS[0].denominator = 'production_tonnes';
FUNCTIONAL_UNITS[0].workerUnit = 'trab./t';
FUNCTIONAL_UNITS[0].workerInverseUnit = 't/trab.';
FUNCTIONAL_UNITS[1].denominator = 'area_harvested';
FUNCTIONAL_UNITS[1].workerUnit = 'trab./ha';
FUNCTIONAL_UNITS[1].workerInverseUnit = 'ha/trab.';

export const PRODUCTIVITY_DIRECTIONS = [
  {
    id: 'hours_per_unit',
    label: { es: 'Huella / intensidad', en: 'Footprint / intensity' },
  },
  {
    id: 'unit_per_hour',
    label: { es: 'Productividad / inversa', en: 'Productivity / inverse' },
  },
];

export const PRODUCTIVITY_LABOR_INPUTS = [
  { id: 'hours', label: { es: 'Horas', en: 'Hours' } },
  { id: 'workers', label: { es: 'Trabajadores', en: 'Workers' } },
];

export const FOOTPRINT_FLOWS = [
  {
    id: 'footprint',
    label: { es: 'Huella', en: 'Footprint' },
    metricLabel: { es: 'Huella de horas', en: 'Labour-hour footprint' },
    short: { es: 'Huella', en: 'Footp.' },
    description: { es: 'Consumo total: producción doméstica consumida en el país + importaciones consumidas.', en: 'Total consumption: domestic production consumed at home + consumed imports.' },
  },
  {
    id: 'imports',
    label: { es: 'Horas importadas', en: 'Imported hours' },
    metricLabel: { es: 'Horas importadas', en: 'Imported hours' },
    short: { es: 'Importadas', en: 'Imported' },
    description: { es: 'Horas agrarias incorporadas en productos importados.', en: 'Agricultural hours embodied in imported products.' },
  },
  {
    id: 'exports',
    label: { es: 'Horas exportadas', en: 'Exported hours' },
    metricLabel: { es: 'Horas exportadas', en: 'Exported hours' },
    short: { es: 'Exportadas', en: 'Exported' },
    description: { es: 'Horas agrarias incorporadas en productos exportados.', en: 'Agricultural hours embodied in exported products.' },
  },
  {
    id: 'domestic',
    label: { es: 'Horas domésticas', en: 'Domestic hours' },
    metricLabel: { es: 'Horas domésticas', en: 'Domestic hours' },
    short: { es: 'Domésticas', en: 'Domestic' },
    description: { es: 'Producción doméstica consumida dentro del país.', en: 'Domestic production consumed within the country.' },
  },
];

const YEAR_RANGES = {
  workers: [1962, 2021],
  hours_total: [1962, 2021],
  hours_per_worker: [1962, 2021],
  area_harvested: [1962, 2021],
  livestock_units: [1962, 2021],
  production_tonnes: [1962, 2021],
  h_per_functional_unit: [1962, 2021],
  h_per_ha: [1962, 2021],
  h_per_tonne: [1962, 2021],
  h_per_LU: [1962, 2021],
  tonnes_per_worker: [1962, 2021],
  GJ_per_worker: [1962, 2021],
  monthly_wage: [1962, 2021],
  va_per_worker: [1962, 2021],
  pct_child_labor: [1998, 2021],
  hours_child_labor: [1998, 2021],
  pct_forced_labor: [2021, 2021],
  hours_forced_labor: [2021, 2021],
  pct_extreme_poverty: [1962, 2021],
  hours_extreme_poverty: [1962, 2021],
  pct_not_covered: [2015, 2021],
  hours_not_covered: [2015, 2021],
  fp_hours_total: [1961, 2021],
  fp_hours_child: [1962, 2021],
  fp_hours_forced: [1962, 2021],
  bilateral_trade: [1962, 2024],
};

export function functionalUnitConfig(id) {
  return FUNCTIONAL_UNITS.find(u => u.id === id) || FUNCTIONAL_UNITS[0];
}

export function isFunctionalUnitIndicator(ind) {
  return ind && (ind.functionalUnit || ind.id === 'h_per_functional_unit');
}

export function isFootprintFlowIndicator(ind) {
  return ind && (ind.footprintFlow || ind.source === 'trade_footprint');
}

export function supportsCropCategory(ind) {
  return !!ind && ind.cropFilter !== false && ind.source === 'regions';
}

export function footprintFlowConfig(id) {
  return FOOTPRINT_FLOWS.find(f => f.id === id) || FOOTPRINT_FLOWS[0];
}

export function selectedFootprintFlows() {
  const flows = State.get('footprintFlows');
  if (Array.isArray(flows)) {
    return flows.map(footprintFlowConfig).filter(Boolean);
  }
  return [footprintFlowConfig(State.get('footprintFlow'))];
}

export function resolveMetric(ind, lang = State.get('language')) {
  if (!ind) return null;
  if (isFootprintFlowIndicator(ind)) {
    const flow = selectedFootprintFlows()[0] || footprintFlowConfig(State.get('footprintFlow'));
    return {
      ...ind,
      baseId: ind.id,
      field: flow.id,
      unit: 'h/año',
      label: { es: flow.metricLabel.es, en: flow.metricLabel.en },
      labelText: flow.metricLabel?.[lang] || flow.label[lang],
      footprintFlow: flow,
      yearRange: YEAR_RANGES[ind.id] || [1962, 2021],
      transform: null,
    };
  }
  if (ind.conditionHours) {
    return {
      ...ind,
      baseId: ind.id,
      labelText: ind.label?.[lang] || ind.id,
      yearRange: YEAR_RANGES[ind.id] || [1962, 2021],
      compute: makeConditionHoursComputer(ind.rateField),
      transform: null,
    };
  }
  if (!isFunctionalUnitIndicator(ind)) {
    return {
      ...ind,
      baseId: ind.id,
      labelText: ind.label?.[lang] || ind.id,
      yearRange: YEAR_RANGES[ind.id] || YEAR_RANGES[ind.field] || [1962, 2021],
      transform: null,
    };
  }

  const unit = functionalUnitConfig(State.get('functionalUnit'));
  const laborInput = State.get('productivityLaborInput') || 'hours';
  const direction = State.get('productivityDirection') || 'hours_per_unit';
  const inverse = direction === 'unit_per_hour';
  const label = laborInput === 'workers'
    ? (inverse
      ? { es: 'Productividad por trabajador', en: 'Productivity per worker' }
      : { es: 'Trabajadores / unidad funcional', en: 'Workers / functional unit' })
    : (inverse
      ? { es: 'Productividad física', en: 'Physical productivity' }
      : { es: 'Intensidad laboral', en: 'Labour intensity' });

  return {
    ...ind,
    baseId: ind.id,
    field: laborInput === 'hours' ? unit.field : null,
    unit: laborInput === 'workers'
      ? (inverse ? unit.workerInverseUnit : unit.workerUnit)
      : (inverse ? unit.inverseUnit : unit.unit),
    label,
    labelText: label[lang],
    functionalUnit: unit,
    productivityLaborInput: laborInput,
    productivityDirection: direction,
    yearRange: YEAR_RANGES[unit.field] || YEAR_RANGES[ind.id] || [1962, 2021],
    compute: laborInput === 'workers' ? makeWorkerProductivityComputer(unit, inverse) : null,
    transform: laborInput === 'hours' && inverse ? invertPositive : null,
  };
}

export function metricValue(row, metric) {
  if (!row || !metric) return null;
  if (metric.compute) {
    const computed = metric.compute(row);
    return computed == null || !isFinite(computed) ? null : computed;
  }
  const raw = row[metric.field];
  if (raw == null || !isFinite(raw)) return null;
  const value = metric.transform ? metric.transform(+raw) : +raw;
  return value == null || !isFinite(value) ? null : value;
}

export function metricYearRange(metric) {
  return metric?.yearRange || YEAR_RANGES[metric?.baseId] || YEAR_RANGES[metric?.id] || [1962, 2021];
}

export function metricCoverageLabel(metric, lang = State.get('language')) {
  const [from, to] = metricYearRange(metric);
  if (from === to) {
    return lang === 'en' ? `point layer: ${from}` : `capa puntual: ${from}`;
  }
  return lang === 'en' ? `data: ${from}-${to}` : `datos: ${from}-${to}`;
}

function invertPositive(value) {
  if (value == null || !isFinite(value) || value === 0) return null;
  return 1 / value;
}

function makeWorkerProductivityComputer(unit, inverse) {
  return row => {
    const workers = +row.workers;
    const denominator = +row[unit.denominator];
    if (!isFinite(workers) || !isFinite(denominator) || workers <= 0 || denominator <= 0) return null;
    return inverse ? denominator / workers : workers / denominator;
  };
}

function makeConditionHoursComputer(rateField) {
  return row => {
    const hours = +row.hours_total;
    const rate = +row[rateField];
    if (!isFinite(hours) || !isFinite(rate) || hours < 0 || rate < 0) return null;
    return hours * rate / 100;
  };
}

