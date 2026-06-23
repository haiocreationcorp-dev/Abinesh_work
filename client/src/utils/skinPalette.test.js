import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySkinPalette, NORMALIZED_SKIN_PALETTE, SKIN_PRESETS } from './skinPalette.js';

function hexToBytes(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

test('applySkinPalette replaces only exact skin-palette pixels, leaves everything else untouched', () => {
  const [hr, hg, hb] = hexToBytes(NORMALIZED_SKIN_PALETTE.highlight);
  const [br, bg, bb] = hexToBytes(NORMALIZED_SKIN_PALETTE.base);
  const [sr, sg, sb] = hexToBytes(NORMALIZED_SKIN_PALETTE.shadow);
  const costume = [10, 20, 30]; // unrelated color — must stay byte-for-byte unchanged
  const transparentSkin = [hr, hg, hb]; // skin color but alpha 0 — must be skipped

  const data = new Uint8ClampedArray([
    hr, hg, hb, 255, // highlight
    br, bg, bb, 255, // base
    sr, sg, sb, 255, // shadow
    ...costume, 255, // unrelated
    ...transparentSkin, 0, // fully transparent
  ]);
  const imageData = { data, width: 5, height: 1 };

  const preset = SKIN_PRESETS.deepBrown;
  const result = applySkinPalette(imageData, NORMALIZED_SKIN_PALETTE, preset);
  const px = (i) => [result.data[i * 4], result.data[i * 4 + 1], result.data[i * 4 + 2], result.data[i * 4 + 3]];

  assert.deepEqual(px(0), [...hexToBytes(preset.highlight), 255]);
  assert.deepEqual(px(1), [...hexToBytes(preset.base), 255]);
  assert.deepEqual(px(2), [...hexToBytes(preset.shadow), 255]);
  assert.deepEqual(px(3), [...costume, 255]);
  assert.deepEqual(px(4), [...transparentSkin, 0]);

  // pure function: must not mutate the input buffer
  assert.equal(data[0], hr);
  assert.equal(data[1], hg);
  assert.equal(data[2], hb);
});

test('applySkinPalette is a no-op when old and new palettes match', () => {
  const [br, bg, bb] = hexToBytes(NORMALIZED_SKIN_PALETTE.base);
  const data = new Uint8ClampedArray([br, bg, bb, 255]);
  const result = applySkinPalette({ data, width: 1, height: 1 }, NORMALIZED_SKIN_PALETTE, NORMALIZED_SKIN_PALETTE);
  assert.deepEqual([result.data[0], result.data[1], result.data[2], result.data[3]], [br, bg, bb, 255]);
});
