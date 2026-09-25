'use strict';

/* ==========================================================================
   Randomness
   ----------------------------------------------------------------
   Reported from the Android app: every launch opened on the same colors
   and Randomize then walked through the same sequence — i.e. the WebView's
   Math.random was starting from the same state on each cold start. Rather
   than trust the engine's seeding, every Math.random call in the app is
   routed through a small fast generator (sfc32) seeded once per launch
   from the OS entropy pool (crypto.getRandomValues), mixed with the clock
   as a fallback. No call site changes; the ~60 existing Math.random calls
   all get a sequence that is different on every launch.
   ========================================================================== */
(function seedRandomness() {
  const seed = new Uint32Array(4);
  try { crypto.getRandomValues(seed); } catch (e) { /* very old WebView — clock-only fallback below */ }
  const now = Date.now();
  const perf = Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) * 1000);
  let a = (seed[0] ^ now) >>> 0, b = (seed[1] ^ (now / 4294967296)) >>> 0, c = (seed[2] ^ perf) >>> 0, d = (seed[3] ^ 0x9e3779b9) >>> 0;
  function sfc32() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  for (let i = 0; i < 16; i++) sfc32();
  Math.random = sfc32;
})();

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
/* The screen size in CSS px, in the orientation the device is held *right
   now*. iOS/iPadOS Safari always reports screen.width/height in portrait
   (an iPad Pro 11" says 834×1194 even when turned sideways), so a
   landscape iPad used to download a portrait image while the preview
   showed landscape. On touch devices the app fills the screen, so the
   viewport's own orientation is the device's orientation — use it to
   decide which side is the long one. Desktop windows can be any shape
   and don't rotate, so there screen.width/height are trusted as-is. */
function getOrientedScreenSize() {
  let sw = window.screen.width || window.innerWidth;
  let sh = window.screen.height || window.innerHeight;
  const touch = (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(any-pointer: coarse)').matches;
  if (touch) {
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const long = Math.max(sw, sh), short = Math.min(sw, sh);
    if (landscape) { sw = long; sh = short; } else { sw = short; sh = long; }
  }
  return { sw, sh };
}

function getDeviceExportSize(maxDim) {
  const cap = maxDim || 4096;
  const dpr = window.devicePixelRatio || 1;
  const { sw, sh } = getOrientedScreenSize();
  let w = Math.round(sw * dpr);
  let h = Math.round(sh * dpr);
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
  let text = msg;
  try { text = voiceToast(msg); } catch (e) { /* voice table not initialised yet during early boot */ }
  toastEl.textContent = text;
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
   permission. Everything first goes through the DeviceSaver plugin (real
   save to phone storage); if that's unavailable, photos/video go to the
   Gallery via saveMediaToGallery and everything else (palette files, CSS/SCSS text, the standalone wallpaper
   HTML) is staged via the Filesystem plugin and handed to the native Share
   sheet, so the user picks where it goes. */
async function saveFile(blob, filename, mimeType) {
  if (isNativeApp()) {
    /* First choice: straight into phone storage (Pictures/Movies/Download
       › Gradii) via the app's own DeviceSaver plugin — a real "download",
       no Share sheet. The older paths below stay as fallbacks for builds
       without the plugin, or if saving fails. */
    const DeviceSaver = window.Capacitor.Plugins.DeviceSaver;
    if (DeviceSaver) {
      try {
        const res = await DeviceSaver.save({ data: await blobToBase64(blob), filename, mimeType: mimeType || blob.type || 'application/octet-stream' });
        setTimeout(() => showToast(`Saved to ${res && res.path ? res.path : 'your phone'}`), 50);
        haptic(12);
        return;
      } catch (e) { /* fall through */ }
    }
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

/* Copies the canvas straight to the system clipboard as a PNG, for
   pasting directly into a chat app or doc instead of only ever being
   able to save a file and attach it separately. Needs the async
   Clipboard API + ClipboardItem, both broadly supported in
   Chrome/Edge/Safari but not universal, so this fails soft with a
   toast rather than throwing when unavailable (e.g. some in-app
   Android WebViews). */
async function copyCanvasToClipboard(canvas) {
  if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
    showToast('Copying images isn’t supported in this browser — try Download instead');
    return;
  }
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    showToast('Image copied to clipboard');
  } catch (e) {
    showToast('Could not copy image — try Download instead');
  }
}

/* ==========================================================================
   Tabs
   ========================================================================== */

let activeTab = 'gradient';
const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

const navButtons = document.querySelectorAll('.nav-btn');
navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === activeTab) { window.scrollTo({ top: 0, behavior: prefersReducedMotionSafe() ? 'auto' : 'smooth' }); return; }
    setActiveTab(btn.dataset.tab);
    window.scrollTo({ top: 0 });
    haptic(8);
  });
});
function prefersReducedMotionSafe() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setActiveTab(tab) {
  activeTab = tab;
  tabButtons.forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  navButtons.forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const fromPanel = document.querySelector('.panel.active');
  const toPanel = document.getElementById('panel-' + tab);
  animateTabSwitch(fromPanel === toPanel ? null : fromPanel, toPanel);
  if (tab === 'wallpaper') activateWallpaperTab();
  else stopWallpaperAnimation();
  if (typeof closeCompare === 'function') closeCompare();
  updateAuroraBackdrop();
}

/* ==========================================================================
   Copy voice
   ----------------------------------------------------------------
   Each of the four "studio look" themes speaks in its own voice —
   Darkroom is precise, Paint Chip friendly, Prism playful, Spec Sheet
   minimal. Every other theme keeps the app's original copy (voice null).
   Two layers: applyVoice() relabels the handful of always-visible strings
   (primary buttons, empty states), and voiceToast() rewrites toasts at
   the one choke point they all pass through (showToast), so no call site
   needs to know voices exist. Toasts carrying real information (sizes,
   errors, limits) pass through unchanged — only the generic confirmations
   get re-voiced, never the facts.
   ========================================================================== */
const THEME_VOICE = { darkroom: 'precise', paintchip: 'friendly', prism: 'playful', specsheet: 'minimal' };
const VOICE = {
  precise: {
    randomize: '↻ Randomize', generate: '↻ Generate', wallpaperRandomize: '↻ Randomize colors',
    savedEmpty: 'No saved palettes. ★ Save stores up to 5 (50 with Pro).',
    dropTitle: 'Drop an image — JPG, PNG or WebP', dropSub: 'Extracts 5–8 dominant colors on-device. Nothing is uploaded.',
    saved: 'Saved', copied: 'Copied to clipboard', downloaded: 'PNG exported', loaded: 'Loaded',
    undo: 'Undo', redo: 'Redo', upsell: (x) => `Pro: ${x}. ₹39, one-time.`,
    swipeHint: 'Flick ← new · → back', locked: 'Locked', unlocked: 'Unlocked',
  },
  friendly: {
    randomize: '↻ Shuffle colors', generate: '↻ Shuffle colors', wallpaperRandomize: '↻ Shuffle colors',
    savedEmpty: 'Nothing saved yet. Tap ★ Save and your palette will wait for you here.',
    dropTitle: "Drop in a photo and we'll pull out its colors", dropSub: 'It all happens on your device — your photo never leaves it.',
    saved: "Saved. You'll find it under Saved.", copied: 'Copied — paste it anywhere', downloaded: "Downloaded. It's in your Downloads.", loaded: 'Loaded it back up',
    undo: 'Went back one step', redo: 'Went forward one step', upsell: (x) => `${x} is part of Pro — one-time ₹39`,
    swipeHint: 'Flick ← new, → back', locked: 'Kept — shuffling won’t change it', unlocked: 'Free to change again',
  },
  playful: {
    randomize: '↻ Roll again', generate: '↻ Roll again', wallpaperRandomize: '↻ Roll again',
    savedEmpty: 'Nothing here yet. Save a palette and it moves in.',
    dropTitle: 'Feed me a photo', dropSub: "I'll pick out its best colors — right here, nothing gets uploaded.",
    saved: "Nice. That one's yours.", copied: 'Copied! Go paste it somewhere nice', downloaded: 'Fresh off the press ✦', loaded: 'Welcome back',
    undo: 'Rewind!', redo: 'And forward again', upsell: (x) => `${x} lives in the Pro paint box — ₹39, once`,
    swipeHint: '← fresh roll · → rewind', locked: 'Pinned it', unlocked: 'Unpinned',
  },
  minimal: {
    randomize: '↻ Shuffle', generate: '↻ Shuffle', wallpaperRandomize: '↻ Shuffle',
    savedEmpty: 'None saved',
    dropTitle: 'Add image', dropSub: 'Processed on-device',
    saved: 'Saved', copied: 'Copied', downloaded: 'Downloaded', loaded: 'Loaded',
    undo: 'Undo', redo: 'Redo', upsell: () => 'Pro · ₹39',
    swipeHint: '← new · → back', locked: 'Locked', unlocked: 'Unlocked',
  },
};
function currentVoice() {
  return VOICE[THEME_VOICE[document.documentElement.getAttribute('data-theme')]] || null;
}
/* Original copy, captured once from the markup so switching back to a
   voice-less theme restores it exactly rather than from a second copy of
   the same strings kept here that could drift out of sync. */
const VOICE_TARGETS = [
  ['btnRandomGradient', 'randomize', 'text'],
  ['btnRandomMesh', 'randomize', 'text'],
  ['btnRandomWallpaperColors', 'wallpaperRandomize', 'text'],
  ['btnGeneratePalette', 'generate', 'kbd'],
  ['savedEmptyHint', 'savedEmpty', 'text'],
];
const voiceOriginals = {};
function applyVoice() {
  const v = currentVoice();
  VOICE_TARGETS.forEach(([id, key, mode]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!(id in voiceOriginals)) voiceOriginals[id] = el.innerHTML;
    if (!v) { el.innerHTML = voiceOriginals[id]; return; }
    el.textContent = v[key];
    if (mode === 'kbd' && window.matchMedia('(hover: hover)').matches) el.insertAdjacentHTML('beforeend', ' <kbd>Space</kbd>');
  });
  const dz = document.getElementById('dropZone');
  if (dz) {
    const title = dz.querySelector('p:not(.drop-zone-sub)');
    const sub = dz.querySelector('.drop-zone-sub');
    if (!('dropTitle' in voiceOriginals)) { voiceOriginals.dropTitle = title.innerHTML; voiceOriginals.dropSub = sub.innerHTML; }
    title.innerHTML = v ? `<strong>${v.dropTitle}</strong>` : voiceOriginals.dropTitle;
    sub.innerHTML = v ? v.dropSub : voiceOriginals.dropSub;
  }
  const swipe = document.querySelectorAll('.swipe-hint');
  swipe.forEach(el => { el.textContent = (v || VOICE.friendly).swipeHint; });
}
function voiceToast(msg) {
  const v = currentVoice();
  if (!v || typeof msg !== 'string') return msg;
  const pro = msg.match(/^(.*) is a Pro (?:feature|theme) — unlock for ₹39$/);
  if (pro) return v.upsell(pro[1]);
  if (/ saved$/.test(msg) && msg.split(' ').length <= 2) return v.saved;
  if (/ loaded$/.test(msg) && msg.split(' ').length <= 2) return v.loaded;
  if (/ copied$/.test(msg) && !/^#/.test(msg)) return v.copied;
  if (/PNG downloaded$/.test(msg)) return v.downloaded;
  if (msg === 'Undo') return v.undo;
  if (msg === 'Redo') return v.redo;
  return msg;
}

/* ==========================================================================
   Theme toggle
   ========================================================================== */

const themeToggle = document.getElementById('themeToggle');
const themeMenu = document.getElementById('themeMenu');
const THEME_NAMES = ['light', 'dark', 'aurora', 'bento', 'editorial', 'neon', 'outline', 'darkroom', 'paintchip', 'prism', 'specsheet'];
const THEME_ICON = { light: '🌙', dark: '✦', aurora: '☀', bento: '◧', editorial: '—', neon: '⌁', outline: '◐', system: '🖥', darkroom: '◉', paintchip: '▤', prism: '◈', specsheet: '▦' };
const THEME_LABEL = {
  light: 'Light', dark: 'Dark', aurora: 'Aurora Bento',
  bento: 'Bento Studio', editorial: 'Soft Editorial', neon: 'Neon Console',
  outline: 'High Contrast', system: 'Match System',
  darkroom: 'Darkroom', paintchip: 'Paint Chip', prism: 'Prism', specsheet: 'Spec Sheet',
};
/* "system" isn't a real paintable theme like the six above — it's a mode
   that keeps resolving to whichever of light/dark the OS is currently
   set to, live, independent of the app's own picker. Kept separate from
   THEME_NAMES since it's never itself a value for data-theme. */
const SYSTEM_THEME_QUERY = window.matchMedia('(prefers-color-scheme: dark)');
function resolveSystemTheme() {
  return SYSTEM_THEME_QUERY.matches ? 'dark' : 'light';
}
let currentThemeMode = 'light';
/* Aurora Bento and the three newer looks are Pro-only. isProUnlocked()
   itself lives further down this file (with the rest of the license
   system), but this check is just a bare localStorage read, so it's safe
   to inline here regardless of definition order. */
const PRO_THEMES = new Set(['aurora', 'bento', 'editorial', 'neon']);
function isThemeUnlocked(theme) {
  if (!PRO_THEMES.has(theme)) return true;
  try { return localStorage.getItem('gradii_pro_unlocked') === '1'; } catch (e) { return false; }
}

const THEME_BAR_BG = {
  light: '#f2f3f8', dark: '#0e0f1e', aurora: '#08070f', bento: '#f4f3fb', editorial: '#fdfcfa', neon: '#08070c', outline: '#000000',
  darkroom: '#0c0c0e', paintchip: '#f2f2ef', prism: '#f7f5fc', specsheet: '#eeeeea',
};
const LIGHT_THEMES = new Set(['light', 'bento', 'editorial', 'paintchip', 'prism', 'specsheet']);

/* The four "studio look" themes each bring their own type pairing. Loaded
   on demand, once, the first time a theme is actually applied — every
   other theme runs on the Inter/JetBrains pair already in index.html. */
const THEME_FONTS = {
  darkroom: 'family=Schibsted+Grotesk:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500;600',
  paintchip: 'family=Archivo:wdth,wght@62..125,400..800&family=DM+Mono:wght@400;500',
  prism: 'family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Geist+Mono:wght@400;500',
  specsheet: 'family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1',
};
const loadedThemeFonts = new Set();
function ensureThemeFonts(theme) {
  const q = THEME_FONTS[theme];
  if (!q || loadedThemeFonts.has(theme)) return;
  loadedThemeFonts.add(theme);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + q + '&display=swap';
  document.head.appendChild(link);
}

function syncNativeStatusBar(theme) {
  const StatusBar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if (!StatusBar) return;
  const bg = THEME_BAR_BG[theme] || '#0e0f1e';
  const style = LIGHT_THEMES.has(theme) ? 'LIGHT' : 'DARK';
  StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
  StatusBar.setStyle({ style }).catch(() => {});
}

function refreshThemeMenuUI() {
  themeMenu.querySelectorAll('button[data-theme-choice]').forEach(btn => {
    const t = btn.dataset.themeChoice;
    btn.classList.toggle('active', t === currentThemeMode);
    const proTag = btn.querySelector('.theme-pro-tag');
    if (proTag) proTag.hidden = !PRO_THEMES.has(t) || isThemeUnlocked(t);
  });
}

function applyTheme(theme) {
  currentThemeMode = theme;
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  themeToggle.textContent = THEME_ICON[theme] || '🌙';
  themeToggle.title = 'Choose theme (' + (THEME_LABEL[theme] || theme) + ')';
  localStorage.setItem('gradii_theme', theme);
  syncNativeStatusBar(resolved);
  ensureThemeFonts(resolved);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', THEME_BAR_BG[resolved] || '#6d5dfc');
  if (typeof applyVoice === 'function') applyVoice();
  refreshThemeMenuUI();
  /* Deferred: on first load this can fire before gradientState/meshState/
     etc. (declared later in this file) have been initialized. */
  if (resolved === 'aurora') setTimeout(updateAuroraBackdrop, 0);
}
/* Live-follows the OS setting while in "system" mode — without this,
   picking Match System would only ever apply once, at whatever the OS
   preference happened to be right then, instead of actually tracking it. */
SYSTEM_THEME_QUERY.addEventListener('change', () => {
  if (currentThemeMode === 'system') applyTheme('system');
});
(function initTheme() {
  const saved = localStorage.getItem('gradii_theme');
  let preferred = (saved === 'system' || THEME_NAMES.includes(saved)) ? saved : 'system';
  const resolvedCheck = preferred === 'system' ? resolveSystemTheme() : preferred;
  if (!isThemeUnlocked(resolvedCheck)) preferred = 'dark';
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
  updatePrismWear();
  if (!bgOrbs || document.documentElement.getAttribute('data-theme') !== 'aurora') return;
  const colors = getActiveStudioColors();
  if (!colors.length) return;
  bgOrbs.style.setProperty('--live-1', colors[0]);
  bgOrbs.style.setProperty('--live-2', colors[Math.floor(colors.length / 2)] || colors[0]);
  bgOrbs.style.setProperty('--live-3', colors[colors.length - 1]);
}

/* Prism's primary button "wears" whatever the active studio is showing:
   first and last colors of the current design as its gradient, with
   whichever of white/near-black text has the better worst-case contrast
   across both ends. */
function updatePrismWear() {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') !== 'prism') return;
  const colors = getActiveStudioColors().filter(c => /^#[0-9a-f]{6}$/i.test(c));
  if (colors.length < 2) return;
  const a = colors[0], b = colors[colors.length - 1];
  root.style.setProperty('--wear-1', a);
  root.style.setProperty('--wear-2', b);
  const onWhite = Math.min(contrastRatio(a, '#ffffff'), contrastRatio(b, '#ffffff'));
  const onDark = Math.min(contrastRatio(a, '#141220'), contrastRatio(b, '#141220'));
  root.style.setProperty('--wear-ink', onWhite >= onDark ? '#ffffff' : '#141220');
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

const visionToggle = document.getElementById('visionToggle');
const visionMenu = document.getElementById('visionMenu');
const VISION_LABEL = {
  normal: 'Normal vision', protanopia: 'Protanopia', deuteranopia: 'Deuteranopia',
  tritanopia: 'Tritanopia', achromatopsia: 'Achromatopsia',
};

function setVision(choice) {
  document.documentElement.setAttribute('data-vision', choice);
  try { localStorage.setItem('gradii_vision', choice); } catch (e) { /* ignore */ }
  visionToggle.title = choice === 'normal' ? 'Simulate color vision deficiency' : `Simulating: ${VISION_LABEL[choice]}`;
  visionToggle.classList.toggle('vision-active', choice !== 'normal');
  visionMenu.querySelectorAll('button[data-vision-choice]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.visionChoice === choice);
  });
}
(function initVision() {
  const saved = localStorage.getItem('gradii_vision') || 'normal';
  setVision(VISION_LABEL[saved] ? saved : 'normal');
})();
visionToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  visionMenu.classList.toggle('open');
});
document.addEventListener('click', () => visionMenu.classList.remove('open'));
visionMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-vision-choice]');
  if (!btn) return;
  setVision(btn.dataset.visionChoice);
  visionMenu.classList.remove('open');
});

/* ==========================================================================
   GRADIENT STUDIO
   ========================================================================== */

/* tag powers the mood/tag filter above the presets grid — purely a
   browsing aid, never part of gradientState, since it doesn't change
   the gradient itself, only which presets are currently shown. */
const GRADIENT_PRESETS = [
  { name: 'Sunset', stops: ['#ff512f', '#f09819'], angle: 120, tag: 'warm' },
  { name: 'Ocean', stops: ['#2193b0', '#6dd5ed'], angle: 135, tag: 'cool' },
  { name: 'Candy', stops: ['#ff9a9e', '#fecfef'], angle: 135, tag: 'pastel' },
  { name: 'Mojito', stops: ['#1d976c', '#93f9b9'], angle: 120, tag: 'vibrant' },
  { name: 'Instagram', stops: ['#833ab4', '#fd1d1d', '#fcb045'], angle: 135, tag: 'neon' },
  { name: 'Cosmic', stops: ['#ff00cc', '#333399'], angle: 110, tag: 'neon' },
  { name: 'Peach', stops: ['#ed4264', '#ffedbc'], angle: 135, tag: 'pastel' },
  { name: 'Midnight City', stops: ['#232526', '#414345'], angle: 135, tag: 'dark' },
  { name: 'Aqua Marine', stops: ['#1a2980', '#26d0ce'], angle: 135, tag: 'cool' },
  { name: 'Grape', stops: ['#8e2de2', '#4a00e0'], angle: 135, tag: 'vibrant' },
  { name: 'Lush', stops: ['#56ab2f', '#a8e063'], angle: 120, tag: 'vibrant' },
  { name: 'Fire', stops: ['#f12711', '#f5af19'], angle: 135, tag: 'warm' },
  { name: 'Royal', stops: ['#141e30', '#243b55'], angle: 135, tag: 'dark' },
  { name: 'Bloom', stops: ['#dd5e89', '#f7bb97'], angle: 120, tag: 'pastel' },
  { name: 'Emerald', stops: ['#43cea2', '#185a9d'], angle: 135, tag: 'cool' },
  { name: 'Cherry', stops: ['#eb3349', '#f45c43'], angle: 135, tag: 'warm' },
  { name: 'Sky', stops: ['#00c6ff', '#0072ff'], angle: 135, tag: 'cool' },
  { name: 'Flamingo', stops: ['#f78ca0', '#f9748f', '#fd868c', '#fe9a8b'], angle: 135, tag: 'pastel' },
  { name: 'Rose Gold', stops: ['#b76e79', '#f6d9d3'], angle: 135, tag: 'pastel' },
  { name: 'Cotton Candy', stops: ['#a18cd1', '#fbc2eb'], angle: 135, tag: 'pastel' },
  { name: 'Lime', stops: ['#a8ff78', '#78ffd6'], angle: 120, tag: 'vibrant' },
  { name: 'Blush', stops: ['#ff9a9e', '#fad0c4', '#fbc2eb'], angle: 135, tag: 'pastel' },
  { name: 'Nebula', stops: ['#654ea3', '#eaafc8'], angle: 130, tag: 'vibrant' },
  { name: 'Amber', stops: ['#f7971e', '#ffd200'], angle: 120, tag: 'warm' },
  { name: 'Deep Sea', type: 'radial', stops: ['#000428', '#004e92'], tag: 'dark' },
  { name: 'Solar Flare', type: 'conic', stops: ['#ff512f', '#f09819', '#ff512f'], angle: 0, tag: 'warm' },
];

const GRADIENT_PRESET_TAGS = ['all', 'warm', 'cool', 'pastel', 'neon', 'dark', 'vibrant'];
let gradientPresetFilter = 'all';

let gradientState = {
  type: 'linear',
  angle: 90,
  shape: 'ellipse',
  posX: 50,
  posY: 50,
  oklch: false,
  temperature: 0,
  repeat: 1,
  dither: false,
  fx: { glass: 'none', glassAmount: 0.7, grain: 0, vignette: 0, glow: 0 },
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

/* A non-destructive tint layered on top of the stop colors at render
   time — the stored stop colors never change, so dragging the slider
   back to 0 always exactly restores what you picked. temp ranges -50
   (cool) to +50 (warm); each stop's hue is blended partway toward a
   warm orange or cool blue target hue, scaled by how far the slider is
   pushed. */
function applyTemperatureShift(stops, temp) {
  if (!temp) return stops;
  const targetHue = temp > 0 ? 40 : 220;
  const strength = Math.min(1, Math.abs(temp) / 50) * 0.5;
  return stops.map(s => {
    const { h, s: sat, l } = hexToHsl(s.color);
    let dh = targetHue - h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    const newHue = (h + dh * strength + 360) % 360;
    return { ...s, color: hslToHex(newHue, sat, l) };
  });
}

function getRenderStops(state) {
  let stops = expandStopsOklch([...state.stops].sort((a, b) => a.pos - b.pos), state.oklch);
  stops = applyTemperatureShift(stops, state.temperature || 0);
  return stops;
}

function buildGradientCss(state) {
  const stops = getRenderStops(state);
  const repeat = clamp(state.repeat || 1, 1, 6);
  const renderStops = repeat > 1 ? stops.map(s => ({ ...s, pos: s.pos / repeat })) : stops;
  const stopsStr = renderStops.map(s => `${s.color} ${(Math.round(s.pos * 100) / 100)}%`).join(', ');
  const prefix = repeat > 1 ? 'repeating-' : '';
  if (state.type === 'linear') return `${prefix}linear-gradient(${state.angle}deg, ${stopsStr})`;
  if (state.type === 'radial') return `${prefix}radial-gradient(${state.shape} at ${state.posX}% ${state.posY}%, ${stopsStr})`;
  return `${prefix}conic-gradient(from ${state.angle}deg at ${state.posX}% ${state.posY}%, ${stopsStr})`;
}

function renderGradientPreview() {
  const css = buildGradientCss(gradientState);
  gradientPreview.style.background = css;
  cssOutput.textContent = `background: ${css};` + (studioFxActive(gradientState.fx) ? '\n/* Glass, grain & other effects are in the PNG, not in CSS */' : '');
  scheduleStudioFx('gradient');
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
  pushRecentGenerated('gradient', buildGradientCss(gradientState), gradientState);
}

function syncGradientControlsFromState() {
  if (typeof syncFxCard === 'function') syncFxCard('gradient');
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
  document.getElementById('gradientOklchToggle').checked = !!gradientState.oklch;
  const temp = gradientState.temperature || 0;
  document.getElementById('gradientTempSlider').value = temp;
  document.getElementById('gradientTempValue').textContent = temp > 0 ? `+${temp}` : `${temp}`;
  const repeat = gradientState.repeat || 1;
  document.getElementById('gradientRepeatSlider').value = repeat;
  document.getElementById('gradientRepeatValue').textContent = `${repeat}×`;
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

/* Drag directly on the preview to set angle (linear) or center position
   (radial/conic), instead of only via the sliders below. For linear,
   the angle is the compass bearing (clockwise from up, matching CSS's
   own linear-gradient(angle) convention) from the preview's center to
   the pointer — dragging up sets 0deg, right sets 90deg, and so on. */
gradientPreview.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const rect = gradientPreview.getBoundingClientRect();
  gradientPreview.setPointerCapture(e.pointerId);

  function update(ev) {
    if (gradientState.type === 'linear') {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      if (Math.hypot(dx, dy) < 6) return;
      const angle = Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360);
      gradientState.angle = angle;
      angleSlider.value = angle;
      angleValue.textContent = `${angle}°`;
    } else {
      const x = clamp(Math.round(((ev.clientX - rect.left) / rect.width) * 100), 0, 100);
      const y = clamp(Math.round(((ev.clientY - rect.top) / rect.height) * 100), 0, 100);
      gradientState.posX = x;
      gradientState.posY = y;
      posXSlider.value = x;
      posYSlider.value = y;
      posXValue.textContent = `${x}%`;
      posYValue.textContent = `${y}%`;
    }
    renderGradientPreview();
  }
  function onUp() {
    gradientPreview.removeEventListener('pointermove', update);
    gradientPreview.removeEventListener('pointerup', onUp);
    gradientPreview.removeEventListener('pointercancel', onUp);
  }
  update(e);
  gradientPreview.addEventListener('pointermove', update);
  gradientPreview.addEventListener('pointerup', onUp);
  gradientPreview.addEventListener('pointercancel', onUp);
});

document.getElementById('btnAddStop').addEventListener('click', addGradientStop);
document.getElementById('btnRandomGradient').addEventListener('click', randomizeGradient);
document.getElementById('btnCopyCss').addEventListener('click', () => copyText(cssOutput.textContent, 'CSS copied'));
cssOutput.addEventListener('click', () => copyText(cssOutput.textContent, 'CSS copied'));

function renderPresetTagFilter() {
  const container = document.getElementById('presetTagFilter');
  if (!container) return;
  container.innerHTML = '';
  GRADIENT_PRESET_TAGS.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-chip' + (tag === gradientPresetFilter ? ' active' : '');
    btn.textContent = tag === 'all' ? 'All' : tag[0].toUpperCase() + tag.slice(1);
    btn.addEventListener('click', () => {
      gradientPresetFilter = tag;
      renderPresetTagFilter();
      renderPresets();
    });
    container.appendChild(btn);
  });
}

