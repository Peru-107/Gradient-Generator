'use strict';

/* ==========================================================================
   Color utilities
   ========================================================================== */

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function hexToRgb(hex) {
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16) || 0;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function hexToHsl(hex) { const { r, g, b } = hexToRgb(hex); return rgbToHsl(r, g, b); }
function hslToHex(h, s, l) { const { r, g, b } = hslToRgb(h, s, l); return rgbToHex(r, g, b); }

function isValidHex(hex) { return /^#?[0-9a-f]{6}$/i.test(hex); }
function normalizeHex(hex) { return isValidHex(hex) ? ('#' + hex.replace('#', '')).toLowerCase() : null; }

function randomHex() {
  const h = Math.random() * 360;
  const s = 55 + Math.random() * 35;
  const l = 40 + Math.random() * 35;
  return hslToHex(h, s, l);
}

function relLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastRatio(hex1, hex2) {
  const c1 = hexToRgb(hex1), c2 = hexToRgb(hex2);
  const l1 = relLuminance(c1.r, c1.g, c1.b) + 0.05;
  const l2 = relLuminance(c2.r, c2.g, c2.b) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

function bestTextColor(hex) {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
}

function contrastLabel(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA18';
  return 'Fail';
}

/* ==========================================================================
   Shared helpers: toast, clipboard, downloads
   ========================================================================== */

const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastPop(toastEl);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

async function copyText(text, label, sourceEl, burstColor) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
    document.body.removeChild(ta);
  }
  showToast(label || 'Copied to clipboard');
  if (sourceEl) {
    const rect = sourceEl.getBoundingClientRect();
    confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, burstColor);
  }
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadCanvasPng(canvas, filename) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

/* ==========================================================================
   Tabs
   ========================================================================== */

let activeTab = 'gradient';
const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

function setActiveTab(tab) {
  activeTab = tab;
  tabButtons.forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const fromPanel = document.querySelector('.panel.active');
  const toPanel = document.getElementById('panel-' + tab);
  animateTabSwitch(fromPanel === toPanel ? null : fromPanel, toPanel);
}

/* ==========================================================================
   Theme toggle
   ========================================================================== */

const themeToggle = document.getElementById('themeToggle');
function syncNativeStatusBar(theme) {
  const StatusBar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if (!StatusBar) return;
  const bg = theme === 'dark' ? '#0e0f1e' : '#f2f3f8';
  const style = theme === 'dark' ? 'DARK' : 'LIGHT';
  StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
  StatusBar.setStyle({ style }).catch(() => {});
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀' : '🌙';
  localStorage.setItem('gradii_theme', theme);
  syncNativeStatusBar(theme);
}
(function initTheme() {
  const saved = localStorage.getItem('gradii_theme');
  const preferred = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(preferred);
})();
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  animateThemeIcon(themeToggle);
});

/* ==========================================================================
   Color vision simulation
   ========================================================================== */

const visionSelect = document.getElementById('visionSelect');
(function initVision() {
  const saved = localStorage.getItem('gradii_vision') || 'normal';
  visionSelect.value = saved;
  document.documentElement.setAttribute('data-vision', saved);
})();
visionSelect.addEventListener('change', () => {
  document.documentElement.setAttribute('data-vision', visionSelect.value);
  localStorage.setItem('gradii_vision', visionSelect.value);
});

/* ==========================================================================
   GRADIENT STUDIO
   ========================================================================== */

const GRADIENT_PRESETS = [
  { name: 'Sunset', stops: ['#ff512f', '#f09819'], angle: 120 },
  { name: 'Ocean', stops: ['#2193b0', '#6dd5ed'], angle: 135 },
  { name: 'Candy', stops: ['#ff9a9e', '#fecfef'], angle: 135 },
  { name: 'Mojito', stops: ['#1d976c', '#93f9b9'], angle: 120 },
  { name: 'Instagram', stops: ['#833ab4', '#fd1d1d', '#fcb045'], angle: 135 },
  { name: 'Cosmic', stops: ['#ff00cc', '#333399'], angle: 110 },
  { name: 'Peach', stops: ['#ed4264', '#ffedbc'], angle: 135 },
  { name: 'Midnight City', stops: ['#232526', '#414345'], angle: 135 },
  { name: 'Aqua Marine', stops: ['#1a2980', '#26d0ce'], angle: 135 },
  { name: 'Grape', stops: ['#8e2de2', '#4a00e0'], angle: 135 },
  { name: 'Lush', stops: ['#56ab2f', '#a8e063'], angle: 120 },
  { name: 'Fire', stops: ['#f12711', '#f5af19'], angle: 135 },
  { name: 'Royal', stops: ['#141e30', '#243b55'], angle: 135 },
  { name: 'Bloom', stops: ['#dd5e89', '#f7bb97'], angle: 120 },
  { name: 'Emerald', stops: ['#43cea2', '#185a9d'], angle: 135 },
  { name: 'Cherry', stops: ['#eb3349', '#f45c43'], angle: 135 },
  { name: 'Sky', stops: ['#00c6ff', '#0072ff'], angle: 135 },
  { name: 'Flamingo', stops: ['#f78ca0', '#f9748f', '#fd868c', '#fe9a8b'], angle: 135 },
  { name: 'Rose Gold', stops: ['#b76e79', '#f6d9d3'], angle: 135 },
  { name: 'Cotton Candy', stops: ['#a18cd1', '#fbc2eb'], angle: 135 },
  { name: 'Lime', stops: ['#a8ff78', '#78ffd6'], angle: 120 },
  { name: 'Blush', stops: ['#ff9a9e', '#fad0c4', '#fbc2eb'], angle: 135 },
  { name: 'Nebula', stops: ['#654ea3', '#eaafc8'], angle: 130 },
  { name: 'Amber', stops: ['#f7971e', '#ffd200'], angle: 120 },
  { name: 'Deep Sea', type: 'radial', stops: ['#000428', '#004e92'] },
  { name: 'Solar Flare', type: 'conic', stops: ['#ff512f', '#f09819', '#ff512f'], angle: 0 },
];

let gradientState = {
  type: 'linear',
  angle: 90,
  shape: 'ellipse',
  posX: 50,
  posY: 50,
  stops: [
    { color: '#6d5dfc', pos: 0 },
    { color: '#ff6b9d', pos: 100 },
  ],
};

const gradientPreview = document.getElementById('gradientPreview');
const cssOutput = document.getElementById('cssOutput');
const angleControl = document.getElementById('angleControl');
const shapeControl = document.getElementById('shapeControl');
const positionControl = document.getElementById('positionControl');
const angleSlider = document.getElementById('angleSlider');
const angleValue = document.getElementById('angleValue');
const posXSlider = document.getElementById('posXSlider');
const posYSlider = document.getElementById('posYSlider');
const posXValue = document.getElementById('posXValue');
const posYValue = document.getElementById('posYValue');
const stopsList = document.getElementById('stopsList');
const presetsGrid = document.getElementById('presetsGrid');

function buildGradientCss(state) {
  const stops = [...state.stops].sort((a, b) => a.pos - b.pos);
  const stopsStr = stops.map(s => `${s.color} ${Math.round(s.pos)}%`).join(', ');
  if (state.type === 'linear') return `linear-gradient(${state.angle}deg, ${stopsStr})`;
  if (state.type === 'radial') return `radial-gradient(${state.shape} at ${state.posX}% ${state.posY}%, ${stopsStr})`;
  return `conic-gradient(from ${state.angle}deg at ${state.posX}% ${state.posY}%, ${stopsStr})`;
}

function renderGradientPreview() {
  const css = buildGradientCss(gradientState);
  gradientPreview.style.background = css;
  cssOutput.textContent = `background: ${css};`;
}

function renderControlVisibility() {
  angleControl.hidden = gradientState.type === 'radial';
  shapeControl.hidden = gradientState.type !== 'radial';
  positionControl.hidden = gradientState.type === 'linear';
  angleControl.querySelector('.control-label').firstChild.textContent =
    gradientState.type === 'conic' ? 'Start Angle ' : 'Angle ';
}

