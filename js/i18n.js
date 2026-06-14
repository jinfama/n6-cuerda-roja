// Minimal i18n. Strings live here; data-i18n attributes in HTML reference keys.

const DICT = {
  es: {
    // Nav
    'nav.dashboard':   'Panorama',
    'nav.workers':     'Trabajo agrario',
    'nav.conditions':  'Condiciones',
    'nav.trade':       'Comercio',
    'nav.footprints':  'Huellas',
    'nav.about':       'Acerca',

    // Hero
    'hero.eyebrow':    '',
    'hero.title':      'Agricultores del Mundo',
    'hero.subtitle':   'Base de datos global sobre el trabajo agrario<br>en perspectiva hist\u00f3rica',
    'hero.cta':        'Explorar',

    'kpi.workers':     'trabajadores agrarios (2021)',
    'kpi.hours':       'horas trabajadas / año',
    'kpi.child':       'trabajo infantil',
    'kpi.forced':      'trabajo forzoso',

    // Dashboard
    'dashboard.title':         'Panorama global',
    'dashboard.lead':          'Trabajadores y horas en la agricultura mundial en perspectiva hist\u00f3rica.',
    'dashboard.kpi.workers':   'Trabajadores agrarios en 2021',
    'dashboard.kpi.hours':     'Horas anuales trabajadas',
    'dashboard.kpi.child':     'Horas en trabajo infantil',
    'dashboard.kpi.forced':    'Horas en trabajo forzoso',
    'dashboard.trend.title':   'Evolución mundial (1962–2021)',
    'dashboard.trend.lead':    'Total mundial de trabajadores agrarios y horas trabajadas al año.',
    'dashboard.regions.title': 'Composición regional',
    'dashboard.regions.lead':  'Distribución de las horas trabajadas por las seis grandes regiones.',

    // Other sections
    'workers.title':    'Trabajo agrario en perspectiva de largo plazo',
    'workers.lead':     'Trabajadores y horas por país y categoría de cultivo, 1962–2021.',
    'conditions.title': 'Condiciones laborales',
    'conditions.lead':  'Salarios, valor añadido, protección social y trabajo infantil/forzoso, con cobertura temporal variable según indicador.',
    'trade.title':      'Comercio bilateral',
    'trade.lead':       'Flujos comerciales agrarios entre países, con sus huellas de horas y de condiciones.',
    'footprints.title': 'Huellas laborales',
    'footprints.lead':  'Trabajadores reales frente a horas embebidas en importaciones y exportaciones.',
    'about.title':      'Sobre esta web',

    'footer.license':   'CC-BY 4.0 (propuesta)',
    'footer.cite':      'Cómo citar',
  },

  en: {
    'nav.dashboard':   'Overview',
    'nav.workers':     'Agricultural labour',
    'nav.conditions':  'Conditions',
    'nav.trade':       'Trade',
    'nav.footprints':  'Footprints',
    'nav.about':       'About',

    'hero.eyebrow':    '',
    'hero.title':      'Farmers of the World',
    'hero.subtitle':   'A global database on agricultural labour<br>in historical perspective',
    'hero.cta':        'Explore',

    'kpi.workers':     'agricultural workers (2021)',
    'kpi.hours':       'hours worked / year',
    'kpi.child':       'child labour',
    'kpi.forced':      'forced labour',

    'dashboard.title':         'Global overview',
    'dashboard.lead':          'Workers and hours in world agriculture in historical perspective.',
    'dashboard.kpi.workers':   'Agricultural workers in 2021',
    'dashboard.kpi.hours':     'Annual hours worked',
    'dashboard.kpi.child':     'Hours in child labour',
    'dashboard.kpi.forced':    'Hours in forced labour',
    'dashboard.trend.title':   'World evolution (1962–2021)',
    'dashboard.trend.lead':    'World totals of agricultural workers and hours worked per year.',
    'dashboard.regions.title': 'Regional composition',
    'dashboard.regions.lead':  'Distribution of hours worked across the six major regions.',

    'workers.title':    'Agricultural labour in long-term perspective',
    'workers.lead':     'Workers and hours by country and crop category, 1962–2021.',
    'conditions.title': 'Labour conditions',
    'conditions.lead':  'Wages, value added, social protection, child and forced labour, with indicator-specific temporal coverage.',
    'trade.title':      'Bilateral trade',
    'trade.lead':       'Agricultural trade flows between countries with their labour and social footprints.',
    'footprints.title': 'Labour footprints',
    'footprints.lead':  'Real workers versus hours embedded in imports and exports.',
    'about.title':      'About this site',

    'footer.license':   'CC-BY 4.0 (proposed)',
    'footer.cite':      'How to cite',
  },
};

let _lang = 'es';
const _subs = [];

export const I18n = {
  setLanguage(lang) {
    if (DICT[lang] && lang !== _lang) {
      _lang = lang;
      document.documentElement.lang = lang;
      document.body.classList.toggle('lang-es', lang === 'es');
      document.body.classList.toggle('lang-en', lang === 'en');
      _subs.forEach(fn => fn(lang));
    }
  },
  getLanguage() { return _lang; },
  t(key)        { return (DICT[_lang] && DICT[_lang][key]) || key; },
  subscribe(fn) { _subs.push(fn); return () => { const i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); }; },
};