function renderPresets() {
  presetsGrid.innerHTML = '';
  const visible = gradientPresetFilter === 'all'
    ? GRADIENT_PRESETS
    : GRADIENT_PRESETS.filter(p => p.tag === gradientPresetFilter);
  visible.forEach(preset => {
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
        oklch: false,
        temperature: 0,
        repeat: 1,
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
  const baseStops = getRenderStops(state);
  const repeat = clamp(state.repeat || 1, 1, 6);
  const stops = repeat > 1
    ? Array.from({ length: repeat }, (_, cycle) => baseStops.map(s => ({ color: s.color, pos: (cycle * 100 + s.pos) / repeat }))).flat()
    : baseStops;
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

/* Ordered (Bayer 4x4) dithering: nudges each pixel up or down by a tiny,
   position-dependent amount before it gets rounded to an 8-bit channel
   value. A smooth gradient's color normally steps in hard, visible bands
   wherever two adjacent output values round to the same 8-bit level —
   this breaks that flat step up into a fine, essentially invisible
   speckle instead, the same trick classic image dithering uses. Export-
   only (like the AMOLED crush): a per-pixel pass is a one-time export
   cost, not something to repeat every animation frame. */
const DITHER_BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
function ditherCanvas(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const offset = (DITHER_BAYER_4X4[y % 4][x % 4] / 16 - 0.5) * 1.4;
      d[idx] = clamp(Math.round(d[idx] + offset), 0, 255);
      d[idx + 1] = clamp(Math.round(d[idx + 1] + offset), 0, 255);
      d[idx + 2] = clamp(Math.round(d[idx + 2] + offset), 0, 255);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

document.getElementById('btnDownloadPng').addEventListener('click', () => {
  const size = resolveExportSize(document.getElementById('gradientResolutionSelect'));
  if (!size) return;
  const canvas = document.getElementById('exportCanvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  drawGradientToCanvas(ctx, canvas.width, canvas.height, gradientState);
  wpApplyEffects(ctx, canvas.width, canvas.height, gradientState.fx, 0);
  if (gradientState.dither) ditherCanvas(ctx, canvas.width, canvas.height);
  drawWatermark(ctx, canvas.width, canvas.height);
  downloadCanvasPng(canvas, `gradient-${size.w}x${size.h}.png`);
  showToast('Gradient PNG downloaded');
});

document.getElementById('btnCopyGradientImage').addEventListener('click', () => {
  const size = resolveExportSize(document.getElementById('gradientResolutionSelect'));
  if (!size) return;
  const canvas = document.getElementById('exportCanvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  drawGradientToCanvas(ctx, canvas.width, canvas.height, gradientState);
  wpApplyEffects(ctx, canvas.width, canvas.height, gradientState.fx, 0);
  if (gradientState.dither) ditherCanvas(ctx, canvas.width, canvas.height);
  drawWatermark(ctx, canvas.width, canvas.height);
  copyCanvasToClipboard(canvas);
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
   Saved gradients + crossfade preview
   ----------------------------------------------------------------
   Crossfading isn't "layer gradient A over gradient B and let CSS
   figure it out" — that doesn't produce a real blend. It samples each
   saved gradient's own color at N even positions (walking its stops,
   interpolating between whichever two straddle that position), then
   mixes each pair of samples in OKLCH by the slider's t. That's what
   "the blend between two designs" actually means color-by-color.
   ========================================================================== */
function loadSavedGradients() {
  try { return JSON.parse(localStorage.getItem('gradii_saved_gradients') || '[]'); }
  catch (e) { return []; }
}
function saveSavedGradients(list) {
  try { localStorage.setItem('gradii_saved_gradients', JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function sampleGradientStopsAt(stops, pos) {
  if (pos <= stops[0].pos) return stops[0].color;
  if (pos >= stops[stops.length - 1].pos) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i++) {
    if (pos >= stops[i].pos && pos <= stops[i + 1].pos) {
      const t = (pos - stops[i].pos) / ((stops[i + 1].pos - stops[i].pos) || 1);
      return mixOklch(stops[i].color, stops[i + 1].color, t);
    }
  }
  return stops[0].color;
}
function blendSavedGradients(a, b, t, n) {
  const stopsA = [...a.stops].sort((x, y) => x.pos - y.pos);
  const stopsB = [...b.stops].sort((x, y) => x.pos - y.pos);
  return Array.from({ length: n }, (_, i) => {
    const pos = Math.round((i / (n - 1)) * 100);
    const colorA = sampleGradientStopsAt(stopsA, pos);
    const colorB = sampleGradientStopsAt(stopsB, pos);
    return { color: mixOklch(colorA, colorB, t), pos };
  });
}

let crossfadeSelection = [];

function renderSavedGradients() {
  const grid = document.getElementById('savedGradientsGrid');
  const list = loadSavedGradients();
  document.getElementById('savedGradientsHint').hidden = list.length > 0;
  document.getElementById('savedGradientsCompareHint').hidden = list.length < 2;
  grid.innerHTML = '';
  list.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'preset-swatch';
    el.title = 'Click to load this gradient — shift-click two to compare/crossfade';
    el.style.background = buildGradientCss(g);
    if (crossfadeSelection.includes(i)) el.style.outline = '3px solid var(--accent)';
    el.addEventListener('click', (e) => {
      if (e.shiftKey) {
        const pos = crossfadeSelection.indexOf(i);
        if (pos >= 0) crossfadeSelection.splice(pos, 1);
        else {
          if (crossfadeSelection.length >= 2) crossfadeSelection.shift();
          crossfadeSelection.push(i);
        }
        renderSavedGradients();
        updateCrossfadeCard();
        return;
      }
      gradientState = JSON.parse(JSON.stringify(g));
      syncGradientControlsFromState();
      renderStopsList();
      renderGradientPreview();
      showToast('Gradient loaded');
    });
    grid.appendChild(el);
  });
}

function renderCrossfadePreview() {
  const list = loadSavedGradients();
  const a = list[crossfadeSelection[0]], b = list[crossfadeSelection[1]];
  if (!a || !b) return;
  const t = Number(document.getElementById('gradientCrossfadeSlider').value) / 100;
  const blended = blendSavedGradients(a, b, t, 6);
  const css = `linear-gradient(90deg, ${blended.map(s => `${s.color} ${s.pos}%`).join(', ')})`;
  document.getElementById('gradientCrossfadePreview').style.background = css;
}

function updateCrossfadeCard() {
  const card = document.getElementById('gradientCrossfadeCard');
  card.hidden = crossfadeSelection.length < 2;
  if (!card.hidden) renderCrossfadePreview();
}

document.getElementById('btnSaveGradient').addEventListener('click', () => {
  const list = loadSavedGradients();
  list.unshift(JSON.parse(JSON.stringify(gradientState)));
  if (list.length > 12) list.length = 12;
  saveSavedGradients(list);
  renderSavedGradients();
  showToast('Gradient saved');
});

document.getElementById('gradientCrossfadeSlider').addEventListener('input', renderCrossfadePreview);

document.getElementById('btnClearCrossfade').addEventListener('click', () => {
  crossfadeSelection = [];
  renderSavedGradients();
  updateCrossfadeCard();
});

document.getElementById('btnUseCrossfadeBlend').addEventListener('click', () => {
  const list = loadSavedGradients();
  const a = list[crossfadeSelection[0]], b = list[crossfadeSelection[1]];
  if (!a || !b) return;
  const t = Number(document.getElementById('gradientCrossfadeSlider').value) / 100;
  gradientState.stops = blendSavedGradients(a, b, t, 6);
  renderStopsList();
  renderGradientPreview();
  showToast('Blend applied');
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

let paletteHistory = [];
let paletteHistoryIndex = -1;
function pushPaletteHistory() {
  paletteHistory = paletteHistory.slice(0, paletteHistoryIndex + 1);
  paletteHistory.push({ colors: [...paletteState.colors], locked: [...paletteState.locked] });
  if (paletteHistory.length > 30) paletteHistory.shift();
  paletteHistoryIndex = paletteHistory.length - 1;
}
function loadPaletteHistory(index) {
  const entry = paletteHistory[index];
  if (!entry) return false;
  paletteHistoryIndex = index;
  paletteState.colors = [...entry.colors];
  paletteState.locked = [...entry.locked];
  renderPaletteSwatches();
  return true;
}

function generatePalette() {
  ensurePaletteArrays();
  paletteState.colors = generatePaletteColors(paletteState.harmony, paletteState.count, paletteState.colors, paletteState.locked);
  renderPaletteSwatches();
  pushPaletteHistory();
  quirkyBounce(paletteSwatchesEl);
  pushRecentGenerated('palette', `linear-gradient(90deg, ${paletteState.colors.join(', ')})`, paletteState);
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
        <span class="color-name">${colorName(color)}</span>
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
  renderPaletteCvdWarning();
}

/* Same simplified simulation matrices already used for the app-wide CVD
   preview filters (index.html's #filter-protanopia etc.) — reused here
   in JS so "does this look different under X" can be computed as a
   number instead of only judged by eye. */
const CVD_MATRICES = {
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
};
function simulateCvdHex(hex, type) {
  const { r, g, b } = hexToRgb(hex);
  if (type === 'achromatopsia') {
    const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    return rgbToHex(gray, gray, gray);
  }
  const m = CVD_MATRICES[type];
  if (!m) return hex;
  return rgbToHex(
    clamp(Math.round(m[0] * r + m[1] * g + m[2] * b), 0, 255),
    clamp(Math.round(m[3] * r + m[4] * g + m[5] * b), 0, 255),
    clamp(Math.round(m[6] * r + m[7] * g + m[8] * b), 0, 255)
  );
}
function oklabDistance(hexA, hexB) {
  const a = hexToOklab(hexA), b = hexToOklab(hexB);
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}
const CVD_LABELS = { protanopia: 'protanopia', deuteranopia: 'deuteranopia', tritanopia: 'tritanopia', achromatopsia: 'achromatopsia' };
const CVD_COLLISION_THRESHOLD = 0.06;

/* Flags (never blocks) swatch pairs that land close enough together
   under a simulated color-vision deficiency that they'd be hard to
   tell apart — distance measured in OKLab on the *simulated* colors,
   not the originals, since two colors can look distinct normally but
   collapse toward each other once a CVD type removes part of their
   difference. */
function renderPaletteCvdWarning() {
  const box = document.getElementById('paletteCvdWarning');
  const colors = paletteState.colors;
  const messages = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const hitTypes = Object.keys(CVD_MATRICES).concat('achromatopsia').filter(type => {
        const simA = simulateCvdHex(colors[i], type);
        const simB = simulateCvdHex(colors[j], type);
        return oklabDistance(simA, simB) < CVD_COLLISION_THRESHOLD;
      });
      if (hitTypes.length) {
        messages.push(`Colors ${i + 1} & ${j + 1} look very similar under ${hitTypes.map(t => CVD_LABELS[t]).join(', ')}`);
      }
    }
  }
  if (!messages.length) { box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  box.innerHTML = `⚠ ${messages.join(' · ')}`;
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
  const all = getSavedPalettes();
  const list = activeCollection === 'all' ? all : all.filter(p => p.collection === activeCollection);
  savedEmptyHint.style.display = list.length ? 'none' : 'block';
  if (!list.length && all.length) savedEmptyHint.textContent = 'Nothing in this collection yet. Save a palette while it’s open, or use ▤ on any saved palette to move it here.';
  else if (typeof applyVoice === 'function') applyVoice();
  renderCollectionBar();
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
    const move = document.createElement('button');
    move.className = 'saved-move';
    move.textContent = '▤';
    move.title = 'Move to a collection';
    move.setAttribute('aria-label', 'Move to a collection');
    move.addEventListener('click', (e) => {
      e.stopPropagation();
      openCollectionPop(item.id, move);
    });
    el.appendChild(move);
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
  const entry = { id: Date.now(), colors: [...paletteState.colors] };
  // Smart default: saving while a collection is open files it there.
  if (activeCollection !== 'all') entry.collection = activeCollection;
  list.unshift(entry);
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

function copyPaletteImageToClipboard(colors) {
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
  copyCanvasToClipboard(canvas);
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

/* A full 50–900 shade ramp generated from a single base color, in the
   naming convention Tailwind/Material use — different from the "Shades"
   harmony (which varies a user-chosen count of stops) in that this
   always produces the same 10 named steps, ready to paste into a design
   system's token file. Uses OKLCH so the ramp stays a consistent hue
   from the lightest to the darkest step, the same reasoning as the
   Cohesive palette harmony. */
const MATERIAL_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const MATERIAL_SCALE_LIGHTNESS = [0.97, 0.93, 0.86, 0.78, 0.68, 0.58, 0.48, 0.38, 0.28, 0.18];
function generateMaterialScale(baseHex) {
  const { C, H } = hexToOklch(baseHex);
  const scale = {};
  MATERIAL_SCALE_STEPS.forEach((step, i) => {
    scale[step] = oklchToHex(MATERIAL_SCALE_LIGHTNESS[i], C, H);
  });
  return scale;
}
function exportPaletteAsMaterialScale(colors) {
  const base = colors[0];
  const scale = generateMaterialScale(base);
  const jsLines = MATERIAL_SCALE_STEPS.map(step => `  ${step}: '${scale[step]}',`).join('\n');
  const text = `// 50-900 shade scale generated from ${base.toUpperCase()}\nexport const colorScale = {\n${jsLines}\n};\n`;
  downloadBlob(text, 'color-scale.js', 'text/javascript');
}

exportMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-export]');
  if (!btn) return;
  const colors = paletteState.colors;
  if (btn.dataset.export === 'png') exportPaletteAsPng(colors);
  if (btn.dataset.export === 'copyImage') { copyPaletteImageToClipboard(colors); exportMenu.classList.remove('open'); return; }
  if (btn.dataset.export === 'css') exportPaletteAsCss(colors);
  if (btn.dataset.export === 'scss') exportPaletteAsScss(colors);
  if (btn.dataset.export === 'tailwind') exportPaletteAsTailwind(colors);
  if (btn.dataset.export === 'ase') exportPaletteAsAse(colors);
  if (btn.dataset.export === 'gpl') exportPaletteAsGpl(colors);
  if (btn.dataset.export === 'json') exportPaletteAsJson(colors);
  if (btn.dataset.export === 'text') exportPaletteAsText(colors);
  if (btn.dataset.export === 'tokens') exportPaletteAsTokens(colors);
  if (btn.dataset.export === 'figma') exportPaletteAsFigmaVariables(colors);
  if (btn.dataset.export === 'materialScale') exportPaletteAsMaterialScale(colors);
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
  fx: { glass: 'none', glassAmount: 0.7, grain: 0, vignette: 0, glow: 0 },
  baseColor: '#0f1020',
  blendMode: 'normal',
  family: 'scatter',
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

function meshColorAt(baseHue, i, count, spread) {
  const h = baseHue + (Math.random() - 0.5) * spread + (i / Math.max(1, count)) * 40;
  return hslToHex(h, 55 + Math.random() * 35, 45 + Math.random() * 25);
}

/* Mesh generator families: each takes (count, baseHue) and returns an
   array of {x,y,size,color} points in the same shape randomMeshPoints
   always produced, so nothing downstream (rendering, dragging, the
   blob list) needs to know which family built them — only how the
   points are laid out differs. */
const MESH_FAMILIES = {
  /* Original behavior: pure uniform-random scatter. */
  scatter(count, baseHue) {
    return Array.from({ length: count }, (_, i) => ({
      x: Math.round(Math.random() * 100),
      y: Math.round(Math.random() * 100),
      size: Math.round(45 + Math.random() * 35),
      color: meshColorAt(baseHue, i, count, 160),
    }));
  },
  /* Horizontal bands stacked top to bottom, each with a gentle sideways
     wave offset — Haikei's "layered waves" look. */
  layeredWaves(count, baseHue) {
    return Array.from({ length: count }, (_, i) => {
      const band = i / Math.max(1, count - 1);
      return {
        x: Math.round(50 + Math.sin(i * 2.4) * 30 + (Math.random() - 0.5) * 12),
        y: Math.round(10 + band * 80),
        size: Math.round(55 + Math.random() * 30),
        color: meshColorAt(baseHue, i, count, 110),
      };
    });
  },
  /* Evenly spaced around a circle, like rays bursting from the center. */
  radialBurst(count, baseHue) {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radius = 30 + Math.random() * 20;
      return {
        x: Math.round(50 + Math.cos(angle) * radius),
        y: Math.round(50 + Math.sin(angle) * radius),
        size: Math.round(35 + Math.random() * 25),
        color: meshColorAt(baseHue, i, count, 140),
      };
    });
  },
  /* A jittered grid — good even coverage, no empty corners or crowded
     centers the way pure random scatter can produce. */
  gridScatter(count, baseHue) {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cellW = 100 / cols, cellH = 100 / rows;
      return {
        x: Math.round(clamp(cellW * (col + 0.5) + (Math.random() - 0.5) * cellW * 0.7, 5, 95)),
        y: Math.round(clamp(cellH * (row + 0.5) + (Math.random() - 0.5) * cellH * 0.7, 5, 95)),
        size: Math.round(45 + Math.random() * 30),
        color: meshColorAt(baseHue, i, count, 130),
      };
    });
  },
  /* Golden-angle spiral (sunflower-seed packing) out from the center —
     naturally even spacing with no two points ever landing too close. */
  spiral(count, baseHue) {
    const goldenAngle = 137.508 * (Math.PI / 180);
    return Array.from({ length: count }, (_, i) => {
      const radius = 45 * Math.sqrt((i + 0.5) / count);
      const angle = i * goldenAngle;
      return {
        x: Math.round(clamp(50 + Math.cos(angle) * radius, 3, 97)),
        y: Math.round(clamp(50 + Math.sin(angle) * radius, 3, 97)),
        size: Math.round(40 + Math.random() * 30),
        color: meshColorAt(baseHue, i, count, 150),
      };
    });
  },
  /* Half the points placed randomly, the other half mirrored across the
     vertical center line — a symmetric, kaleidoscope-like composition. */
  symmetric(count, baseHue) {
    const half = Math.ceil(count / 2);
    const points = [];
    for (let i = 0; i < half; i++) {
      const x = Math.round(5 + Math.random() * 45);
      const y = Math.round(Math.random() * 100);
      const size = Math.round(45 + Math.random() * 35);
      const color = meshColorAt(baseHue, i, count, 130);
      points.push({ x, y, size, color });
      if (points.length < count) points.push({ x: 100 - x, y, size, color });
    }
    return points.slice(0, count);
  },
  /* Points biased toward the four corners/edges — leaves the center
     calmer, useful for a wallpaper that needs a clear middle for icons
     or a subject. */
  corners(count, baseHue) {
    const anchors = [[10, 10], [90, 10], [10, 90], [90, 90], [50, 5], [50, 95]];
    return Array.from({ length: count }, (_, i) => {
      const [ax, ay] = anchors[i % anchors.length];
      return {
        x: Math.round(clamp(ax + (Math.random() - 0.5) * 24, 2, 98)),
        y: Math.round(clamp(ay + (Math.random() - 0.5) * 24, 2, 98)),
        size: Math.round(50 + Math.random() * 35),
        color: meshColorAt(baseHue, i, count, 140),
      };
    });
  },
  /* A handful of concentric rings around the center, points spread
     evenly around each ring. */
  concentricRings(count, baseHue) {
    const rings = Math.min(3, Math.max(1, Math.ceil(count / 3)));
    return Array.from({ length: count }, (_, i) => {
      const ring = i % rings;
      const radius = 12 + ring * (35 / rings);
      const onRing = Math.floor(i / rings);
      const perRing = Math.ceil(count / rings);
      const angle = (onRing / perRing) * Math.PI * 2 + ring * 0.6;
      return {
        x: Math.round(clamp(50 + Math.cos(angle) * radius, 3, 97)),
        y: Math.round(clamp(50 + Math.sin(angle) * radius, 3, 97)),
        size: Math.round(40 + Math.random() * 30),
        color: meshColorAt(baseHue, i, count, 130),
      };
    });
  },
};

const MESH_FAMILY_NAMES = {
  scatter: 'Scatter',
  layeredWaves: 'Layered Waves',
  radialBurst: 'Radial Burst',
  gridScatter: 'Grid',
  spiral: 'Spiral',
  symmetric: 'Symmetric',
  corners: 'Corners',
  concentricRings: 'Rings',
};

function randomMeshPoints(count, family) {
  const baseHue = Math.random() * 360;
  const fn = MESH_FAMILIES[family] || MESH_FAMILIES.scatter;
  return fn(count, baseHue);
}

function buildMeshCssLayers(state) {
  return state.points
    .map(p => `radial-gradient(circle at ${p.x}% ${p.y}%, ${hexToRgba(p.color, p.opacity ?? 1)} 0%, transparent ${p.size}%)`);
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
    `background-blend-mode: ${meshState.blendMode};` +
    (studioFxActive(meshState.fx) ? '\n/* Glass, grain & other effects are in the PNG, not in CSS */' : '');

  syncMeshDragHandles();
  scheduleStudioFx('mesh');
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

/* Vertical/horizontal guide lines, created once and just toggled/moved
   during a drag — like Figma/Sketch's alignment guides. */
let meshGuideV = null, meshGuideH = null;
function ensureMeshGuides() {
  if (meshGuideV) return;
  meshGuideV = document.createElement('div');
  meshGuideV.className = 'mesh-guide mesh-guide-v';
  meshGuideH = document.createElement('div');
  meshGuideH.className = 'mesh-guide mesh-guide-h';
  meshPreview.appendChild(meshGuideV);
  meshPreview.appendChild(meshGuideH);
}

const MESH_SNAP_THRESHOLD = 2.2;

function startMeshBlobDrag(e, index, handle) {
  e.preventDefault();
  ensureMeshGuides();
  handle.setPointerCapture(e.pointerId);
  handle.classList.add('dragging');
  const rect = meshPreview.getBoundingClientRect();

  function onMove(ev) {
    let x = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
    let y = clamp(((ev.clientY - rect.top) / rect.height) * 100, 0, 100);

    /* Snap targets: every other blob's x/y, plus the center line —
       whichever is closest within MESH_SNAP_THRESHOLD wins, and its
       guide line lights up so the snap is visible, not just felt. */
    const otherXs = [50, ...meshState.points.filter((_, i) => i !== index).map(p => p.x)];
    const otherYs = [50, ...meshState.points.filter((_, i) => i !== index).map(p => p.y)];
    let snappedX = null, snappedY = null;
    for (const ox of otherXs) if (Math.abs(x - ox) < MESH_SNAP_THRESHOLD) { snappedX = ox; break; }
    for (const oy of otherYs) if (Math.abs(y - oy) < MESH_SNAP_THRESHOLD) { snappedY = oy; break; }
    if (snappedX !== null) x = snappedX;
    if (snappedY !== null) y = snappedY;

    meshGuideV.style.left = `${x}%`;
    meshGuideV.classList.toggle('visible', snappedX !== null);
    meshGuideH.style.top = `${y}%`;
    meshGuideH.classList.toggle('visible', snappedY !== null);

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
    meshGuideV.classList.remove('visible');
    meshGuideH.classList.remove('visible');
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  }
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}

function renderMeshBlobsList() {
  if (typeof syncFxCard === 'function') syncFxCard('mesh');
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
        <div class="mesh-blob-field">
          <span>Soft</span>
          <input type="range" class="mesh-blob-opacity" min="15" max="100" value="${Math.round((p.opacity ?? 1) * 100)}">
          <span class="mesh-blob-opacity-value">${Math.round((p.opacity ?? 1) * 100)}%</span>
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
    row.querySelector('.mesh-blob-opacity').addEventListener('input', (e) => {
      p.opacity = Number(e.target.value) / 100;
      row.querySelector('.mesh-blob-opacity-value').textContent = `${e.target.value}%`;
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
  meshState.points = randomMeshPoints(meshState.points.length || 5, meshState.family);
  applyBrandKitToMesh();
  renderMeshBlobsList();
  renderMeshPreview();
  quirkyBounce(document.querySelector('#panel-mesh .preview-frame'));
  pushRecentGenerated('mesh', `linear-gradient(135deg, ${meshState.points.map(p => p.color).join(', ')})`, meshState);
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

const meshFamilySelect = document.getElementById('meshFamilySelect');
meshFamilySelect.addEventListener('change', () => {
  meshState.family = meshFamilySelect.value;
  meshState.points = randomMeshPoints(meshState.points.length || 5, meshState.family);
  renderMeshBlobsList();
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
    grad.addColorStop(0, hexToRgba(p.color, p.opacity ?? 1));
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
  wpApplyEffects(ctx, w, h, meshState.fx, 0);
  drawWatermark(ctx, w, h);
  downloadCanvasPng(canvas, `mesh-${w}x${h}.png`);
  showToast('Mesh gradient PNG downloaded');
});

document.getElementById('btnCopyMeshImage').addEventListener('click', () => {
  const size = resolveExportSize(document.getElementById('meshResolutionSelect'));
  if (!size) return;
  const { w, h } = size;
  const canvas = document.getElementById('exportCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawMeshToCanvas(ctx, w, h, meshState);
  wpApplyEffects(ctx, w, h, meshState.fx, 0);
  drawWatermark(ctx, w, h);
  copyCanvasToClipboard(canvas);
});

/* One-click "promote" this mesh into Wallpaper Studio as a Flowing Mesh
   pattern — the base color becomes the background, the blob colors
   become the moving color set, so a design you like here doesn't have
   to be manually rebuilt swatch-by-swatch over there. */
document.getElementById('btnPromoteMeshToWallpaper').addEventListener('click', () => {
  const colors = [meshState.baseColor, ...meshState.points.map(p => p.color)].slice(0, 6);
  wallpaperState = normalizeWallpaperState(Object.assign({}, wallpaperState, { pattern: 'flowingMesh', colors, locked: colors.map(() => false) }));
  applyWallpaperStateToUI();
  setActiveTab('wallpaper');
  showToast('Mesh sent to Wallpaper Studio');
});

/* ==========================================================================
   WALLPAPER STUDIO
   The original ("Classic" and "Motion") pattern renderers. They keep their
   (ctx, w, h, t, colors, speed) signature; the newer styles and the style
   registry are further down (WP_STYLES).
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
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
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
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
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
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
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

/* Linear-interpolate two hex colors at t in [0, 1]. */
function wpLerpColor(hexA, hexB, t) {
  const a = hexA.replace('#', ''); const b = hexB.replace('#', '');
  const af = a.length === 3 ? a.split('').map(c => c + c).join('') : a;
  const bf = b.length === 3 ? b.split('').map(c => c + c).join('') : b;
  const an = parseInt(af, 16) || 0, bn = parseInt(bf, 16) || 0;
  const ar = (an >> 16) & 255, ag = (an >> 8) & 255, ab = an & 255;
  const br = (bn >> 16) & 255, bg = (bn >> 8) & 255, bb = bn & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

/* Drifting particles at three depth bands (parallax: farther = slower
   and dimmer). Positions come from a cheap per-index hash rather than
   Math.random(), so every star sits in a fixed spot and just drifts —
   no per-frame randomness, no state to keep between calls. */
function wpDrawStarfield(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#020208';
  const starColors = colors.length > 1 ? colors.slice(1) : ['#ffffff'];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const count = 160;
  for (let i = 0; i < count; i++) {
    const s1 = Math.sin(i * 12.9898) * 43758.5453; const rx = s1 - Math.floor(s1);
    const s2 = Math.sin(i * 78.233) * 12345.678; const ry = s2 - Math.floor(s2);
    const depth = 0.3 + (i % 5) / 5 * 0.7;
    const x = ((rx * w + t * speed * 14 * depth) % w + w) % w;
    const y = ry * h;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * speed * 2 + i));
    const size = 0.6 + depth * 1.8;
    ctx.globalAlpha = twinkle * depth;
    ctx.fillStyle = starColors[i % starColors.length];
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Classic sine-interference plasma, sampled on a coarse grid (not per
   pixel — a full-resolution per-pixel loop is too slow for a 60fps
   canvas) and filled as small rects, colored by walking wallpaperState's
   own color stops instead of a fixed rainbow LUT. */
function wpDrawPlasma(ctx, w, h, t, colors, speed) {
  const list = colors.length ? colors : ['#6d5dfc', '#ff6b9d', '#22d3c5'];
  // /85 here benchmarked at ~22fps-equivalent on a 1080x2280 canvas on
  // *desktop* Chromium (four Math.sin calls per cell, ~15k cells) —
  // real Android hardware would likely do worse. /30 keeps the same
  // interference-pattern look at a much cheaper cell count.
  const cell = Math.max(10, Math.round(Math.min(w, h) / 30));
  for (let y = 0; y < h; y += cell) {
    const ny = y / h;
    for (let x = 0; x < w; x += cell) {
      const nx = x / w;
      const v = Math.sin(nx * 10 + t * speed) + Math.sin(ny * 10 + t * speed * 0.8) +
        Math.sin((nx + ny) * 10 + t * speed * 1.3) + Math.sin(Math.sqrt(nx * nx + ny * ny) * 14 - t * speed * 1.6);
      const p = Math.max(0, Math.min(1, (v + 4) / 8));
      const idx = p * (list.length - 1);
      const i0 = Math.floor(idx), i1 = Math.min(list.length - 1, i0 + 1);
      ctx.fillStyle = wpLerpColor(list[i0], list[i1], idx - i0);
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/* Concentric rings expanding outward from a handful of centers, each
   ring fading as it grows — the "handful of centers" positions come
   from the same cheap deterministic hash as the starfield above. */
function wpDrawRipple(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#04101a';
  const ringColors = colors.length > 1 ? colors.slice(1) : colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
  const maxR = Math.max(w, h) * 0.7;
  const ringGap = maxR / 6;
  ringColors.forEach((color, ci) => {
    const s1 = Math.sin(ci * 43.11) * 10000; const rx = s1 - Math.floor(s1);
    const s2 = Math.sin(ci * 71.77) * 10000; const ry = s2 - Math.floor(s2);
    const cx = w * (0.25 + rx * 0.5), cy = h * (0.25 + ry * 0.5);
    for (let ring = 0; ring < 6; ring++) {
      const phase = (t * speed * 0.6 + ring / 6 + ci * 0.15) % 1;
      const r = phase * maxR;
      ctx.globalAlpha = Math.max(0, (1 - phase) * 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = ringGap * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* Voronoi cells: nearest-seed color per coarse grid cell (again a
   coarse grid rather than per pixel, for the same performance reason
   as the plasma pattern above). Seeds drift in slow small orbits so
   the cell boundaries shift gently instead of jumping. */
function wpDrawVoronoi(ctx, w, h, t, colors, speed) {
  const list = colors.length ? colors : ['#6d5dfc', '#ff6b9d', '#22d3c5'];
  const n = Math.min(7, Math.max(3, list.length));
  const seeds = [];
  for (let i = 0; i < n; i++) {
    const s1 = Math.sin(i * 91.345) * 10000; const rx = s1 - Math.floor(s1);
    const s2 = Math.sin(i * 37.719) * 10000; const ry = s2 - Math.floor(s2);
    const ang = t * speed * 0.15 + i;
    seeds.push({
      x: w * (0.15 + rx * 0.7 + Math.sin(ang) * 0.04),
      y: h * (0.15 + ry * 0.7 + Math.cos(ang * 1.3) * 0.04),
      color: list[i % list.length],
    });
  }
  // Benchmarked at ~73fps-equivalent on desktop Chromium with /60 (n
  // seed-distance checks per cell) — /28 gives real hardware more margin.
  const cell = Math.max(10, Math.round(Math.min(w, h) / 28));
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const dx = x - seeds[i].x, dy = y - seeds[i].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      ctx.fillStyle = seeds[best].color;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/* Mirrored radial symmetry: clip one wedge, fill it with the same
   drifting-blob content flowingMesh uses, mirror alternating wedges,
   then repeat around the circle via ctx.rotate — draws the "kaleidoscope
   tube" once per wedge rather than computing reflected geometry by hand. */
function wpDrawKaleidoscope(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#050110';
  const list = colors.length > 1 ? colors.slice(1) : colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const segments = 8;
  const wedgeAngle = (Math.PI * 2) / segments;
  const reach = Math.max(w, h);
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
  for (let s = 0; s < segments; s++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s * wedgeAngle);
    if (s % 2 === 1) ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, 0, wedgeAngle);
    ctx.closePath();
    ctx.clip();
    list.forEach((color, i) => {
      const r = reach * (0.18 + 0.12 * i + 0.05 * Math.sin(t * speed + i));
      const ang = t * speed * 0.4 + i;
      const bx = Math.cos(ang) * r * 0.5, by = Math.sin(ang) * r * 0.5;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, wpHexToRgba(color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
    });
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* "Clouds" via layered sine waves rather than true Perlin noise — value
   noise built from a fixed hash grid would need to be regenerated and
   stored to look continuous, which this can't do (see the wpMakeNoiseCanvas
   comment on why every wp* function stays state-free); layered sines are
   smooth and fully continuous in t on their own, so they drift for free. */
function wpDrawPerlinClouds(ctx, w, h, t, colors, speed) {
  const sky = colors[0] || '#0a1930';
  const cloud = colors.length > 1 ? colors[1] : '#ffffff';
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Benchmarked at ~29fps-equivalent on desktop Chromium with /70 (three
  // Math.sin/cos calls per cell) — /28 gives real hardware more margin.
  const cell = Math.max(10, Math.round(Math.min(w, h) / 28));
  ctx.fillStyle = cloud;
  for (let y = 0; y < h; y += cell) {
    const ny = y / h;
    for (let x = 0; x < w; x += cell) {
      const nx = x / w;
      const n1 = Math.sin(nx * 6 + t * speed * 0.15) * Math.cos(ny * 5 - t * speed * 0.1);
      const n2 = Math.sin((nx + ny) * 9 + t * speed * 0.25) * 0.5;
      const n3 = Math.sin(nx * 17 - ny * 13 + t * speed * 0.35) * 0.25;
      const v = (n1 + n2 + n3 + 1.75) / 3.5;
      const alpha = (v - 0.42) * 1.3;
      if (alpha > 0.02) {
        ctx.globalAlpha = Math.min(0.85, alpha);
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/* Blobs that rise from the bottom, drift sideways, and sink back near
   the top in a slow loop — a lava lamp's vertical cycle, distinct from
   flowingMesh's circular drift. The blur is applied to a box around
   each blob rather than the full canvas (ctx.filter cost scales with
   the filtered area, and only a small region actually needs it). */
function wpDrawLavaLamp(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#0a0505';
  const blobs = colors.length > 1 ? colors.slice(1) : colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
  blobs.forEach((color, i) => {
    const n = blobs.length;
    const cycle = (t * speed * 0.08 + i / n) % 1;
    const y = h * (1.1 - cycle * 1.2);
    const x = w * (0.2 + 0.6 * ((i * 0.53) % 1) + 0.08 * Math.sin(t * speed * 0.5 + i * 2));
    const r = Math.min(w, h) * (0.16 + 0.05 * Math.sin(t * speed + i));
    ctx.save();
    ctx.filter = 'blur(' + Math.round(Math.min(w, h) * 0.025) + 'px)';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, wpHexToRgba(color, 0));
    ctx.fillStyle = grad;
    const pad = r * 2;
    ctx.fillRect(x - pad, y - pad, pad * 2, pad * 2);
    ctx.restore();
  });
  ctx.globalCompositeOperation = 'source-over';
}

/* Moiré interference: two full-height line grids, rotating slowly at
   different rates around the same center, screen-blended so their
   overlap produces the classic shifting interference bands. */
function wpDrawMoire(ctx, w, h, t, colors, speed) {
  const bg = colors[0] || '#050505';
  const lineA = colors.length > 1 ? colors[1] : '#ffffff';
  const lineB = colors.length > 2 ? colors[2] : (colors[1] || '#ffffff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const diag = Math.sqrt(w * w + h * h);
  const spacing = Math.max(6, Math.round(Math.min(w, h) / 40));

  function drawGrid(angle, spacingMul, color, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.4;
    const sp = spacing * spacingMul;
    for (let x = -diag; x <= diag; x += sp) {
      ctx.beginPath();
      ctx.moveTo(x, -diag);
      ctx.lineTo(x, diag);
      ctx.stroke();
    }
    ctx.restore();
  }
  // A bigger angle delta (and a slightly different spacing) between the
  // two grids than a first pass used — near-identical grids barely beat
  // against each other at all; this is tuned to actually read as
  // interference bands rather than a single set of parallel lines.
  ctx.globalCompositeOperation = wpGlowOp(colors[0]);
  drawGrid(t * speed * 0.1, 1, lineA, 0.75);
  drawGrid(-t * speed * 0.13 + 0.5, 1.15, lineB, 0.75);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ==========================================================================
   Shared canvas effects — wallpaper, gradient and mesh
   ----------------------------------------------------------------
   Nothing here uses ctx.filter: Safari (so every iPad/iPhone) ignores it,
   which is why blurs and glows used to come out wrong or not at all on
   iPad. Blur is a downscale-then-upscale through a reusable offscreen
   buffer instead, which is also far cheaper per frame.
   ========================================================================== */

/* Reusable offscreen canvases, keyed by purpose, so a 60fps preview isn't
   allocating a fresh full-size canvas every frame. */
const WP_BUFS = {};
function wpBuf(name, w, h) {
  let c = WP_BUFS[name];
  if (!c) c = WP_BUFS[name] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
function wpCopyOf(name, src, w, h) {
  const c = wpBuf(name, w, h);
  const cx = c.getContext('2d');
  cx.globalCompositeOperation = 'copy';
  cx.drawImage(src, 0, 0, w, h);
  cx.globalCompositeOperation = 'source-over';
  return c;
}
/* Gaussian-ish blur: shrink by a factor tied to the radius, then scale
   back up with smoothing. radiusFrac is a fraction of the short side. */
function wpBlurred(name, src, w, h, radiusFrac) {
  const f = Math.max(2, Math.round(Math.min(w, h) * radiusFrac));
  const sw = Math.max(1, Math.round(w / f)), sh = Math.max(1, Math.round(h / f));
  const small = wpBuf(name + ':s', sw, sh);
  const sc = small.getContext('2d');
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = 'high';
  sc.globalCompositeOperation = 'copy';
  sc.drawImage(src, 0, 0, sw, sh);
  const out = wpBuf(name + ':o', w, h);
  const oc = out.getContext('2d');
  oc.imageSmoothingEnabled = true;
  oc.imageSmoothingQuality = 'high';
  oc.globalCompositeOperation = 'copy';
  oc.drawImage(small, 0, 0, w, h);
  return out;
}
/* drawImage with the source rectangle clamped to the image — older
   Safari draws nothing at all when any part of the source rect falls
   outside the image, instead of clipping like the spec says. */
function wpDrawSub(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  const iw = img.width, ih = img.height;
  const kx = dw / sw, ky = dh / sh;
  if (sx < 0) { dx -= sx * kx; dw += sx * kx; sw += sx; sx = 0; }
  if (sy < 0) { dy -= sy * ky; dh += sy * ky; sh += sy; sy = 0; }
  if (sx + sw > iw) { const o = sx + sw - iw; sw -= o; dw -= o * kx; }
  if (sy + sh > ih) { const o = sy + sh - ih; sh -= o; dh -= o * ky; }
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
function wpRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Film grain from four pre-made noise tiles cycled over time (so grain
   shimmers like film in a live wallpaper), scaled up on large canvases
   so the grain stays visible instead of dissolving at 3× pixel ratio. */
let WP_NOISE_TILES = null;
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
function wpGrain(ctx, w, h, amount, t) {
  if (!(amount > 0)) return;
  if (!WP_NOISE_TILES) WP_NOISE_TILES = [0, 1, 2, 3].map(() => wpMakeNoiseCanvas(160));
  // t can be negative (the seamless-loop crossfade renders frames from
  // just before the start), so wrap the index into 0–3 either way.
  const frame = Number.isFinite(t) ? Math.floor(t * 12) : 0;
  const tile = WP_NOISE_TILES[((frame % 4) + 4) % 4];
  const pattern = ctx.createPattern(tile, 'repeat');
  const scale = Math.max(1, Math.min(w, h) / 700);
  if (scale > 1 && pattern.setTransform && typeof DOMMatrix !== 'undefined') pattern.setTransform(new DOMMatrix().scale(scale));
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(0.7, amount);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
function wpVignette(ctx, w, h, amount) {
  if (!(amount > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const r = Math.max(w, h) * 0.75;
  const grad = ctx.createRadialGradient(w / 2, h / 2, r * (1 - amount * 0.55), w / 2, h / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, amount)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
function wpGlow(ctx, w, h, amount) {
  if (!(amount > 0)) return;
  const b = wpBlurred('glow', ctx.canvas, w, h, 0.02 + 0.04 * amount);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(1, amount);
  ctx.drawImage(b, 0, 0, w, h);
  ctx.restore();
}

/* ---- glass: frosted panes, fluted/reeded, liquid drops, prism light ----
   Each works on whatever is already on ctx (it copies it first), so the
   same functions serve as wallpaper styles (over a moving color field)
   and as effects over a gradient or mesh. p holds 0–1 knobs. */
function wpIsLightHex(hex) {
  const { r, g, b } = hexToRgb(hex || '#000000');
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}
function wpGlassPanes(ctx, w, h, T, p, rnd, amount) {
  const m = Math.min(w, h);
  const base = wpCopyOf('panes', ctx.canvas, w, h);
  const blurred = wpBlurred('panesBlur', base, w, h, 0.015 + 0.05 * p.softness);
  const n = 2 + Math.round(p.density * 4);
  for (let i = 0; i < n; i++) {
    const pw = m * (0.32 + 0.4 * p.size) * (0.7 + 0.6 * rnd(i * 7 + 1));
    const ph = pw * (0.6 + 0.9 * rnd(i * 7 + 2));
    const cx = w * (0.12 + 0.76 * rnd(i * 7 + 3)) + Math.sin(T * 0.25 + i) * m * 0.05;
    const cy = h * (0.1 + 0.8 * rnd(i * 7 + 4)) + Math.cos(T * 0.2 + i * 1.7) * m * 0.05;
    const rot = (rnd(i * 7 + 5) - 0.5) * 0.7 + Math.sin(T * 0.1 + i) * 0.05;
    const r = Math.min(pw, ph) * 0.16;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.shadowColor = `rgba(0,0,0,${0.18 + 0.15 * amount})`;
    ctx.shadowBlur = m * 0.045;
    ctx.shadowOffsetY = m * 0.018;
    wpRoundRect(ctx, -pw / 2, -ph / 2, pw, ph, r);
    // Opaque fill only to cast the shadow — the inside is fully repainted
    // below (a near-transparent fill would cast a near-invisible shadow).
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.rotate(-rot);
    ctx.translate(-cx, -cy);
    ctx.drawImage(base, 0, 0, w, h);
    ctx.globalAlpha = 0.55 + 0.45 * amount;
    ctx.drawImage(blurred, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.1 * amount})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    wpRoundRect(ctx, -pw / 2, -ph / 2, pw, ph, r);
    const g = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, m * 0.003);
    ctx.stroke();
    ctx.restore();
  }
}
function wpFlutedGlass(ctx, w, h, p, amount) {
  const base = wpCopyOf('fluted', ctx.canvas, w, h);
  const rw = Math.max(4, w * (0.02 + 0.07 * p.size));
  const squeeze = 1.5 + 2.5 * p.depth;
  ctx.save();
  for (let x = 0; x < w; x += rw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, rw + 0.5, h);
    ctx.clip();
    // Each rib shows a squeezed, mirrored slice of what's behind it.
    ctx.translate(x + rw, 0);
    ctx.scale(-1, 1);
    const sx = x + rw / 2 - (rw * squeeze) / 2;
    ctx.globalAlpha = 0.5 + 0.5 * amount;
    wpDrawSub(ctx, base, sx, 0, rw * squeeze, h, 0, 0, rw, h);
    ctx.restore();
    const g = ctx.createLinearGradient(x, 0, x + rw, 0);
    g.addColorStop(0, `rgba(0,0,0,${0.16 * amount})`);
    g.addColorStop(0.3, `rgba(255,255,255,${0.16 * amount})`);
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.12 * amount})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rw + 0.5, h);
  }
  ctx.restore();
}
function wpLiquidDrops(ctx, w, h, T, p, rnd, amount) {
  const m = Math.min(w, h);
  const base = wpCopyOf('drops', ctx.canvas, w, h);
  const n = 3 + Math.round(p.density * 6);
  const k = 1.3 + 0.5 * p.depth;
  for (let i = 0; i < n; i++) {
    const r = m * (0.07 + 0.14 * p.size) * (0.6 + 0.8 * rnd(i * 5 + 1));
    const cx = w * (0.5 + 0.4 * Math.sin(T * 0.21 * (0.6 + rnd(i * 5 + 2)) + rnd(i * 5 + 3) * 6.28));
    const cy = h * (0.5 + 0.42 * Math.cos(T * 0.17 * (0.6 + rnd(i * 5 + 4)) + i * 1.3));
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.2 * amount})`;
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.drawImage(base, 0, 0, w, h);
    wpDrawSub(ctx, base, cx - r / k, cy - r / k, (2 * r) / k, (2 * r) / k, cx - r, cy - r, 2 * r, 2 * r);
    const edge = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, `rgba(0,0,0,${0.28 * amount})`);
    ctx.fillStyle = edge;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.restore();
    const hx = cx - r * 0.35, hy = cy - r * 0.42;
    const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
    hl.addColorStop(0, `rgba(255,255,255,${0.55 * amount + 0.15})`);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.2 + 0.25 * amount})`;
    ctx.lineWidth = Math.max(1, m * 0.0025);
    ctx.stroke();
  }
}
function wpPrismBeams(ctx, w, h, T, p, amount) {
  const m = Math.min(w, h);
  const buf = wpBuf('prism', w, h);
  const bc = buf.getContext('2d');
  bc.clearRect(0, 0, w, h);
  const ox = w * (0.3 + 0.05 * Math.sin(T * 0.2)), oy = h * (0.42 + 0.04 * Math.cos(T * 0.17));
  const base = (p.angle * 360 - 20 + Math.sin(T * 0.15) * 6) * Math.PI / 180;
  const spread = (14 + 40 * p.size) * Math.PI / 180;
  const far = Math.hypot(w, h) * 1.2;
  bc.globalCompositeOperation = 'lighter';
  // incoming white beam
  bc.fillStyle = 'rgba(255,255,255,0.35)';
  bc.beginPath();
  bc.moveTo(ox, oy);
  bc.lineTo(ox - far * Math.cos(base - 0.35), oy - far * Math.sin(base - 0.35) - m * 0.02);
  bc.lineTo(ox - far * Math.cos(base - 0.35), oy - far * Math.sin(base - 0.35) + m * 0.02);
  bc.closePath();
  bc.fill();
  // outgoing spectrum fan
  const bands = 7;
  for (let k = 0; k < bands; k++) {
    const a0 = base + (k / bands - 0.5) * spread, a1 = base + ((k + 1) / bands - 0.5) * spread;
    bc.fillStyle = `hsla(${k * 45}, 100%, 62%, 0.65)`;
    bc.beginPath();
    bc.moveTo(ox, oy);
    bc.lineTo(ox + far * Math.cos(a0), oy + far * Math.sin(a0));
    bc.lineTo(ox + far * Math.cos(a1), oy + far * Math.sin(a1));
    bc.closePath();
    bc.fill();
  }
  const soft = wpBlurred('prismBlur', buf, w, h, 0.006 + 0.03 * p.softness);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35 + 0.55 * amount;
  ctx.drawImage(soft, 0, 0, w, h);
  ctx.restore();
  // the prism itself
  const s = m * 0.09;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(base + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.87, s * 0.5);
  ctx.lineTo(-s * 0.87, s * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, m * 0.003);
  ctx.stroke();
  ctx.restore();
}
/* Glass as a finishing effect (Gradient/Mesh studios and the wallpaper
   Effects card): type + strength, with sensible fixed knobs. */
function wpApplyGlass(ctx, w, h, type, amount, T, seed) {
  if (!type || type === 'none' || !(amount > 0)) return;
  const rnd = wpHashFn(seed || 'glass');
  const p = { density: 0.45, size: 0.5, softness: 0.55, depth: 0.5, angle: 0.08, thickness: 0.5 };
  if (type === 'frosted') wpGlassPanes(ctx, w, h, T || 0, p, rnd, amount);
  else if (type === 'fluted') wpFlutedGlass(ctx, w, h, p, amount);
  else if (type === 'liquid') wpLiquidDrops(ctx, w, h, T || 0, p, rnd, amount);
  else if (type === 'prism') wpPrismBeams(ctx, w, h, T || 0, p, amount);
}

/* Post-processing on a finished frame. Order: glass (reshapes the image),
   glow (adds light), duotone (remaps tones), then the surface layers —
   vignette and grain last so they sit on top as texture. */
function wpApplyEffects(ctx, w, h, effects, t) {
  if (!effects) return;
  wpApplyGlass(ctx, w, h, effects.glass, effects.glassAmount ?? 0.7, t, 'fx');
  wpGlow(ctx, w, h, effects.glow || 0);
  const duotone = effects.duotone;
  if (duotone && duotone.shadow && duotone.highlight) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'color';
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, duotone.shadow);
    grad.addColorStop(1, duotone.highlight);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  wpVignette(ctx, w, h, effects.vignette || 0);
  wpGrain(ctx, w, h, effects.grain || 0, t);
}

function wpHexToHsl(hex) { return hexToHsl(hex); }
function wpHslToHex(h, s, l) { return hslToHex(h, s, l); }
/* A day-cycle warmth curve: warm near dawn and dusk, cool at midday,
   coolest at night. Uses today's real sunrise/sunset once the location
   has been shared (window.wpSunTimes), otherwise a fixed hour curve. */
function wpGetTimeOfDayTemperature() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (typeof window !== 'undefined' && window.wpSunTimes) {
    const { sunrise, sunset } = window.wpSunTimes;
    if (hour >= sunrise - 0.5 && hour < sunrise + 1) return 30 - ((hour - (sunrise - 0.5)) / 1.5) * 45;
    if (hour >= sunrise + 1 && hour < sunset - 1) return -15;
    if (hour >= sunset - 1 && hour < sunset + 0.5) return -15 + ((hour - (sunset - 1)) / 1.5) * 45;
    return 10;
  }
  if (hour >= 5 && hour < 8) return 30 + (hour - 5) * 3;
  if (hour >= 8 && hour < 11) return 20 - (hour - 8) * 10;
  if (hour >= 11 && hour < 15) return -15;
  if (hour >= 15 && hour < 18) return -15 + (hour - 15) * 15;
  if (hour >= 18 && hour < 21) return 30 + (hour - 18) * 3;
  if (hour >= 21 || hour < 2) return 10;
  return -25;
}
function wpApplyTimeOfDayTint(colors) {
  const temp = wpGetTimeOfDayTemperature();
  const targetHue = temp > 0 ? 35 : 215;
  const strength = Math.min(1, Math.abs(temp) / 40) * 0.45;
  return colors.map(c => {
    const { h, s, l } = wpHexToHsl(c);
    let dh = targetHue - h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    const newHue = (h + dh * strength + 360) % 360;
    return wpHslToHex(newHue, s, l);
  });
}
/* Simplified NOAA solar-calculator equations — accurate to a few
   minutes, no network call. Only used for the time-of-day tint. */
function wpComputeSunTimes(lat, lon, date) {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const fy = (2 * Math.PI / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(fy) - 0.032077 * Math.sin(fy)
    - 0.014615 * Math.cos(2 * fy) - 0.040849 * Math.sin(2 * fy));
  const decl = 0.006918 - 0.399912 * Math.cos(fy) + 0.070257 * Math.sin(fy)
    - 0.006758 * Math.cos(2 * fy) + 0.000907 * Math.sin(2 * fy)
    - 0.002697 * Math.cos(3 * fy) + 0.00148 * Math.sin(3 * fy);
  const latRad = lat * rad;
  const cosH = (Math.cos(90.833 * rad) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
  const haDeg = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
  const solarNoon = (720 - 4 * lon - eqTime) / 1440;
  const tzOffsetHours = -date.getTimezoneOffset() / 60;
  return {
    sunrise: (solarNoon - (haDeg * 4) / 1440) * 24 + tzOffsetHours,
    sunset: (solarNoon + (haDeg * 4) / 1440) * 24 + tzOffsetHours,
  };
}

/* True-black/AMOLED export: crushes near-black pixels to pure #000 so an
   OLED screen can switch them off. Image exports only — too expensive
   to run on every video frame. */
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

/* ==========================================================================
   Gradient & Mesh effects — glass, grain, vignette, glow
   ----------------------------------------------------------------
   Same effect code as the wallpaper studio. The live preview stays a CSS
   gradient (instant, and it's what "Copy CSS" gives you); only when an
   effect is on does a canvas layer paint the effected version on top,
   exactly what the PNG export will contain.
   ========================================================================== */
var studioFxFrame = {};
function studioFxActive(fx) {
  return !!fx && ((fx.glass && fx.glass !== 'none') || fx.grain > 0 || fx.vignette > 0 || fx.glow > 0);
}
function paintStudioFx(studio, canvas, host) {
  const state = studio === 'gradient' ? gradientState : meshState;
  const r = host.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  if (studio === 'gradient') drawGradientToCanvas(ctx, w, h, state);
  else drawMeshToCanvas(ctx, w, h, state);
  wpApplyEffects(ctx, w, h, state.fx, 0);
}
function scheduleStudioFx(studio) {
  if (studioFxFrame[studio]) return;
  studioFxFrame[studio] = requestAnimationFrame(() => {
    studioFxFrame[studio] = 0;
    const host = document.getElementById(studio === 'gradient' ? 'gradientPreview' : 'meshPreview');
    const state = studio === 'gradient' ? gradientState : meshState;
    let c = host.querySelector(':scope > canvas.fx-layer');
    if (!studioFxActive(state.fx)) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('canvas'); c.className = 'fx-layer'; host.prepend(c); }
    paintStudioFx(studio, c, host);
  });
}
function mountFxCard(studio) {
  const card = document.querySelector(`.fx-card[data-fx="${studio}"]`);
  if (!card) return;
  const P = studio + 'Fx';
  card.innerHTML = `
    <label class="control-label">Effects</label>
    <div class="wp-field">
      <span class="wp-save-label">Glass</span>
      <select id="${P}Glass" class="select">
        <option value="none">None</option><option value="frosted">Frosted panes</option><option value="fluted">Fluted glass</option>
        <option value="liquid">Liquid drops</option><option value="prism">Prism light</option>
      </select>
    </div>
    <div class="wp-param" id="${P}GlassAmountRow" hidden>
      <label class="control-label-row wp-param-label" for="${P}GlassAmount"><span>Glass strength</span><span class="control-value" id="${P}GlassAmountValue">70%</span></label>
      <input type="range" id="${P}GlassAmount" class="slider" min="10" max="100" value="70">
    </div>
    ${['grain', 'vignette', 'glow'].map(k => `
    <div class="wp-param">
      <label class="control-label-row wp-param-label" for="${P}${k}"><span>${k[0].toUpperCase() + k.slice(1)}</span><span class="control-value" id="${P}${k}Value">0%</span></label>
      <input type="range" id="${P}${k}" class="slider" min="0" max="100" value="0">
    </div>`).join('')}
    <p class="hint">Shown in the preview and PNG. A little grain also stops color banding.</p>`;
  const getState = () => (studio === 'gradient' ? gradientState : meshState);
  const rerender = () => (studio === 'gradient' ? renderGradientPreview() : renderMeshPreview());
  const ensure = () => { const st = getState(); st.fx = Object.assign({ glass: 'none', glassAmount: 0.7, grain: 0, vignette: 0, glow: 0 }, st.fx || {}); return st.fx; };
  document.getElementById(`${P}Glass`).addEventListener('change', (e) => {
    ensure().glass = e.target.value;
    document.getElementById(`${P}GlassAmountRow`).hidden = e.target.value === 'none';
    rerender();
  });
  document.getElementById(`${P}GlassAmount`).addEventListener('input', (e) => {
    ensure().glassAmount = Number(e.target.value) / 100;
    document.getElementById(`${P}GlassAmountValue`).textContent = `${e.target.value}%`;
    rerender();
  });
  ['grain', 'vignette', 'glow'].forEach(k => {
    document.getElementById(`${P}${k}`).addEventListener('input', (e) => {
      ensure()[k] = Number(e.target.value) / 100;
      document.getElementById(`${P}${k}Value`).textContent = `${e.target.value}%`;
      rerender();
    });
  });
}
function syncFxCard(studio) {
  const P = studio + 'Fx';
  const el = document.getElementById(`${P}Glass`);
  if (!el) return;
  const fx = Object.assign({ glass: 'none', glassAmount: 0.7, grain: 0, vignette: 0, glow: 0 }, (studio === 'gradient' ? gradientState : meshState).fx || {});
  el.value = fx.glass;
  document.getElementById(`${P}GlassAmountRow`).hidden = fx.glass === 'none';
  document.getElementById(`${P}GlassAmount`).value = Math.round(fx.glassAmount * 100);
  document.getElementById(`${P}GlassAmountValue`).textContent = `${Math.round(fx.glassAmount * 100)}%`;
  ['grain', 'vignette', 'glow'].forEach(k => {
    const v = Math.round((fx[k] || 0) * 100);
    document.getElementById(`${P}${k}`).value = v;
    document.getElementById(`${P}${k}Value`).textContent = `${v}%`;
  });
}
mountFxCard('gradient');
mountFxCard('mesh');
if (window.ResizeObserver) {
  const ro = new ResizeObserver((entries) => entries.forEach(en => scheduleStudioFx(en.target.id === 'gradientPreview' ? 'gradient' : 'mesh')));
  ro.observe(document.getElementById('gradientPreview'));
  ro.observe(document.getElementById('meshPreview'));
}

/* ==========================================================================
   Wallpaper styles (2026)
   ----------------------------------------------------------------
   Every style is a pure function of time: draw(ctx, w, h, T, colors, p,
   rnd), where T is seconds × speed, p holds the style's 0–1 knobs
   (density, size, softness, angle, thickness, depth) and rnd(i) is a
   seeded hash — so a layout is reproducible from its seed, "Layout"
   shuffles only change the seed, and any frame can be re-rendered at any
   size for exports and the seamless video loop. colors[0] is always the
   background; the rest are the foreground palette.
   ========================================================================== */
function wpHashFn(seed) {
  const s = seedToInt(String(seed || 'gradii'));
  return (i) => {
    let x = Math.imul((i | 0) ^ s, 0x9e3779b1);
    x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
}
function wpFg(C) { return C.length > 1 ? C.slice(1) : C; }
function wpShade(hex, amt) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, clamp(l + amt * 100, 0, 100));
}
/* Additive glows vanish on a light background (screen on near-white is
   white), so light backgrounds switch to multiply, which darkens into
   the color instead. */
function wpGlowOp(bg) { return wpIsLightHex(bg) ? 'multiply' : 'screen'; }
function wpEase(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
function wpPaletteAt(C, u) {
  const fg = wpFg(C);
  if (fg.length === 1) return fg[0];
  const x = clamp(u, 0, 1) * (fg.length - 1);
  const i = Math.min(fg.length - 2, Math.floor(x));
  return wpLerpColor(fg[i], fg[i + 1], x - i);
}
/* The soft, drifting color field the glass styles sit on. */
function wpColorField(ctx, w, h, T, C, rnd) {
  const bg = C[0];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = wpGlowOp(bg);
  const fg = wpFg(C);
  const m = Math.max(w, h);
  fg.forEach((c, i) => {
    const ph = rnd(i * 3 + 11) * 6.283;
    const cx = w * (0.5 + 0.38 * Math.sin(T * 0.23 + ph));
    const cy = h * (0.5 + 0.38 * Math.cos(T * 0.19 + ph * 1.4));
    const r = m * (0.42 + 0.1 * Math.sin(T * 0.3 + i));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, c);
    g.addColorStop(1, wpHexToRgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalCompositeOperation = 'source-over';
}

/* ---- Glass ---- */
function wpStyleFrostedGlass(ctx, w, h, T, C, p, rnd) {
  wpColorField(ctx, w, h, T, C, rnd);
  wpGlassPanes(ctx, w, h, T, p, rnd, 1);
}
function wpStyleLiquidGlass(ctx, w, h, T, C, p, rnd) {
  wpColorField(ctx, w, h, T, C, rnd);
  wpLiquidDrops(ctx, w, h, T, p, rnd, 1);
}
function wpStyleFlutedGlass(ctx, w, h, T, C, p, rnd) {
  wpColorField(ctx, w, h, T * 1.6, C, rnd);
  wpFlutedGlass(ctx, w, h, p, 1);
}
function wpStylePrismLight(ctx, w, h, T, C, p, rnd) {
  const bg = C[0];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, wpShade(bg, -0.04));
  g.addColorStop(1, wpShade(bg, 0.06));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.55;
  ctx.globalCompositeOperation = wpGlowOp(bg);
  wpFg(C).forEach((c, i) => {
    const cx = w * (0.2 + 0.6 * rnd(i + 3)) + Math.sin(T * 0.2 + i) * w * 0.1;
    const cy = h * (0.2 + 0.6 * rnd(i + 9));
    const r = Math.max(w, h) * 0.45;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, c);
    rg.addColorStop(1, wpHexToRgba(c, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  wpPrismBeams(ctx, w, h, T, p, 1);
}

/* ---- Abstract ---- */
function wpStyleSilk(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const n = 3 + Math.round(p.density * 5);
  const diag = Math.hypot(w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((p.angle - 0.5) * Math.PI * 0.9);
  const W = diag, H = diag;
  const band = (H / n) * (1.3 + p.size);
  for (let i = 0; i < n; i++) {
    const color = wpFg(C)[i % wpFg(C).length];
    const y0 = -H / 2 + (i + 0.3) * (H / n);
    const f = 1.2 + rnd(i * 4 + 1) * 1.6, ph = rnd(i * 4 + 2) * 6.28, A = band * 0.45;
    const top = [], bot = [];
    for (let s = 0; s <= 48; s++) {
      const x = -W / 2 + (W * s) / 48;
      const u = s / 48;
      const y = y0 + A * Math.sin(u * 6.283 * f + T * 0.35 + ph) + A * 0.4 * Math.sin(u * 6.283 * 2.3 - T * 0.22 + ph);
      top.push([x, y]);
      bot.push([x, y + band * (0.75 + 0.25 * Math.sin(u * 6.283 * 1.3 + T * 0.3 + i))]);
    }
    ctx.beginPath();
    top.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let k = bot.length - 1; k >= 0; k--) ctx.lineTo(bot[k][0], bot[k][1]);
    ctx.closePath();
    const lg = ctx.createLinearGradient(0, y0 - A, 0, y0 + band + A);
    lg.addColorStop(0, wpShade(color, 0.22));
    lg.addColorStop(0.35, color);
    lg.addColorStop(0.7, wpShade(color, -0.12));
    lg.addColorStop(1, wpShade(color, -0.3));
    ctx.shadowColor = `rgba(0,0,0,${0.15 + 0.3 * p.depth})`;
    ctx.shadowBlur = m * 0.04;
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, m * 0.002);
    ctx.beginPath();
    top.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + 2) : ctx.moveTo(x, y + 2)));
    ctx.stroke();
  }
  ctx.restore();
}
function wpStyleInk(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = wpGlowOp(C[0]);
  const fg = wpFg(C);
  const n = 10 + Math.round(p.density * 28);
  for (let i = 0; i < n; i++) {
    const c = fg[i % fg.length];
    const a = rnd(i * 6 + 1) * 6.283, sp = 0.5 + rnd(i * 6 + 2);
    const cx = w * (0.5 + 0.36 * Math.sin(T * 0.07 * sp + a) + 0.12 * Math.sin(T * 0.19 + i));
    const cy = h * (0.5 + 0.36 * Math.cos(T * 0.06 * sp + a * 1.3) + 0.12 * Math.cos(T * 0.23 + i * 0.7));
    const r = m * (0.05 + 0.2 * p.size) * (0.5 + rnd(i * 6 + 3));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + T * 0.05 * (rnd(i * 6 + 4) - 0.5) * 4);
    ctx.scale(1.9, 0.65 + 0.3 * p.softness);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, wpHexToRgba(c, 0.42));
    g.addColorStop(0.55, wpHexToRgba(c, 0.18));
    g.addColorStop(1, wpHexToRgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = Math.max(1, m * 0.002);
  for (let j = 0; j < 8; j++) {
    const c = fg[j % fg.length];
    ctx.strokeStyle = wpHexToRgba(c, 0.18);
    ctx.beginPath();
    const x0 = w * rnd(j * 9 + 50), y0 = h * rnd(j * 9 + 51);
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(
      x0 + Math.sin(T * 0.1 + j) * w * 0.4, y0 + h * 0.2,
      w * rnd(j * 9 + 52) + Math.cos(T * 0.12 + j) * w * 0.2, h * rnd(j * 9 + 53),
      w * rnd(j * 9 + 54), h * rnd(j * 9 + 55));
    ctx.stroke();
  }
}
function wpStylePaperLayers(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const n = 4 + Math.round(p.density * 6);
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const color = wpPaletteAt(C, u);
    const yBase = h * (0.12 + 0.86 * (i + 1) / (n + 0.4));
    const A = h * 0.035 * (0.5 + p.size * 1.5);
    const f = 1 + rnd(i * 3 + 1) * 1.5, ph = rnd(i * 3 + 2) * 6.28, dir = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let s = 0; s <= 40; s++) {
      const x = (w * s) / 40, v = s / 40;
      ctx.lineTo(x, yBase + A * Math.sin(v * 6.283 * f + T * 0.25 * dir + ph) + A * 0.45 * Math.sin(v * 6.283 * 2.7 - T * 0.18 + ph));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.shadowColor = `rgba(0,0,0,${0.12 + 0.35 * p.depth})`;
    ctx.shadowBlur = m * (0.01 + 0.04 * p.depth);
    ctx.shadowOffsetY = -m * 0.006;
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.shadowColor = 'transparent';
}
function wpStyleBauhaus(ctx, w, h, T, C, p, rnd) {
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  const cols = 3 + Math.round(p.density * 5);
  const s = w / cols;
  const rows = Math.ceil(h / s);
  const pad = s * 0.06 * (1 - p.size);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = i * s, y = j * s;
      const c1 = fg[Math.floor(rnd(k * 5 + 1) * fg.length)];
      const c2 = fg[Math.floor(rnd(k * 5 + 2) * fg.length)] === c1 ? C[0] : fg[Math.floor(rnd(k * 5 + 2) * fg.length)];
      if (rnd(k * 5 + 3) < 0.3) { ctx.fillStyle = c2; ctx.fillRect(x, y, s, s); }
      const phase = T * 0.22 + rnd(k * 5 + 4) * 5;
      const turn = Math.floor(rnd(k * 5) * 4) + Math.floor(phase) + wpEase(((phase % 1) - 0.78) / 0.22);
      ctx.save();
      ctx.translate(x + s / 2, y + s / 2);
      ctx.rotate(turn * Math.PI / 2);
      const r = s / 2 - pad;
      ctx.fillStyle = c1;
      ctx.beginPath();
      switch (Math.floor(rnd(k * 5 + 7) * 6)) {
        case 0: ctx.arc(0, 0, r, 0, 6.283); break;
        case 1: ctx.moveTo(-r, r); ctx.arc(0, r, r, Math.PI, 0); break;
        case 2: ctx.moveTo(-r, -r); ctx.arc(-r, -r, r * 2, 0, Math.PI / 2); break;
        case 3: ctx.rect(-r, -r, r * 2, r * 0.55); ctx.rect(-r, r * 0.45, r * 2, r * 0.55); break;
        case 4: ctx.moveTo(-r, r); ctx.lineTo(r, r); ctx.lineTo(-r, -r); break;
        default: ctx.rect(-r, -r, r * 2, r * 2); ctx.fill(); ctx.fillStyle = c2 === c1 ? C[0] : c2; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 6.283);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
function wpStyleOrbs(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, wpShade(C[0], 0.05));
  g.addColorStop(1, wpShade(C[0], -0.05));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  const n = 4 + Math.round(p.density * 10);
  const orbs = [];
  for (let i = 0; i < n; i++) {
    const r = m * (0.04 + 0.14 * p.size) * (0.45 + rnd(i * 4 + 1));
    const cx = w * (0.5 + 0.42 * Math.sin(T * 0.12 * (0.5 + rnd(i * 4 + 2)) + rnd(i * 4 + 3) * 6.28));
    const cy = h * (0.5 + 0.42 * Math.cos(T * 0.1 * (0.5 + rnd(i * 4)) + i * 1.9));
    orbs.push({ r, cx, cy, c: fg[i % fg.length] });
  }
  orbs.sort((a, b) => a.r - b.r).forEach(o => {
    const sh = ctx.createRadialGradient(o.cx, o.cy + o.r * (0.9 + p.depth * 0.6), 0, o.cx, o.cy + o.r * (0.9 + p.depth * 0.6), o.r * 1.1);
    sh.addColorStop(0, `rgba(0,0,0,${0.18 + 0.2 * p.depth})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(o.cx - o.r * 1.2, o.cy, o.r * 2.4, o.r * 2.4);
    const body = ctx.createRadialGradient(o.cx - o.r * 0.35, o.cy - o.r * 0.4, o.r * 0.05, o.cx, o.cy, o.r);
    body.addColorStop(0, wpShade(o.c, 0.3));
    body.addColorStop(0.5, o.c);
    body.addColorStop(1, wpShade(o.c, -0.35));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(o.cx, o.cy, o.r, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(o.cx - o.r * 0.38, o.cy - o.r * 0.45, o.r * 0.22, o.r * 0.12, -0.6, 0, 6.283);
    ctx.fill();
  });
}
function wpStyleHolo(ctx, w, h, T, C, p) {
  const ang = p.angle * Math.PI;
  const dx = Math.cos(ang) * w, dy = Math.sin(ang) * h;
  const base = ctx.createLinearGradient(w / 2 - dx / 2, h / 2 - dy / 2, w / 2 + dx / 2, h / 2 + dy / 2);
  C.forEach((c, i) => base.addColorStop(i / Math.max(1, C.length - 1), c));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 3; k++) {
    const a = ang + (k * 40 + Math.sin(T * 0.2 + k) * 25) * Math.PI / 180;
    const cx = w / 2, cy = h / 2, L = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    const h0 = (T * 25 + k * 70) % 360;
    for (let s = 0; s <= 6; s++) g.addColorStop(s / 6, `hsl(${(h0 + s * 60) % 360}, 90%, 65%)`);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const off = ((T * 0.15) % 1.6) - 0.3;
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(clamp(off - 0.12, 0, 1), 'rgba(255,255,255,0)');
  sheen.addColorStop(clamp(off, 0, 1), 'rgba(255,255,255,0.55)');
  sheen.addColorStop(clamp(off + 0.12, 0, 1), 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  // fine crinkle lines, like foil
  ctx.globalAlpha = 0.12 + 0.2 * p.density;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(3, Math.min(w, h) / 90);
  for (let x = -h; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x + h * 0.6, h); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
function wpStyleTopo(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const step = m / (34 + p.density * 36);
  const cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
  const sc = (2.2 + 3 * (1 - p.size)) / m;
  const ph1 = rnd(1) * 6.28, ph2 = rnd(2) * 6.28, ph3 = rnd(3) * 6.28;
  const v = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * step, y = j * step;
      v[j * cols + i] = Math.sin(x * sc + T * 0.12 + ph1) * Math.cos(y * sc * 0.9 - T * 0.09)
        + 0.6 * Math.sin((x + y) * sc * 0.7 + ph2 + T * 0.1)
        + 0.4 * Math.cos(x * sc * 1.6 - y * sc * 1.1 + ph3);
    }
  }
  const L = 7 + Math.round(p.density * 9);
  ctx.lineWidth = Math.max(1, m * (0.002 + 0.007 * p.thickness));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let l = 0; l < L; l++) {
    const th = -1.7 + (3.4 * (l + 0.5)) / L;
    ctx.strokeStyle = wpPaletteAt(C, l / Math.max(1, L - 1));
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = v[j * cols + i], b = v[j * cols + i + 1], c = v[(j + 1) * cols + i + 1], d = v[(j + 1) * cols + i];
        const idx = (a > th ? 8 : 0) | (b > th ? 4 : 0) | (c > th ? 2 : 0) | (d > th ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * step, y = j * step;
        const top = [x + step * (th - a) / (b - a), y];
        const right = [x + step, y + step * (th - b) / (c - b)];
        const bottom = [x + step * (th - d) / (c - d), y + step];
        const left = [x, y + step * (th - a) / (d - a)];
        const seg = (P, Q) => { ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); };
        switch (idx) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 5: seg(left, top); seg(bottom, right); break;
          case 10: seg(top, right); seg(left, bottom); break;
        }
      }
    }
    ctx.stroke();
  }
}
function wpStyleGrainyPoster(ctx, w, h, T, C, p, rnd) {
  const m = Math.max(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  fg.forEach((c, i) => {
    const cx = w * (0.2 + 0.6 * rnd(i * 3 + 1)) + Math.sin(T * 0.18 + i * 2) * w * 0.12;
    const cy = h * (0.2 + 0.6 * rnd(i * 3 + 2)) + Math.cos(T * 0.15 + i) * h * 0.1;
    const r = m * (0.25 + 0.3 * p.size) * (0.7 + 0.5 * rnd(i * 3 + 3));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, c);
    g.addColorStop(0.45 * (1 - p.softness) + 0.1, wpHexToRgba(c, 0.85));
    g.addColorStop(1, wpHexToRgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  wpGrain(ctx, w, h, 0.3 + 0.5 * p.density, T);
}

/* ---- Patterns ---- */
function wpStyleTruchet(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const c = m / (4 + p.density * 10);
  const cols = Math.ceil(w / c), rows = Math.ceil(h / c);
  const lg = ctx.createLinearGradient(0, 0, w, h);
  wpFg(C).forEach((col, i, arr) => lg.addColorStop(arr.length > 1 ? i / (arr.length - 1) : 0, col));
  ctx.strokeStyle = lg;
  ctx.lineWidth = c * (0.08 + 0.3 * p.thickness);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const phase = T * 0.2 + rnd(k + 999) * 5;
      const turn = (rnd(k) < 0.5 ? 0 : 1) + Math.floor(phase) + wpEase(((phase % 1) - 0.85) / 0.15);
      ctx.save();
      ctx.translate(i * c + c / 2, j * c + c / 2);
      ctx.rotate(turn * Math.PI / 2);
      ctx.moveTo(0, -c / 2);
      ctx.arc(-c / 2, -c / 2, c / 2, 0, Math.PI / 2);
      ctx.moveTo(0, c / 2);
      ctx.arc(c / 2, c / 2, c / 2, Math.PI, Math.PI * 1.5);
      ctx.restore();
    }
  }
  ctx.stroke();
}
function wpStyleHalftone(ctx, w, h, T, C, p) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const s = m / (16 + p.density * 36);
  const R = Math.hypot(w, h) / 2;
  const bins = 6;
  const paths = Array.from({ length: bins }, () => []);
  const ang = p.angle * Math.PI / 2;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let gy = -R; gy < R; gy += s) {
    for (let gx = -R; gx < R; gx += s) {
      const x = w / 2 + gx * ca - gy * sa, y = h / 2 + gx * sa + gy * ca;
      if (x < -s || y < -s || x > w + s || y > h + s) continue;
      const d = Math.hypot(x - w / 2, y - h * 0.4) / R;
      const v = 0.5 + 0.5 * Math.sin(d * 9 - T * 0.9) * Math.cos(gx / R * 3 + T * 0.3);
      const r = s * 0.5 * (0.08 + 0.92 * v) * (0.6 + 0.7 * p.size);
      const b = Math.min(bins - 1, Math.floor(((y / h) + 0.5 * v) / 1.5 * bins));
      paths[Math.max(0, b)].push(x, y, r);
    }
  }
  paths.forEach((arr, b) => {
    ctx.fillStyle = wpPaletteAt(C, b / (bins - 1));
    ctx.beginPath();
    for (let q = 0; q < arr.length; q += 3) { ctx.moveTo(arr[q] + arr[q + 2], arr[q + 1]); ctx.arc(arr[q], arr[q + 1], arr[q + 2], 0, 6.283); }
    ctx.fill();
  });
}
function wpStyleIsoCubes(ctx, w, h, T, C, p) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  const s = m / (4 + p.density * 9);
  const cw = s * Math.sqrt(3), rowH = s * 1.5;
  for (let j = -1; j * rowH < h + s; j++) {
    for (let i = -1; i * cw < w + cw; i++) {
      const cx = i * cw + (j % 2 ? cw / 2 : 0), cy = j * rowH;
      const wave = (Math.sin(i * 0.55 + T * 0.6) + Math.cos(j * 0.45 - T * 0.5) + 2) / 4;
      const base = fg[Math.floor(wave * fg.length) % fg.length];
      const lift = -s * 0.3 * p.depth * wave;
      const top = wpShade(base, 0.14), left = base, right = wpShade(base, -0.18);
      const y = cy + lift;
      ctx.fillStyle = top;
      ctx.beginPath(); ctx.moveTo(cx, y - s); ctx.lineTo(cx + cw / 2, y - s / 2); ctx.lineTo(cx, y); ctx.lineTo(cx - cw / 2, y - s / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = left;
      ctx.beginPath(); ctx.moveTo(cx - cw / 2, y - s / 2); ctx.lineTo(cx, y); ctx.lineTo(cx, y + s); ctx.lineTo(cx - cw / 2, y + s / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = right;
      ctx.beginPath(); ctx.moveTo(cx + cw / 2, y - s / 2); ctx.lineTo(cx, y); ctx.lineTo(cx, y + s); ctx.lineTo(cx + cw / 2, y + s / 2); ctx.closePath(); ctx.fill();
    }
  }
}
function wpStyleRetroStripes(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  const groups = 1 + Math.round(p.density * 3);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(p.angle * Math.PI * 2);
  ctx.translate(-w / 2, -h / 2);
  for (let g = 0; g < groups; g++) {
    const cx = w * (groups === 1 ? 0.5 : 0.1 + 0.8 * (g / (groups - 1))) + (rnd(g) - 0.5) * w * 0.15;
    const cy = h * (0.55 + 0.45 * rnd(g + 7));
    const R = m * (0.4 + 0.5 * p.size) * (0.7 + 0.4 * rnd(g + 3));
    const nb = 5 + Math.round(p.thickness * 4);
    for (let k = 0; k < nb; k++) {
      const r = R * (1 - k / nb) + Math.sin(T * 0.5 + k + g) * m * 0.006;
      if (r <= 0) continue;
      ctx.fillStyle = k === nb - 1 ? C[0] : fg[(k + g) % fg.length];
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
function wpStyleFlowField(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  const N = 150 + Math.round(p.density * 850);
  const steps = 18 + Math.round(p.size * 40);
  const len = m * 0.007;
  const sc = 3.2 / m;
  const ph = rnd(1) * 6.28;
  const turn = Math.PI * (0.7 + p.depth);
  ctx.lineWidth = Math.max(0.6, m * (0.0008 + 0.004 * p.thickness));
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.75;
  fg.forEach((col, ci) => {
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (let i = ci; i < N; i += fg.length) {
      let x = rnd(i * 2 + 10) * w, y = rnd(i * 2 + 11) * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < steps; s++) {
        const a = (Math.sin(x * sc + T * 0.2) + Math.cos(y * sc * 1.3 - T * 0.15) + Math.sin((x + y) * sc * 0.7 + ph)) * turn / 3;
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}
function wpStyleSeigaiha(ctx, w, h, T, C, p) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C);
  const r = m / (3 + p.density * 7);
  const rings = 3 + Math.round(p.thickness * 3);
  for (let j = 0; j * (r / 2) < h + r * 2; j++) {
    const off = (j % 2 ? r : 0);
    for (let i = -1; i * 2 * r < w + r * 2; i++) {
      const cx = i * 2 * r + off + Math.sin(T * 0.5 + j * 0.4) * r * 0.08;
      const cy = j * (r / 2);
      for (let k = 0; k < rings; k++) {
        const rr = r * (1 - k / rings) * 0.98;
        ctx.fillStyle = k % 2 ? C[0] : fg[(j + k / 2 + i) % fg.length | 0];
        ctx.beginPath();
        ctx.moveTo(cx - rr, cy);
        ctx.arc(cx, cy, rr, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}
function wpStyleTerrazzo(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  ctx.fillStyle = C[0];
  ctx.fillRect(0, 0, w, h);
  const fg = wpFg(C).concat(wpFg(C).map(c => wpShade(c, -0.15)));
  const n = 60 + Math.round(p.density * 300);
  for (let i = 0; i < n; i++) {
    const q = rnd(i * 9 + 1);
    const s = m * (0.008 + 0.05 * p.size) * (0.3 + q * q * 1.7);
    const x = rnd(i * 9 + 2) * w + Math.sin(T * 0.1 + i) * m * 0.003;
    const y = rnd(i * 9 + 3) * h + Math.cos(T * 0.08 + i) * m * 0.003;
    const rot = rnd(i * 9 + 4) * 6.28 + T * 0.02 * (rnd(i * 9 + 5) - 0.5);
    const verts = 5 + Math.floor(rnd(i * 9 + 6) * 3);
    ctx.fillStyle = fg[Math.floor(rnd(i * 9 + 7) * fg.length)];
    ctx.beginPath();
    for (let v = 0; v < verts; v++) {
      const a = rot + (v / verts) * 6.283;
      const rr = s * (0.6 + 0.5 * rnd(i * 31 + v));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      v ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}
function wpStyleSynthwave(ctx, w, h, T, C, p, rnd) {
  const m = Math.min(w, h);
  const fg = wpFg(C);
  const c1 = fg[0], c2 = fg[1 % fg.length], c3 = fg[2 % fg.length];
  const hz = h * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, wpShade(C[0], -0.05));
  sky.addColorStop(1, wpShade(c1, -0.1));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hz);
  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 60; i++) {
    const tw = 0.5 + 0.5 * Math.sin(T * 2 + i);
    ctx.globalAlpha = 0.3 + 0.5 * tw;
    ctx.fillRect(rnd(i * 2) * w, rnd(i * 2 + 1) * hz * 0.7, Math.max(1, m * 0.002), Math.max(1, m * 0.002));
  }
  ctx.globalAlpha = 1;
  // sun
  const R = m * (0.16 + 0.16 * p.size);
  const sx = w / 2, sy = hz - R * 0.35;
  const sun = ctx.createLinearGradient(0, sy - R, 0, sy + R);
  sun.addColorStop(0, c3);
  sun.addColorStop(1, c2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(sx, sy, R, 0, 6.283);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
  const scroll = (T * 0.3) % 1;
  ctx.fillStyle = sky;
  for (let k = 0; k < 8; k++) {
    const yy = sy + R * (0.05 + (k + scroll) * 0.13);
    ctx.fillRect(sx - R, yy, R * 2, R * 0.015 * (k + scroll + 1) * 2);
  }
  ctx.restore();
  // mountains
  ctx.fillStyle = wpShade(C[0], 0.04);
  ctx.beginPath();
  ctx.moveTo(0, hz);
  for (let i = 0; i <= 12; i++) ctx.lineTo((w * i) / 12, hz - (i % 2 ? 1 : 0.35) * m * 0.08 * (0.5 + rnd(i + 40)));
  ctx.lineTo(w, hz);
  ctx.closePath();
  ctx.fill();
  // floor + perspective grid
  ctx.fillStyle = C[0];
  ctx.fillRect(0, hz, w, h - hz);
  ctx.strokeStyle = c2;
  ctx.shadowColor = c2;
  ctx.shadowBlur = m * 0.01;
  ctx.lineWidth = Math.max(1, m * (0.0015 + 0.003 * p.thickness));
  ctx.beginPath();
  const lanes = 8 + Math.round(p.density * 12);
  for (let k = -lanes; k <= lanes; k++) {
    ctx.moveTo(w / 2 + k * w * 0.02, hz);
    ctx.lineTo(w / 2 + k * w * 0.35, h);
  }
  const zoff = (T * 0.6) % 1;
  for (let z = 1; z < 14; z++) {
    const d = (z - zoff);
    if (d <= 0.2) continue;
    const y = hz + (h - hz) * (1 / d) * 0.55;
    if (y > h) continue;
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  const glow = ctx.createLinearGradient(0, hz - m * 0.03, 0, hz + m * 0.03);
  glow.addColorStop(0, wpHexToRgba(c2, 0));
  glow.addColorStop(0.5, wpHexToRgba(c2, 0.6));
  glow.addColorStop(1, wpHexToRgba(c2, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, hz - m * 0.03, w, m * 0.06);
}

/* Registry. Order within a category is the gallery order. pro: needs Pro.
   params: which knobs the Adjust card shows for this style. Legacy styles
   keep their original (ctx, w, h, t, colors, speed) signature. */
const WP_CATEGORIES = [
  { id: 'glass', name: 'Glass' },
  { id: 'abstract', name: 'Abstract' },
  { id: 'patterns', name: 'Patterns' },
  { id: 'classic', name: 'Classic' },
  { id: 'motion', name: 'Motion' },
];
const WP_PARAM_LABELS = { density: 'Amount', size: 'Size', softness: 'Softness', angle: 'Angle', thickness: 'Line weight', depth: 'Depth' };
const WP_STYLES = [
  { id: 'frostedGlass', name: 'Frosted Glass', cat: 'glass', params: ['density', 'size', 'softness'], draw: wpStyleFrostedGlass },
  { id: 'flutedGlass', name: 'Fluted Glass', cat: 'glass', params: ['size', 'depth'], draw: wpStyleFlutedGlass },
  { id: 'liquidGlass', name: 'Liquid Glass', cat: 'glass', pro: true, params: ['density', 'size', 'depth'], draw: wpStyleLiquidGlass },
  { id: 'prismLight', name: 'Prism Light', cat: 'glass', pro: true, params: ['angle', 'size', 'softness'], draw: wpStylePrismLight },
  { id: 'grainyPoster', name: 'Grainy Poster', cat: 'abstract', params: ['density', 'size', 'softness'], draw: wpStyleGrainyPoster },
  { id: 'paperLayers', name: 'Paper Layers', cat: 'abstract', params: ['density', 'size', 'depth'], draw: wpStylePaperLayers },
  { id: 'silk', name: 'Silk Folds', cat: 'abstract', pro: true, params: ['density', 'size', 'angle', 'depth'], draw: wpStyleSilk },
  { id: 'ink', name: 'Ink in Water', cat: 'abstract', pro: true, params: ['density', 'size', 'softness'], draw: wpStyleInk },
  { id: 'orbs', name: 'Glossy Orbs', cat: 'abstract', pro: true, params: ['density', 'size', 'depth'], draw: wpStyleOrbs },
  { id: 'holo', name: 'Holographic', cat: 'abstract', pro: true, params: ['angle', 'density'], draw: wpStyleHolo },
  { id: 'topo', name: 'Topographic', cat: 'abstract', pro: true, params: ['density', 'size', 'thickness'], draw: wpStyleTopo },
  { id: 'bauhaus', name: 'Bauhaus', cat: 'patterns', params: ['density', 'size'], draw: wpStyleBauhaus },
  { id: 'halftone', name: 'Halftone', cat: 'patterns', params: ['density', 'size', 'angle'], draw: wpStyleHalftone },
  { id: 'retroStripes', name: 'Retro Stripes', cat: 'patterns', params: ['density', 'size', 'thickness', 'angle'], draw: wpStyleRetroStripes },
  { id: 'truchet', name: 'Truchet Tiles', cat: 'patterns', pro: true, params: ['density', 'thickness'], draw: wpStyleTruchet },
  { id: 'isoCubes', name: 'Iso Cubes', cat: 'patterns', pro: true, params: ['density', 'depth'], draw: wpStyleIsoCubes },
  { id: 'flowField', name: 'Flow Field', cat: 'patterns', pro: true, params: ['density', 'size', 'thickness', 'depth'], draw: wpStyleFlowField },
  { id: 'seigaiha', name: 'Seigaiha Waves', cat: 'patterns', pro: true, params: ['density', 'thickness'], draw: wpStyleSeigaiha },
  { id: 'terrazzo', name: 'Terrazzo', cat: 'patterns', pro: true, params: ['density', 'size'], draw: wpStyleTerrazzo },
  { id: 'synthwave', name: 'Synthwave', cat: 'patterns', pro: true, params: ['density', 'size', 'thickness'], draw: wpStyleSynthwave },
  { id: 'flowingMesh', name: 'Flowing Mesh', cat: 'classic', legacy: wpDrawFlowingMesh },
  { id: 'auroraFlow', name: 'Aurora Flow', cat: 'classic', legacy: wpDrawAuroraFlow },
  { id: 'radialPulse', name: 'Radial Pulse', cat: 'classic', legacy: wpDrawRadialPulse },
  { id: 'conicSpin', name: 'Conic Spin', cat: 'classic', legacy: wpDrawConicSpin },
  { id: 'waveBands', name: 'Wave Bands', cat: 'classic', legacy: wpDrawWaveBands },
  { id: 'starfield', name: 'Starfield', cat: 'motion', pro: true, legacy: wpDrawStarfield },
  { id: 'plasma', name: 'Plasma', cat: 'motion', pro: true, legacy: wpDrawPlasma },
  { id: 'ripple', name: 'Ripple', cat: 'motion', pro: true, legacy: wpDrawRipple },
  { id: 'voronoi', name: 'Voronoi Cells', cat: 'motion', pro: true, legacy: wpDrawVoronoi },
  { id: 'kaleidoscope', name: 'Kaleidoscope', cat: 'motion', pro: true, legacy: wpDrawKaleidoscope },
  { id: 'perlinClouds', name: 'Cloud Drift', cat: 'motion', pro: true, legacy: wpDrawPerlinClouds },
  { id: 'lavaLamp', name: 'Lava Lamp', cat: 'motion', pro: true, legacy: wpDrawLavaLamp },
  { id: 'moire', name: 'Moiré', cat: 'motion', pro: true, legacy: wpDrawMoire },
];
const WP_STYLE_MAP = Object.fromEntries(WP_STYLES.map(s => [s.id, s]));
const WP_DEFAULT_PARAMS = { density: 50, size: 50, softness: 50, angle: 10, thickness: 45, depth: 50 };

function wpRenderStyle(id, ctx, w, h, t, colors, speed, params, seed) {
  const st = WP_STYLE_MAP[id] || WP_STYLE_MAP.flowingMesh;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (st.legacy) st.legacy(ctx, w, h, t, colors, speed);
  else {
    const src = Object.assign({}, WP_DEFAULT_PARAMS, params || {});
    const p = {};
    Object.keys(WP_DEFAULT_PARAMS).forEach(k => { p[k] = clamp(Number(src[k]) || 0, 0, 100) / 100; });
    st.draw(ctx, w, h, t * speed, colors, p, wpHashFn(seed));
  }
  ctx.restore();
}
/* One full frame: style, optional layered second style, then effects. */
function wpRenderScene(ctx, w, h, t, s, opts) {
  const colors = s.timeOfDayTint ? wpApplyTimeOfDayTint(s.colors) : s.colors;
  wpRenderStyle(s.pattern, ctx, w, h, t, colors, s.speed, s.params, s.seed);
  const ov = s.overlay;
  if (ov && ov.style && ov.style !== 'none' && WP_STYLE_MAP[ov.style]) {
    const buf = wpBuf('layer:' + ((opts && opts.bufKey) || 'main'), w, h);
    const bc = buf.getContext('2d');
    bc.clearRect(0, 0, w, h);
    wpRenderStyle(ov.style, bc, w, h, t, colors, s.speed, s.params, (s.seed || '') + ':layer');
    ctx.save();
    ctx.globalAlpha = clamp(ov.opacity ?? 0.5, 0, 1);
    ctx.globalCompositeOperation = ov.blend || 'soft-light';
    ctx.drawImage(buf, 0, 0, w, h);
    ctx.restore();
  }
  if (!(opts && opts.noEffects)) wpApplyEffects(ctx, w, h, s.effects, t);
}

/* ==========================================================================
   Wallpaper studio — state and UI
   ========================================================================== */

/* Built-in looks: a style + colors + effects in one tap. */
const WALLPAPER_PRESETS = [
  { name: 'Nebula Drift', pattern: 'flowingMesh', speed: 1.0, colors: ['#05030f', '#6d5dfc', '#ff6b9d', '#22d3c5'], effects: { grain: 0.15, vignette: 0.2, glow: 0.25, duotone: null } },
  { name: 'Frosted Dawn', pattern: 'frostedGlass', speed: 0.8, colors: ['#fdf1e8', '#ff9a8b', '#ff6a88', '#a18cd1'], effects: { grain: 0.08, vignette: 0, glow: 0, duotone: null } },
  { name: 'Reeded Night', pattern: 'flutedGlass', speed: 1.0, colors: ['#07060d', '#7b2ff7', '#f107a3', '#00d2ff'], effects: { grain: 0.12, vignette: 0.25, glow: 0.2, duotone: null } },
  { name: 'Bauhaus Poster', pattern: 'bauhaus', speed: 0.8, colors: ['#f1e9da', '#e4572e', '#29335c', '#f3a712', '#0f7173'], effects: { grain: 0.2, vignette: 0, glow: 0, duotone: null } },
  { name: 'Risograph', pattern: 'grainyPoster', speed: 0.7, colors: ['#fff4e6', '#ff5e5b', '#00cecb', '#ffed66'], effects: { grain: 0.15, vignette: 0, glow: 0, duotone: null } },
  { name: 'Northern Lights', pattern: 'auroraFlow', speed: 0.8, colors: ['#020814', '#00f2fe', '#43cea2', '#7b2ff7'], effects: { grain: 0.1, vignette: 0.15, glow: 0.4, duotone: null } },
  { name: 'Paper Hills', pattern: 'paperLayers', speed: 0.6, colors: ['#fdf6ec', '#f6c28b', '#e76f51', '#2a9d8f', '#264653'], effects: { grain: 0.1, vignette: 0, glow: 0, duotone: null } },
  { name: 'Seventies', pattern: 'retroStripes', speed: 0.6, colors: ['#fbeee0', '#d9480f', '#f59f00', '#6b4226'], effects: { grain: 0.18, vignette: 0.1, glow: 0, duotone: null } },
  { name: 'Ocean Waves', pattern: 'waveBands', speed: 0.7, colors: ['#04263c', '#0077b6', '#00b4d8', '#90e0ef'], effects: { grain: 0.1, vignette: 0.2, glow: 0.15, duotone: null } },
  { name: 'Film Noir', pattern: 'radialPulse', speed: 1.0, colors: ['#050505', '#b23a48', '#4a4e69'], effects: { grain: 0.45, vignette: 0.55, glow: 0.1, duotone: { shadow: '#0a0508', highlight: '#e8c4a0' } } },
  { name: 'Citrus Spin', pattern: 'conicSpin', speed: 0.5, colors: ['#fffdf5', '#f7971e', '#ffd200', '#a8ff78'], effects: { grain: 0, vignette: 0, glow: 0.15, duotone: null } },
  { name: 'Sepia Drift', pattern: 'flowingMesh', speed: 0.8, colors: ['#1a1006', '#c9944a', '#8a5a2b', '#e8c98f'], effects: { grain: 0.35, vignette: 0.4, glow: 0.15, duotone: { shadow: '#160f08', highlight: '#f0d9a8' } } },
];

const WP_EFFECTS_DEFAULT = { grain: 0, vignette: 0, glow: 0, duotone: null, glass: 'none', glassAmount: 0.7 };
let wallpaperState = {
  pattern: 'flowingMesh',
  speed: 1.0,
  live: true,
  colors: ['#0f1020', '#6d5dfc', '#ff6b9d', '#22d3c5'],
  locked: [false, false, false, false],
  effects: { ...WP_EFFECTS_DEFAULT },
  seed: null,
  params: { ...WP_DEFAULT_PARAMS },
  overlay: { style: 'none', opacity: 0.5, blend: 'soft-light' },
  bgMode: 'auto',
  harmony: 'random',
  timeOfDayTint: false,
  tapRipple: true,
  doubleTapPause: true,
  shakeRandomize: false,
  parallax: false,
  videoSeconds: 10,
};

function isWallpaperStyleAllowed(id) {
  const st = WP_STYLE_MAP[id];
  return !!st && (!st.pro || isProUnlocked());
}
/* Fills in anything missing (older share links, projects and saved looks
   predate most of these fields) and drops Pro styles for free users. */
function normalizeWallpaperState(s) {
  const out = Object.assign({}, wallpaperState, s || {});
  if (!WP_STYLE_MAP[out.pattern] || !isWallpaperStyleAllowed(out.pattern)) out.pattern = 'flowingMesh';
  out.colors = (Array.isArray(out.colors) && out.colors.length >= 2 ? out.colors : wallpaperState.colors).slice(0, 6);
  out.locked = out.colors.map((_, i) => !!(s && Array.isArray(s.locked) && s.locked[i]));
  out.effects = Object.assign({}, WP_EFFECTS_DEFAULT, (s && s.effects) || {});
  out.params = Object.assign({}, WP_DEFAULT_PARAMS, (s && s.params) || {});
  out.overlay = Object.assign({ style: 'none', opacity: 0.5, blend: 'soft-light' }, (s && s.overlay) || {});
  if (out.overlay.style !== 'none' && !isWallpaperStyleAllowed(out.overlay.style)) out.overlay.style = 'none';
  out.speed = clamp(Number(out.speed) || 1, 0.2, 3);
  ['loopPerfect', 'loopSeconds', 'realSunTimes', 'batteryAware', 'depthParallax', 'audioReactive'].forEach(k => delete out[k]);
  return out;
}

const wallpaperCanvas = document.getElementById('wallpaperCanvas');
const wallpaperCtx = wallpaperCanvas.getContext('2d');
const wallpaperSpeedSlider = document.getElementById('wallpaperSpeedSlider');
const wallpaperSpeedValue = document.getElementById('wallpaperSpeedValue');
const wallpaperColorsList = document.getElementById('wallpaperColorsList');
const wallpaperModeSeg = document.getElementById('wallpaperModeSeg');
const btnWallpaperNewFrame = document.getElementById('btnWallpaperNewFrame');
const wallpaperResolutionSelect = document.getElementById('wallpaperResolutionSelect');

/* Shows what "My Screen" actually resolves to, so it's obvious the
   export is sized (and oriented) for this device. */
function updateWallpaperResolutionHint() {
  const hint = document.getElementById('wallpaperResolutionHint');
  if (!hint) return;
  if (wallpaperResolutionSelect.value === 'auto') {
    const size = getDeviceExportSize();
    hint.textContent = `${size.w}×${size.h}`;
  } else {
    const [w, h] = wallpaperResolutionSelect.value.split('x');
    hint.textContent = `${w}×${h}`;
  }
}
wallpaperResolutionSelect.addEventListener('change', updateWallpaperResolutionHint);
window.addEventListener('resize', updateWallpaperResolutionHint);
window.addEventListener('orientationchange', () => setTimeout(updateWallpaperResolutionHint, 200));

/* ---- preview loop ---- */
let wallpaperAnimId = null;
let wallpaperAnimStart = null;
let wallpaperFrozenT = 0;
const wpInteract = { ripples: [], tiltX: 0, tiltY: 0, targetX: 0, targetY: 0 };

function resizeWallpaperCanvas() {
  const rect = wallpaperCanvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  wallpaperCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  wallpaperCanvas.height = Math.max(1, Math.round(rect.height * dpr));
}

function drawWallpaperFrame(t) {
  const w = wallpaperCanvas.width, h = wallpaperCanvas.height;
  const ctx = wallpaperCtx;
  if (wallpaperState.parallax) {
    // Tilt (or pointer, on a computer) shifts the scene a little; the
    // scene is drawn slightly oversized so the edges never show.
    wpInteract.tiltX += (wpInteract.targetX - wpInteract.tiltX) * 0.12;
    wpInteract.tiltY += (wpInteract.targetY - wpInteract.tiltY) * 0.12;
    const buf = wpBuf('parallax', w, h);
    wpRenderScene(buf.getContext('2d'), w, h, t, wallpaperState, { bufKey: 'preview' });
    const k = 1.08, m = Math.min(w, h) * 0.035;
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.translate(w / 2 + wpInteract.tiltX * m, h / 2 + wpInteract.tiltY * m);
    ctx.scale(k, k);
    ctx.drawImage(buf, -w / 2, -h / 2, w, h);
    ctx.restore();
    // a nearer layer of soft specks moving faster = depth
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 24; i++) {
      const r = Math.min(w, h) * (0.004 + 0.01 * ((i * 37) % 10) / 10);
      const x = ((i * 0.618) % 1) * w + wpInteract.tiltX * m * 2.6;
      const y = (((i * 0.382 + t * 0.01) % 1)) * h + wpInteract.tiltY * m * 2.6;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  } else {
    wpRenderScene(ctx, w, h, t, wallpaperState, { bufKey: 'preview' });
  }
  drawWallpaperRipples(ctx, w, h);
}
function drawWallpaperRipples(ctx, w, h) {
  const now = performance.now();
  wpInteract.ripples = wpInteract.ripples.filter(r => now - r.start < 1400);
  const m = Math.min(w, h);
  wpInteract.ripples.forEach(r => {
    const age = (now - r.start) / 1400;
    for (let k = 0; k < 3; k++) {
      const a = age - k * 0.12;
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - a)})`;
      ctx.lineWidth = Math.max(1, m * 0.006 * (1 - a));
      ctx.beginPath();
      ctx.arc(r.x * w, r.y * h, m * 0.5 * a, 0, 6.283);
      ctx.stroke();
    }
  });
}

function wallpaperTick(ts) {
  if (wallpaperAnimStart === null) wallpaperAnimStart = ts - wallpaperFrozenT * 1000;
  if (wallpaperState.live) wallpaperFrozenT = (ts - wallpaperAnimStart) / 1000;
  else wallpaperAnimStart = ts - wallpaperFrozenT * 1000;
  drawWallpaperFrame(wallpaperFrozenT);
  // Still mode keeps ticking only while a ripple or tilt is settling.
  const settling = wpInteract.ripples.length || (wallpaperState.parallax && (Math.abs(wpInteract.targetX - wpInteract.tiltX) > 0.01 || Math.abs(wpInteract.targetY - wpInteract.tiltY) > 0.01));
  if (wallpaperState.live || settling) wallpaperAnimId = requestAnimationFrame(wallpaperTick);
  else wallpaperAnimId = null;
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
/* Redraw after any change: live mode repaints next frame anyway. */
function refreshWallpaper() {
  if (!wallpaperState.live) drawWallpaperFrame(wallpaperFrozenT);
  scheduleWallpaperThumbs();
}
function activateWallpaperTab() {
  resizeWallpaperCanvas();
  updateWallpaperResolutionHint();
  if (wallpaperState.live) startWallpaperAnimation();
  else drawWallpaperFrame(wallpaperFrozenT);
  scheduleWallpaperThumbs();
}

/* ---- style gallery ---- */
const wallpaperStyleGrid = document.getElementById('wallpaperStyleGrid');
const wallpaperStyleCats = document.getElementById('wallpaperStyleCats');
let wallpaperStyleCat = 'glass';
function renderWallpaperStyleCats() {
  wallpaperStyleCats.innerHTML = '';
  WP_CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'collection-chip wp-cat' + (c.id === wallpaperStyleCat ? ' active' : '');
    b.textContent = c.name;
    b.setAttribute('aria-pressed', c.id === wallpaperStyleCat ? 'true' : 'false');
    b.addEventListener('click', () => { wallpaperStyleCat = c.id; renderWallpaperStyleCats(); renderWallpaperStyleGrid(); });
    wallpaperStyleCats.appendChild(b);
  });
}
function renderWallpaperStyleGrid() {
  wallpaperStyleGrid.innerHTML = '';
  WP_STYLES.filter(s => s.cat === wallpaperStyleCat).forEach(st => {
    const b = document.createElement('button');
    b.className = 'wp-style' + (st.id === wallpaperState.pattern ? ' active' : '');
    b.dataset.style = st.id;
    b.setAttribute('aria-pressed', st.id === wallpaperState.pattern ? 'true' : 'false');
    const locked = st.pro && !isProUnlocked();
    b.innerHTML = `<canvas width="120" height="180" aria-hidden="true"></canvas><span>${st.name}</span>${locked ? '<em class="wp-pro">PRO</em>' : ''}`;
    b.addEventListener('click', () => selectWallpaperStyle(st.id));
    wallpaperStyleGrid.appendChild(b);
  });
  drawWallpaperThumbs();
}
let wpThumbTimer = null;
function scheduleWallpaperThumbs() {
  clearTimeout(wpThumbTimer);
  wpThumbTimer = setTimeout(drawWallpaperThumbs, 250);
}
function drawWallpaperThumbs() {
  if (activeTab !== 'wallpaper') return;
  wallpaperStyleGrid.querySelectorAll('.wp-style').forEach(b => {
    const c = b.querySelector('canvas');
    wpRenderStyle(b.dataset.style, c.getContext('2d'), c.width, c.height, 3, wallpaperState.colors, 1, WP_DEFAULT_PARAMS, wallpaperState.seed || 'thumb');
  });
}
function selectWallpaperStyle(id) {
  if (!isWallpaperStyleAllowed(id)) {
    showToast(`${WP_STYLE_MAP[id].name} is a Pro feature — unlock for ₹39`);
    openProModal();
    return;
  }
  wallpaperState.pattern = id;
  syncWallpaperStyleUI();
  refreshWallpaper();
  haptic(8);
}
function syncWallpaperStyleUI() {
  const st = WP_STYLE_MAP[wallpaperState.pattern];
  if (st && st.cat !== wallpaperStyleCat) { wallpaperStyleCat = st.cat; renderWallpaperStyleCats(); renderWallpaperStyleGrid(); }
  wallpaperStyleGrid.querySelectorAll('.wp-style').forEach(b => {
    const on = b.dataset.style === wallpaperState.pattern;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.getElementById('wallpaperStyleName').textContent = st ? st.name : '';
  renderWallpaperParamSliders();
}

/* ---- Adjust: speed + the current style's own knobs ---- */
function renderWallpaperParamSliders() {
  const box = document.getElementById('wallpaperParamSliders');
  const st = WP_STYLE_MAP[wallpaperState.pattern];
  box.innerHTML = '';
  (st && st.params ? st.params : []).forEach(key => {
    const id = 'wpParam-' + key;
    const row = document.createElement('div');
    row.className = 'wp-param';
    row.innerHTML = `<label class="control-label-row wp-param-label" for="${id}"><span>${WP_PARAM_LABELS[key]}</span><span class="control-value">${Math.round(wallpaperState.params[key])}</span></label>
      <input type="range" id="${id}" class="slider" min="0" max="100" value="${wallpaperState.params[key]}">`;
    const input = row.querySelector('input');
    const val = row.querySelector('.control-value');
    input.addEventListener('input', () => {
      wallpaperState.params[key] = Number(input.value);
      val.textContent = input.value;
      refreshWallpaper();
    });
    box.appendChild(row);
  });
}
wallpaperSpeedSlider.addEventListener('input', () => {
  wallpaperState.speed = Number(wallpaperSpeedSlider.value) / 10;
  wallpaperSpeedValue.textContent = `${wallpaperState.speed.toFixed(1)}×`;
});

/* ---- colors: chips with locks, background, harmony, saved palettes ---- */
function renderWallpaperColorsList() {
  wallpaperColorsList.innerHTML = '';
  wallpaperState.colors.forEach((color, i) => {
    const locked = !!wallpaperState.locked[i];
    const chip = document.createElement('div');
    chip.className = 'wallpaper-color-chip' + (locked ? ' locked' : '');
    chip.innerHTML = `
      <input type="color" value="${color}" aria-label="${i === 0 ? 'Background' : 'Color ' + i}" title="${i === 0 ? 'Background' : colorName(color)}">
      <button class="wallpaper-color-lock" aria-pressed="${locked}" title="${locked ? 'Unlock' : 'Keep when shuffling'}" aria-label="${locked ? 'Unlock color' : 'Lock color'}">${locked ? '🔒' : '🔓'}</button>
      <button class="wallpaper-color-remove" title="Remove color" aria-label="Remove color" ${wallpaperState.colors.length <= 2 ? 'disabled' : ''}>✕</button>
    `;
    chip.querySelector('input').addEventListener('input', (e) => {
      wallpaperState.colors[i] = e.target.value;
      wallpaperState.locked[i] = true;
      chip.classList.add('locked');
      chip.querySelector('.wallpaper-color-lock').textContent = '🔒';
      refreshWallpaper();
    });
    chip.querySelector('.wallpaper-color-lock').addEventListener('click', () => {
      wallpaperState.locked[i] = !wallpaperState.locked[i];
      renderWallpaperColorsList();
      haptic(8);
    });
    chip.querySelector('.wallpaper-color-remove').addEventListener('click', () => {
      if (wallpaperState.colors.length <= 2) return;
      wallpaperState.colors.splice(i, 1);
      wallpaperState.locked.splice(i, 1);
      renderWallpaperColorsList();
      refreshWallpaper();
    });
    wallpaperColorsList.appendChild(chip);
  });
}
document.getElementById('btnAddWallpaperColor').addEventListener('click', () => {
  if (wallpaperState.colors.length >= 6) { showToast('Maximum 6 colors'); return; }
  const fg = wallpaperState.colors.slice(1);
  const base = fg.length ? hexToHsl(fg[fg.length - 1]) : { h: Math.random() * 360 };
  wallpaperState.colors.push(hslToHex(base.h + 40 + Math.random() * 40, 60 + Math.random() * 25, 50 + Math.random() * 15));
  wallpaperState.locked.push(false);
  renderWallpaperColorsList();
  refreshWallpaper();
});

/* Background color by mode — the fix for "why is there always black":
   the background used to be forced near-black on every shuffle. */
function wpBackgroundFor(mode, hue) {
  if (mode === 'auto') {
    const r = Math.random();
    mode = r < 0.4 ? 'dark' : r < 0.72 ? 'light' : 'colorful';
  }
  if (mode === 'light') return hslToHex(hue + (Math.random() - 0.5) * 30, 25 + Math.random() * 30, 90 + Math.random() * 6);
  if (mode === 'colorful') return hslToHex(hue + 180 + (Math.random() - 0.5) * 40, 55 + Math.random() * 25, 38 + Math.random() * 16);
  return hslToHex(hue, 30 + Math.random() * 25, 6 + Math.random() * 9);
}
function randomizeWallpaperColorsOnly() {
  const n = Math.max(2, wallpaperState.colors.length);
  const fgCount = n - 1;
  const existingFg = wallpaperState.colors.slice(1);
  const lockedFg = wallpaperState.locked.slice(1).map(Boolean);
  const fg = generatePaletteColors(wallpaperState.harmony || 'random', fgCount, existingFg, lockedFg);
  const hue = hexToHsl(fg.find((_, i) => !lockedFg[i]) || fg[0]).h;
  const bg = wallpaperState.locked[0] ? wallpaperState.colors[0] : wpBackgroundFor(wallpaperState.bgMode, hue);
  wallpaperState.colors = [bg, ...fg];
  // On a light background, lift very light foreground colors so they
  // don't disappear into it.
  if (wpIsLightHex(bg)) {
    wallpaperState.colors = wallpaperState.colors.map((c, i) => {
      if (i === 0 || wallpaperState.locked[i]) return c;
      const { h, s, l } = hexToHsl(c);
      return l > 72 ? hslToHex(h, s, 50 + Math.random() * 15) : c;
    });
  }
  applyBrandKitToWallpaper();
}
function newWallpaperSeed() {
  wallpaperState.seed = Math.random().toString(36).slice(2, 8);
}
function randomizeWallpaper(what) {
  if (what !== 'layout') randomizeWallpaperColorsOnly();
  if (what !== 'colors') newWallpaperSeed();
  renderWallpaperColorsList();
  syncWallpaperSeedUI();
  refreshWallpaper();
  quirkyBounce(document.querySelector('#panel-wallpaper .preview-frame'));
  if (!suppressRecentGenerated) pushRecentGenerated('wallpaper', `linear-gradient(135deg, ${wallpaperState.colors.join(', ')})`, wallpaperState);
}
/* Name kept for the many existing callers (Space, ⌘K, flick, boot). */
function randomizeWallpaperColors() { randomizeWallpaper('both'); }
let suppressRecentGenerated = false;

document.getElementById('btnRandomWallpaperColors').addEventListener('click', () => randomizeWallpaper('both'));
document.getElementById('btnShuffleWallpaperColors').addEventListener('click', () => { randomizeWallpaper('colors'); haptic(8); });
document.getElementById('btnShuffleWallpaperLayout').addEventListener('click', () => { randomizeWallpaper('layout'); haptic(8); });

const wallpaperBgSeg = document.getElementById('wallpaperBgSeg');
wallpaperBgSeg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-bg]');
  if (!b) return;
  wallpaperState.bgMode = b.dataset.bg;
  syncWallpaperBgUI();
  if (!wallpaperState.locked[0]) {
    wallpaperState.colors[0] = wpBackgroundFor(wallpaperState.bgMode, hexToHsl(wallpaperState.colors[1] || '#6d5dfc').h);
    renderWallpaperColorsList();
    refreshWallpaper();
  }
});
function syncWallpaperBgUI() {
  wallpaperBgSeg.querySelectorAll('[data-bg]').forEach(b => {
    const on = b.dataset.bg === wallpaperState.bgMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
const wallpaperHarmonySelect = document.getElementById('wallpaperHarmonySelect');
wallpaperHarmonySelect.addEventListener('change', () => {
  wallpaperState.harmony = wallpaperHarmonySelect.value;
  randomizeWallpaper('colors');
});
const wallpaperFromPalette = document.getElementById('wallpaperFromPalette');
function renderWallpaperPaletteOptions() {
  const saved = getSavedPalettes();
  wallpaperFromPalette.innerHTML = '<option value="">Use a saved palette…</option>' + (paletteState.colors.length ? '<option value="current">Current Palettes tab</option>' : '')
    + saved.slice(0, 20).map((p, i) => `<option value="${i}">${p.collection ? escapeHtmlText(p.collection) + ' · ' : ''}${p.colors.map(c => colorName(c)).slice(0, 3).join(', ')}</option>`).join('');
  wallpaperFromPalette.disabled = !saved.length && !paletteState.colors.length;
}
wallpaperFromPalette.addEventListener('focus', renderWallpaperPaletteOptions);
wallpaperFromPalette.addEventListener('change', () => {
  const v = wallpaperFromPalette.value;
  if (!v) return;
  const src = v === 'current' ? paletteState.colors : (getSavedPalettes()[Number(v)] || {}).colors;
  if (!src || !src.length) return;
  const fg = src.slice(0, 5);
  const bg = wallpaperState.locked[0] ? wallpaperState.colors[0] : wpBackgroundFor(wallpaperState.bgMode, hexToHsl(fg[0]).h);
  wallpaperState.colors = [bg, ...fg];
  wallpaperState.locked = wallpaperState.colors.map((_, i) => i === 0 ? !!wallpaperState.locked[0] : false);
  wallpaperFromPalette.value = '';
  renderWallpaperColorsList();
  refreshWallpaper();
  showToast('Palette applied');
});

/* ---- layer a second style ---- */
const wallpaperOverlayStyle = document.getElementById('wallpaperOverlayStyle');
const wallpaperOverlayControls = document.getElementById('wallpaperOverlayControls');
const wallpaperOverlayOpacity = document.getElementById('wallpaperOverlayOpacity');
const wallpaperOverlayBlend = document.getElementById('wallpaperOverlayBlend');
wallpaperOverlayStyle.innerHTML = '<option value="none">None</option>' + WP_CATEGORIES.map(c =>
  `<optgroup label="${c.name}">${WP_STYLES.filter(s => s.cat === c.id).map(s => `<option value="${s.id}">${s.name}${s.pro ? ' ★' : ''}</option>`).join('')}</optgroup>`).join('');
wallpaperOverlayStyle.addEventListener('change', () => {
  const v = wallpaperOverlayStyle.value;
  if (v !== 'none' && !isWallpaperStyleAllowed(v)) {
    showToast(`${WP_STYLE_MAP[v].name} is a Pro feature — unlock for ₹39`);
    wallpaperOverlayStyle.value = wallpaperState.overlay.style;
    openProModal();
    return;
  }
  wallpaperState.overlay.style = v;
  syncWallpaperOverlayUI();
  refreshWallpaper();
});
wallpaperOverlayOpacity.addEventListener('input', () => {
  wallpaperState.overlay.opacity = Number(wallpaperOverlayOpacity.value) / 100;
  document.getElementById('wallpaperOverlayOpacityValue').textContent = `${wallpaperOverlayOpacity.value}%`;
  refreshWallpaper();
});
wallpaperOverlayBlend.addEventListener('change', () => {
  wallpaperState.overlay.blend = wallpaperOverlayBlend.value;
  refreshWallpaper();
});
function syncWallpaperOverlayUI() {
  const ov = wallpaperState.overlay;
  wallpaperOverlayStyle.value = ov.style;
  wallpaperOverlayControls.hidden = ov.style === 'none';
  wallpaperOverlayOpacity.value = Math.round(ov.opacity * 100);
  document.getElementById('wallpaperOverlayOpacityValue').textContent = `${Math.round(ov.opacity * 100)}%`;
  wallpaperOverlayBlend.value = ov.blend;
}

/* ---- effects ---- */
const wallpaperGrainSlider = document.getElementById('wallpaperGrainSlider');
const wallpaperVignetteSlider = document.getElementById('wallpaperVignetteSlider');
const wallpaperGlowSlider = document.getElementById('wallpaperGlowSlider');
const wallpaperGlassSelect = document.getElementById('wallpaperGlassSelect');
const wallpaperDuotoneToggle = document.getElementById('wallpaperDuotoneToggle');
const wallpaperDuotoneColors = document.getElementById('wallpaperDuotoneColors');
const wallpaperDuotoneShadow = document.getElementById('wallpaperDuotoneShadow');
const wallpaperDuotoneHighlight = document.getElementById('wallpaperDuotoneHighlight');
[['wallpaperGrainSlider', 'grain', 'wallpaperGrainValue'], ['wallpaperVignetteSlider', 'vignette', 'wallpaperVignetteValue'], ['wallpaperGlowSlider', 'glow', 'wallpaperGlowValue']].forEach(([id, key, valId]) => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    wallpaperState.effects[key] = Number(el.value) / 100;
    document.getElementById(valId).textContent = `${el.value}%`;
    refreshWallpaper();
  });
});
wallpaperGlassSelect.addEventListener('change', () => {
  wallpaperState.effects.glass = wallpaperGlassSelect.value;
  refreshWallpaper();
});
function updateWallpaperDuotone() {
  wallpaperState.effects.duotone = wallpaperDuotoneToggle.checked
    ? { shadow: wallpaperDuotoneShadow.value, highlight: wallpaperDuotoneHighlight.value }
    : null;
  wallpaperDuotoneColors.hidden = !wallpaperDuotoneToggle.checked;
  refreshWallpaper();
}
wallpaperDuotoneToggle.addEventListener('change', updateWallpaperDuotone);
wallpaperDuotoneShadow.addEventListener('input', updateWallpaperDuotone);
wallpaperDuotoneHighlight.addEventListener('input', updateWallpaperDuotone);
function syncWallpaperEffectsUI() {
  const e = wallpaperState.effects;
  [['wallpaperGrainSlider', 'grain', 'wallpaperGrainValue'], ['wallpaperVignetteSlider', 'vignette', 'wallpaperVignetteValue'], ['wallpaperGlowSlider', 'glow', 'wallpaperGlowValue']].forEach(([id, key, valId]) => {
    const v = Math.round((e[key] || 0) * 100);
    document.getElementById(id).value = v;
    document.getElementById(valId).textContent = `${v}%`;
  });
  wallpaperGlassSelect.value = e.glass || 'none';
  wallpaperDuotoneToggle.checked = !!e.duotone;
  wallpaperDuotoneColors.hidden = !e.duotone;
  if (e.duotone) { wallpaperDuotoneShadow.value = e.duotone.shadow; wallpaperDuotoneHighlight.value = e.duotone.highlight; }
  document.getElementById('wallpaperTimeOfDayToggle').checked = !!wallpaperState.timeOfDayTint;
}
document.getElementById('btnRemixWallpaper').addEventListener('click', () => {
  const hue = Math.random() * 360;
  const glassRoll = Math.random();
  wallpaperState.effects = {
    grain: Math.random() * 0.4,
    vignette: Math.random() * 0.5,
    glow: Math.random() * 0.5,
    glass: glassRoll < 0.6 ? 'none' : ['frosted', 'fluted', 'liquid', 'prism'][Math.floor(Math.random() * 4)],
    glassAmount: 0.7,
    duotone: Math.random() < 0.25
      ? { shadow: hslToHex(hue, 40 + Math.random() * 20, 8 + Math.random() * 8), highlight: hslToHex(hue + (Math.random() - 0.5) * 40, 30 + Math.random() * 30, 78 + Math.random() * 15) }
      : null,
  };
  syncWallpaperEffectsUI();
  refreshWallpaper();
  quirkyBounce(document.querySelector('#panel-wallpaper .preview-frame'));
  showToast('Effects remixed');
});
/* Time-of-day tint: asks for location once to use real sunrise/sunset;
   works without it on a fixed hour curve. */
document.getElementById('wallpaperTimeOfDayToggle').addEventListener('change', (e) => {
  wallpaperState.timeOfDayTint = e.target.checked;
  if (e.target.checked && !window.wpSunTimes && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => { window.wpSunTimes = wpComputeSunTimes(pos.coords.latitude, pos.coords.longitude, new Date()); refreshWallpaper(); },
      () => {},
      { timeout: 8000, maximumAge: 6 * 3600 * 1000 }
    );
  }
  refreshWallpaper();
});

/* ---- seed ---- */
const wallpaperSeedInput = document.getElementById('wallpaperSeedInput');
function syncWallpaperSeedUI() {
  if (document.activeElement !== wallpaperSeedInput) wallpaperSeedInput.value = wallpaperState.seed || '';
}
wallpaperSeedInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const v = wallpaperSeedInput.value.trim();
  if (!v) return;
  wallpaperState.seed = v.slice(0, 24);
  refreshWallpaper();
  showToast('Layout seed applied');
});
document.getElementById('btnCopySeed').addEventListener('click', () => {
  if (!wallpaperState.seed) { newWallpaperSeed(); syncWallpaperSeedUI(); }
  copyText(wallpaperState.seed, 'Seed copied');
});
function seedToInt(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  return h;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- looks: your saved favorites + built-in packs ---- */
function getWallpaperFavorites() {
  try { const l = JSON.parse(localStorage.getItem('gradii_wallpaper_favorites') || '[]'); return Array.isArray(l) ? l : []; }
  catch (e) { return []; }
}
function setWallpaperFavorites(list) {
  try { localStorage.setItem('gradii_wallpaper_favorites', JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function wallpaperLookState() {
  const s = JSON.parse(JSON.stringify(wallpaperState));
  delete s.live;
  return s;
}
function applyWallpaperLook(look) {
  const keepLive = wallpaperState.live;
  wallpaperState = normalizeWallpaperState(Object.assign({}, wallpaperState, look));
  wallpaperState.live = keepLive;
  applyWallpaperStateToUI();
}
function applyWallpaperPreset(preset) {
  applyWallpaperLook({ pattern: preset.pattern, speed: preset.speed, colors: [...preset.colors], locked: preset.colors.map(() => false), effects: Object.assign({}, WP_EFFECTS_DEFAULT, JSON.parse(JSON.stringify(preset.effects || {}))), overlay: { style: 'none', opacity: 0.5, blend: 'soft-light' } });
}
function drawLookThumb(canvas, look) {
  const s = normalizeWallpaperState(look);
  wpRenderScene(canvas.getContext('2d'), canvas.width, canvas.height, 3, s, { bufKey: 'thumb' });
}
function renderWallpaperLooks() {
  const grid = document.getElementById('wallpaperLooksGrid');
  grid.innerHTML = '';
  const favs = getWallpaperFavorites();
  favs.forEach(f => {
    const b = document.createElement('div');
    b.className = 'wp-look';
    b.innerHTML = `<button class="wp-look-open" aria-label="Apply saved look"><canvas width="96" height="144"></canvas></button><button class="wp-look-del" aria-label="Delete saved look" title="Delete">✕</button>`;
    drawLookThumb(b.querySelector('canvas'), f.state);
    b.querySelector('.wp-look-open').addEventListener('click', () => { applyWallpaperLook(f.state); showToast('Look applied'); });
    b.querySelector('.wp-look-del').addEventListener('click', () => {
      setWallpaperFavorites(getWallpaperFavorites().filter(x => x.id !== f.id));
      renderWallpaperLooks();
    });
    grid.appendChild(b);
  });
  WALLPAPER_PRESETS.forEach(preset => {
    const b = document.createElement('button');
    b.className = 'wp-look wp-look-pack';
    b.title = preset.name;
    b.innerHTML = `<canvas width="96" height="144"></canvas><span>${preset.name}</span>`;
    drawLookThumb(b.querySelector('canvas'), { pattern: preset.pattern, colors: preset.colors, effects: preset.effects, speed: preset.speed });
    b.addEventListener('click', () => { applyWallpaperPreset(preset); showToast(`Loaded "${preset.name}"`); });
    grid.appendChild(b);
  });
}
document.getElementById('btnSaveWallpaperLook').addEventListener('click', () => {
  const list = getWallpaperFavorites();
  const cap = isProUnlocked() ? 60 : 6;
  if (list.length >= cap) { showToast(`Free keeps ${cap} looks — unlock Pro for more`); openProModal(); return; }
  list.unshift({ id: Date.now(), state: wallpaperLookState() });
  setWallpaperFavorites(list);
  renderWallpaperLooks();
  showToast('Look saved');
  haptic(12);
});

/* ---- when Gradii opens: daily pick or seasonal pick (Pro) ---- */
function applySeasonalWallpaperStyle() {
  const month = new Date().getMonth();
  const season = month <= 1 || month === 11 ? 0 : month <= 4 ? 1 : month <= 7 ? 2 : 3;
  const names = ['Reeded Night', 'Frosted Dawn', 'Ocean Waves', 'Seventies'];
  applyWallpaperPreset(WALLPAPER_PRESETS.find(p => p.name === names[season]) || WALLPAPER_PRESETS[0]);
}
function applyWallpaperOfTheDay() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  applyWallpaperPreset(WALLPAPER_PRESETS[dayOfYear % WALLPAPER_PRESETS.length]);
}
const wallpaperOnOpenSelect = document.getElementById('wallpaperOnOpenSelect');
function getWallpaperOnOpen() {
  try {
    const v = localStorage.getItem('gradii_wallpaper_on_open');
    if (v) return v;
    // carry over the two older separate toggles
    if (localStorage.getItem('gradii_wallpaper_seasonal') === '1') return 'seasonal';
    if (localStorage.getItem('gradii_wallpaper_of_the_day') === '1') return 'daily';
  } catch (e) { /* ignore */ }
  return 'off';
}
wallpaperOnOpenSelect.addEventListener('change', () => {
  const v = wallpaperOnOpenSelect.value;
  if (v !== 'off' && !isProUnlocked()) {
    showToast('Auto-pick on open is a Pro feature — unlock for ₹39');
    wallpaperOnOpenSelect.value = 'off';
    openProModal();
    return;
  }
  try { localStorage.setItem('gradii_wallpaper_on_open', v); } catch (e) { /* ignore */ }
  if (v === 'daily') applyWallpaperOfTheDay();
  if (v === 'seasonal') applySeasonalWallpaperStyle();
});

/* ---- phone screen helpers ---- */
document.getElementById('wallpaperSafeZoneToggle').addEventListener('change', (e) => {
  document.getElementById('wallpaperSafeZoneOverlay').hidden = !e.target.checked;
});

/* ---- touch & motion (in the app: preview + full screen) ---- */
async function requestMotionPermission() {
  const needs = [window.DeviceMotionEvent, window.DeviceOrientationEvent].filter(E => E && typeof E.requestPermission === 'function');
  for (const E of needs) {
    try { if ((await E.requestPermission()) !== 'granted') return false; } catch (e) { return false; }
  }
  return true;
}
let wpLastShake = 0;
let wpLastAccel = null;
window.addEventListener('devicemotion', (e) => {
  if (!wallpaperState.shakeRandomize || activeTab !== 'wallpaper') return;
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  if (wpLastAccel) {
    const delta = Math.abs(a.x - wpLastAccel.x) + Math.abs(a.y - wpLastAccel.y) + Math.abs(a.z - wpLastAccel.z);
    const now = Date.now();
    if (delta > 28 && now - wpLastShake > 1200) {
      wpLastShake = now;
      randomizeWallpaper('both');
      haptic([10, 40, 10]);
    }
  }
  wpLastAccel = { x: a.x, y: a.y, z: a.z };
});
window.addEventListener('deviceorientation', (e) => {
  if (!wallpaperState.parallax || e.gamma == null) return;
  wpInteract.targetX = clamp(e.gamma / 30, -1, 1);
  wpInteract.targetY = clamp((e.beta - 45) / 30, -1, 1);
  if (!wallpaperState.live) startWallpaperAnimation();
});
wallpaperCanvas.addEventListener('pointermove', (e) => {
  if (!wallpaperState.parallax || e.pointerType !== 'mouse') return;
  const r = wallpaperCanvas.getBoundingClientRect();
  wpInteract.targetX = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
  wpInteract.targetY = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
  if (!wallpaperState.live) startWallpaperAnimation();
});
let wpTapDown = null, wpLastTap = 0;
wallpaperCanvas.addEventListener('pointerdown', (e) => { wpTapDown = { x: e.clientX, y: e.clientY, t: performance.now() }; });
wallpaperCanvas.addEventListener('pointerup', (e) => {
  if (!wpTapDown) return;
  const moved = Math.hypot(e.clientX - wpTapDown.x, e.clientY - wpTapDown.y);
  const dt = performance.now() - wpTapDown.t;
  wpTapDown = null;
  if (moved > 12 || dt > 350) return;
  const now = performance.now();
  if (wallpaperState.doubleTapPause && now - wpLastTap < 320) {
    wpLastTap = 0;
    setWallpaperLive(!wallpaperState.live);
    showToast(wallpaperState.live ? 'Playing' : 'Paused');
    return;
  }
  wpLastTap = now;
  if (wallpaperState.tapRipple) {
    const r = wallpaperCanvas.getBoundingClientRect();
    wpInteract.ripples.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, start: now });
    startWallpaperAnimation();
  }
});
[['wallpaperTapRipple', 'tapRipple'], ['wallpaperDoubleTapPause', 'doubleTapPause']].forEach(([id, key]) => {
  document.getElementById(id).addEventListener('change', (e) => { wallpaperState[key] = e.target.checked; });
});
[['wallpaperShakeRandomize', 'shakeRandomize'], ['wallpaperParallaxToggle', 'parallax']].forEach(([id, key]) => {
  document.getElementById(id).addEventListener('change', async (e) => {
    const on = e.target.checked;
    if (on && !(await requestMotionPermission())) {
      e.target.checked = false;
      showToast('Motion access was denied — allow it in Settings › Safari › Motion & Orientation');
      return;
    }
    wallpaperState[key] = on;
    if (key === 'parallax' && !on) { wpInteract.targetX = wpInteract.targetY = 0; }
    refreshWallpaper();
  });
});
function syncWallpaperMotionUI() {
  document.getElementById('wallpaperTapRipple').checked = !!wallpaperState.tapRipple;
  document.getElementById('wallpaperDoubleTapPause').checked = !!wallpaperState.doubleTapPause;
  // Sensor toggles need a fresh permission tap on iOS, so they start off.
  document.getElementById('wallpaperShakeRandomize').checked = !!wallpaperState.shakeRandomize;
  document.getElementById('wallpaperParallaxToggle').checked = !!wallpaperState.parallax;
}

/* ---- live / still ---- */
function setWallpaperLive(live) {
  wallpaperState.live = live;
  wallpaperModeSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', (b.dataset.mode === 'live') === live));
  btnWallpaperNewFrame.hidden = live;
  if (live) startWallpaperAnimation();
  else { stopWallpaperAnimation(); drawWallpaperFrame(wallpaperFrozenT); }
}
wallpaperModeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (btn) setWallpaperLive(btn.dataset.mode === 'live');
});
btnWallpaperNewFrame.addEventListener('click', () => {
  wallpaperFrozenT = Math.random() * 60;
  drawWallpaperFrame(wallpaperFrozenT);
});

/* One place that pushes wallpaperState into every control — used by
   share links, undo/redo, recents, projects, looks and packs. */
function applyWallpaperStateToUI() {
  wallpaperSpeedSlider.value = Math.round(wallpaperState.speed * 10);
  wallpaperSpeedValue.textContent = `${wallpaperState.speed.toFixed(1)}×`;
  wallpaperHarmonySelect.value = wallpaperState.harmony || 'random';
  syncWallpaperBgUI();
  syncWallpaperStyleUI();
  renderWallpaperColorsList();
  syncWallpaperEffectsUI();
  syncWallpaperOverlayUI();
  syncWallpaperSeedUI();
  syncWallpaperMotionUI();
  wallpaperModeSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', (b.dataset.mode === 'live') === wallpaperState.live));
  btnWallpaperNewFrame.hidden = wallpaperState.live;
  refreshWallpaper();
}

/* ---- exports ---- */
function renderWallpaperExport(w, h, t, amoled) {
  const canvas = document.getElementById('exportCanvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  wpRenderScene(ctx, w, h, t, wallpaperState, { bufKey: 'export' });
  if (amoled) wpApplyAmoledCrush(ctx, w, h, 28);
  drawWatermark(ctx, w, h);
  return canvas;
}
function wpAmoledOn() { return document.getElementById('wallpaperAmoledToggle').checked; }
document.getElementById('btnDownloadWallpaperPng').addEventListener('click', () => {
  const size = resolveExportSize(wallpaperResolutionSelect);
  if (!size) return;
  const canvas = renderWallpaperExport(size.w, size.h, wallpaperFrozenT, wpAmoledOn());
  downloadCanvasPng(canvas, `wallpaper-${size.w}x${size.h}.png`);
  showToast('Wallpaper PNG downloaded');
});
document.getElementById('btnCopyWallpaperImage').addEventListener('click', () => {
  const size = resolveExportSize(wallpaperResolutionSelect);
  if (!size) return;
  copyCanvasToClipboard(renderWallpaperExport(size.w, size.h, wallpaperFrozenT, wpAmoledOn()));
});
document.getElementById('btnShareWallpaper').addEventListener('click', () => copyShareLink('wallpaper', wallpaperLookState()));
document.getElementById('btnExtractPaletteFromWallpaper').addEventListener('click', () => {
  const colors = extractColorsFromCanvas(wallpaperCanvas, paletteState.count || 5);
  if (!colors.length) { showToast('Could not read colors from the wallpaper'); return; }
  paletteState.colors = colors;
  paletteState.locked = colors.map(() => false);
  paletteState.count = colors.length;
  paletteCountSlider.value = paletteState.count;
  paletteCountValue.textContent = paletteState.count;
  renderPaletteSwatches();
  pushPaletteHistory();
  setActiveTab('palette');
  showToast('Palette extracted from this wallpaper');
});

/* Android: hand the image to the system "set wallpaper" screen. */
const btnSetAsWallpaper = document.getElementById('btnSetAsWallpaper');
if (isNativeApp() && window.Capacitor.Plugins.WallpaperSetter) btnSetAsWallpaper.hidden = false;
btnSetAsWallpaper.addEventListener('click', async () => {
  const { w, h } = getDeviceExportSize();
  const canvas = renderWallpaperExport(w, h, wallpaperFrozenT, wpAmoledOn());
  canvas.toBlob(async (blob) => {
    try {
      const base64 = await blobToBase64(blob);
      const written = await window.Capacitor.Plugins.Filesystem.writeFile({ path: `wallpaper-${Date.now()}.png`, data: base64, directory: 'CACHE', recursive: true });
      await window.Capacitor.Plugins.WallpaperSetter.setWallpaper({ uri: written.uri });
    } catch (e) {
      showToast('Could not open wallpaper chooser: ' + (e && e.message ? e.message : 'unknown error'));
    }
  }, 'image/png');
});

/* ---- live wallpaper video ----
   Two encoders, best first:
   1. WebCodecs + a small MP4 muxer (loaded on first use): every frame is
      rendered at an exact 1/30 s step and encoded offline, so the video is
      a smooth 30 fps on any device, however long each frame takes to draw.
   2. MediaRecorder (fallback where WebCodecs is missing): records in real
      time, so a slow device gets fewer frames.
   Either way the loop is seamless with no toggle: over the last stretch
   the frame crossfades into the frames from just *before* the start, so
   the last frame flows straight back into the first. */
const MP4_MUXER_SRC = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js';
let mp4MuxerLoading = null;
function loadMp4Muxer() {
  if (window.Mp4Muxer) return Promise.resolve(true);
  if (!mp4MuxerLoading) {
    mp4MuxerLoading = new Promise(resolve => {
      const sc = document.createElement('script');
      sc.src = MP4_MUXER_SRC;
      sc.onload = () => resolve(!!window.Mp4Muxer);
      sc.onerror = () => { mp4MuxerLoading = null; resolve(false); };
      document.head.appendChild(sc);
    });
  }
  return mp4MuxerLoading;
}
const WP_VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
function pickVideoType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return WP_VIDEO_TYPES.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || null;
}
function renderLoopFrame(ctx, w, h, t, L, fade) {
  wpRenderScene(ctx, w, h, t, wallpaperState, { bufKey: 'video' });
  if (t > L - fade) {
    const k = wpEase((t - (L - fade)) / fade);
    const buf = wpBuf('videoLoop', w, h);
    wpRenderScene(buf.getContext('2d'), w, h, t - L, wallpaperState, { bufKey: 'videoLoop' });
    ctx.save();
    ctx.globalAlpha = k;
    ctx.drawImage(buf, 0, 0);
    ctx.restore();
  }
  drawWatermark(ctx, w, h);
}
let wpVideoJob = null;
const wallpaperVideoSeg = document.getElementById('wallpaperVideoLengthSeg');
wallpaperVideoSeg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-seconds]');
  if (!b) return;
  const secs = Number(b.dataset.seconds);
  if (secs > 10 && !isProUnlocked()) {
    showToast('Videos longer than 10s are a Pro feature — unlock for ₹39');
    openProModal();
    return;
  }
  wallpaperState.videoSeconds = secs;
  syncWallpaperVideoUI();
});
function syncWallpaperVideoUI() {
  wallpaperVideoSeg.querySelectorAll('[data-seconds]').forEach(b => {
    const on = Number(b.dataset.seconds) === wallpaperState.videoSeconds;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
const nextPaint = () => new Promise(r => requestAnimationFrame(() => r()));
async function encodeWithWebCodecs(canvas, ctx, w, h, L, fade, fps, progress) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  if (!(await loadMp4Muxer())) return null;
  const bitrate = Math.min(20e6, Math.max(5e6, w * h * 5));
  // H.264 first (plays everywhere, iPhone/iPad Photos included); VP9 in
  // MP4 only where the device has no H.264 encoder.
  let config = null, muxCodec = 'avc';
  for (const [codec, mc] of [['avc1.640033', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42002a', 'avc'], ['avc1.42001f', 'avc'], ['vp09.00.40.08', 'vp9'], ['vp09.00.31.08', 'vp9']]) {
    const c = { codec, width: w, height: h, bitrate, framerate: fps };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; muxCodec = mc; break; } } catch (e) { /* try next */ }
  }
  if (!config) return null;
  const muxer = new window.Mp4Muxer.Muxer({ target: new window.Mp4Muxer.ArrayBufferTarget(), video: { codec: muxCodec, width: w, height: h }, fastStart: 'in-memory' });
  let encodeError = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encodeError = e; } });
  encoder.configure(config);
  const N = Math.round(L * fps);
  for (let i = 0; i < N; i++) {
    if (wpVideoJob.cancelled || encodeError) break;
    renderLoopFrame(ctx, w, h, i / fps, L, fade);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    progress((i + 1) / N);
    if (i % 3 === 2 || encoder.encodeQueueSize > 6) await nextPaint();
  }
  if (encodeError) throw encodeError;
  await encoder.flush();
  encoder.close();
  if (wpVideoJob.cancelled) return 'cancelled';
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
async function encodeWithRecorder(canvas, ctx, w, h, L, fade, progress) {
  const type = pickVideoType();
  if (!type || typeof canvas.captureStream !== 'function') return null;
  // In the document (invisibly): a detached canvas only hands its first
  // frame to captureStream in Chromium, which made a still video.
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(canvas);
  renderLoopFrame(ctx, w, h, 0, L, fade);
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0];
  const manual = !!(track && typeof track.requestFrame === 'function');
  if (!manual) { stream.getTracks().forEach(tr => tr.stop()); stream = canvas.captureStream(30); }
  const push = () => { if (manual) track.requestFrame(); };
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.min(16e6, Math.max(4e6, w * h * 4)) });
  wpVideoJob.recorder = recorder;
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(resolve => { recorder.onstop = resolve; });
  recorder.start(250);
  push();
  const start = performance.now();
  await new Promise(resolve => {
    function frame(now) {
      if (wpVideoJob.cancelled) { resolve(); return; }
      const t = (now - start) / 1000;
      if (t >= L) { resolve(); return; }
      renderLoopFrame(ctx, w, h, t, L, fade);
      push();
      progress(t / L);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await new Promise(r => setTimeout(r, 120));
  recorder.stop();
  await done;
  stream.getTracks().forEach(tr => tr.stop());
  canvas.remove();
  if (wpVideoJob.cancelled) return 'cancelled';
  return new Blob(chunks, { type: type.split(';')[0] });
}
async function exportWallpaperVideo() {
  if (wpVideoJob) return;
  const size = resolveExportSize(wallpaperResolutionSelect);
  if (!size) return;
  // Encoders want even sizes; the long side is capped at 1920 so phones
  // can keep up and every player can decode it.
  const k = Math.min(1, 1920 / Math.max(size.w, size.h));
  const w = Math.max(2, Math.round((size.w * k) / 2) * 2), h = Math.max(2, Math.round((size.h * k) / 2) * 2);
  const L = wallpaperState.videoSeconds || 10;
  const fade = Math.min(2, L * 0.25);
  const overlay = document.getElementById('videoProgressOverlay');
  const bar = document.getElementById('videoProgressBar');
  const label = document.getElementById('videoProgressLabel');
  const progress = (f) => { bar.style.width = `${Math.round(f * 100)}%`; };
  label.textContent = `Making a ${L}s live wallpaper (${w}×${h})…`;
  progress(0);
  overlay.hidden = false;
  wpVideoJob = { cancelled: false, recorder: null };
  const wasLive = wallpaperState.live;
  stopWallpaperAnimation();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  let blob = null;
  try {
    blob = await encodeWithWebCodecs(canvas, ctx, w, h, L, fade, 30, progress);
    if (!blob) {
      label.textContent = `Recording ${L}s at ${w}×${h}… keep Gradii open`;
      blob = await encodeWithRecorder(canvas, ctx, w, h, L, fade, progress);
    }
    if (!blob) showToast('This browser can’t make videos — try Chrome or Safari');
    else if (blob === 'cancelled') showToast('Cancelled');
    else {
      const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      saveFile(blob, `gradii-live-${w}x${h}-${L}s.${ext}`, blob.type);
      showToast(`Live wallpaper saved (${L}s ${ext.toUpperCase()}, seamless loop)`);
      haptic([10, 60, 10]);
    }
  } catch (err) {
    if (wpVideoJob.recorder && wpVideoJob.recorder.state !== 'inactive') { try { wpVideoJob.recorder.stop(); } catch (e) { /* ignore */ } }
    showToast('Video failed: ' + (err && err.message ? err.message : 'unknown error'));
  } finally {
    canvas.remove();
    wpVideoJob = null;
    overlay.hidden = true;
    if (wasLive && activeTab === 'wallpaper') startWallpaperAnimation();
  }
}
document.getElementById('btnExportWallpaperVideo').addEventListener('click', exportWallpaperVideo);
document.getElementById('btnCancelVideo').addEventListener('click', () => { if (wpVideoJob) wpVideoJob.cancelled = true; });

/* ---- more exports (Pro): batch zip, multi-monitor ---- */
document.getElementById('btnBatchExportWallpaper').addEventListener('click', async () => {
  if (!isProUnlocked()) { showToast('Batch export is a Pro feature — unlock for ₹39'); openProModal(); return; }
  if (typeof JSZip === 'undefined') { showToast('Zip library failed to load — try again online'); return; }
  const size = resolveExportSize(wallpaperResolutionSelect);
  if (!size) return;
  const count = clamp(Number(document.getElementById('wallpaperBatchCount').value) || 6, 2, 12);
  showToast(`Generating ${count} variations…`);
  const original = JSON.parse(JSON.stringify(wallpaperState));
  const zip = new JSZip();
  suppressRecentGenerated = true;
  for (let i = 0; i < count; i++) {
    randomizeWallpaperColorsOnly();
    newWallpaperSeed();
    const canvas = renderWallpaperExport(size.w, size.h, wallpaperFrozenT, wpAmoledOn());
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    zip.file(`wallpaper-${wallpaperState.seed}.png`, blob);
  }
  suppressRecentGenerated = false;
  wallpaperState = original;
  applyWallpaperStateToUI();
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveFile(zipBlob, 'gradii-wallpapers.zip', 'application/zip');
  showToast(`${count} wallpapers zipped and downloaded`);
});
document.getElementById('btnMultiMonitorExport').addEventListener('click', () => {
  if (!isProUnlocked()) { showToast('Multi-monitor export is a Pro feature — unlock for ₹39'); openProModal(); return; }
  const monitors = Number(document.getElementById('wallpaperMonitorCount').value) || 2;
  const w = 1920 * monitors, h = 1080;
  downloadCanvasPng(renderWallpaperExport(w, h, wallpaperFrozenT, wpAmoledOn()), `wallpaper-${monitors}monitor-${w}x${h}.png`);
  showToast(`${monitors}-monitor wallpaper downloaded — set your display mode to "Span"`);
});

function initWallpaperStudio() {
  if (!wallpaperState.seed) newWallpaperSeed();
  renderWallpaperStyleCats();
  renderWallpaperStyleGrid();
  renderWallpaperLooks();
  renderWallpaperPaletteOptions();
  wallpaperOnOpenSelect.value = isProUnlocked() ? getWallpaperOnOpen() : 'off';
  syncWallpaperVideoUI();
  applyWallpaperStateToUI();
  const onOpen = wallpaperOnOpenSelect.value;
  if (onOpen === 'daily') applyWallpaperOfTheDay();
  else if (onOpen === 'seasonal') applySeasonalWallpaperStyle();
}

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

  fullscreenContent.querySelectorAll('canvas.fx-layer').forEach(c => c.remove());
  if ((kind === 'gradient' && studioFxActive(gradientState.fx)) || (kind === 'mesh' && studioFxActive(meshState.fx))) {
    const c = document.createElement('canvas');
    c.className = 'fx-layer';
    fullscreenContent.prepend(c);
    requestAnimationFrame(() => paintStudioFx(kind, c, fullscreenContent));
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

/* Two words that summarize a palette's overall feel, from the average
   lightness (bright vs. dark) and saturation (vivid vs. muted) across
   its colors — a quick, automatic label rather than requiring someone
   to look at 6 hex codes and judge the mood themselves. */
function computeMoodLabel(colors) {
  if (!colors.length) return '';
  let totalL = 0, totalS = 0;
  colors.forEach(hex => {
    const { s, l } = hexToHsl(hex);
    totalL += l; totalS += s;
  });
  const avgL = totalL / colors.length;
  const avgS = totalS / colors.length;
  const brightness = avgL > 62 ? 'Light' : avgL < 35 ? 'Dark' : 'Balanced';
  const intensity = avgS > 55 ? 'Vibrant' : avgS < 25 ? 'Muted' : 'Soft';
  return `${brightness} & ${intensity}`;
}

let previousExtraction = null;

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreviewWrap.hidden = false;
    imagePreview.onload = async () => {
      if (extractedColors.length) previousExtraction = { colors: extractedColors, mood: computeMoodLabel(extractedColors) };
      extractedColors = await extractDominantColors(imagePreview, 6);
      renderExtractedPalette();
      imageActions.hidden = false;
      const moodBadge = document.getElementById('imageMoodBadge');
      moodBadge.textContent = `🎨 ${computeMoodLabel(extractedColors)}`;
      moodBadge.hidden = false;
      const compareBtn = document.getElementById('btnCompareExtractions');
      compareBtn.hidden = !previousExtraction;
      document.getElementById('imageDiffSection').hidden = true;
    };
  };
  reader.readAsDataURL(file);
}

function renderSwatchRow(container, colors) {
  container.innerHTML = '';
  colors.forEach(color => {
    const el = document.createElement('div');
    el.className = 'swatch';
    el.style.background = color;
    el.style.color = bestTextColor(color);
    el.innerHTML = `<span class="swatch-hex" style="font-size:0.68rem;">${color.toUpperCase()}</span>`;
    container.appendChild(el);
  });
}

document.getElementById('btnCompareExtractions').addEventListener('click', () => {
  if (!previousExtraction) return;
  const section = document.getElementById('imageDiffSection');
  section.hidden = !section.hidden;
  if (!section.hidden) {
    renderSwatchRow(document.getElementById('imageDiffPaletteA'), previousExtraction.colors);
    renderSwatchRow(document.getElementById('imageDiffPaletteB'), extractedColors);
    document.getElementById('imageDiffMoodA').textContent = previousExtraction.mood;
    document.getElementById('imageDiffMoodB').textContent = computeMoodLabel(extractedColors);
  }
});

/* Shared core of the color-extraction algorithm: bucket every opaque
   pixel into a coarse RGB grid, average each bucket, then greedily pick
   the most-populous buckets that are still far enough apart from ones
   already picked. Used both for an uploaded photo (extractDominantColors)
   and for reading colors straight off a generated wallpaper's own canvas
   (extractColorsFromCanvas) — same math, different pixel source. */
function clusterDominantColors(data, numColors) {
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

/* Uses the browser's native Shape Detection API when available (Chrome/
   Edge only — feature-detected, not a required dependency) to find
   faces and exclude them from sampling. A face's skin tones are rarely
   what someone means by "colors from this photo" and can otherwise
   dominate the palette on a portrait shot. Silently no-ops (falls back
   to sampling the whole image, exactly as before) wherever the API
   isn't supported, so this only ever improves the result, never breaks it. */
async function detectFaceRects(imgEl) {
  if (!('FaceDetector' in window)) return null;
  try {
    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
    const faces = await detector.detect(imgEl);
    return faces.length ? faces : null;
  } catch (e) {
    return null;
  }
}

async function extractDominantColors(imgEl, numColors) {
  const maxDim = 150;
  const scale = Math.min(1, maxDim / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const w = Math.max(1, Math.round(imgEl.naturalWidth * scale));
  const h = Math.max(1, Math.round(imgEl.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);

  const faces = await detectFaceRects(imgEl);
  if (faces) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    faces.forEach(f => {
      const box = f.boundingBox;
      ctx.fillRect(box.x * scale, box.y * scale, box.width * scale, box.height * scale);
    });
    ctx.restore();
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  return clusterDominantColors(data, numColors);
}

function extractColorsFromCanvas(canvas, numColors) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return clusterDominantColors(data, numColors);
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
        <span class="color-name">${colorName(color)}</span>
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
    wallpaperState = normalizeWallpaperState(Object.assign({ live: true }, state));
    applyWallpaperStateToUI();
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

/* Only surfaces when actually offline — the app still fully works from
   the service worker's cache at that point (see sw.js), but the person
   should know why a fresh site update or share link won't load right
   now, rather than assuming something's just broken. */
function updateOfflineIndicator() {
  document.getElementById('offlineIndicator').hidden = navigator.onLine;
}
window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);
updateOfflineIndicator();

/* ==========================================================================
   Keyboard shortcuts — customizable
   ----------------------------------------------------------------
   A single source of truth (DEFAULT_SHORTCUTS + userShortcuts overrides
   in localStorage) that every keydown listener below consults via
   shortcutMatches(), instead of hardcoding keys. The Shortcuts modal
   (openShortcutsModal) lets someone rebind any of these; nothing else
   needs to change when they do.
   ========================================================================== */

const DEFAULT_SHORTCUTS = {
  randomize: { key: ' ', ctrl: false, shift: false, label: 'Randomize current studio' },
  undo: { key: 'z', ctrl: true, shift: false, label: 'Undo' },
  redo: { key: 'z', ctrl: true, shift: true, label: 'Redo' },
  commandPalette: { key: 'k', ctrl: true, shift: false, label: 'Open command palette' },
  tab1: { key: '1', ctrl: false, shift: false, label: 'Switch to Gradient Studio' },
  tab2: { key: '2', ctrl: false, shift: false, label: 'Switch to Palette Studio' },
  tab3: { key: '3', ctrl: false, shift: false, label: 'Switch to Mesh Studio' },
  tab4: { key: '4', ctrl: false, shift: false, label: 'Switch to Wallpaper Studio' },
  tab5: { key: '5', ctrl: false, shift: false, label: 'Switch to Image Extract' },
};
const SHORTCUT_TABS = ['gradient', 'palette', 'mesh', 'wallpaper', 'image'];

let userShortcuts = {};
function loadShortcuts() {
  try {
    const raw = localStorage.getItem('gradii_shortcuts');
    userShortcuts = raw ? JSON.parse(raw) : {};
  } catch (e) { userShortcuts = {}; }
}
function saveShortcuts() {
  try { localStorage.setItem('gradii_shortcuts', JSON.stringify(userShortcuts)); } catch (e) { /* ignore */ }
}
function getShortcut(action) {
  return userShortcuts[action] || DEFAULT_SHORTCUTS[action];
}
function isMacPlatform() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
}
function formatShortcutKey(key) {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}
function formatShortcut(sc) {
  const parts = [];
  if (sc.ctrl) parts.push(isMacPlatform() ? '⌘' : 'Ctrl');
  if (sc.shift) parts.push(isMacPlatform() ? '⇧' : 'Shift');
  parts.push(formatShortcutKey(sc.key));
  return parts.join(isMacPlatform() && sc.ctrl ? '' : '+');
}
function shortcutMatches(e, action) {
  const sc = getShortcut(action);
  const key = sc.key === ' ' ? ' ' : sc.key.toLowerCase();
  const eKey = e.key === ' ' ? ' ' : e.key.toLowerCase();
  return eKey === key && !!sc.ctrl === !!(e.ctrlKey || e.metaKey) && !!sc.shift === !!e.shiftKey;
}
loadShortcuts();

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (shortcutMatches(e, 'randomize')) {
    e.preventDefault();
    if (activeTab === 'palette') generatePalette();
    else if (activeTab === 'gradient') randomizeGradient();
    else if (activeTab === 'mesh') randomizeMesh();
    else if (activeTab === 'wallpaper') randomizeWallpaperColors();
    return;
  }
  for (let i = 0; i < SHORTCUT_TABS.length; i++) {
    if (shortcutMatches(e, 'tab' + (i + 1))) {
      e.preventDefault();
      setActiveTab(SHORTCUT_TABS[i]);
      return;
    }
  }
  if (activeTab === 'palette' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    if (e.key === 'ArrowLeft') loadPaletteHistory(paletteHistoryIndex - 1);
    else loadPaletteHistory(paletteHistoryIndex + 1);
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

const gradientTempSlider = document.getElementById('gradientTempSlider');
const gradientTempValue = document.getElementById('gradientTempValue');
gradientTempSlider.addEventListener('input', () => {
  gradientState.temperature = Number(gradientTempSlider.value);
  gradientTempValue.textContent = gradientState.temperature > 0 ? `+${gradientState.temperature}` : `${gradientState.temperature}`;
  renderGradientPreview();
});

const gradientRepeatSlider = document.getElementById('gradientRepeatSlider');
const gradientRepeatValue = document.getElementById('gradientRepeatValue');
gradientRepeatSlider.addEventListener('input', () => {
  gradientState.repeat = Number(gradientRepeatSlider.value);
  gradientRepeatValue.textContent = `${gradientState.repeat}×`;
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
   Undo / redo (Gradient, Mesh, Wallpaper — Palette has its own history
   already, reused below rather than duplicated)
   ----------------------------------------------------------------
   Rather than hand-instrument every single control in each studio, this
   listens for any input/change/click inside the studio's own container
   and takes a debounced JSON snapshot once things settle — so nothing
   gets missed, and rapid slider drags collapse into one history entry
   instead of flooding the stack. undo()/redo() flush any pending
   snapshot first so "act, then immediately Ctrl+Z" always undoes the
   action that was just taken, not a stale one still waiting in the
   debounce window. ========================================================================== */
function createStudioHistory(containerSelector, getState, setState, rerender, debounceMs) {
  let stack = [];
  let idx = -1;
  let timer = null;
  let restoring = false;

  function snapshotNow() {
    if (restoring) return;
    const snap = JSON.stringify(getState());
    if (idx >= 0 && stack[idx] === snap) return;
    stack = stack.slice(0, idx + 1);
    stack.push(snap);
    if (stack.length > 40) stack.shift();
    idx = stack.length - 1;
  }
  function scheduleSnapshot() {
    clearTimeout(timer);
    timer = setTimeout(snapshotNow, debounceMs || 500);
  }
  function undo() {
    clearTimeout(timer);
    snapshotNow();
    if (idx <= 0) return false;
    idx--;
    restoring = true;
    setState(JSON.parse(stack[idx]));
    restoring = false;
    rerender();
    return true;
  }
  function redo() {
    clearTimeout(timer);
    snapshotNow();
    if (idx >= stack.length - 1) return false;
    idx++;
    restoring = true;
    setState(JSON.parse(stack[idx]));
    restoring = false;
    rerender();
    return true;
  }

  const container = document.querySelector(containerSelector);
  if (container) {
    ['input', 'change', 'click'].forEach(evt => container.addEventListener(evt, scheduleSnapshot));
  }
  /* The state one step back, without moving there — for the compare
     slider. Flushes a pending snapshot first so "previous" really means
     the version before what's on screen right now. */
  function peekPrevious() {
    clearTimeout(timer);
    snapshotNow();
    return idx > 0 ? JSON.parse(stack[idx - 1]) : null;
  }

  setTimeout(snapshotNow, 200);
  return { undo, redo, peekPrevious };
}

const gradientHistory = createStudioHistory(
  '.gradient-studio',
  () => gradientState,
  (s) => { gradientState = s; syncGradientControlsFromState(); renderStopsList(); renderGradientPreview(); },
  () => renderGradientPreview()
);
const meshHistory = createStudioHistory(
  '.mesh-studio',
  () => meshState,
  (s) => { meshState = s; renderMeshBlobsList(); renderMeshPreview(); },
  () => renderMeshPreview()
);
const wallpaperHistory = createStudioHistory(
  '.wallpaper-studio',
  () => wallpaperState,
  (s) => {
    wallpaperState = normalizeWallpaperState(s);
    applyWallpaperStateToUI();
  },
  () => refreshWallpaper()
);

document.addEventListener('keydown', (e) => {
  const isUndo = shortcutMatches(e, 'undo');
  const isRedo = shortcutMatches(e, 'redo') || ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'y');
  if (!isUndo && !isRedo) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  let handled = false;
  if (activeTab === 'gradient') handled = isUndo ? gradientHistory.undo() : gradientHistory.redo();
  else if (activeTab === 'mesh') handled = isUndo ? meshHistory.undo() : meshHistory.redo();
  else if (activeTab === 'wallpaper') handled = isUndo ? wallpaperHistory.undo() : wallpaperHistory.redo();
  else if (activeTab === 'palette') handled = isUndo ? loadPaletteHistory(paletteHistoryIndex - 1) : loadPaletteHistory(paletteHistoryIndex + 1);
  if (handled) { e.preventDefault(); showToast(isUndo ? 'Undo' : 'Redo'); }
});

/* ==========================================================================
   Cross-studio "recently generated" strip
   ----------------------------------------------------------------
   Separate from each studio's own undo history: this only captures the
   moment of a deliberate Randomize/Generate, across all four studios in
   one shared, always-visible strip — so a good result from three
   randomizes ago is still one click away even after switching tabs,
   without having to remember which studio it came from.
   ========================================================================== */
let recentGenerated = [];

function pushRecentGenerated(tab, thumbnailCss, state) {
  if (bootRandomizing) return;
  recentGenerated.unshift({ tab, thumbnailCss, state: JSON.parse(JSON.stringify(state)) });
  if (recentGenerated.length > 15) recentGenerated.length = 15;
  renderRecentStrip();
}

function renderRecentStrip() {
  const strip = document.getElementById('recentGeneratedStrip');
  strip.hidden = recentGenerated.length === 0;
  strip.innerHTML = '';
  recentGenerated.forEach((entry, i) => {
    const el = document.createElement('button');
    el.className = 'recent-thumb';
    el.style.background = entry.thumbnailCss;
    el.title = `${entry.tab.charAt(0).toUpperCase() + entry.tab.slice(1)} — click to restore`;
    el.addEventListener('click', () => restoreRecentGenerated(i));
    strip.appendChild(el);
  });
}

function restoreRecentGenerated(i) {
  const entry = recentGenerated[i];
  if (!entry) return;
  const state = JSON.parse(JSON.stringify(entry.state));
  if (entry.tab === 'gradient') {
    gradientState = state;
    syncGradientControlsFromState();
    renderStopsList();
    renderGradientPreview();
  } else if (entry.tab === 'palette') {
    paletteState = state;
    renderPaletteSwatches();
  } else if (entry.tab === 'mesh') {
    meshState = state;
    renderMeshBlobsList();
    renderMeshPreview();
  } else if (entry.tab === 'wallpaper') {
    wallpaperState = normalizeWallpaperState(state);
    applyWallpaperStateToUI();
  }
  setActiveTab(entry.tab);
  showToast('Restored from recent');
}

/* ==========================================================================
   Projects — a named bundle of all four studios' state at once
   ========================================================================== */
function loadProjects() {
  try { return JSON.parse(localStorage.getItem('gradii_projects') || '[]'); } catch (e) { return []; }
}
function saveProjectsList(list) {
  try { localStorage.setItem('gradii_projects', JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function saveCurrentAsProject(name) {
  const list = loadProjects();
  list.unshift({
    name: name || `Project — ${new Date().toLocaleString()}`,
    savedAt: Date.now(),
    gradient: JSON.parse(JSON.stringify(gradientState)),
    palette: JSON.parse(JSON.stringify(paletteState)),
    mesh: JSON.parse(JSON.stringify(meshState)),
    wallpaper: JSON.parse(JSON.stringify(wallpaperState)),
  });
  if (list.length > 20) list.length = 20;
  saveProjectsList(list);
}
function loadProject(index) {
  const list = loadProjects();
  const p = list[index];
  if (!p) return;
  gradientState = p.gradient;
  paletteState = p.palette;
  meshState = p.mesh;
  wallpaperState = normalizeWallpaperState(p.wallpaper);
  syncGradientControlsFromState();
  renderStopsList();
  renderGradientPreview();
  renderPaletteSwatches();
  renderMeshBlobsList();
  renderMeshPreview();
  applyWallpaperStateToUI();
  showToast(`Loaded project "${p.name}"`);
}

function renderProjectsList() {
  const list = loadProjects();
  const container = document.getElementById('projectsList');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<p class="hint" style="padding:0 4px;">No projects saved yet.</p>';
    return;
  }
  list.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'project-item';
    const swatchColors = (p.wallpaper && p.wallpaper.colors) || (p.gradient && p.gradient.stops.map(s => s.color)) || [];
    el.innerHTML = `
      <div class="project-item-swatches">${swatchColors.slice(0, 4).map(c => `<span class="project-item-swatch" style="background:${c}"></span>`).join('')}</div>
      <div class="project-item-info">
        <div class="project-item-name">${p.name}</div>
        <div class="project-item-date">${new Date(p.savedAt).toLocaleDateString()}</div>
      </div>
      <button class="project-item-remove" title="Delete">✕</button>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.project-item-remove')) return;
      loadProject(i);
      closeCommandPalette();
      document.getElementById('projectsOverlay').hidden = true;
    });
    el.querySelector('.project-item-remove').addEventListener('click', () => {
      const l = loadProjects();
      l.splice(i, 1);
      saveProjectsList(l);
      renderProjectsList();
    });
    container.appendChild(el);
  });
}

function openProjectsModal() {
  document.getElementById('projectsOverlay').hidden = false;
  renderProjectsList();
}
document.getElementById('btnCloseProjects').addEventListener('click', () => {
  document.getElementById('projectsOverlay').hidden = true;
});
document.getElementById('projectsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'projectsOverlay') document.getElementById('projectsOverlay').hidden = true;
});
document.getElementById('btnSaveProject').addEventListener('click', () => {
  const name = document.getElementById('projectNameInput').value.trim();
  saveCurrentAsProject(name);
  document.getElementById('projectNameInput').value = '';
  renderProjectsList();
  showToast('Project saved');
});

/* ==========================================================================
   Command palette (⌘K / Ctrl+K)
   ========================================================================== */
const COMMANDS = [
  { icon: '🎨', label: 'Switch to Gradient Studio', hint: '1', action: () => setActiveTab('gradient') },
  { icon: '🎨', label: 'Switch to Palette Studio', hint: '2', action: () => setActiveTab('palette') },
  { icon: '🎨', label: 'Switch to Mesh Studio', hint: '3', action: () => setActiveTab('mesh') },
  { icon: '🎨', label: 'Switch to Wallpaper Studio', hint: '4', action: () => setActiveTab('wallpaper') },
  { icon: '🎨', label: 'Switch to Image Extract', hint: '5', action: () => setActiveTab('image') },
  {
    icon: '🎲', label: 'Randomize current studio', hint: 'Space', action: () => {
      if (activeTab === 'palette') generatePalette();
      else if (activeTab === 'gradient') randomizeGradient();
      else if (activeTab === 'mesh') randomizeMesh();
      else if (activeTab === 'wallpaper') randomizeWallpaperColors();
    },
  },
  {
    icon: '↩', label: 'Undo', hint: '⌘Z', action: () => {
      if (activeTab === 'gradient') gradientHistory.undo();
      else if (activeTab === 'mesh') meshHistory.undo();
      else if (activeTab === 'wallpaper') wallpaperHistory.undo();
      else if (activeTab === 'palette') loadPaletteHistory(paletteHistoryIndex - 1);
    },
  },
  {
    icon: '↪', label: 'Redo', hint: '⌘⇧Z', action: () => {
      if (activeTab === 'gradient') gradientHistory.redo();
      else if (activeTab === 'mesh') meshHistory.redo();
      else if (activeTab === 'wallpaper') wallpaperHistory.redo();
      else if (activeTab === 'palette') loadPaletteHistory(paletteHistoryIndex + 1);
    },
  },
  { icon: '★', label: 'Save current gradient', action: () => document.getElementById('btnSaveGradient').click() },
  { icon: '★', label: 'Save current palette', action: () => document.getElementById('btnSavePalette').click() },
  { icon: '📋', label: 'Copy gradient CSS', action: () => document.getElementById('btnCopyCss').click() },
  {
    icon: '⬇', label: 'Download current tab as PNG', action: () => {
      const map = { gradient: 'btnDownloadPng', mesh: 'btnDownloadMeshPng', wallpaper: 'btnDownloadWallpaperPng' };
      const id = map[activeTab];
      if (id) document.getElementById(id).click(); else showToast('No PNG export on this tab');
    },
  },
  {
    icon: '🔗', label: 'Copy share link for current tab', action: () => {
      const map = { gradient: 'btnShareGradient', palette: 'btnSharePalette', mesh: 'btnShareMesh', wallpaper: 'btnShareWallpaper' };
      const id = map[activeTab];
      if (id) document.getElementById(id).click(); else showToast('No share link on this tab');
    },
  },
  { icon: '🌙', label: 'Theme: Light', action: () => applyTheme('light') },
  { icon: '✦', label: 'Theme: Dark', action: () => applyTheme('dark') },
  { icon: '🖥', label: 'Theme: Match System', action: () => applyTheme('system') },
  { icon: '⭐', label: 'Open Gradii Pro', action: () => openProModal() },
  { icon: '📁', label: 'Open Projects (save/load a whole session)', action: () => openProjectsModal() },
  { icon: '📁', label: 'Save current session as a Project', action: () => { openProjectsModal(); setTimeout(() => document.getElementById('projectNameInput').focus(), 50); } },
  { icon: '🎨', label: 'Extract palette from wallpaper', action: () => document.getElementById('btnExtractPaletteFromWallpaper').click() },
  { icon: '🔀', label: 'Remix wallpaper effects', action: () => document.getElementById('btnRemixWallpaper').click() },
  { icon: '📦', label: 'Batch export wallpapers', action: () => document.getElementById('btnBatchExportWallpaper').click() },
  { icon: '⌨', label: 'Keyboard Shortcuts', action: () => openShortcutsModal() },
  { icon: '❓', label: 'Replay onboarding tour', action: () => startOnboardingTour(true) },
];

let commandActiveIndex = 0;
let commandFiltered = COMMANDS;

function renderCommandList() {
  const list = document.getElementById('commandList');
  list.innerHTML = '';
  if (!commandFiltered.length) {
    list.innerHTML = '<div class="command-empty">No matching commands</div>';
    return;
  }
  commandFiltered.forEach((cmd, i) => {
    const el = document.createElement('div');
    el.className = 'command-item' + (i === commandActiveIndex ? ' active' : '');
    el.innerHTML = `<span class="command-icon">${cmd.icon}</span><span>${cmd.label}</span>${cmd.hint ? `<span class="command-hint">${cmd.hint}</span>` : ''}`;
    el.addEventListener('click', () => runCommand(cmd));
    list.appendChild(el);
  });
}

function runCommand(cmd) {
  closeCommandPalette();
  cmd.action();
}

function openCommandPalette() {
  document.getElementById('commandPaletteOverlay').hidden = false;
  const input = document.getElementById('commandInput');
  input.value = '';
  commandFiltered = COMMANDS;
  commandActiveIndex = 0;
  renderCommandList();
  setTimeout(() => input.focus(), 30);
}
function closeCommandPalette() {
  document.getElementById('commandPaletteOverlay').hidden = true;
}

document.getElementById('commandInput').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  commandFiltered = q ? COMMANDS.filter(c => c.label.toLowerCase().includes(q)) : COMMANDS;
  commandActiveIndex = 0;
  renderCommandList();
});

document.getElementById('commandInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); commandActiveIndex = Math.min(commandActiveIndex + 1, commandFiltered.length - 1); renderCommandList(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); commandActiveIndex = Math.max(commandActiveIndex - 1, 0); renderCommandList(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (commandFiltered[commandActiveIndex]) runCommand(commandFiltered[commandActiveIndex]); }
  else if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
});

document.getElementById('commandPaletteOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'commandPaletteOverlay') closeCommandPalette();
});

document.addEventListener('keydown', (e) => {
  // Only guard against typing when this shortcut has been customized down to
  // a bare key with no modifier — the Ctrl/⌘+K default is safe to catch even
  // while a text field is focused (same convention as most editors).
  const sc = getShortcut('commandPalette');
  if (!sc.ctrl && !sc.shift) {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  }
  if (shortcutMatches(e, 'commandPalette')) {
    e.preventDefault();
    const overlay = document.getElementById('commandPaletteOverlay');
    if (overlay.hidden) openCommandPalette(); else closeCommandPalette();
  }
});
document.getElementById('btnOpenCommandPalette').addEventListener('click', openCommandPalette);

/* ==========================================================================
   Keyboard shortcuts modal — rebind any action above
   ========================================================================== */

let shortcutCapturingAction = null;

function renderShortcutsList() {
  const list = document.getElementById('shortcutsList');
  list.innerHTML = '';
  Object.keys(DEFAULT_SHORTCUTS).forEach((action) => {
    const sc = getShortcut(action);
    const isCustom = !!userShortcuts[action];
    const isCapturing = shortcutCapturingAction === action;
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    row.innerHTML = `
      <span class="shortcut-row-label">${DEFAULT_SHORTCUTS[action].label}</span>
      <div class="shortcut-row-actions">
        <span class="shortcut-key${isCapturing ? ' capturing' : ''}">${isCapturing ? 'Press a key…' : formatShortcut(sc)}</span>
        <button class="btn btn-sm" data-shortcut-change="${action}">${isCapturing ? 'Cancel' : 'Change'}</button>
        ${isCustom ? `<button class="btn btn-sm" data-shortcut-reset="${action}" title="Reset to default">↺</button>` : ''}
      </div>`;
    list.appendChild(row);
  });
}

function beginShortcutCapture(action) {
  shortcutCapturingAction = action;
  renderShortcutsList();
}

function cancelShortcutCapture() {
  shortcutCapturingAction = null;
  renderShortcutsList();
}

document.getElementById('shortcutsList').addEventListener('click', (e) => {
  const changeBtn = e.target.closest('[data-shortcut-change]');
  const resetBtn = e.target.closest('[data-shortcut-reset]');
  if (changeBtn) {
    const action = changeBtn.dataset.shortcutChange;
    if (shortcutCapturingAction === action) cancelShortcutCapture();
    else beginShortcutCapture(action);
  } else if (resetBtn) {
    delete userShortcuts[resetBtn.dataset.shortcutReset];
    saveShortcuts();
    renderShortcutsList();
  }
});

// Capture-phase listener so a rebind (e.g. a bare letter) never also fires
// its old/new action or leaks into the page while the modal is capturing.
document.addEventListener('keydown', (e) => {
  if (!shortcutCapturingAction) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { cancelShortcutCapture(); return; }
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return; // wait for a real key
  const action = shortcutCapturingAction;
  const candidate = { key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, label: DEFAULT_SHORTCUTS[action].label };
  const collision = Object.keys(DEFAULT_SHORTCUTS).find((other) => {
    if (other === action) return false;
    const sc = getShortcut(other);
    return sc.key.toLowerCase() === (candidate.key === ' ' ? ' ' : candidate.key.toLowerCase())
      && !!sc.ctrl === !!candidate.ctrl && !!sc.shift === !!candidate.shift;
  });
  if (collision) {
    showToast(`Already used by "${DEFAULT_SHORTCUTS[collision].label}"`);
    cancelShortcutCapture();
    return;
  }
  userShortcuts[action] = candidate;
  saveShortcuts();
  shortcutCapturingAction = null;
  renderShortcutsList();
  showToast('Shortcut updated');
}, true);

function openShortcutsModal() {
  shortcutCapturingAction = null;
  renderShortcutsList();
  document.getElementById('shortcutsOverlay').hidden = false;
}
function closeShortcutsModal() {
  shortcutCapturingAction = null;
  document.getElementById('shortcutsOverlay').hidden = true;
}
document.getElementById('btnEyedropperInfo').addEventListener('click', openShortcutsModal);
document.getElementById('btnCloseShortcuts').addEventListener('click', closeShortcutsModal);
document.getElementById('shortcutsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'shortcutsOverlay') closeShortcutsModal();
});
document.getElementById('btnResetShortcuts').addEventListener('click', () => {
  userShortcuts = {};
  saveShortcuts();
  renderShortcutsList();
  showToast('Shortcuts reset to default');
});

/* ==========================================================================
   First-time onboarding tour
   ----------------------------------------------------------------
   Runs once automatically (gated on a localStorage flag) and can be
   replayed anytime via the command palette. Points at real, currently
   visible controls on the default (gradient) tab rather than switching
   tabs mid-tour, and skips any step whose target isn't actually on
   screen instead of highlighting nothing.
   ========================================================================== */

const ONBOARDING_STEPS = [
  { selector: '.tabs', title: 'Five studios, one app', text: 'Gradients, Palettes, Mesh, Wallpaper, and Image Extract — switch anytime, and your work in each is kept as you go.' },
  { selector: '#btnRandomGradient', title: 'Randomize anything', text: 'Click Randomize, or just press Space — it works on whichever studio tab you’re on.' },
  { selector: '#btnOpenCommandPalette', title: 'Command palette', text: 'Press Ctrl/⌘K to jump to any action: switch tabs, undo, export, change theme, and more.' },
  { selector: '#btnEyedropperInfo', title: 'Your shortcuts, your way', text: 'Every keyboard shortcut here can be rebound to whatever feels natural to you.' },
  { selector: '#themeToggle', title: 'Pick a look', text: 'Seven themes, including a high-contrast one for accessibility and one that follows your system automatically.' },
  { selector: '#btnOpenPro', title: 'Gradii Pro', text: 'Unlocks batch export, multi-monitor wallpapers, extra themes, and more — everything else here stays free.' },
];

let onboardingStepIndex = 0;
let onboardingActive = false;

const onboardingEls = {};
function getOnboardingEls() {
  if (!onboardingEls.top) {
    onboardingEls.top = document.getElementById('onboardingMaskTop');
    onboardingEls.bottom = document.getElementById('onboardingMaskBottom');
    onboardingEls.left = document.getElementById('onboardingMaskLeft');
    onboardingEls.right = document.getElementById('onboardingMaskRight');
    onboardingEls.ring = document.getElementById('onboardingRing');
    onboardingEls.card = document.getElementById('onboardingCard');
  }
  return onboardingEls;
}

function setOnboardingUiHidden(hidden) {
  const els = getOnboardingEls();
  [els.top, els.bottom, els.left, els.right, els.ring, els.card].forEach(el => { el.hidden = hidden; });
}

function positionOnboardingUi(target) {
  const els = getOnboardingEls();
  const r = target.getBoundingClientRect();
  const pad = 6;
  const top = Math.max(0, r.top - pad);
  const bottom = Math.min(window.innerHeight, r.bottom + pad);
  const left = Math.max(0, r.left - pad);
  const right = Math.min(window.innerWidth, r.right + pad);

  Object.assign(els.top.style, { top: '0px', left: '0px', width: '100%', height: `${top}px` });
  Object.assign(els.bottom.style, { top: `${bottom}px`, left: '0px', width: '100%', height: `${Math.max(0, window.innerHeight - bottom)}px` });
  Object.assign(els.left.style, { top: `${top}px`, left: '0px', width: `${left}px`, height: `${bottom - top}px` });
  Object.assign(els.right.style, { top: `${top}px`, left: `${right}px`, width: `${Math.max(0, window.innerWidth - right)}px`, height: `${bottom - top}px` });
  Object.assign(els.ring.style, { top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${bottom - top}px` });

  const cardRect = els.card.getBoundingClientRect();
  const gap = 12;
  let cardTop = bottom + gap;
  if (cardTop + cardRect.height > window.innerHeight - 16) cardTop = Math.max(16, top - gap - cardRect.height);
  let cardLeft = Math.min(left, window.innerWidth - cardRect.width - 16);
  cardLeft = Math.max(16, cardLeft);
  els.card.style.top = `${Math.round(cardTop)}px`;
  els.card.style.left = `${Math.round(cardLeft)}px`;
}

function renderOnboardingStep() {
  while (onboardingStepIndex < ONBOARDING_STEPS.length) {
    const step = ONBOARDING_STEPS[onboardingStepIndex];
    const target = document.querySelector(step.selector);
    if (target && target.getBoundingClientRect().width > 0) break;
    onboardingStepIndex++;
  }
  if (onboardingStepIndex >= ONBOARDING_STEPS.length) { endOnboardingTour(); return; }

  const step = ONBOARDING_STEPS[onboardingStepIndex];
  const target = document.querySelector(step.selector);
  // Always instant, never smooth: positionOnboardingUi() below reads the
  // target's post-scroll rect one frame later, and a smooth scroll (still
  // animating at that point) leaves the fixed card positioned from a stale
  // rect — it can end up placed outside the viewport entirely.
  target.scrollIntoView({ block: 'center', behavior: 'auto' });

  document.getElementById('onboardingStepCount').textContent = `Step ${onboardingStepIndex + 1} of ${ONBOARDING_STEPS.length}`;
  document.getElementById('onboardingTitle').textContent = step.title;
  document.getElementById('onboardingText').textContent = step.text;
  document.getElementById('btnOnboardingBack').style.visibility = onboardingStepIndex === 0 ? 'hidden' : 'visible';
  document.getElementById('btnOnboardingNext').textContent = onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? 'Done' : 'Next';

  requestAnimationFrame(() => positionOnboardingUi(target));
}

function onboardingResizeHandler() {
  if (!onboardingActive) return;
  const step = ONBOARDING_STEPS[onboardingStepIndex];
  if (!step) return;
  const target = document.querySelector(step.selector);
  if (target) positionOnboardingUi(target);
}
window.addEventListener('resize', onboardingResizeHandler);

function startOnboardingTour(force) {
  if (!force) {
    let seen = false;
    try { seen = localStorage.getItem('gradii_onboarding_seen') === '1'; } catch (e) { /* ignore */ }
    if (seen) return;
  }
  onboardingStepIndex = 0;
  onboardingActive = true;
  setOnboardingUiHidden(false);
  renderOnboardingStep();
}

function endOnboardingTour() {
  onboardingActive = false;
  setOnboardingUiHidden(true);
  try { localStorage.setItem('gradii_onboarding_seen', '1'); } catch (e) { /* ignore */ }
}

document.getElementById('btnOnboardingNext').addEventListener('click', () => {
  onboardingStepIndex++;
  if (onboardingStepIndex >= ONBOARDING_STEPS.length) endOnboardingTour();
  else renderOnboardingStep();
});
document.getElementById('btnOnboardingBack').addEventListener('click', () => {
  if (onboardingStepIndex > 0) { onboardingStepIndex--; renderOnboardingStep(); }
});
document.getElementById('btnOnboardingSkip').addEventListener('click', endOnboardingTour);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && onboardingActive) endOnboardingTour();
});
// The mask is click-through (see its CSS), so a click reaching anywhere
// outside the tour card means the person went straight for the real app
// instead of using Next/Skip — treat that as "got it" rather than trapping
// the click or leaving the tour open over whatever they just did.
document.addEventListener('click', (e) => {
  if (!onboardingActive) return;
  if (e.target.closest('#onboardingCard')) return;
  endOnboardingTour();
}, true);

/* ==========================================================================
   Init
   ========================================================================== */

let bootRandomizing = false;
function init() {
  /* A fresh look on every launch instead of the same violet→pink default
     each time — the first thing on screen should already show what
     Randomize does. Shared links (loadStateFromUrl, below) still win. */
  bootRandomizing = true;
  try {
    const count = 2 + Math.floor(Math.random() * 2);
    gradientState.stops = Array.from({ length: count }, (_, i) => ({ color: '#000000', pos: Math.round((i / (count - 1)) * 100) }));
    randomizeGradient();
    randomizeWallpaperColors();
    meshState.baseColor = wpBackgroundFor('auto', Math.random() * 360);
  } finally { bootRandomizing = false; }
  syncGradientControlsFromState();
  renderStopsList();
  renderGradientPreview();
  renderPresetTagFilter();
  renderPresets();
  renderSavedGradients();

  ensurePaletteArrays();
  paletteState.colors = generatePaletteColors('random', paletteState.count, [], paletteState.locked);
  renderPaletteSwatches();
  pushPaletteHistory();
  renderSavedPalettes();

  meshState.points = randomMeshPoints(5, meshState.family);
  renderMeshBlobsList();
  renderMeshPresets();
  renderMeshPreview();

  initWallpaperStudio();
  updateWallpaperResolutionHint();

  loadStateFromUrl();

  initGlobalPressFeedback();
  introReveal();

  setTimeout(() => startGuidedFirstRun(false), prefersReducedMotion ? 200 : 900);
}

/* ==========================================================================
   2026 redesign — interaction layer
   ----------------------------------------------------------------
   Everything here is an extra *path* to something the app already does
   (randomize, undo, copy, lock, export) — never the only path. Each
   gesture has a visible button equivalent, so nobody has to discover a
   gesture to get work done (a gesture is an accelerator, not a door).
   ========================================================================== */

/* ---- haptics ----
   Android WebView and Chrome support navigator.vibrate; iOS Safari
   silently doesn't, which is fine — haptics only ever confirm something
   already shown on screen. */
let hapticsOn = true;
try { hapticsOn = localStorage.getItem('gradii_haptics') !== '0'; } catch (e) { /* ignore */ }
function haptic(pattern) {
  if (!hapticsOn || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}
function setHaptics(on) {
  hapticsOn = on;
  try { localStorage.setItem('gradii_haptics', on ? '1' : '0'); } catch (e) { /* ignore */ }
  showToast(on ? 'Haptics on' : 'Haptics off');
  if (on) haptic(12);
}
['btnRandomGradient', 'btnRandomMesh', 'btnRandomWallpaperColors', 'btnGeneratePalette'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => haptic(10));
});

/* ---- color names ----
   A human name next to every hex, so a palette can be talked about
   ("the Harbor blue") and not only pasted. Hue buckets plus a lightness/
   saturation modifier — deliberately a small, predictable vocabulary
   rather than a 1,500-entry lookup whose nearest match is often absurd. */
const COLOR_HUE_NAMES = [
  [8, 'Scarlet'], [18, 'Vermilion'], [28, 'Ember'], [38, 'Tangerine'], [48, 'Amber'], [58, 'Marigold'],
  [68, 'Citron'], [80, 'Chartreuse'], [100, 'Lime'], [130, 'Fern'], [155, 'Jade'], [170, 'Mint'],
  [185, 'Lagoon'], [200, 'Tide Pool'], [212, 'Cerulean'], [225, 'Harbor'], [240, 'Cobalt'], [255, 'Iris'],
  [270, 'Violet'], [285, 'Dusk Plum'], [300, 'Orchid'], [318, 'Magenta'], [335, 'Fuchsia'], [348, 'Rosehip'], [361, 'Scarlet'],
];
function colorName(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (s < 12 || l < 6 || l > 96) {
    if (l < 12) return 'Ink';
    if (l < 30) return 'Graphite';
    if (l < 50) return 'Slate';
    if (l < 70) return 'Pewter';
    if (l < 90) return 'Fog';
    return 'Chalk';
  }
  if (h >= 18 && h < 50 && s < 40) return l < 35 ? 'Cocoa' : l < 62 ? 'Clay' : 'Sand';
  const base = COLOR_HUE_NAMES.find(n => h < n[0])[1];
  if (l < 28) return 'Deep ' + base;
  if (l > 78) return 'Pale ' + base;
  if (s < 35) return 'Dusty ' + base;
  return base;
}

/* ---- stage grip: resize the pinned preview on phones ---- */
const STAGE_SIZES = [
  { vh: 24, label: 'Compact' },
  { vh: 38, label: 'Balanced' },
  { vh: 58, label: 'Tall' },
];
let stageIndex = 1;
try { const saved = parseInt(localStorage.getItem('gradii_stage'), 10); if (saved >= 0 && saved < STAGE_SIZES.length) stageIndex = saved; } catch (e) { /* ignore */ }
function stagePx(i) { return Math.round(window.innerHeight * STAGE_SIZES[i].vh / 100); }
function applyStage(i, persist) {
  stageIndex = i;
  document.documentElement.style.setProperty('--stage-h', STAGE_SIZES[i].vh + 'vh');
  document.querySelectorAll('.stage-size').forEach(el => { el.textContent = STAGE_SIZES[i].label; });
  document.querySelectorAll('.sheet-grip').forEach(el => el.setAttribute('aria-valuenow', String(STAGE_SIZES[i].vh)));
  if (persist) { try { localStorage.setItem('gradii_stage', String(i)); } catch (e) { /* ignore */ } }
}
document.querySelectorAll('#panel-gradient .preview-frame, #panel-mesh .preview-frame, #panel-wallpaper .preview-frame').forEach(frame => {
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'sheet-grip';
  grip.setAttribute('role', 'slider');
  grip.setAttribute('aria-label', 'Preview size — tap to cycle, drag to resize');
  grip.setAttribute('aria-valuemin', '24');
  grip.setAttribute('aria-valuemax', '58');
  grip.innerHTML = '<span class="swipe-hint"></span><span class="stage-size"></span>';
  frame.appendChild(grip);
  frame.classList.add('has-grip');

  let startY = 0, startH = 0, moved = false, dragging = false;
  grip.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    startY = e.clientY;
    startH = stagePx(stageIndex);
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('stage-resizing');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    if (!moved) return;
    const h = clamp(startH + dy, stagePx(0) - 20, stagePx(STAGE_SIZES.length - 1) + 20);
    document.documentElement.style.setProperty('--stage-h', h + 'px');
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('stage-resizing');
    if (!moved) { applyStage((stageIndex + 1) % STAGE_SIZES.length, true); haptic(8); return; }
    const h = stagePx(stageIndex) + (e.clientY - startY);
    let best = 0;
    STAGE_SIZES.forEach((_, i) => { if (Math.abs(stagePx(i) - h) < Math.abs(stagePx(best) - h)) best = i; });
    applyStage(best, true);
    haptic(8);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  grip.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); applyStage(Math.max(0, stageIndex - 1), true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); applyStage(Math.min(STAGE_SIZES.length - 1, stageIndex + 1), true); }
  });
});
applyStage(stageIndex, false);

/* ---- flick the stage: ← new, → back ----
   Only a fast, mostly-horizontal flick from a touch counts (under 350ms,
   over 60px) — slow drags keep their existing meaning (setting the angle,
   moving a mesh blob). Because those drags have already nudged the design
   by the time a flick is recognised, the state captured at touch-down is
   restored first, so a flick never leaves a half-applied drag behind. */
const STAGE_FLICK = {
  gradient: {
    el: () => document.getElementById('gradientPreview'),
    snap: () => JSON.stringify(gradientState),
    restore: (j) => { gradientState = JSON.parse(j); syncGradientControlsFromState(); renderStopsList(); renderGradientPreview(); },
    next: () => randomizeGradient(),
    back: () => gradientHistory.undo(),
  },
  mesh: {
    el: () => document.getElementById('meshPreview'),
    snap: () => JSON.stringify(meshState),
    restore: (j) => { meshState = JSON.parse(j); renderMeshBlobsList(); renderMeshPreview(); },
    next: () => randomizeMesh(),
    back: () => meshHistory.undo(),
  },
  wallpaper: {
    el: () => document.getElementById('wallpaperCanvas'),
    snap: () => null,
    restore: () => {},
    next: () => randomizeWallpaperColors(),
    back: () => wallpaperHistory.undo(),
  },
  palette: {
    el: () => document.getElementById('paletteSwatches'),
    snap: () => null,
    restore: () => {},
    next: () => generatePalette(),
    back: () => loadPaletteHistory(paletteHistoryIndex - 1),
  },
};
Object.entries(STAGE_FLICK).forEach(([tab, cfg]) => {
  const el = cfg.el();
  if (!el) return;
  let start = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) { start = null; return; }
    if (e.target.closest('button, input, .compare-divider')) { start = null; return; }
    start = { x: e.clientX, y: e.clientY, t: performance.now(), snap: cfg.snap() };
  }, true);
  el.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = performance.now() - start.t;
    const snap = start.snap;
    start = null;
    if (dt > 350 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (snap) cfg.restore(snap);
    closeCompare();
    if (dx < 0) { cfg.next(); haptic(10); }
    else if (cfg.back()) { haptic([6, 40, 6]); showToast('Undo'); }
    else showToast('Nothing earlier — flick left for a new one');
  }, true);
  el.addEventListener('pointercancel', () => { start = null; }, true);
});

/* ---- long-press (or right-click) a palette color ---- */
const colorPop = document.getElementById('colorPop');
let colorPopIndex = -1;
let suppressNextClick = false;
function placePop(pop, x, y) {
  pop.hidden = false;
  const r = pop.getBoundingClientRect();
  const left = clamp(x - r.width / 2, 12, window.innerWidth - r.width - 12);
  const top = y + r.height + 16 > window.innerHeight ? Math.max(12, y - r.height - 12) : y + 12;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  const first = pop.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}
function openColorPop(i, x, y) {
  const color = paletteState.colors[i];
  if (!color) return;
  colorPopIndex = i;
  document.getElementById('colorPopChip').style.background = color;
  document.getElementById('colorPopName').textContent = colorName(color);
  document.getElementById('colorPopHex').textContent = color.toUpperCase();
  const v = currentVoice();
  const lockLabel = paletteState.locked[i] ? 'Unlock' : (v === VOICE.friendly ? 'Keep this color' : v === VOICE.playful ? 'Pin it' : 'Lock');
  colorPop.querySelector('[data-pop="lock"]').textContent = lockLabel;
  placePop(colorPop, x, y);
  haptic(15);
}
function closePops() {
  colorPop.hidden = true;
  collectionPop.hidden = true;
}
paletteSwatchesEl.addEventListener('pointerdown', (e) => {
  const sw = e.target.closest('.swatch');
  if (!sw || e.button > 0 || e.target.closest('button, input')) return;
  const i = Array.from(paletteSwatchesEl.children).indexOf(sw);
  const x0 = e.clientX, y0 = e.clientY;
  sw.classList.add('pressing');
  const timer = setTimeout(() => {
    sw.classList.remove('pressing');
    suppressNextClick = true;
    openColorPop(i, x0, y0);
  }, 480);
  const cancel = () => { clearTimeout(timer); sw.classList.remove('pressing'); cleanup(); };
  const move = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) cancel(); };
  function cleanup() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', cancel);
    window.removeEventListener('pointercancel', cancel);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', cancel);
  window.addEventListener('pointercancel', cancel);
});
paletteSwatchesEl.addEventListener('contextmenu', (e) => {
  const sw = e.target.closest('.swatch');
  if (!sw) return;
  e.preventDefault();
  if (colorPop.hidden) openColorPop(Array.from(paletteSwatchesEl.children).indexOf(sw), e.clientX, e.clientY);
});
paletteSwatchesEl.addEventListener('click', (e) => {
  if (suppressNextClick) { suppressNextClick = false; e.stopPropagation(); e.preventDefault(); }
}, true);
colorPop.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-pop]');
  if (!btn) return;
  const i = colorPopIndex;
  const color = paletteState.colors[i];
  closePops();
  if (!color) return;
  const act = btn.dataset.pop;
  if (act === 'hex') copyText(color.toUpperCase(), `${color.toUpperCase()} copied`);
  else if (act === 'rgb') { const { r, g, b } = hexToRgb(color); copyText(`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`, 'RGB copied'); }
  else if (act === 'lock') {
    paletteState.locked[i] = !paletteState.locked[i];
    renderPaletteSwatches();
    const v = currentVoice() || VOICE.precise;
    showToast(paletteState.locked[i] ? v.locked : v.unlocked);
    haptic(10);
  } else if (act === 'gradient') {
    const { h, s, l } = hexToHsl(color);
    gradientState.stops = [
      { color, pos: 0 },
      { color: hslToHex(h + 35, clamp(s, 40, 95), clamp(l + 8, 25, 80)), pos: 100 },
    ];
    syncGradientControlsFromState();
    renderStopsList();
    renderGradientPreview();
    setActiveTab('gradient');
    window.scrollTo({ top: 0 });
    showToast(`Gradient started from ${colorName(color)}`);
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.color-pop')) closePops();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePops(); });

/* ---- compare with the previous version ---- */
let compareState = null;
function closeCompare() {
  if (!compareState) return;
  compareState.layer.remove();
  compareState.divider.remove();
  compareState.tags.forEach(t => t.remove());
  compareState.btn.setAttribute('aria-pressed', 'false');
  compareState = null;
}
function openCompare(studio, btn) {
  const prev = studio === 'gradient' ? gradientHistory.peekPrevious() : meshHistory.peekPrevious();
  if (!prev) { showToast('Nothing to compare yet — change something first'); return; }
  const host = document.getElementById(studio === 'gradient' ? 'gradientPreview' : 'meshPreview');
  const layer = document.createElement('div');
  layer.className = 'compare-layer';
  if (studio === 'gradient') layer.style.background = buildGradientCss(prev);
  else {
    layer.style.backgroundColor = prev.baseColor;
    layer.style.backgroundImage = buildMeshCssLayers(prev).join(', ');
    layer.style.backgroundBlendMode = prev.blendMode;
  }
  const divider = document.createElement('div');
  divider.className = 'compare-divider';
  divider.setAttribute('role', 'slider');
  divider.setAttribute('tabindex', '0');
  divider.setAttribute('aria-label', 'Before / after position');
  const tagA = document.createElement('span'); tagA.className = 'compare-tag compare-tag-before'; tagA.textContent = 'Before';
  const tagB = document.createElement('span'); tagB.className = 'compare-tag compare-tag-after'; tagB.textContent = 'Now';
  host.append(layer, divider, tagA, tagB);
  const setPos = (pct) => {
    pct = clamp(pct, 0, 100);
    layer.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    divider.style.left = pct + '%';
    divider.setAttribute('aria-valuenow', String(Math.round(pct)));
    compareState.pct = pct;
  };
  compareState = { layer, divider, tags: [tagA, tagB], btn, pct: 50 };
  setPos(50);
  divider.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    divider.setPointerCapture(e.pointerId);
    const move = (ev) => { const r = host.getBoundingClientRect(); setPos(((ev.clientX - r.left) / r.width) * 100); };
    const up = () => { divider.removeEventListener('pointermove', move); divider.removeEventListener('pointerup', up); };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
  });
  divider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(compareState.pct - 5); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setPos(compareState.pct + 5); }
  });
  btn.setAttribute('aria-pressed', 'true');
}
document.querySelectorAll('.compare-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (compareState) { const same = compareState.btn === btn; closeCompare(); if (same) return; }
    openCompare(btn.dataset.compare, btn);
  });
});
document.querySelectorAll('.btn-primary, .tab-btn, .nav-btn').forEach(el => el.addEventListener('click', closeCompare));

