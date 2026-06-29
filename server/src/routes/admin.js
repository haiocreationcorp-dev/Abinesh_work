const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const adminAuth = require('../middleware/adminAuth');
const prisma = require('../config/prisma');
const { addMonths } = require('../utils/dates');
const { quantizeSkinTones, DEFAULT_SKIN_THRESHOLDS } = require('../utils/skinNormalize');

// Parses the optional `skinThresholds` form field (JSON string from the admin's
// mask-tuning UI). Falls back to the hardcoded defaults on missing/invalid input.
function parseSkinThresholds(raw) {
  if (!raw) return DEFAULT_SKIN_THRESHOLDS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SKIN_THRESHOLDS, ...parsed };
  } catch (_) {
    return DEFAULT_SKIN_THRESHOLDS;
  }
}

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const CATEGORY_TO_DIR = {
  FACE_PART: 'face-parts',
  FACE_TEMPLATE: 'face-templates',
  BODY_POSE: 'body-poses',
  BACKGROUND: 'backgrounds',
  PROP: 'props',
  EFFECT: 'effects',
  BUBBLE: 'bubbles',
  SOUND: 'sounds',
};

const ALLOWED_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.m4a'];

// Remove white/near-white background via BFS flood-fill from all 4 image edges.
// Only edge-connected near-white regions are erased — white inside the character is preserved.
async function removeWhiteBackground(buffer, originalExt) {
  if (originalExt === '.svg') return { buffer, ext: originalExt };

  const TOLERANCE = 30; // pixels with R,G,B all > (255-30)=225 are treated as "near-white"

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = Buffer.from(data);
  const flat = (x, y) => y * width + x;
  const isNearWhite = (i) =>
    pixels[i] > 255 - TOLERANCE &&
    pixels[i + 1] > 255 - TOLERANCE &&
    pixels[i + 2] > 255 - TOLERANCE;

  // BFS queue (stored as interleaved x,y pairs for speed)
  const visited = new Uint8Array(width * height);
  const queue = [];

  const enqueue = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const f = flat(x, y);
    if (visited[f]) return;
    if (!isNearWhite(f * 4)) return;
    visited[f] = 1;
    queue.push(x, y);
  };

  // Seed from all 4 edges
  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }

  let head = 0;
  while (head < queue.length) {
    const x = queue[head++], y = queue[head++];
    pixels[flat(x, y) * 4 + 3] = 0; // set alpha=0
    enqueue(x + 1, y); enqueue(x - 1, y);
    enqueue(x, y + 1); enqueue(x, y - 1);
  }

  const result = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 82 })
    .toBuffer();

  return { buffer: result, ext: '.webp' };
}

