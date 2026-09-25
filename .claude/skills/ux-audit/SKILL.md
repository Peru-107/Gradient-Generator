---
name: ux-audit
description: Design, review, or audit any part of Gradii's interface across phone, tablet and desktop — layout, navigation, controls, themes, copy voice, gestures, motion, onboarding, empty states. Use before and after any visible UI change, whenever asked to redesign or "make it easier/cleaner/more fun", and whenever something "looks off, cluttered, cramped, or broken on my phone/iPad". Not for pure logic changes with no visible surface.
---

# UX audit & design — how Gradii gets designed

This is a working method, not an essay. It merges three things: the
established UX laws (Laws of UX, Nielsen, Gestalt), platform guidance for
building one web app that works on every device class (Material 3, Apple
HIG, WCAG 2.2), and the concrete precedents this repo already paid for in
real shipped bugs. Where a law and a real screenshot disagree, the
screenshot wins.

## The loop (every time)

1. **Look at the real thing.** Screenshot it with Playwright against a
   local server at the device matrix below, in more than one theme. Never
   propose a fix from memory of what the markup "should" do — every CSS
   cascade/stacking bug in this repo's history shipped because someone
   reasoned instead of looked.
2. **Name the user's goal on that screen in one sentence** ("make a
   wallpaper for my phone and save it"). Everything is judged against that
   sentence, not against a checklist.
3. **Walk the sections below** and write down only what the screenshot
   actually shows is wrong. A law existing doesn't mean the app violates it.
4. **Diverge before converging when the change is big.** For a redesign or
   a new surface, produce 2–4 genuinely different directions (different
   worlds, not different shades) as a clickable preview and let the owner
   choose *before* building. Small fixes skip this.
5. **Fix, then re-screenshot and re-run the regression sweep** (overflow,
   clipping, reachability) across every width × theme × studio before
   shipping.

## 1 · Device classes, not breakpoints-by-accident

Design three layouts on purpose — one app, three postures:

| Class | Width | Navigation | Canvas & controls |
|---|---|---|---|
| Phone (compact) | < 600px | Bottom tab bar (5 destinations max, icon + label) | Pinned "stage" preview on top, settings scroll beneath it as a sheet; a grip resizes the stage |
| Tablet (medium) | 600–1023px | Left navigation rail | Portrait (< 900px): pinned stage over inspector. Landscape (≥ 900px): stage + inspector side by side |
| Desktop (expanded) | ≥ 1024px | Top tabs | Two columns, sticky preview, filmstrip, ⌘K |

Rules that make this hold:

- Breakpoints come from Material's window size classes (compact < 600,
  medium 600–839, expanded ≥ 840) adjusted to where *this* layout actually
  fits — verify the adjustment by measuring the narrowest real column, not
  by feel (this repo's two-column split had to move from 768 to 900 after a
  sweep showed mesh controls clipping at 267px).
- Branch on **input capability**, not width, for input-specific UI:
  `(hover: none)` / `(pointer: coarse)` hide keyboard-shortcut furniture and
  show gesture hints; `(pointer: fine)` hides gesture hints.
- Any `grid-template-columns` track uses `minmax(0, 1fr)`, never bare `1fr`
  (grid blowout). Any flexible text input in a flex row gets
  `width: 0; min-width: 0`.
- Respect safe areas: fixed bars add `env(safe-area-inset-*)` to their own
  padding; sticky things use `top: env(safe-area-inset-top)`.
- Anything drawn to a `<canvas>` must re-measure with a `ResizeObserver`,
  not at click time — a canvas measured while its panel was still
  `display: none` rendered at the default 300×150 for months.
- Fixed/sticky chrome must not sit inside a transformed ancestor (any
  non-`none` transform creates a containing block and a stacking context).
  Put bottom bars/rails at body level; give overlays their own z-index
  above them; cap long dropdowns so they stop short of a bottom bar.
- Inputs use `font-size: 16px` on phones (prevents iOS zoom on focus).

## 2 · Reach, targets and effort (Fitts)

- **Touch targets ≥ 44×44 CSS px** for anything primary (Apple HIG 44pt,
  WCAG 2.5.5 AAA 44px); never below **24×24** with spacing (WCAG 2.2
  SC 2.5.8, AA). Check with `offsetWidth/offsetHeight`, not
  `getBoundingClientRect` — an in-flight bounce animation scales the rect.
- **Thumb zone:** most phone use is one-handed; the bottom third is the
  easy zone. Navigation and the primary action live there or within one
  scroll of it — never only at the top of a long phone page.
- **One primary action per screen**, full-width on phones, visually unique
  (Von Restorff). If six things "stand out", none do.
- Object-level actions (fullscreen, compare, show-on-device) sit **on the
  object** (the stage), not as more buttons in the settings list.

## 3 · Hierarchy, grouping, and what the eye sees first (Gestalt)

- Ask: if someone glanced for one second, where does the eye land — and
  is that the right thing? On a design tool it should be the artwork, then
  the primary action, then everything else.
- **Proximity / Common Region:** one setting, one card. Group several
  under one card only when they share one real explanation, with real
  spacing between rows.
