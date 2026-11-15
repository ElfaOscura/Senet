import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { initGame } from './game.js';
import { sound } from './sound.js'; 

/* ==========================================================================
   CONSTANTES DEL TABLERO
   ========================================================================== */
const COLS = 10;
const ROWS = 3;
const TILE = 1.1; // lado de cada casilla
const TILE_H = 0.1; // grosor de la casilla
const BOARD_TOP_Y = TILE_H; // altura de la superficie donde se apoyan las fichas
const BOARD_W = COLS * TILE + 0.8;
const BOARD_D = ROWS * TILE + 0.8;

/** Casillas especiales del Senet (las usa game.js para mensajes y reglas) */
export const SPECIAL_SQUARES = {
  15: 'Casa del Renacimiento',
  26: 'Casa de la Felicidad',
  27: 'Casa de las Aguas',
  28: 'Casa de las Tres Verdades',
  29: 'Casa de Re-Atum',
  30: 'Casa de Horus',
};

/** Numeración en serpiente: 1-10 (→), 11-20 (←), 21-30 (→) */
export function squareToCell(n) {
  const row = Math.floor((n - 1) / COLS);
  const i = (n - 1) % COLS;
  const col = row % 2 === 0 ? i : COLS - 1 - i;
  return { row, col };
}

export function squareToPosition(n) {
  const { row, col } = squareToCell(n);
  return new THREE.Vector3((col - (COLS - 1) / 2) * TILE, BOARD_TOP_Y, (row - (ROWS - 1) / 2) * TILE);
}

const $ = (sel) => document.querySelector(sel);

/* ==========================================================================
   TEXTURAS PROCEDURALES (sin imágenes externas)
   ========================================================================== */
