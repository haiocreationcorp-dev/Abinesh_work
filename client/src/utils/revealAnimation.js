// Forces the browser to restart a CSS animation on an already-mounted node (just changing
// the `animation` string back to the same value is a no-op — this triggers a reflow in
// between so the keyframes actually replay). Three helpers, one per effect:
//   playReveal        — Effect 2: bottom-to-top wipe, 2 s (first character placement only)
//   playGreyFade      — Effect 1: ash/grey fade-in, 0.5 s (hairstyle/expression/colour swaps)
//   playVanishReappear— Effect 3: vanish 1.5 s → reappear at 1.6 s (outfit/pose swaps)

function restartAnimation(el, animation) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetHeight; // eslint-disable-line no-unused-expressions
  el.style.animation = animation;
}

export function playReveal(el) {
  restartAnimation(el, 'reveal-up 2s ease-out');
}

export function playGreyFade(el) {
  restartAnimation(el, 'fade-grey 0.5s ease-out');
}

export function playVanishReappear(el) {
  restartAnimation(el, 'vanish-reappear 1.6s ease-out');
}