function renderStopsList() {
  stopsList.innerHTML = '';
  gradientState.stops.forEach((stop, i) => {
    const row = document.createElement('div');
    row.className = 'stop-row';
    row.innerHTML = `
      <input type="color" class="stop-color" value="${stop.color}" aria-label="Stop color">
      <input type="text" class="stop-hex" value="${stop.color.toUpperCase()}" maxlength="7" aria-label="Stop hex">
      <input type="range" class="stop-pos" min="0" max="100" value="${stop.pos}" aria-label="Stop position">
      <span class="stop-pos-value">${Math.round(stop.pos)}%</span>
      <button class="stop-remove" title="Remove stop" ${gradientState.stops.length <= 2 ? 'disabled' : ''}>✕</button>
    `;
    const colorInput = row.querySelector('.stop-color');
    const hexInput = row.querySelector('.stop-hex');
    const posInput = row.querySelector('.stop-pos');
    const posValue = row.querySelector('.stop-pos-value');
    const removeBtn = row.querySelector('.stop-remove');

    colorInput.addEventListener('input', () => {
      stop.color = colorInput.value;
      hexInput.value = colorInput.value.toUpperCase();
      renderGradientPreview();
    });
    hexInput.addEventListener('change', () => {
      const norm = normalizeHex(hexInput.value);
      if (norm) {
        stop.color = norm;
        colorInput.value = norm;
        hexInput.value = norm.toUpperCase();
        renderGradientPreview();
      } else {
        hexInput.value = stop.color.toUpperCase();
      }
    });
    posInput.addEventListener('input', () => {
      stop.pos = Number(posInput.value);
      posValue.textContent = `${stop.pos}%`;
      renderGradientPreview();
    });
    removeBtn.addEventListener('click', () => {
      if (gradientState.stops.length <= 2) return;
      gradientState.stops.splice(i, 1);
      renderStopsList();
      renderGradientPreview();
    });

    stopsList.appendChild(row);
  });
}

function addGradientStop() {
  if (gradientState.stops.length >= 8) { showToast('Maximum 8 stops'); return; }
  const sorted = [...gradientState.stops].sort((a, b) => a.pos - b.pos);
  let bestGap = -1, gapPos = 50;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].pos - sorted[i].pos;
    if (gap > bestGap) { bestGap = gap; gapPos = (sorted[i].pos + sorted[i + 1].pos) / 2; }
  }
  gradientState.stops.push({ color: randomHex(), pos: Math.round(gapPos) });
  renderStopsList();
  renderGradientPreview();
}

function randomizeGradient() {
  const count = clamp(gradientState.stops.length, 2, 5);
  const baseHue = Math.random() * 360;
  const spread = 40 + Math.random() * 60;
  gradientState.stops = Array.from({ length: count }, (_, i) => {
    const h = baseHue + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
    const s = 55 + Math.random() * 35;
    const l = 40 + Math.random() * 30;
    return { color: hslToHex(h, s, l), pos: Math.round((i / (count - 1)) * 100) };
  });
  if (gradientState.type === 'linear') gradientState.angle = Math.round(Math.random() * 360);
  if (gradientState.type === 'radial' || gradientState.type === 'conic') {
    gradientState.posX = Math.round(20 + Math.random() * 60);
    gradientState.posY = Math.round(20 + Math.random() * 60);
  }
  syncGradientControlsFromState();
  renderStopsList();
  renderGradientPreview();
  quirkyBounce(document.querySelector('#panel-gradient .preview-frame'));
}

function syncGradientControlsFromState() {
  angleSlider.value = gradientState.angle;
  angleValue.textContent = `${gradientState.angle}°`;
  posXSlider.value = gradientState.posX;
  posYSlider.value = gradientState.posY;
  posXValue.textContent = `${gradientState.posX}%`;
  posYValue.textContent = `${gradientState.posY}%`;
  document.querySelectorAll('#gradientTypeSeg .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === gradientState.type));
  document.querySelectorAll('#shapeSeg .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.shape === gradientState.shape));
  renderControlVisibility();
}

document.getElementById('gradientTypeSeg').addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  gradientState.type = btn.dataset.type;
  syncGradientControlsFromState();
  renderGradientPreview();
});

document.getElementById('shapeSeg').addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  gradientState.shape = btn.dataset.shape;
  syncGradientControlsFromState();
  renderGradientPreview();
});

angleSlider.addEventListener('input', () => {
  gradientState.angle = Number(angleSlider.value);
  angleValue.textContent = `${gradientState.angle}°`;
  renderGradientPreview();
});
posXSlider.addEventListener('input', () => {
  gradientState.posX = Number(posXSlider.value);
  posXValue.textContent = `${gradientState.posX}%`;
  renderGradientPreview();
});
posYSlider.addEventListener('input', () => {
  gradientState.posY = Number(posYSlider.value);
  posYValue.textContent = `${gradientState.posY}%`;
  renderGradientPreview();
});

document.getElementById('btnAddStop').addEventListener('click', addGradientStop);
document.getElementById('btnRandomGradient').addEventListener('click', randomizeGradient);
document.getElementById('btnCopyCss').addEventListener('click', () => copyText(cssOutput.textContent, 'CSS copied'));
cssOutput.addEventListener('click', () => copyText(cssOutput.textContent, 'CSS copied'));

function renderPresets() {
  presetsGrid.innerHTML = '';
  GRADIENT_PRESETS.forEach(preset => {
    const el = document.createElement('div');
    el.className = 'preset-swatch';
    el.title = preset.name;
    const type = preset.type || 'linear';
    const angle = preset.angle ?? 135;
    const stopsStr = preset.stops.map((c, i) => `${c} ${Math.round((i / (preset.stops.length - 1)) * 100)}%`).join(', ');
    el.style.background = type === 'radial'
      ? `radial-gradient(ellipse at 50% 50%, ${stopsStr})`
      : type === 'conic'
        ? `conic-gradient(from ${angle}deg at 50% 50%, ${stopsStr})`
        : `linear-gradient(${angle}deg, ${stopsStr})`;
    el.addEventListener('click', () => {
      gradientState = {
        type,
        angle,
        shape: 'ellipse',
        posX: 50,
        posY: 50,
        stops: preset.stops.map((c, i) => ({ color: c, pos: Math.round((i / (preset.stops.length - 1)) * 100) })),
      };
      syncGradientControlsFromState();
      renderStopsList();
      renderGradientPreview();
      showToast(`Loaded "${preset.name}"`);
    });
    presetsGrid.appendChild(el);
  });
  staggerIn(presetsGrid);
}

/* ---- canvas rendering for export ---- */

function linearGradientEndpoints(w, h, angleDeg) {
  const angle = ((angleDeg % 360) + 360) % 360;
  const rad = angle * Math.PI / 180;
  const length = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
  const half = length / 2;
  const cx = w / 2, cy = h / 2;
  const dx = Math.sin(rad) * half;
  const dy = -Math.cos(rad) * half;
  return { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy };
}

