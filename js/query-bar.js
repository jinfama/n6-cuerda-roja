// Top query bar that reads like a sentence: "Category / Indicator".

import { State } from './state.js';
import { CATEGORIES, getCategory, getIndicator } from './indicators.js?v=20260522-tildes1';
import { indicatorInfo } from './indicator-info.js?v=20260522-tildes1';
import { resolveMetric } from './metric.js?v=20260522-tildes1';

export function initQueryBar({ onCategoryChange, onIndicatorChange }) {
  const catBtn      = document.getElementById('query-cat');
  const indBtn      = document.getElementById('query-ind');
  const catLabel    = document.getElementById('query-cat-label');
  const indLabel    = document.getElementById('query-ind-label');
  const infoBtn     = document.getElementById('indicator-info-btn');
  const infoPopover = document.getElementById('indicator-info-popover');
  const catDropdown = document.getElementById('query-cat-dropdown');
  const indDropdown = document.getElementById('query-ind-dropdown');
  const selBar      = document.getElementById('selection-bar');

  const lang = () => State.get('language');

  function closeInfoPopover() {
    if (!infoBtn || !infoPopover) return;
    infoBtn.classList.remove('info-open');
    infoBtn.setAttribute('aria-expanded', 'false');
    infoPopover.hidden = true;
    document.body.classList.remove('indicator-info-open');
  }

  function positionInfoPopover() {
    if (!infoBtn || !infoPopover || infoPopover.hidden) return;
    const rect = infoBtn.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 16);
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2));
    const top = Math.min(window.innerHeight - 16, rect.bottom + 8);
    infoPopover.style.setProperty('--info-left', `${left}px`);
    infoPopover.style.setProperty('--info-top', `${top}px`);
    infoPopover.style.setProperty('--info-arrow-left', `${rect.left + rect.width / 2 - left}px`);
  }

  function openInfoPopover() {
    if (!infoBtn || !infoPopover || !infoBtn.dataset.info) return;
    State.set('playing', false);
    infoPopover.textContent = infoBtn.dataset.info;
    infoPopover.hidden = false;
    infoBtn.classList.add('info-open');
    infoBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('indicator-info-open');
    positionInfoPopover();
  }

  function renderLabels() {
    const cat = getCategory(State.get('activeCategory'));
    const ind = cat ? getIndicator(cat.id, State.get('activeIndicator')) : null;
    const metric = resolveMetric(ind, lang());
    if (catLabel && cat) catLabel.textContent = cat.label[lang()];
    if (indLabel && metric) indLabel.textContent = metric.labelText;
    else if (indLabel) indLabel.textContent = '-';
    if (infoBtn) {
      const info = indicatorInfo(ind, lang(), metric);
      infoBtn.hidden = !info;
      infoBtn.dataset.info = info || '';
      if (infoPopover) infoPopover.textContent = info || '';
      closeInfoPopover();
      infoBtn.removeAttribute('title');
      infoBtn.setAttribute(
        'aria-label',
        metric
          ? (lang() === 'en' ? `About ${metric.labelText}` : `Informaci\u00f3n: ${metric.labelText}`)
          : (lang() === 'en' ? 'Indicator information' : 'Informaci\u00f3n del indicador')
      );
    }
  }

  function renderCatDropdown() {
    catDropdown.innerHTML = CATEGORIES.map(c => `
      <div class="qd-item ${c.id === State.get('activeCategory') ? 'active' : ''} ${c.blocked ? 'qd-blocked' : ''}" data-cat="${c.id}">
        <span>${c.label[lang()]}</span>
        ${c.blocked ? `<span class="qd-item-desc">${(c.blockedMsg && c.blockedMsg[lang()]) || ''}</span>` : ''}
      </div>
    `).join('');
    catDropdown.querySelectorAll('.qd-item').forEach(it => {
      it.addEventListener('click', () => {
        const cat = getCategory(it.dataset.cat);
        if (cat.blocked) return;
        if (infoBtn) {
          closeInfoPopover();
          infoBtn.blur();
        }
        onCategoryChange(it.dataset.cat);
        catDropdown.classList.remove('open');
      });
    });
  }

  function renderIndDropdown() {
    const cat = getCategory(State.get('activeCategory'));
    if (!cat || !cat.indicators.length) {
      indDropdown.innerHTML = `<div class="qd-item" style="cursor:default;color:var(--c-text-3)">Sin indicadores disponibles</div>`;
      return;
    }
    indDropdown.innerHTML = cat.indicators.map(i => {
      const metric = resolveMetric(i, lang());
      return `
        <div class="qd-item ${i.id === State.get('activeIndicator') ? 'active' : ''}" data-ind="${i.id}">
          <span>${metric.labelText}</span>
          <span class="qd-item-desc">${metric.unit}${i.warn ? ' - indicador sensible' : ''}</span>
        </div>
      `;
    }).join('');
    indDropdown.querySelectorAll('.qd-item').forEach(it => {
      it.addEventListener('click', () => {
        if (infoBtn) {
          closeInfoPopover();
          infoBtn.blur();
        }
        onIndicatorChange(it.dataset.ind);
        indDropdown.classList.remove('open');
      });
    });
  }

  function renderSelection() {
    if (!selBar) return;
    const scope = State.get('trendGeoScope');
    const uiLang = lang();
    const selectedCountries = State.get('selectedCountries') || [];
    const selectedRegions = State.get('selectedRegions') || [];
    const activeView = State.get('activeView');
    const maxVisible = 10;

    if (scope === 'world') {
      selBar.innerHTML = activeView === 'map'
        ? ''
        : `<span class="sel-chip sel-chip-summary">${uiLang === 'en' ? 'World' : 'Mundo'}<span class="sel-chip-x" data-clear-world>&times;</span></span>`;
      selBar.querySelector('[data-clear-world]')?.addEventListener('click', e => {
        e.stopPropagation();
        State.set('trendGeoScope', 'country');
      });
      return;
    }

    if (scope === 'region') {
      if (!selectedRegions.length) {
        selBar.innerHTML = '';
        return;
      }
      if (activeView === 'map' && selectedRegions.length > 4) {
        selBar.innerHTML = '';
        return;
      }
      if (selectedRegions.length > 4) {
        selBar.innerHTML = `
          <span class="sel-chip sel-chip-summary">
            ${uiLang === 'en' ? 'All regions' : 'Todas las regiones'}
            <span class="sel-chip-x" data-clear-regions>&times;</span>
          </span>
        `;
      } else {
        selBar.innerHTML = selectedRegions.map(region => `
          <span class="sel-chip" data-region="${region}">${region}<span class="sel-chip-x" data-region="${region}">&times;</span></span>
        `).join('');
      }
      selBar.querySelector('[data-clear-regions]')?.addEventListener('click', e => {
        e.stopPropagation();
        State.clearRegions();
      });
      selBar.querySelectorAll('.sel-chip-x[data-region]').forEach(x => {
        x.addEventListener('click', e => {
          e.stopPropagation();
          State.toggleRegion(x.dataset.region);
        });
      });
      return;
    }

    if (activeView === 'map' && selectedCountries.length > maxVisible) {
      selBar.innerHTML = '';
      return;
    }

    if (selectedCountries.length > maxVisible) {
      const allLabel = selectedCountries.length > 100
        ? (uiLang === 'en' ? 'All countries' : 'Todos los pa\u00edses')
        : `${selectedCountries.length} ${uiLang === 'en' ? 'countries' : 'pa\u00edses'}`;
      selBar.innerHTML = `
        <span class="sel-chip sel-chip-summary">
          ${allLabel}
          <span class="sel-chip-x" data-clear-countries>&times;</span>
        </span>
      `;
    } else {
      selBar.innerHTML = selectedCountries.map(iso => `
        <span class="sel-chip" data-iso="${iso}">${iso}<span class="sel-chip-x" data-iso="${iso}">&times;</span></span>
      `).join('');
    }
    selBar.querySelector('[data-clear-countries]')?.addEventListener('click', e => {
      e.stopPropagation();
      State.clearCountries();
    });
    selBar.querySelectorAll('.sel-chip-x[data-iso]').forEach(x => {
      x.addEventListener('click', e => {
        e.stopPropagation();
        State.toggleCountry(x.dataset.iso);
      });
    });
  }

  catBtn.addEventListener('click', () => {
    renderCatDropdown();
    catDropdown.classList.toggle('open');
    indDropdown.classList.remove('open');
  });
  indBtn.addEventListener('click', () => {
    renderIndDropdown();
    indDropdown.classList.toggle('open');
    catDropdown.classList.remove('open');
  });
  infoBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (!infoBtn.dataset.info) return;
    const open = infoBtn.getAttribute('aria-expanded') !== 'true';
    if (open) openInfoPopover();
    else closeInfoPopover();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.indicator-info-btn') && !e.target.closest('.indicator-info-popover')) {
      closeInfoPopover();
    }
    if (!e.target.closest('.query-segment')) {
      catDropdown.classList.remove('open');
      indDropdown.classList.remove('open');
    }
  });
  window.addEventListener('resize', positionInfoPopover);

  renderLabels();
  renderSelection();

  State.subscribe('activeCategory', renderLabels);
  State.subscribe('activeIndicator', renderLabels);
  State.subscribe('functionalUnit', renderLabels);
  State.subscribe('productivityLaborInput', renderLabels);
  State.subscribe('productivityDirection', renderLabels);
  State.subscribe('footprintFlow', renderLabels);
  State.subscribe('footprintFlows', renderLabels);
  State.subscribe('language', renderLabels);
  State.subscribe('language', renderSelection);
  State.subscribe('trendGeoScope', renderSelection);
  State.subscribe('selectedRegions', renderSelection);
  State.subscribe('activeView', renderSelection);
  State.subscribe('selectedCountries', renderSelection);
}

