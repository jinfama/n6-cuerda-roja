// Catalogue of categories x indicators.
// Each indicator declares the data field to read, label, unit, and which
// dataset partition supplies it.

export const CATEGORIES = [
  {
    id: 'labour',
    label: { es: 'Trabajo agrario', en: 'Agricultural labour' },
    icon: 'workers',
    indicators: [
      { id: 'workers',          field: 'workers',          label: { es: 'Trabajadores',           en: 'Workers' },             unit: 'personas', source: 'regions' },
      { id: 'hours_total',      field: 'hours_total',      label: { es: 'Horas totales',          en: 'Total hours' },         unit: 'h/año',    source: 'regions' },
      { id: 'hours_per_worker', field: 'hours_per_worker', label: { es: 'Horas por trabajador',   en: 'Hours per worker' },    unit: 'h',        source: 'regions', cropFilter: false },
      { id: 'area_harvested',   field: 'area_harvested',   label: { es: 'Superficie cosechada',   en: 'Area harvested' },      unit: 'ha',       source: 'regions' },
      { id: 'livestock_units',  field: 'livestock_units',  label: { es: 'Unidades de ganado',     en: 'Livestock units' },     unit: 'UG',       source: 'regions' },
      { id: 'production_tonnes',field: 'production_tonnes',label: { es: 'Producción (toneladas)', en: 'Production (tonnes)' }, unit: 't',        source: 'regions' },
    ],
  },
  {
    id: 'productivity',
    label: { es: 'Productividad', en: 'Productivity' },
    icon: 'efficiency',
    indicators: [
      { id: 'h_per_functional_unit', field: 'h_per_tonne', label: { es: 'Productividad física', en: 'Physical productivity' }, unit: 'UF/h', source: 'regions', functionalUnit: true },
      { id: 'va_per_worker', field: 'va_per_worker', label: { es: 'Valor añadido / trabajador', en: 'Value added / worker' }, unit: 'USD/trab.', source: 'regions', cropFilter: false },
    ],
  },
  {
    id: 'conditions',
    label: { es: 'Condiciones laborales', en: 'Labour conditions' },
    icon: 'scale',
    indicators: [
      { id: 'monthly_wage',        field: 'monthly_wage',        label: { es: 'Salario mensual',            en: 'Monthly wage' },          unit: 'USD-PPP', source: 'regions', cropFilter: false },
      { id: 'va_per_worker',       field: 'va_per_worker',       label: { es: 'Valor añadido / trabajador', en: 'Value added / worker' },  unit: 'USD',     source: 'regions', cropFilter: false },
      { id: 'pct_child_labor',     field: 'pct_child_labor',     label: { es: '% trabajo infantil',         en: '% child labour' },        unit: '%',       source: 'regions', cropFilter: false, warn: true },
      { id: 'hours_child_labor',   field: 'hours_child_labor',   label: { es: 'Horas de trabajo infantil',  en: 'Child labour hours' },    unit: 'h/año',   source: 'regions', cropFilter: false, conditionHours: true, rateField: 'pct_child_labor', warn: true },
      { id: 'pct_forced_labor',    field: 'pct_forced_labor',    label: { es: '% trabajo forzoso',          en: '% forced labour' },       unit: '%',       source: 'regions', cropFilter: false, warn: true },
      { id: 'hours_forced_labor',  field: 'hours_forced_labor',  label: { es: 'Horas de trabajo forzoso',   en: 'Forced labour hours' },   unit: 'h/año',   source: 'regions', cropFilter: false, conditionHours: true, rateField: 'pct_forced_labor', warn: true },
      { id: 'pct_extreme_poverty', field: 'pct_extreme_poverty', label: { es: '% en pobreza extrema',       en: '% extreme poverty' },     unit: '%',       source: 'regions', cropFilter: false, warn: true },
      { id: 'hours_extreme_poverty', field: 'hours_extreme_poverty', label: { es: 'Horas en pobreza extrema', en: 'Extreme-poverty hours' }, unit: 'h/año',   source: 'regions', cropFilter: false, conditionHours: true, rateField: 'pct_extreme_poverty', warn: true },
      { id: 'pct_not_covered',     field: 'pct_not_covered',     label: { es: '% sin protección social',    en: '% without social cover' },unit: '%',       source: 'regions', cropFilter: false, warn: true },
      { id: 'hours_not_covered',   field: 'hours_not_covered',   label: { es: 'Horas sin protección social', en: 'Hours without social cover' }, unit: 'h/año', source: 'regions', cropFilter: false, conditionHours: true, rateField: 'pct_not_covered', warn: true },
    ],
  },
  {
    id: 'footprints',
    label: { es: 'Huellas laborales', en: 'Labour footprints' },
    icon: 'footprint',
    indicators: [
      { id: 'fp_hours_total',  field: 'footprint',          label: { es: 'Horas anuales',            en: 'Annual hours' },           unit: 'h/año', source: 'trade_footprint', footprintFlow: true },
      { id: 'fp_hours_child',  field: 'hours_child_labor',  label: { es: 'Trabajo infantil (producción propia)', en: 'Child labour (domestic output)' },  unit: 'h/año', source: 'footprints', warn: true },
      { id: 'fp_hours_forced', field: 'hours_forced_labor', label: { es: 'Trabajo forzoso (producción propia)', en: 'Forced labour (domestic output)' }, unit: 'h/año', source: 'footprints', warn: true },
    ],
  },
  {
    id: 'trade',
    label: { es: 'Comercio bilateral', en: 'Bilateral trade' },
    icon: 'flow',
    indicators: [
      { id: 'bilateral_trade', field: 'tonnes', label: { es: 'Flujos comerciales', en: 'Trade flows' }, unit: 't', source: 'bilateral_trade', cropFilter: false },
    ],
  },
  {
    id: 'country_profile',
    label: { es: 'País', en: 'Country' },
    icon: 'country',
    indicators: [
      { id: 'country_profile', field: 'profile', label: { es: 'Panel país', en: 'Country panel' }, unit: '', source: 'profile', cropFilter: false },
    ],
  },
];

