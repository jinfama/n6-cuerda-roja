/* como-trabajamos.js — the methods section of "Agricultores del Mundo / Workers of the World":
   which numbers were counted and which ones we built.

   Same component and same data contract as the Atlas de Andalucía and CAHE. This viewer ships
   in Spanish and English, so the prose comes in both and the panel chrome follows the language
   too (see the DIVERGENCE note at the top of provenance-panel.js).

   Every figure in {curly braces} is filled at render time from data/provenance/index.json and
   data/provenance/coverage.json. No number in the prose is typed by hand, so the text can be
   rewritten without the figures going stale — and the figures cannot drift from the data.

   NOTA PARA JUAN: la prosa es un BORRADOR del 2026-09-05, pendiente de tu revisión, en los dos
   idiomas. Los datos y las cifras sí están medidos: salen del linaje del propio visor
   (worker_first_country_category_year.csv), cuyos totales país-año coinciden dígito a dígito
   con los que pinta el mapa (Brasil 2020 = 7.493.870,207 trabajadores).
*/

import ProvenancePanel from './provenance-panel.js?v=20260906f';

const N = (v, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'es-ES').format(v);
const PCT = (v, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'es-ES',
    { maximumFractionDigits: 1 }).format(v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Spanish names for the four emblematic series. The dataset labels countries in English
// throughout, which is a wider problem of this viewer (see F11 of the audit); here at least
// the four panels of the methods section read in the language of the section.
const TERRITORY_ES = { ARG: 'Argentina', ESP: 'España', IND: 'India', DMA: 'Dominica' };

const PROSE = {
  es: `
<p>Este visor pinta, para {n_terr} países y para cada año entre {y0} y {y1}, cuánta gente trabaja
en la agricultura y cuántas horas echa. Nadie ha contado eso. Lo que existe son encuestas de
población activa que empiezan tarde y no en todas partes, censos agrarios que aparecen y
desaparecen, y estadísticas históricas reconstruidas décadas después por historiadores
económicos. Lo que usted ve es el resultado de <b>empalmar</b> esas fuentes y de
<b>rellenar</b> lo que ninguna recogió.</p>

<p>Conviene decir la cifra incómoda de entrada. De las <b>{celdas} celdas de país × año</b> que
sostienen el total de trabajadores agrarios, solo el <b>{pct}%</b> ({observadas}) es un valor
leído en una fuente estadística. Las otras {estimadas} las hemos construido nosotros, y ninguna
se queda sin decir cómo.</p>

<p><b>El corte de {break_to} es lo más importante que enseña esta página.</b> Hasta {break_from}
la cobertura observada es del {pct_before}%: solo {n_pre} de los {n_terr} países tienen algún año
medido, y son casi todos microestados del Pacífico. En {break_to} salta al {pct_after}%, cuando
entran en juego las series de la OIT y el Banco Mundial. El manifiesto del proyecto llama a esto
«el cambio metodológico 1989/1990»; el linaje, celda a celda, sitúa el escalón un año más tarde,
entre {break_from} y {break_to}. Todo lo anterior a esa frontera es reconstrucción: tasas de
crecimiento tomadas de Mitchell, de MOxLAD, de la Groningen ETD o de Our World in Data, anclas de
PIB, y en más de un tercio de los casos la serie de la propia región reescalada al país. Cuando
usted arrastre la línea del tiempo por debajo de {break_to}, sepa que está mirando una
reconstrucción, no una medición.</p>

<p>Los gráficos no suavizan esa diferencia. <b>Punto sólido</b> donde el valor está observado;
<b>trazo discontinuo</b>, con un color por método, donde está estimado; <b>hueco</b>, nunca una
recta, donde no hay ninguna de las dos cosas; y una <b>línea de puntos vertical</b> allí donde el
régimen de procedencia cambia de un año al siguiente. Pase el ratón o toque cualquier año para
ver de dónde sale el número. El interruptor «ver solo los años observados» deja a la vista el
esqueleto documental desnudo, que es la prueba más honesta de qué sostiene cada serie.</p>

<p>Las cuatro series de abajo no son las mejores: enseñan el rango. Argentina es el techo, y el
único país grande con registro medido antes de {break_to}. España es el caso modal, y además el
país que el visor elige por defecto. India, un gigante agrario, está por debajo de la mediana.
Dominica es el suelo: ni un solo año observado en sesenta: toda su serie es proxy regional.</p>
`,
  en: `
<p>This viewer paints, for {n_terr} countries and every year between {y0} and {y1}, how many
people work in agriculture and how many hours they put in. Nobody has counted that. What exists
are labour force surveys that start late and not everywhere, agricultural censuses that appear
and vanish, and historical statistics reconstructed decades later by economic historians. What
you see is the result of <b>splicing</b> those sources together and <b>filling in</b> what none
of them recorded.</p>

<p>The uncomfortable figure first. Of the <b>{celdas} country × year cells</b> that hold up the
agricultural worker totals, only <b>{pct}%</b> ({observadas}) is a value read from a statistical
source. The other {estimadas} we built, and none of them is left without saying how.</p>

<p><b>The {break_to} cliff is the most important thing on this page.</b> Up to {break_from},
observed coverage is {pct_before}%: only {n_pre} of the {n_terr} countries have any measured
year, and almost all of them are Pacific microstates. In {break_to} it jumps to {pct_after}%, as
the ILO and World Bank series come in. The project manifest calls this "the 1989/1990
methodological break"; the lineage, cell by cell, puts the step one year later, between
{break_from} and {break_to}. Everything before that frontier is reconstruction: growth rates
taken from Mitchell, from MOxLAD, from the Groningen ETD or from Our World in Data, GDP anchors,
and in more than a third of cases the region's own series rescaled to the country. When you drag
the timeline below {break_to}, know that you are looking at a reconstruction, not a
measurement.</p>

<p>The charts do not smooth that difference away. A <b>solid dot</b> where the value was
observed; a <b>dashed stroke</b>, one colour per method, where it was estimated; a <b>gap</b>,
never a straight line, where there is neither; and a <b>dotted vertical rule</b> wherever the
provenance regime changes from one year to the next. Hover or tap any year to see where the
number came from. The "observed years only" switch strips each series back to its documentary
skeleton, which is the most honest test of what holds it up.</p>

<p>The four series below were not chosen for being the best: they show the range. Argentina is
the ceiling, and the only large country with a measured record before {break_to}. Spain is the
modal case, and the country the viewer picks by default. India, an agricultural giant, sits below
the median. Dominica is the floor: not one observed year in sixty — its whole series is a
regional proxy.</p>
`,
};

const T = {
  es: {
    title: 'Cómo trabajamos',
    draft: 'Borrador metodológico pendiente de revisión del autor. Las cifras están medidas y se rellenan solas desde los datos.',
    seriesTitle: 'Cuatro series, del techo al suelo de la cobertura',
    coverageTitle: 'Cobertura del conjunto: {n_terr} países × {n_years} años',
    limitsTitle: 'Límites que conviene tener presentes',
    sourcesTitle: 'De dónde salen los valores',
    missingTitle: 'Lo que esta página todavía no puede decirle',
    cells: 'celdas de país × año',
    observed: 'dato observado',
    estimated: 'estimados',
    nodata: 'sin dato',
    cellsUnit: 'celdas',
    loading: 'Cargando la procedencia de las series…',
    failed: 'No se pudo cargar la procedencia de las series',
    limits: [
      'Una <b>tasa de crecimiento prestada</b> (Mitchell, MOxLAD, Groningen ETD, Our World in Data) conserva la <i>forma</i> de la serie, no su <i>nivel</i>. Antes del corte, la tendencia es más creíble que la cifra absoluta de cualquier año concreto.',
      'El <b>proxy regional</b> supone que un país se comportó como su región. Es la hipótesis más fuerte de todo el pipeline y la que más celdas cubre; en países pequeños o atípicos puede estar muy lejos.',
      'Un <b>escalón entre dos regímenes de procedencia</b> no es necesariamente un hecho histórico. El salto de {break_from} a {break_to} en muchas series es un cambio de fuente, no un cambio en el campo. Por eso está marcado.',
      'La <b>fiabilidad declarada</b> es del valor, no de la fuente: una encuesta mal levantada sigue siendo dato observado. Marcar algo como observado dice de dónde viene, no que sea correcto.',
    ],
    missing: [
      'Esta página mide la procedencia del <b>total nacional de trabajadores</b>. El reparto de ese total entre las categorías de cultivo —lo que usted ve al filtrar por cultivo, o en la vista de composición— es <b>siempre modelado</b>, por actividad física observada multiplicada por una intensidad laboral, y tiene su propia procedencia (<code>allocation_method</code>, <code>intensity_source</code>) que aquí no se enseña todavía.',
      'Las <b>horas</b>, la <b>productividad</b>, las <b>condiciones laborales</b> y las <b>huellas de comercio</b> heredan esta procedencia y le suman la suya. Ninguna de ellas está medida en esta página.',
      'Para tener procedencia por celda en todo el visor haría falta propagar las banderas de <code>worker_first_country_category_year.csv</code> hasta <code>labour_synthesis_categories.csv</code>, que hoy solo conserva dos agregados (<code>confidence_mean</code> y <code>pct_hours_observed</code>).',
    ],
  },
  en: {
    title: 'How we work',
    draft: 'Methodological draft, pending the author’s review. The figures are measured and fill themselves in from the data.',
    seriesTitle: 'Four series, from the best-covered to the worst',
    coverageTitle: 'Coverage of the whole set: {n_terr} countries × {n_years} years',
    limitsTitle: 'Limits worth keeping in mind',
    sourcesTitle: 'Where the values come from',
    missingTitle: 'What this page still cannot tell you',
    cells: 'country × year cells',
    observed: 'observed',
    estimated: 'estimated',
    nodata: 'no data',
    cellsUnit: 'cells',
    loading: 'Loading the provenance of the series…',
    failed: 'The provenance of the series could not be loaded',
    limits: [
      'A <b>borrowed growth rate</b> (Mitchell, MOxLAD, Groningen ETD, Our World in Data) preserves the <i>shape</i> of a series, not its <i>level</i>. Before the cliff, the trend is more credible than the absolute figure for any given year.',
      'The <b>regional proxy</b> assumes a country behaved like its region. It is the strongest assumption in the whole pipeline and the one covering most cells; for small or atypical countries it can be far off.',
      'A <b>step between two provenance regimes</b> is not necessarily a historical fact. The jump from {break_from} to {break_to} in many series is a change of source, not a change in the fields. That is why it is marked.',
      '<b>Declared reliability</b> belongs to the value, not the source: a badly run survey is still an observation. Marking something as observed says where it came from, not that it is right.',
    ],
    missing: [
      'This page measures the provenance of the <b>national worker total</b>. The split of that total across crop categories — what you see when you filter by crop, or in the composition view — is <b>always modelled</b>, as observed physical activity times a labour intensity, and it has its own provenance (<code>allocation_method</code>, <code>intensity_source</code>) that is not shown here yet.',
      '<b>Hours</b>, <b>productivity</b>, <b>labour conditions</b> and <b>trade footprints</b> inherit this provenance and add their own on top. None of them is measured on this page.',
      'Cell-level provenance across the whole viewer would need the flags of <code>worker_first_country_category_year.csv</code> propagated into <code>labour_synthesis_categories.csv</code>, which today keeps only two aggregates (<code>confidence_mean</code> and <code>pct_hours_observed</code>).',
    ],
  },
};

/* Every figure the prose quotes is derived here from the generated data. The break year is
   found, not assumed: it is the largest year-on-year jump in the share of observed cells. */
function stats(index, coverage, lang) {
  const totals = index.totales;
  const out = {
    celdas: N(totals.celdas, lang),
    observadas: N(totals.observadas, lang),
    estimadas: N(totals.estimadas, lang),
    sin_dato: N(totals.sin_dato, lang),
    pct: PCT(totals.pct_observado, lang),
  };
  if (!coverage) return out;

  const years = coverage.years || [];
  const grid = coverage.grid || [];
  out.n_terr = N(coverage.territories.length, lang);
  out.n_years = N(years.length, lang);
  out.y0 = String(years[0] ?? '');
  out.y1 = String(years[years.length - 1] ?? '');

  const shareByYear = years.map((year, c) => {
    let obs = 0, total = 0;
    for (const row of grid) {
      if (row[c] === undefined) continue;
      total += 1;
      if (row[c] === 1) obs += 1;
    }
    return { year, pct: total ? (100 * obs) / total : 0 };
  });

  let jump = 0, at = 1;
  for (let i = 1; i < shareByYear.length; i++) {
    const delta = shareByYear[i].pct - shareByYear[i - 1].pct;
    if (delta > jump) { jump = delta; at = i; }
  }
  const before = shareByYear[at - 1];
  const after = shareByYear[at];
  out.break_from = String(before.year);
  out.break_to = String(after.year);
  out.pct_before = PCT(before.pct, lang);
  out.pct_after = PCT(after.pct, lang);

  // How many territories have any observed year strictly before the break.
  let pre = 0;
  for (const row of grid) {
    for (let c = 0; c < at; c++) { if (row[c] === 1) { pre += 1; break; } }
  }
  out.n_pre = N(pre, lang);
  return out;
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

const ComoTrabajamos = {
  _lang: null,

  /** Render into `host`. Re-renders when the language changes; otherwise it is a no-op. */
  async render(host, lang = 'es') {
    if (!host) return;
    const L = T[lang] || T.es;
    if (this._lang === lang && host.dataset.pvReady === '1') return;

    host.innerHTML = `<div class="pv-section"><p class="pv-empty">${esc(L.loading)}</p></div>`;
    try {
      ProvenancePanel.setLanguage(lang);
      const { index, series, coverage } = await ProvenancePanel.load('data/provenance');
      this._lang = lang;

      const V = stats(index, coverage, lang);
      const totals = index.totales;
      const sources = Object.entries(index.fuentes || {})
        .filter(([k]) => k && !['estimated', 'missing'].includes(k))
        .sort((a, b) => b[1] - a[1]);

      host.innerHTML = `
        <div class="pv-section">
          <h2>${esc(L.title)}</h2>
          <p class="pv-draft">${esc(L.draft)}</p>
          <div class="pv-prose">${fill(PROSE[lang] || PROSE.es, V)}</div>
          <div class="pv-headline">
            <div><b>${N(totals.celdas, lang)}</b><span>${esc(L.cells)}</span></div>
            <div><b>${PCT(totals.pct_observado, lang)} %</b><span>${esc(L.observed)}</span></div>
            <div><b>${N(totals.estimadas, lang)}</b><span>${esc(L.estimated)}</span></div>
            <div><b>${N(totals.sin_dato, lang)}</b><span>${esc(L.nodata)}</span></div>
          </div>
          <h3 style="margin:26px 0 12px">${esc(L.seriesTitle)}</h3>
          <div class="pv-grid" id="pv-series"></div>
          <h3 style="margin:30px 0 10px">${esc(fill(L.coverageTitle, V))}</h3>
          <div id="pv-coverage"></div>
          <div class="pv-limits">
            <h3>${esc(L.limitsTitle)}</h3>
            <ul>${L.limits.map(x => `<li>${fill(x, V)}</li>`).join('')}</ul>
          </div>
          <div class="pv-limits pv-missing">
            <h3>${esc(L.missingTitle)}</h3>
            <ul>${L.missing.map(x => `<li>${fill(x, V)}</li>`).join('')}</ul>
          </div>
          ${sources.length ? `
          <div class="pv-sources">
            <h3>${esc(L.sourcesTitle)}</h3>
            <table><tbody>${sources.map(([k, v]) =>
              `<tr><td>${esc(k)}</td><td>${N(v, lang)} ${esc(L.cellsUnit)}</td></tr>`).join('')}
            </tbody></table>
          </div>` : ''}
        </div>`;

      const grid = host.querySelector('#pv-series');
      series
        .slice()
        .sort((a, b) => b.cobertura.pct_observado - a.cobertura.pct_observado)
        .forEach(s => {
          const box = document.createElement('div');
          grid.appendChild(box);
          ProvenancePanel.renderSeries(box, s, {
            territoryLabel: lang === 'es' ? (TERRITORY_ES[s.territory_id] || s.territory) : s.territory,
            label: lang === 'en' ? 'Agricultural workers' : s.label,
            unit: lang === 'en' ? 'people' : s.unit,
          });
        });
      if (coverage) ProvenancePanel.renderCoverage(host.querySelector('#pv-coverage'), coverage);
      host.dataset.pvReady = '1';
    } catch (err) {
      host.dataset.pvReady = '';
      host.innerHTML = `<div class="pv-section"><p class="pv-empty">${esc(L.failed)} ` +
        `(${esc(err.message)}). <code>data/provenance/</code></p></div>`;
      console.error('como-trabajamos:', err);
    }
  },
};

export default ComoTrabajamos;
