'use strict';

/* ==========================================================================
   Color utilities
   ========================================================================== */

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* ---------------- OKLCH color space (Björn Ottosson's OKLab) ----------------
   Interpolating in OKLCH instead of RGB/HSL avoids the muddy, uneven-looking
   midpoints classic gradients get between saturated colors (e.g. red→green
   passing through a grey-brown instead of a clean, equally-bright orange). */
function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055; return clamp(Math.round(c * 255), 0, 255); }

function hexToOklab(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}
function oklabToHex(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return rgbToHex(linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb));
}
function hexToOklch(hex) {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.sqrt(a * a + b * b);
  let H = Math.atan2(b, a) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}
function oklchToHex(L, C, H) {
  const hr = H * Math.PI / 180;
  return oklabToHex(L, C * Math.cos(hr), C * Math.sin(hr));
}
function mixOklch(hexA, hexB, t) {
  const a = hexToOklch(hexA), b = hexToOklch(hexB);
  let dh = b.H - a.H;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const H = (a.H + dh * t + 360) % 360;
  const L = a.L + (b.L - a.L) * t;
  const C = a.C + (b.C - a.C) * t;
  return oklchToHex(L, C, H);
}

/* Exports sized to a generic preset rarely match the requesting device's
   actual screen exactly, so setting the result as a wallpaper leaves
   Android/iOS to stretch or crop it to fit. Exporting at the device's own
   native pixel resolution (CSS size × devicePixelRatio) instead means the
   image is already the right shape for that screen — no scaling needed. */
function getDeviceExportSize(maxDim) {
  const cap = maxDim || 4096;
  const dpr = window.devicePixelRatio || 1;
  let w = Math.round((window.screen.width || window.innerWidth) * dpr);
  let h = Math.round((window.screen.height || window.innerHeight) * dpr);
  const scale = Math.min(1, cap / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/* Shared by the Gradient/Mesh/Wallpaper resolution pickers: "My Screen"
   (free) resolves to the device's own size, any named preset (Pro-only)
   parses straight out of its option value. Returns null and shows the
   upsell if a non-Pro user picks a preset, so callers can bail out. */
function resolveExportSize(selectEl) {
  if (selectEl.value !== 'auto' && !isProUnlocked()) {
    showToast('That resolution is a Pro feature — unlock for ₹39');
    selectEl.value = 'auto';
    openProModal();
    return null;
  }
  if (selectEl.value === 'auto') return getDeviceExportSize();
  const [wStr, hStr] = selectEl.value.split('x');
  return { w: Number(wStr), h: Number(hStr) };
}

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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

let gradiiAlbumIdPromise = null;
function getGradiiAlbumId() {
  if (!gradiiAlbumIdPromise) {
    gradiiAlbumIdPromise = (async () => {
      const Media = window.Capacitor.Plugins.Media;
      const { albums } = await Media.getAlbums();
      const existing = albums.find(a => a.name === 'Gradii');
      if (existing) return existing.identifier;
      await Media.createAlbum({ name: 'Gradii' });
      const { albums: after } = await Media.getAlbums();
      const created = after.find(a => a.name === 'Gradii');
      return created ? created.identifier : undefined;
    })();
  }
  return gradiiAlbumIdPromise;
}

/* Images/video saved through this go straight into the device's own
   Gallery app (a "Gradii" album), same as any camera shot — no share
   sheet in the way. Modern Android doesn't pop a storage permission
   dialog for this because none is needed: MediaStore write access is
   granted to every app by default under scoped storage. That's a
   deliberate platform change, not a missing prompt. */
async function saveMediaToGallery(blob, filename, isVideo) {
  const Media = window.Capacitor.Plugins.Media;
  const base64 = await blobToBase64(blob);
  const mime = blob.type || (isVideo ? 'video/webm' : 'image/png');
  const dataUri = `data:${mime};base64,${base64}`;
  const albumIdentifier = await getGradiiAlbumId().catch(() => undefined);
  const fileName = filename.replace(/\.[^/.]+$/, '');
  if (isVideo) {
    await Media.saveVideo({ path: dataUri, albumIdentifier, fileName });
  } else {
    await Media.savePhoto({ path: dataUri, albumIdentifier, fileName });
  }
}

/* Inside the packaged Android app, a plain <a download> click on a blob:
   URL is silently swallowed by the WebView — there's no browser download
   manager to hand it to, so nothing happens and nothing asks for
   permission. Photos/video go straight to the Gallery via saveMediaToGallery;
   everything else (palette files, CSS/SCSS text, the standalone wallpaper
   HTML) is staged via the Filesystem plugin and handed to the native Share
   sheet, so the user picks where it goes. */
async function saveFile(blob, filename, mimeType) {
  if (isNativeApp()) {
    const isImage = /^image\//.test(mimeType);
    const isVideo = /^video\//.test(mimeType);
    if ((isImage || isVideo) && window.Capacitor.Plugins.Media) {
      try {
        await saveMediaToGallery(blob, filename, isVideo);
        return;
      } catch (e) {
        /* fall through to the Share-sheet path below */
      }
    }
    try {
      const Filesystem = window.Capacitor.Plugins.Filesystem;
      const Share = window.Capacitor.Plugins.Share;
      const base64 = await blobToBase64(blob);
      const written = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: 'CACHE',
        recursive: true,
      });
      if (Share) {
        await Share.share({ title: filename, url: written.uri, dialogTitle: `Save ${filename}` });
      }
      return;
    } catch (e) {
      showToast('Could not save: ' + (e && e.message ? e.message : 'unknown error'));
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadBlob(content, filename, type) {
  saveFile(new Blob([content], { type }), filename, type);
}

function downloadCanvasPng(canvas, filename) {
  canvas.toBlob(blob => saveFile(blob, filename, 'image/png'), 'image/png');
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
  updateAuroraBackdrop();
}

/* ==========================================================================
   Theme toggle
   ========================================================================== */

const themeToggle = document.getElementById('themeToggle');
const themeMenu = document.getElementById('themeMenu');
const THEME_NAMES = ['light', 'dark', 'aurora', 'bento', 'editorial', 'neon'];
const THEME_ICON = { light: '🌙', dark: '✦', aurora: '☀', bento: '◧', editorial: '—', neon: '⌁' };
const THEME_LABEL = {
  light: 'Light', dark: 'Dark', aurora: 'Aurora Bento',
  bento: 'Bento Studio', editorial: 'Soft Editorial', neon: 'Neon Console',
};
/* Aurora Bento and the three newer looks are Pro-only. isProUnlocked()
   itself lives further down this file (with the rest of the license
   system), but this check is just a bare localStorage read, so it's safe
   to inline here regardless of definition order. */
const PRO_THEMES = new Set(['aurora', 'bento', 'editorial', 'neon']);
function isThemeUnlocked(theme) {
  if (!PRO_THEMES.has(theme)) return true;
  try { return localStorage.getItem('gradii_pro_unlocked') === '1'; } catch (e) { return false; }
}

function syncNativeStatusBar(theme) {
  const StatusBar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if (!StatusBar) return;
  const DARK_BG = { dark: '#0e0f1e', aurora: '#08070f', bento: '#f4f3fb', editorial: '#fdfcfa', neon: '#08070c' };
  const bg = theme === 'light' ? '#f2f3f8' : (DARK_BG[theme] || '#0e0f1e');
  const style = (theme === 'light' || theme === 'bento' || theme === 'editorial') ? 'LIGHT' : 'DARK';
  StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
  StatusBar.setStyle({ style }).catch(() => {});
}

function refreshThemeMenuUI() {
  const current = document.documentElement.getAttribute('data-theme');
  themeMenu.querySelectorAll('button[data-theme-choice]').forEach(btn => {
    const t = btn.dataset.themeChoice;
    btn.classList.toggle('active', t === current);
    const proTag = btn.querySelector('.theme-pro-tag');
    if (proTag) proTag.hidden = !PRO_THEMES.has(t) || isThemeUnlocked(t);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = THEME_ICON[theme] || '🌙';
  themeToggle.title = 'Choose theme (' + (THEME_LABEL[theme] || theme) + ')';
  localStorage.setItem('gradii_theme', theme);
  syncNativeStatusBar(theme);
  refreshThemeMenuUI();
  /* Deferred: on first load this can fire before gradientState/meshState/
     etc. (declared later in this file) have been initialized. */
  if (theme === 'aurora') setTimeout(updateAuroraBackdrop, 0);
}
(function initTheme() {
  const saved = localStorage.getItem('gradii_theme');
  let preferred = THEME_NAMES.includes(saved)
    ? saved
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (!isThemeUnlocked(preferred)) preferred = 'dark';
  applyTheme(preferred);
})();
themeToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshThemeMenuUI();
  themeMenu.classList.toggle('open');
});
document.addEventListener('click', () => themeMenu.classList.remove('open'));
themeMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-theme-choice]');
  if (!btn) return;
  const choice = btn.dataset.themeChoice;
  if (!isThemeUnlocked(choice)) {
    showToast(THEME_LABEL[choice] + ' is a Pro theme — unlock for ₹39');
    if (typeof openProModal === 'function') openProModal();
    themeMenu.classList.remove('open');
    return;
  }
  applyTheme(choice);
  animateThemeIcon(themeToggle);
  themeMenu.classList.remove('open');
});