- **Similarity / Consistency:** equivalent controls look identical in every
  studio. A lone exception reads as a bug, not a variant.
- **Alignment:** one edge per column. Misalignment reads as sloppiness even
  when every element is individually fine.
- **Not everything is a card.** Spend borders, fills and shadows on what
  needs to be lifted.

## 4 · Cognitive load & choice

- **Hick / Choice overload:** long option lists get chunked into labelled
  groups of ≤ 7 (the theme menu: Studio looks / Classic / Pro).
- **Progressive disclosure:** show what most people need now; advanced and
  Pro options appear when asked for (Advanced Mode, "More options").
- **Tesler:** some complexity is irreducible (an export tool needs sizes) —
  organise it, don't pretend it away. **Occam / Parkinson:** every control
  must earn its space; settings panels grow unless something prunes them.
- **Smart defaults over questions:** save into the collection that's open,
  size exports to "My Screen", start each launch on a fresh random design.

## 5 · Feedback, motion and flow

- **Response limits (Nielsen):** < 100ms feels instant (taps, toggles,
  slider drags must render in-frame); < 1s keeps flow (tab switches,
  generation); > 1s needs visible progress; > 10s needs a way out.
- **Motion budget:** 100–200ms for small state changes, 200–350ms for
  panels/sheets; ease-out on enter, ease-in on exit; no bounce on anything
  the user is about to operate. Staggered reveals only for content being
  *read* (swatch grids), never for a menu about to be tapped.
- **`prefers-reduced-motion`** is checked for every animation (captured
  once as `prefersReducedMotion` in `animations.js`).
- **Peak-end:** the moment right after Randomize/Export and the last thing
  a flow shows are what people remember — make the result the hero, and
  confirm saves with *where* it went ("Saved to Pictures/Gradii").
- **Haptics confirm, never inform:** a short `navigator.vibrate` on
  generate, lock, snap, save — always paired with something visible
  (iOS Safari ignores vibrate). Android needs the VIBRATE permission.
- **Flow:** no modal that isn't necessary; a first-run flow ends on a real
  result, not on a tour of controls (Paradox of the Active User — people
  start doing before they read).

## 6 · Gestures & interactivity

- A gesture is an **accelerator, never the only door**: every flick,
  long-press or drag has a visible button/menu equivalent
  (flick ← → = Randomize / Undo; long-press = right-click = color menu).
- Teach gestures **in place** (a short hint by the grip on touch devices,
  one line in the first-run result), not in a manual.
- Don't let a gesture fight an existing drag: disambiguate by velocity and
  direction (flick = > 60px in < 350ms, mostly horizontal) and restore
  whatever the slower drag already changed.
- Long-press ≈ 450–500ms with a visible "pressing" response, cancelled by
  > 10px movement; suppress the click that follows it.
- Interactive previews beat static ones: compare-before/after, drag on
  the canvas, show-on-device mockups — they let people *see* the effect of
  a choice instead of imagining it.

## 7 · Voice & copy (words are design material)

- Write from the user's side: name things by what people recognise
  ("Save to Photos", not "Export blob"). A button says what happens; the
  confirmation says that it happened and where.
- Errors say what went wrong and how to fix it. No apologies, no vagueness.
- **Voice is part of a theme's identity** (Darkroom precise, Paint Chip
  friendly, Prism playful, Spec Sheet minimal) but voice never changes
  facts: sizes, limits, errors and prices read the same in every voice.
  Route generic confirmations through one choke point (`voiceToast`) so
  call sites stay voice-agnostic.
- Keep hint copy short enough to fit its space at 320px; if it wraps to
  two lines in a one-line slot, rewrite it rather than shrink it.

## 8 · Accessibility & trust

- Contrast is math, not a vibe (WCAG 1.4.3): 4.5:1 normal text, 3:1 large
  (≥ 18pt / 14pt bold) and UI boundaries. Check every theme's muted text
  and every colored primary label — e.g. a paint-chip red had to darken to
  `#c8321a` to carry white text at 4.5:1. When text sits on user colors,
  pick the ink with the better worst-case contrast across the whole fill.
- State never by color alone (active nav = pill shape + color + weight).
- Visible `:focus-visible` on everything interactive; keyboard paths for
  sliders (arrow keys) and menus (Esc closes).
- `hidden` + a class `display` rule: the global
  `[hidden] { display: none !important }` covers it — don't re-solve per
  component.
- User control: undo everywhere, confirm or undo destructive actions, and
  never trap anyone in a flow (Skip, Esc, outside-tap all exit).
- Accessibility features are never paywalled (High Contrast is free).

## 9 · Creativity — making it distinct, not just correct

Laws keep a design from failing; they don't make it memorable. For any new
surface or visual direction:

