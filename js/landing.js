// Landing — Three.js globe with realistic Blue Marble texture.
// On CTA click: rotate to a target longitude, zoom slightly, fade out, hand off to the app.

import * as THREE from 'three';
import { State } from './state.js?v=20260906f';

let _scene, _camera, _renderer, _globe, _atmosphere, _animFrame;
let _cursorRaf = null;

function mix(a, b, t) {
  return a + (b - a) * t;
}

function createAgrarianTexture(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const isOcean = b > 44 && b > g * 1.06 && b > r * 1.18;
        const isIce = r > 210 && g > 210 && b > 210;
        const isGreenLand = g > r * 1.05 && g > b * 0.86;
        let target;
        let strength;

        if (isOcean) {
          target = [72, 102, 106];
          strength = 0.42;
        } else if (isIce) {
          target = [222, 234, 230];
          strength = 0.38;
        } else if (isGreenLand) {
          target = [93, 118, 70];
          strength = 0.34;
        } else {
          target = [142, 118, 78];
          strength = 0.22;
        }

        const contrast = 1.08;
        d[i]     = Math.max(0, Math.min(255, mix(128 + (r - 128) * contrast, target[0], strength)));
        d[i + 1] = Math.max(0, Math.min(255, mix(128 + (g - 128) * contrast, target[1], strength)));
        d[i + 2] = Math.max(0, Math.min(255, mix(128 + (b - 128) * contrast, target[2], strength)));
      }

      ctx.putImageData(img, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      resolve(texture);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function initGlobe() {
  const canvas = document.getElementById('landing-globe');
  if (!canvas) return;

  const W = canvas.clientWidth  || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  _scene  = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  _camera.position.set(0, 0.06, 6.35);
  _camera.lookAt(0, 0, 0);

  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  _renderer.setSize(W, H, false);
  _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  _renderer.outputColorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.SphereGeometry(1, 128, 128);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xded0a5,
    roughness: 0.96,
    metalness: 0.02,
    emissive: 0x1e332e,
    emissiveIntensity: 0.12,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  _globe = new THREE.Mesh(geo, mat);
  _globe.scale.setScalar(0.98);
  _globe.position.y = 0.04;
  _globe.rotation.x = -0.14;
  _scene.add(_globe);

  createAgrarianTexture('data/textures/earth.webp').then(tex => {
    if (!tex || !_globe) return;
    mat.map = tex;
    mat.needsUpdate = true;
    _renderer.render(_scene, _camera);
  });

  // Subtle atmosphere.
  const atmosGeo = new THREE.SphereGeometry(1.02, 64, 64);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0xb9e5ee,
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  _atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
  _atmosphere.position.y = _globe.position.y;
  _scene.add(_atmosphere);

  _scene.add(new THREE.AmbientLight(0xf6fbff, 1.24));
  const sun = new THREE.DirectionalLight(0xfff2d1, 1.52);
  sun.position.set(-3.8, 4.2, 4.8);
  _scene.add(sun);

  // Continuous slow rotation.
  function frame() {
    if (!_globe) return;
    _globe.rotation.y += 0.0011;
    if (_atmosphere) _atmosphere.rotation.y = _globe.rotation.y;
    _renderer.render(_scene, _camera);
    _animFrame = requestAnimationFrame(frame);
  }
  _animFrame = requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    const nw = canvas.clientWidth  || window.innerWidth;
    const nh = canvas.clientHeight || window.innerHeight;
    _camera.aspect = nw / nh;
    _camera.updateProjectionMatrix();
    _renderer.setSize(nw, nh, false);
  });
}

function initCursorGlow() {
  const landing = document.getElementById('landing');
  if (!landing || matchMedia('(pointer: coarse)').matches) return;

  function setCursor(x, y) {
    landing.style.setProperty('--cursor-x', `${x}px`);
    landing.style.setProperty('--cursor-y', `${y}px`);
    _cursorRaf = null;
  }

  landing.addEventListener('pointerenter', () => landing.classList.add('cursor-active'));
  landing.addEventListener('pointerleave', () => landing.classList.remove('cursor-active'));
  landing.addEventListener('pointermove', event => {
    landing.classList.add('cursor-active');
    const x = event.clientX;
    const y = event.clientY;
    if (!_cursorRaf) _cursorRaf = requestAnimationFrame(() => setCursor(x, y));
  });
}

// Zoom-out transition: the globe pulls back and fades.
// The app DOM becomes visible behind it.
function zoomOutAndHide() {
  return new Promise(resolve => {
    if (_animFrame) cancelAnimationFrame(_animFrame);
    const t0 = performance.now();
    const startZ = _camera.position.z;
    const endZ   = 2.6;
    const dur    = 1800;

    function animate(now) {
      const t = Math.min(1, (now - t0) / dur);
      const ease = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
      _camera.position.z = startZ + (endZ - startZ) * ease;
      if (_globe) _globe.rotation.y += 0.0018;
      _camera.lookAt(0, 0, 0);
      _renderer.render(_scene, _camera);
      if (t < 1) requestAnimationFrame(animate);
      else resolve();
    }
    requestAnimationFrame(animate);
  });
}

export function initLanding({ onEnter }) {
  initGlobe();
  initCursorGlow();

  // Language switcher on the landing.
  document.querySelectorAll('#landing-lang button').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      State.set('language', lang);
      document.querySelectorAll('#landing-lang button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
      });
      applyLandingI18n(lang);
    });
  });

  const cta = document.getElementById('landing-cta');
  cta.addEventListener('click', async () => {
    cta.disabled = true;
    const landing = document.getElementById('landing');
    landing.classList.add('fade-out');
    await Promise.race([
      zoomOutAndHide(),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    landing.style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    if (onEnter) onEnter();
  });
}

function applyLandingI18n(lang) {
  const D = {
    es: {
      'landing.eyebrow':  '',
      'landing.title':    '<span>Agricultores</span><span>del Mundo</span>',
      'landing.subtitle': 'Base de datos global sobre el trabajo agrario en perspectiva hist\u00f3rica',
      'landing.cta':      'Explorar',
    },
    en: {
      'landing.eyebrow':  '',
      'landing.title':    '<span>Farmers</span><span>of the World</span>',
      'landing.subtitle': 'A global database on agricultural labour in historical perspective',
      'landing.cta':      'Explore',
    },
  };
  document.querySelectorAll('#landing [data-i18n]').forEach(el => {
    const txt = D[lang][el.dataset.i18n];
    if (txt == null) return;
    if (/<br|<span/i.test(txt)) el.innerHTML = txt;
    else el.textContent = txt;
  });
}

