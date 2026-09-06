// Left dark sidebar — categories of indicators.

import { State } from './state.js?v=20260906f';
import { CATEGORIES, ICON_PATHS } from './indicators.js?v=20260906f';

function icon(name) {
  const d = ICON_PATHS[name] || '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function initSidebar({ onCategoryChange }) {
  const root = document.getElementById('sidebar');
  if (!root) return;

  const lang = () => State.get('language');

  function render() {
    const active = State.get('activeCategory');
    root.innerHTML = CATEGORIES.map(c => `
      <button class="sb-btn ${c.id === active ? 'active' : ''}" data-cat="${c.id}" ${c.blocked ? 'data-blocked="1"' : ''}>
        ${icon(c.icon)}
        <span class="sb-btn-label">${c.label[lang()]}</span>
      </button>
    `).join('');

    root.querySelectorAll('.sb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.blocked) {
          const cat = CATEGORIES.find(c => c.id === btn.dataset.cat);
          alert((cat.blockedMsg && cat.blockedMsg[lang()]) || 'Próximamente');
          return;
        }
        onCategoryChange(btn.dataset.cat);
      });
    });
    const activeBtn = root.querySelector('.sb-btn.active');
    if (activeBtn && window.matchMedia?.('(max-width: 700px)').matches) {
      window.setTimeout(() => activeBtn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }), 0);
    }
  }

  render();
  State.subscribe('activeCategory', render);
  State.subscribe('language', render);
}

