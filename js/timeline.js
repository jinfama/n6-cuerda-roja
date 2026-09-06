// Bottom timeline: dual-handle slider + play/pause + speed.

import { State } from './state.js?v=20260906f';
import { getIndicator } from './indicators.js?v=20260906f';
import { metricYearRange, resolveMetric } from './metric.js?v=20260906f';

let _domainMin = 1962, _domainMax = 2021;
let _yearFrom = 1962, _yearTo = 2021;
let _playFrame = null;
let _speed = 2;
let _lastMetricKey = null;

function el(id) { return document.getElementById(id); }

function pctFor(year) {
  if (_domainMin === _domainMax) return 50;
  return ((year - _domainMin) / (_domainMax - _domainMin)) * 100;
}

function yearFor(pct) {
  if (_domainMin === _domainMax) return _domainMin;
  return Math.round(_domainMin + (pct / 100) * (_domainMax - _domainMin));
}

function activeMetric() {
  const ind = getIndicator(State.get('activeCategory'), State.get('activeIndicator'));
  return resolveMetric(ind, State.get('language'));
}

// One place decides where the current-year knob sits, so the value in the state
// and the control the reader drags can never end up saying different years.
function positionCurrentHandle(year) {
  const handleCurrent = el('tl-handle-current');
  if (!handleCurrent) return;
  handleCurrent.style.left = `${pctFor(year)}%`;
  handleCurrent.dataset.year = Math.round(year);
}

function renderTrack() {
  const handleFrom = el('tl-handle-from');
  const handleTo   = el('tl-handle-to');
  const rangeFill  = el('tl-range-fill');
  const pFrom = pctFor(_yearFrom);
  const pTo   = pctFor(_yearTo);
  handleFrom.style.left = `${pFrom}%`;
  handleTo.style.left   = `${pTo}%`;
  // Outside playback the knob belongs to currentYear: a year restored from a
  // permalink lives there, while animationYear may still hold the boot default.
  positionCurrentHandle(State.get('playing')
    ? (State.get('animationYear') ?? State.get('currentYear'))
    : State.get('currentYear'));
  rangeFill.style.left  = `${Math.min(pFrom, pTo)}%`;
  rangeFill.style.width = `${Math.abs(pTo - pFrom)}%`;
  el('tl-label-from').textContent = _yearFrom;
  el('tl-label-to').textContent   = _yearTo;
  const currentInput = el('tl-year-current');
  if (currentInput) {
    currentInput.min = _yearFrom;
    currentInput.max = _yearTo;
    currentInput.value = Math.round(State.get('currentYear'));
  }
  State.set('yearRange', [_yearFrom, _yearTo]);
}

function syncCurrentYearLabels(y) {
  const yy = Math.round(Math.max(_yearFrom, Math.min(_yearTo, y)));
  // The knob is the control for this value: a year arriving from a permalink, from a
  // chart click or from a clamp has to move it, not just the number box. Otherwise the
  // map reads 1975 and the timeline reads 2020 at the same time, and the first touch
  // on the knob throws away the year the link carried.
  if (!State.get('playing')) positionCurrentHandle(yy);
  const currentInput = el('tl-year-current');
  if (currentInput) currentInput.value = yy;
  const mapYear = el('map-year');
  if (mapYear) mapYear.textContent = yy;
}

function setCurrentYear(y) {
  const yy = Math.round(Math.max(_yearFrom, Math.min(_yearTo, y)));
  State.set('currentYear', yy);
  State.set('animationYear', yy);
  syncCurrentYearLabels(yy);
}

function syncAnimationYearLabels(y) {
  const yy = Math.max(_yearFrom, Math.min(_yearTo, +y || _yearFrom));
  const rounded = Math.round(yy);
  positionCurrentHandle(yy);
  const currentInput = el('tl-year-current');
  if (currentInput && document.activeElement !== currentInput) currentInput.value = rounded;
  const mapYear = el('map-year');
  if (mapYear) mapYear.textContent = rounded;
}

function yearForData(y) {
  if (y >= _yearTo) return _yearTo;
  return Math.max(_yearFrom, Math.min(_yearTo, Math.floor(y)));
}

function setAnimationYear(y) {
  const yy = Math.max(_yearFrom, Math.min(_yearTo, +y || _yearFrom));
  State.set('animationYear', yy);
  const dataYear = yearForData(yy);
  if (State.get('currentYear') !== dataYear) {
    State.set('currentYear', dataYear);
  }
  syncAnimationYearLabels(yy);
}

