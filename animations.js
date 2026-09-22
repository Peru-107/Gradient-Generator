'use strict';

/* ==========================================================================
   Gradii animation layer
   ----------------------------------------------------------------
   Three libraries, three jobs, no overlap:
     - GSAP     -> big orchestrated "quirky" moments (intro reveal, tab
                   crossfade, randomize bounce, toast pop, theme-icon flip)
     - anime.js -> playful staggered grid reveals + confetti micro-feedback
     - Motion One -> tiny everyday press/hover feedback on buttons & swatches
   Everything here is defensive: if a library hasn't loaded yet (e.g. the
   Motion One ES module is still resolving), calls just no-op instead of
   throwing, and every animation is skipped under prefers-reduced-motion.
   ========================================================================== */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- GSAP: orchestrated moments ---------------- */

function introReveal() {
  if (prefersReducedMotion || typeof gsap === 'undefined') return;
  const targets = [
    '.brand', '.tabs', '.topbar-actions',
    '#panel-gradient.active .preview-col', '#panel-gradient.active .controls-col > *',
  ];
  gsap.set(targets, { clearProps: 'all' });
  gsap.from('.brand', { opacity: 0, y: -10, duration: 0.5, ease: 'back.out(2)' });
  gsap.from('.tabs', { opacity: 0, y: -10, duration: 0.5, delay: 0.05, ease: 'back.out(2)' });
  gsap.from('.topbar-actions', { opacity: 0, y: -10, duration: 0.5, delay: 0.1, ease: 'back.out(2)' });
  gsap.from('#panel-gradient .preview-col', { opacity: 0, y: 16, duration: 0.6, delay: 0.15, ease: 'power3.out' });
  gsap.from('#panel-gradient .controls-col > *', {
    opacity: 0, y: 16, duration: 0.5, delay: 0.22, stagger: 0.06, ease: 'power3.out',
  });
}

function showPanel(toPanel) {
  toPanel.classList.add('active');
  if (prefersReducedMotion || typeof gsap === 'undefined') return;
  gsap.killTweensOf(toPanel);
  gsap.fromTo(toPanel, { opacity: 0, y: 10 }, {
    opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', clearProps: 'opacity,transform',
  });
  /* Every tab gets the same staggered-children life the gradient tab's
     intro reveal has, not just on first load — makes switching tabs feel
     like arriving somewhere, not just swapping a panel's visibility. */
  const controls = toPanel.querySelector('.controls-col');
  if (controls && typeof staggerIn === 'function') staggerIn(controls);
}

function animateTabSwitch(fromPanel, toPanel) {
  if (!toPanel) return;
  if (!fromPanel || fromPanel === toPanel) {
    showPanel(toPanel);
    return;
  }
  if (prefersReducedMotion || typeof gsap === 'undefined') {
    fromPanel.classList.remove('active');
    showPanel(toPanel);
    return;
  }
  gsap.killTweensOf(fromPanel);
  gsap.to(fromPanel, {
    opacity: 0, y: -8, duration: 0.16, ease: 'power1.in',
    onComplete: () => {
      fromPanel.classList.remove('active');
      gsap.set(fromPanel, { clearProps: 'opacity,transform' });
      showPanel(toPanel);
    },
  });
}

function quirkyBounce(el) {
  if (!el || prefersReducedMotion || typeof gsap === 'undefined') return;
  gsap.killTweensOf(el);
  gsap.fromTo(el,
    { scale: 0.94, rotate: -1.2 },
    { scale: 1, rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)' }
  );
}

function animateThemeIcon(el) {
  if (!el || prefersReducedMotion || typeof gsap === 'undefined') return;
  gsap.killTweensOf(el);
  gsap.fromTo(el, { rotate: -90, scale: 0.5, opacity: 0 }, { rotate: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.5)' });
}

function toastPop(el) {
  if (!el) return;
  if (prefersReducedMotion || typeof gsap === 'undefined') return;
  gsap.killTweensOf(el);
  gsap.fromTo(el,
    { scale: 0.85, y: 14 },
    { scale: 1, y: 0, duration: 0.5, ease: 'back.out(3)' }
  );
}

/* ---------------- anime.js: staggered reveals + confetti ---------------- */

function staggerIn(container) {
  if (!container || prefersReducedMotion || typeof anime === 'undefined') return;
  const children = container.children;
  if (!children || !children.length) return;
  anime({
    targets: children,
    opacity: [0, 1],
    translateY: [16, 0],
    scale: [0.92, 1],
    delay: anime.stagger(35),
    duration: 420,
    easing: 'easeOutQuad',
  });
}

function confettiBurst(x, y, color) {
  if (prefersReducedMotion || typeof anime === 'undefined') return;
  const colors = color ? [color, '#6d5dfc', '#ff6b9d', '#22d3c5'] : ['#6d5dfc', '#ff6b9d', '#22d3c5', '#ffd43b'];
  const count = 12;
  const dots = [];
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    const size = 5 + Math.random() * 4;
    dot.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
      `border-radius:50%;background:${colors[i % colors.length]};pointer-events:none;z-index:200;` +
      `opacity:0;`;
    document.body.appendChild(dot);
    dots.push(dot);
  }
  dots.forEach((dot, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 40 + Math.random() * 50;
    anime({
      targets: dot,
      translateX: Math.cos(angle) * dist,
      translateY: Math.sin(angle) * dist - 10,
      opacity: [{ value: 1, duration: 80 }, { value: 0, duration: 500, delay: 250 }],
      scale: [1, 0.4],
      rotate: Math.random() * 180 - 90,
      easing: 'easeOutExpo',
      duration: 750,
      delay: anime.stagger(8),
      complete: () => dot.remove(),
    });
  });
}

/* ---------------- Motion One: lightweight press/hover feedback ---------------- */

const PRESS_SELECTOR = '.btn, .seg-btn, .icon-btn, .tab-btn, .swatch, .preset-swatch, .lock-btn, ' +
  '.eyedrop-btn, .select, input[type="color"], .oklch-switch, .brand-kit-swatch, .qr-btn';

let pressedEl = null;

function initGlobalPressFeedback() {
  if (prefersReducedMotion) return;

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(PRESS_SELECTOR);
    if (!el) return;
    pressedEl = el;
    if (window.Motion && window.Motion.animate) {
      window.Motion.animate(el, { scale: 0.94 }, { duration: 0.12, easing: 'ease-out', fill: 'forwards' });
    }
  }, { passive: true });

  const release = () => {
    if (!pressedEl) return;
    if (window.Motion && window.Motion.animate) {
      window.Motion.animate(pressedEl, { scale: 1 }, { duration: 0.35, easing: [0.34, 1.56, 0.64, 1], fill: 'forwards' });
    }
    pressedEl = null;
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  /* Any toggle switch built on the .oklch-switch pattern gets a quick
     elastic flip on state change — more delightful than the generic
     press feedback alone for something that's fundamentally an on/off
     flip, not just a button press. */
  document.addEventListener('change', (e) => {
    const toggle = e.target.closest('.oklch-switch');
    if (toggle) quirkyBounce(toggle);
  });
}