// Quantize skin-toned pixels down to the 3 flat reference tones the Comic UI's
// exact-match skin color swap expects. One-time preprocessing — see skinNormalize.js.
async function normalizeSkinTones(buffer, originalExt, thresholds = DEFAULT_SKIN_THRESHOLDS) {
  if (originalExt === '.svg') return { buffer, ext: originalExt };

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const { buffer: quantized } = quantizeSkinTones(data, undefined, undefined, thresholds, { width, height });

  // Lossless encode is required here: lossy WebP (even at quality 82) perturbs pixel
  // values by a few bytes during compression, which breaks the runtime exact-match
  // skin color swap — it relies on stored pixels matching the reference palette byte-for-byte.
  const result = await sharp(quantized, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();

  return { buffer: result, ext: '.webp' };
}

// Re-encodes an already-exact image (e.g. a PNG exported from a browser canvas — the
// only lossless format Canvas.toBlob() supports) as lossless WebP. Browsers have no
// lossless WebP export option, but sharp does, and round-tripping through it preserves
// pixel values byte-for-byte while storing at WebP's much smaller size than PNG.
async function reencodeLosslessWebp(buffer) {
  const converted = await sharp(buffer).webp({ lossless: true }).toBuffer();
  return { buffer: converted, ext: '.webp' };
}

// Confirmed via manual A/B testing (pixel-diff against the original, q80 vs lossless) that
// lossy WebP holds up well for this art style — difference concentrates in outline/edge
// softening, flat fills stay near-identical. 130KB is the agreed per-asset ceiling.
const MAX_ASSET_BYTES = 130 * 1024;

// Re-encodes at decreasing quality (and, if quality alone can't get there, decreasing
// resolution) until the result fits under maxBytes — or gives up after a bounded number of
// attempts and returns the smallest version found. Avoids a single fixed quality either
// overshooting the budget on busy/detailed art or under-compressing simple flat art.
async function compressToBudget(buffer, resizeOpts, maxBytes = MAX_ASSET_BYTES) {
  let quality = 82;
  let scale = 1;
  let best = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const w = resizeOpts.width ? Math.round(resizeOpts.width * scale) : null;
    const h = resizeOpts.height ? Math.round(resizeOpts.height * scale) : null;
    const out = await sharp(buffer)
      .resize(w, h, { fit: resizeOpts.fit, withoutEnlargement: resizeOpts.withoutEnlargement })
      .webp({ quality })
      .toBuffer();

    if (!best || out.length < best.length) best = out;
    if (out.length <= maxBytes) return out;

    if (quality > 40) quality -= 8;
    else { scale *= 0.85; quality = 60; } // quality floor reached — shrink dimensions instead, with quality bumped back up a bit
  }
  return best; // couldn't hit budget — return the smallest version found rather than the oversized first pass
}

// Convert raster images to WebP for BACKGROUND, FACE_PART, FACE_TEMPLATE, and BODY_POSE
// uploads, capped at MAX_ASSET_BYTES. BACKGROUND: resize to 1200×675. The others: capped
// to 1200px on the long edge (source art is often far bigger than it's ever displayed —
// 120×200 in the comic, 500×600 in the builder canvas — but 1200px keeps headroom for
// scaling up large in a panel without visible blur). This resize runs before skin-tone
// normalization, so the exact reference colors are computed fresh on the already-
// downscaled image and stay byte-exact.
async function maybeToWebP(buffer, originalName, category) {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return { buffer, ext };
  if (category === 'BACKGROUND') {
    const converted = await compressToBudget(buffer, { width: 1200, height: 675, fit: 'inside', withoutEnlargement: true });
    return { buffer: converted, ext: '.webp' };
  }
  if (['FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE'].includes(category)) {
    const converted = await compressToBudget(buffer, { width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true });
    return { buffer: converted, ext: '.webp' };
  }
  return { buffer, ext };
}