// Quick lookup helpers.
export function getCategory(id) { return CATEGORIES.find(c => c.id === id); }
export function getIndicator(catId, indId) {
  const c = getCategory(catId);
  return c ? c.indicators.find(i => i.id === indId) : null;
}

// SVG icon paths — one per category, used in the sidebar.
export const ICON_PATHS = {
  workers:    'M7.4 9.2a2.35 2.35 0 1 0 0-4.7 2.35 2.35 0 0 0 0 4.7ZM16.6 9.2a2.35 2.35 0 1 0 0-4.7 2.35 2.35 0 0 0 0 4.7ZM3.9 18.5v-1.8a3.6 3.6 0 0 1 7.2 0v1.8M12.9 18.5v-1.8a3.6 3.6 0 0 1 7.2 0v1.8M10.7 12.3h2.6',
  efficiency: 'M4.2 18.2h15.6M5.8 16.2l3.6-5.7 3.2 3.2 5.4-8.1M15.3 5.6H18v2.7M7.2 6.8c2.4 0 4 1.7 4 4-2.5 0-4-1.5-4-4Z',
  scale:      'M12 4v14.5M5.2 7.7h13.6M7.2 7.7 4.1 13h6.2L7.2 7.7ZM16.8 7.7 13.7 13h6.2l-3.1-5.3ZM8.2 18.8h7.6',
  footprint:  'M11.2 18.4c1.3.4 2.9-.4 3.4-2 .6-1.8-.4-4.3-2.2-4.9-1.7-.6-3.7 1.2-4.2 3-.5 1.6.5 3.5 3 3.9ZM5.5 10.9c.8.2 1.7-.4 1.9-1.4.2-1.1-.3-2.2-1.1-2.4-.9-.2-1.8.6-2 1.6-.2 1 .3 1.9 1.2 2.2ZM11.2 7.3c.9.2 1.8-.5 2-1.5.2-1-.4-2.1-1.2-2.3-.9-.2-1.8.6-2 1.6-.2 1 .3 1.9 1.2 2.2ZM17.2 9.2c.8.2 1.7-.4 1.9-1.4.2-.9-.2-1.9-1-2.1-.8-.2-1.7.5-1.9 1.4-.2 1 .2 1.9 1 2.1Z',
  flow:       'M4 7.2h10.8M11.8 4.2l3 3-3 3M20 16.8H9.2M12.2 13.8l-3 3 3 3M5 16.8h2M19 7.2h-2',
  country:    'M12 20.8s6.5-4.9 6.5-11.3a6.5 6.5 0 1 0-13 0c0 6.4 6.5 11.3 6.5 11.3ZM9.2 9.5h5.6M12 6.7c1.2 1.2 1.8 2.1 1.8 3.2S13.2 12 12 13.3c-1.2-1.2-1.8-2.2-1.8-3.4S10.8 7.9 12 6.7Z',
};

