// One-off: shrink existing BODY_POSE assets down to the new, smaller resolution cap (see
// maybeToWebP's BODY_POSE case in admin.js) and re-run their saved mask recipe at that new
// size, writing lossless neon output. Unlike the earlier neon migration, this can't just
// resize the already-masked file — most of these have real manual brush/eraser overrides
// (a pixel-position-indexed map), so resizing the override grid has to happen in lockstep
// with the image resize (nearest-neighbor, to keep the discrete -1/0/1 values intact —
// any blending interpolation would corrupt them), using each asset's ORIGINAL pre-mask
// file (read from the uploads backup) so detection runs on properly-antialiased art at
// the new size, not on a resize of already-flat masked colors.
//
// Run with --dry-run first to preview sizes without touching any files or the database.
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_ROOT = process.argv.find((a) => a.startsWith('--backup-root='))?.split('=')[1]
  || 'C:/Users/Athithiya.V.S/AppData/Local/Temp/uploads_restore2';
const MAX_DIM = 800;

const OUTLINE_PROTECT_V_MAX = 12;
const NEON = { base: { r: 0xff, g: 0x00, b: 0xff }, shadow: { r: 0x00, g: 0xf0, b: 0xff } };
const NEON_HEX = { highlight: '#00F0FF', base: '#FF00FF', shadow: '#00F0FF' };

// Original pre-mask file path (as of right before the earlier neon migration) for each
// BODY_POSE asset, inside BACKUP_ROOT.
const ORIGINAL_PATHS = {
  cmqw8700b003g3oghp00ht961: '/uploads/body-poses/df677f26-5377-4bba-84b3-df3f8a599001.webp',
  cmqw82jc6003e3oghgzq37tqf: '/uploads/body-poses/c96403a0-de7c-43db-bfa9-dfc4144b4caa.webp',
  cmqw8i1sh003l3ogh0tsmdilo: '/uploads/body-poses/cdb09451-72d8-4557-8e32-a9add29d8949.webp',
  cmqw8hdd8003k3oghrrsl6xgz: '/uploads/body-poses/0be10e21-34ad-4470-88ac-5e15b59c4ed6.webp',
  cmqw8afgd003j3oghd61ctge4: '/uploads/body-poses/51b4a4b6-0971-46f3-b719-837ec4244848.webp',
  cmqw890xf003i3oghl2nsp5xa: '/uploads/body-poses/0f2328be-6f91-4b9c-817b-b5fb2378376c.webp',
  cmqw83ahg003f3oghw7pioq07: '/uploads/body-poses/a4733cbc-5c41-4eff-9d5a-864d2036d588.webp',
  cmqw7elsb0000cflrm4n7kf6v: '/uploads/body-poses/95cda8fc-369f-4c09-be89-490b6448011f.webp',
  cmqw8ivuw003m3oghzek9l4bt: '/uploads/body-poses/f55576ec-623c-47cd-84d4-6e108ca6ad3c.webp',
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

function encodeOverrides(overrides) {
  if (!overrides || overrides.length === 0) return [];
  const runs = [];
  let cur = overrides[0];
  let len = 1;
  for (let i = 1; i < overrides.length; i++) {
    if (overrides[i] === cur) { len++; }
    else { runs.push(cur, len); cur = overrides[i]; len = 1; }
  }
  runs.push(cur, len);
  return runs;
}

// Resizes a categorical -1/0/1 override grid to new dimensions using nearest-neighbor —
// any smooth interpolation would blend the discrete values into meaningless in-betweens.
async function resizeOverrides(overrides, oldW, oldH, newW, newH) {
  const byteBuf = Buffer.alloc(oldW * oldH);
  for (let i = 0; i < overrides.length; i++) byteBuf[i] = overrides[i] + 1; // -1,0,1 -> 0,1,2
  const resized = await sharp(byteBuf, { raw: { width: oldW, height: oldH, channels: 1 } })
    .resize(newW, newH, { fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer();
  const out = new Int8Array(newW * newH);
  for (let i = 0; i < resized.length; i++) out[i] = resized[i] - 1; // back to -1,0,1
  return out;
}

function normalizeToNeon(data, detection, highCut, lowCut, overrides) {
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

async function shrinkAsset(asset) {
  const t = asset.skinThresholds;
  const originalRel = ORIGINAL_PATHS[asset.id];
  if (!originalRel) throw new Error('no recorded original path for this asset id');
  const originalAbsPath = path.join(BACKUP_ROOT, originalRel.replace(/^\/uploads\//, ''));
  if (!fs.existsSync(originalAbsPath)) throw new Error(`original not found at ${originalAbsPath}`);

  const origMeta = await sharp(originalAbsPath).metadata();
  const oldW = origMeta.width, oldH = origMeta.height;

  // Resize the actual image (smooth resize — fine here since we're starting from the
  // naturally-shaded original, not flat masked colors).
  const resizedImg = await sharp(originalAbsPath).resize(MAX_DIM, MAX_DIM, { fit: 'inside' }).toBuffer();
  const { data, info } = await sharp(resizedImg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const newW = info.width, newH = info.height;

  // Resize the override mask to the exact same new dimensions, in lockstep.
  const oldOverrides = decodeOverrides(t.overrides, oldW * oldH);
  const newOverrides = await resizeOverrides(oldOverrides, oldW, oldH, newW, newH);

  const changed = normalizeToNeon(data, t.detection, t.highCut, t.lowCut, newOverrides);

  const oldAbsPath = path.join(__dirname, '..', asset.filePath.replace(/^\/+/, ''));
  const dir = path.dirname(oldAbsPath);
  const ext = path.extname(oldAbsPath) || '.webp';
  const newFilename = `${crypto.randomUUID()}${ext}`;
  const newAbsPath = path.join(dir, newFilename);
  const newRelPath = path.posix.join(path.dirname(asset.filePath), newFilename);

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}${asset.name}: ${oldW}x${oldH} -> ${newW}x${newH}, ${changed} px masked, ${asset.filePath} -> ${newRelPath}`);

  if (DRY_RUN) return;

  await sharp(data, { raw: { width: newW, height: newH, channels: 4 } })
    .webp({ lossless: true })
    .toFile(newAbsPath);

  const sizeBefore = fs.statSync(oldAbsPath).size;
  const sizeAfter = fs.statSync(newAbsPath).size;
  console.log(`  size: ${(sizeBefore / 1024).toFixed(1)} KB -> ${(sizeAfter / 1024).toFixed(1)} KB`);

  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      filePath: newRelPath,
      skinThresholds: { ...t, overrides: encodeOverrides(newOverrides), palette: NEON_HEX },
    },
  });

  try { fs.unlinkSync(oldAbsPath); } catch (err) {
    console.warn(`  (could not remove old file yet, harmless: ${oldAbsPath} — ${err.code})`);
  }
}

async function main() {
  const ids = Object.keys(ORIGINAL_PATHS);
  const assets = await prisma.asset.findMany({ where: { id: { in: ids } } });
  console.log(`${assets.length} body pose(s) to shrink${DRY_RUN ? ' (dry run)' : ''}, reading originals from ${BACKUP_ROOT}\n`);
  for (const asset of assets) {
    try {
      await shrinkAsset(asset);
    } catch (err) {
      console.error(`FAILED ${asset.name} (${asset.id}):`, err.message);
    }
  }
  await prisma.$disconnect();
}

main();
