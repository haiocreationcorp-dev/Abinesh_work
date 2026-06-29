// One-off migration: re-normalize every asset that already has a saved skin mask recipe
// (skinThresholds) so its base/shadow pixels become the new neon placeholder colors
// (#FF00FF / #00F0FF) instead of the old real skin-tone colors (#FFC8A0 / #D89A70) —
// matching the convention switch made in client/src/utils/skinPalette.js +
// client/src/utils/paletteNormalizer.js. Uses each asset's OWN already-saved detection
// thresholds + brush/eraser overrides, so no manual re-masking is needed — this just
// re-runs the exact same mask recipe with a different output palette.
//
// Run with --dry-run first to preview without touching any files or the database.
//
// Mirrors (does not import, since this runs in plain Node, not a browser/ESM context):
//   - rgbToHsv / isSkinHsv / resolveIsSkin / decodeOverrides / normalize from
//     client/src/utils/paletteNormalizer.js
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const OUTLINE_PROTECT_V_MAX = 12;
const NEON = {
  highlight: { r: 0x00, g: 0xf0, b: 0xff },
  base: { r: 0xff, g: 0x00, b: 0xff },
  shadow: { r: 0x00, g: 0xf0, b: 0xff },
};
const NEON_HEX = { highlight: '#00F0FF', base: '#FF00FF', shadow: '#00F0FF' };

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
  const v = max;
  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, v: v * 100 };
}

function isSkinHsv(h, s, v, t) {
  return h >= t.hMin && h <= t.hMax && s >= t.sMin && s <= t.sMax && v >= t.vMin && v <= t.vMax;
}

function resolveIsSkin(r, g, b, detection, overrides, p) {
  const override = overrides ? overrides[p] : 0;
  if (override === 1) return true;
  if (override === -1) return false;
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v <= OUTLINE_PROTECT_V_MAX) return false;
  return isSkinHsv(h, s, v, detection);
}

function decodeOverrides(runs, length) {
  const out = new Int8Array(length);
  if (!runs || runs.length === 0) return out;
  let total = 0;
  for (let i = 1; i < runs.length; i += 2) total += runs[i];
  if (total !== length) return out;
  let pos = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const value = runs[i], len = runs[i + 1];
    if (value !== 0) out.fill(value, pos, pos + len);
    pos += len;
  }
  return out;
}

// Same bucketing as the just-updated normalize() in paletteNormalizer.js: highlight folds
// into shadow (the brightness band, not just the recolor-time swap), so this never writes
// a third tone — only ever base or shadow (in their new neon colors).
function normalizeToNeon(data, width, height, detection, highCut, lowCut, overrides) {
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!resolveIsSkin(r, g, b, detection, overrides, i / 4)) continue;
    const { v } = rgbToHsv(r, g, b);
    const target = (v >= highCut || v < lowCut) ? NEON.shadow : NEON.base;
    data[i] = target.r; data[i + 1] = target.g; data[i + 2] = target.b;
    changed++;
  }
  return changed;
}

async function migrateAsset(asset) {
  const t = asset.skinThresholds;
  const oldAbsPath = path.join(__dirname, '..', asset.filePath.replace(/^\/+/, ''));
  const { data, info } = await sharp(oldAbsPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const overrides = decodeOverrides(t.overrides, info.width * info.height);
  const changed = normalizeToNeon(data, info.width, info.height, t.detection, t.highCut, t.lowCut, overrides);

  const dir = path.dirname(oldAbsPath);
  const ext = path.extname(oldAbsPath) || '.webp';
  const newFilename = `${crypto.randomUUID()}${ext}`;
  const newAbsPath = path.join(dir, newFilename);
  const newRelPath = path.posix.join(path.dirname(asset.filePath), newFilename);

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}${asset.category} ${asset.name} (${asset.id}): ${changed} px -> neon, ${asset.filePath} -> ${newRelPath}`);

  if (DRY_RUN) return;

  // Lossless is required: lossy WebP perturbs pixel values by a few bytes during
  // compression, which breaks the exact-match recolor swap (see normalizeSkinTones'
  // identical comment in server/src/routes/admin.js) — exactly the bug that produced the
  // speckled half-recolored result the first version of this script shipped.
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(newAbsPath);

  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      filePath: newRelPath,
      skinThresholds: { ...t, palette: NEON_HEX },
    },
  });

  try {
    fs.unlinkSync(oldAbsPath);
  } catch (err) {
    // sharp() holds the old file open for a moment after reading it on Windows — the new
    // file + DB update (the part that actually matters) already succeeded above, so this
    // is just a harmless leftover, not a migration failure. Safe to delete by hand later.
    console.warn(`  (could not remove old file yet, harmless: ${oldAbsPath} — ${err.code})`);
  }
}

async function main() {
  const assets = await prisma.asset.findMany({ where: { skinThresholds: { not: null } } });
  console.log(`${assets.length} asset(s) to migrate${DRY_RUN ? ' (dry run, no changes will be made)' : ''}.\n`);
  for (const asset of assets) {
    try {
      await migrateAsset(asset);
    } catch (err) {
      console.error(`FAILED ${asset.category} ${asset.name} (${asset.id}):`, err.message);
    }
  }
  await prisma.$disconnect();
}

main();
