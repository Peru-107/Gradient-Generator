# Gradii — feature idea backlog

A running wishlist of features discussed but not yet built. Not a commitment
or a roadmap with dates — just ideas worth remembering. Pull from here when
picking what to build next; update it as ideas get built or dropped.

## Gradient Studio

1. **Dithering toggle** — ordered/Bayer-matrix dithering on smooth 2-color gradients to kill visible banding.
2. **Drag-to-set angle/position** — grab the gradient preview itself to set angle/position, instead of only a slider.
3. **Non-linear stop easing** — ease-in/out blending between stops instead of always-linear interpolation.
4. **Mood/tag-browsable presets** — browse curated gradients by tag (warm, cool, pastel, neon) instead of only random.
5. **Crossfade preview between two saved gradients** — see the blend between two designs before committing to one.
6. **Temperature slider** — nudge every stop warmer/cooler at once with one control.
7. **Repeating conic/linear gradients** — a repeat-count control for banded/striped looks.

## Palette Studio

8. **Arrow-key browsing** — step through recent/saved palettes without re-rolling, uiGradients-style.
9. **CVD collision warning** — flag (not block) when two generated swatches are hard to tell apart under common color-blindness types.
10. **Lock hue, vary lightness/saturation** — quickly generate tints/shades of one hue.
11. **Material/Ant Design-style scale export** — auto-generate a full 50–900 shade ramp from one base color.
12. **Import from a pasted image URL** — not just an uploaded file.
13. **Palette "story" mode** — auto-suggest primary/secondary/accent/background/text roles from 5 swatches.
14. **Tailwind/CSS-variables export** — beyond the existing copy formats.

## Mesh Studio

15. **Alternate generator families** — Haikei-style blob-scatter, layered-waves, radial-burst algorithms, not just draggable points.
16. **Blob shape variation** — squircle/noise-distorted blobs instead of only perfect circles.
17. **Live flow-field motion preview** — a subtle animated preview before committing a mesh to Wallpaper Studio.
18. **Per-blob opacity/softness** — beyond the current size/position/color controls.
19. **Snap-to-grid / alignment guides** — while dragging mesh blobs.
20. **One-click promote to Wallpaper Studio** — send the current mesh straight in as a static pattern.

## Wallpaper Studio

21. **Extract palette from wallpaper** — one click reuses the Image Extract engine on your generated wallpaper.
22. **Visible seed/recipe code** — recall or share an exact "random" result precisely, lighter than a full Share link.
23. **Batch export** — generate N randomized variations at once, zipped, for picking a favorite offline.
24. **Accelerometer parallax** (APK only) — layers shift slightly as the phone tilts, standard Android live-wallpaper trick.
25. **Loop-perfect toggle** — guarantees the animation's first/last frame match exactly for a seamless Record Video/HTML loop.
26. **Exportable effect "recipe" JSON** — the grain/vignette/glow/duotone stack as a reusable, importable settings file.
27. **Scheduled wallpaper "chapters"** (APK) — auto-rotate different looks by time of day.
28. **Text/quote overlay layer** — custom-font typography, safe-zone-aware placement.
29. **Time-of-day color shift** (APK) — color temperature drifts with local time.
30. **Multi-monitor export** — one wide canvas split cleanly across N screens with correct per-monitor centering.
31. **"Remix" a saved design** — re-roll only the effects on a saved/shared wallpaper, keeping the colors.

## Image Extract

32. **Side-by-side palette diffing** — compare two extracted palettes.
33. **Smart-crop sampling** — avoid pulling swatches from a detected face/subject.
34. **Auto mood label** — light/dark/vibrant/muted, generated alongside the raw swatches.

## Cross-cutting / whole app

35. **Undo/redo stack** — across all studios; currently no way to step back after a destructive randomize.
36. **Command palette (Cmd+K)** — jump to any action or studio instantly.
37. **First-time onboarding tour** — contextual, dismissible tooltips.
38. **Custom keyboard shortcut remapping**.
39. **Named local "projects"** — bundle a gradient + palette + mesh + wallpaper together under one saved session, not just per-studio saves.
40. **Cross-studio "recently generated" strip** — a lightweight history so a good result survives a few more randomize clicks.
41. **Offline-status indicator** — surface whether the currently-shown build is served from cache or fresh, tying into the existing service-worker behavior.
42. **Copy-as-image to clipboard** — Clipboard API PNG copy per studio, for pasting directly into chat apps.

## Accessibility

43. **CVD preview for palettes/mesh** — extend the existing gradient-only color-vision-deficiency simulator to the other studios.
44. **System-tied dark/light auto-switch** — independent toggle from the app's own 6-theme picker.
45. **Alt-text/description generator** — accessible hand-off text for a palette.
46. **High-contrast "outline" theme** — a 7th theme built specifically for low-vision users.

## Interop / sharing

47. **Figma/Sketch export stubs** — copy as a Figma plugin payload or Sketch palette format.
48. **Full-recipe QR codes** — encode pattern+colors+effects directly in the QR, not just a link, for fully offline sharing.

## The big one

49. **Community gallery** (Supabase-backed) — browse, like, and remix other users' saved designs. The one feature here that's a real backend build, not a static-app addition — deliberately sequenced after everything else, per earlier discussion.
50. **Public profile / collections** — once a gallery exists, let people group their own saved designs into named, shareable collections (natural follow-on to #49, not worth building standalone).
