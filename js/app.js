// Main controller. Orchestrates landing → app handoff and wires components.

import { State } from './state.js';
import { DataLoader } from './data-loader.js?v=20260522-tildes1';
import { getCategory } from './indicators.js?v=20260522-tildes1';
import { initLanding } from './landing.js?v=20260522-tildes1';
import { initSidebar } from './sidebar.js?v=20260522-mobile1';
import { initQueryBar } from './query-bar.js?v=20260522-info1';
import { initTimeline } from './timeline.js?v=20260522-info1';
import { initRightPanel } from './right-panel.js?v=20260522-yaxis1';
import { initMapView } from './views/map.js?v=20260522-mobile1';
import { initTrendView } from './views/trend.js?v=20260522-hover1';
import { initRankingView } from './views/ranking.js?v=20260522-hover1';
import { initTreemapView } from './views/treemap.js?v=20260522-hover1';
import { initTableView } from './views/table.js?v=20260522-tildes1';
import { initCountryPanelView } from './views/country-panel.js?v=20260522-hover1';
import { initAboutView } from './views/about.js?v=20260522-about1';

const VIEWS = ['map', 'trend', 'ranking', 'treemap', 'table', 'country', 'about'];
let _lastDataView = 'map';

function ensureTrendDefaultSelection() {
  if (State.get('trendGeoScope') !== 'country') return;
  const selected = State.get('selectedCountries') || [];
  if (!selected.length) State.set('selectedCountries', ['ESP']);
}

function switchView(view) {
  if (view === 'trend') ensureTrendDefaultSelection();
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
    const mobilePanelMq = window.matchMedia ? window.matchMedia('(max-width: 700px)') : null;
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

  // Apply initial language (already set by landing's language switcher).
  applyAppI18n(State.get('language'));
  State.subscribe('language', applyAppI18n);
  syncProfileChrome();
  State.subscribe('activeCategory', syncProfileChrome);
}

function applyAppI18n(lang) {
  const D = {
    es: { source: 'Fuente: FAO · ILO · World Bank · GSI · pipeline labour (Infante-Amate, UGR)' },
    en: { source: 'Source: FAO · ILO · World Bank · GSI · labour pipeline (Infante-Amate, UGR)' },
  };
  const f = document.getElementById('footer-source');
  if (f && D[lang]) f.textContent = D[lang].source;
}

// ---------- bootstrap ----------
initLanding({ onEnter: bootApp });

