# Gradii — working notes

Vanilla HTML/CSS/JS (no build step, no framework), packaged as an Android
APK via Capacitor. `index.html` / `style.css` / `app.js` / `animations.js`
are the whole app. `Gradii.apk` at the repo root is a committed binary
asset so GitHub Pages serves it at a stable download URL — don't edit it
by hand, always rebuild via the Capacitor Android project.

## UI/CSS principles — grounded in the spec and real incidents

Each of these caused a real, shipped bug in this repo. Each is also a
named, documented phenomenon elsewhere — not a one-off — so the fix is a
rule to follow going forward, not a patch to remember.

### Stacking contexts and z-index

**The rule** (MDN, [Stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context) · [z-index](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/z-index)):
`z-index` only has effect on a *positioned* element (`position` other
than `static`), and a laundry list of other properties create a new
stacking context even without any `z-index` at all — most relevantly
for animation-heavy UI: **any `transform` value other than `none`**,
`opacity < 1`, `filter`, `backdrop-filter`, `will-change`, `isolation:
isolate`. Once a container creates a stacking context, a child's
`z-index: 9999` inside it can only win *within that container* — it can
no longer out-rank unrelated elements elsewhere on the page, no matter
how high the number.

**What actually happened here:** the theme picker dropdown (`z-index:
20`, correctly positioned) rendered invisibly behind the gradient
preview. The real cause: a GSAP intro-reveal tween left an identity
transform (`matrix(1, 0, 0, 1, 0, 0)`) on an ancestor of the dropdown —
mathematically a no-op, but *any* non-`none` transform value creates a
stacking context regardless of what it actually does. That trapped the
dropdown's z-index inside a context it could no longer escape.

**The fix, and the rule going forward:** don't try to out-number your
way past a broken stacking context. Give the actual *chrome* container
(here, `.topbar`) its own `position: relative` + a real z-index (`50`)
above the studio content, so overlays anchored inside it always win
regardless of what any descendant's animation library does to its own
transform. When debugging "z-index isn't working," check every ancestor
for these properties before adding more z-index — a higher number never
fixes a broken stacking context.

### `hidden` attribute vs. a class rule setting `display`

A component that toggles visibility with the native `hidden` attribute,
and *also* has a class rule setting `display: flex`/`block`/etc. for
its shown state, stays visible even while `hidden` is set — at equal
specificity the *author* stylesheet always beats the browser's own
built-in `[hidden] { display: none }` rule (a plain fact of the
cascade, not a bug in any one component). This bit the contrast
checker's result row and the Brand Kit swatch strip. Fixed globally
with `[hidden] { display: none !important; }` near the top of
`style.css` — that covers every future `hidden`-toggled element
automatically; don't remove it, and don't re-solve this per component.

### Theme-scoped overrides and specificity

The same *class* of cascade mistake happened twice — `.orb-live` vs.
`[data-theme="aurora"] .orb`, and the `hidden` issue above — a broader
rule accidentally beat a narrower one because it had more selector
parts. When a theme-scoped override should NOT apply to some element
that otherwise matches a broader selector, use `:not(.the-exception)`
on the broad rule rather than adding a second rule and hoping source
order saves you. Verify by actually computing specificity — (inline,
IDs, classes/attrs/pseudo-classes, elements) — not by eyeballing which
selector "looks" more specific.

### Grid blowout: content can force a grid track wider than intended

