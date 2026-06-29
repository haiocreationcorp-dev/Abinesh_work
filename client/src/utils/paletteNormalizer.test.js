import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, previewMask, stampCircle, paintStroke,
  removeNearWhiteBackground, stampAlpha, paintAlphaStroke,
  thresholdsFromSample, mergeThresholds,
  DEFAULT_DETECTION, STANDARD_PALETTE,
} from './paletteNormalizer.js';

// A narrow detection window that only catches a bright "highlight"-range pixel.
const NARROW_DETECTION = { hMin: 0, hMax: 50, sMin: 10, sMax: 30, vMin: 90, vMax: 100 };

function makeBuffer(pixels) {
  return new Uint8ClampedArray(pixels.flat());
}

test('normalize ignores pixels outside detection by default', () => {
  // One pixel inside the window (bright peach), one outside (a saturated red, like a costume).
  const src = makeBuffer([
    [255, 230, 210, 255], // bright peach — h~24, s~17.6%, v~100 → inside NARROW_DETECTION
    [200, 30, 30, 255],   // saturated red costume — well outside the window
  ]);
  const out = new Uint8ClampedArray(src.length);
  normalize(src, out, NARROW_DETECTION, 70, 40, STANDARD_PALETTE);

  // Highlight-brightness pixels fold into the shadow bucket now (see normalize()'s comment).
  assert.deepEqual([out[0], out[1], out[2]], [STANDARD_PALETTE.shadow.r, STANDARD_PALETTE.shadow.g, STANDARD_PALETTE.shadow.b]);
  assert.deepEqual([out[4], out[5], out[6]], [200, 30, 30]); // untouched
});

test('override = -1 excludes a pixel even though its color matches the detection window', () => {
  const src = makeBuffer([
    [255, 230, 210, 255], // would normally match NARROW_DETECTION
  ]);
  const out = new Uint8ClampedArray(src.length);
  const overrides = new Int8Array([-1]); // eraser stroke over this pixel
  normalize(src, out, NARROW_DETECTION, 70, 40, STANDARD_PALETTE, overrides);

  assert.deepEqual([out[0], out[1], out[2]], [255, 230, 210]); // left untouched despite matching color
});

test('override = 1 includes a pixel even though its color is nowhere near the detection window', () => {
  const src = makeBuffer([
    [176, 140, 95, 255], // the exact "shares a color with the uniform" case — outside NARROW_DETECTION
  ]);
  const out = new Uint8ClampedArray(src.length);
  const overrides = new Int8Array([1]); // brush stroke forcing this pixel to count as skin
  normalize(src, out, NARROW_DETECTION, 70, 40, STANDARD_PALETTE, overrides);

  // v ≈ 69%, between lowCut(40) and highCut(70) → maps to "base"
  assert.deepEqual([out[0], out[1], out[2]], [STANDARD_PALETTE.base.r, STANDARD_PALETTE.base.g, STANDARD_PALETTE.base.b]);
});

test('two pixels with identical RGB can be resolved oppositely via overrides', () => {
  // This is the actual scenario: a mustache-shadow pixel and a uniform pixel share one
  // RGB value. Pure color detection can never split them; per-pixel overrides can.
  const src = makeBuffer([
    [176, 140, 95, 255], // "mustache shadow" — admin brushes this one IN
    [176, 140, 95, 255], // "uniform fabric"   — admin leaves this one OUT (or erases it)
  ]);
  const out = new Uint8ClampedArray(src.length);
  const overrides = new Int8Array([1, -1]);
  normalize(src, out, DEFAULT_DETECTION, 70, 40, STANDARD_PALETTE, overrides);

  assert.notDeepEqual([out[0], out[1], out[2]], [out[4], out[5], out[6]]);
  assert.deepEqual([out[4], out[5], out[6]], [176, 140, 95]); // uniform pixel untouched
});

test('previewMask reflects overrides the same way normalize does', () => {
  const src = makeBuffer([
    [176, 140, 95, 255],
    [176, 140, 95, 255],
  ]);
  const out = new Uint8ClampedArray(src.length);
  const overrides = new Int8Array([1, -1]);
  previewMask(src, out, DEFAULT_DETECTION, overrides);

  assert.deepEqual([out[0], out[1], out[2]], [255, 0, 255]); // flagged magenta
  assert.deepEqual([out[4], out[5], out[6]], [176, 140, 95]); // not flagged
});

test('normalize auto-protects near-black line-art pixels even when detection technically covers v=0', () => {
  // A deliberately wide-open detection window (e.g. what you'd get after picking a very
  // dark Shadow sample) that would otherwise swallow black ink lines as "shadow skin".
  const wideOpenDetection = { hMin: 0, hMax: 360, sMin: 0, sMax: 100, vMin: 0, vMax: 100 };
  const src = makeBuffer([
    [8, 6, 5, 255],        // near-black ink line — v ≈ 3%
    [255, 200, 160, 255],  // ordinary skin pixel, for contrast
  ]);
  const out = new Uint8ClampedArray(src.length);
  normalize(src, out, wideOpenDetection, 70, 40, STANDARD_PALETTE);

  assert.deepEqual([out[0], out[1], out[2]], [8, 6, 5]); // retained as-is, not flattened to shadow
  assert.notDeepEqual([out[4], out[5], out[6]], [255, 200, 160]); // the skin pixel still gets normalized
});