- **Ground it in a real world** the subject belongs to — a photo darkroom,
  a hardware-store paint chip, a spec sheet, a prism — and borrow its
  materials, vocabulary and one signature detail (crop marks, a named chip
  card, italic spec labels, a button that "wears" the user's colors).
- **One signature per theme**, spent where it matters (the primary, the
  stage frame) — not decoration sprinkled everywhere.
- **Avoid the AI-default looks** unless asked: cream + serif + terracotta,
  near-black + one acid accent, purple→blue hero gradient, Inter/Space
  Grotesk everywhere, emoji as section markers, everything centered and
  `rounded-lg`.
- **Type pairs carry a theme:** a display face with character plus a mono
  or numeric face for values; load non-default fonts lazily per theme.
- **Let the artwork be the loudest color.** Chrome recedes (Darkroom,
  Spec Sheet hide the brand orbs) so the user's colors read true.
- Show the owner real, interactive previews of directions on all three
  device classes before building — cheaper to change a preview than a
  shipped app.

## 10 · Logic check — no fallacies in the reasoning

Before shipping a design decision, check the argument, not just the pixels:

- **Appeal to authority:** "Hick's Law says…" doesn't prove *this* screen
  has a problem. Show the screenshot or measurement that does.
- **Hasty generalisation / anecdote:** one quick reaction to a screenshot
  isn't a study — but the owner's stated taste *is* a requirement. Keep the
  two apart: follow the owner's preference; don't dress it up as a
  universal law.
- **Post hoc:** "it looks fixed after my change" — reproduce the bug
  before the fix and show it gone after, at the same width/theme.
- **Sampling bias / survivorship:** testing only desktop Chrome in the
  default theme. The matrix below exists because 320px, iPad, and
  non-default themes each caught bugs desktop never showed.
- **False dilemma:** "dense or sparse", "hide it or show it" — there is
  usually a third option (progressive disclosure, a sheet, a grip).
- **Begging the question:** "users want X because X is modern." State the
  user goal it serves or drop it.
- **Sunk cost:** a feature isn't kept because it was expensive to build;
  it's kept if it earns its space (this repo removed the Text Contrast
  Checker and the bento grid on exactly that basis).
- **Nirvana fallacy:** don't block a clear improvement for a perfect one.
- **Product-logic consistency** (the other kind of fallacy — contradictions
  in the UI itself):
  - every state has a way out (Esc, Skip, Back, outside tap);
  - every gesture has a visible equivalent;
  - a control's effect is visible, or it says what it did (mental model);
  - the same word means the same thing everywhere; the same action has
    the same name in every studio;
  - defaults are consistent (a Pro-only control never *looks* enabled for
    a free user; a shared link is never covered by onboarding);
  - randomness is actually random per launch (the Android WebView repeated
    `Math.random` sequences across cold starts — seed from
    `crypto.getRandomValues`);
  - "Download" means the file lands in storage; Share is a separate,
    optional path.

## 11 · Test matrix (what "verified" means here)

- Widths: 320, 360, 390 (phones) · 600, 768, 820 (tablet portrait) ·
  1024, 1180 (tablet landscape / small laptop) · 1440 (desktop).
- Every theme (11) × every studio (5), Pro unlocked so gated UI renders.
- Per combination: no page overflow; no card whose `scrollWidth` exceeds
  its `clientWidth`; nav buttons reachable via `document.elementFromPoint`;
  the visible primary ≥ 44px tall.
- Real interactions, not "the listener ran": touch flicks via CDP
  `Input.dispatchTouchEvent`, long-press with a held touch, actual taps on
  overlays. `hasTouch` contexts matter — some bugs only appear with them.
- Screenshots of at least phone + tablet + desktop in two contrasting
  themes, looked at, before calling it done.

## Precedents already in this codebase

- Stacking contexts: `.topbar` has its own `position: relative; z-index: 50`
  because a GSAP identity transform once trapped a dropdown behind the
  preview. Don't out-number a broken stacking context.
- Theme-scoped overrides use `:not(.exception)` on the broad rule rather
  than hoping source order wins; compute specificity, don't eyeball it.
- OKLCH → hex: reduce chroma only (never L or H) until in gamut.
- One control-card per setting; grouped cards only with a shared intro.
- Primary per studio gets full width and a unique look, on every width.
- Empty states are designed states (centered, with a clear next step).
- Advanced/Pro features follow progressive disclosure: visible, and an
  unlicensed attempt reverts + toast + Pro modal.

## Sources

- Laws of UX — https://lawsofux.com
- Material 3 window size classes — https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- Material 3 navigation bar / rail — https://m3.material.io/components/navigation-bar/overview · https://m3.material.io/components/navigation-rail/overview
- Material 3 motion (easing & duration) — https://m3.material.io/styles/motion/easing-and-duration
- Apple HIG, layout & touch targets — https://developer.apple.com/design/human-interface-guidelines/layout
- WCAG 2.2 target size (minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG 2.1 contrast (minimum) — https://www.w3.org/TR/WCAG21/#contrast-minimum
- Nielsen, response time limits — https://www.nngroup.com/articles/response-times-3-important-limits/
- Hoober, how people hold phones — https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- MDN, `pointer` / `hover` media features — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer
- web.dev, responsive design basics — https://web.dev/articles/responsive-web-design-basics
- Earlier sources merged into this skill: dev.to "5 psychological theories", pathumpmgux "15 UX principles", Figma UI design principles, UX Design Institute principles 2026.
