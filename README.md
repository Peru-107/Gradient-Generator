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
- Adjustable blob count and softness
- Randomizer, live CSS output, PNG export, and shareable links

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

### Extras
- Light/dark theme toggle (remembers your choice)
- Animated, theme-aware background
- Keyboard shortcut: **Space** randomizes the gradient, mesh, or palette depending on the active tab
- Installable as a PWA (works offline once installed, thanks to a service worker)

## Deployment

A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) publishes this site to GitHub Pages automatically on every push to `main`. To activate it, go to **Settings → Pages** in the repository and set **Source** to **GitHub Actions** — no build step needed since the site is already static.

## Tech

Plain HTML, CSS, and JavaScript — no frameworks, no build tools, no external runtime dependencies (only a Google Font is loaded for typography).