/* ---- device mockup ---- */
let mockupStudio = 'gradient';
let mockupDevice = 'phone';
const mockupOverlay = document.getElementById('mockupOverlay');
const mockupCanvas = document.getElementById('mockupCanvas');
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}
function renderDesignInto(ctx, w, h) {
  if (mockupStudio === 'gradient') { drawGradientToCanvas(ctx, w, h, gradientState); wpApplyEffects(ctx, w, h, gradientState.fx, 0); }
  else if (mockupStudio === 'mesh') { drawMeshToCanvas(ctx, w, h, meshState); wpApplyEffects(ctx, w, h, meshState.fx, 0); }
  else wpRenderScene(ctx, w, h, wallpaperFrozenT, wallpaperState, { bufKey: 'mockup' });
}
function drawMockup() {
  const W = mockupCanvas.width, H = mockupCanvas.height;
  const ctx = mockupCanvas.getContext('2d');
  const colors = (mockupStudio === 'gradient' ? gradientState.stops.map(s => s.color)
    : mockupStudio === 'mesh' ? meshState.points.map(p => p.color) : wallpaperState.colors.slice(1))
    .filter(c => /^#[0-9a-f]{6}$/i.test(c));
  const c0 = colors[0] || '#6d5dfc', c1 = colors[colors.length - 1] || '#ff6b9d';
  // Backdrop: the design's own two ends, washed almost to white — the
  // device sits in its own light rather than on a generic grey.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, mixHex(c0, '#ffffff', 0.86));
  bg.addColorStop(1, mixHex(c1, '#ffffff', 0.9));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  let body, screen, radius, screenRadius;
  if (mockupDevice === 'phone') {
    const bh = H * 0.84, bw = bh * 0.49;
    body = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh }; radius = bw * 0.16;
    const inset = bw * 0.035;
    screen = { x: body.x + inset, y: body.y + inset, w: bw - inset * 2, h: bh - inset * 2 }; screenRadius = radius - inset;
  } else if (mockupDevice === 'tablet') {
    const bh = H * 0.82, bw = bh * 0.74;
    body = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh }; radius = bw * 0.06;
    const inset = bw * 0.04;
    screen = { x: body.x + inset, y: body.y + inset, w: bw - inset * 2, h: bh - inset * 2 }; screenRadius = radius * 0.55;
  } else {
    const bw = W * 0.72, bh = bw * 0.64;
    body = { x: (W - bw) / 2, y: H * 0.1, w: bw, h: bh }; radius = bw * 0.025;
    const inset = bw * 0.028;
    screen = { x: body.x + inset, y: body.y + inset, w: bw - inset * 2, h: bh - inset * 2.2 }; screenRadius = 4;
  }
  // Soft contact shadow
  ctx.save();
  ctx.shadowColor = 'rgba(20, 16, 40, 0.28)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  roundRectPath(ctx, body.x, body.y, body.w, body.h, radius);
  ctx.fillStyle = '#121216';
  ctx.fill();
  ctx.restore();
  // Bezel edge highlight
  roundRectPath(ctx, body.x + 1.5, body.y + 1.5, body.w - 3, body.h - 3, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Screen content
  const off = document.createElement('canvas');
  off.width = Math.round(screen.w); off.height = Math.round(screen.h);
  renderDesignInto(off.getContext('2d'), off.width, off.height);
  ctx.save();
  roundRectPath(ctx, screen.x, screen.y, screen.w, screen.h, screenRadius);
  ctx.clip();
  ctx.drawImage(off, screen.x, screen.y);
  // A faint glass sheen across the top-left
  const sheen = ctx.createLinearGradient(screen.x, screen.y, screen.x + screen.w * 0.6, screen.y + screen.h * 0.6);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
  ctx.restore();
  if (mockupDevice === 'phone') {
    const pw = screen.w * 0.3, ph = screen.w * 0.085;
    roundRectPath(ctx, body.x + (body.w - pw) / 2, screen.y + ph * 0.5, pw, ph, ph / 2);
    ctx.fillStyle = '#0a0a0c';
    ctx.fill();
  } else if (mockupDevice === 'laptop') {
    const baseY = body.y + body.h;
    const baseW = body.w * 1.16;
    ctx.fillStyle = '#c9c9cf';
    ctx.beginPath();
    ctx.moveTo(W / 2 - body.w / 2, baseY);
    ctx.lineTo(W / 2 + body.w / 2, baseY);
    ctx.lineTo(W / 2 + baseW / 2, baseY + H * 0.035);
    ctx.lineTo(W / 2 - baseW / 2, baseY + H * 0.035);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a9a9b1';
    roundRectPath(ctx, W / 2 - body.w * 0.09, baseY, body.w * 0.18, H * 0.012, 6);
    ctx.fill();
  }
  drawWatermark(ctx, W, H);
}
function openMockup(studio) {
  mockupStudio = studio;
  mockupOverlay.hidden = false;
  document.getElementById('btnMockupShare').hidden = !(navigator.canShare && navigator.share);
  drawMockup();
}
document.querySelectorAll('.mockup-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); openMockup(btn.dataset.mockup); }));
document.getElementById('btnCloseMockup').addEventListener('click', () => { mockupOverlay.hidden = true; });
mockupOverlay.addEventListener('click', (e) => { if (e.target === mockupOverlay) mockupOverlay.hidden = true; });
document.getElementById('mockupDeviceSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-device]');
  if (!b) return;
  mockupDevice = b.dataset.device;
  document.querySelectorAll('#mockupDeviceSeg .seg-btn').forEach(x => {
    x.classList.toggle('active', x === b);
    x.setAttribute('aria-checked', x === b ? 'true' : 'false');
  });
  drawMockup();
});
document.getElementById('btnMockupDownload').addEventListener('click', () => {
  downloadCanvasPng(mockupCanvas, `gradii-${mockupStudio}-${mockupDevice}-mockup.png`);
  showToast('Mockup PNG downloaded');
});
document.getElementById('btnMockupShare').addEventListener('click', () => {
  mockupCanvas.toBlob(async (blob) => {
    const file = new File([blob], `gradii-${mockupStudio}-${mockupDevice}.png`, { type: 'image/png' });
    if (!navigator.canShare({ files: [file] })) { showToast('Sharing images isn’t supported here — use Download'); return; }
    try { await navigator.share({ files: [file], title: 'Made in Gradii' }); } catch (err) { /* user cancelled */ }
  }, 'image/png');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mockupOverlay.hidden) mockupOverlay.hidden = true; });

