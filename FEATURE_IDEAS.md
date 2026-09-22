# Gradii — feature idea backlog

A running wishlist of features discussed but not yet built. Not a commitment
or a roadmap with dates — just ideas worth remembering. Pull from here when
picking what to build next; update it as ideas get built or dropped.

Phase 1 (frontend-only quick wins, minus anything text-related) shipped —
items below are marked ✅ **Done** with a one-line note on how. Everything
else is still open, grouped into Phases 2–4 further down.

## Gradient Studio

1. ✅ **Done** — **Dithering toggle** — "Reduce banding" checkbox; ordered 4×4 Bayer dithering applied to PNG exports only.
2. **Drag-to-set angle/position** — grab the gradient preview itself to set angle/position, instead of only a slider.
3. **Non-linear stop easing** — ease-in/out blending between stops instead of always-linear interpolation.
4. ✅ **Done** — **Mood/tag-browsable presets** — tag-chip filter (Warm/Cool/Pastel/Neon/Dark/Vibrant) above the presets grid.
5. **Crossfade preview between two saved gradients** — see the blend between two designs before committing to one.
6. ✅ **Done** — **Temperature slider** — non-destructive cool↔warm tint, applied at render time on top of the stored stop colors.
7. ✅ **Done** — **Repeating conic/linear gradients** — a 1×–6× Repeat slider, using `repeating-*-gradient` in CSS and stop-cycling on canvas export.

## Palette Studio

8. ✅ **Done** — **Arrow-key browsing** — ← → steps through the last 30 generated palettes.
9. ✅ **Done** — **CVD collision warning** — flags swatch pairs that land too close together under any simulated CVD type (reuses the app's existing filter matrices).
10. **Lock hue, vary lightness/saturation** — largely covered already by the existing "Shades"/"Monochromatic" harmonies; not rebuilt separately.
11. ✅ **Done** — **Material/Ant Design-style scale export** — new "50–900 Shade Scale" export option, OKLCH-ramped from swatch 1.
12. **Import from a pasted image URL** — not just an uploaded file.
13. **Palette "story" mode** — auto-suggest primary/secondary/accent/background/text roles from 5 swatches.
14. ✅ **Already existed** — Tailwind Config and CSS Variables were already in the export dropdown before tonight.

## Mesh Studio

15. ✅ **Done** — **Alternate generator families** — 8 layouts (Scatter, Layered Waves, Radial Burst, Grid, Spiral, Symmetric, Corners, Rings) via a new "Layout" selector.
16. **Blob shape variation** — squircle/noise-distorted blobs instead of only perfect circles.
17. **Live flow-field motion preview** — a subtle animated preview before committing a mesh to Wallpaper Studio.
18. ✅ **Done** — **Per-blob opacity/softness** — new "Soft" slider per blob row.
19. **Snap-to-grid / alignment guides** — while dragging mesh blobs.
20. ✅ **Done** — **One-click promote to Wallpaper Studio** — "Send to Wallpaper" button loads the mesh as a Flowing Mesh pattern.

## Wallpaper Studio

21. ✅ **Done** — **Extract palette from wallpaper** — "Extract Palette from This" reuses the same clustering algorithm as Image Extract, fed the wallpaper canvas directly.
22. ✅ **Done** — **Visible seed/recipe code** — a seed field next to Randomize Colors; same seed always reproduces the same colors (mulberry32 PRNG).
23. **Batch export** — generate N randomized variations at once, zipped, for picking a favorite offline.
24. **Accelerometer parallax** (APK only) — layers shift slightly as the phone tilts, standard Android live-wallpaper trick.
25. ✅ **Done** — **Loop-perfect toggle** — wraps the time value modulo the loop length so every rendered frame is a pure function of a repeating phase; Record Video and the Live HTML export both honor it.
26. ✅ **Done** — **Exportable effect "recipe" JSON** — Save/Load Recipe buttons round-trip pattern+colors+speed+effects as a small JSON file.
27. **Scheduled wallpaper "chapters"** (APK) — auto-rotate different looks by time of day.
28. **Text/quote overlay layer** — excluded from tonight's build (text-related).
29. **Time-of-day color shift** (APK) — color temperature drifts with local time.
30. **Multi-monitor export** — one wide canvas split cleanly across N screens with correct per-monitor centering.
31. **"Remix" a saved design** — re-roll only the effects on a saved/shared wallpaper, keeping the colors.

## Image Extract

32. ✅ **Done** — **Side-by-side palette diffing** — "⇄ Compare with previous image" shows the last two extractions stacked.
33. **Smart-crop sampling** — avoid pulling swatches from a detected face/subject.
34. ✅ **Done** — **Auto mood label** — e.g. "Dark & Vibrant", computed from average lightness/saturation of the extracted colors.

## Cross-cutting / whole app

35. **Undo/redo stack** — across all studios; currently no way to step back after a destructive randomize.
36. **Command palette (Cmd+K)** — jump to any action or studio instantly.
37. **First-time onboarding tour** — contextual, dismissible tooltips.
38. **Custom keyboard shortcut remapping**.
39. **Named local "projects"** — bundle a gradient + palette + mesh + wallpaper together under one saved session, not just per-studio saves.
40. **Cross-studio "recently generated" strip** — a lightweight history so a good result survives a few more randomize clicks.
41. ✅ **Done** — **Offline-status indicator** — a banner appears only while `navigator.onLine` is false; silent the rest of the time by design.
42. ✅ **Done** — **Copy-as-image to clipboard** — "Copy Image" next to PNG download on Gradient/Mesh/Wallpaper, and in Palette's export menu.

## Accessibility

43. ✅ **Already existed** — the CVD preview (`[data-vision]` SVG filters) already covered Palette/Mesh/Wallpaper before tonight, not just Gradient.
44. ✅ **Done** — **System-tied dark/light auto-switch** — new "Match System" option in the theme picker, live-follows `prefers-color-scheme` via a change listener (not just a one-time default).
45. **Alt-text/description generator** — excluded from tonight's build (text-related).
46. **High-contrast "outline" theme** — a 7th theme built specifically for low-vision users.

## Interop / sharing

47. **Figma/Sketch export stubs** — copy as a Figma plugin payload or Sketch palette format.
48. **Full-recipe QR codes** — encode pattern+colors+effects directly in the QR, not just a link, for fully offline sharing.

## The big one

49. **Community gallery** (Supabase-backed) — browse, like, and remix other users' saved designs. The one feature here that's a real backend build, not a static-app addition — deliberately sequenced after everything else, per earlier discussion.
50. **Public profile / collections** — once a gallery exists, let people group their own saved designs into named, shareable collections (natural follow-on to #49, not worth building standalone).