/* ==========================================================================
   Aurora Bento live backdrop
   ----------------------------------------------------------------
   The three .orb-calm blobs (brand colors) are on by default. The first
   real interaction with a control anywhere outside the topbar swaps in
   the .orb-live blobs, recolored to whatever the active studio is
   currently showing, and the two layers crossfade via CSS opacity. Tab
   switches keep the live colors in sync with whichever studio is active.
   ========================================================================== */

const bgOrbs = document.querySelector('.bg-orbs');
let auroraEngaged = false;

function getActiveStudioColors() {
  switch (activeTab) {
    case 'gradient':
      return gradientState.stops.map(s => s.color);
    case 'mesh':
      return meshState.points.length ? meshState.points.map(p => p.color) : [meshState.baseColor];
    case 'wallpaper':
      return wallpaperState.colors;
    case 'palette':
      return paletteState.colors;
    case 'image':
      return extractedColors.length ? extractedColors : paletteState.colors;
    default:
      return [];
  }
}

function updateAuroraBackdrop() {
  if (!bgOrbs || document.documentElement.getAttribute('data-theme') !== 'aurora') return;
  const colors = getActiveStudioColors();
  if (!colors.length) return;
  bgOrbs.style.setProperty('--live-1', colors[0]);
  bgOrbs.style.setProperty('--live-2', colors[Math.floor(colors.length / 2)] || colors[0]);
  bgOrbs.style.setProperty('--live-3', colors[colors.length - 1]);
}

function engageAurora() {
  if (auroraEngaged || !bgOrbs) return;
  auroraEngaged = true;
  bgOrbs.classList.add('live-active');
  updateAuroraBackdrop();
}

document.addEventListener('input', (e) => {
  if (e.target.closest('.topbar')) return;
  engageAurora();
  updateAuroraBackdrop();
}, { passive: true });
document.addEventListener('click', (e) => {
  if (e.target.closest('.topbar')) return;
  engageAurora();
  requestAnimationFrame(updateAuroraBackdrop);
}, { passive: true });

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
  oklch: false,
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

/* When state.oklch is on, expand the user's stops into many intermediate
   OKLCH-mixed stops instead of relying on the browser/canvas's default RGB
   interpolation, which tends to muddy through grey-brown between saturated
   colors. The result is plain hex stops, so it stays portable in copied CSS
   even where "in oklch" gradient syntax isn't supported. */
function expandStopsOklch(stops, enabled) {
  if (!enabled || stops.length < 2) return stops;
  const STEPS = 10;
  const out = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    for (let j = (i === 0 ? 0 : 1); j <= STEPS; j++) {
      const t = j / STEPS;
      out.push({ color: mixOklch(a.color, b.color, t), pos: a.pos + (b.pos - a.pos) * t });
    }
  }
  return out;
}

