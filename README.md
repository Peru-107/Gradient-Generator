# Gradii — Gradient & Color Palette Studio

A comprehensive, dependency-free gradient and color palette tool that runs entirely in the browser — no build step, no backend.

Open `index.html` in any modern browser to use it.

## Features

### Gradient Studio
- Linear, radial, and conic gradients with 2–8 color stops
- Angle, shape, and center-position controls
- 26 curated gradient presets
- One-click randomizer
- Live CSS output (click to copy)
- Download the gradient as a PNG image or a `.css` file

### Palette Studio
- Generate 3–8 color palettes using harmony rules: random, monochromatic, analogous, complementary, split-complementary, triadic, tetradic, or shades
- Lock colors you like and regenerate the rest — press **Space** to reroll
- Fine-tune any swatch with the native color picker, or the **EyeDropper** tool (Chromium browsers) to sample colors from your screen
- Built-in WCAG contrast badges for each color against white/black text
- Save palettes to your browser (localStorage) and reload them later
- Export as PNG image, CSS custom properties, JSON, or plain text

### Image Color Extractor
- Drag & drop or upload any image
- Extracts dominant colors client-side (histogram quantization — no upload, no server)
- Send the extracted palette straight into the Palette Studio

### Extras
- Light/dark theme toggle (remembers your choice)
- Animated, theme-aware background
- Keyboard shortcut: **Space** randomizes the gradient or palette depending on the active tab

## Tech

Plain HTML, CSS, and JavaScript — no frameworks, no build tools, no external runtime dependencies (only a Google Font is loaded for typography).