function drawGradientToCanvas(ctx, w, h, state) {
  const stops = [...state.stops].sort((a, b) => a.pos - b.pos);
  let grad;
  if (state.type === 'linear') {
    const { x1, y1, x2, y2 } = linearGradientEndpoints(w, h, state.angle);
    grad = ctx.createLinearGradient(x1, y1, x2, y2);
  } else if (state.type === 'radial') {
    const cx = w * state.posX / 100, cy = h * state.posY / 100;
    const r = Math.max(
      Math.hypot(cx, cy), Math.hypot(w - cx, cy),
      Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)
    );
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  } else if (typeof ctx.createConicGradient === 'function') {
    const cx = w * state.posX / 100, cy = h * state.posY / 100;
    const startRad = (state.angle - 90) * Math.PI / 180;
    grad = ctx.createConicGradient(startRad, cx, cy);
  } else {
    showToast('Conic export not supported in this browser — using a linear fallback');
    const { x1, y1, x2, y2 } = linearGradientEndpoints(w, h, 90);
    grad = ctx.createLinearGradient(x1, y1, x2, y2);
  }
  const uniquePositions = new Set();
  stops.forEach(s => {
    let pos = clamp(s.pos / 100, 0, 1);
    while (uniquePositions.has(pos)) pos = clamp(pos + 0.0001, 0, 1);
    uniquePositions.add(pos);
    grad.addColorStop(pos, s.color);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

document.getElementById('btnDownloadPng').addEventListener('click', () => {
  const canvas = document.getElementById('exportCanvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  drawGradientToCanvas(ctx, canvas.width, canvas.height, gradientState);
  downloadCanvasPng(canvas, 'gradient.png');
  showToast('Gradient PNG downloaded');
});

const gradientExportMenu = document.getElementById('gradientExportMenu');
document.getElementById('btnExportGradient').addEventListener('click', (e) => {
  e.stopPropagation();
  gradientExportMenu.classList.toggle('open');
});
document.addEventListener('click', () => gradientExportMenu.classList.remove('open'));

function tailwindArbitraryValue(css) {
  return css.replace(/\s+/g, '_').replace(/,/g, ',');
}

gradientExportMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-export]');
  if (!btn) return;
  const css = buildGradientCss(gradientState);
  if (btn.dataset.export === 'css') {
    downloadBlob(`.gradient {\n  width: 100%;\n  height: 100%;\n  background: ${css};\n}\n`, 'gradient.css', 'text/css');
    showToast('CSS file downloaded');
  } else if (btn.dataset.export === 'scss') {
    downloadBlob(`$gradient: ${css};\n`, 'gradient.scss', 'text/x-scss');
    showToast('SCSS file downloaded');
  } else if (btn.dataset.export === 'tailwind') {
    copyText(`bg-[${tailwindArbitraryValue(css)}]`, 'Tailwind class copied');
  }
  gradientExportMenu.classList.remove('open');
});

document.getElementById('btnShareGradient').addEventListener('click', () => {
  copyShareLink('gradient', gradientState);
});

/* ==========================================================================
   PALETTE STUDIO
   ========================================================================== */

let paletteState = {
  count: 5,
  harmony: 'random',
  colors: [],
  locked: [],
};

const paletteSwatchesEl = document.getElementById('paletteSwatches');
const paletteCountSlider = document.getElementById('paletteCountSlider');
const paletteCountValue = document.getElementById('paletteCountValue');
const harmonySelect = document.getElementById('harmonySelect');
const savedPalettesEl = document.getElementById('savedPalettes');
const savedEmptyHint = document.getElementById('savedEmptyHint');

function generatePaletteColors(harmony, count, existingColors, locked) {
  const lockedIndex = locked.findIndex(l => l);
  const baseHue = lockedIndex >= 0 ? hexToHsl(existingColors[lockedIndex]).h : Math.random() * 360;
  let hues;
  switch (harmony) {
    case 'monochromatic':
    case 'shades':
      hues = Array(count).fill(baseHue);
      break;
    case 'analogous':
      hues = Array.from({ length: count }, (_, i) => baseHue + (i - (count - 1) / 2) * 22);
      break;
    case 'complementary':
      hues = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? baseHue : baseHue + 180));
      break;
    case 'splitComplementary':
      hues = Array.from({ length: count }, (_, i) => {
        const m = i % 3;
        return m === 0 ? baseHue : m === 1 ? baseHue + 150 : baseHue + 210;
      });
      break;
    case 'triadic':
      hues = Array.from({ length: count }, (_, i) => baseHue + (i % 3) * 120);
      break;
    case 'tetradic':
      hues = Array.from({ length: count }, (_, i) => baseHue + (i % 4) * 90);
      break;
    default:
      hues = Array.from({ length: count }, () => Math.random() * 360);
  }
  return hues.map((h, i) => {
    if (locked[i] && existingColors[i]) return existingColors[i];
    let s, l;
    if (harmony === 'shades') {
      s = 55 + Math.random() * 25;
      l = 12 + (i / Math.max(1, count - 1)) * 76;
    } else if (harmony === 'monochromatic') {
      s = 35 + Math.random() * 45;
      l = 18 + (i / Math.max(1, count - 1)) * 64;
    } else {
      s = 52 + Math.random() * 38;
      l = 32 + Math.random() * 38;
    }
    return hslToHex(h, s, l);
  });
}

function ensurePaletteArrays() {
  while (paletteState.colors.length < paletteState.count) {
    paletteState.colors.push(randomHex());
    paletteState.locked.push(false);
  }
  paletteState.colors = paletteState.colors.slice(0, paletteState.count);
  paletteState.locked = paletteState.locked.slice(0, paletteState.count);
}

function generatePalette() {
  ensurePaletteArrays();
  paletteState.colors = generatePaletteColors(paletteState.harmony, paletteState.count, paletteState.colors, paletteState.locked);
  renderPaletteSwatches();
  quirkyBounce(paletteSwatchesEl);
}

function renderPaletteSwatches() {
  paletteSwatchesEl.innerHTML = '';
  paletteState.colors.forEach((color, i) => {
    const textColor = bestTextColor(color);
    const whiteRatio = contrastRatio(color, '#ffffff');
    const blackRatio = contrastRatio(color, '#000000');
    const locked = paletteState.locked[i];

    const el = document.createElement('div');
    el.className = 'swatch';
    el.style.background = color;
    el.style.color = textColor;
    el.innerHTML = `
      <div class="swatch-top">
        <button class="lock-btn" title="${locked ? 'Unlock' : 'Lock'}" aria-label="Toggle lock">${locked ? '🔒' : '🔓'}</button>
        <button class="eyedrop-btn" title="Pick color from screen" aria-label="Eyedropper">💧</button>
      </div>
      <div class="swatch-info">
        <input type="color" class="swatch-color-input" value="${color}" aria-label="Edit color">
        <span class="swatch-hex" title="Click to copy">${color.toUpperCase()}</span>
        <div class="swatch-contrast">
          <span class="badge" style="background:#fff;color:#111">white ${contrastLabel(whiteRatio)}</span>
          <span class="badge" style="background:#111;color:#fff">black ${contrastLabel(blackRatio)}</span>
        </div>
      </div>
    `;

    el.querySelector('.lock-btn').addEventListener('click', () => {
      paletteState.locked[i] = !paletteState.locked[i];
      renderPaletteSwatches();
    });

    const swatchHexEl = el.querySelector('.swatch-hex');
    swatchHexEl.addEventListener('click', () => copyText(color.toUpperCase(), `${color.toUpperCase()} copied`, swatchHexEl, color));

    el.querySelector('.swatch-color-input').addEventListener('input', (e) => {
      paletteState.colors[i] = e.target.value;
      paletteState.locked[i] = true;
      renderPaletteSwatches();
    });

    const eyedropBtn = el.querySelector('.eyedrop-btn');
    if (!('EyeDropper' in window)) {
      eyedropBtn.style.display = 'none';
    } else {
      eyedropBtn.addEventListener('click', async () => {
        try {
          const result = await new window.EyeDropper().open();
          paletteState.colors[i] = result.sRGBHex;
          paletteState.locked[i] = true;
          renderPaletteSwatches();
        } catch (e) { /* user cancelled */ }
      });
    }

    paletteSwatchesEl.appendChild(el);
  });
  staggerIn(paletteSwatchesEl);
}

paletteCountSlider.addEventListener('input', () => {
  paletteState.count = Number(paletteCountSlider.value);
  paletteCountValue.textContent = paletteState.count;
  ensurePaletteArrays();
  renderPaletteSwatches();
});

harmonySelect.addEventListener('change', () => {
  paletteState.harmony = harmonySelect.value;
  generatePalette();
});

document.getElementById('btnGeneratePalette').addEventListener('click', generatePalette);