**The phenomenon** (documented as "grid blowout" — [CSS-Tricks](https://css-tricks.com/preventing-a-grid-blowout/), [MDN `minmax()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/minmax)):
a `1fr` grid track's default minimum size is `auto`, not `0` — meaning
a track won't shrink below its content's min-content size even when
`1fr` implies it should share space evenly. One oversized child (long
text, a wide control) silently blows the whole track past its fair
share. **The fix**: `grid-template-columns: minmax(0, 1fr) minmax(0,
1fr)` instead of bare `1fr 1fr` whenever a grid track must actually
respect its share of the available width. Already applied in this repo
for the (now-removed) bento grid; keep doing this by default for any
new CSS Grid layout, not just when a bug shows up.

### Don't apply a layout change uniformly without checking every control fits it

The (now-removed) Aurora Bento mobile layout put every `.control-card`
into a 2-column grid, but multi-button segmented controls (Linear/
Radial/Conic) and sliders with a value label were designed for full
width and clipped/crushed at ~174px. Before narrowing an existing
control's container, check what it actually needs — a segmented
control with 3+ options, anything with a long inline label, and stop/
color-list rows are usually full-width-only. Default to full width;
only narrow controls that are visibly compact (a single toggle switch,
a short label + small input). This is also why the mobile Aurora bento
grid was simplified back to a single column entirely — the visual
density wasn't worth re-litigating this check for every control type
every time a new one is added.

### Color: WCAG contrast math, and OKLCH gamut mapping

**Contrast ratio is exact, not a vibe** ([WCAG 2.1 SC 1.4.3](https://www.w3.org/TR/WCAG21/#contrast-minimum)):
normal text needs **4.5:1**, large text (≥18pt / ≥14pt bold) needs
**3:1**, computed via relative luminance = `0.2126·R + 0.7152·G +
0.0722·B` on linearized channels. For many colorful, medium-lightness
backgrounds, only near-black or near-white text actually clears 4.5:1
— that's correct math, not a bug to "fix" by loosening the target.

**What looked like a bug but wasn't (quite):** the Text Contrast Checker's
auto-fix appeared to only ever produce white or black regardless of the
text color you started from. The contrast math was right; the color
*rendering* wasn't. Converting an out-of-gamut OKLCH color to sRGB by
clamping each RGB channel independently — what `oklchToHex` alone does
— distorts the hue unpredictably as lightness drops, because different
channels clip at different points. A saturated yellow walked dark
enough to hit 4.5:1 came out `#391000` (a random reddish near-black)
instead of a recognizable dark gold. This is a **known, spec-relevant
gap**: the CSS Color 4 spec [requires](https://www.w3.org/TR/css-color-4/#css-gamut-mapping)
browsers to gamut-map OKLCH by reducing chroma (preserving lightness
and hue), but Chrome and Safari's native `oklch()` still use the faster,
lossier clip-each-channel method as of this writing ([Evil Martians,
OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl#gamut-correction)).
The fix at the time was a binary-search-chroma helper (`oklchToHexInGamut`)
that never touched L or H — but the Text Contrast Checker feature itself
was later removed as unwanted UI complexity, and that helper went with
it since it had no other caller. **The rule going forward, if OKLCH
gamut mapping is needed again:** never hex-convert an OKLCH color that
might be out of gamut by clamping each RGB channel independently —
reduce chroma only (never L or H) until it's in-gamut, then convert.
This matters anywhere a computed L/C/H triple might be pushed toward
the lightness extremes (dark/light theme variants of a user color,
any future contrast/accessibility tooling, etc.) — re-implement the
binary-search-chroma approach rather than reaching for plain
`oklchToHex` on an unchecked triple.

### Motion and `prefers-reduced-motion`

Every animation in this repo already checks `prefersReducedMotion`
(`window.matchMedia('(prefers-reduced-motion: reduce)').matches`,
captured once in `animations.js`) before running — keep doing that for
any new animation, it's a real accessibility requirement, not a nicety
([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion),
[web.dev](https://web.dev/articles/prefers-reduced-motion)): motion can
trigger vestibular disorders in some users, and the media query is how
they've told the OS they want it minimized. Beyond correctness: a
stagger/reveal animation on something the user needs to interact with
*immediately* (a dropdown menu they just opened, expecting to tap an
option) adds latency without benefit — reserve staggered reveals for
content being scanned/read (grids, swatch lists), not for controls
someone is about to act on right away. A 6-item dropdown menu with a
~600ms stagger to fully settle was reverted for exactly this reason.

## Testing this repo

No test framework — verify manually with Playwright against a local
static server (`python3 -m http.server` in the repo root), headless
Chromium at `/opt/pw-browsers/chromium`.

`document.documentElement.scrollWidth` staying equal to the viewport
only catches horizontal *page* overflow — it says nothing about content
clipping *inside* a narrow grid cell, an element rendering invisibly
behind another due to a stacking-context bug, or a color computation
being technically-correct-but-ugly. So beyond that overflow check
(across all 5 tabs, mobile ~390px and desktop, every theme), also:
check individual component widths against their actual rendered column
width; use `document.elementFromPoint()` or an actual Playwright click
(not just "the event listener ran") to confirm an element is genuinely
reachable, not just present in the DOM with correct computed `display`;
and when a visual bug is reported, get a real screenshot or numeric
readout before proposing a fix — reasoning about CSS cascade/stacking
from memory is exactly how the bugs above shipped in the first place.

## Android build

Capacitor project lives outside this repo (scratchpad, gitignored by
convention). To rebuild the APK: copy `index.html`/`style.css`/`app.js`/
`animations.js` into that project's `www/`, `npx cap sync android`,
`./gradlew assembleDebug --no-daemon --max-workers=1` (max-workers=1
avoids Maven Central 429 rate-limiting), then `apksigner verify
--print-certs` before shipping. Copy the resulting APK back to
`Gradii.apk` at the repo root.
