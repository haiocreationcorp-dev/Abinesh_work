const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const adminAuth = require('../middleware/adminAuth');
const prisma = require('../config/prisma');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const CATEGORY_TO_DIR = {
  CHARACTER: 'characters',
  BACKGROUND: 'backgrounds',
  EXPRESSION: 'expressions',
  PROP: 'props',
  EFFECT: 'effects',
  COSTUME: 'costumes',
  BUBBLE: 'bubbles',
  SOUND: 'sounds',
  BODY_PART: 'body-parts',
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

// Convert raster images to WebP for BACKGROUND and CHARACTER uploads.
// BACKGROUND: resize to 1200×675 + lossy q85. CHARACTER: no resize, lossy q82.
async function maybeToWebP(buffer, originalName, category) {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return { buffer, ext };
  if (category === 'BACKGROUND') {
    const converted = await sharp(buffer)
      .resize(1200, 675, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    return { buffer: converted, ext: '.webp' };
  }
  if (category === 'CHARACTER') {
    const converted = await sharp(buffer).webp({ quality: 82 }).toBuffer();
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
      const { name, category, tags, removeWhiteBg } = req.body;
      if (!name || !category || !req.files?.file) {
        return res.status(400).json({ error: 'name, category, and file are required' });
      }

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
      let { buffer: assetBuf, ext: assetExt } = await maybeToWebP(assetFile.buffer, assetFile.originalname, categoryUpper);
      if (removeWhiteBg === 'true') {
        ({ buffer: assetBuf, ext: assetExt } = await removeWhiteBackground(assetBuf, assetExt));
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
    const { category, tags, folderName, removeWhiteBg } = req.body;
    const categoryUpper = (category || '').toUpperCase();
    const tagArray = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const stripBg = removeWhiteBg === 'true';
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
        const assetName = (categoryUpper === 'CHARACTER' && folderPretty)
          ? `${folderPretty} ${baseName}`
          : baseName;
        const assetTags = (categoryUpper === 'CHARACTER' && folderPretty)
          ? [...tagArray, folderPretty.toLowerCase()]
          : tagArray;
        let { buffer: fileBuf, ext } = await maybeToWebP(file.buffer, file.originalname, categoryUpper);
        if (stripBg) ({ buffer: fileBuf, ext } = await removeWhiteBackground(fileBuf, ext));
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
            data: { filePath: newFilePath, filename: file.originalname },
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

// POST /api/admin/assets/save-pose  — saves a posed SVG string as a new CHARACTER asset
router.post('/assets/save-pose', adminAuth, express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { name, svgContent } = req.body;
    if (!name || !svgContent) return res.status(400).json({ error: 'name and svgContent required' });

    const filename = `${uuidv4()}.svg`;
    const dir = path.join(UPLOADS_ROOT, 'characters');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), svgContent, 'utf8');

    const asset = await prisma.asset.create({
      data: {
        name,
        category: 'CHARACTER',
        tags: ['posed'],
        filename,
        filePath: `/uploads/characters/${filename}`,
        thumbnailPath: null,
      },
    });
    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// POST /api/admin/characters/assemble — saves assembled SVG as a CHARACTER asset
router.post('/characters/assemble', adminAuth, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { name, svgContent } = req.body;
    if (!name || !svgContent) return res.status(400).json({ error: 'name and svgContent required' });

    const filename = `${uuidv4()}.svg`;
    const dir = path.join(UPLOADS_ROOT, 'characters');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), svgContent, 'utf8');

    const asset = await prisma.asset.create({
      data: {
        name,
        category: 'CHARACTER',
        tags: ['assembled', 'character-creator'],
        filename,
        filePath: `/uploads/characters/${filename}`,
        thumbnailPath: null,
      },
    });
    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// GET /api/admin/poses
router.get('/poses', adminAuth, async (_req, res) => {
  const poses = await prisma.pose.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(poses);
});

// POST /api/admin/poses
router.post('/poses', adminAuth, express.json(), async (req, res) => {
  const { name, rotations } = req.body;
  if (!name || !rotations) return res.status(400).json({ error: 'name and rotations required' });
  const pose = await prisma.pose.create({ data: { name, rotations } });
  res.status(201).json(pose);
});

// DELETE /api/admin/poses/:id
router.delete('/poses/:id', adminAuth, async (req, res) => {
  try {
    await prisma.pose.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Pose not found' });
  }
});

// GET /api/admin/users
router.get('/users', adminAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', adminAuth, async (req, res) => {
  const { role } = req.body;
  if (!['USER', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Role must be USER or ADMIN' });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json(user);
});

module.exports = router;
