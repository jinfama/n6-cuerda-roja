// CSV export of what the active view is actually showing.
//
// Every view registers a provider that returns the rows it has just painted,
// so "Descargar" exports the visible selection (indicator, year, territories,
// crop filter, flow…) instead of a generic dump. The file name carries the
// indicator and the year, which is what makes a downloaded table citable.

import { State } from './state.js?v=20260906f';

const _providers = {};

export function registerExport(view, fn) {
  _providers[view] = fn;
}

export function hasExport(view) {
  return typeof _providers[view] === 'function';
}

function slug(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^ -~]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'datos';
}

function yearPart() {
  const view = State.get('activeView');
  if (view === 'trend') {
    const [from, to] = State.get('yearRange') || [];
    if (from != null && to != null) return `${from}-${to}`;
  }
  return String(State.get('currentYear'));
}

function toCsv(rows) {
  const columns = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  const cell = value => {
    if (value == null) return '';
    const text = String(value);
    return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map(c => cell(row[c])).join(','));
  return lines.join('\r\n');
}

function saveBlob(text, filename) {
  // The BOM keeps accented Spanish column headers readable in Excel.
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function notify(message) {
  let box = document.getElementById('export-toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'export-toast';
    box.className = 'export-toast';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add('visible');
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('visible'), 3200);
}

export async function exportActiveView() {
  const lang = State.get('language');
  const view = State.get('activeView');
  const provider = _providers[view];
  if (!provider) {
    notify(lang === 'en'
      ? 'This view has no table to download yet.'
      : 'Esta vista todavía no tiene una tabla que descargar.');
    return null;
  }
  let payload;
  try {
    payload = await provider();
  } catch (error) {
    console.warn('[export] provider failed', error);
    payload = null;
  }
  const rows = payload && payload.rows;
  if (!rows || !rows.length) {
    notify(lang === 'en'
      ? 'Nothing to download: the current view has no data.'
      : 'No hay nada que descargar: la vista actual no tiene datos.');
    return null;
  }
  const name = [
    'agricultores',
    slug(payload.indicator || State.get('activeIndicator')),
    yearPart(),
    slug(payload.view || view),
  ].join('_');
  const filename = `${name}.csv`;
  saveBlob(toCsv(rows), filename);
  notify(lang === 'en' ? `Downloaded ${filename}` : `Descargado ${filename}`);
  return filename;
}

export function wireExportButtons() {
  document.querySelectorAll('[data-export-csv]').forEach(btn => {
    btn.addEventListener('click', () => { exportActiveView(); });
  });
  const sync = () => {
    const available = hasExport(State.get('activeView'));
    document.querySelectorAll('[data-export-csv]').forEach(btn => {
      btn.disabled = !available;
      btn.classList.toggle('is-disabled', !available);
    });
  };
  State.subscribe('activeView', sync);
  sync();
}