test('brush override can still force-include a near-black pixel despite the auto-protection floor', () => {
  const wideOpenDetection = { hMin: 0, hMax: 360, sMin: 0, sMax: 100, vMin: 0, vMax: 100 };
  const src = makeBuffer([[8, 6, 5, 255]]);
  const out = new Uint8ClampedArray(src.length);
  const overrides = new Int8Array([1]); // admin explicitly brushed this pixel in
  normalize(src, out, wideOpenDetection, 70, 40, STANDARD_PALETTE, overrides);

  // v ≈ 3% < lowCut(40) → shadow bucket
  assert.deepEqual([out[0], out[1], out[2]], [STANDARD_PALETTE.shadow.r, STANDARD_PALETTE.shadow.g, STANDARD_PALETTE.shadow.b]);
});

function makeOpaqueImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255); // fully opaque white
  return { data, width, height };
}

test('mergeThresholds bounds two sample windows (e.g. a base pick and a darker shadow pick) into one', () => {
  const base = thresholdsFromSample(24, 17, 95);   // bright peach
  const shadow = thresholdsFromSample(20, 22, 45);  // much darker, same family
  const merged = mergeThresholds([base, shadow]);

  // The merged window must be wide enough to cover both samples' own tolerance windows.
  assert.ok(merged.vMin <= shadow.vMin && merged.vMax >= base.vMax);
  assert.ok(merged.hMin <= Math.min(base.hMin, shadow.hMin));
  assert.ok(merged.hMax >= Math.max(base.hMax, shadow.hMax));
});

test('stampCircle marks every pixel within radius, none outside it', () => {
  const { data, width, height } = makeOpaqueImage(20, 20);
  const overrides = new Int8Array(width * height);
  stampCircle(overrides, data, width, height, 10, 10, 3, 1);

  assert.equal(overrides[10 * width + 10], 1); // dead center
  assert.equal(overrides[10 * width + 13], 1); // edge of radius (dx=3)
  assert.equal(overrides[10 * width + 16], 0); // well outside radius
});

test('stampCircle skips fully transparent pixels', () => {
  const { width, height } = makeOpaqueImage(10, 10);
  const data = new Uint8ClampedArray(width * height * 4); // alpha 0 everywhere
  const overrides = new Int8Array(width * height);
  stampCircle(overrides, data, width, height, 5, 5, 3, 1);

  assert.ok(overrides.every((v) => v === 0));
});

test('paintStroke leaves a continuous line with no gaps for a fast/long drag', () => {
  // A single stampCircle at each endpoint, with a small radius, would leave a big gap
  // in the middle of a long stroke — paintStroke must interpolate to avoid that.
  const { data, width, height } = makeOpaqueImage(100, 10);
  const overrides = new Int8Array(width * height);
  paintStroke(overrides, data, width, height, 5, 5, 95, 5, 2, 1);

  let gaps = 0;
  for (let x = 5; x <= 95; x++) {
    if (overrides[5 * width + x] !== 1) gaps++;
  }
  assert.equal(gaps, 0, 'every point along the dragged line should be covered');
});

test('paintStroke with value -1 erases instead of including', () => {
  const { data, width, height } = makeOpaqueImage(20, 20);
  const overrides = new Int8Array(width * height).fill(1); // pretend everything was brushed in already
  paintStroke(overrides, data, width, height, 10, 10, 10, 10, 4, -1);

  assert.equal(overrides[10 * width + 10], -1);
});

test('removeNearWhiteBackground erases only white connected to an edge, not white inside the character', () => {
  // 5x5 image: white border (background) surrounding a 3x3 opaque non-white "character"
  // with one white pixel INSIDE it (e.g. an eye) that must survive untouched.
  const width = 5, height = 5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isBorder = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isInnerEye = x === 2 && y === 2;
      if (isBorder || isInnerEye) {
        data[i] = data[i + 1] = data[i + 2] = 255; // white
      } else {
        data[i] = 80; data[i + 1] = 40; data[i + 2] = 20; // character color
      }
      data[i + 3] = 255;
    }
  }

  const erased = removeNearWhiteBackground(data, width, height);

  assert.equal(erased, width * height - 9); // every border pixel, none of the 3x3 interior
  assert.equal(data[(0 * width + 0) * 4 + 3], 0); // corner background erased
  assert.equal(data[(2 * width + 2) * 4 + 3], 255); // inner white "eye" survives — not edge-connected
  assert.equal(data[(2 * width + 1) * 4 + 3], 255); // character-colored interior pixel untouched
});

test('stampAlpha sets alpha within radius and leaves pixels outside it alone', () => {
  const width = 20, height = 20;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  stampAlpha(data, width, height, 10, 10, 3, 0);

  assert.equal(data[(10 * width + 10) * 4 + 3], 0);
  assert.equal(data[(10 * width + 16) * 4 + 3], 255); // well outside radius
});

test('paintAlphaStroke can erase then restore the same area', () => {
  const width = 30, height = 10;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  paintAlphaStroke(data, width, height, 5, 5, 25, 5, 2, 0);
  let stillOpaque = 0;
  for (let x = 5; x <= 25; x++) if (data[(5 * width + x) * 4 + 3] !== 0) stillOpaque++;
  assert.equal(stillOpaque, 0, 'whole stroke should be erased');

  paintAlphaStroke(data, width, height, 5, 5, 25, 5, 2, 255);
  let stillTransparent = 0;
  for (let x = 5; x <= 25; x++) if (data[(5 * width + x) * 4 + 3] !== 255) stillTransparent++;
  assert.equal(stillTransparent, 0, 'restore should bring the whole stroke back to opaque');
});