document.getElementById('btnCopyAllHex').addEventListener('click', () => {
  copyText(paletteState.colors.map(c => c.toUpperCase()).join(', '), 'All hex codes copied');
});

/* ---- saved palettes ---- */

function getSavedPalettes() {
  try { return JSON.parse(localStorage.getItem('gradii_saved_palettes') || '[]'); }
  catch (e) { return []; }
}

function setSavedPalettes(list) {
  localStorage.setItem('gradii_saved_palettes', JSON.stringify(list));
}

function renderSavedPalettes() {
  const list = getSavedPalettes();
  savedEmptyHint.style.display = list.length ? 'none' : 'block';
  savedPalettesEl.querySelectorAll('.saved-item').forEach(n => n.remove());
  list.forEach(item => {
    const el = document.createElement('div');
    el.className = 'saved-item';
    el.title = 'Click to load, or click ✕ to remove';
    item.colors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.background = c;
      el.appendChild(chip);
    });
    const del = document.createElement('button');
    del.className = 'saved-delete';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      setSavedPalettes(getSavedPalettes().filter(p => p.id !== item.id));
      renderSavedPalettes();
    });
    el.appendChild(del);
    el.addEventListener('click', () => {
      paletteState.count = item.colors.length;
      paletteState.colors = [...item.colors];
      paletteState.locked = item.colors.map(() => false);
      paletteCountSlider.value = paletteState.count;
      paletteCountValue.textContent = paletteState.count;
      renderPaletteSwatches();
      showToast('Palette loaded');
    });
    savedPalettesEl.appendChild(el);
  });
}

document.getElementById('btnSavePalette').addEventListener('click', () => {
  const list = getSavedPalettes();
  list.unshift({ id: Date.now(), colors: [...paletteState.colors] });
  setSavedPalettes(list.slice(0, 24));
  renderSavedPalettes();
  showToast('Palette saved');
});

/* ---- export dropdown ---- */

const exportMenu = document.getElementById('exportMenu');
document.getElementById('btnExportPalette').addEventListener('click', (e) => {
  e.stopPropagation();
  exportMenu.classList.toggle('open');
});
document.addEventListener('click', () => exportMenu.classList.remove('open'));

function exportPaletteAsPng(colors) {
  const canvas = document.getElementById('exportCanvas');
  const w = 1200, h = 360;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const swatchW = w / colors.length;
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * swatchW, 0, swatchW, h);
    ctx.fillStyle = bestTextColor(color);
    ctx.font = '600 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(color.toUpperCase(), i * swatchW + swatchW / 2, h - 30);
  });
  downloadCanvasPng(canvas, 'palette.png');
}

function exportPaletteAsCss(colors) {
  const vars = colors.map((c, i) => `  --color-${i + 1}: ${c};`).join('\n');
  downloadBlob(`:root {\n${vars}\n}\n`, 'palette.css', 'text/css');
}

function exportPaletteAsJson(colors) {
  downloadBlob(JSON.stringify({ colors }, null, 2), 'palette.json', 'application/json');
}

function exportPaletteAsText(colors) {
  downloadBlob(colors.join('\n') + '\n', 'palette.txt', 'text/plain');
}

function exportPaletteAsScss(colors) {
  const vars = colors.map((c, i) => `$color-${i + 1}: ${c};`).join('\n');
  downloadBlob(vars + '\n', 'palette.scss', 'text/x-scss');
}

function exportPaletteAsTailwind(colors) {
  const entries = colors.map((c, i) => `        'palette-${i + 1}': '${c}',`).join('\n');
  const content = `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n${entries}\n      }\n    }\n  }\n}\n`;
  downloadBlob(content, 'tailwind.config.js', 'text/javascript');
}