/* ---- collections for saved palettes ---- */
let activeCollection = 'all';
const collectionPop = document.getElementById('collectionPop');
function getCollections() {
  try { const l = JSON.parse(localStorage.getItem('gradii_collections') || '[]'); return Array.isArray(l) ? l : []; }
  catch (e) { return []; }
}
function setCollections(list) {
  try { localStorage.setItem('gradii_collections', JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function createCollection(name) {
  name = (name || '').trim().slice(0, 32);
  if (!name) return null;
  const list = getCollections();
  if (!list.includes(name)) { list.push(name); setCollections(list); }
  return name;
}
function renderCollectionBar() {
  const bar = document.getElementById('collectionBar');
  if (!bar) return;
  const saved = getSavedPalettes();
  const cols = getCollections();
  if (activeCollection !== 'all' && !cols.includes(activeCollection)) activeCollection = 'all';
  bar.innerHTML = '';
  const chip = (label, key, count) => {
    const b = document.createElement('button');
    b.className = 'collection-chip' + (activeCollection === key ? ' active' : '');
    b.innerHTML = `${escapeHtmlText(label)}<span class="count">${count}</span>`;
    b.setAttribute('aria-pressed', activeCollection === key ? 'true' : 'false');
    b.addEventListener('click', () => { activeCollection = key; renderSavedPalettes(); });
    bar.appendChild(b);
  };
  chip('All', 'all', saved.length);
  cols.forEach(c => chip(c, c, saved.filter(p => p.collection === c).length));
  const add = document.createElement('button');
  add.className = 'collection-chip';
  add.textContent = '+ New collection';
  add.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'text-input collection-new-input';
    input.placeholder = 'Name, then Enter';
    input.maxLength = 32;
    add.replaceWith(input);
    input.focus();
    const commit = () => {
      const name = createCollection(input.value);
      if (name) { activeCollection = name; showToast(`Collection “${name}” created`); }
      renderSavedPalettes();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderSavedPalettes(); });
    input.addEventListener('blur', () => { if (input.isConnected) commit(); });
  });
  bar.appendChild(add);
}
function escapeHtmlText(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function openCollectionPop(paletteId, anchor) {
  const item = getSavedPalettes().find(p => p.id === paletteId);
  if (!item) return;
  collectionPop.innerHTML = '<div class="color-pop-title">Move to</div>';
  const opt = (label, key) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    if ((item.collection || null) === key) b.classList.add('current');
    b.addEventListener('click', () => {
      const list = getSavedPalettes().map(p => (p.id === paletteId ? { ...p, collection: key || undefined } : p));
      setSavedPalettes(list);
      closePops();
      renderSavedPalettes();
      showToast(key ? `Moved to ${key}` : 'Removed from collection');
    });
    collectionPop.appendChild(b);
  };
  getCollections().forEach(c => opt(c, c));
  opt('No collection', null);
  const input = document.createElement('input');
  input.className = 'text-input';
  input.placeholder = 'New collection…';
  input.maxLength = 32;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const name = createCollection(input.value);
    if (!name) return;
    const list = getSavedPalettes().map(p => (p.id === paletteId ? { ...p, collection: name } : p));
    setSavedPalettes(list);
    closePops();
    renderSavedPalettes();
    showToast(`Moved to ${name}`);
  });
  collectionPop.appendChild(input);
  const r = anchor.getBoundingClientRect();
  placePop(collectionPop, r.left + r.width / 2, r.bottom);
}

