---
name: ux-audit
description: Apply established UX/UI design laws and psychological principles when reviewing, auditing, or designing any part of Gradii's interface. Use this before and after any visual/UI change — new controls, layout changes, a new studio tab, onboarding flows, empty states — and whenever asked to review the app's UX, fix "this looks off/cluttered/cramped," or improve usability. Not for pure logic/backend changes with no visible UI surface.
---

# UX audit — laws, principles, and how to actually apply them here

A condensed, deduplicated reference from six sources (listed at the bottom),
built for auditing *this* app, not a general essay. ~40 named
laws/principles collapse hard once you remove overlap — Laws of UX, a
psychological-theories piece, a 15-principles roundup, and two "principles of
good UX/UI" articles all cite mostly the same handful of ideas with different
names. Organized below by what you're actually looking at, not by source.

## How to use this, concretely

1. **Look at the real thing first.** Screenshot the actual current UI
   (desktop *and* mobile — 320/360/390px have all caught real bugs in this
   app that desktop never showed) via Playwright against a local server,
   the same way every other bug in this session's history got found —
   never propose a fix from memory of what the markup "should" look like.
2. **Walk the categories below**, not the raw 40-item list — ask each
   category's question against the screenshot.
3. **Fix what's genuinely broken**, not everything nameable. A principle
   existing doesn't mean this app violates it. Only change what a real
   screenshot shows is actually wrong, matching this project's standing
   rule against scope creep.
4. **Re-screenshot after the fix** and re-run the Playwright regression
   suite (overflow checks across all tabs/themes/widths) before shipping.

## Visual hierarchy & grouping (Gestalt)

- **Proximity** — things placed near each other read as related; things far
  apart read as unrelated. *Ask: does spacing alone already tell the user
  which controls belong together, without reading labels?*
- **Common Region** — a shared boundary (a card, a border) reads as a
  group even more strongly than proximity alone. This app's `.control-card`
  convention *is* this principle — one setting, one card, one shadow.
- **Similarity** — same shape/color/size reads as "same kind of thing."
  Inconsistent styling of otherwise-equivalent controls breaks this.
- **Uniform Connectedness** — a visible connecting element (a line, a
  shared background) reads as *more* related than proximity/similarity
  alone — stronger than either on its own.
- **Prägnanz** — people resolve ambiguous/complex visuals to the simplest
  interpretation available. A messy layout won't be "read correctly," it'll
  be read as whatever the simplest wrong shape looks like.
- **Hierarchy** — size, weight, contrast, and position tell the user what
  matters most and what to do next. *Ask: if someone glanced for one
  second, what would their eye land on first — and is that the right
  thing?* (This is what found Randomize buried under a wall of settings on
  mobile — nothing marked it as more important than any toggle.)
- **Contrast** — deliberate visual difference draws the eye to what's
  actually important. Don't spend it on everything, or nothing stands out
  (see Von Restorff below — overusing emphasis cancels the effect).
- **Alignment** — a consistent grid/edge reads as ordered and
  trustworthy; misaligned elements read as sloppy even when each one is
  individually fine.

## Cognitive load & decision-making

- **Hick's Law** — decision time grows with the number and complexity of
  choices, not linearly. *Ask: can this list of options be pre-filtered,
  grouped, or defaulted instead of shown flat?*
- **Miller's Law / Working Memory** — people hold ~7±2 items in working
  memory. Group long option lists into 5–9-item chunks (**Chunking**)
  instead of one flat list.
- **Choice Overload** — too many options at once doesn't just slow
  people down, it can stop them choosing at all. A resolution picker with
  9 options benefits from grouping (free vs. Pro, by device type) more
  than a flat list.
- **Cognitive Load** — every extra thing on screen costs real mental
  effort. This is the direct principle behind "too much for the eye":
  a screen with 8 undifferentiated toggle rows in 3 dense cards *is*
  measurably higher cognitive load than 8 toggles each with a clear
  boundary and breathing room, even though nothing else about the
  underlying feature changed. Reducing *visual* density reduces
  cognitive load even without removing a single feature.
- **Progressive Disclosure** — show the minimum needed now, reveal more
  as it becomes relevant. Advanced Mode's gate (hide advanced patterns
  and controls until explicitly unlocked) is this principle already in
  use — apply it again wherever a control only matters to a minority of
  users.
- **Occam's Razor / Tesler's Law** — cut every option/toggle that isn't
  earning its complexity, but accept that some irreducible complexity is
  real (a resolution picker for an image export tool can't be simpler
  than "pick a size," it can only be organized better).

## Memory & attention

- **Von Restorff Effect / Isolation Effect** — the one element that looks
  different from its neighbors is the one people remember and notice.
  This is *why* a distinct, full-width, colored Randomize button works
  once — and why making six buttons all "stand out" makes none of them
  stand out.
- **Serial Position Effect** — first and last items in a list/row are
  remembered best; middle items get lost. Put the most important tab,
  nav item, or menu entry at an edge, not buried in the middle.
- **Selective Attention** — people filter out anything that doesn't look
  relevant to their current goal. A control that matters but looks like
  background noise (same weight/color as everything else) effectively
  doesn't exist to a scanning user.
