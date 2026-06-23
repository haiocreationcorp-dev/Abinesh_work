// Client-side mirror of server/src/utils/skinNormalize.js's rgbToHsv/isSkinLike —
// same units (hue in degrees 0-360, saturation/value as 0-1 fractions) so the live
// preview an admin sees while tuning thresholds matches what upload-time
// normalization will actually do with those same threshold values.

export const DEFAULT_SKIN_THRESHOLDS = { hueMin: 5, hueMax: 50, satMin: 0.08, valMin: 0.12 };

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
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

export function isSkinLike(r, g, b, thresholds = DEFAULT_SKIN_THRESHOLDS) {
  const { hueMin, hueMax, satMin, valMin } = thresholds;
  const [h, s, v] = rgbToHsv(r, g, b);
  if (s < satMin || v < valMin) return false;
  return h >= hueMin && h <= hueMax;
}

// Diagnostic overlay for the admin's mask-tuning UI: pixels matching the current
// thresholds are blended toward a flat tint color so they're easy to spot against
// the original art; everything else (and fully transparent pixels) pass through
// untouched. Pure function — does not mutate the input ImageData.
export function previewSkinMask(imageData, thresholds = DEFAULT_SKIN_THRESHOLDS, tintColor = [255, 0, 255], tintAlpha = 0.6) {
  const data = new Uint8ClampedArray(imageData.data);
  const [tr, tg, tb] = tintColor;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!isSkinLike(r, g, b, thresholds)) continue;
    data[i] = Math.round(r * (1 - tintAlpha) + tr * tintAlpha);
    data[i + 1] = Math.round(g * (1 - tintAlpha) + tg * tintAlpha);
    data[i + 2] = Math.round(b * (1 - tintAlpha) + tb * tintAlpha);
  }

  return typeof ImageData !== 'undefined'
    ? new ImageData(data, imageData.width, imageData.height)
    : { data, width: imageData.width, height: imageData.height };
}
