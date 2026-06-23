const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSkinLike, quantizeSkinTones, NORMALIZED_SKIN_PALETTE } = require('./skinNormalize.js');

// HSV(30°, 0.50, 0.70) — a skin tone with moderate saturation.
const CUSTOM_TEST_SKIN = [179, 134, 89];
// HSV(~29°, 0.25, 0.70) — same hue/brightness band as the skin tone above but lower
// saturation, simulating a khaki/tan costume color that overlaps skin's hue range.
const CUSTOM_TEST_KHAKI = [179, 156, 134];

test('isSkinLike accepts warm peach/tan/brown tones and rejects saturated/neutral colors', () => {
  assert.equal(isSkinLike(255, 200, 160), true); // peach skin
  assert.equal(isSkinLike(180, 120, 80), true); // tan skin
  assert.equal(isSkinLike(90, 60, 40), true); // brown skin
  assert.equal(isSkinLike(20, 20, 220), false); // saturated blue costume
  assert.equal(isSkinLike(30, 30, 30), false); // near-black hair
  assert.equal(isSkinLike(245, 245, 245), false); // near-white background
  assert.equal(isSkinLike(128, 128, 128), false); // gray (no saturation)
});

test('quantizeSkinTones snaps a gradient of skin-like pixels down to exactly 3 flat tones', () => {
  // Simulate a gradient-shaded skin region: 30 pixels ranging from light peach to dark tan,
  // none of which exactly match the 3 reference colors.
  const pixels = [];
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    const r = Math.round(255 - t * 120);
    const g = Math.round(210 - t * 100);
    const b = Math.round(170 - t * 90);
    pixels.push(r, g, b, 255);
  }
  // A few unrelated, non-skin pixels (saturated costume color) — must stay untouched.
  pixels.push(20, 20, 220, 255, 20, 20, 220, 255);
  // A transparent pixel that would otherwise look skin-like — must be skipped.
  pixels.push(255, 200, 160, 0);

  const rgba = Buffer.from(pixels);
  const { buffer, changed } = quantizeSkinTones(rgba, NORMALIZED_SKIN_PALETTE, 10);

  assert.equal(changed, 30);

  const refs = [NORMALIZED_SKIN_PALETTE.highlight, NORMALIZED_SKIN_PALETTE.base, NORMALIZED_SKIN_PALETTE.shadow];
  for (let i = 0; i < 30; i++) {
    const px = [buffer[i * 4], buffer[i * 4 + 1], buffer[i * 4 + 2]];
    const isExactRef = refs.some(([r, g, b]) => px[0] === r && px[1] === g && px[2] === b);
    assert.ok(isExactRef, `pixel ${i} (${px}) should be snapped to one of the 3 reference tones`);
  }

  // Unrelated costume color untouched
  const costumeIdx = 30 * 4;
  assert.deepEqual(
    [buffer[costumeIdx], buffer[costumeIdx + 1], buffer[costumeIdx + 2], buffer[costumeIdx + 3]],
    [20, 20, 220, 255]
  );

  // Transparent pixel untouched
  const transparentIdx = 32 * 4;
  assert.equal(buffer[transparentIdx + 3], 0);
});

test('quantizeSkinTones is a no-op when there are too few skin-like pixels', () => {
  const rgba = Buffer.from([20, 20, 220, 255, 30, 30, 30, 255]); // costume + hair, no skin
  const { buffer, changed } = quantizeSkinTones(rgba, NORMALIZED_SKIN_PALETTE, 50);
  assert.equal(changed, 0);
  assert.deepEqual([...buffer], [20, 20, 220, 255, 30, 30, 30, 255]);
});

test('isSkinLike supports custom thresholds to separate skin from a costume color sharing its hue range', () => {
  // Under the historical hardcoded defaults, both pass — this is the real mis-detection
  // this feature exists to fix (e.g. a khaki uniform getting flattened as skin).
  assert.equal(isSkinLike(...CUSTOM_TEST_SKIN), true);
  assert.equal(isSkinLike(...CUSTOM_TEST_KHAKI), true);

  // Raising satMin (admin-tuned via the mask preview) separates them while keeping
  // the default hue/val window.
  const tightened = { hueMin: 5, hueMax: 50, satMin: 0.35, valMin: 0.12 };
  assert.equal(isSkinLike(...CUSTOM_TEST_SKIN, tightened), true);
  assert.equal(isSkinLike(...CUSTOM_TEST_KHAKI, tightened), false);
});

test('quantizeSkinTones respects custom thresholds end-to-end', () => {
  const pixels = [];
  for (let i = 0; i < 12; i++) pixels.push(...CUSTOM_TEST_SKIN, 255);
  pixels.push(...CUSTOM_TEST_KHAKI, 255, ...CUSTOM_TEST_KHAKI, 255);
  const rgba = Buffer.from(pixels);

  const tightened = { hueMin: 5, hueMax: 50, satMin: 0.35, valMin: 0.12 };
  const { buffer, changed } = quantizeSkinTones(rgba, NORMALIZED_SKIN_PALETTE, 10, tightened);

  assert.equal(changed, 12); // only the 12 skin pixels matched; khaki excluded by satMin

  const khakiIdx = 12 * 4;
  assert.deepEqual(
    [buffer[khakiIdx], buffer[khakiIdx + 1], buffer[khakiIdx + 2], buffer[khakiIdx + 3]],
    [...CUSTOM_TEST_KHAKI, 255]
  );
});