function buildGradientCss(state) {
  const stops = expandStopsOklch([...state.stops].sort((a, b) => a.pos - b.pos), state.oklch);
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
  applyBrandKitToGradient();
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
  const stops = expandStopsOklch([...state.stops].sort((a, b) => a.pos - b.pos), state.oklch);
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
  const size = resolveExportSize(document.getElementById('gradientResolutionSelect'));
  if (!size) return;
  const canvas = document.getElementById('exportCanvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  drawGradientToCanvas(ctx, canvas.width, canvas.height, gradientState);
  drawWatermark(ctx, canvas.width, canvas.height);
  downloadCanvasPng(canvas, `gradient-${size.w}x${size.h}.png`);
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
  } else if (btn.dataset.export === 'tokens') {
    exportGradientAsTokens();
    showToast('Design tokens downloaded');
  } else if (btn.dataset.export === 'figma') {
    exportGradientAsFigmaVariables();
    showToast('Figma variables downloaded');
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

/* "Cohesive (OKLCH)" honors every locked swatch, not just one: unlocked
   slots interpolate between whichever locked anchors are nearest on
   either side (in OKLCH, so the blend stays perceptually smooth), and
   slots past the last/before the first locked anchor extend its hue
   with a gentle, consistent step instead of drifting randomly. With no
   locks at all, it falls back to an OKLCH-even spread around one random
   hue — still more cohesive than picking each hue independently. */
function generateCohesiveOklchPalette(count, existingColors, locked) {
  const lockedEntries = locked
    .map((l, i) => (l && existingColors[i] ? { i, color: existingColors[i] } : null))
    .filter(Boolean);
  if (!lockedEntries.length) {
    const baseHue = Math.random() * 360;
    return Array.from({ length: count }, (_, i) => oklchToHex(0.42 + (i / Math.max(1, count - 1)) * 0.4, 0.14, baseHue + i * (360 / count) * 0.35));
  }
  return Array.from({ length: count }, (_, i) => {
    const exact = lockedEntries.find(e => e.i === i);
    if (exact) return exact.color;
    const before = [...lockedEntries].reverse().find(e => e.i < i);
    const after = lockedEntries.find(e => e.i > i);
    if (before && after) {
      const t = (i - before.i) / (after.i - before.i);
      return mixOklch(before.color, after.color, t);
    }
    const anchor = before || after;
    const { L, C, H } = hexToOklch(anchor.color);
    const step = (i - anchor.i) * 18;
    return oklchToHex(clamp(L + (Math.random() - 0.5) * 0.08, 0.15, 0.92), C, H + step);
  });
}

function generatePaletteColors(harmony, count, existingColors, locked) {
  if (harmony === 'cohesiveOklch') return generateCohesiveOklchPalette(count, existingColors, locked);
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
  const cap = isProUnlocked() ? 50 : 5;
  if (list.length >= cap) {
    showToast(`Free tier keeps your last ${cap} palettes — unlock Pro for up to 50`);
    openProModal();
    return;
  }
  list.unshift({ id: Date.now(), colors: [...paletteState.colors] });
  setSavedPalettes(list.slice(0, 50));
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
  drawWatermark(ctx, w, h);
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

  saveFile(new Blob([out], { type: 'application/octet-stream' }), 'palette.ase', 'application/octet-stream');
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
  if (btn.dataset.export === 'tokens') exportPaletteAsTokens(colors);
  if (btn.dataset.export === 'figma') exportPaletteAsFigmaVariables(colors);
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

  syncMeshDragHandles();
}

/* Cheap position/color refresh for the existing drag handles — called on
   every preview render (including mid-drag) without touching the DOM
   nodes themselves, so it never interrupts an in-progress drag's pointer
   capture the way rebuilding the handles would. */
function syncMeshDragHandles() {
  const handles = meshPreview.querySelectorAll('.mesh-drag-handle');
  meshState.points.forEach((p, i) => {
    const h = handles[i];
    if (!h) return;
    h.style.left = `${p.x}%`;
    h.style.top = `${p.y}%`;
    h.style.background = p.color;
  });
}

/* Rebuilds the drag handles to match meshState.points 1:1 — only called
   on structural changes (add/remove/randomize/preset/init), never on
   every render, since recreating the nodes mid-drag would drop the
   active pointer capture and abort the drag. */
function renderMeshDragHandles() {
  meshPreview.querySelectorAll('.mesh-drag-handle').forEach(el => el.remove());
  meshState.points.forEach((p, i) => {
    const handle = document.createElement('div');
    handle.className = 'mesh-drag-handle';
    handle.style.left = `${p.x}%`;
    handle.style.top = `${p.y}%`;
    handle.style.background = p.color;
    handle.title = `Blob ${i + 1} — drag to move`;
    handle.addEventListener('pointerdown', (e) => startMeshBlobDrag(e, i, handle));
    meshPreview.appendChild(handle);
  });
}

function startMeshBlobDrag(e, index, handle) {
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  handle.classList.add('dragging');
  const rect = meshPreview.getBoundingClientRect();

  function onMove(ev) {
    const x = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((ev.clientY - rect.top) / rect.height) * 100, 0, 100);
    meshState.points[index].x = Math.round(x);
    meshState.points[index].y = Math.round(y);
    renderMeshPreview();
    const row = meshBlobsList.children[index];
    if (row) {
      row.querySelector('.mesh-blob-x').value = meshState.points[index].x;
      row.querySelector('.mesh-blob-x-value').textContent = `${meshState.points[index].x}%`;
      row.querySelector('.mesh-blob-y').value = meshState.points[index].y;
      row.querySelector('.mesh-blob-y-value').textContent = `${meshState.points[index].y}%`;
    }
  }
  function onUp() {
    handle.classList.remove('dragging');
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  }
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
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
  renderMeshDragHandles();
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
  applyBrandKitToMesh();
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

function drawMeshToCanvas(ctx, w, h, state) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = state.baseColor;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = MESH_COMPOSITE_MAP[state.blendMode] || 'source-over';
  state.points.forEach(p => {
    const cx = w * p.x / 100, cy = h * p.y / 100;
    const r = (p.size / 100) * Math.max(w, h) * 0.8;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, hexToRgba(p.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';
}

document.getElementById('btnDownloadMeshPng').addEventListener('click', () => {
  const size = resolveExportSize(document.getElementById('meshResolutionSelect'));
  if (!size) return;
  const { w, h } = size;
  const canvas = document.getElementById('exportCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawMeshToCanvas(ctx, w, h, meshState);
  drawWatermark(ctx, w, h);
  downloadCanvasPng(canvas, `mesh-${w}x${h}.png`);
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

/* A small tileable noise swatch, regenerated fresh each call rather than
   cached, so this stays a pure function safe to serialize into the
   standalone HTML export (see exportWallpaperHtml()) — no module-level
   state to lose in translation. 128px is cheap to generate every frame
   and, being pure white noise rather than a repeating photo texture,
   tiles with no visible seam at any output resolution. */
function wpMakeNoiseCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const nctx = c.getContext('2d');
  const imgData = nctx.createImageData(size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  nctx.putImageData(imgData, 0, 0);
  return c;
}

/* Post-processing pass applied on top of a finished pattern frame.
   Order matters: glow (adds light) and duotone (remaps the whole tonal
   range) happen first since they're transformations of the image itself;
   vignette and grain are surface treatments layered on top of that,
   grain always last so it reads as texture over the final image rather
   than something duotone/vignette then wash out. Each effect is a no-op
   at 0/off so callers can always pass wallpaperState.effects unchanged. */
function wpApplyEffects(ctx, w, h, effects) {
  if (!effects) return;
  const grain = effects.grain || 0;
  const vignette = effects.vignette || 0;
  const glow = effects.glow || 0;
  const duotone = effects.duotone;

  if (glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, glow);
    ctx.filter = `blur(${Math.round(Math.min(w, h) * 0.05 * glow)}px)`;
    ctx.drawImage(ctx.canvas, 0, 0, w, h);
    ctx.restore();
  }
  if (duotone && duotone.shadow && duotone.highlight) {
    ctx.save();
    ctx.filter = 'grayscale(1)';
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(ctx.canvas, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'color';
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, duotone.shadow);
    grad.addColorStop(1, duotone.highlight);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (vignette > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const r = Math.max(w, h) * 0.75;
    const grad = ctx.createRadialGradient(w / 2, h / 2, r * (1 - vignette * 0.55), w / 2, h / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, vignette)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (grain > 0) {
    const pattern = ctx.createPattern(wpMakeNoiseCanvas(128), 'repeat');
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(0.5, grain);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function wpDrawFrame(pattern, ctx, w, h, t, colors, speed, effects) {
  ctx.save();
  if (pattern === 'auroraFlow') wpDrawAuroraFlow(ctx, w, h, t, colors, speed);
  else if (pattern === 'radialPulse') wpDrawRadialPulse(ctx, w, h, t, colors, speed);
  else if (pattern === 'conicSpin') wpDrawConicSpin(ctx, w, h, t, colors, speed);
  else if (pattern === 'waveBands') wpDrawWaveBands(ctx, w, h, t, colors, speed);
  else wpDrawFlowingMesh(ctx, w, h, t, colors, speed);
  wpApplyEffects(ctx, w, h, effects);
  ctx.restore();
}

/* True-black/AMOLED export: crushes near-black shadow pixels to pure
   #000 so an OLED screen can actually turn those pixels off, rather
   than lighting them at some very-dark-but-nonzero value. Export-only
   (PNG / Set as Wallpaper) — deliberately not part of wpDrawFrame or the
   live/animated HTML export, since re-running a full getImageData pass
   every frame at 60fps would be wasteful for something that only needs
   to happen once, at the moment of export. */
function wpApplyAmoledCrush(ctx, w, h, threshold) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] <= threshold && d[i + 1] <= threshold && d[i + 2] <= threshold) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/* Style packs: each bundles a pattern + colors + the effects stack
   (grain/vignette/glow/duotone) into one click, instead of leaving
   "look" and "look distinctive" as two separate steps. effects is
   always the full { grain, vignette, glow, duotone } shape so a click
   fully replaces wallpaperState.effects rather than merging into it. */
const WALLPAPER_PRESETS = [
  { name: 'Nebula Drift', pattern: 'flowingMesh', speed: 1.0, colors: ['#05030f', '#6d5dfc', '#ff6b9d', '#22d3c5'],
    effects: { grain: 0.15, vignette: 0.2, glow: 0.25, duotone: null } },
  { name: 'Northern Lights', pattern: 'auroraFlow', speed: 0.8, colors: ['#020814', '#00f2fe', '#43cea2', '#7b2ff7'],
    effects: { grain: 0.1, vignette: 0.15, glow: 0.4, duotone: null } },
  { name: 'Heartbeat', pattern: 'radialPulse', speed: 1.4, colors: ['#0a0505', '#ff512f', '#f5af19'],
    effects: { grain: 0.2, vignette: 0.3, glow: 0.2, duotone: null } },
  { name: 'Color Wheel', pattern: 'conicSpin', speed: 0.6, colors: ['#6d5dfc', '#ff6b9d', '#ffd43b', '#22d3c5'],
    effects: { grain: 0, vignette: 0, glow: 0.3, duotone: null } },
  { name: 'Ocean Waves', pattern: 'waveBands', speed: 0.7, colors: ['#04263c', '#0077b6', '#00b4d8', '#90e0ef'],
    effects: { grain: 0.1, vignette: 0.2, glow: 0.15, duotone: null } },
  { name: 'Molten Core', pattern: 'radialPulse', speed: 1.8, colors: ['#0a0505', '#f12711', '#f5af19'],
    effects: { grain: 0.25, vignette: 0.35, glow: 0.35, duotone: null } },
  { name: 'Candy Drift', pattern: 'flowingMesh', speed: 0.9, colors: ['#1a0f1e', '#ff9a9e', '#a18cd1', '#fbc2eb'],
    effects: { grain: 0, vignette: 0, glow: 0.2, duotone: null } },
  { name: 'Citrus Spin', pattern: 'conicSpin', speed: 0.5, colors: ['#fffdf5', '#f7971e', '#ffd200', '#a8ff78'],
    effects: { grain: 0, vignette: 0, glow: 0.15, duotone: null } },
  { name: 'Film Noir', pattern: 'radialPulse', speed: 1.0, colors: ['#050505', '#b23a48', '#4a4e69'],
    effects: { grain: 0.45, vignette: 0.55, glow: 0.1, duotone: { shadow: '#0a0508', highlight: '#e8c4a0' } } },
  { name: 'Cyber Dusk', pattern: 'conicSpin', speed: 0.7, colors: ['#08021a', '#ff2e88', '#00e5ff', '#7b2ff7'],
    effects: { grain: 0.2, vignette: 0.3, glow: 0.5, duotone: null } },
  { name: 'Sepia Drift', pattern: 'flowingMesh', speed: 0.8, colors: ['#1a1006', '#c9944a', '#8a5a2b', '#e8c98f'],
    effects: { grain: 0.35, vignette: 0.4, glow: 0.15, duotone: { shadow: '#160f08', highlight: '#f0d9a8' } } },
];

let wallpaperState = {
  pattern: 'flowingMesh',
  speed: 1.0,
  live: true,
  colors: ['#0f1020', '#6d5dfc', '#ff6b9d', '#22d3c5'],
  effects: { grain: 0, vignette: 0, glow: 0, duotone: null },
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
  wpDrawFrame(wallpaperState.pattern, wallpaperCtx, wallpaperCanvas.width, wallpaperCanvas.height, t, wallpaperState.colors, wallpaperState.speed, wallpaperState.effects);
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
    wpDrawFrame(preset.pattern, ctx, 96, 96, 0.6, preset.colors, preset.speed, preset.effects);
    canvas.addEventListener('click', () => {
      wallpaperState.pattern = preset.pattern;
      wallpaperState.colors = [...preset.colors];
      wallpaperState.speed = preset.speed;
      wallpaperState.effects = preset.effects
        ? { grain: preset.effects.grain || 0, vignette: preset.effects.vignette || 0, glow: preset.effects.glow || 0, duotone: preset.effects.duotone ? { ...preset.effects.duotone } : null }
        : { grain: 0, vignette: 0, glow: 0, duotone: null };
      wallpaperPatternSelect.value = preset.pattern;
      wallpaperSpeedSlider.value = Math.round(preset.speed * 10);
      wallpaperSpeedValue.textContent = `${preset.speed.toFixed(1)}×`;
      renderWallpaperColorsList();
      syncWallpaperEffectsUI();
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
  applyBrandKitToWallpaper();
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

const wallpaperGrainSlider = document.getElementById('wallpaperGrainSlider');
const wallpaperGrainValue = document.getElementById('wallpaperGrainValue');
const wallpaperVignetteSlider = document.getElementById('wallpaperVignetteSlider');
const wallpaperVignetteValue = document.getElementById('wallpaperVignetteValue');
const wallpaperGlowSlider = document.getElementById('wallpaperGlowSlider');
const wallpaperGlowValue = document.getElementById('wallpaperGlowValue');
const wallpaperDuotoneToggle = document.getElementById('wallpaperDuotoneToggle');
const wallpaperDuotoneColors = document.getElementById('wallpaperDuotoneColors');
const wallpaperDuotoneShadow = document.getElementById('wallpaperDuotoneShadow');
const wallpaperDuotoneHighlight = document.getElementById('wallpaperDuotoneHighlight');

wallpaperGrainSlider.addEventListener('input', () => {
  wallpaperState.effects.grain = Number(wallpaperGrainSlider.value) / 100;
  wallpaperGrainValue.textContent = `${wallpaperGrainSlider.value}%`;
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
});

wallpaperVignetteSlider.addEventListener('input', () => {
  wallpaperState.effects.vignette = Number(wallpaperVignetteSlider.value) / 100;
  wallpaperVignetteValue.textContent = `${wallpaperVignetteSlider.value}%`;
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
});

wallpaperGlowSlider.addEventListener('input', () => {
  wallpaperState.effects.glow = Number(wallpaperGlowSlider.value) / 100;
  wallpaperGlowValue.textContent = `${wallpaperGlowSlider.value}%`;
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
});

function updateWallpaperDuotone() {
  wallpaperState.effects.duotone = wallpaperDuotoneToggle.checked
    ? { shadow: wallpaperDuotoneShadow.value, highlight: wallpaperDuotoneHighlight.value }
    : null;
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
}
wallpaperDuotoneToggle.addEventListener('change', () => {
  wallpaperDuotoneColors.hidden = !wallpaperDuotoneToggle.checked;
  updateWallpaperDuotone();
});
wallpaperDuotoneShadow.addEventListener('input', updateWallpaperDuotone);
wallpaperDuotoneHighlight.addEventListener('input', updateWallpaperDuotone);

/* Pushes wallpaperState.effects into the slider/toggle UI — needed after
   a style-pack click, since that changes wallpaperState.effects directly
   rather than through these controls, and the controls would otherwise
   silently go stale. */
function syncWallpaperEffectsUI() {
  const fx = wallpaperState.effects;
  wallpaperGrainSlider.value = Math.round(fx.grain * 100);
  wallpaperGrainValue.textContent = `${Math.round(fx.grain * 100)}%`;
  wallpaperVignetteSlider.value = Math.round(fx.vignette * 100);
  wallpaperVignetteValue.textContent = `${Math.round(fx.vignette * 100)}%`;
  wallpaperGlowSlider.value = Math.round(fx.glow * 100);
  wallpaperGlowValue.textContent = `${Math.round(fx.glow * 100)}%`;
  wallpaperDuotoneToggle.checked = !!fx.duotone;
  wallpaperDuotoneColors.hidden = !fx.duotone;
  if (fx.duotone) {
    wallpaperDuotoneShadow.value = fx.duotone.shadow;
    wallpaperDuotoneHighlight.value = fx.duotone.highlight;
  }
}

document.getElementById('wallpaperSafeZoneToggle').addEventListener('change', (e) => {
  document.getElementById('wallpaperSafeZoneOverlay').hidden = !e.target.checked;
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
  const size = resolveExportSize(wallpaperResolutionSelect);
  if (!size) return;
  const { w, h } = size;
  const canvas = document.getElementById('exportCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  wpDrawFrame(wallpaperState.pattern, ctx, w, h, wallpaperFrozenT, wallpaperState.colors, wallpaperState.speed, wallpaperState.effects);
  if (document.getElementById('wallpaperAmoledToggle').checked) wpApplyAmoledCrush(ctx, w, h, 28);
  drawWatermark(ctx, w, h);
  downloadCanvasPng(canvas, `wallpaper-${w}x${h}.png`);
  showToast('Wallpaper PNG downloaded');
});

/* Opens Android's own "crop and set wallpaper" system UI directly, instead
   of leaving the user to save the PNG and go find it in a gallery app
   afterward. Native-app-only: the underlying WallpaperManager intent has
   no web equivalent, so the button stays hidden outside the APK. */
const btnSetAsWallpaper = document.getElementById('btnSetAsWallpaper');
if (isNativeApp() && window.Capacitor.Plugins.WallpaperSetter) {
  btnSetAsWallpaper.hidden = false;
}
btnSetAsWallpaper.addEventListener('click', async () => {
  const { w, h } = getDeviceExportSize();
  const canvas = document.getElementById('exportCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  wpDrawFrame(wallpaperState.pattern, ctx, w, h, wallpaperFrozenT, wallpaperState.colors, wallpaperState.speed, wallpaperState.effects);
  if (document.getElementById('wallpaperAmoledToggle').checked) wpApplyAmoledCrush(ctx, w, h, 28);
  drawWatermark(ctx, w, h);
  canvas.toBlob(async (blob) => {
    try {
      const base64 = await blobToBase64(blob);
      const Filesystem = window.Capacitor.Plugins.Filesystem;
      const written = await Filesystem.writeFile({
        path: `wallpaper-${Date.now()}.png`,
        data: base64,
        directory: 'CACHE',
        recursive: true,
      });
      await window.Capacitor.Plugins.WallpaperSetter.setWallpaper({ uri: written.uri });
    } catch (e) {
      showToast('Could not open wallpaper chooser: ' + (e && e.message ? e.message : 'unknown error'));
    }
  }, 'image/png');
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
    saveFile(blob, 'wallpaper.webm', mime || 'video/webm');
    if (!wasLive) stopWallpaperAnimation();
    showToast('Video downloaded');
  };

  recorder.start();
  showToast('Recording 6s loop…');
  setTimeout(() => recorder.stop(), 6000);
});

/* Opt-in mic input, present only when the "Audio-reactive" toggle was on at
   export time. Amplitude from a Web Audio AnalyserNode scales the pattern's
   effective animation speed each frame, so the wallpaper visibly pulses
   with ambient sound/music. Falls back to the static speed value if mic
   access is denied or unavailable — never blocks the wallpaper itself. */
const AUDIO_REACTIVE_SNIPPET = `
let audioLevel = 0;
(function initAudioReactive() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then((stream) => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctxA = new AC();
      const source = ctxA.createMediaStreamSource(stream);
      const analyser = ctxA.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      (function sample() {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        audioLevel = (sum / data.length) / 255;
        requestAnimationFrame(sample);
      })();
    })
    .catch(() => {});
})();
`;

function exportWallpaperHtml() {
  const functionsSrc = [wpHexToRgba, wpDrawFlowingMesh, wpDrawAuroraFlow, wpDrawRadialPulse, wpDrawConicSpin, wpDrawWaveBands, wpMakeNoiseCanvas, wpApplyEffects, wpDrawFrame]
    .map(fn => fn.toString())
    .join('\n\n');
  const stateJson = JSON.stringify({
    pattern: wallpaperState.pattern,
    colors: wallpaperState.colors,
    speed: wallpaperState.speed,
    effects: wallpaperState.effects,
  });
  const audioReactive = document.getElementById('wallpaperAudioReactive').checked;
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
${audioReactive ? AUDIO_REACTIVE_SNIPPET : 'let audioLevel = 0;'}
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
  const speed = wallpaperData.speed * (1 + audioLevel * 2.2);
  wpDrawFrame(wallpaperData.pattern, ctx, canvas.width, canvas.height, t, wallpaperData.colors, speed, wallpaperData.effects);
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
  const audioOn = document.getElementById('wallpaperAudioReactive').checked;
  showToast(audioOn ? 'Live wallpaper HTML downloaded — it will ask for mic access' : 'Live wallpaper HTML downloaded');
});

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'wallpaper') activateWallpaperTab();
    else stopWallpaperAnimation();
  });
});

/* ==========================================================================
   FULL SCREEN PREVIEW
   ========================================================================== */

const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const fullscreenContent = document.getElementById('fullscreenContent');
const wallpaperPreviewFrame = document.querySelector('#panel-wallpaper .preview-frame');

function openFullscreenPreview(kind) {
  fullscreenContent.style.background = '';
  fullscreenContent.style.backgroundColor = '';
  fullscreenContent.style.backgroundImage = '';
  fullscreenContent.style.backgroundBlendMode = '';

  if (kind === 'gradient') {
    fullscreenContent.style.background = buildGradientCss(gradientState);
  } else if (kind === 'mesh') {
    const layers = buildMeshCssLayers(meshState);
    fullscreenContent.style.backgroundColor = meshState.baseColor;
    fullscreenContent.style.backgroundImage = layers.join(', ');
    fullscreenContent.style.backgroundBlendMode = meshState.blendMode;
  } else if (kind === 'wallpaper') {
    wallpaperCanvas.classList.add('fullscreen-canvas');
    fullscreenContent.appendChild(wallpaperCanvas);
    resizeWallpaperCanvas();
    if (wallpaperState.live) startWallpaperAnimation();
    else drawWallpaperFrame(wallpaperFrozenT);
  }

  fullscreenOverlay.dataset.kind = kind;
  fullscreenOverlay.classList.add('open');
}

function closeFullscreenPreview() {
  const kind = fullscreenOverlay.dataset.kind;
  if (kind === 'wallpaper' && wallpaperPreviewFrame) {
    wallpaperCanvas.classList.remove('fullscreen-canvas');
    wallpaperPreviewFrame.insertBefore(wallpaperCanvas, wallpaperPreviewFrame.firstChild);
    resizeWallpaperCanvas();
    if (wallpaperState.live) startWallpaperAnimation();
    else drawWallpaperFrame(wallpaperFrozenT);
  }
  fullscreenOverlay.classList.remove('open');
  fullscreenOverlay.dataset.kind = '';
}

document.getElementById('btnFullscreenGradient').addEventListener('click', () => openFullscreenPreview('gradient'));
document.getElementById('btnFullscreenMesh').addEventListener('click', () => openFullscreenPreview('mesh'));
document.getElementById('btnFullscreenWallpaper').addEventListener('click', () => openFullscreenPreview('wallpaper'));
document.getElementById('btnCloseFullscreen').addEventListener('click', closeFullscreenPreview);
fullscreenOverlay.addEventListener('click', (e) => {
  if (e.target === fullscreenOverlay || e.target === fullscreenContent) closeFullscreenPreview();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fullscreenOverlay.classList.contains('open')) closeFullscreenPreview();
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

function buildShareUrl(tab, state) {
  const encoded = encodeState(state);
  if (!encoded) return null;
  return `${location.origin}${location.pathname}?tab=${tab}&d=${encoded}`;
}

function copyShareLink(tab, state) {
  const url = buildShareUrl(tab, state);
  if (!url) { showToast('Could not create share link'); return; }
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
   Gradii Pro — license verification (Ed25519, fully offline)
   ----------------------------------------------------------------
   The app only ever ships this public key. A license key is
   base64url(payload) + "." + base64url(signature), signed offline by a
   private key that never leaves the developer's machine (see
   gradii-license/keygen.js). Nothing here can mint a new valid key.
   ========================================================================== */

const GRADII_PUBLIC_KEY_B64 = 'vD8m0b6OYVRq79DDypK8t+GbRbAAVQe3dR9JtOKdguI=';

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function verifyLicenseKey(key) {
  try {
    const parts = key.trim().split('.');
    if (parts.length !== 2) return { valid: false };
    const [payloadPart, sigPart] = parts;
    const payloadBytes = b64urlToBytes(payloadPart);
    const sigBytes = b64urlToBytes(sigPart);
    const pubKeyBytes = b64urlToBytes(GRADII_PUBLIC_KEY_B64);
    if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.importKey) {
      return { valid: false, error: 'unsupported' };
    }
    const cryptoKey = await crypto.subtle.importKey('raw', pubKeyBytes, { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify('Ed25519', cryptoKey, sigBytes, payloadBytes);
    if (!ok) return { valid: false };
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (payload.p !== 'gradii-pro') return { valid: false };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

function isProUnlocked() {
  try { return localStorage.getItem('gradii_pro_unlocked') === '1'; } catch (e) { return false; }
}

function setProUnlocked(key, payload) {
  try {
    localStorage.setItem('gradii_pro_unlocked', '1');
    localStorage.setItem('gradii_pro_key', key);
    localStorage.setItem('gradii_pro_info', JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

/* Drawn onto every free-tier PNG export, bottom-right, skipped entirely
   once Pro is unlocked. A translucent pill behind the text keeps it
   legible over any gradient underneath, without needing to sample the
   background color first. */
function drawWatermark(ctx, w, h) {
  if (isProUnlocked()) return;
  const text = 'Made with Gradii';
  const fontSize = Math.max(12, Math.round(Math.min(w, h) * 0.024));
  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const pad = fontSize * 0.9;
  const metrics = ctx.measureText(text);
  const boxW = metrics.width + pad * 1.6;
  const boxH = fontSize + pad * 0.9;
  const x = w - pad * 0.7, y = h - pad * 0.7;
  const r = boxH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.moveTo(x - boxW + r, y - boxH);
  ctx.arcTo(x, y - boxH, x, y, r);
  ctx.arcTo(x, y, x - boxW, y, r);
  ctx.arcTo(x - boxW, y, x - boxW, y - boxH, r);
  ctx.arcTo(x - boxW, y - boxH, x, y - boxH, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(text, x - pad * 0.5, y - pad * 0.4);
  ctx.restore();
}

const proOverlay = document.getElementById('proOverlay');
const proLockedView = document.getElementById('proLockedView');
const proUnlockedView = document.getElementById('proUnlockedView');
const proRedeemError = document.getElementById('proRedeemError');

function refreshProUI() {
  const unlocked = isProUnlocked();
  proLockedView.hidden = unlocked;
  proUnlockedView.hidden = !unlocked;
}

function openProModal() {
  refreshProUI();
  proOverlay.classList.add('open');
}
function closeProModal() { proOverlay.classList.remove('open'); }

document.getElementById('btnOpenPro').addEventListener('click', openProModal);
document.getElementById('btnClosePro').addEventListener('click', closeProModal);
proOverlay.addEventListener('click', (e) => { if (e.target === proOverlay) closeProModal(); });

document.getElementById('btnRedeemLicense').addEventListener('click', async () => {
  const input = document.getElementById('proLicenseInput');
  const key = input.value.trim();
  if (!key) return;
  proRedeemError.hidden = true;
  const result = await verifyLicenseKey(key);
  if (result.valid) {
    setProUnlocked(key, result.payload);
    refreshProUI();
    showToast('Gradii Pro unlocked — thank you!');
    quirkyBounce(proOverlay.querySelector('.pro-modal'));
  } else {
    proRedeemError.textContent = result.error === 'unsupported'
      ? "This app/browser can't verify license keys yet — please update and try again."
      : "That license key doesn't look right. Double-check and try again, or email for help.";
    proRedeemError.hidden = false;
  }
});
refreshProUI();

/* ==========================================================================
   OKLCH smooth interpolation toggle
   ========================================================================== */

document.getElementById('gradientOklchToggle').addEventListener('change', (e) => {
  gradientState.oklch = e.target.checked;
  renderGradientPreview();
});

/* ==========================================================================
   Design Tokens (W3C) + Figma Variables export
   ========================================================================== */

function exportGradientAsTokens() {
  const tokens = {};
  gradientState.stops.forEach((s, i) => { tokens[`gradient-stop-${i + 1}`] = { $value: s.color, $type: 'color' }; });
  tokens['gradient'] = { $value: buildGradientCss(gradientState), $type: 'gradient' };
  downloadBlob(JSON.stringify(tokens, null, 2), 'gradient.tokens.json', 'application/json');
}
function exportGradientAsFigmaVariables() {
  const variables = gradientState.stops.map((s, i) => ({ name: `gradient/stop-${i + 1}`, type: 'COLOR', value: s.color }));
  const out = { figmaVariables: { collection: 'Gradii Gradient', modes: ['Default'], variables } };
  downloadBlob(JSON.stringify(out, null, 2), 'gradient.figma-variables.json', 'application/json');
}
function exportPaletteAsTokens(colors) {
  const tokens = {};
  colors.forEach((c, i) => { tokens[`palette-${i + 1}`] = { $value: c, $type: 'color' }; });
  downloadBlob(JSON.stringify(tokens, null, 2), 'palette.tokens.json', 'application/json');
}
function exportPaletteAsFigmaVariables(colors) {
  const variables = colors.map((c, i) => ({ name: `palette/color-${i + 1}`, type: 'COLOR', value: c }));
  const out = { figmaVariables: { collection: 'Gradii Palette', modes: ['Default'], variables } };
  downloadBlob(JSON.stringify(out, null, 2), 'palette.figma-variables.json', 'application/json');
}

/* ==========================================================================
   QR scan-to-import
   ========================================================================== */

const qrOverlay = document.getElementById('qrOverlay');
const qrCodeBox = document.getElementById('qrCodeBox');
let qrInstance = null;

function showQrFor(tab, state) {
  const url = buildShareUrl(tab, state);
  if (!url) { showToast('Could not create share link'); return; }
  qrCodeBox.innerHTML = '';
  if (window.QRCode) {
    qrInstance = new QRCode(qrCodeBox, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  } else {
    qrCodeBox.textContent = 'QR library failed to load — try again online.';
  }
  qrOverlay.classList.add('open');
}
document.getElementById('btnCloseQr').addEventListener('click', () => qrOverlay.classList.remove('open'));
qrOverlay.addEventListener('click', (e) => { if (e.target === qrOverlay) qrOverlay.classList.remove('open'); });

document.getElementById('btnQrGradient').addEventListener('click', () => showQrFor('gradient', gradientState));
document.getElementById('btnQrMesh').addEventListener('click', () => showQrFor('mesh', meshState));
document.getElementById('btnQrWallpaper').addEventListener('click', () => showQrFor('wallpaper', wallpaperState));
document.getElementById('btnQrPalette').addEventListener('click', () => showQrFor('palette', paletteState));

/* ==========================================================================
   Brand Kit — lock brand colors, keep every generator on-brand
   ========================================================================== */

let brandKitEnabled = false;
let brandKitColors = [];

function nearestBrandColor(hex) {
  if (!brandKitColors.length) return hex;
  const target = hexToOklab(hex);
  let best = brandKitColors[0], bestDist = Infinity;
  brandKitColors.forEach(c => {
    const lab = hexToOklab(c);
    const d = (lab.L - target.L) ** 2 + (lab.a - target.a) ** 2 + (lab.b - target.b) ** 2;
    if (d < bestDist) { bestDist = d; best = c; }
  });
  return best;
}
function applyBrandKitToGradient() {
  if (!brandKitEnabled || !brandKitColors.length) return;
  gradientState.stops.forEach(s => { s.color = nearestBrandColor(s.color); });
}
function applyBrandKitToMesh() {
  if (!brandKitEnabled || !brandKitColors.length) return;
  meshState.baseColor = nearestBrandColor(meshState.baseColor);
  meshState.points.forEach(p => { p.color = nearestBrandColor(p.color); });
}
function applyBrandKitToWallpaper() {
  if (!brandKitEnabled || !brandKitColors.length) return;
  wallpaperState.colors = wallpaperState.colors.map(c => nearestBrandColor(c));
}

const brandKitToggle = document.getElementById('brandKitToggle');
const brandKitSwatchesEl = document.getElementById('brandKitSwatches');
const brandKitHint = document.getElementById('brandKitHint');

function renderBrandKitSwatches() {
  brandKitSwatchesEl.innerHTML = '';
  brandKitColors.forEach(c => {
    const sw = document.createElement('button');
    sw.className = 'brand-kit-swatch';
    sw.style.background = c;
    sw.title = c.toUpperCase();
    brandKitSwatchesEl.appendChild(sw);
  });
  brandKitSwatchesEl.hidden = !brandKitColors.length;
}

brandKitToggle.addEventListener('change', (e) => {
  brandKitEnabled = e.target.checked;
  if (brandKitEnabled) {
    brandKitColors = [...paletteState.colors];
    renderBrandKitSwatches();
    brandKitHint.textContent = brandKitColors.length
      ? `Locked to your current ${brandKitColors.length}-color palette. Gradient/Mesh/Wallpaper randomizers now stay on-brand.`
      : 'Generate a palette first, then turn this on to lock it as your brand colors.';
    try { localStorage.setItem('gradii_brand_kit', JSON.stringify(brandKitColors)); } catch (err) { /* ignore */ }
  } else {
    brandKitHint.textContent = 'Lock your brand colors, and every generator (Gradient, Mesh, Wallpaper) stays within them.';
    brandKitSwatchesEl.hidden = true;
  }
});
(function initBrandKit() {
  try {
    const saved = JSON.parse(localStorage.getItem('gradii_brand_kit') || '[]');
    if (Array.isArray(saved) && saved.length) brandKitColors = saved;
  } catch (e) { /* ignore */ }
})();

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
