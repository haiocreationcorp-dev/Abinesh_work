// Ported from the C:\New_Way\palette-normalizer standalone prototype. Unlike
// skinPalette.js (exact-match only, used at runtime in the Comic UI), this is the
// admin-side authoring tool: detect skin via tunable HSV thresholds, bucket detected
// pixels into highlight/base/shadow by a direct brightness cutoff (no k-means — the
// admin tunes the cutoffs by eye against the live preview), and write them to the
// standard 3-color palette so the runtime exact-match swap works on the result.

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const v = max;
  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, v: v * 100 };
}

export const DEFAULT_DETECTION = { hMin: 0, hMax: 50, sMin: 10, sMax: 80, vMin: 20, vMax: 100 };
export const DEFAULT_HIGH_CUT = 70;
export const DEFAULT_LOW_CUT = 40;

export function isSkinHsv(h, s, v, t) {
  return h >= t.hMin && h <= t.hMax && s >= t.sMin && s <= t.sMax && v >= t.vMin && v <= t.vMax;
}

// Window applied around a single sampled pixel to derive detection thresholds, wide
// enough to cover that region's own highlight/shadow shading without picking up
// unrelated hues.
const SAMPLE_TOLERANCE = { h: 15, s: 25, v: 30 };

export function thresholdsFromSample(h, s, v) {
  return {
    hMin: Math.max(0, h - SAMPLE_TOLERANCE.h),
    hMax: Math.min(360, h + SAMPLE_TOLERANCE.h),
    sMin: Math.max(0, s - SAMPLE_TOLERANCE.s),
    sMax: Math.min(100, s + SAMPLE_TOLERANCE.s),
    vMin: Math.max(0, v - SAMPLE_TOLERANCE.v),
    vMax: Math.min(100, v + SAMPLE_TOLERANCE.v),
  };
}

// Combines multiple per-sample HSV windows (e.g. one from a "base" eyedropper click, one
// from a "shadow" click) into a single bounding window covering all of them — lets two
// picks define the detection range together instead of forcing one sample to cover both
// the base and shadow shading by itself.
export function mergeThresholds(windows) {
  return windows.reduce((acc, w) => ({
    hMin: Math.min(acc.hMin, w.hMin), hMax: Math.max(acc.hMax, w.hMax),
    sMin: Math.min(acc.sMin, w.sMin), sMax: Math.max(acc.sMax, w.sMax),
    vMin: Math.min(acc.vMin, w.vMin), vMax: Math.max(acc.vMax, w.vMax),
  }));
}

// Standardized 3-shade palette every normalized character converges to.
export const STANDARD_PALETTE = {
  highlight: { r: 0xff, g: 0xe0, b: 0xc8 },
  base: { r: 0xff, g: 0xc8, b: 0xa0 },
  shadow: { r: 0xd8, g: 0x9a, b: 0x70 },
};

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// "Brown Skin Palette" worked example, kept verbatim. Fair = STANDARD_PALETTE (no-op).
export const RECOLOR_PRESETS = [
  { name: 'Fair', highlight: '#FFE0C8', base: '#FFC8A0', shadow: '#D89A70' },
  { name: 'Light', highlight: '#FBD9B8', base: '#F2BD90', shadow: '#C9986A' },
  { name: 'Tan', highlight: '#F0C49E', base: '#D9A876', shadow: '#AD7A50' },
  { name: 'Brown', highlight: '#C68D63', base: '#A56A47', shadow: '#7A4A32' },
  { name: 'Dark Brown', highlight: '#8D5A3C', base: '#6B3F28', shadow: '#4A2A1C' },
  { name: 'Deep Brown', highlight: '#5A3825', base: '#3E2417', shadow: '#2A150D' },
];

// ---------- Stage 1: detect + map brightness to the standard palette ----------

// V (brightness) cutoff below which a pixel is always treated as black line-art ink,
// never as skin — no picking or masking required. Real skin shadow, even dark skin, sits
// well above this; only true near-black outline strokes live this low. Without this floor,
// a widened shadow detection window (from picking a dark Shadow sample) can swallow the
// character's own ink lines and flatten them into the shadow skin color.
const OUTLINE_PROTECT_V_MAX = 12;

// Color-based detection alone can't separate two regions that happen to share the same
// RGB value (e.g. a mustache shadow tone reused as a uniform's fabric shade — no HSV
// window can include one without the other). `overrides` is an optional Int8Array,
// one entry per pixel, painted by the admin's brush/eraser tool: 1 forces a pixel to
// count as skin regardless of color, -1 forces it to be excluded regardless of color,
// 0 (default) falls back to plain HSV detection (with the black-line-art floor above).
function resolveIsSkin(r, g, b, detection, overrides, p) {
  const override = overrides ? overrides[p] : 0;
  if (override === 1) return true;
  if (override === -1) return false;
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v <= OUTLINE_PROTECT_V_MAX) return false;
  return isSkinHsv(h, s, v, detection);
}

