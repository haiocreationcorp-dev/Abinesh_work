// WebKit/Blink (Chrome, Edge, Safari) have no CSS-only way to color the portion of a
// native <input type="range"> left of the thumb — only Firefox supports that natively
// via ::-moz-range-progress (already styled in index.css). This computes the equivalent
// as an inline gradient background for the other browsers; Firefox ignores it (its
// pseudo-elements render instead of the input's own background).
//
// The thumb (16px, set in index.css) doesn't travel the full 0–100% width of the
// track — its left edge is inset from 0 to (100% - thumbSize), same as every native
// range input. The fill stop is placed at the thumb's trailing edge (not its center)
// so the colored portion always reaches at least as far as the thumb itself — any
// stray pixel of "overfill" is simply hidden behind the opaque thumb, whereas landing
// the stop short (e.g. at the thumb's center) leaves a visible gray sliver between the
// color and the handle.
export function sliderFillStyle(value, min, max, thumbSize = 16) {
  const pct = max > min ? (value - min) / (max - min) : 0;
  const stop = `calc(${thumbSize}px + (100% - ${thumbSize}px) * ${pct})`;
  return {
    background: `linear-gradient(to right, var(--slider-fill) ${stop}, var(--slider-track) ${stop})`,
  };
}