/* ---- guided first run ----
   Three decisions, each one tap, ending on a real result instead of a
   tour of controls: what you're making → a mood → your first design,
   live in the studio, with the two or three gestures worth knowing. */
const GUIDE_MAKES = [
  { key: 'gradient', title: 'A background', sub: 'Smooth gradient for a site, slide or wallpaper' },
  { key: 'palette', title: 'A color palette', sub: '5 colors that work together, with names' },
  { key: 'wallpaper', title: 'A live wallpaper', sub: 'Animated, sized for your phone or tablet' },
  { key: 'mesh', title: 'A soft blend', sub: 'Blurry mesh of colors, drag the blobs around' },
];
const GUIDE_MOODS = {
  calm: { title: 'Calm', hues: [[175, 235]], s: [30, 55], l: [58, 80] },
  bold: { title: 'Bold', hues: [[0, 360]], s: [80, 95], l: [45, 56], spread: 120 },
  sunset: { title: 'Sunset', hues: [[330, 400]], s: [72, 92], l: [52, 66] },
  ocean: { title: 'Ocean', hues: [[180, 235]], s: [60, 88], l: [28, 58] },
  forest: { title: 'Forest', hues: [[85, 160]], s: [32, 60], l: [24, 50] },
  neon: { title: 'Neon', hues: [[0, 360]], s: [95, 100], l: [52, 60], spread: 150 },
  pastel: { title: 'Pastel', hues: [[0, 360]], s: [60, 78], l: [80, 88], spread: 140 },
  mono: { title: 'Mono', hues: [[0, 360]], s: [8, 18], l: [18, 82], spread: 0 },
};
function moodColors(moodKey, n) {
  const m = GUIDE_MOODS[moodKey] || GUIDE_MOODS.bold;
  const [h0, h1] = m.hues[0];
  const r = (a, b) => a + Math.random() * (b - a);
  const base = r(h0, h1);
  const spread = m.spread ?? (h1 - h0);
  const out = Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const h = (m.spread != null ? base + (t - 0.5) * spread : h0 + t * (h1 - h0) + r(-8, 8)) % 360;
    const l = moodKey === 'mono' ? m.l[0] + t * (m.l[1] - m.l[0]) : r(m.l[0], m.l[1]);
    return hslToHex((h + 360) % 360, r(m.s[0], m.s[1]), l);
  });
  return out;
}
function applyMoodTo(studio, mood) {
  if (studio === 'gradient') {
    const cols = moodColors(mood, 3);
    gradientState.stops = cols.map((c, i) => ({ color: c, pos: Math.round((i / (cols.length - 1)) * 100) }));
    if (gradientState.type === 'linear') gradientState.angle = Math.round(100 + Math.random() * 60);
    syncGradientControlsFromState(); renderStopsList(); renderGradientPreview();
    pushRecentGenerated('gradient', buildGradientCss(gradientState), gradientState);
  } else if (studio === 'palette') {
    paletteState.count = 5;
    paletteState.colors = moodColors(mood, 5);
    paletteState.locked = paletteState.colors.map(() => false);
    paletteCountSlider.value = 5; paletteCountValue.textContent = '5';
    renderPaletteSwatches(); pushPaletteHistory();
  } else if (studio === 'mesh') {
    const cols = moodColors(mood, 5);
    meshState.points = randomMeshPoints(5, meshState.family).map((p, i) => ({ ...p, color: cols[i] }));
    meshState.baseColor = Math.random() < 0.5 ? mixHex(cols[0], '#000000', 0.55) : mixHex(cols[0], '#ffffff', 0.85);
    renderMeshBlobsList(); renderMeshPreview();
  } else if (studio === 'wallpaper') {
    const cols = moodColors(mood, 3);
    wallpaperState.colors = [wpBackgroundFor(wallpaperState.bgMode, hexToHsl(cols[0]).h), ...cols];
    wallpaperState.locked = wallpaperState.colors.map(() => false);
    renderWallpaperColorsList();
    refreshWallpaper();
  }
  if (typeof updateAuroraBackdrop === 'function') updateAuroraBackdrop();
}
const guideEl = {
  overlay: document.getElementById('guideOverlay'),
  step: document.getElementById('guideStep'),
  title: document.getElementById('guideTitle'),
  options: document.getElementById('guideOptions'),
  back: document.getElementById('btnGuideBack'),
  shuffle: document.getElementById('btnGuideShuffle'),
  done: document.getElementById('btnGuideDone'),
  skip: document.getElementById('btnGuideSkip'),
};
const guide = { step: 0, make: null, mood: null };
function renderGuide() {
  const g = guideEl;
  g.overlay.classList.toggle('result', guide.step === 2);
  g.overlay.querySelectorAll('.guide-progress i').forEach((bar, i) => bar.classList.toggle('done', i <= guide.step));
  g.step.textContent = `Step ${guide.step + 1} of 3`;
  g.back.hidden = guide.step === 0;
  g.shuffle.hidden = guide.step !== 2;
  g.done.hidden = guide.step !== 2;
  g.skip.hidden = guide.step === 2;
  g.options.innerHTML = '';
  g.options.className = 'guide-options';
  if (guide.step === 0) {
    g.title.textContent = 'What are you making?';
    GUIDE_MAKES.forEach(m => {
      const b = document.createElement('button');
      b.className = 'guide-option';
      const sample = m.key === 'palette'
        ? `linear-gradient(90deg, #ff6b9d 0 20%, #ffb02e 20% 40%, #22d3c5 40% 60%, #6d5dfc 60% 80%, #1c1830 80%)`
        : m.key === 'mesh' ? 'radial-gradient(circle at 25% 30%, #ff6b9d, transparent 55%), radial-gradient(circle at 75% 70%, #22d3c5, transparent 55%), #6d5dfc'
        : m.key === 'wallpaper' ? 'linear-gradient(160deg, #0f1020 20%, #6d5dfc 70%, #ff6b9d)' : 'linear-gradient(120deg, #6d5dfc, #ff6b9d)';
      b.innerHTML = `<i style="background:${sample}"></i><b>${m.title}</b><small>${m.sub}</small>`;
      b.addEventListener('click', () => { guide.make = m.key; guide.step = 1; setActiveTab(m.key); renderGuide(); });
      g.options.appendChild(b);
    });
  } else if (guide.step === 1) {
    g.title.textContent = 'Pick a mood';
    g.options.classList.add('moods');
    Object.entries(GUIDE_MOODS).forEach(([key, m]) => {
      const b = document.createElement('button');
      b.className = 'guide-option';
      const cols = moodColors(key, 3);
      b.innerHTML = `<i style="background:linear-gradient(120deg, ${cols.join(', ')})"></i><b>${m.title}</b>`;
      b.addEventListener('click', () => {
        guide.mood = key; guide.step = 2;
        applyMoodTo(guide.make, key);
        haptic(12);
        renderGuide();
      });
      g.options.appendChild(b);
    });
  } else {
    g.title.textContent = 'Here’s your first one';
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const tips = document.createElement('ul');
    tips.className = 'guide-tips';
    const items = [];
    items.push(touch ? '<b>Flick the preview</b> left for a new one, right to go back.' : '<b>Space</b> makes a new one, <b>⌘/Ctrl Z</b> goes back.');
    if (guide.make === 'palette') items.push(`<b>${touch ? 'Long-press' : 'Right-click'} a color</b> to copy, lock or start a gradient from it.`);
    else if (guide.make === 'wallpaper') items.push('<b>The phone icon on the preview</b> shows it on a device; Live/Static switches animation.');
    else items.push('<b>⇆ on the preview</b> compares with the version before; <b>the phone icon</b> shows it on a device.');
    items.push(touch ? '<b>Drag the grip</b> under the preview to make it bigger or smaller.' : '<b>⌘/Ctrl K</b> finds any action or theme by name.');
    tips.innerHTML = items.map(t => `<li>${t}</li>`).join('');
    g.options.className = '';
    g.options.appendChild(tips);
  }
}
function finishGuide() {
  guideEl.overlay.hidden = true;
  try { localStorage.setItem('gradii_onboarding_seen', '1'); } catch (e) { /* ignore */ }
}
function startGuidedFirstRun(force) {
  let seen = false;
  try { seen = localStorage.getItem('gradii_onboarding_seen') === '1'; } catch (e) { /* ignore */ }
  if (seen && !force) return false;
  // A shared link opens straight into someone's design — don't cover it.
  if (!force && new URLSearchParams(location.search).get('d')) return false;
  guide.step = 0; guide.make = null; guide.mood = null;
  guideEl.overlay.hidden = false;
  renderGuide();
  const first = guideEl.options.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  return true;
}
guideEl.skip.addEventListener('click', finishGuide);
guideEl.done.addEventListener('click', () => { finishGuide(); showToast('Have fun'); });
guideEl.back.addEventListener('click', () => { guide.step = Math.max(0, guide.step - 1); renderGuide(); });
guideEl.shuffle.addEventListener('click', () => { applyMoodTo(guide.make, guide.mood); haptic(10); });
guideEl.overlay.addEventListener('click', (e) => { if (e.target === guideEl.overlay && guide.step < 2) finishGuide(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !guideEl.overlay.hidden) finishGuide(); });