// Use memory storage so we can route to the correct directory after reading req.body
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not allowed. Use SVG or common image formats.`));
  },
});

// Batch upload — tracks skipped files in req.skippedFiles instead of silently dropping them
const uploadBatch = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1000 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      if (!req.skippedFiles) req.skippedFiles = [];
      req.skippedFiles.push({ file: file.originalname, reason: `Unsupported format: ${ext || '(no extension)'}` });
      cb(null, false);
    }
  },
});

// POST /api/admin/assets/upload
router.post(
  '/assets/upload',
  adminAuth,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { name, category, tags, removeWhiteBg, normalizeSkin, skinThresholds, skipProcessing,
        partType, view, gender, faceFamily, costume, poseType } = req.body;
      if (!name || !category || !req.files?.file) {
        return res.status(400).json({ error: 'name, category, and file are required' });
      }
      const resolvedSkinThresholds = normalizeSkin === 'true' ? parseSkinThresholds(skinThresholds) : null;

      const categoryUpper = category.toUpperCase();
      if (!CATEGORY_TO_DIR[categoryUpper]) {
        return res.status(400).json({ error: `Invalid category: ${category}` });
      }

      const writeFile = (buffer, ext, subdir) => {
        const filename = `${uuidv4()}${ext}`;
        const dir = path.join(UPLOADS_ROOT, subdir);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, filename), buffer);
        return `/uploads/${subdir}/${filename}`;
      };

      const assetFile = req.files.file[0];
      let assetBuf, assetExt;
      if (skipProcessing === 'true') {
        // Caller (e.g. Palette Normalizer) already produced an exact, final image —
        // skip the LOSSY webp conversion, but still re-encode as LOSSLESS webp so it
        // doesn't sit on disk as an oversized PNG.
        ({ buffer: assetBuf, ext: assetExt } = await reencodeLosslessWebp(assetFile.buffer));
      } else {
        ({ buffer: assetBuf, ext: assetExt } = await maybeToWebP(assetFile.buffer, assetFile.originalname, categoryUpper));
        if (removeWhiteBg === 'true') {
          ({ buffer: assetBuf, ext: assetExt } = await removeWhiteBackground(assetBuf, assetExt));
        }
        if (normalizeSkin === 'true') {
          ({ buffer: assetBuf, ext: assetExt } = await normalizeSkinTones(assetBuf, assetExt, resolvedSkinThresholds));
        }
      }
      const filePath = writeFile(assetBuf, assetExt, CATEGORY_TO_DIR[categoryUpper]);

      let thumbnailPath = null;
      if (req.files?.thumbnail?.[0]) {
        const thumb = req.files.thumbnail[0];
        thumbnailPath = writeFile(thumb.buffer, path.extname(thumb.originalname).toLowerCase(), 'thumbnails');
      }

      const tagArray = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

      const asset = await prisma.asset.create({
        data: {
          name,
          category: categoryUpper,
          tags: tagArray,
          filename: assetFile.originalname,
          filePath,
          thumbnailPath,
          skinThresholds: resolvedSkinThresholds ?? undefined,
          partType: partType || undefined,
          view: view || undefined,
          gender: gender || undefined,
          faceFamily: faceFamily || undefined,
          costume: costume || undefined,
          poseType: poseType || undefined,
        },
      });

      res.status(201).json(asset);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Upload failed' });
    }
  }
);

// POST /api/admin/assets/upload-folder — folder-sync upload (upsert per asset name+category)
router.post('/assets/upload-folder', adminAuth, uploadBatch.array('files', 500), async (req, res) => {
  try {
    const { category, tags, folderName, removeWhiteBg, normalizeSkin, skinThresholds } = req.body;
    const categoryUpper = (category || '').toUpperCase();
    const tagArray = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const stripBg = removeWhiteBg === 'true';
    const normalizeSkinTone = normalizeSkin === 'true';
    const resolvedSkinThresholds = normalizeSkinTone ? parseSkinThresholds(skinThresholds) : null;
    const folderPretty = folderName ? folderName.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() : '';
    if (!CATEGORY_TO_DIR[categoryUpper]) {
      return res.status(400).json({ error: `Invalid category: ${category}` });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No valid files found in folder' });
    }

    const dir = path.join(UPLOADS_ROOT, CATEGORY_TO_DIR[categoryUpper]);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const prettify = (str) => {
      const base = str.replace(/\.[^.]+$/, '');
      return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const deleteOldFile = (filePath) => {
      try {
        const rel = filePath.replace(/^\/uploads\//, '');
        const abs = path.join(UPLOADS_ROOT, rel);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (_) { /* best-effort */ }
    };

    let added = 0;
    let updated = 0;
    const errors = [];

    for (const file of req.files) {
      try {
        const baseName = prettify(file.originalname);
        const assetName = (categoryUpper === 'BODY_POSE' && folderPretty)
          ? `${folderPretty} ${baseName}`
          : baseName;
        const assetTags = (categoryUpper === 'BODY_POSE' && folderPretty)
          ? [...tagArray, folderPretty.toLowerCase()]
          : tagArray;
        let { buffer: fileBuf, ext } = await maybeToWebP(file.buffer, file.originalname, categoryUpper);
        if (stripBg) ({ buffer: fileBuf, ext } = await removeWhiteBackground(fileBuf, ext));
        if (normalizeSkinTone) ({ buffer: fileBuf, ext } = await normalizeSkinTones(fileBuf, ext, resolvedSkinThresholds));
        const newFilename = `${uuidv4()}${ext}`;
        const newFilePath = `/uploads/${CATEGORY_TO_DIR[categoryUpper]}/${newFilename}`;

        const existing = await prisma.asset.findFirst({
          where: { name: assetName, category: categoryUpper },
        });

        if (existing) {
          deleteOldFile(existing.filePath);
          fs.writeFileSync(path.join(dir, newFilename), fileBuf);
          await prisma.asset.update({
            where: { id: existing.id },
            data: {
              filePath: newFilePath,
              filename: file.originalname,
              skinThresholds: resolvedSkinThresholds ?? undefined,
            },
          });
          updated++;
        } else {
          fs.writeFileSync(path.join(dir, newFilename), fileBuf);
          await prisma.asset.create({
            data: {
              name: assetName,
              category: categoryUpper,
              tags: assetTags,
              filename: file.originalname,
              filePath: newFilePath,
              thumbnailPath: null,
              skinThresholds: resolvedSkinThresholds ?? undefined,
            },
          });
          added++;
        }
      } catch (err) {
        errors.push({ file: file.originalname, error: err.message });
      }
    }

    const skipped = req.skippedFiles || [];
    res.status(201).json({ added, updated, errors, skipped, total: req.files.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Folder upload failed' });
  }
});

// POST /api/admin/faces/assemble — saves assembled SVG (+ layout) as a FACE asset
router.post('/faces/assemble', adminAuth, async (req, res) => {
  try {
    const { name, svgContent, layout, faceFamily, view } = req.body;
    if (!name || !svgContent) return res.status(400).json({ error: 'name and svgContent required' });

    const id = uuidv4();
    const dir = path.join(UPLOADS_ROOT, 'face-templates');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `${id}.svg`;
    fs.writeFileSync(path.join(dir, filename), svgContent, 'utf8');

    let layoutPath = null;
    if (layout) {
      const layoutFilename = `${id}.json`;
      fs.writeFileSync(path.join(dir, layoutFilename), JSON.stringify(layout), 'utf8');
      layoutPath = `/uploads/face-templates/${layoutFilename}`;
    }

    const asset = await prisma.asset.create({
      data: {
        name,
        category: 'FACE_TEMPLATE',
        tags: ['assembled', 'face-builder'],
        filename,
        filePath: `/uploads/face-templates/${filename}`,
        thumbnailPath: null,
        layoutPath,
        faceFamily: faceFamily || undefined,
        view: view || undefined,
      },
    });
    res.status(201).json(asset);
  } catch (err) {
    console.error('faces/assemble error:', err);
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// PUT /api/admin/faces/assemble/:id — overwrites an existing FACE_TEMPLATE asset's SVG/layout in place
router.put('/faces/assemble/:id', adminAuth, async (req, res) => {
  try {
    const { name, svgContent, layout, faceFamily, view } = req.body;
    if (!svgContent) return res.status(400).json({ error: 'svgContent required' });

    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.category !== 'FACE_TEMPLATE') return res.status(404).json({ error: 'Face template not found' });

    const dir = path.join(UPLOADS_ROOT, 'face-templates');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filename = existing.filename.endsWith('.svg') ? existing.filename : `${existing.id}.svg`;
    fs.writeFileSync(path.join(dir, filename), svgContent, 'utf8');

    let layoutPath = existing.layoutPath;
    if (layout) {
      const layoutFilename = `${existing.id}.json`;
      fs.writeFileSync(path.join(dir, layoutFilename), JSON.stringify(layout), 'utf8');
      layoutPath = `/uploads/face-templates/${layoutFilename}`;
    }

    const asset = await prisma.asset.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name } : {}),
        filename,
        filePath: `/uploads/face-templates/${filename}`,
        layoutPath,
        ...(faceFamily ? { faceFamily } : {}),
        ...(view ? { view } : {}),
      },
    });
    res.json(asset);
  } catch (err) {
    console.error('faces/assemble update error:', err);
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// Expression and CharacterPreset are dedicated models (not Asset rows) — they hold only
// references to other assets, never an uploaded file of their own.

// Reads are public (GET /api/expressions, /api/character-presets in routes/assets.js) —
// the Comic Editor needs to browse these too. Only create/delete stay admin-only here.

// POST /api/admin/expressions
router.post('/expressions', adminAuth, async (req, res) => {
  try {
    const { name, eyeAssetId, mouthAssetId } = req.body;
    if (!name || !eyeAssetId || !mouthAssetId) {
      return res.status(400).json({ error: 'name, eyeAssetId, and mouthAssetId are required' });
    }
    const expression = await prisma.expression.create({ data: { name, eyeAssetId, mouthAssetId } });
    res.status(201).json(expression);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// DELETE /api/admin/expressions/:id
router.delete('/expressions/:id', adminAuth, async (req, res) => {
  try {
    await prisma.expression.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// POST /api/admin/character-presets
router.post('/character-presets', adminAuth, async (req, res) => {
  try {
    const { name, frontFaceId, threeQuarterFaceId, skinTone, hairColor, irisColor, defaultExpressionId } = req.body;
    if (!name || !frontFaceId || !skinTone || !hairColor) {
      return res.status(400).json({ error: 'name, frontFaceId, skinTone, and hairColor are required' });
    }
    const preset = await prisma.characterPreset.create({
      data: { name, frontFaceId, threeQuarterFaceId: threeQuarterFaceId || null, skinTone, hairColor, irisColor: irisColor || null, defaultExpressionId: defaultExpressionId || null },
    });
    res.status(201).json(preset);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// DELETE /api/admin/character-presets/:id
router.delete('/character-presets/:id', adminAuth, async (req, res) => {
  try {
    await prisma.characterPreset.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// GET /api/admin/face-part-alignment?faceAssetId=&partAssetId=&partType= — fetch a saved alignment, if any
router.get('/face-part-alignment', adminAuth, async (req, res) => {
  const { faceAssetId, partAssetId, partType } = req.query;
  if (!faceAssetId || !partAssetId || !partType) return res.status(400).json({ error: 'faceAssetId, partAssetId and partType required' });
  const alignment = await prisma.facePartAlignment.findUnique({
    where: { faceAssetId_partAssetId_partType: { faceAssetId, partAssetId, partType } },
  });
  res.json(alignment);
});

// POST /api/admin/face-part-alignment — save/update the alignment for a face+part pair
router.post('/face-part-alignment', adminAuth, async (req, res) => {
  try {
    const { faceAssetId, partAssetId, partType, x, y, w, h, rotation, flipX, flipY, connectX, connectY } = req.body;
    if (!faceAssetId || !partAssetId || !partType) return res.status(400).json({ error: 'faceAssetId, partAssetId and partType required' });
    const data = { x, y, w, h, rotation: rotation || 0, flipX: !!flipX, flipY: !!flipY, connectX: connectX ?? 0.5, connectY: connectY ?? 0.0 };
    const alignment = await prisma.facePartAlignment.upsert({
      where: { faceAssetId_partAssetId_partType: { faceAssetId, partAssetId, partType } },
      create: { faceAssetId, partAssetId, partType, ...data },
      update: data,
    });
    res.status(201).json(alignment);
  } catch (err) {
    console.error('face-part-alignment save error:', err);
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// GET /api/admin/stats — counts + trends + 6-month growth history for the admin Dashboard section
router.get('/stats', adminAuth, async (_req, res) => {
  const now = new Date();
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const notAdmin = { role: { not: 'ADMIN' } };

  const pctTrend = (thisMonth, lastMonth) => {
    if (lastMonth === 0) return thisMonth > 0 ? { pct: null, isNew: true } : { pct: 0, isNew: false };
    return { pct: Math.round(((thisMonth - lastMonth) / lastMonth) * 100), isNew: false };
  };

  const userTrend = async (where) => {
    const [thisMonth, lastMonth] = await Promise.all([
      prisma.user.count({ where: { ...where, createdAt: { gte: thisMonthStart } } }),
      prisma.user.count({ where: { ...where, createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    ]);
    return pctTrend(thisMonth, lastMonth);
  };

  const comicsTrend = async () => {
    const [thisMonth, lastMonth] = await Promise.all([
      prisma.comic.count({ where: { createdAt: { gte: thisMonthStart } } }),
      prisma.comic.count({ where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    ]);
    return pctTrend(thisMonth, lastMonth);
  };

  const institutionsTrend = async () => {
    const [thisMonth, lastMonth] = await Promise.all([
      prisma.institution.count({ where: { createdAt: { gte: thisMonthStart } } }),
      prisma.institution.count({ where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    ]);
    return pctTrend(thisMonth, lastMonth);
  };

  const [
    institutionUsers, individualUsers, totalComics, totalInstitutions, students, teachers, chiefs, admins,
    institutionTrend, individualTrend, totalComicsTrend, totalInstitutionsTrend, studentsTrend, teachersTrend,
  ] = await Promise.all([
    prisma.user.count({ where: { ...notAdmin, institutionId: { not: null } } }),
    prisma.user.count({ where: { ...notAdmin, institutionId: null } }),
    prisma.comic.count(),
    prisma.institution.count(),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { role: 'TEACHER' } }),
    prisma.user.count({ where: { role: 'INSTITUTION_CHIEF' } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    userTrend({ ...notAdmin, institutionId: { not: null } }),
    userTrend({ ...notAdmin, institutionId: null }),
    comicsTrend(),
    institutionsTrend(),
    userTrend({ role: 'STUDENT' }),
    userTrend({ role: 'TEACHER' }),
  ]);

  // Last 6 months: cumulative totals at month-end + new users/comics that month (for charts)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const monthEnd = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i + 1, 1));
    const [cumulativeUsers, newUsers, newComics, cumulativeComics, cumulativeInstitutions, cumulativeStudents, cumulativeTeachers] = await Promise.all([
      prisma.user.count({ where: { ...notAdmin, createdAt: { lt: monthEnd } } }),
      prisma.user.count({ where: { ...notAdmin, createdAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.comic.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.comic.count({ where: { createdAt: { lt: monthEnd } } }),
      prisma.institution.count({ where: { createdAt: { lt: monthEnd } } }),
      prisma.user.count({ where: { role: 'STUDENT', createdAt: { lt: monthEnd } } }),
      prisma.user.count({ where: { role: 'TEACHER', createdAt: { lt: monthEnd } } }),
    ]);
    months.push({
      label: monthStart.toLocaleString('en-US', { month: 'short' }),
      cumulativeUsers, newUsers, newComics, cumulativeComics, cumulativeInstitutions, cumulativeStudents, cumulativeTeachers,
    });
  }

  const institutions = await prisma.institution.findMany({ include: { _count: { select: { users: true } } } });
  const mostActive = institutions.sort((a, b) => b._count.users - a._count.users)[0];

  res.json({
    institutionUsers,
    individualUsers,
    totalComics,
    totalInstitutions,
    students,
    teachers,
    chiefs,
    admins,
    trends: {
      institutionUsers: institutionTrend, individualUsers: individualTrend, totalComics: totalComicsTrend,
      totalInstitutions: totalInstitutionsTrend, students: studentsTrend, teachers: teachersTrend,
    },
    monthly: months,
    mostActiveInstitution: mostActive && mostActive._count.users > 0
      ? { name: mostActive.name, type: mostActive.type, userCount: mostActive._count.users }
      : null,
  });
});

// GET /api/admin/recent-comics — latest comics across all users, for the Dashboard's "Latest Comics" panel
router.get('/recent-comics', adminAuth, async (_req, res) => {
  const comics = await prisma.comic.findMany({
    take: 6,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } },
  });
  res.json(comics);
});

// GET /api/admin/users
router.get('/users', adminAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, createdAt: true, institutionId: true,
      avatarPath: true, disabled: true,
      institution: { select: { name: true } },
      _count: { select: { comics: true, submissions: true, tasksCreated: true, classesCreated: true, enrollments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// PATCH /api/admin/users/:id/disable — block/restore login access (checked at login time)
router.patch('/users/:id/disable', adminAuth, async (req, res) => {
  const { disabled } = req.body;
  if (typeof disabled !== 'boolean') return res.status(400).json({ error: 'disabled must be true or false' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account' });

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { disabled },
    select: { id: true, email: true, name: true, role: true, disabled: true },
  }).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// DELETE /api/admin/users/:id — cascades to the user's comics/submissions/enrollments,
// and (for a teacher) their classes/tasks, which in turn removes other students' enrollments
// and submissions tied to those — irreversible, the frontend must confirm this clearly first.
router.delete('/users/:id', adminAuth, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last remaining admin' });
  }

  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Generates a human-friendly join code like "AB3X-7KQM", avoiding ambiguous chars (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateInstitutionCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// GET /api/admin/institutions
router.get('/institutions', adminAuth, async (_req, res) => {
  const institutions = await prisma.institution.findMany({
    include: {
      _count: { select: { users: true, classes: true, tasks: true, payments: true } },
      users: { where: { role: 'INSTITUTION_CHIEF' }, select: { name: true, email: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(institutions.map((inst) => ({ ...inst, chief: inst.users[0] || null, users: undefined })));
});

// DELETE /api/admin/institutions/:id — cascades to the institution's classes/tasks/payments
// (and, transitively, those classes'/tasks' enrollments/submissions); members are kept but
// disconnected (institutionId set to null), per the schema's onDelete rules.
router.delete('/institutions/:id', adminAuth, async (req, res) => {
  const institution = await prisma.institution.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!institution) return res.status(404).json({ error: 'Institution not found' });
  res.json({ ok: true });
});

// POST /api/admin/institutions
router.post('/institutions', adminAuth, async (req, res) => {
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Institution name is required' });
  if (!['SCHOOL', 'COLLEGE'].includes(type)) return res.status(400).json({ error: 'Type must be SCHOOL or COLLEGE' });

  const now = new Date();
  let institution;
  for (let attempt = 0; attempt < 5 && !institution; attempt++) {
    try {
      institution = await prisma.institution.create({
        data: { name: name.trim(), type, code: generateInstitutionCode(), subscriptionStartedAt: now, subscriptionExpiresAt: addMonths(now, 3) },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err; // unique constraint clash on code — retry
    }
  }
  if (!institution) return res.status(500).json({ error: 'Could not generate a unique code, try again' });
  res.status(201).json(institution);
});

// PATCH /api/admin/institutions/:id — full edit: name, type, exact subscription dates
router.patch('/institutions/:id', adminAuth, async (req, res) => {
  const { name, type, subscriptionStartedAt, subscriptionExpiresAt } = req.body;
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (type !== undefined) {
    if (!['SCHOOL', 'COLLEGE'].includes(type)) return res.status(400).json({ error: 'Type must be SCHOOL or COLLEGE' });
    data.type = type;
  }
  if (subscriptionStartedAt !== undefined) data.subscriptionStartedAt = subscriptionStartedAt ? new Date(subscriptionStartedAt) : null;
  if (subscriptionExpiresAt !== undefined) data.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;

  const institution = await prisma.institution.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!institution) return res.status(404).json({ error: 'Institution not found' });
  res.json(institution);
});

// PATCH /api/admin/institutions/:id/suspend — reversible force-stop, independent of expiry date
router.patch('/institutions/:id/suspend', adminAuth, async (req, res) => {
  const { suspended } = req.body;
  if (typeof suspended !== 'boolean') return res.status(400).json({ error: 'suspended must be true or false' });

  const institution = await prisma.institution.update({ where: { id: req.params.id }, data: { suspended } }).catch(() => null);
  if (!institution) return res.status(404).json({ error: 'Institution not found' });
  res.json(institution);
});

// PATCH /api/admin/institutions/:id/renew — extends from whichever is later: now, or the current expiry
router.patch('/institutions/:id/renew', adminAuth, async (req, res) => {
  const existing = await prisma.institution.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Institution not found' });

  const now = new Date();
  const base = existing.subscriptionExpiresAt && existing.subscriptionExpiresAt > now ? existing.subscriptionExpiresAt : now;
  const institution = await prisma.institution.update({
    where: { id: req.params.id },
    data: { subscriptionExpiresAt: addMonths(base, 3) },
  });
  res.json(institution);
});

// POST /api/admin/institutions/:id/chief — create the institution chief login (one per institution)
router.post('/institutions/:id/chief', adminAuth, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, and password are required' });

  const institution = await prisma.institution.findUnique({ where: { id: req.params.id } });
  if (!institution) return res.status(404).json({ error: 'Institution not found' });

  const existingChief = await prisma.user.findFirst({ where: { institutionId: institution.id, role: 'INSTITUTION_CHIEF' } });
  if (existingChief) return res.status(409).json({ error: 'This institution already has a chief login' });

  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) return res.status(409).json({ error: 'Email already registered' });

  const chief = await prisma.user.create({
    data: { name, email, password: await bcrypt.hash(password, 10), role: 'INSTITUTION_CHIEF', institutionId: institution.id },
    select: { id: true, email: true, name: true, role: true, institutionId: true },
  });
  res.status(201).json(chief);
});

// PATCH /api/admin/institutions/:id/system-count
router.patch('/institutions/:id/system-count', adminAuth, async (req, res) => {
  const { systemCount } = req.body;
  if (!Number.isInteger(systemCount) || systemCount < 0) {
    return res.status(400).json({ error: 'systemCount must be a non-negative integer' });
  }
  const institution = await prisma.institution.update({ where: { id: req.params.id }, data: { systemCount } }).catch(() => null);
  if (!institution) return res.status(404).json({ error: 'Institution not found' });
  res.json(institution);
});

// PATCH /api/admin/assets/:id/skin-mask — persists just the Palette Normalizer's mask
// recipe (HSV detection thresholds, brightness cutoffs, output palette) onto an existing
// asset. No image is re-uploaded; this only updates metadata so the same mask can be
// reloaded and reapplied later without redoing the manual tuning.
router.patch('/assets/:id/skin-mask', adminAuth, async (req, res) => {
  const { mask } = req.body;
  if (!mask || typeof mask !== 'object') {
    return res.status(400).json({ error: 'mask object is required' });
  }
  try {
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: { skinThresholds: mask },
    });
    res.json(asset);
  } catch (err) {
    res.status(404).json({ error: 'Asset not found' });
  }
});

// PUT /api/admin/assets/:id/file — overwrites an existing asset's image file in place
// (same asset id, no duplicate created) and optionally updates its skinThresholds mask
// recipe in the same request. Used by the Palette Normalizer's "Save Mask to Asset":
// saving just the mask metadata has no visible effect at runtime unless the stored file
// itself actually contains the exact 3-color palette, so this is how that gets applied.
router.put(
  '/assets/:id/file',
  adminAuth,
  upload.fields([{ name: 'file', maxCount: 1 }]),
  async (req, res) => {
    try {
      const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Asset not found' });
      if (!req.files?.file?.[0]) return res.status(400).json({ error: 'file is required' });

      const { mask } = req.body;
      const assetFile = req.files.file[0];
      // Re-encode as lossless webp (see reencodeLosslessWebp) instead of storing the
      // incoming PNG as-is — same bytes, much smaller file.
      const { buffer: finalBuf, ext } = await reencodeLosslessWebp(assetFile.buffer);
      const subdir = CATEGORY_TO_DIR[existing.category];
      const dir = path.join(UPLOADS_ROOT, subdir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(dir, filename), finalBuf);

      try {
        const oldAbs = path.join(UPLOADS_ROOT, existing.filePath.replace(/^\/uploads\//, ''));
        if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch (_) { /* best-effort */ }

      const asset = await prisma.asset.update({
        where: { id: existing.id },
        data: {
          filePath: `/uploads/${subdir}/${filename}`,
          ...(mask ? { skinThresholds: JSON.parse(mask) } : {}),
        },
      });
      res.json(asset);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Update failed' });
    }
  }
);

module.exports = router;
