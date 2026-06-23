import { applySkinPalette, NORMALIZED_SKIN_PALETTE, SKIN_PRESETS } from './skinPalette.js';

const cache = new Map();

// Fixed placeholder colors an EYE asset's eyebrow/iris regions get manually normalized
// to (via the Eye Normalizer admin tool), so this exact-match swap can find and recolor
// them independently at render time. Deliberately obviously-synthetic neon colors (not a
// plausible real eyebrow/iris shade) so a normalized-but-not-yet-recolored asset is
// unmistakably a "marked placeholder" wherever it's viewed raw (e.g. Browse Assets),
// instead of looking like a real (wrong) color. Also exactly what Eye Normalizer shows as
// its mask preview tint — same color in the tool and in the saved file, no surprises.
export const EYEBROW_REF_COLOR = '#FF00FF';
export const IRIS_REF_COLOR = '#00F0FF';

function hexToBytes(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Generalized exact-match swap: an arbitrary list of {old, new} hex pairs instead of the
// fixed 3-key highlight/base/shadow shape applySkinPalette requires. Used for eyebrow/iris,
// which are flat single-tone regions, not 3-shade skin.
export function applyExactColorSwaps(imageData, swaps) {
  const data = new Uint8ClampedArray(imageData.data);
  const pairs = swaps.map(({ old: o, new: n }) => [hexToBytes(o), hexToBytes(n)]);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    for (const [[or_, og, ob], [nr, ng, nb]] of pairs) {
      if (r === or_ && g === og && b === ob) {
        data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
        break;
      }
    }
  }

  return typeof ImageData !== 'undefined'
    ? new ImageData(data, imageData.width, imageData.height)
    : { data, width: imageData.width, height: imageData.height };
}

// Recolors an EYE part's eyebrow region (normalized to EYEBROW_REF_COLOR) to hairColor
// and/or its iris region (normalized to IRIS_REF_COLOR) to irisColor — independently, in
// one pass. Returns the original filePath unchanged if neither color is provided, or if
// the asset hasn't been normalized for this yet (the swap simply finds no matching pixels).
export function recolorEyeAsset(filePath, { hairColor, irisColor } = {}) {
  if (!filePath || (!hairColor && !irisColor)) return Promise.resolve(filePath);

  const key = `${filePath}::eye::${hairColor || ''}::${irisColor || ''}`;
  if (cache.has(key)) return cache.get(key);

  const swaps = [
    ...(hairColor ? [{ old: EYEBROW_REF_COLOR, new: hairColor }] : []),
    ...(irisColor ? [{ old: IRIS_REF_COLOR, new: irisColor }] : []),
  ];

  const isSvg = filePath.toLowerCase().endsWith('.svg');
  const promise = (isSvg ? recolorSvgSwaps(filePath, swaps) : recolorRasterSwaps(filePath, swaps))
    .catch(() => filePath);
  cache.set(key, promise);
  return promise;
}

function recolorRasterSwaps(filePath, swaps) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const recolored = applyExactColorSwaps(imageData, swaps);
      ctx.putImageData(recolored, 0, 0);
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = filePath;
  });
}

function recolorSvgSwaps(filePath, swaps) {
  return fetch(filePath)
    .then((r) => r.text())
    .then((svgText) => {
      let out = svgText;
      for (const { old: o, new: n } of swaps) {
        out = out.replace(new RegExp(o, 'gi'), n);
      }
      return URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' }));
    });
}

// Returns a Promise<string> for filePath with its skin palette swapped to presetId.
// Cached per (filePath, presetId) so re-tapping a preset during live preview is instant.
export function recolorSkin(filePath, presetId) {
  if (!filePath || !presetId) return Promise.resolve(filePath);
  const preset = SKIN_PRESETS[presetId];
  if (!preset) return Promise.resolve(filePath);

  const key = `${filePath}::${presetId}`;
  if (cache.has(key)) return cache.get(key);

  const isSvg = filePath.toLowerCase().endsWith('.svg');
  const promise = (isSvg ? recolorSvg(filePath, preset) : recolorRaster(filePath, preset))
    .catch(() => filePath);
  cache.set(key, promise);
  return promise;
}

function recolorRaster(filePath, preset) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const recolored = applySkinPalette(imageData, NORMALIZED_SKIN_PALETTE, preset);
      ctx.putImageData(recolored, 0, 0);
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = filePath;
  });
}

function recolorSvg(filePath, preset) {
  return fetch(filePath)
    .then((r) => r.text())
    .then((svgText) => {
      let out = svgText;
      for (const key of ['highlight', 'base', 'shadow']) {
        out = out.replace(new RegExp(NORMALIZED_SKIN_PALETTE[key], 'gi'), preset[key]);
      }
      return URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' }));
    });
}
