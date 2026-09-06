// Permalink: the visible state travels in the URL and is restored on load.
//
// Without this a reload always dropped the reader back on the cover and lost
// the ~15 dimensions of state, so no figure of this viewer could be cited.
// Only values that differ from the defaults are written, which keeps the URL
// short and keeps the default entry point clean.

import { State } from './state.js?v=20260906f';
import { getCategory, getIndicator } from './indicators.js?v=20260906f';

// Snapshot taken at import time, before anything can touch the state.
const DEFAULTS = State.getAll();

const FIELDS = [
  { key: 'activeCategory',     param: 'cat',   type: 'string' },
  { key: 'activeIndicator',    param: 'ind',   type: 'string' },
  { key: 'activeView',         param: 'view',  type: 'string' },
  { key: 'currentYear',        param: 'year',  type: 'number' },
  { key: 'yearRange',          param: 'range', type: 'range' },
  { key: 'selectedCountries',  param: 'iso',   type: 'list' },
  { key: 'selectedRegions',    param: 'reg',   type: 'list' },
  { key: 'focusedCountry',     param: 'focus', type: 'string' },
  { key: 'cropCategoryFilter', param: 'crop',  type: 'string' },
  { key: 'trendGeoScope',      param: 'scope', type: 'string' },
  { key: 'language',           param: 'lang',  type: 'string' },
  { key: 'treemapMode',        param: 'tm',    type: 'string' },
  { key: 'tradeFlow',          param: 'tflow', type: 'string' },
  { key: 'tradeProduct',       param: 'tprod', type: 'string' },
  { key: 'tradeTopN',          param: 'ttop',  type: 'number' },
  { key: 'functionalUnit',     param: 'fu',    type: 'string' },
  { key: 'footprintFlow',      param: 'fpf',   type: 'string' },
  { key: 'perCapita',          param: 'pc',    type: 'bool' },
];

const VIEWS = ['map', 'trend', 'ranking', 'treemap', 'table', 'country', 'about'];

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function encode(field, value) {
  switch (field.type) {
    case 'list':  return (value || []).join(',');
    case 'range': return (value || []).join('-');
    case 'bool':  return value ? '1' : '0';
    default:      return String(value);
  }
}

function decode(field, raw) {
  switch (field.type) {
    case 'list':
      return raw.split(',').map(v => v.trim()).filter(Boolean);
    case 'range': {
      const parts = raw.split('-').map(Number);
      if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) return null;
      return [Math.min(...parts), Math.max(...parts)];
    }
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return raw === '1' || raw === 'true';
    default:
      return raw;
  }
}

// Reads the URL and returns a state patch, or null when there is nothing to
// restore. Values are validated: a hand-edited URL must not be able to push
// nonsense into the state.
export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return null;
  const patch = {};
  for (const field of FIELDS) {
    if (!params.has(field.param)) continue;
    const value = decode(field, params.get(field.param));
    if (value == null || value === '') continue;
    if (field.key === 'activeView' && !VIEWS.includes(value)) continue;
    if (field.key === 'language' && !['es', 'en'].includes(value)) continue;
    patch[field.key] = value;
  }
  // A hand-edited or stale URL must not leave the app on a category or indicator that does
  // not exist: that painted an empty map with no error at all.
  if (patch.activeCategory && !getCategory(patch.activeCategory)) {
    delete patch.activeCategory;
    delete patch.activeIndicator;
  }
  if (patch.activeIndicator) {
    const category = patch.activeCategory || State.get('activeCategory');
    if (!getIndicator(category, patch.activeIndicator)) delete patch.activeIndicator;
  }
  // A category restored without its indicator falls back to that category's first one.
  if (patch.activeCategory && !patch.activeIndicator) {
    const first = getCategory(patch.activeCategory)?.indicators?.[0];
    if (first) patch.activeIndicator = first.id;
  }
  // The animation cursor mirrors the year and the timeline knob reads it. Restoring one
  // without the other left the knob parked on the boot default while the map obeyed the URL.
  if (patch.currentYear != null) patch.animationYear = patch.currentYear;
  return Object.keys(patch).length ? patch : null;
}

export function applyUrlState(patch) {
  if (!patch) return;
  State.setMany(patch);
}

let _pending = false;

function writeUrl() {
  _pending = false;
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    const value = State.get(field.key);
    if (value == null) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (sameValue(value, DEFAULTS[field.key])) continue;
    params.set(field.param, encode(field, value));
  }
  const query = params.toString();
  const url = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

function scheduleWrite() {
  if (_pending) return;
  _pending = true;
  window.setTimeout(writeUrl, 60);
}

// Starts mirroring the state into the address bar. Call once the app is up.
export function startPermalink() {
  FIELDS.forEach(field => State.subscribe(field.key, scheduleWrite));
  writeUrl();
}

// Back to square one: every field the permalink knows about returns to the
// value it had before the first click, and the address bar is cleared with it.
// Restricting it to FIELDS keeps derived/ephemeral state (loaded data, panel
// visibility) untouched, which is what makes the reset instant and safe.
export function resetToDefaults() {
  const patch = {};
  for (const field of FIELDS) {
    const value = DEFAULTS[field.key];
    patch[field.key] = Array.isArray(value) ? [...value] : value;
  }
  // The language the reader chose is a preference, not part of the query.
  patch.language = State.get('language');
  // Same mirror as on restore: leaving the cursor behind made the knob and the year
  // disagree right after a reset.
  patch.animationYear = DEFAULTS.animationYear;
  State.setMany(patch);
  window.history.replaceState(null, '', window.location.pathname);
  return patch.activeView || 'map';
}

// "Copy link" for the current view. Falls back to a prompt where the
// clipboard API is unavailable (http on a phone, for instance).
export async function copyPermalink() {
  writeUrl();
  const href = window.location.href;
  try {
    await navigator.clipboard.writeText(href);
    return true;
  } catch (_) {
    window.prompt('Copia el enlace / Copy the link:', href);
    return false;
  }
}
