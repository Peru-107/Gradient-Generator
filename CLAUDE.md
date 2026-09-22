# Gradii — working notes

Vanilla HTML/CSS/JS (no build step, no framework), packaged as an Android
APK via Capacitor. `index.html` / `style.css` / `app.js` / `animations.js`
are the whole app. `Gradii.apk` at the repo root is a committed binary
asset so GitHub Pages serves it at a stable download URL — don't edit it
by hand, always rebuild via the Capacitor Android project.

## UI/CSS mistakes made in this repo — don't repeat these

**`hidden` attribute vs. a class rule setting `display`.** A component
that toggles visibility with the native `hidden` attribute, and *also*
has a class rule setting `display: flex`/`block`/etc. for its shown
state, will stay visible even while `hidden` is set — at equal
specificity the author stylesheet beats the browser's own `[hidden]`
rule. This bit the contrast-checker result row and the Brand Kit swatch
strip (both stayed visible with placeholder content before the user
had typed/enabled anything). Fixed globally with
`[hidden] { display: none !important; }` near the top of `style.css` —
that fix covers every future `hidden`-toggled element automatically, so
don't remove it, and don't re-solve this per-component.

**Theme-scoped overrides and specificity.** The same *class* of bug
happened twice: once with `.orb-live` vs `[data-theme="aurora"] .orb`
(a broader theme-scoped rule accidentally beat a narrower one because it
had more selector parts), once with the `hidden` issue above. When
adding a theme-scoped override that should NOT apply to some element
that otherwise matches the broader selector, use `:not(.the-exception)`
on the broad rule rather than trying to out-specificity it with a
second rule and hoping source order saves you. Verify by computing
actual specificity, not by assuming "more specific-looking" wins.

**Don't apply a layout change uniformly without checking every control
type fits it.** The Aurora Bento mobile layout put every `.control-card`
into a 2-column grid, but multi-button segmented controls (Linear/
Radial/Conic) and sliders with a value label were designed for full
width and clipped/crushed at ~174px. Before putting an existing control
into a narrower container, check what it actually needs — a segmented
control with 3+ options, anything with a long inline label, and stop/
color-list rows are usually full-width-only. When in doubt, default to
full width and only narrow controls that are visibly compact (a single
toggle switch, a short label + small input).

**Test at the actual constrained width, not just page-level overflow.**
`document.documentElement.scrollWidth` staying equal to the viewport
catches horizontal *page* overflow, but not content clipping *inside* a
narrow grid cell (truncated segmented-control labels, a crushed
slider). When testing a multi-column/grid layout, also check individual
component widths against their actual rendered column width, or just
visually screenshot at the real breakpoint before calling a layout
change done.

## Testing this repo

No test framework — verify manually with Playwright against a local
static server (`python3 -m http.server` in the repo root), headless
Chromium at `/opt/pw-browsers/chromium`. Check: zero horizontal overflow
across all 5 tabs at mobile width (~390px) and desktop, both themes (all
themes once more exist), and any new interactive element's actual
computed style/visibility — not just "the click handler ran without
throwing."

## Android build

Capacitor project lives outside this repo (scratchpad, gitignored by
convention). To rebuild the APK: copy `index.html`/`style.css`/`app.js`/
`animations.js` into that project's `www/`, `npx cap sync android`,
`./gradlew assembleDebug --no-daemon --max-workers=1` (max-workers=1
avoids Maven Central 429 rate-limiting), then `apksigner verify
--print-certs` before shipping. Copy the resulting APK back to
`Gradii.apk` at the repo root.
