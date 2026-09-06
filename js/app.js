// Main controller. The cover (index.html) is the front door; this file is the
// application and opens straight on its content.

import { State } from './state.js?v=20260906f';
import { DataLoader } from './data-loader.js?v=20260906f';
import { getCategory } from './indicators.js?v=20260906f';
import { initSidebar } from './sidebar.js?v=20260906f';
import { initQueryBar } from './query-bar.js?v=20260906f';
import { initTimeline } from './timeline.js?v=20260906h';
import { initRightPanel } from './right-panel.js?v=20260906f';
import { initMapView } from './views/map.js?v=20260906f';
import { initTrendView } from './views/trend.js?v=20260906f';
import { initRankingView } from './views/ranking.js?v=20260906f';
import { initTreemapView } from './views/treemap.js?v=20260906f';
import { initTableView } from './views/table.js?v=20260906i';
import { initCountryPanelView } from './views/country-panel.js?v=20260906f';
import { initAboutView } from './views/about.js?v=20260906f';
import { wireExportButtons } from './export-csv.js?v=20260906f';
import { wirePngButtons } from './export-png.js?v=20260906f';
import { applyUrlState, copyPermalink, readUrlState, resetToDefaults, startPermalink } from './permalink.js?v=20260906g';

const VIEWS = ['map', 'trend', 'ranking', 'treemap', 'table', 'country', 'about'];
let _lastDataView = 'map';

// Trend and treemap draw a selection instead of the whole world, so with nobody picked
// they open on a prompt. Reached from the cover that is a dead end: the reader presses
// "Composicion" and gets "selecciona un pais". Trend already seeded one country on
// entry; treemap needs the same seed for the same reason. (The table takes the other
// road -- with no pick it shows every country -- because one seeded country would be a
// one-row table.)
function ensureDefaultSelection(view) {
  if (view === 'treemap') {
    if (State.get('treemapMode') === 'countries') return;   // that mode draws every country
  } else if (view === 'trend') {
    if (State.get('trendGeoScope') !== 'country') return;   // regions and world need no pick
  } else {
    return;
  }
  const selected = State.get('selectedCountries') || [];
  if (!selected.length) State.set('selectedCountries', ['ESP']);
}