- **Zeigarnik Effect** — unfinished tasks are remembered better than
  finished ones; progress indicators exploit this on purpose (e.g. the
  onboarding tour's "Step 3 of 6").
- **Peak-End Rule** — people judge a whole experience by its most
  intense moment and how it ended, not the average. The moment right
  after a Randomize/export action, and the very last thing shown before
  leaving a flow, matter disproportionately more than the middle.

## Consistency & predictability

- **Jakob's Law** — people expect *this* app to work like every other
  app they already know. Novel interaction patterns need a very good
  reason; a settings toggle, a share button, a color picker should look
  and act like the ones people already know from elsewhere.
- **Consistency** — the same control type should look and behave
  identically everywhere it appears in this app specifically (a "1
  setting = 1 card" convention, once established, should hold
  everywhere — a lone exception is what makes a screen look broken
  rather than just different).
- **Mental Model** — users act on their *assumption* of how something
  works, not how it actually works. If a resolution picker's "My Screen"
  doesn't visibly show what it resolved to, people can't tell whether
  their mental model ("this downloads at my screen's size") matches
  reality — which is exactly what the resolution-hint feature exists to
  close.
- **Postel's Law** — accept input liberally (tolerate messy/varied user
  input), respond precisely (give specific, unambiguous feedback back).

## Feedback & performance

- **Doherty Threshold** — keep response time under ~400ms or perceived
  productivity drops; if something must take longer, show real progress,
  don't just leave the UI silent.
- **Fitts's Law** — time-to-hit a target depends on its size and distance.
  Primary actions (Randomize, the main CTA) should be bigger and closer
  than secondary ones, not the same size crammed into the same row.
- **Goal-Gradient Effect** — motivation increases as a visible goal gets
  closer (a near-full progress bar pulls harder than an empty one).
- **Flow** — full immersion happens when challenge matches skill and
  feedback is immediate; constant interruptions (unnecessary modals,
  slow feedback) break it.

## Trust, control & accessibility

- **User Control** — always give a clear, discoverable way to undo,
  cancel, or reverse a mistake (this app's per-studio undo/redo is this
  principle already shipped).
- **Accessibility** — contrast ratios, keyboard navigation, alt text,
  and assistive-tech compatibility aren't optional polish — CLAUDE.md's
  own WCAG section already encodes this for this app specifically.
- **Usability** — measured by learnability, efficiency, memorability,
  error recovery, and satisfaction — not by whether a feature exists,
  but by whether someone can actually complete the task with it.
- **Aesthetic-Usability Effect** — a more polished-looking design gets
  *perceived* as more usable even before anyone interacts with it, and
  makes people more forgiving of small real friction. This cuts both
  ways: a cluttered screen gets penalized beyond its literal usability
  cost.
- **User-Centricity / Context** — design from what the user is actually
  trying to do and the real conditions they're in (one-handed on a
  phone in bad light beats "looks good on a 27" monitor at a desk").

## Scope & effort

- **Pareto Principle** — a small fraction of features/paths account for
  most real usage; give that fraction the most design attention and the
  best defaults (e.g. a sensible default resolution/option instead of
  making everyone choose every time).
- **Parkinson's Law** — a task or flow expands to fill whatever space/time
  it's given; an unconstrained settings panel will keep growing unless
  something actively prunes it.
- **Paradox of the Active User** — people start using something
  immediately instead of reading instructions first; the UI itself has to
  teach, since most people never will read a manual.
- **Cognitive Bias** — people's snap judgments about a design are
  systematically skewed (first impressions, anchoring on the first price/
  option seen, etc.) — worth remembering when interpreting one person's
  quick reaction to a screenshot as if it were a lab result.

## Applying this to Gradii specifically

Precedent already in this codebase, worth reusing rather than re-deriving:
- One control-card per setting is the established convention (Common
  Region + Consistency) — multiple unrelated toggles sharing a card is a
  violation, not a variant, *unless* they share one real intro/explainer
  (then Proximity + Uniform Connectedness argue for grouping them, with
  real spacing between rows — not for splitting).
- The primary action per studio (Randomize) deserves Fitts's Law + Von
  Restorff treatment: full-width, high-contrast, positioned before
  secondary actions and before settings — on mobile *and* desktop, not
  just desktop where there happens to be room.
- Empty states (no image uploaded, no saved palettes yet) should be
  designed as a real state, not left as accidental dead space — Prägnanz
  and Aesthetic-Usability both predict an empty-looking screen reads as
  broken, not "correctly showing nothing yet."
- Advanced/Pro-gated features follow Progressive Disclosure already
  (hidden until unlocked) — keep extending that pattern rather than
  exposing every option to every user by default.

## Sources

- https://lawsofux.com — the 30-law reference most of this maps back to
- https://dev.to/ucscmozilla/5-psychological-theories-that-are-used-in-ui-ux-design-4kgl
- https://pathumpmgux.medium.com/15-user-experience-principles-and-theories-80f19877bd5
- https://www.figma.com/resource-library/ui-design-principles/
- https://www.uxdesigninstitute.com/blog/ux-design-principles-2026/
