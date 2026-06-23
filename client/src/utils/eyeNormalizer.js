// Pure pixel logic for the Eye Normalizer admin tool — paints two independent regions
// (eyebrow, iris) of one EYE asset. Selection works exactly like Palette Normalizer's
// "Pick Base/Shadow Sample" eyedropper: clicking a pixel samples its HSV and derives a
// detection *window* (via the same rgbToHsv/thresholdsFromSample/isSkinHsv already used
// for skin detection — none of that is skin-specific despite the naming), and every pixel
// in the image whose color falls in that window is live-highlighted/selected — not just a
// one-time snapshot. Brush/eraser layer on top as force-include/force-exclude overrides
// for pixels the HSV window gets wrong, same as Palette Normalizer's brush.
import { rgbToHsv, isSkinHsv, thresholdsFromSample, mergeThresholds } from './paletteNormalizer.js';
import { EYEBROW_REF_COLOR, IRIS_REF_COLOR } from './recolorImage.js';

export function hexToBytes(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// One click only samples one shade — iris/eyebrow art usually has a highlight and a
// shadow tone, and a single sample's window doesn't always stretch far enough to cover
// both, leaving the other tone unselected. Clicking again *expands* the existing window
// to also cover the new sample (mergeThresholds — same trick Palette Normalizer uses to
// combine its separate Base/Shadow sample clicks) instead of replacing it, so a second
// click on the missed shade fixes it without losing the first click's coverage.
export function pickDetection(prevDetection, r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  const sample = thresholdsFromSample(h, s, v);
  return prevDetection ? mergeThresholds([prevDetection, sample]) : sample;
}

// Is this pixel part of the layer? override wins (brush/eraser touch-up); otherwise falls
// back to the HSV detection window, if one has been picked yet.
function isLayerSelected(r, g, b, detection, overrides, p) {
  const override = overrides ? overrides[p] : 0;
  if (override === 1) return true;
  if (override === -1) return false;
  if (!detection) return false;
  const { h, s, v } = rgbToHsv(r, g, b);
  return isSkinHsv(h, s, v, detection);
}

const EYEBROW_REF_RGB = hexToBytes(EYEBROW_REF_COLOR);
const IRIS_REF_RGB = hexToBytes(IRIS_REF_COLOR);

// Diagnostic overlay: tints selected eyebrow/iris pixels with the exact same color
// that's actually saved (EYEBROW_REF_COLOR / IRIS_REF_COLOR) — no separate "preview-only"
// color, so what you see while masking is exactly what ends up in the file, every time.
// Per `mode` ('eyebrow' | 'iris' | 'both'). Live — recomputed from the current detection
// windows + overrides every call, not a fixed snapshot. Pure — does not mutate srcData.
export function previewEyeMasks(srcData, outData, eyebrowOverrides, irisOverrides, eyebrowDetection, irisDetection, mode) {
  const showEyebrow = mode === 'eyebrow' || mode === 'both';
  const showIris = mode === 'iris' || mode === 'both';
  const eyebrowColor = EYEBROW_REF_RGB;
  const irisColor = IRIS_REF_RGB;

  for (let i = 0; i < srcData.length; i += 4) {
    const a = srcData[i + 3];
    outData[i] = srcData[i]; outData[i + 1] = srcData[i + 1]; outData[i + 2] = srcData[i + 2]; outData[i + 3] = a;
    if (a === 0) continue;
    const p = i / 4;
    const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];

    let tint = null;
    if (showEyebrow && isLayerSelected(r, g, b, eyebrowDetection, eyebrowOverrides, p)) tint = eyebrowColor;
    else if (showIris && isLayerSelected(r, g, b, irisDetection, irisOverrides, p)) tint = irisColor;
    if (!tint) continue;

    const [tr, tg, tb] = tint;
    outData[i] = Math.round(srcData[i] * 0.4 + tr * 0.6);
    outData[i + 1] = Math.round(srcData[i + 1] * 0.4 + tg * 0.6);
    outData[i + 2] = Math.round(srcData[i + 2] * 0.4 + tb * 0.6);
  }
  return outData;
}

// Flattens both regions to their fixed reference colors in one pass — this is the image
// that actually gets saved. Everything outside both selections passes through as-is.
export function applyEyeMasks(srcData, outData, eyebrowOverrides, irisOverrides, eyebrowDetection, irisDetection) {
  const eyebrowRgb = EYEBROW_REF_RGB;
  const irisRgb = IRIS_REF_RGB;

  for (let i = 0; i < srcData.length; i += 4) {
    const a = srcData[i + 3];
    outData[i] = srcData[i]; outData[i + 1] = srcData[i + 1]; outData[i + 2] = srcData[i + 2]; outData[i + 3] = a;
    if (a === 0) continue;
    const p = i / 4;
    const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];

    if (isLayerSelected(r, g, b, eyebrowDetection, eyebrowOverrides, p)) {
      outData[i] = eyebrowRgb[0]; outData[i + 1] = eyebrowRgb[1]; outData[i + 2] = eyebrowRgb[2];
    } else if (isLayerSelected(r, g, b, irisDetection, irisOverrides, p)) {
      outData[i] = irisRgb[0]; outData[i + 1] = irisRgb[1]; outData[i + 2] = irisRgb[2];
    }
  }
  return outData;
}
