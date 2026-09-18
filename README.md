# Gradii — Gradient & Color Palette Studio

A comprehensive, dependency-free gradient and color palette tool that runs entirely in the browser — no build step, no backend.

Open `index.html` in any modern browser to use it, or run a local server (`python3 -m http.server`) so features like drag-and-drop and the installable app work without any `file://` quirks.

## Features

### Gradient Studio
- Linear, radial, and conic gradients with 2–8 color stops
- Angle, shape, and center-position controls
- 26 curated gradient presets
- One-click randomizer
- Live CSS output (click to copy)
- Export as PNG, `.css`, `.scss`, or a Tailwind arbitrary-value class
- **Share** a gradient via a link that encodes the full design

### Mesh Gradient Studio
- Organic, "Stripe-style" mesh gradients built from layered soft color blobs
- Full per-blob control: color, X/Y position, and size, with add/remove (3–10 blobs)
- Manual base color picker and 8 blend modes (screen, multiply, overlay, difference, and more)
- 8 curated mesh presets to start from
- Randomizer, live CSS output, PNG export, and shareable links

### Wallpaper Studio
- 5 animated pattern types: Flowing Mesh, Aurora Flow, Radial Pulse, Conic Spin, and Wave Bands
- **Live** mode plays a continuous canvas animation; **Static** mode freezes a frame (with a "New Frame" reroll) for a still wallpaper
- Adjustable speed and a 2–6 color palette per pattern, plus 8 curated presets
- Export as a PNG at common wallpaper resolutions (phone, desktop, 4K, square, ultrawide), a recorded 6-second WebM video loop, or a **self-contained, self-playing HTML file** you can point live-wallpaper apps (Wallpaper Engine, Lively Wallpaper) at, or just open fullscreen in a browser
- **Share** a wallpaper design via a link that encodes the full design

### Palette Studio
- Generate 3–8 color palettes using harmony rules: random, monochromatic, analogous, complementary, split-complementary, triadic, tetradic, or shades
- Lock colors you like and regenerate the rest — press **Space** to reroll
- Fine-tune any swatch with the native color picker, or the **EyeDropper** tool (Chromium browsers) to sample colors from your screen
- Built-in WCAG contrast badges for each color against white/black text
- Save palettes to your browser (localStorage) and reload them later
- Export as PNG, CSS custom properties, SCSS variables, a Tailwind config snippet, Adobe Swatch Exchange (`.ase`), GIMP palette (`.gpl`), JSON, or plain text
- **Share** a palette via a link that encodes the full design

### Image Color Extractor
- Drag & drop or upload any image
- Extracts dominant colors client-side (histogram quantization — no upload, no server)
- Send the extracted palette straight into the Palette Studio

### Accessibility
- Built-in colorblindness simulator (Protanopia, Deuteranopia, Tritanopia, Achromatopsia) applied live to previews and swatches
- WCAG contrast badges on every palette swatch

### Motion
- GSAP drives the big "quirky" moments: a staggered intro reveal, tab-crossfade transitions, an elastic bounce on every randomize/generate action, a theme-icon flip, and a bouncy toast entrance
- anime.js handles playful staggered grid reveals (palette swatches, preset grids) and a confetti burst when you copy a hex code
- Motion One provides lightweight press/hover feedback on buttons and swatches
- All motion respects `prefers-reduced-motion` and degrades gracefully if a library fails to load

### Extras
- Light/dark theme toggle (remembers your choice)
- Animated, theme-aware background
- Keyboard shortcut: **Space** randomizes the gradient, mesh, palette, or wallpaper colors depending on the active tab
- Installable as a PWA (works offline once installed, thanks to a service worker)
- Mobile-tuned touch UI: 44px+ tap targets, no accidental input-zoom, safe-area padding for notches/gesture bars, and a native Android wrapper (see below)

## Android app

The `Gradii.apk` build wraps this same web app in a Capacitor WebView shell — same code, no separate mobile version to maintain. It ships with:
- A dedicated launcher icon, splash screen, and status bar color matching the app's brand and current light/dark theme
- `windowSoftInputMode="adjustResize"` so the keyboard never covers an input
- The same mobile-tuned CSS as the web app (44px touch targets, 16px form fields to avoid iOS/Android auto-zoom, `touch-action: manipulation` to remove tap delay)

It's a debug-signed build (the standard Android developer signing key) — installable directly on a device via "install from unknown sources," not intended for Play Store distribution as-is.

## Deployment

A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) publishes this site to GitHub Pages automatically on every push to `main`. To activate it, go to **Settings → Pages** in the repository and set **Source** to **GitHub Actions** — no build step needed since the site is already static.

## Tech

Plain HTML, CSS, and JavaScript — no frameworks, no build tools, no external runtime dependencies (only a Google Font is loaded for typography).