/* ---- Adobe Swatch Exchange (.ase) binary encoder ---- */
function exportPaletteAsAse(colors) {
  const blocks = [];
  colors.forEach((hex, i) => {
    const { r, g, b } = hexToRgb(hex);
    const name = `Color ${i + 1}`;
    const nameBytes = [];
    for (const ch of name) nameBytes.push(ch.charCodeAt(0));
    const nameLen = nameBytes.length + 1;

    const dataParts = [];
    const nameLenBuf = new ArrayBuffer(2);
    new DataView(nameLenBuf).setUint16(0, nameLen, false);
    dataParts.push(new Uint8Array(nameLenBuf));

    const nameBuf = new ArrayBuffer(nameLen * 2);
    const nameView = new DataView(nameBuf);
    nameBytes.forEach((code, idx) => nameView.setUint16(idx * 2, code, false));
    nameView.setUint16((nameLen - 1) * 2, 0, false);
    dataParts.push(new Uint8Array(nameBuf));

    dataParts.push(new Uint8Array([0x52, 0x47, 0x42, 0x20])); // "RGB "

    const colorBuf = new ArrayBuffer(12);
    const colorView = new DataView(colorBuf);
    colorView.setFloat32(0, r / 255, false);
    colorView.setFloat32(4, g / 255, false);
    colorView.setFloat32(8, b / 255, false);
    dataParts.push(new Uint8Array(colorBuf));

    const typeBuf = new ArrayBuffer(2);
    new DataView(typeBuf).setUint16(0, 2, false); // color type: Normal
    dataParts.push(new Uint8Array(typeBuf));

    const totalLen = dataParts.reduce((sum, p) => sum + p.length, 0);
    const blockHeader = new ArrayBuffer(6);
    const headerView = new DataView(blockHeader);
    headerView.setUint16(0, 0x0001, false); // color entry block
    headerView.setUint32(2, totalLen, false);
    blocks.push(new Uint8Array(blockHeader));
    dataParts.forEach(p => blocks.push(p));
  });

  const fileHeader = new ArrayBuffer(12);
  const fh = new DataView(fileHeader);
  fh.setUint8(0, 0x41); fh.setUint8(1, 0x53); fh.setUint8(2, 0x45); fh.setUint8(3, 0x46); // "ASEF"
  fh.setUint16(4, 1, false);
  fh.setUint16(6, 0, false);
  fh.setUint32(8, colors.length, false);

  const totalSize = 12 + blocks.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(totalSize);
  out.set(new Uint8Array(fileHeader), 0);
  let offset = 12;
  blocks.forEach(b => { out.set(b, offset); offset += b.length; });

  const blob = new Blob([out], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'palette.ase';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportPaletteAsGpl(colors) {
  const lines = ['GIMP Palette', 'Name: Gradii Palette', 'Columns: 0', '#'];
  colors.forEach((hex, i) => {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${String(Math.round(r)).padStart(3)} ${String(Math.round(g)).padStart(3)} ${String(Math.round(b)).padStart(3)}\tColor ${i + 1}`);
  });
  downloadBlob(lines.join('\n') + '\n', 'palette.gpl', 'text/plain');
}

exportMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-export]');
  if (!btn) return;
  const colors = paletteState.colors;
  if (btn.dataset.export === 'png') exportPaletteAsPng(colors);
  if (btn.dataset.export === 'css') exportPaletteAsCss(colors);
  if (btn.dataset.export === 'scss') exportPaletteAsScss(colors);
  if (btn.dataset.export === 'tailwind') exportPaletteAsTailwind(colors);
  if (btn.dataset.export === 'ase') exportPaletteAsAse(colors);
  if (btn.dataset.export === 'gpl') exportPaletteAsGpl(colors);
  if (btn.dataset.export === 'json') exportPaletteAsJson(colors);
  if (btn.dataset.export === 'text') exportPaletteAsText(colors);
  exportMenu.classList.remove('open');
  showToast('Palette exported');
});

document.getElementById('btnSharePalette').addEventListener('click', () => {
  copyShareLink('palette', paletteState);
});

/* ==========================================================================
   MESH GRADIENT STUDIO
   ========================================================================== */

const MESH_PRESETS = [
  { name: 'Aurora', baseColor: '#0b1026', blendMode: 'screen', points: [
    { x: 15, y: 20, size: 65, color: '#00f2fe' }, { x: 80, y: 15, size: 60, color: '#7b2ff7' },
    { x: 50, y: 70, size: 70, color: '#22d3c5' }, { x: 85, y: 80, size: 55, color: '#4facfe' },
  ] },
  { name: 'Candy Cloud', baseColor: '#fff5f8', blendMode: 'normal', points: [
    { x: 20, y: 30, size: 65, color: '#ff9a9e' }, { x: 75, y: 20, size: 60, color: '#fbc2eb' },
    { x: 50, y: 75, size: 70, color: '#a18cd1' }, { x: 85, y: 70, size: 55, color: '#fecfef' },
  ] },
  { name: 'Sunset Blur', baseColor: '#1a0f2e', blendMode: 'screen', points: [
    { x: 20, y: 25, size: 60, color: '#ff512f' }, { x: 75, y: 20, size: 65, color: '#f09819' },
    { x: 50, y: 75, size: 70, color: '#ff4b8b' }, { x: 85, y: 75, size: 55, color: '#ffd200' },
  ] },
  { name: 'Deep Space', baseColor: '#000000', blendMode: 'screen', points: [
    { x: 15, y: 20, size: 55, color: '#3f2b96' }, { x: 80, y: 25, size: 60, color: '#a8c0ff' },
    { x: 50, y: 80, size: 65, color: '#654ea3' }, { x: 85, y: 80, size: 50, color: '#eaafc8' },
  ] },
  { name: 'Citrus', baseColor: '#fffdf5', blendMode: 'multiply', points: [
    { x: 20, y: 25, size: 60, color: '#f7971e' }, { x: 78, y: 20, size: 60, color: '#ffd200' },
    { x: 50, y: 78, size: 65, color: '#a8ff78' }, { x: 85, y: 75, size: 55, color: '#78ffd6' },
  ] },
  { name: 'Northern Lights', baseColor: '#04121a', blendMode: 'screen', points: [
    { x: 20, y: 15, size: 60, color: '#43cea2' }, { x: 75, y: 25, size: 65, color: '#185a9d' },
    { x: 45, y: 75, size: 70, color: '#00c9ff' }, { x: 85, y: 80, size: 50, color: '#92fe9d' },
  ] },
  { name: 'Bubblegum', baseColor: '#0f0f1a', blendMode: 'overlay', points: [
    { x: 25, y: 25, size: 65, color: '#ff6b9d' }, { x: 75, y: 20, size: 60, color: '#845ef7' },
    { x: 50, y: 75, size: 70, color: '#22d3c5' }, { x: 85, y: 75, size: 55, color: '#ffd43b' },
  ] },
  { name: 'Molten', baseColor: '#0a0505', blendMode: 'screen', points: [
    { x: 20, y: 25, size: 60, color: '#f12711' }, { x: 78, y: 20, size: 60, color: '#f5af19' },
    { x: 50, y: 78, size: 68, color: '#eb3349' }, { x: 85, y: 78, size: 52, color: '#f45c43' },
  ] },
];

let meshState = {
  baseColor: '#0f1020',
  blendMode: 'normal',
  points: [],
};

const meshPreview = document.getElementById('meshPreview');
const meshCssOutput = document.getElementById('meshCssOutput');
const meshBaseColorInput = document.getElementById('meshBaseColorInput');
const meshBaseColorHex = document.getElementById('meshBaseColorHex');
const meshBlendSelect = document.getElementById('meshBlendSelect');
const meshBlobsList = document.getElementById('meshBlobsList');
const meshPresetsGrid = document.getElementById('meshPresetsGrid');

const MESH_COMPOSITE_MAP = {
  normal: 'source-over',
  screen: 'screen',
  multiply: 'multiply',
  overlay: 'overlay',
  difference: 'difference',
  'color-dodge': 'color-dodge',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
};

function randomMeshPoints(count) {
  const baseHue = Math.random() * 360;
  return Array.from({ length: count }, () => ({
    x: Math.round(Math.random() * 100),
    y: Math.round(Math.random() * 100),
    size: Math.round(45 + Math.random() * 35),
    color: hslToHex(baseHue + (Math.random() - 0.5) * 160, 55 + Math.random() * 35, 45 + Math.random() * 25),
  }));
}

function buildMeshCssLayers(state) {
  return state.points
    .map(p => `radial-gradient(circle at ${p.x}% ${p.y}%, ${p.color} 0%, transparent ${p.size}%)`);
}

function renderMeshPreview() {
  const layers = buildMeshCssLayers(meshState);
  meshPreview.style.backgroundColor = meshState.baseColor;
  meshPreview.style.backgroundImage = layers.join(', ');
  meshPreview.style.backgroundBlendMode = meshState.blendMode;
  meshBaseColorInput.value = meshState.baseColor;
  meshBaseColorHex.textContent = meshState.baseColor.toUpperCase();
  meshBlendSelect.value = meshState.blendMode;

  const cssLayers = layers.map(l => `    ${l}`).join(',\n');
  meshCssOutput.textContent =
    `background-color: ${meshState.baseColor};\n` +
    `background-image:\n${cssLayers};\n` +
    `background-blend-mode: ${meshState.blendMode};`;
}

function renderMeshBlobsList() {
  meshBlobsList.innerHTML = '';
  meshState.points.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'mesh-blob-row';
    row.innerHTML = `
      <input type="color" class="mesh-blob-color" value="${p.color}" aria-label="Blob color">
      <div class="mesh-blob-fields">
        <div class="mesh-blob-field">
          <span>X</span>
          <input type="range" class="mesh-blob-x" min="0" max="100" value="${p.x}">
          <span class="mesh-blob-x-value">${p.x}%</span>
        </div>
        <div class="mesh-blob-field">
          <span>Y</span>
          <input type="range" class="mesh-blob-y" min="0" max="100" value="${p.y}">
          <span class="mesh-blob-y-value">${p.y}%</span>
        </div>
        <div class="mesh-blob-field">
          <span>Size</span>
          <input type="range" class="mesh-blob-size" min="20" max="90" value="${p.size}">
          <span class="mesh-blob-size-value">${p.size}%</span>
        </div>
      </div>
      <button class="mesh-blob-remove" title="Remove blob" ${meshState.points.length <= 3 ? 'disabled' : ''}>✕</button>
    `;
    row.querySelector('.mesh-blob-color').addEventListener('input', (e) => {
      p.color = e.target.value;
      renderMeshPreview();
    });
    row.querySelector('.mesh-blob-x').addEventListener('input', (e) => {
      p.x = Number(e.target.value);
      row.querySelector('.mesh-blob-x-value').textContent = `${p.x}%`;
      renderMeshPreview();
    });
    row.querySelector('.mesh-blob-y').addEventListener('input', (e) => {
      p.y = Number(e.target.value);
      row.querySelector('.mesh-blob-y-value').textContent = `${p.y}%`;
      renderMeshPreview();
    });
    row.querySelector('.mesh-blob-size').addEventListener('input', (e) => {
      p.size = Number(e.target.value);
      row.querySelector('.mesh-blob-size-value').textContent = `${p.size}%`;
      renderMeshPreview();
    });
    row.querySelector('.mesh-blob-remove').addEventListener('click', () => {
      if (meshState.points.length <= 3) return;
      meshState.points.splice(i, 1);
      renderMeshBlobsList();
      renderMeshPreview();
    });
    meshBlobsList.appendChild(row);
  });
}

function renderMeshPresets() {
  meshPresetsGrid.innerHTML = '';
  MESH_PRESETS.forEach(preset => {
    const el = document.createElement('div');
    el.className = 'preset-swatch';
    el.title = preset.name;
    const layers = preset.points.map(p => `radial-gradient(circle at ${p.x}% ${p.y}%, ${p.color} 0%, transparent ${p.size}%)`).join(', ');
    el.style.backgroundColor = preset.baseColor;
    el.style.backgroundImage = layers;
    el.style.backgroundBlendMode = preset.blendMode;
    el.addEventListener('click', () => {
      meshState = {
        baseColor: preset.baseColor,
        blendMode: preset.blendMode,
        points: preset.points.map(p => ({ ...p })),
      };
      renderMeshBlobsList();
      renderMeshPreview();
      showToast(`Loaded "${preset.name}"`);
    });
    meshPresetsGrid.appendChild(el);
  });
  staggerIn(meshPresetsGrid);
}

function randomizeMesh() {
  meshState.baseColor = randomHex();
  meshState.points = randomMeshPoints(meshState.points.length || 5);
  renderMeshBlobsList();
  renderMeshPreview();
  quirkyBounce(document.querySelector('#panel-mesh .preview-frame'));
}

document.getElementById('btnAddBlob').addEventListener('click', () => {
  if (meshState.points.length >= 10) { showToast('Maximum 10 blobs'); return; }
  const baseHue = meshState.points.length ? hexToHsl(meshState.points[0].color).h : Math.random() * 360;
  meshState.points.push({
    x: Math.round(Math.random() * 100),
    y: Math.round(Math.random() * 100),
    size: 55,
    color: hslToHex(baseHue + (Math.random() - 0.5) * 160, 60, 55),
  });
  renderMeshBlobsList();
  renderMeshPreview();
});

meshBaseColorInput.addEventListener('input', () => {
  meshState.baseColor = meshBaseColorInput.value;
  renderMeshPreview();
});

meshBlendSelect.addEventListener('change', () => {
  meshState.blendMode = meshBlendSelect.value;
  renderMeshPreview();
});

document.getElementById('btnRandomMesh').addEventListener('click', randomizeMesh);
document.getElementById('btnCopyMeshCss').addEventListener('click', () => copyText(meshCssOutput.textContent, 'CSS copied'));
meshCssOutput.addEventListener('click', () => copyText(meshCssOutput.textContent, 'CSS copied'));
document.getElementById('btnShareMesh').addEventListener('click', () => copyShareLink('mesh', meshState));

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

document.getElementById('btnDownloadMeshPng').addEventListener('click', () => {
  const canvas = document.getElementById('exportCanvas');
  const w = 1600, h = 1000;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = meshState.baseColor;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = MESH_COMPOSITE_MAP[meshState.blendMode] || 'source-over';
  meshState.points.forEach(p => {
    const cx = w * p.x / 100, cy = h * p.y / 100;
    const r = (p.size / 100) * Math.max(w, h) * 0.8;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, hexToRgba(p.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';
  downloadCanvasPng(canvas, 'mesh-gradient.png');
  showToast('Mesh gradient PNG downloaded');
});

/* ==========================================================================
   WALLPAPER STUDIO
   Pattern renderers below are intentionally pure (only args, no closures)
   so they can be serialized via Function.prototype.toString() straight
   into the standalone "Live HTML File" export — see exportWallpaperHtml().
   ========================================================================== */

function wpHexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16) || 0;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function wpDrawFlowingMesh(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#0f1020';
  const blobs = colors.length > 1 ? colors.slice(1) : colors;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  blobs.forEach((color, i) => {
    const n = blobs.length;
    const phase = (i / n) * Math.PI * 2;
    const cx = w * (0.5 + 0.32 * Math.sin(t * speed * 0.6 + phase));
    const cy = h * (0.5 + 0.32 * Math.cos(t * speed * 0.5 + phase * 1.3));
    const r = Math.max(w, h) * (0.35 + 0.08 * Math.sin(t * speed + i));
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, wpHexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';
}

function wpDrawAuroraFlow(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#04070f';
  const bands = colors.length > 1 ? colors.slice(1) : colors;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  bands.forEach((color, i) => {
    const freq = 1.4 + i * 0.35;
    const amp = h * (0.06 + 0.02 * i);
    const yBase = h * (0.28 + (i / Math.max(1, bands.length - 1)) * 0.44);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 64) {
      const y = yBase + Math.sin((x / w) * Math.PI * freq + t * speed * 1.2 + i) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, yBase - amp, 0, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, wpHexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
}

function wpDrawRadialPulse(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#050505';
  const pulses = colors.length > 1 ? colors.slice(1) : colors;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  pulses.forEach((color, i) => {
    const n = pulses.length;
    const angle = (i / n) * Math.PI * 2 + t * speed * 0.15;
    const dist = Math.min(w, h) * 0.22;
    const cx = w / 2 + Math.cos(angle) * dist;
    const cy = h / 2 + Math.sin(angle) * dist;
    const pulse = 0.75 + 0.25 * Math.sin(t * speed * 2 + i * 1.7);
    const r = Math.max(w, h) * 0.4 * pulse;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, wpHexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';
}

function wpDrawConicSpin(ctx, w, h, t, colors, speed) {
  const cx = w / 2, cy = h / 2;
  const list = colors.length ? colors : ['#6d5dfc', '#ff6b9d'];
  if (typeof ctx.createConicGradient === 'function') {
    const grad = ctx.createConicGradient(t * speed * 0.6, cx, cy);
    const looped = list.concat([list[0]]);
    looped.forEach((c, i) => grad.addColorStop(i / Math.max(1, looped.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = list[0];
    ctx.fillRect(0, 0, w, h);
  }
}

function wpDrawWaveBands(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#0f1020';
  const bands = colors.length > 1 ? colors.slice(1) : colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  bands.forEach((color, i) => {
    const n = bands.length;
    const freq = 1 + i * 0.4;
    const amp = h * (0.05 + i * 0.015);
    const baseline = h * (0.35 + (i / Math.max(1, n - 1)) * 0.45);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseline);
    for (let x = 0; x <= w; x += w / 64) {
      const y = baseline + Math.sin((x / w) * Math.PI * 2 * freq + t * speed * (0.6 + i * 0.2)) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, baseline);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function wpDrawFrame(pattern, ctx, w, h, t, colors, speed) {
  ctx.save();
  if (pattern === 'auroraFlow') wpDrawAuroraFlow(ctx, w, h, t, colors, speed);
  else if (pattern === 'radialPulse') wpDrawRadialPulse(ctx, w, h, t, colors, speed);
  else if (pattern === 'conicSpin') wpDrawConicSpin(ctx, w, h, t, colors, speed);
  else if (pattern === 'waveBands') wpDrawWaveBands(ctx, w, h, t, colors, speed);
  else wpDrawFlowingMesh(ctx, w, h, t, colors, speed);
  ctx.restore();
}

const WALLPAPER_PRESETS = [
  { name: 'Nebula Drift', pattern: 'flowingMesh', speed: 1.0, colors: ['#05030f', '#6d5dfc', '#ff6b9d', '#22d3c5'] },
  { name: 'Northern Lights', pattern: 'auroraFlow', speed: 0.8, colors: ['#020814', '#00f2fe', '#43cea2', '#7b2ff7'] },
  { name: 'Heartbeat', pattern: 'radialPulse', speed: 1.4, colors: ['#0a0505', '#ff512f', '#f5af19'] },
  { name: 'Color Wheel', pattern: 'conicSpin', speed: 0.6, colors: ['#6d5dfc', '#ff6b9d', '#ffd43b', '#22d3c5'] },
  { name: 'Ocean Waves', pattern: 'waveBands', speed: 0.7, colors: ['#04263c', '#0077b6', '#00b4d8', '#90e0ef'] },
  { name: 'Molten Core', pattern: 'radialPulse', speed: 1.8, colors: ['#0a0505', '#f12711', '#f5af19'] },
  { name: 'Candy Drift', pattern: 'flowingMesh', speed: 0.9, colors: ['#1a0f1e', '#ff9a9e', '#a18cd1', '#fbc2eb'] },
  { name: 'Citrus Spin', pattern: 'conicSpin', speed: 0.5, colors: ['#fffdf5', '#f7971e', '#ffd200', '#a8ff78'] },
];

let wallpaperState = {
  pattern: 'flowingMesh',
  speed: 1.0,
  live: true,
  colors: ['#0f1020', '#6d5dfc', '#ff6b9d', '#22d3c5'],
};

const wallpaperCanvas = document.getElementById('wallpaperCanvas');
const wallpaperCtx = wallpaperCanvas.getContext('2d');
const wallpaperPatternSelect = document.getElementById('wallpaperPatternSelect');
const wallpaperSpeedSlider = document.getElementById('wallpaperSpeedSlider');
const wallpaperSpeedValue = document.getElementById('wallpaperSpeedValue');
const wallpaperColorsList = document.getElementById('wallpaperColorsList');
const wallpaperPresetsGrid = document.getElementById('wallpaperPresetsGrid');
const wallpaperModeSeg = document.getElementById('wallpaperModeSeg');
const btnWallpaperNewFrame = document.getElementById('btnWallpaperNewFrame');
const wallpaperResolutionSelect = document.getElementById('wallpaperResolutionSelect');

let wallpaperAnimId = null;
let wallpaperAnimStart = null;
let wallpaperFrozenT = 0;

function resizeWallpaperCanvas() {
  const rect = wallpaperCanvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  wallpaperCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  wallpaperCanvas.height = Math.max(1, Math.round(rect.height * dpr));
}

function drawWallpaperFrame(t) {
  wpDrawFrame(wallpaperState.pattern, wallpaperCtx, wallpaperCanvas.width, wallpaperCanvas.height, t, wallpaperState.colors, wallpaperState.speed);
}

function wallpaperTick(ts) {
  if (wallpaperAnimStart === null) wallpaperAnimStart = ts - wallpaperFrozenT * 1000;
  wallpaperFrozenT = (ts - wallpaperAnimStart) / 1000;
  drawWallpaperFrame(wallpaperFrozenT);
  wallpaperAnimId = requestAnimationFrame(wallpaperTick);
}

function startWallpaperAnimation() {
  if (wallpaperAnimId !== null) return;
  wallpaperAnimStart = null;
  wallpaperAnimId = requestAnimationFrame(wallpaperTick);
}

function stopWallpaperAnimation() {
  if (wallpaperAnimId !== null) {
    cancelAnimationFrame(wallpaperAnimId);
    wallpaperAnimId = null;
  }
}

function activateWallpaperTab() {
  resizeWallpaperCanvas();
  if (wallpaperState.live) startWallpaperAnimation();
  else drawWallpaperFrame(wallpaperFrozenT);
}

function renderWallpaperColorsList() {
  wallpaperColorsList.innerHTML = '';
  wallpaperState.colors.forEach((color, i) => {
    const chip = document.createElement('div');
    chip.className = 'wallpaper-color-chip';
    chip.innerHTML = `
      <input type="color" value="${color}" aria-label="Wallpaper color ${i + 1}">
      <button class="wallpaper-color-remove" title="Remove color" ${wallpaperState.colors.length <= 2 ? 'disabled' : ''}>✕</button>
    `;
    chip.querySelector('input').addEventListener('input', (e) => {
      wallpaperState.colors[i] = e.target.value;
      if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
    });
    chip.querySelector('.wallpaper-color-remove').addEventListener('click', () => {
      if (wallpaperState.colors.length <= 2) return;
      wallpaperState.colors.splice(i, 1);
      renderWallpaperColorsList();
      if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
    });
    wallpaperColorsList.appendChild(chip);
  });
}

function renderWallpaperPresets() {
  wallpaperPresetsGrid.innerHTML = '';
  WALLPAPER_PRESETS.forEach(preset => {
    const canvas = document.createElement('canvas');
    canvas.className = 'preset-swatch';
    canvas.width = 96;
    canvas.height = 96;
    canvas.title = preset.name;
    const ctx = canvas.getContext('2d');
    wpDrawFrame(preset.pattern, ctx, 96, 96, 0.6, preset.colors, preset.speed);
    canvas.addEventListener('click', () => {
      wallpaperState.pattern = preset.pattern;
      wallpaperState.colors = [...preset.colors];
      wallpaperState.speed = preset.speed;
      wallpaperPatternSelect.value = preset.pattern;
      wallpaperSpeedSlider.value = Math.round(preset.speed * 10);
      wallpaperSpeedValue.textContent = `${preset.speed.toFixed(1)}×`;
      renderWallpaperColorsList();
      if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
      showToast(`Loaded "${preset.name}"`);
    });
    wallpaperPresetsGrid.appendChild(canvas);
  });
  staggerIn(wallpaperPresetsGrid);
}

function randomizeWallpaperColors() {
  const n = wallpaperState.colors.length;
  const baseHue = Math.random() * 360;
  wallpaperState.colors = Array.from({ length: n }, (_, i) => {
    if (i === 0) return hslToHex(baseHue, 30 + Math.random() * 20, 8 + Math.random() * 10);
    const h = baseHue + (Math.random() - 0.5) * 150;
    return hslToHex(h, 55 + Math.random() * 35, 45 + Math.random() * 25);
  });
  renderWallpaperColorsList();
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
  quirkyBounce(document.querySelector('#panel-wallpaper .preview-frame'));
}

wallpaperPatternSelect.addEventListener('change', () => {
  wallpaperState.pattern = wallpaperPatternSelect.value;
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
});

wallpaperSpeedSlider.addEventListener('input', () => {
  wallpaperState.speed = Number(wallpaperSpeedSlider.value) / 10;
  wallpaperSpeedValue.textContent = `${wallpaperState.speed.toFixed(1)}×`;
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
});

wallpaperModeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  const live = btn.dataset.mode === 'live';
  wallpaperState.live = live;
  wallpaperModeSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === btn.dataset.mode));
  btnWallpaperNewFrame.hidden = live;
  if (live) startWallpaperAnimation();
  else stopWallpaperAnimation();
});

btnWallpaperNewFrame.addEventListener('click', () => {
  wallpaperFrozenT = Math.random() * 60;
  drawWallpaperFrame(wallpaperFrozenT);
});

document.getElementById('btnAddWallpaperColor').addEventListener('click', () => {
  if (wallpaperState.colors.length >= 6) { showToast('Maximum 6 colors'); return; }
  wallpaperState.colors.push(randomHex());
  renderWallpaperColorsList();
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
});

document.getElementById('btnRandomWallpaperColors').addEventListener('click', randomizeWallpaperColors);

document.getElementById('btnShareWallpaper').addEventListener('click', () => {
  copyShareLink('wallpaper', wallpaperState);
});

document.getElementById('btnDownloadWallpaperPng').addEventListener('click', () => {
  const [wStr, hStr] = wallpaperResolutionSelect.value.split('x');
  const w = Number(wStr), h = Number(hStr);
  const canvas = document.getElementById('exportCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  wpDrawFrame(wallpaperState.pattern, ctx, w, h, wallpaperFrozenT, wallpaperState.colors, wallpaperState.speed);
  downloadCanvasPng(canvas, `wallpaper-${wStr}x${hStr}.png`);
  showToast('Wallpaper PNG downloaded');
});

document.getElementById('btnRecordWallpaper').addEventListener('click', () => {
  if (typeof MediaRecorder === 'undefined' || typeof wallpaperCanvas.captureStream !== 'function') {
    showToast('Video recording not supported in this browser');
    return;
  }
  const wasLive = wallpaperState.live;
  if (!wasLive) startWallpaperAnimation();

  const stream = wallpaperCanvas.captureStream(30);
  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = mimeCandidates.find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));

  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (e) {
    showToast('Video recording not supported in this browser');
    if (!wasLive) stopWallpaperAnimation();
    return;
  }

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mime || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wallpaper.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (!wasLive) stopWallpaperAnimation();
    showToast('Video downloaded');
  };

  recorder.start();
  showToast('Recording 6s loop…');
  setTimeout(() => recorder.stop(), 6000);
});

function exportWallpaperHtml() {
  const functionsSrc = [wpHexToRgba, wpDrawFlowingMesh, wpDrawAuroraFlow, wpDrawRadialPulse, wpDrawConicSpin, wpDrawWaveBands, wpDrawFrame]
    .map(fn => fn.toString())
    .join('\n\n');
  const stateJson = JSON.stringify({
    pattern: wallpaperState.pattern,
    colors: wallpaperState.colors,
    speed: wallpaperState.speed,
  });
  const html = `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<title>Gradii Live Wallpaper</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
  canvas { display: block; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const wallpaperData = ${stateJson};

${functionsSrc}

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
resize();
window.addEventListener('resize', resize);
let start = null;
function loop(ts) {
  if (start === null) start = ts;
  const t = (ts - start) / 1000;
  wpDrawFrame(wallpaperData.pattern, ctx, canvas.width, canvas.height, t, wallpaperData.colors, wallpaperData.speed);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
</script>
</body>
</html>
`;
  downloadBlob(html, 'gradii-live-wallpaper.html', 'text/html');
}

document.getElementById('btnDownloadWallpaperHtml').addEventListener('click', () => {
  exportWallpaperHtml();
  showToast('Live wallpaper HTML downloaded');
});

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'wallpaper') activateWallpaperTab();
    else stopWallpaperAnimation();
  });
});

/* ==========================================================================
   IMAGE COLOR EXTRACTOR
   ========================================================================== */

const dropZone = document.getElementById('dropZone');
const imageInput = document.getElementById('imageInput');
const imagePreviewWrap = document.getElementById('imagePreviewWrap');
const imagePreview = document.getElementById('imagePreview');
const extractedPaletteEl = document.getElementById('extractedPalette');
const imageActions = document.getElementById('imageActions');
let extractedColors = [];

dropZone.addEventListener('click', () => imageInput.click());
dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') imageInput.click(); });
['dragover', 'dragenter'].forEach(evt => dropZone.addEventListener(evt, (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
}));
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleImageFile(file);
});
imageInput.addEventListener('change', () => {
  if (imageInput.files[0]) handleImageFile(imageInput.files[0]);
});

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreviewWrap.hidden = false;
    imagePreview.onload = () => {
      extractedColors = extractDominantColors(imagePreview, 6);
      renderExtractedPalette();
      imageActions.hidden = false;
    };
  };
  reader.readAsDataURL(file);
}

function extractDominantColors(imgEl, numColors) {
  const maxDim = 150;
  const scale = Math.min(1, maxDim / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const w = Math.max(1, Math.round(imgEl.naturalWidth * scale));
  const h = Math.max(1, Math.round(imgEl.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const buckets = new Map();
  const shift = 4;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> shift) << 8) | ((g >> shift) << 4) | (b >> shift);
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
    buckets.set(key, bucket);
  }

  const averaged = [...buckets.values()]
    .map(b => ({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count }))
    .sort((a, b) => b.count - a.count);

  const result = [];
  const threshold = 42;
  for (const c of averaged) {
    if (result.length >= numColors) break;
    const tooClose = result.some(r => Math.hypot(r.r - c.r, r.g - c.g, r.b - c.b) < threshold);
    if (!tooClose) result.push(c);
  }
  let i = 0;
  while (result.length < numColors && i < averaged.length) {
    if (!result.includes(averaged[i])) result.push(averaged[i]);
    i++;
  }
  return result.slice(0, numColors).map(c => rgbToHex(c.r, c.g, c.b));
}

function renderExtractedPalette() {
  extractedPaletteEl.innerHTML = '';
  extractedColors.forEach(color => {
    const textColor = bestTextColor(color);
    const el = document.createElement('div');
    el.className = 'swatch';
    el.style.background = color;
    el.style.color = textColor;
    el.innerHTML = `
      <div class="swatch-top"></div>
      <div class="swatch-info">
        <span class="swatch-hex" title="Click to copy">${color.toUpperCase()}</span>
      </div>
    `;
    const hexEl = el.querySelector('.swatch-hex');
    hexEl.addEventListener('click', () => copyText(color.toUpperCase(), `${color.toUpperCase()} copied`, hexEl, color));
    extractedPaletteEl.appendChild(el);
  });
  staggerIn(extractedPaletteEl);
}

document.getElementById('btnSendToPalette').addEventListener('click', () => {
  const count = clamp(extractedColors.length, 3, 8);
  paletteState.count = count;
  paletteState.colors = extractedColors.slice(0, count);
  paletteState.locked = paletteState.colors.map(() => false);
  paletteCountSlider.value = count;
  paletteCountValue.textContent = count;
  renderPaletteSwatches();
  setActiveTab('palette');
  showToast('Sent to Palette Studio');
});

document.getElementById('btnAnotherImage').addEventListener('click', () => imageInput.click());

/* ==========================================================================
   Shareable links
   ========================================================================== */

function encodeState(obj) {
  try {
    return encodeURIComponent(btoa(JSON.stringify(obj)));
  } catch (e) {
    return '';
  }
}

function decodeState(str) {
  try {
    return JSON.parse(atob(decodeURIComponent(str)));
  } catch (e) {
    return null;
  }
}

function copyShareLink(tab, state) {
  const encoded = encodeState(state);
  if (!encoded) { showToast('Could not create share link'); return; }
  const url = `${location.origin}${location.pathname}?tab=${tab}&d=${encoded}`;
  copyText(url, 'Share link copied');
}

function loadStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const data = params.get('d');
  if (!tab || !data) return;
  const state = decodeState(data);
  if (!state) return;

  if (tab === 'gradient' && state.stops) {
    gradientState = state;
    syncGradientControlsFromState();
    renderStopsList();
    renderGradientPreview();
    setActiveTab('gradient');
  } else if (tab === 'palette' && state.colors) {
    paletteState = state;
    paletteCountSlider.value = paletteState.count;
    paletteCountValue.textContent = paletteState.count;
    harmonySelect.value = paletteState.harmony || 'random';
    renderPaletteSwatches();
    setActiveTab('palette');
  } else if (tab === 'mesh' && state.points) {
    meshState = state;
    renderMeshBlobsList();
    renderMeshPreview();
    setActiveTab('mesh');
  } else if (tab === 'wallpaper' && state.pattern && state.colors) {
    wallpaperState = state;
    wallpaperPatternSelect.value = wallpaperState.pattern;
    wallpaperSpeedSlider.value = Math.round(wallpaperState.speed * 10);
    wallpaperSpeedValue.textContent = `${wallpaperState.speed.toFixed(1)}×`;
    wallpaperModeSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', (b.dataset.mode === 'live') === wallpaperState.live));
    btnWallpaperNewFrame.hidden = wallpaperState.live;
    renderWallpaperColorsList();
    setActiveTab('wallpaper');
    activateWallpaperTab();
  }
  showToast('Loaded shared design');
}

/* ==========================================================================
   Progressive Web App: service worker registration
   ========================================================================== */

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install unavailable */ });
  });
}

/* ==========================================================================
   Keyboard shortcuts
   ========================================================================== */

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (activeTab === 'palette') generatePalette();
    else if (activeTab === 'gradient') randomizeGradient();
    else if (activeTab === 'mesh') randomizeMesh();
    else if (activeTab === 'wallpaper') randomizeWallpaperColors();
  }
});

/* ==========================================================================
   Init
   ========================================================================== */

function init() {
  syncGradientControlsFromState();
  renderStopsList();
  renderGradientPreview();
  renderPresets();

  ensurePaletteArrays();
  paletteState.colors = generatePaletteColors('random', paletteState.count, [], paletteState.locked);
  renderPaletteSwatches();
  renderSavedPalettes();

  meshState.points = randomMeshPoints(5);
  renderMeshBlobsList();
  renderMeshPresets();
  renderMeshPreview();

  renderWallpaperColorsList();
  renderWallpaperPresets();

  loadStateFromUrl();

  initGlobalPressFeedback();
  introReveal();
}

init();
