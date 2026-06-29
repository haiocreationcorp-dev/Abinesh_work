// Character art is pre-normalized: every skin pixel (face, neck, hands, etc.) is exactly
// one of these 2 flat neon placeholder colors — no anti-aliasing, no in-between shades.
// Deliberately obviously-synthetic (not a plausible real skin shade) so a normalized-but-
// not-yet-recolored asset is unmistakably a "marked placeholder" wherever it's viewed raw
// (Browse Assets, Face Builder, Pose Builder's box canvas, any picker thumbnail), instead
// of looking like a real (wrong) skin tone — same convention Eye Normalizer already uses
// for eyebrow/iris (EYEBROW_REF_COLOR/IRIS_REF_COLOR in recolorImage.js). Every render path
// that actually displays a character always resolves and applies a real skinTone on top of
// this, the same way hairColor/irisColor always get applied over the eye placeholders.
export const NORMALIZED_SKIN_PALETTE = { highlight: '#00F0FF', base: '#FF00FF', shadow: '#00F0FF' };

export const SKIN_PRESETS = {
  fair:      { id: 'fair',      label: 'Fair',       highlight: '#FFE0C8', base: '#FFC8A0', shadow: '#D89A70' },
  light:     { id: 'light',     label: 'Light',      highlight: '#FBD9B8', base: '#F2BD90', shadow: '#C9986A' },
  tan:       { id: 'tan',       label: 'Tan',        highlight: '#F0C49E', base: '#D9A876', shadow: '#AD7A50' },
  brown:     { id: 'brown',     label: 'Brown',      highlight: '#C68D63', base: '#A56A47', shadow: '#7A4A32' },
  darkBrown: { id: 'darkBrown', label: 'Dark Brown', highlight: '#8D5A3C', base: '#6B3F28', shadow: '#4A2A1C' },
  deepBrown: { id: 'deepBrown', label: 'Deep Brown', highlight: '#5A3825', base: '#3E2417', shadow: '#2A150D' },
};

function hexToBytes(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Exact pixel-color replacement. No HSV/hue range, no segmentation: every pixel is
// compared byte-for-byte against the 3 reference colors, and only exact matches swap.
// Alpha is preserved as-is; fully transparent pixels are skipped untouched.
// The highlight bucket is no longer produced by Palette Normalizer (disabled once an
// admin picks Base+Shadow samples directly), but a few older assets normalized before
// that existed may still have real highlight-colored pixels — still recognized here so
// they keep recoloring, just folded into the shadow tone instead of a separate highlight.
export function applySkinPalette(imageData, oldPalette, newPalette) {
  const data = new Uint8ClampedArray(imageData.data);
  const oldRgb = [oldPalette.highlight, oldPalette.base, oldPalette.shadow].map(hexToBytes);
  const newRgb = [newPalette.shadow, newPalette.base, newPalette.shadow].map(hexToBytes);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    for (let p = 0; p < 3; p++) {
      const [or, og, ob] = oldRgb[p];
      if (r === or && g === og && b === ob) {
        [data[i], data[i + 1], data[i + 2]] = newRgb[p];
        break;
      }
    }
  }

  return typeof ImageData !== 'undefined'
    ? new ImageData(data, imageData.width, imageData.height)
    : { data, width: imageData.width, height: imageData.height };
}