function setPlayIcon(playing) {
  const playIcon = el('tl-play-icon');
  if (!playIcon) return;
  playIcon.innerHTML = playing
    ? '<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

function syncPlaying(playing) {
  if (playing) {
    playLoop();
    setPlayIcon(true);
  } else {
    pauseLoop();
    setPlayIcon(false);
  }
}

function applyMetricRange() {
  const metric = activeMetric();
  const [nextMin, nextMax] = metricYearRange(metric);
  const metricKey = metric ? `${metric.baseId}:${metric.field}` : 'none';
  const firstRun = _lastMetricKey === null;
  // Booting is not a change of variable. Counting it as one snapped the track back to
  // the full domain and threw away the range a permalink had just restored, so range=
  // was written into the URL and silently ignored on the way back in.
  const metricChanged = !firstRun && metricKey !== _lastMetricKey;
  _lastMetricKey = metricKey;
  _domainMin = nextMin;
  _domainMax = nextMax;
  const [curFrom, curTo] = State.get('yearRange');
  // On the first run the track has no range of its own yet: the state carries it, and
  // that is where the URL has just been read into.
  if (firstRun && Number.isFinite(curFrom) && Number.isFinite(curTo)) {
    _yearFrom = curFrom;
    _yearTo = curTo;
  }
  _yearFrom = Math.max(_domainMin, Math.min(_domainMax, _yearFrom));
  _yearTo = Math.max(_domainMin, Math.min(_domainMax, _yearTo));
  if (_yearFrom > _yearTo) _yearFrom = _yearTo = _domainMin;

  // When the previous range was the global default, snap to the variable's real
  // coverage so maps and the x-axis do not imply missing years.
  if (metricChanged || curFrom < _domainMin || curTo > _domainMax || curFrom === 1962 && curTo === 2021) {
    _yearFrom = _domainMin;
    _yearTo = _domainMax;
  }

  renderTrack();
  setCurrentYear(State.get('currentYear'));
  if (State.get('playing') && _domainMin === _domainMax) {
    pauseLoop();
    State.set('playing', false);
    setPlayIcon(false);
  }
}

function dragHandle(which) {
  const handle = el(`tl-handle-${which}`);
  const track  = el('tl-track');
  let dragging = false;
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = yearFor(pct);
    if (which === 'from') _yearFrom = Math.min(y, _yearTo);
    else                  _yearTo   = Math.max(y, _yearFrom);
    renderTrack();
    setCurrentYear(State.get('currentYear'));
  });
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('pointercancel', () => { dragging = false; });
}

function dragCurrentHandle() {
  const handle = el('tl-handle-current');
  const track = el('tl-track');
  if (!handle || !track) return;
  let dragging = false;
  const updateFromEvent = e => {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setCurrentYear(yearFor(pct));
  };
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    if (State.get('playing')) {
      pauseLoop();
      State.set('playing', false);
      setPlayIcon(false);
    }
    updateFromEvent(e);
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    updateFromEvent(e);
  });
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('pointercancel', () => { dragging = false; });
}

function playLoop() {
  pauseLoop();
  if (_domainMin === _domainMax) {
    setCurrentYear(_domainMax);
    State.set('playing', false);
    setPlayIcon(false);
    return;
  }
  const startYear = Math.max(_yearFrom, Math.min(_yearTo, State.get('animationYear') ?? State.get('currentYear')));
  const startTime = performance.now();
  function step(now) {
    const next = startYear + ((now - startTime) / 1000) * _speed;
    if (next >= _yearTo) {
      setAnimationYear(_yearTo);
      setCurrentYear(_yearTo);
      pauseLoop();
      State.set('playing', false);
      setPlayIcon(false);
      return;
    }
    setAnimationYear(next);
    _playFrame = requestAnimationFrame(step);
  }
  _playFrame = requestAnimationFrame(step);
}

function pauseLoop() {
  if (_playFrame) cancelAnimationFrame(_playFrame);
  _playFrame = null;
}

export function initTimeline() {
  el('tl-track').addEventListener('click', e => {
    if (e.target.closest('.tl-handle')) return;
    const rect = el('tl-track').getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setCurrentYear(yearFor(pct));
  });

  dragHandle('from');
  dragHandle('to');
  dragCurrentHandle();

  el('tl-year-current')?.addEventListener('change', e => {
    const v = Math.max(_yearFrom, Math.min(_yearTo, parseInt(e.target.value, 10) || State.get('currentYear')));
    setCurrentYear(v);
  });

  const playBtn  = el('tl-play');
  playBtn.addEventListener('click', () => {
    const playing = !State.get('playing');
    if (playing) setCurrentYear(_yearFrom);
    State.set('playing', playing);
  });

  const speedBtn = el('tl-speed');
  const speeds = [1, 2, 4, 8];
  speedBtn.addEventListener('click', () => {
    const i = speeds.indexOf(_speed);
    _speed = speeds[(i + 1) % speeds.length];
    speedBtn.textContent = `${_speed}x`;
    State.set('speed', _speed);
    if (State.get('playing')) playLoop();
  });

  applyMetricRange();
  // Not a hardcoded 2020: the default state already says 2020, and a permalink may have
  // restored another year before boot. Resetting here threw that year away on reload.
  setCurrentYear(State.get('currentYear'));
  State.subscribe('currentYear', syncCurrentYearLabels);
  State.subscribe('animationYear', syncAnimationYearLabels);
  State.subscribe('playing', syncPlaying);
  State.subscribe('activeCategory', applyMetricRange);
  State.subscribe('activeIndicator', applyMetricRange);
  State.subscribe('functionalUnit', applyMetricRange);
  State.subscribe('productivityLaborInput', applyMetricRange);
  State.subscribe('productivityDirection', applyMetricRange);
  State.subscribe('language', applyMetricRange);
}

