# Gradii — feature idea backlog

A running wishlist of features discussed but not yet built. Not a commitment
or a roadmap with dates — just ideas worth remembering. Pull from here when
picking what to build next; update it as ideas get built or dropped.

Phase 1 and Phase 2 (frontend-only, minus anything text-related) have
shipped — items below are marked ✅ **Done** with a one-line note on how.
Phases 3 (APK-native) and 4 (polish) are still open.

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
24. **Accelerometer parallax** (APK only) — layers shift slightly as the phone tilts, standard Android live-wallpaper trick.
25. ✅ **Done** — **Loop-perfect toggle** — wraps the time value modulo the loop length so every rendered frame is a pure function of a repeating phase; Record Video and the Live HTML export both honor it.
26. ✅ **Done** — **Exportable effect "recipe" JSON** — Save/Load Recipe buttons round-trip pattern+colors+speed+effects as a small JSON file.
27. **Scheduled wallpaper "chapters"** (APK) — auto-rotate different looks by time of day.
28. **Text/quote overlay layer** — excluded (text-related).
29. **Time-of-day color shift** (APK) — color temperature drifts with local time.
30. ✅ **Done** — **Multi-monitor export** — a single wide PNG (1920×N per monitor) spanning 2–3 displays; the pattern renders continuously across the seams since every wp* pattern positions blobs/bands as fractions of canvas w/h. Pro-gated.
31. ✅ **Done** — **"Remix" a saved design** — "Remix Effects" re-rolls grain/vignette/glow/duotone only, keeping pattern and colors.

## Image Extract

32. ✅ **Done** — **Side-by-side palette diffing** — "⇄ Compare with previous image" shows the last two extractions stacked.
33. ✅ **Done** — **Smart-crop sampling** — uses the native Shape Detection API (`FaceDetector`, Chrome/Edge only, feature-detected) to mask out detected faces before clustering colors; silently no-ops to the old behavior everywhere else.
34. ✅ **Done** — **Auto mood label** — e.g. "Dark & Vibrant", computed from average lightness/saturation of the extracted colors.

## Cross-cutting / whole app

35. ✅ **Done** — **Undo/redo stack** — ⌘Z/⌘⇧Z per studio; a debounced auto-snapshot on any input/change/click inside each studio's container, so nothing needs manual instrumentation. Palette reuses its existing arrow-key history.
36. ✅ **Done** — **Command palette (⌘K)** — fuzzy-filtered list of ~20 actions (switch tab, randomize, undo/redo, save, export, theme, Pro, Projects), arrow-key navigable.
37. **First-time onboarding tour** — contextual, dismissible tooltips.
38. **Custom keyboard shortcut remapping**.
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

## Phase 3 — APK-native (needs a real device rebuild+test cycle)

- #24 Accelerometer parallax
- #27 Scheduled wallpaper "chapters"
- #29 Time-of-day color shift

## Phase 4 — polish (needs its own design pass)

- #37 First-time onboarding tour
- #38 Custom keyboard shortcut remapping

## The big one

49. **Community gallery** (Supabase-backed) — browse, like, and remix other users' saved designs. The one feature here that's a real backend build, not a static-app addition — deliberately sequenced after everything else, per earlier discussion.
50. **Public profile / collections** — once a gallery exists, let people group their own saved designs into named, shareable collections (natural follow-on to #49, not worth building standalone).
