// Recovery for migrateSkinMasksToNeon.js's first run, which used lossy webp output and
// produced a speckled half-recolored result (lossy compression perturbs the flat neon
// pixels by a few bytes, breaking the runtime exact-match swap). Re-reads each asset's
// ORIGINAL pre-migration file from the uploads backup taken right before that run, re-runs
// the same detection/overrides recipe with lossless webp output this time, and updates the
// asset to point at the corrected file. The broken lossy files from the first run are
// deleted once the corrected replacement is confirmed written.
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const BACKUP_ROOT = process.argv.find((a) => a.startsWith('--backup-root='))?.split('=')[1]
  || 'C:/Users/Athithiya.V.S/AppData/Local/Temp/uploads_restore';

const OUTLINE_PROTECT_V_MAX = 12;
const NEON = {
  highlight: { r: 0x00, g: 0xf0, b: 0xff },
  base: { r: 0xff, g: 0x00, b: 0xff },
  shadow: { r: 0x00, g: 0xf0, b: 0xff },
};
const NEON_HEX = { highlight: '#00F0FF', base: '#FF00FF', shadow: '#00F0FF' };

// Asset id -> its filePath as of right before the first (buggy) migration run, i.e. the
// path the original file lives at inside BACKUP_ROOT.
const ORIGINAL_PATHS = {
  cmqw7v28q001x3ogh47380z2f: '/uploads/face-parts/7e1a7032-fa4e-41b1-8458-d44399f3916f.webp',
  cmqw7v4b200203ogh3khngvtq: '/uploads/face-parts/fc7d6f48-3eea-4bdb-8d92-9b5855afe518.webp',
  cmqw7vsxr00223oghik2iv5ic: '/uploads/face-parts/ed1d4924-c141-4ea9-b165-0099ab199deb.webp',
  cmqw7vuxc00253oghn6873x7b: '/uploads/face-parts/7e0b66f1-a2ae-4ceb-b63a-48399596b132.webp',
  cmqw7v0bw001u3oghv5pkbyhg: '/uploads/face-parts/5565f058-1daa-4777-a1fe-5c4367ba4e4f.webp',
  cmqw7v0yt001v3oghi7s1f4s1: '/uploads/face-parts/1975812b-aa86-4da9-99a4-2deccf4818c7.webp',
  cmqw7v1la001w3oghs7jijkv3: '/uploads/face-parts/ef46a7fa-985a-4b89-96ff-f27e314a1afa.webp',
  cmqw7v2ws001y3oghh7rzzpb3: '/uploads/face-parts/2935b60b-7073-4765-82b4-7b252f153ba4.webp',
  cmqw7vsao00213oghuh1nr615: '/uploads/face-parts/54036903-26a3-4576-b4dd-06692c020d11.webp',
  cmqw7vtk000233ogheodd1gro: '/uploads/face-parts/10177706-92d0-4ba2-a604-7d48f8ec03db.webp',
  cmqw7vw9r00273ogh2z5sqadt: '/uploads/face-parts/4f44718e-a1a8-4343-8137-9750a89223d1.webp',
  cmqw7vu7a00243oghov6d1wlm: '/uploads/face-parts/20b7c726-1129-43d3-a1c3-7c18e4212b5e.webp',
  cmqw7vvmq00263ogh6hda5ige: '/uploads/face-parts/4deda284-e09d-4140-a1f6-105298606cfd.webp',
  cmqw8700b003g3oghp00ht961: '/uploads/body-poses/df677f26-5377-4bba-84b3-df3f8a599001.webp',
  cmqw82jc6003e3oghgzq37tqf: '/uploads/body-poses/c96403a0-de7c-43db-bfa9-dfc4144b4caa.webp',
  cmqw8i1sh003l3ogh0tsmdilo: '/uploads/body-poses/cdb09451-72d8-4557-8e32-a9add29d8949.webp',
  cmqw8hdd8003k3oghrrsl6xgz: '/uploads/body-poses/0be10e21-34ad-4470-88ac-5e15b59c4ed6.webp',
  cmqw8afgd003j3oghd61ctge4: '/uploads/body-poses/51b4a4b6-0971-46f3-b719-837ec4244848.webp',
  cmqw890xf003i3oghl2nsp5xa: '/uploads/body-poses/0f2328be-6f91-4b9c-817b-b5fb2378376c.webp',
  cmqw83ahg003f3oghw7pioq07: '/uploads/body-poses/a4733cbc-5c41-4eff-9d5a-864d2036d588.webp',
  cmqw7elsb0000cflrm4n7kf6v: '/uploads/body-poses/95cda8fc-369f-4c09-be89-490b6448011f.webp',
  cmqw8ivuw003m3oghzek9l4bt: '/uploads/body-poses/f55576ec-623c-47cd-84d4-6e108ca6ad3c.webp',
  cmqw7v3oh001z3oghoct4mf30: '/uploads/face-parts/bb512ec1-1e88-4817-af34-6e4092b6acde.webp',
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

async function redoAsset(asset) {
  const t = asset.skinThresholds;
  const originalRel = ORIGINAL_PATHS[asset.id];
  if (!originalRel) throw new Error('no recorded original path for this asset id');
  const originalAbsPath = path.join(BACKUP_ROOT, originalRel.replace(/^\/uploads\//, ''));
  if (!fs.existsSync(originalAbsPath)) throw new Error(`original not found at ${originalAbsPath}`);

  const { data, info } = await sharp(originalAbsPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const overrides = decodeOverrides(t.overrides, info.width * info.height);
  const changed = normalizeToNeon(data, t.detection, t.highCut, t.lowCut, overrides);

  const brokenAbsPath = path.join(__dirname, '..', asset.filePath.replace(/^\/+/, ''));
  const dir = path.dirname(brokenAbsPath);
  const ext = path.extname(brokenAbsPath) || '.webp';
  const newFilename = `${crypto.randomUUID()}${ext}`;
  const newAbsPath = path.join(dir, newFilename);
  const newRelPath = path.posix.join(path.dirname(asset.filePath), newFilename);

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}${asset.category} ${asset.name} (${asset.id}): ${changed} px -> neon (lossless), ${asset.filePath} -> ${newRelPath}`);

  if (DRY_RUN) return;

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(newAbsPath);

  await prisma.asset.update({
    where: { id: asset.id },
    data: { filePath: newRelPath, skinThresholds: { ...t, palette: NEON_HEX } },
  });

  try { fs.unlinkSync(brokenAbsPath); } catch (err) {
    console.warn(`  (could not remove broken lossy file yet, harmless: ${brokenAbsPath} — ${err.code})`);
  }
}

async function main() {
  const ids = Object.keys(ORIGINAL_PATHS);
  const assets = await prisma.asset.findMany({ where: { id: { in: ids } } });
  console.log(`${assets.length} asset(s) to redo${DRY_RUN ? ' (dry run)' : ''}, reading originals from ${BACKUP_ROOT}\n`);
  for (const asset of assets) {
    try {
      await redoAsset(asset);
    } catch (err) {
      console.error(`FAILED ${asset.category} ${asset.name} (${asset.id}):`, err.message);
    }
  }
  await prisma.$disconnect();
}

main();
