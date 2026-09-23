# Gradii — feature idea backlog

A running wishlist of features discussed but not yet built. Not a commitment
or a roadmap with dates — just ideas worth remembering. Pull from here when
picking what to build next; update it as ideas get built or dropped.

Phases 1 through 4 (frontend-only, minus anything text-related) have
shipped — items below are marked ✅ **Done** with a one-line note on how.
Only the big backend build (#49/#50) remains open.

## Gradient Studio

1. ✅ **Done** — **Dithering toggle** — "Reduce banding" checkbox; ordered 4×4 Bayer dithering applied to PNG exports only.
2. ✅ **Done** — **Drag-to-set angle/position** — drag directly on the preview; compass-bearing math for linear angle, direct % mapping for radial/conic center.
3. **Non-linear stop easing** — ease-in/out blending between stops instead of always-linear interpolation.
4. ✅ **Done** — **Mood/tag-browsable presets** — tag-chip filter (Warm/Cool/Pastel/Neon/Dark/Vibrant) above the presets grid.
5. ✅ **Done** — **Crossfade preview between two saved gradients** — a small "Saved Gradients" grid (shift-click two to compare), OKLCH-blended live preview, "Use This Blend" to commit.
6. ✅ **Done** — **Temperature slider** — non-destructive cool↔warm tint, applied at render time on top of the stored stop colors.
7. ✅ **Done** — **Repeating conic/linear gradients** — a 1×–6× Repeat slider, using `repeating-*-gradient` in CSS and stop-cycling on canvas export.

## Palette Studio

8. ✅ **Done** — **Arrow-key browsing** — ← → steps through the last 30 generated palettes; also ⌘Z/⌘⇧Z.
9. ✅ **Done** — **CVD collision warning** — flags swatch pairs that land too close together under any simulated CVD type (reuses the app's existing filter matrices).
10. **Lock hue, vary lightness/saturation** — largely covered already by the existing "Shades"/"Monochromatic" harmonies; not rebuilt separately.
11. ✅ **Done** — **Material/Ant Design-style scale export** — new "50–900 Shade Scale" export option, OKLCH-ramped from swatch 1.
12. **Import from a pasted image URL** — not just an uploaded file.
13. **Palette "story" mode** — auto-suggest primary/secondary/accent/background/text roles from 5 swatches.
14. ✅ **Already existed** — Tailwind Config and CSS Variables were already in the export dropdown before this round.

## Mesh Studio

15. ✅ **Done** — **Alternate generator families** — 8 layouts (Scatter, Layered Waves, Radial Burst, Grid, Spiral, Symmetric, Corners, Rings) via a new "Layout" selector.
16. **Blob shape variation** — investigated, not shipped: CSS radial-gradient's "size" is currently encoded as the transparent-stop position (percent of the implicit farthest-corner radius), not a real box-relative ellipse size. Switching to explicit two-axis ellipse sizing to get real per-blob squish would change what every existing blob's `size` value visually means, breaking today's presets/defaults, or need a live-preview/export mismatch. Needs a deliberate sizing-model decision, not a quick add.
17. **Live flow-field motion preview** — a subtle animated preview before committing a mesh to Wallpaper Studio.
18. ✅ **Done** — **Per-blob opacity/softness** — new "Soft" slider per blob row.
19. ✅ **Done** — **Snap-to-grid / alignment guides** — dragging a blob shows and snaps to guide lines when near another blob's x/y or the center line, Figma/Sketch-style.
20. ✅ **Done** — **One-click promote to Wallpaper Studio** — "Send to Wallpaper" button loads the mesh as a Flowing Mesh pattern.

## Wallpaper Studio

21. ✅ **Done** — **Extract palette from wallpaper** — "Extract Palette from This" reuses the same clustering algorithm as Image Extract, fed the wallpaper canvas directly.
22. ✅ **Done** — **Visible seed/recipe code** — a seed field next to Randomize Colors; same seed always reproduces the same colors (mulberry32 PRNG).
23. ✅ **Done** — **Batch export** — "Batch Export (.zip)" generates 2–12 randomized variations at the selected resolution and zips them (JSZip); Pro-gated.
24. ✅ **Done** — **Accelerometer parallax** — web-tech only (`DeviceOrientationEvent`), opt-in toggle; only wired into the exported Live HTML File (not the in-app preview, since that's the artifact that actually runs standalone on a phone). Canvas is oversized ~112% and CSS-transformed within that slack based on tilt angle; handles iOS 13+'s permission-on-gesture requirement.
25. ✅ **Done** — **Loop-perfect toggle** — wraps the time value modulo the loop length so every rendered frame is a pure function of a repeating phase; Record Video and the Live HTML export both honor it.
26. ✅ **Done** — **Exportable effect "recipe" JSON** — Save/Load Recipe buttons round-trip pattern+colors+speed+effects as a small JSON file.
27. ✅ **Partially covered** — **Wallpaper "chapters"** — scoped down from true background rotation (would need native Kotlin/Java WorkManager code, unverifiable without a physical device) to an in-app, localStorage-backed feature: save named looks with a start hour, optionally auto-apply the time-matching one when the app is opened/foregrounded. This limitation is stated directly in the shipped UI copy, not hidden.
28. **Text/quote overlay layer** — excluded (text-related).
29. ✅ **Done** — **Time-of-day color shift** — piecewise-linear warm/cool hue-blend by local hour, applied non-destructively at render time (never mutates stored colors); opt-in toggle.
30. ✅ **Done** — **Multi-monitor export** — a single wide PNG (1920×N per monitor) spanning 2–3 displays; the pattern renders continuously across the seams since every wp* pattern positions blobs/bands as fractions of canvas w/h. Pro-gated.
31. ✅ **Done** — **"Remix" a saved design** — "Remix Effects" re-rolls grain/vignette/glow/duotone only, keeping pattern and colors.

## Image Extract

32. ✅ **Done** — **Side-by-side palette diffing** — "⇄ Compare with previous image" shows the last two extractions stacked.
33. ✅ **Done** — **Smart-crop sampling** — uses the native Shape Detection API (`FaceDetector`, Chrome/Edge only, feature-detected) to mask out detected faces before clustering colors; silently no-ops to the old behavior everywhere else.
34. ✅ **Done** — **Auto mood label** — e.g. "Dark & Vibrant", computed from average lightness/saturation of the extracted colors.

## Cross-cutting / whole app

35. ✅ **Done** — **Undo/redo stack** — ⌘Z/⌘⇧Z per studio; a debounced auto-snapshot on any input/change/click inside each studio's container, so nothing needs manual instrumentation. Palette reuses its existing arrow-key history.
36. ✅ **Done** — **Command palette (⌘K)** — fuzzy-filtered list of ~20 actions (switch tab, randomize, undo/redo, save, export, theme, Pro, Projects), arrow-key navigable.
37. ✅ **Done** — **First-time onboarding tour** — 6-step spotlight tour (tabs, randomize, command palette, shortcuts, theme, Pro), shows once automatically and replays anytime via the command palette. Points at real controls on the default tab rather than a generic walkthrough; a step is skipped if its target isn't actually on screen instead of highlighting nothing.
38. ✅ **Done** — **Custom keyboard shortcut remapping** — every shortcut (randomize, undo, redo, command palette, the five tab switches) now goes through one configurable source of truth instead of hardcoded keys; a Shortcuts modal (the ⌨ topbar icon) lets you rebind any of them, with collision detection and a reset-to-default.
39. ✅ **Done** — **Named local "projects"** — a Projects modal (via ⌘K) bundles gradient+palette+mesh+wallpaper state under one name, save/load/delete.
40. ✅ **Done** — **Cross-studio "recently generated" strip** — a persistent thumbnail strip below the topbar, populated on every Randomize/Generate across all 4 studios, click to restore.
41. ✅ **Done** — **Offline-status indicator** — a banner appears only while `navigator.onLine` is false; silent the rest of the time by design.
42. ✅ **Done** — **Copy-as-image to clipboard** — "Copy Image" next to PNG download on Gradient/Mesh/Wallpaper, and in Palette's export menu.

## Accessibility

43. ✅ **Already existed** — the CVD preview (`[data-vision]` SVG filters) already covered Palette/Mesh/Wallpaper before this round, not just Gradient.
44. ✅ **Done** — **System-tied dark/light auto-switch** — new "Match System" option in the theme picker, live-follows `prefers-color-scheme` via a change listener (not just a one-time default).
45. **Alt-text/description generator** — excluded (text-related).
46. ✅ **Done** — **High-contrast "outline" theme** — a 7th theme, pure black/white, thick borders instead of shadows, yellow focus rings. Free, not Pro-gated — accessibility isn't a paywalled feature here.

## Interop / sharing

47. ✅ **Partially covered** — Figma Variables (JSON) export already existed for Gradient and Palette before this round. Sketch format still not built.
48. ✅ **Partially covered** — the existing QR/share-link mechanism already encodes the full state (pattern+colors+effects, not just a bare link) for every studio, and decodes it back on scan. What's still missing for "fully offline": the QR only round-trips through a URL the site has to serve — true offline (scan-to-decode without the site) would need an in-app camera + QR-decode step, not just generation. Not built.

## Phase 3 — shipped (accelerometer parallax, chapters, time-of-day shift — see #24/#27/#29 above for the actual scoping decisions each one landed with)

## Phase 4 — shipped (onboarding tour, keyboard shortcut remapping — see #37/#38 above)

## Phase 5 — Live Wallpaper expansion (all Pro, behind the "Advanced Mode" toggle)

Everything in this section lives behind a new "⚙ Advanced Mode" toggle at
the top of Wallpaper Studio, which itself requires Pro (same convention
as `PRO_THEMES` in the theme menu: visible, but an unlicensed attempt
reverts the toggle and opens the Pro modal rather than hiding that the
feature exists). The 8 patterns disappear from the dropdown and the
whole Advanced section hides when the toggle is off; anything already
selected reverts to Flowing Mesh.

**8 more generative patterns:**
51. ✅ **Done** — **Starfield** — drifting depth-parallax particles, positions from a per-index hash (not `Math.random()`) so they hold still and just drift, no per-frame randomness.
52. ✅ **Done** — **Plasma** — classic sine-interference plasma, sampled on a coarse grid (a full-resolution per-pixel loop benchmarked far too slow for 60fps) and colored by walking the wallpaper's own color stops.
53. ✅ **Done** — **Ripple** — concentric rings expanding outward from a handful of centers, each fading as it grows.
54. ✅ **Done** — **Voronoi Cells** — nearest-seed-color fill on a coarse grid, seeds drifting in slow orbits so cell boundaries shift instead of jumping.
55. ✅ **Done** — **Kaleidoscope** — one wedge clipped and filled with drifting blobs, mirrored on alternating wedges and repeated via `ctx.rotate` for 8-fold symmetry.
56. ✅ **Done** — **Cloud Drift** — layered sine waves standing in for true Perlin noise (real value noise needs a cached grid to look continuous, which no wp*-prefixed function can keep — see the self-containment note in the code); smooth and fully continuous in time on their own.
57. ✅ **Done** — **Lava Lamp** — blobs that rise, drift sideways, and sink in a slow vertical loop (not flowingMesh's circular drift), `ctx.filter` blur applied to a box around each blob rather than the full canvas to keep the cost down.
58. ✅ **Done** — **Moiré** — two line grids at a deliberate angle+spacing delta, screen-blended so their overlap produces real interference bands (an early pass used too small an angle delta between the grids and barely showed any beat pattern — tuned after actually looking at a render, not just reasoning about the math).

**Touch & motion interactions** (only do anything in the exported Live HTML File, opened somewhere that forwards real touch/sensor events — a live-wallpaper app, or the file itself on a phone browser; never the in-app preview, same scoping as tilt parallax):
59. ✅ **Done** — **Tap-to-ripple** — a tap spawns an expanding, fading ring at that point.
60. ✅ **Done** — **Shake-to-randomize** — a sudden jerk in `accelerationIncludingGravity` (rate-limited to once per 1.2s) rerolls the colors, reusing the same seeded mulberry32 PRNG as the in-app Randomize Colors button.
61. ✅ **Done** — **Double-tap to pause/resume** — shares one tap listener with Tap-to-ripple (a second tap within 300ms is the double-tap); resuming shifts the clock forward by however long it was paused so the animation doesn't jump.

**Adaptive behavior:**
62. ✅ **Done** — **Real sunrise/sunset** — upgrades the existing (fixed-hour-curve) Time-of-day tint to use actual local sunrise/sunset via a one-time geolocation fetch and a self-contained NOAA solar-calculator approximation; silently keeps the fixed curve if location is denied or unavailable.
63. ✅ **Done** — **Battery-aware low-power mode** — feature-detected against `navigator.getBattery` (removed in most browsers over fingerprinting concerns, so this silently never engages on most devices — same graceful-degradation convention as the Shape Detection API used for Image Extract); caps the frame rate and drops grain/glow below 20% battery instead of stopping the wallpaper outright.
64. ✅ **Done** — **Seasonal auto-style** — a deterministic month→style-pack pick, applied once when the app opens if the toggle is on. Overridden by Chapters if that's also on (least to most specific: day-of-year pick, then season, then Chapters' own deliberately-configured window).
65. ✅ **Done** — **Wallpaper of the day** — a deterministic day-of-year hash into the style-pack list; same look all day on this device, a different one tomorrow, no server or stored "today's pick" needed.
66. ✅ **Done** — **Depth-layered parallax** — adds a second, sparse dust-particle canvas above the main one that tilts at a stronger multiplier than tilt parallax's existing single layer — two things moving at different rates reads as real depth, one flat tilted image doesn't. Needs Tilt parallax turned on too.

**Not built** (native-code-only, or too unreliable to ship as a real feature — same "scope down and say so" treatment as Chapters and the OKLCH gamut-mapping note elsewhere in this doc):
67. **Material You / dynamic system-accent-color sync** — Android 12+'s dynamic color is a native API with no web-JS access at all; would need a custom native Kotlin Capacitor plugin, unverifiable without a physical Android 12+ device. Out of scope for a web-tech-only feature set.
68. **Different wallpaper for lock screen vs. home screen** — needs the app to actually be a native `android.service.wallpaper.WallpaperService` distinguishing `FLAG_LOCK`/`FLAG_SYSTEM`; this app isn't one at all today (Wallpaper Studio generates/exports images and an HTML file, it doesn't register as a system wallpaper engine) — a much larger native Android undertaking than anything else built in this backlog.
69. **Ambient light sensor** — Chrome/Android WebView's `AmbientLightSensor` API is deprecated/restricted for the same fingerprinting reasons as the Battery API and essentially never fires on real devices today; shipping a toggle for it would be dead code giving a false impression of a working feature, so it was left out rather than added as a silent no-op.

## The big one

49. **Community gallery** (Supabase-backed) — browse, like, and remix other users' saved designs. The one feature here that's a real backend build, not a static-app addition — deliberately sequenced after everything else, per earlier discussion.
50. **Public profile / collections** — once a gallery exists, let people group their own saved designs into named, shareable collections (natural follow-on to #49, not worth building standalone).