/* ---- command palette: new entries ---- */
[
  { icon: '⇆', label: 'Compare with previous version', action: () => {
    const btn = document.querySelector(`.compare-btn[data-compare="${activeTab}"]`);
    if (btn) btn.click(); else showToast('Compare works in Gradient and Mesh');
  } },
  { icon: '▯', label: 'Show on a device (mockup)', action: () => {
    if (['gradient', 'mesh', 'wallpaper'].includes(activeTab)) openMockup(activeTab); else showToast('Mockups work in Gradient, Mesh and Wallpaper');
  } },
  { icon: '🎬', label: 'Save live wallpaper video', action: () => { setActiveTab('wallpaper'); exportWallpaperVideo(); } },
  { icon: '★', label: 'Save this wallpaper look', action: () => { setActiveTab('wallpaper'); document.getElementById('btnSaveWallpaperLook').click(); } },
  { icon: '🎲', label: 'Wallpaper: new colors only', action: () => { setActiveTab('wallpaper'); randomizeWallpaper('colors'); } },
  { icon: '🎲', label: 'Wallpaper: new layout only', action: () => { setActiveTab('wallpaper'); randomizeWallpaper('layout'); } },
  { icon: '✦', label: 'Guided start (3 steps)', action: () => startGuidedFirstRun(true) },
  { icon: '❓', label: 'Feature tour', action: () => startOnboardingTour(true) },
  { icon: '▤', label: 'New palette collection', action: () => { setActiveTab('palette'); setTimeout(() => { const add = document.querySelector('#collectionBar .collection-chip:last-child'); if (add) { add.scrollIntoView({ block: 'center' }); add.click(); } }, 250); } },
  { icon: '〰', label: 'Haptics: turn on / off', action: () => setHaptics(!hapticsOn) },
  ...['darkroom', 'paintchip', 'prism', 'specsheet', 'outline', 'aurora', 'bento', 'editorial', 'neon'].map(t => ({
    icon: '◐', label: `Theme: ${THEME_LABEL[t]}`, action: () => {
      if (!isThemeUnlocked(t)) { showToast(THEME_LABEL[t] + ' is a Pro theme — unlock for ₹39'); openProModal(); return; }
      applyTheme(t);
    },
  })),
].forEach(c => COMMANDS.push(c));
const replayIdx = COMMANDS.findIndex(c => c.label === 'Replay onboarding tour');
if (replayIdx >= 0) COMMANDS.splice(replayIdx, 1);
if (window.matchMedia('(hover: none)').matches) {
  const cmdBtn = document.getElementById('btnOpenCommandPalette');
  cmdBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
  cmdBtn.title = 'Search actions and themes';
  cmdBtn.setAttribute('aria-label', 'Search actions and themes');
}
applyVoice();


init();