function canvasTexture(canvas, renderer) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function paintStone(ctx, size, base, grain = 1800) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // estratos horizontales de la arenisca
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = `rgba(60, 35, 10, ${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(0, Math.random() * size, size, 1 + Math.random() * 3);
  }
  // grano
  for (let i = 0; i < grain; i++) {
    const dark = Math.random() > 0.45;
    ctx.fillStyle = dark
      ? `rgba(40, 22, 6, ${Math.random() * 0.12})`
      : `rgba(255, 232, 180, ${Math.random() * 0.08})`;
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

/** Dibuja en las 9 posiciones vecinas para que el patrón sea continuo al repetirse. */
function wrapDraw(size, x, y, r, fn) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const X = x + ox;
      const Y = y + oy;
      if (X + r < 0 || X - r > size || Y + r < 0 || Y - r > size) continue;
      fn(X, Y);
    }
  }
}

/** Granito negro pulido con cristales claros (textura repetible). */
function makeGraniteTexture(renderer, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#17181c';
  ctx.fillRect(0, 0, size, size);

  // variaciones suaves de tono
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 110;
    const light = Math.random() > 0.5;
    wrapDraw(size, x, y, r, (X, Y) => {
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, light ? 'rgba(150,155,165,0.09)' : 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(X - r, Y - r, r * 2, r * 2);
    });
  }

  // cristales de cuarzo, feldespato y mica
  const palette = ['#e9e5dc', '#8d929b', '#44474f', '#0b0b0d', '#b8a679', '#5d6571'];
  for (let i = 0; i < 11000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 1.7;
    ctx.globalAlpha = 0.25 + Math.random() * 0.6;
    ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
    wrapDraw(size, x, y, r, (X, Y) => {
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;

  const tex = canvasTexture(c, renderer);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Mármol negro con vetas blancas y doradas. */
function makeMarbleTexture(renderer, w = 1536, h = 668) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0d0e11');
  bg.addColorStop(0.5, '#17181d');
  bg.addColorStop(1, '#0b0c0f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // nubes suaves
  for (let i = 0; i < 45; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 80 + Math.random() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(190,190,200,0.07)' : 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // vetas que serpentean y se ramifican
  const vein = (x, y, angle, steps, width, color, alpha, depth = 0) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = width * 2.5;
    const branches = [];
    for (let i = 0; i < steps; i++) {
      const nx = x + Math.cos(angle) * 16;
      const ny = y + Math.sin(angle) * 16;
      ctx.lineWidth = Math.max(0.5, width * (1 - (i / steps) * 0.7));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
      angle += (Math.random() - 0.5) * 0.7;
      if (depth < 2 && Math.random() < 0.04) {
        branches.push([x, y, angle + (Math.random() > 0.5 ? 0.9 : -0.9), i]);
      }
    }
    ctx.restore();
    for (const [bx, by, ba, i] of branches) {
      vein(bx, by, ba, Math.floor((steps - i) * 0.6), width * 0.55, color, alpha * 0.8, depth + 1);
    }
  };

  for (let i = 0; i < 12; i++) {
    vein(Math.random() * w, Math.random() * h, Math.random() * 1.2 - 0.3, 60 + Math.random() * 60, 2 + Math.random() * 2.5, '#f4f1e8', 0.35 + Math.random() * 0.3);
  }
  for (let i = 0; i < 8; i++) {
    vein(Math.random() * w, Math.random() * h, Math.random() * 1.2 - 0.3, 50 + Math.random() * 60, 1.2 + Math.random() * 1.2, '#d4af37', 0.55 + Math.random() * 0.3);
  }

  // brillo de pulido
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  return canvasTexture(c, renderer);
}

/** Escala las UV de una caja a unidades del mundo (para que el grano no se estire). */
function scaleBoxUV(geo, w, h, d, unit, skipFace = -1) {
  const uv = geo.attributes.uv;
  // caras de BoxGeometry: +x, -x, +y, -y, +z, -z
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    if (f === skipFace) continue;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * dims[f][0]) / unit, (uv.getY(idx) * dims[f][1]) / unit);
    }
  }
  uv.needsUpdate = true;
}

/* ---- Símbolos dibujados a mano en canvas ---- */
function goldGradient(ctx, size) {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#fff1b8');
  g.addColorStop(0.5, '#d4af37');
  g.addColorStop(1, '#aa771c');
  return g;
}

function drawAnkh(ctx, cx, cy) {
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 38, 24, 32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx, cy + 64);
  ctx.moveTo(cx - 38, cy + 14);
  ctx.lineTo(cx + 38, cy + 14);
  ctx.stroke();
}

function drawStar(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawWaves(ctx, cx, cy) {
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (const dy of [-34, 0, 34]) {
    ctx.beginPath();
    for (let x = -56; x <= 56; x += 4) {
      const y = cy + dy + Math.sin((x / 56) * Math.PI * 2) * 9;
      x === -56 ? ctx.moveTo(cx + x, y) : ctx.lineTo(cx + x, y);
    }
    ctx.stroke();
  }
}

function drawCircles(ctx, cx, cy, count) {
  const gap = 56;
  const start = cx - ((count - 1) * gap) / 2;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(start + i * gap, cy, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSun(ctx, cx, cy) {
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
    ctx.lineTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    ctx.stroke();
  }
}

const TILE_BASE = { 15: '#8a6a2a', 26: '#c4a04a', 27: '#34596a', 30: '#94602c' };

function makeTileTexture(n, renderer) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const { row, col } = squareToCell(n);
  const checker = (row + col) % 2 === 0 ? '#b08a52' : '#9d7a45';
  paintStone(ctx, size, TILE_BASE[n] || checker, 1400);

  // marco dorado doble
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, size - 24, size - 24);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, size - 44, size - 44);

  // símbolo central
  const grad = goldGradient(ctx, size);
  ctx.fillStyle = grad;
  ctx.strokeStyle = grad;
  const cx = size / 2;
  const cy = size / 2 + 6;
  if (n === 15) drawAnkh(ctx, cx, cy);
  else if (n === 26) drawStar(ctx, cx, cy, 58, 24, 8);
  else if (n === 27) {
    ctx.strokeStyle = '#9fe0f2';
    drawWaves(ctx, cx, cy);
  } else if (n === 28) drawCircles(ctx, cx, cy, 3);
  else if (n === 29) drawCircles(ctx, cx, cy, 2);
  else if (n === 30) drawSun(ctx, cx, cy);

  // número de casilla
  ctx.font = '400 30px Metamorphous, Cinzel, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(40, 22, 6, 0.55)';
  ctx.fillText(String(n), 31, 31);
  ctx.fillStyle = 'rgba(243, 215, 122, 0.9)';
  ctx.fillText(String(n), 30, 30);

  return canvasTexture(c, renderer);
}

/** Arena del desierto: manchas de tono, ondulaciones de viento, grano y guijarros (repetible). */
function makeSandTexture(renderer, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8f6f40';
  ctx.fillRect(0, 0, size, size);

  // zonas más claras y más oscuras, como dunas suaves
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 90 + Math.random() * 260;
    const light = Math.random() > 0.5;
    wrapDraw(size, x, y, r, (X, Y) => {
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, light ? 'rgba(235,205,150,0.12)' : 'rgba(60,38,12,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(X - r, Y - r, r * 2, r * 2);
    });
  }

  // ondulaciones que deja el viento (ciclos enteros para que repitan sin costura)
  ctx.lineCap = 'round';
  const rows = 40;
  for (let k = 0; k < rows; k++) {
    const y0 = (k + Math.random() * 0.6) * (size / rows);
    const amp = 3 + Math.random() * 6;
    const cycles = 2 + Math.floor(Math.random() * 4);
    const phase = Math.random() * Math.PI * 2;
    for (const [dy, color, lw] of [
      [0, 'rgba(55,35,10,0.16)', 2.2],
      [3, 'rgba(255,228,175,0.10)', 1.6],
    ]) {
      for (const oy of [-size, 0, size]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 8) {
          const y = y0 + dy + oy + amp * Math.sin((x / size) * Math.PI * 2 * cycles + phase);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  // granos de arena
  for (let i = 0; i < 30000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.4 + Math.random() * 1.0;
    const light = Math.random() > 0.5;
    ctx.fillStyle = light
      ? `rgba(255, 232, 185, ${0.1 + Math.random() * 0.25})`
      : `rgba(50, 30, 8, ${0.1 + Math.random() * 0.25})`;
    wrapDraw(size, x, y, r, (X, Y) => {
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // guijarros dispersos
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = 2 + Math.random() * 4;
    const ry = rx * (0.6 + Math.random() * 0.3);
    wrapDraw(size, x, y, rx, (X, Y) => {
      ctx.fillStyle = 'rgba(40, 28, 14, 0.35)';
      ctx.beginPath();
      ctx.ellipse(X + 1, Y + 1.5, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(168, 142, 100, 0.9)';
      ctx.beginPath();
      ctx.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const tex = canvasTexture(c, renderer);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  return tex;
}

/** Máscara radial: el suelo es opaco en el centro y se desvanece hacia los bordes. */
function makeFloorFadeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.45, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function makeFlameTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 78, 4, 64, 70, 60);
  g.addColorStop(0, 'rgba(255, 250, 200, 1)');
  g.addColorStop(0.25, 'rgba(255, 190, 70, 0.95)');
  g.addColorStop(0.6, 'rgba(255, 110, 20, 0.45)');
  g.addColorStop(1, 'rgba(255, 60, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 170, 70, 0.55)');
  g.addColorStop(0.5, 'rgba(212, 120, 40, 0.18)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ==========================================================================
   PIEZAS (perfiles torneados con LatheGeometry)
   ========================================================================== */
const SPOOL_PROFILE = [
  [0, 0], [0.38, 0], [0.4, 0.04], [0.38, 0.09], [0.22, 0.14], [0.18, 0.28],
  [0.22, 0.4], [0.34, 0.46], [0.35, 0.54], [0.29, 0.6], [0.16, 0.63], [0, 0.64],
];
const CONE_PROFILE = [
  [0, 0], [0.38, 0], [0.4, 0.04], [0.37, 0.09], [0.3, 0.18], [0.22, 0.34],
  [0.15, 0.48], [0.12, 0.56], [0.15, 0.62], [0.1, 0.68], [0, 0.7],
];

function createPiece(player, id, materials) {
  const group = new THREE.Group();
  const profile = (player === 1 ? SPOOL_PROFILE : CONE_PROFILE).map(([r, y]) => new THREE.Vector2(r, y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), player === 1 ? materials.ivory : materials.ebony);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  if (player === 2) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 12, 48), materials.gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    ring.castShadow = true;
    group.add(ring);
  }

  // NUEVO: Añadir detalles dorados distintivos a las fichas de Marfil (Jugador 1)
  if (player === 1) {
    // 1. Un anillo dorado elegante en la cintura de la ficha (altura y=0.32)
    const midRing = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 12, 48), materials.gold);
    midRing.rotation.x = Math.PI / 2;
    midRing.position.y = 0.32;
    midRing.castShadow = true;
    group.add(midRing);

    // 2. Un pequeño botón o remate dorado en la cúspide de la ficha (altura y=0.64)
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.04, 24), materials.gold);
    topCap.position.y = 0.64;
    topCap.castShadow = true;
    group.add(topCap);
  }

  group.userData = { isPiece: true, player, id, square: null };
  return group;
}

/* ==========================================================================
   PARTÍCULAS DE POLVO (Particles.js por CDN)
   ========================================================================== */
function initParticles() {
  if (typeof window.particlesJS !== 'function') return;
  window.particlesJS('particles-js', {
    particles: {
      number: { value: 75, density: { enable: true, value_area: 900 } },
      color: { value: ['#d4af37', '#f3d77a', '#f5efe0'] },
      shape: { type: 'circle' },
      opacity: { value: 0.35, random: true, anim: { enable: true, speed: 0.6, opacity_min: 0.05, sync: false } },
      size: { value: 2.4, random: true, anim: { enable: true, speed: 1.2, size_min: 0.4, sync: false } },
      line_linked: { enable: false },
      move: {
        enable: true,
        speed: 0.7,
        direction: 'top',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
      },
    },
    interactivity: {
      detect_on: 'window',
      events: { onhover: { enable: false }, onclick: { enable: false }, resize: true },
    },
    retina_detect: true,
  });
}

/* ==========================================================================
   MODAL DE REGLAS
   ========================================================================== */
function initRulesModal() {
  const modal = $('#rules-modal');
  const card = $('#rules-card');
  const backdrop = $('#rules-backdrop');
  const openBtn = $('#papyrus-btn');
  const closeBtn = $('#rules-close');
  let isOpen = false;

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    gsap.killTweensOf([backdrop, card]);
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' });
    gsap.fromTo(
      card,
      { y: 16, scale: 0.97, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out' },
    );
    closeBtn.focus({ preventScroll: true });
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    gsap.killTweensOf([backdrop, card]);
    gsap.to(card, { y: 10, scale: 0.98, opacity: 0, duration: 0.2, ease: 'power2.in' });
    gsap.to(backdrop, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
      },
    });
    openBtn.focus({ preventScroll: true });
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

/* ==========================================================================
   ESCENA PRINCIPAL
   ========================================================================== */
async function main() {
  // Esperar a la tipografía para que los números de las casillas usen Cinzel
  try {
    await Promise.race([
      Promise.all([document.fonts.load('400 30px Metamorphous'), document.fonts.ready]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* sin fuentes: se usa la de respaldo */
  }

  const container = $('#scene-container');

  /* ---- Renderer ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // transparente: se ve la piedra del fondo
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  /* ---- Escena y entorno (reflejos suaves para el oro) ---- */
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  /* ---- Cámara + OrbitControls ---- */
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
  const homePosition = () => {
    const aspect = window.innerWidth / window.innerHeight;
    const dist = THREE.MathUtils.clamp(16 * Math.max(1, 1.75 / aspect), 14, 32);
    return new THREE.Vector3(0, 0.74, 0.67).normalize().multiplyScalar(dist);
  };
  camera.position.copy(homePosition()).multiplyScalar(2.1); // arranca lejos para la intro

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 32;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.rotateSpeed = 0.7;
  controls.enabled = false; // se activa al terminar la intro

  /* ---- Luces ---- */
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x1a0f06, 0.35));

  const key = new THREE.DirectionalLight(0xffcf8a, 1.1);
  key.position.set(-6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 1, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  /* ---- Materiales compartidos ---- */
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.95, roughness: 0.28 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x5a3b1a, metalness: 0.7, roughness: 0.45 });
  const pieceMaterials = {
    gold: goldMat,
    ivory: new THREE.MeshPhysicalMaterial({
      color: 0xf3e7c8,
      roughness: 0.35,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    }),
    ebony: new THREE.MeshPhysicalMaterial({
      color: 0x1a120d,
      roughness: 0.25,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    }),
  };

  /* ---- Pedestal escalonado: granito negro pulido (laterales) y mármol veteado (superficies) ---- */
  const graniteMat = new THREE.MeshPhysicalMaterial({
    map: makeGraniteTexture(renderer),
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });
  const marbleMat = new THREE.MeshPhysicalMaterial({
    map: makeMarbleTexture(renderer),
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const stoneDark = graniteMat; // las bases de las antorchas lo reutilizan

  const makeSlab = (w, h, d, y) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d, 2.5, 2); // la cara superior (2) conserva el mármol completo
    const m = new THREE.Mesh(geo, [graniteMat, graniteMat, marbleMat, graniteMat, graniteMat, graniteMat]);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  makeSlab(BOARD_W + 2.8, 0.5, BOARD_D + 2.8, -1.25);
  makeSlab(BOARD_W + 1.6, 0.5, BOARD_D + 1.6, -0.75);
  makeSlab(BOARD_W, 0.5, BOARD_D, -0.25);

  // filete dorado en el borde del escalón inferior
  {
    const w = BOARD_W + 2.8;
    const d = BOARD_D + 2.8;
    const t = 0.06;
    const h = 0.05;
    const bar = (bw, bd, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), goldMat);
      m.position.set(x, -1.0 + h / 2, z);
      m.receiveShadow = true;
      scene.add(m);
    };
    bar(w, t, 0, d / 2 - t / 2);
    bar(w, t, 0, -d / 2 + t / 2);
    bar(t, d - t * 2, w / 2 - t / 2, 0);
    bar(t, d - t * 2, -w / 2 + t / 2, 0);
  }

  // marco dorado alrededor de las casillas
  const trimH = 0.22;
  const trimT = 0.14;
  const addTrim = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, trimH, d), goldMat);
    m.position.set(x, trimH / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  addTrim(BOARD_W, trimT, 0, BOARD_D / 2 - trimT / 2);
  addTrim(BOARD_W, trimT, 0, -BOARD_D / 2 + trimT / 2);
  addTrim(trimT, BOARD_D - trimT * 2, BOARD_W / 2 - trimT / 2, 0);
  addTrim(trimT, BOARD_D - trimT * 2, -BOARD_W / 2 + trimT / 2, 0);

  // suelo de arena con relieve; se desvanece en los bordes sobre el fondo de piedra
  const sandTex = makeSandTexture(renderer);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 72),
    new THREE.MeshStandardMaterial({
      map: sandTex,
      bumpMap: sandTex,
      bumpScale: 1.2,
      alphaMap: makeFloorFadeTexture(),
      transparent: true,
      roughness: 1,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  floor.receiveShadow = true;
  floor.renderOrder = -1; // se dibuja antes que llamas y resplandor (que son transparentes)
  scene.add(floor);

  // resplandor cálido bajo el pedestal
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 22),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.49;
  scene.add(glow);

  /* ---- Casillas ---- */
  const tileSideMat = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.45, metalness: 0.1 });
  const tiles = [null]; // índice 1..30
  const tileMeshes = [];
  for (let n = 1; n <= 30; n++) {
    const topMat = new THREE.MeshStandardMaterial({
      map: makeTileTexture(n, renderer),
      roughness: 0.85,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 0.95, TILE_H, TILE * 0.95),
      // orden de caras de BoxGeometry: +x, -x, +y (arriba), -y, +z, -z
      [tileSideMat, tileSideMat, topMat, tileSideMat, tileSideMat, tileSideMat],
    );
    const p = squareToPosition(n);
    mesh.position.set(p.x, TILE_H / 2, p.z);
    mesh.receiveShadow = true;
    mesh.userData = { isTile: true, square: n, topMaterial: topMat };
    scene.add(mesh);
    tiles.push(mesh);
    tileMeshes.push(mesh);
  }

  /** Resalta una casilla (hex = color, null = apagar). */
  const setTileGlow = (square, hex = null, intensity = 0.6) => {
    const mat = tiles[square]?.userData.topMaterial;
    if (!mat) return;
    if (hex === null) {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    } else {
      mat.emissive.setHex(hex);
      mat.emissiveIntensity = intensity;
    }
  };

  /* ---- Antorchas con luz parpadeante ---- */
  const flameTex = makeFlameTexture();
  const flickers = [];
  const torchSpots = [
    [-(BOARD_W / 2 + 1.7), BOARD_D / 2 + 0.9],
    [BOARD_W / 2 + 1.7, BOARD_D / 2 + 0.9],
    [-(BOARD_W / 2 + 1.7), -(BOARD_D / 2 + 0.9)],
    [BOARD_W / 2 + 1.7, -(BOARD_D / 2 + 0.9)],
  ];
  torchSpots.forEach(([x, z], i) => {
    const torch = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 24), stoneDark);
    base.position.y = 0.15;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.7, 16), bronzeMat);
    pole.position.y = 1.5;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.17, 0.4, 24), goldMat);
    bowl.position.y = 2.95;
    [base, pole, bowl].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      torch.add(m);
    });

    const flame = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flameTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    flame.position.y = 3.55;
    flame.scale.set(1.2, 1.7, 1);
    torch.add(flame);

    const light = new THREE.PointLight(0xff9a3c, 110, 32, 2);
    light.position.y = 3.5;
    torch.add(light);

    torch.position.set(x, -1.5, z);
    scene.add(torch);
    flickers.push({ light, flame, base: 110, phase: i * 1.7 });
  });

  /* ---- Fichas ---- */
  const pieces = [];
  for (let id = 0; id < 5; id++) {
    // Marfil (jugador 1) en las casillas impares; Ébano (jugador 2) en las pares
    const p1 = createPiece(1, id, pieceMaterials);
    const p2 = createPiece(2, id, pieceMaterials);
    p1.userData.square = id * 2 + 1;
    p2.userData.square = id * 2 + 2;
    p1.position.copy(squareToPosition(p1.userData.square));
    p2.position.copy(squareToPosition(p2.userData.square));
    scene.add(p1, p2);
    pieces.push(p1, p2);
  }

  /* ---- Bucle de render ---- */
  const updaters = [];
  const clock = new THREE.Clock();
  const tick = () => {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    for (const f of flickers) {
      const k =
        1 + 0.12 * Math.sin(t * 9 + f.phase) + 0.08 * Math.sin(t * 17 + f.phase * 2) + (Math.random() - 0.5) * 0.08;
      f.light.intensity = f.base * k;
      f.flame.scale.set(1.2 * (0.94 + (k - 1) * 0.6), 1.7 * k, 1);
      f.flame.material.rotation = Math.sin(t * 5 + f.phase) * 0.06;
    }
    for (const fn of updaters) fn(dt, t);

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  /* ---- API para game.js ---- */
  const world = {
    THREE,
    scene,
    camera,
    renderer,
    controls,
    tiles, // tiles[1..30] -> Mesh (userData.square)
    tileMeshes, // lista plana para raycasting
    pieces, // Group[] con userData { isPiece, player (1|2), id (0-4), square }
    TILE,
    BOARD_TOP_Y,
    SPECIAL_SQUARES,
    squareToPosition,
    squareToCell,
    setTileGlow,
    addUpdater: (fn) => updaters.push(fn),
    resetCamera: (duration = 1.4) =>
      gsap.to(camera.position, { ...homePosition(), duration, ease: 'power3.inOut' }),
  };

  /* ---- Interfaz: partículas, reglas y papiro flotante ---- */
  initParticles();
  initRulesModal();

  // Flotación muy sutil del papiro (los paneles laterales permanecen quietos)
  gsap.to('#papyrus-btn', { y: -4, rotation: 0.6, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });

  /* ---- Lógica del juego ---- */
  initGame(world);

  /* ---- Secuencia de entrada: carga → HUD → cámara → fichas ---- */
/* ---- Secuencia de entrada: carga → HUD → cámara → fichas ---- */
  const loader = $('#loader');
  
  // El desbloqueo del audio (pointerdown, click, touchend, keydown) lo gestiona sound.js.

  const intro = gsap.timeline();
  intro
    .to('#loader-bar', { width: '100%', duration: 1.1, ease: 'power2.inOut' })
    .to(loader, {
      autoAlpha: 0,
      duration: 0.7,
      ease: 'power2.out',
      onComplete: () => loader.remove(),
    })
    .from('#title-bar', { autoAlpha: 0, y: -40, duration: 0.9, ease: 'power3.out' }, '-=0.3')
    .from('#panel-left', { autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, '-=0.6')
    .from('#panel-right', { autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, '<')
    .from('#papyrus-btn', { autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, '-=0.4')
    .from('#hud footer', { autoAlpha: 0, duration: 1 }, '-=0.3')
    .to(
      camera.position,
      { ...homePosition(), duration: 2.4, ease: 'power3.inOut', onComplete: () => (controls.enabled = true) },
      0.9,
    )
    .from(
      pieces.map((p) => p.position),
      { 
        y: `+=${6}`, 
        duration: 0.9, 
        ease: 'bounce.out', 
        stagger: 0.07,
        onStart: () => {
          // Dispara el sonido en cascada sincronizado milimétricamente con el inicio del rebote visual
          sound.playPiecesCascade();
        }
      },
      2.2,
    );
}

main();