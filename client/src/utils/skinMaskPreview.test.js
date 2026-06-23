import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSkinLike, previewSkinMask, DEFAULT_SKIN_THRESHOLDS } from './skinMaskPreview.js';

// HSV(30°, 0.50, 0.70) — a skin tone with moderate saturation.
const SKIN = [179, 134, 89];
// HSV(~29°, 0.25, 0.70) — same hue/brightness band as SKIN but lower saturation,
// simulating a khaki/tan costume color that overlaps skin's hue range.
const KHAKI = [179, 156, 134];

test('isSkinLike matches server thresholds: both pass under defaults, satMin separates them', () => {
  assert.equal(isSkinLike(...SKIN), true);
  assert.equal(isSkinLike(...KHAKI), true);

  const tightened = { ...DEFAULT_SKIN_THRESHOLDS, satMin: 0.35 };
  assert.equal(isSkinLike(...SKIN, tightened), true);
  assert.equal(isSkinLike(...KHAKI, tightened), false);
});

test('previewSkinMask tints only matched pixels and leaves everything else untouched', () => {
  const costume = [10, 20, 30];
  const data = new Uint8ClampedArray([
    ...SKIN, 255,
    ...KHAKI, 255,
    ...costume, 255,
    ...SKIN, 0, // fully transparent — must be skipped even though it matches
  ]);
  const imageData = { data, width: 4, height: 1 };

  const tightened = { ...DEFAULT_SKIN_THRESHOLDS, satMin: 0.35 };
  const result = previewSkinMask(imageData, tightened, [255, 0, 255], 1); // alpha=1 => fully replaced with tint, easy to assert
  const px = (i) => [result.data[i * 4], result.data[i * 4 + 1], result.data[i * 4 + 2], result.data[i * 4 + 3]];

  assert.deepEqual(px(0), [255, 0, 255, 255]); // skin -> tinted
  assert.deepEqual(px(1), [...KHAKI, 255]); // khaki excluded by tightened satMin -> untouched
  assert.deepEqual(px(2), [...costume, 255]); // unrelated costume -> untouched
  assert.deepEqual(px(3), [...SKIN, 0]); // transparent -> untouched

  // pure function: must not mutate the input buffer
  assert.equal(data[0], SKIN[0]);
  assert.equal(data[1], SKIN[1]);
  assert.equal(data[2], SKIN[2]);
});

test('previewSkinMask is a no-op (besides format) when no pixels match', () => {
  const data = new Uint8ClampedArray([10, 20, 30, 255]); // unrelated color
  const result = previewSkinMask({ data, width: 1, height: 1 });
  assert.deepEqual([result.data[0], result.data[1], result.data[2], result.data[3]], [10, 20, 30, 255]);
});
