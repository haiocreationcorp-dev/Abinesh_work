/**
 * Character Render Service
 *
 * Composites structural character layers (body pose + face shape + nose for presets;
 * structural dress parts for dress-mode) into a single flat lossless WebP using Sharp,
 * with skin tone applied server-side via exact-palette-swap on the raw pixel buffer.
 *
 * Skin tone is applied here (not client-side) to avoid canvas CORS taint issues and the
 * extra async round-trip of recolorSkin. The resulting WebP is already skin-toned when
 * the browser receives it — no canvas manipulation needed on the client.
 *
 * Two render modes:
 *   renderPreset({ presetId, bodyPoseId, skinTone })  — CharacterPresetRig path
 *   renderDress({ layoutPath, overrides, skinTone })  — DressRig path
 *
 * Both return:
 *   { url, outputW, outputH, faceOverlay: { left, top, scale, canvasW, canvasH } }
 *
 * Results are cached by a hash of the input params in RENDERS_DIR.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const prisma = require('../config/prisma');
const { findInheritedHeadBox } = require('../utils/headBoxFallback');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const RENDERS_DIR = path.join(UPLOADS_ROOT, 'renders');
const MAX_W = 360;
const MAX_H = 600;
const FACE_CANVAS_W = 500;
const FACE_CANVAS_H = 600;
const DRESS_CANVAS_W = 400;
const DRESS_CANVAS_H = 600;
const SHARED_ALIGNMENT_KEY = '__ALL__';

// Parts rendered server-side for dress mode (structural IP)
const DRESS_SERVER_PARTS = new Set(['faceShape', 'nose', 'cloth', 'neck', 'hands']);
// Parts kept client-side in dress mode (expression overlays)
// 'hairstyle', 'eye', 'mouth' → client CPPart overlay

if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });

// ── Skin palette (mirrors client skinPalette.js exactly) ────────────────────
// Normalized placeholder colors every skin asset is pre-painted with.
const NORM_HIGHLIGHT = [0x00, 0xF0, 0xFF]; // #00F0FF
const NORM_BASE      = [0xFF, 0x00, 0xFF]; // #FF00FF
const NORM_SHADOW    = [0x00, 0xF0, 0xFF]; // same as highlight

const SKIN_PRESETS = {
  fair:      { highlight: '#FFE0C8', base: '#FFC8A0', shadow: '#D89A70' },
  light:     { highlight: '#FBD9B8', base: '#F2BD90', shadow: '#C9986A' },
  tan:       { highlight: '#F0C49E', base: '#D9A876', shadow: '#AD7A50' },
  brown:     { highlight: '#C68D63', base: '#A56A47', shadow: '#7A4A32' },
  darkBrown: { highlight: '#8D5A3C', base: '#6B3F28', shadow: '#4A2A1C' },
  deepBrown: { highlight: '#5A3825', base: '#3E2417', shadow: '#2A150D' },
};

function hexToRgbArr(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Applies an exact palette swap (with ±4 tolerance for color-space rounding) in-place.
// Exactly mirrors client/src/utils/skinPalette.js applySkinPalette():
//   NORM_HIGHLIGHT (#00F0FF) → preset.shadow   (same as oldShadow → newShadow)
//   NORM_BASE      (#FF00FF) → preset.base
// Note: old highlight and old shadow share the same #00F0FF byte value, so one branch
// covers both; both fold into newPalette.shadow — same as the client does.
function applySkinPaletteBuffer(buf, channels, preset) {
  const newShadow = hexToRgbArr(preset.shadow);
  const newBase   = hexToRgbArr(preset.base);

  let swapped = 0;
  for (let i = 0; i < buf.length; i += channels) {
    if (channels === 4 && buf[i + 3] === 0) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];

    // #00F0FF (cyan) — reference for both highlight + shadow → maps to shadow tone
    if (Math.abs(r - NORM_HIGHLIGHT[0]) <= 4 && Math.abs(g - NORM_HIGHLIGHT[1]) <= 4 && Math.abs(b - NORM_HIGHLIGHT[2]) <= 4) {
      buf[i] = newShadow[0]; buf[i + 1] = newShadow[1]; buf[i + 2] = newShadow[2];
      swapped++;
    }
    // #FF00FF (magenta) — reference for base → maps to base tone
    else if (Math.abs(r - NORM_BASE[0]) <= 4 && Math.abs(g - NORM_BASE[1]) <= 4 && Math.abs(b - NORM_BASE[2]) <= 4) {
      buf[i] = newBase[0]; buf[i + 1] = newBase[1]; buf[i + 2] = newBase[2];
      swapped++;
    }
  }
  return swapped;
}

// Applies the skin-tone palette swap to a Sharp-pipeline buffer, returns a new PNG Buffer.
// Forces an intermediate 8-bit sRGB pass to handle any 16-bit or indexed source PNGs.
async function recolorSkinBuffer(inputBuffer, skinTone) {
  if (!skinTone) return inputBuffer;
  const preset = SKIN_PRESETS[skinTone];
  if (!preset) {
    console.warn(`[skinRecolor] unknown skinTone key: "${skinTone}" — skipping`);
    return inputBuffer;
  }

  // Force 8-bit RGBA decode: Sharp preserves source bit depth in raw() by default,
  // so 16-bit PNGs would give wrong byte offsets. Routing through jpeg (lossy, loses
  // alpha) then back loses transparency — instead pipe through png with flatten forced
  // to 8-bit by asking Sharp to normalise channel depth.
  // The cleanest portable way: decode raw, clamp to 8-bit explicitly.
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // If source is 16-bit, each channel is 2 bytes. Detect by comparing expected vs actual buffer size.
  const expectedBytes8 = info.width * info.height * 4;
  if (data.length !== expectedBytes8) {
    // 16-bit source: re-read as 8-bit via a PNG round-trip with explicit bit-depth conversion
    console.log(`[skinRecolor] 16-bit PNG detected (${info.width}×${info.height} ${info.depth}-bit), converting to 8-bit`);
    const buf8 = await sharp(inputBuffer)
      .ensureAlpha()
      .toFormat('png', { bitdepth: 8 })
      .toBuffer();
    return recolorSkinBuffer(buf8, skinTone);
  }

  const swapped = applySkinPaletteBuffer(data, 4, preset);
  console.log(`[skinRecolor] tone="${skinTone}" size=${info.width}×${info.height} swapped=${swapped} pixels`);

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

function absPath(filePath) {
  return path.join(UPLOADS_ROOT, filePath.replace(/^\/uploads\//, ''));
}

function renderUrl(filename) {
  return `/uploads/renders/${filename}`;
}

function cacheKey(params) {
  return crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
}

function cachePath(key) {
  return path.join(RENDERS_DIR, `${key}.webp`);
}

async function resolveLayoutPaths(layout) {
  if (!Array.isArray(layout)) return layout;
  const ids = [...new Set(layout.map((p) => p.assetId).filter(Boolean))];
  if (ids.length === 0) return layout;
  const assets = await prisma.asset.findMany({ where: { id: { in: ids } } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  return layout.map((part) => {
    const asset = part.assetId && byId.get(part.assetId);
    return asset ? { ...part, filePath: asset.filePath } : part;
  });
}

// classifyFacePart mirrors client faceLayout.js — prefer partType enum, fall back to name.
const PART_TYPE_MAP = { FACE_SHAPE: 'faceShape', HAIR: 'hairstyle', EYES: 'eye', MOUTH: 'mouth', NOSE: 'nose' };
function classifyPart(part) {
  if (PART_TYPE_MAP[part.partType]) return PART_TYPE_MAP[part.partType];
  const n = (part.customName || part.name || '').toLowerCase();
  if (n.includes('hair')) return 'hairstyle';
  if (n.includes('nose')) return 'nose';
  if (n.includes('eye')) return 'eye';
  if (n.includes('mouth')) return 'mouth';
  if (n.includes('face')) return 'faceShape';
  return null;
}

// Classifies DressRig layout parts into dress-role keys, mirroring getDressKey in DressRig.jsx
function getDressRole(part) {
  if (part.dressRole) return part.dressRole;
  if (part.partCategory === 'hair') return 'hairstyle';
  const cls = classifyPart(part);
  if (['eye', 'nose', 'mouth', 'faceShape'].includes(cls)) return cls;
  const tags = part.tags || [];
  for (const t of ['cloth', 'neck', 'hands']) { if (tags.includes(t)) return t; }
  const n = (part.customName || part.name || '').toLowerCase();
  if (n.includes('neck')) return 'neck';
  if (n.includes('hand')) return 'hands';
  if (!part.partCategory || part.partCategory === 'clothing') return 'cloth';
  return null;
}

// Composite one image part onto the Sharp pipeline input at body-native pixel coordinates.
// skinTone is applied at NATIVE resolution before the resize — Lanczos interpolation during
// resize would blend the exact reference pixels (#00F0FF / #FF00FF) with adjacent non-skin
// pixels, producing intermediate values that the byte-exact swap can no longer match.
async function makeCompositeInput(part, targetLeft, targetTop, targetW, targetH, skinTone) {
  if (targetW < 1 || targetH < 1) return null;
  const diskPath = absPath(part.filePath);
  if (!fs.existsSync(diskPath)) return null;

  try {
    let s = sharp(diskPath);
    if (part.flipX) s = s.flop();
    if (part.flipY) s = s.flip();
    let buf = await s.toBuffer();
    if (skinTone) buf = await recolorSkinBuffer(buf, skinTone);
    buf = await sharp(buf).resize(targetW, targetH, { fit: 'fill', kernel: 'lanczos3' }).toBuffer();
    return { input: buf, left: targetLeft, top: targetTop, blend: 'over' };
  } catch { return null; }
}

// ─── Preset render (CharacterPresetRig path) ────────────────────────────────

async function renderPreset({ presetId, bodyPoseId, skinTone }) {
  console.log(`[renderPreset] presetId=${presetId} bodyPoseId=${bodyPoseId} skinTone=${JSON.stringify(skinTone)}`);
  const key = cacheKey({ mode: 'preset', presetId, bodyPoseId, skinTone });
  const file = cachePath(key);
  if (fs.existsSync(file)) {
    const { outputW, outputH, faceOverlay, faceId } = JSON.parse(
      fs.readFileSync(file + '.meta.json', 'utf8'),
    );
    return { url: renderUrl(`${key}.webp`), outputW, outputH, faceOverlay, faceId };
  }

  // 1. Load preset + body pose
  const [preset, bodyPose] = await Promise.all([
    prisma.characterPreset.findUnique({ where: { id: presetId } }),
    prisma.asset.findUnique({ where: { id: bodyPoseId } }),
  ]);
  if (!preset || !bodyPose) throw new Error('Preset or body pose not found');

  // 2. Choose face template based on pose view
  const faceId = (bodyPose.view === 'THREE_QUARTER' && preset.threeQuarterFaceId) ? preset.threeQuarterFaceId
    : (bodyPose.view === 'FRONT' && preset.frontFaceId) ? preset.frontFaceId
    : (preset.defaultFaceView === 'THREE_QUARTER' && preset.threeQuarterFaceId) ? preset.threeQuarterFaceId
    : (preset.defaultFaceView === 'FRONT' && preset.frontFaceId) ? preset.frontFaceId
    : (preset.frontFaceId || preset.threeQuarterFaceId);
  if (!faceId) throw new Error('No face template assigned to preset');

  const faceAsset = await prisma.asset.findUnique({ where: { id: faceId } });
  if (!faceAsset || !faceAsset.layoutPath) throw new Error('Face template has no layout');

  // 3. Load and resolve face layout
  const layoutDiskPath = absPath(faceAsset.layoutPath);
  const rawLayout = JSON.parse(fs.readFileSync(layoutDiskPath, 'utf8'));
  const layout = await resolveLayoutPaths(rawLayout);

  // Build face parts map
  let faceShape = null;
  const faceParts = {};
  for (const entry of layout) {
    const role = classifyPart(entry);
    if (!role) continue;
    const part = {
      assetId: entry.assetId, filePath: entry.filePath,
      x: entry.x, y: entry.y, w: entry.w, h: entry.h,
      rotation: entry.rotation || 0, flipX: !!entry.flipX, flipY: !!entry.flipY,
    };
    if (role === 'faceShape') faceShape = part;
    else faceParts[role] = part;
  }

  if (!faceShape) throw new Error('Face template has no face shape part');

  // 4. Get head box (body pose head placement)
  let headAlign = await prisma.facePartAlignment.findFirst({
    where: { faceAssetId: bodyPoseId, partType: 'head', partAssetId: SHARED_ALIGNMENT_KEY },
  });
  if (!headAlign) headAlign = await findInheritedHeadBox(bodyPoseId);
  if (!headAlign) throw new Error('No head box alignment for this body pose');

  // 5. Compute geometry (mirrors CharacterPresetRig faceGeom calculation)
  const fsBounds = {
    minX: faceShape.x, minY: faceShape.y,
    maxX: faceShape.x + faceShape.w, maxY: faceShape.y + faceShape.h,
  };
  const fsW = fsBounds.maxX - fsBounds.minX;
  const fsH = fsBounds.maxY - fsBounds.minY;
  const R = Math.min(headAlign.w / fsW, headAlign.h / fsH);
  const naturalOriginX = headAlign.x + (headAlign.w - fsW * R) / 2 - fsBounds.minX * R;
  const naturalOriginY = headAlign.y + (headAlign.h - fsH * R) / 2 - fsBounds.minY * R;

  // 6. Measure body image natural size
  const bodyDiskPath = absPath(bodyPose.filePath);
  const { width: bodyNatW, height: bodyNatH } = await sharp(bodyDiskPath).metadata();

  // Union bounds: body + head box (face content; hairstyle kept client-side)
  const unionMinX = Math.min(0, headAlign.x);
  const unionMinY = Math.min(0, headAlign.y);
  const unionMaxX = Math.max(bodyNatW, headAlign.x + headAlign.w);
  const unionMaxY = Math.max(bodyNatH, headAlign.y + headAlign.h);
  const drawScale = Math.min(MAX_W / (unionMaxX - unionMinX), MAX_H / (unionMaxY - unionMinY));
  const scaledBodyW = Math.round(bodyNatW * drawScale);
  const scaledBodyH = Math.round(bodyNatH * drawScale);
  const originLeft = Math.round((MAX_W - (unionMaxX - unionMinX) * drawScale) / 2 - unionMinX * drawScale);
  const originTop = Math.round((MAX_H - (unionMaxY - unionMinY) * drawScale) / 2 - unionMinY * drawScale);

  // 7. Build composite inputs: faceShape + nose, skin-recolored at native resolution.
  // Skin recolor happens inside makeCompositeInput BEFORE resize so the byte-exact swap
  // operates on untouched reference pixels rather than Lanczos-blended intermediates.
  const SERVER_FACE_ROLES = ['faceShape', 'nose'];
  const compositeInputs = [];
  for (const role of SERVER_FACE_ROLES) {
    const part = role === 'faceShape' ? faceShape : faceParts[role];
    if (!part) continue;
    const tW = Math.max(1, Math.round(part.w * R));
    const tH = Math.max(1, Math.round(part.h * R));
    const tLeft = Math.round(naturalOriginX + part.x * R);
    const tTop = Math.round(naturalOriginY + part.y * R);
    const ci = await makeCompositeInput(part, tLeft, tTop, tW, tH, skinTone);
    if (ci) compositeInputs.push(ci);
  }

  // 8. Recolor body at native resolution, then composite recolored face parts on top.
  let bodyBuf = await sharp(bodyDiskPath).toBuffer();
  if (skinTone) bodyBuf = await recolorSkinBuffer(bodyBuf, skinTone);

  let nativeBuffer = await sharp(bodyBuf)
    .composite(compositeInputs)
    .png()
    .toBuffer();

  // 9. Scale body to output size, embed in MAX_W x MAX_H transparent canvas.
  // Everything is already skin-toned — no post-composite recolor needed.
  const scaledBody = await sharp(nativeBuffer)
    .resize(scaledBodyW, scaledBodyH)
    .toBuffer();

  let compositeBuffer = await sharp({
    create: { width: MAX_W, height: MAX_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaledBody, left: originLeft, top: originTop }])
    .png()
    .toBuffer();

  const outputBuffer = await sharp(compositeBuffer).webp({ lossless: true }).toBuffer();
  fs.writeFileSync(file, outputBuffer);

  // Geometry for the client face overlay (hairstyle + eye + mouth CPParts)
  const faceOverlay = {
    left: Math.round(naturalOriginX * drawScale + originLeft),
    top: Math.round(naturalOriginY * drawScale + originTop),
    scale: R * drawScale,
    canvasW: FACE_CANVAS_W,
    canvasH: FACE_CANVAS_H,
  };

  const meta = { outputW: MAX_W, outputH: MAX_H, faceOverlay, faceId };
  fs.writeFileSync(file + '.meta.json', JSON.stringify(meta));

  return { url: renderUrl(`${key}.webp`), ...meta };
}

// ─── Dress render (DressRig path) ───────────────────────────────────────────

async function renderDress({ layoutPath, overrides = {}, skinTone }) {
  console.log(`[renderDress] layoutPath=${layoutPath} skinTone=${JSON.stringify(skinTone)}`);
  const key = cacheKey({ mode: 'dress', layoutPath, overrides, skinTone });
  const file = cachePath(key);
  if (fs.existsSync(file)) {
    const { outputW, outputH, faceOverlay } = JSON.parse(
      fs.readFileSync(file + '.meta.json', 'utf8'),
    );
    return { url: renderUrl(`${key}.webp`), outputW, outputH, faceOverlay };
  }

  const layoutDiskPath = absPath(layoutPath);
  if (!fs.existsSync(layoutDiskPath)) throw new Error('Layout not found');
  const rawLayout = JSON.parse(fs.readFileSync(layoutDiskPath, 'utf8'));
  const layout = await resolveLayoutPaths(rawLayout);

  // Apply part overrides (cloth / neck / hands swap)
  const activeParts = layout.map((part) => {
    const role = getDressRole(part);
    const ov = role && overrides[role];
    return ov ? { ...part, filePath: ov.filePath, assetId: ov.assetId } : part;
  }).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // Filter to server-rendered structural parts only
  const structuralParts = activeParts.filter((p) => DRESS_SERVER_PARTS.has(getDressRole(p)));

  const drawScale = Math.min(MAX_W / DRESS_CANVAS_W, MAX_H / DRESS_CANVAS_H);
  const canvasW = Math.round(DRESS_CANVAS_W * drawScale);
  const canvasH = Math.round(DRESS_CANVAS_H * drawScale);

  // Build composites for the dress canvas; skin recolor applied at native resolution
  // inside makeCompositeInput before each part is scaled to its target size.
  const compositeInputs = [];
  for (const part of structuralParts) {
    if (!part.filePath) continue;
    const tLeft = Math.round(part.x * drawScale);
    const tTop = Math.round(part.y * drawScale);
    const tW = Math.max(1, Math.round(part.w * drawScale));
    const tH = Math.max(1, Math.round(part.h * drawScale));
    const ci = await makeCompositeInput(part, tLeft, tTop, tW, tH, skinTone);
    if (ci) compositeInputs.push(ci);
  }

  const originLeft = Math.round((MAX_W - canvasW) / 2);
  const originTop = Math.round((MAX_H - canvasH) / 2);

  // Create a transparent DRESS canvas, then embed in MAX_W x MAX_H output.
  // Parts already skin-toned — no post-composite recolor needed.
  const dressBuffer = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();

  let compositeBuffer = await sharp({
    create: { width: MAX_W, height: MAX_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: dressBuffer, left: originLeft, top: originTop }])
    .png()
    .toBuffer();

  const outputBuffer = await sharp(compositeBuffer).webp({ lossless: true }).toBuffer();
  fs.writeFileSync(file, outputBuffer);

  const faceOverlay = {
    left: originLeft,
    top: originTop,
    scale: drawScale,
    canvasW: DRESS_CANVAS_W,
    canvasH: DRESS_CANVAS_H,
  };

  const meta = { outputW: MAX_W, outputH: MAX_H, faceOverlay };
  fs.writeFileSync(file + '.meta.json', JSON.stringify(meta));

  return { url: renderUrl(`${key}.webp`), ...meta };
}

// Wipe cached renders that belong to a specific asset (call after asset file replacement).
function invalidateAssetCache(assetId) {
  try {
    const files = fs.readdirSync(RENDERS_DIR);
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      const metaPath = path.join(RENDERS_DIR, f);
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (JSON.stringify(meta).includes(assetId)) {
          fs.unlinkSync(metaPath);
          fs.unlinkSync(metaPath.replace('.meta.json', ''));
        }
      } catch { /* skip */ }
    }
  } catch { /* non-fatal */ }
}

module.exports = { renderPreset, renderDress, invalidateAssetCache };
