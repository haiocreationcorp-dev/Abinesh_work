// One-time upload-time preprocessing: detects skin-toned pixels in non-normalized
// source art (gradient/anti-aliased shading) and quantizes them down to exactly the
// 3 flat reference tones the Comic UI's exact-match skin color swap expects.
//
// This is deliberately heuristic (HSV range + luminance clustering) — that's fine here
// because it only runs once at upload time. The runtime swap itself stays exact-match-only.

const NORMALIZED_SKIN_PALETTE = {
  highlight: [0xff, 0xe0, 0xc8],
  base: [0xff, 0xc8, 0xa0],
  shadow: [0xd8, 0x9a, 0x70],
};

function rgbToHsv(r, g, b) {
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
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

const DEFAULT_SKIN_THRESHOLDS = { hueMin: 5, hueMax: 50, satMin: 0.08, valMin: 0.12 };

// Typical flat/cel-shaded skin tones (peach, tan, brown) sit in a warm hue band with
// moderate-to-high saturation, and aren't near-white, near-black, or grayscale (hair/eyes).
// `thresholds` defaults to the historically hardcoded values so existing callers are
// unaffected; an admin can override them per-upload when art has costume colors that
// overlap this range (e.g. khaki/tan uniforms).
function isSkinLike(r, g, b, thresholds = DEFAULT_SKIN_THRESHOLDS) {
  const { hueMin, hueMax, satMin, valMin } = thresholds;
  const [h, s, v] = rgbToHsv(r, g, b);
  if (s < satMin || v < valMin) return false; // grayscale (incl. near-white bg) or too dark to read as skin
  return h >= hueMin && h <= hueMax;
}

// Separable box blur over a single-channel map — smooths the luminance used to decide
// *where* each band boundary falls, so per-pixel render noise in the source art doesn't
// make that boundary location jitter pixel-to-pixel. Blurring alone doesn't fix the
// jagged hard-edge look of snapping to an exact color though — that needs the boundary
// blend below. Each fixes a different artifact; neither alone is enough.
function boxBlur(map, width, height, radius) {
  if (radius <= 0) return map;
  const w = radius * 2 + 1;
  const tmp = new Float32Array(map.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += map[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / w;
      sum += map[row + Math.min(width - 1, x + radius + 1)] - map[row + Math.max(0, x - radius)];
    }
  }
  const out = new Float32Array(map.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / w;
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

// 1D k-means — buckets luminance values into k clusters, returns centroids ascending.
function kmeans1D(values, k = 3, iterations = 12) {
  const min = Math.min(...values), max = Math.max(...values);
  let centroids = Array.from({ length: k }, (_, i) => min + ((max - min) * (i + 0.5)) / k);
  for (let it = 0; it < iterations; it++) {
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (const v of values) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const d = Math.abs(v - centroids[i]);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      sums[bestI] += v;
      counts[bestI]++;
    }
    for (let i = 0; i < k; i++) if (counts[i] > 0) centroids[i] = sums[i] / counts[i];
  }
  return centroids.slice().sort((a, b) => a - b);
}

// Quantizes skin-like pixels in a flat RGBA buffer to the 3 reference skin tones.
// Returns { buffer, changed } where changed = number of pixels modified.
// Pixels with alpha 0 are skipped. If too few skin-like pixels are found (nothing
// resembling skin in this image), the buffer is returned unmodified.
//
// `dims` (optional { width, height }) enables the smooth-boundary path: the decision
// luminance is spatially blurred first (removes per-pixel render noise so the boundary
// location doesn't jitter), then pixels solidly within a band snap to the exact reference
// color (so the vast majority of skin pixels stay perfectly swappable at runtime), while
// pixels in a zone right at the midpoint between two bands are linearly blended between
// the two neighboring reference colors instead of hard-snapped — true anti-aliasing
// instead of a jagged stairstep. The cost: that thin blended edge isn't an exact match,
// so it won't be recolored when a different preset is applied.
function quantizeSkinTones(rgba, palette = NORMALIZED_SKIN_PALETTE, minPixels = 50, thresholds = DEFAULT_SKIN_THRESHOLDS, dims = null) {
  const data = Buffer.from(rgba);
  const lumOf = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

  const skinIdx = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (isSkinLike(r, g, b, thresholds)) skinIdx.push(i);
  }

  if (skinIdx.length < minPixels) return { buffer: data, changed: 0 };

  const blendEdges = !!(dims && dims.width && dims.height);
  let lums;
  if (blendEdges) {
    const { width, height } = dims;
    const fullLum = new Float32Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const i = p * 4;
      fullLum[p] = lumOf(data[i], data[i + 1], data[i + 2]);
    }
    const blurred = boxBlur(fullLum, width, height, 6);
    lums = skinIdx.map((i) => blurred[i / 4]);
  } else {
    lums = skinIdx.map((i) => lumOf(data[i], data[i + 1], data[i + 2]));
  }

  const centroids = kmeans1D(lums, 3); // ascending: [shadow, base, highlight]
  const targets = [palette.shadow, palette.base, palette.highlight];
  const BLEND_FRACTION = 0.6; // share of each inter-centroid gap (centered on its midpoint) that gets a true blend

  for (let n = 0; n < skinIdx.length; n++) {
    const i = skinIdx[n];
    const l = lums[n];

    if (!blendEdges) {
      let bestI = 0, bestD = Infinity;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(l - centroids[c]);
        if (d < bestD) { bestD = d; bestI = c; }
      }
      const [tr, tg, tb] = targets[bestI];
      data[i] = tr; data[i + 1] = tg; data[i + 2] = tb;
      continue;
    }

    const lowI = l <= centroids[1] ? 0 : 1;
    const highI = lowI + 1;
    const gap = centroids[highI] - centroids[lowI];
    const mid = (centroids[lowI] + centroids[highI]) / 2;
    const halfWidth = (gap * BLEND_FRACTION) / 2;

    if (gap <= 0 || l <= mid - halfWidth) {
      const [tr, tg, tb] = targets[lowI];
      data[i] = tr; data[i + 1] = tg; data[i + 2] = tb;
    } else if (l >= mid + halfWidth) {
      const [tr, tg, tb] = targets[highI];
      data[i] = tr; data[i + 1] = tg; data[i + 2] = tb;
    } else {
      const t = (l - (mid - halfWidth)) / (2 * halfWidth);
      const [lr, lg, lb] = targets[lowI];
      const [hr, hg, hb] = targets[highI];
      data[i] = Math.round(lr + (hr - lr) * t);
      data[i + 1] = Math.round(lg + (hg - lg) * t);
      data[i + 2] = Math.round(lb + (hb - lb) * t);
    }
  }

  return { buffer: data, changed: skinIdx.length };
}

module.exports = { rgbToHsv, isSkinLike, kmeans1D, quantizeSkinTones, NORMALIZED_SKIN_PALETTE, DEFAULT_SKIN_THRESHOLDS };