function switchView(view) {
  ensureDefaultSelection(view);
  if (view === 'about') State.set('playing', false);
  VIEWS.forEach(v => {
    const pane = document.getElementById(`panel-${v}`);
    if (pane) pane.classList.toggle('active', v === view);
  });
  document.querySelectorAll('.vw-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.getElementById('btn-info')?.classList.toggle('active', view === 'about');
  document.querySelector('.main')?.classList.toggle('about-mode', view === 'about');
  if (view !== 'about' && view !== 'country') _lastDataView = view;
  State.set('activeView', view);
}

function returnToDataView() {
  if (State.get('activeView') === 'about' || State.get('activeView') === 'country') switchView(_lastDataView || 'map');
}

function categoryDefaults(catId, firstIndicatorId) {
  const next = { activeCategory: catId, activeIndicator: firstIndicatorId };
  if (catId === 'footprints') {
    Object.assign(next, {
      trendLayout: 'facet',
      trendFacetBy: 'territory',
      footprintFlow: 'footprint',
      footprintFlows: ['footprint', 'imports', 'exports', 'domestic'],
      footprintTrendMode: 'all',
    });
  } else if (catId === 'productivity') {
    Object.assign(next, {
      productivityDirection: 'unit_per_hour',
      productivityLaborInput: 'hours',
      functionalUnit: 'tonne',
    });
  } else if (catId === 'trade') {
    Object.assign(next, {
      trendGeoScope: 'country',
      tradeFlow: 'both',
      tradeProduct: '__total__',
      tradeTopN: 10,
    });
  } else if (catId === 'country_profile') {
    Object.assign(next, {
      trendGeoScope: 'country',
      cropCategoryFilter: null,
    });
  }
  return next;
}

function activateCategory(catId) {
  const cat = getCategory(catId);
  if (cat && cat.indicators.length) {
    State.setMany(categoryDefaults(catId, cat.indicators[0].id));
  } else {
    State.set('activeCategory', catId);
  }
  if (catId === 'country_profile') switchView('country');
  else returnToDataView();
  syncProfileChrome();
}

function syncProfileChrome() {
  const profileMode = State.get('activeCategory') === 'country_profile';
  document.getElementById('right-panel')?.classList.toggle('profile-hidden', profileMode);
  document.getElementById('btn-toggle-panel')?.classList.toggle('hidden', profileMode);
  document.querySelector('.main')?.classList.toggle('profile-mode', profileMode);
}

async function bootApp() {
  // Preload manifest + regions for the default map view.
  try { await DataLoader.loadManifest(); } catch (_) {}

  initSidebar({
    onCategoryChange(catId) { activateCategory(catId); },
    onAbout() { switchView('about'); },
  });

  initQueryBar({
    onIndicatorChange(indId) {
      State.set('activeIndicator', indId);
      if (State.get('activeCategory') === 'country_profile') switchView('country');
      else returnToDataView();
    },
    onCategoryChange(catId) { activateCategory(catId); },
  });

  initTimeline();
  initRightPanel();

  // Init views.
  await initMapView();
  initTrendView();
  initRankingView();
  initTreemapView();
  initTableView();
  initCountryPanelView();
  initAboutView();

  // View switcher buttons.
  document.querySelectorAll('.vw-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  // Info button → about view.
  const infoBtn = document.getElementById('btn-info');
  if (infoBtn) infoBtn.addEventListener('click', () => {
    State.set('playing', false);
    switchView('about');
  });

  // Toggle right panel.
  const togglePanel = document.getElementById('btn-toggle-panel');
  if (togglePanel) {
    const rp = document.getElementById('right-panel');
    // The options panel is a bottom sheet from 1100px down (tablets included),
    // so it must start collapsed on every viewport that gets the sheet.
    const mobilePanelMq = window.matchMedia ? window.matchMedia('(max-width: 1100px)') : null;
    const syncMobilePanel = () => {
      if (!rp || !mobilePanelMq) return;
      const isMobile = mobilePanelMq.matches;
      rp.classList.toggle('collapsed', isMobile);
      State.set('rightPanelVisible', !isMobile);
      togglePanel.classList.toggle('active', !isMobile);
      togglePanel.setAttribute('aria-pressed', String(!isMobile));
    };
    syncMobilePanel();
    if (!mobilePanelMq) {
      togglePanel.classList.add('active');
      togglePanel.setAttribute('aria-pressed', 'true');
    }
    if (mobilePanelMq?.addEventListener) mobilePanelMq.addEventListener('change', syncMobilePanel);
    else if (mobilePanelMq?.addListener) mobilePanelMq.addListener(syncMobilePanel);
    document.getElementById('right-panel-close')?.addEventListener('click', () => {
      const rp = document.getElementById('right-panel');
      if (!rp) return;
      rp.classList.add('collapsed');
      State.set('rightPanelVisible', false);
      togglePanel.classList.remove('active');
      togglePanel.setAttribute('aria-pressed', 'false');
    });
    togglePanel.addEventListener('click', () => {
      const rp = document.getElementById('right-panel');
      if (!rp) return;
      const collapsed = rp.classList.toggle('collapsed');
      State.set('rightPanelVisible', !collapsed);
      togglePanel.classList.toggle('active', !collapsed);
      togglePanel.setAttribute('aria-pressed', String(!collapsed));
    });
  }

  // Fullscreen.
  document.getElementById('btn-fs').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // Download of the active view (query bar + footer share one handler).
  wireExportButtons();
  wirePngButtons();

  // Reset: back to the state the viewer opens in. The footer label and the
  // query-bar icon share one handler, so a phone (no footer) still has it.
  const doReset = () => {
    State.set('playing', false);
    const view = resetToDefaults();
    activateCategory(State.get('activeCategory'));
    switchView(view);
    const btn = document.getElementById('btn-reset');
    if (btn) {
      const previous = btn.textContent;
      btn.textContent = State.get('language') === 'en' ? 'Reset' : 'Reiniciado';
      window.setTimeout(() => { btn.textContent = previous; }, 1400);
    }
  };
  document.getElementById('btn-reset')?.addEventListener('click', doReset);
  document.getElementById('btn-reset-top')?.addEventListener('click', doReset);

  // Copy link, query-bar icon (the footer is hidden on a phone).
  document.getElementById('btn-link-top')?.addEventListener('click', async event => {
    const btn = event.currentTarget;
    const ok = await copyPermalink();
    btn.classList.toggle('is-done', ok);
    window.setTimeout(() => btn.classList.remove('is-done'), 1600);
  });

  // Copy link to the current view.
  document.getElementById('btn-link')?.addEventListener('click', async event => {
    const btn = event.currentTarget;
    const ok = await copyPermalink();
    const previous = btn.textContent;
    btn.textContent = ok
      ? (State.get('language') === 'en' ? 'Link copied' : 'Enlace copiado')
      : previous;
    window.setTimeout(() => { btn.textContent = previous; }, 1800);
  });

  // Language: the switch used to live on the old cover. With that cover gone the
  // viewer carries its own, so EN stays reachable without hand-editing the URL.
  initLangSwitch();
  applyAppI18n(State.get('language'));
  State.subscribe('language', applyAppI18n);
  syncProfileChrome();
  State.subscribe('activeCategory', syncProfileChrome);
}

// ES/EN switch in the sidebar plank.
function initLangSwitch() {
  const root = document.getElementById('sb-lang');
  if (!root) return;
  const buttons = [...root.querySelectorAll('button')];
  const sync = lang => {
    buttons.forEach(b => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.documentElement.lang = lang;
  };
  buttons.forEach(b => b.addEventListener('click', () => State.set('language', b.dataset.lang)));
  sync(State.get('language'));
  State.subscribe('language', sync);
}

// The app chrome is bilingual: every control added here carries both strings.
const CHROME_I18N = {
  es: {
    source: 'Fuente: FAO · ILO · World Bank · GSI · pipeline labour (Infante-Amate, UGR)',
    csv: 'Descargar CSV', csvTitle: 'Descargar los datos de esta vista en CSV',
    png: 'Descargar PNG', pngTitle: 'Descargar esta figura en PNG',
    link: 'Copiar enlace', linkTitle: 'Copiar el enlace a esta vista',
    reset: 'Reiniciar', resetTitle: 'Volver al estado inicial',
    fs: 'Pantalla completa', fsTitle: 'Pantalla completa',
  },
  en: {
    source: 'Source: FAO · ILO · World Bank · GSI · labour pipeline (Infante-Amate, UGR)',
    csv: 'Download CSV', csvTitle: 'Download the data behind this view as CSV',
    png: 'Download PNG', pngTitle: 'Download this figure as PNG',
    link: 'Copy link', linkTitle: 'Copy the link to this view',
    reset: 'Reset', resetTitle: 'Back to the initial state',
    fs: 'Full screen', fsTitle: 'Full screen',
  },
};

function applyAppI18n(lang) {
  const D = CHROME_I18N[lang] || CHROME_I18N.es;
  const f = document.getElementById('footer-source');
  if (f) f.textContent = D.source;
  const set = (id, text, title) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.title = title;
  };
  set('btn-csv', D.csv, D.csvTitle);
  set('btn-png', D.png, D.pngTitle);
  set('btn-link', D.link, D.linkTitle);
  set('btn-reset', D.reset, D.resetTitle);
  set('btn-fs', D.fs, D.fsTitle);
  const icons = [['btn-csv-top', D.csv, D.csvTitle], ['btn-png-top', D.png, D.pngTitle],
                 ['btn-link-top', D.link, D.linkTitle], ['btn-reset-top', D.reset, D.resetTitle]];
  icons.forEach(([id, label, title]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.title = title;
    el.setAttribute('aria-label', label);
  });
}

// ---------- bootstrap ----------
// No door in front of the door: the application starts on its own. A URL that
// carries state is a citation, so it is applied before the first paint and the
// app opens on the figure that was linked.
const _restored = readUrlState();
if (_restored) applyUrlState(_restored);
document.documentElement.lang = State.get('language');
bootApp().then(() => {
  if (_restored) switchView(_restored.activeView || State.get('activeView') || 'map');
  startPermalink();
});