export function normalize(srcData, outData, detection, highCut, lowCut, palette, overrides) {
  for (let i = 0; i < srcData.length; i += 4) {
    const a = srcData[i + 3];
    outData[i] = srcData[i];
    outData[i + 1] = srcData[i + 1];
    outData[i + 2] = srcData[i + 2];
    outData[i + 3] = a;
    if (a === 0) continue;

    const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
    if (!resolveIsSkin(r, g, b, detection, overrides, i / 4)) continue;

    const { v } = rgbToHsv(r, g, b);
    const target = v >= highCut ? palette.highlight : v < lowCut ? palette.shadow : palette.base;

    outData[i] = target.r;
    outData[i + 1] = target.g;
    outData[i + 2] = target.b;
  }
  return outData;
}

// Diagnostic overlay: paints detected pixels magenta so thresholds (and brush/eraser
// overrides) can be tuned by eye before normalizing. Black line-art pixels never show up
// here since resolveIsSkin auto-excludes them.
export function previewMask(srcData, outData, detection, overrides) {
  for (let i = 0; i < srcData.length; i += 4) {
    const a = srcData[i + 3];
    outData[i] = srcData[i];
    outData[i + 1] = srcData[i + 1];
    outData[i + 2] = srcData[i + 2];
    outData[i + 3] = a;
    if (a === 0) continue;

    const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
    if (!resolveIsSkin(r, g, b, detection, overrides, i / 4)) continue;

    outData[i] = 255;
    outData[i + 1] = 0;
    outData[i + 2] = 255;
  }
  return outData;
}

export function countUniqueSkinShades(data, detection, overrides) {
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!resolveIsSkin(r, g, b, detection, overrides, i / 4)) continue;
    seen.add((r << 16) | (g << 8) | b);
  }
  return seen.size;
}

// ---------- Brush/eraser stroke painting (manual mask touch-up) ----------

// Stamps a filled circle of `value` into the override map, skipping fully transparent
// pixels and out-of-bounds coordinates.
export function stampCircle(overrides, data, width, height, cx, cy, radius, value) {
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= width || dx * dx + dy * dy > radius * radius) continue;
      const p = y * width + x;
      if (data[p * 4 + 3] === 0) continue;
      overrides[p] = value;
    }
  }
}

// Stamps circles along the line from (x0,y0) to (x1,y1), spaced closer than the brush
// radius, so a fast drag leaves a continuous stroke instead of separate dots with gaps.
export function paintStroke(overrides, data, width, height, x0, y0, x1, y1, radius, value) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius / 3);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    stampCircle(overrides, data, width, height, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), radius, value);
  }
}

// ---------- Background removal (auto flood-fill + manual brush touch-up) ----------

// Mirrors the server's removeWhiteBackground (admin.js): BFS flood-fill from the 4 edges,
// erasing only near-white pixels connected to the border — white *inside* the character
// (eyes, shirt) is left alone since it's never reached from an edge. Mutates `data` in
// place (sets alpha to 0) and returns how many pixels were erased.
export function removeNearWhiteBackground(data, width, height, tolerance = 30) {
  const isNearWhite = (i) => data[i] > 255 - tolerance && data[i + 1] > 255 - tolerance && data[i + 2] > 255 - tolerance;
  const visited = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const f = y * width + x;
    if (visited[f]) return;
    if (!isNearWhite(f * 4)) return;
    visited[f] = 1;
    queue.push(x, y);
  };
  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }

  let head = 0, erased = 0;
  while (head < queue.length) {
    const x = queue[head++], y = queue[head++];
    data[(y * width + x) * 4 + 3] = 0;
    erased++;
    enqueue(x + 1, y); enqueue(x - 1, y); enqueue(x, y + 1); enqueue(x, y - 1);
  }
  return erased;
}

// Manual touch-up for background spots the auto flood-fill missed (isolated patches not
// connected to an edge) or accidentally erased — sets alpha directly, bypassing color
// entirely (this is a location-based tool, not a detection one).
export function stampAlpha(data, width, height, cx, cy, radius, alpha) {
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= width || dx * dx + dy * dy > radius * radius) continue;
      data[(y * width + x) * 4 + 3] = alpha;
    }
  }
}

export function paintAlphaStroke(data, width, height, x0, y0, x1, y1, radius, alpha) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius / 3);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    stampAlpha(data, width, height, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), radius, alpha);
  }
}

// ---------- Stage 2: runtime exact-match recolor ----------
// Only the 3 standardized colors exist in a normalized image, so this is a plain
// exact-match pixel swap with no detection step required.

export function recolorNormalized(srcData, outData, currentPalette, newPalette) {
  const pairs = [
    [currentPalette.highlight, newPalette.highlight],
    [currentPalette.base, newPalette.base],
    [currentPalette.shadow, newPalette.shadow],
  ];
  for (let i = 0; i < srcData.length; i += 4) {
    const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2], a = srcData[i + 3];
    outData[i] = r; outData[i + 1] = g; outData[i + 2] = b; outData[i + 3] = a;
    if (a === 0) continue;
    for (const [oldColor, newColor] of pairs) {
      if (r === oldColor.r && g === oldColor.g && b === oldColor.b) {
        outData[i] = newColor.r;
        outData[i + 1] = newColor.g;
        outData[i + 2] = newColor.b;
        break;
      }
    }
  }
  return outData;
}
