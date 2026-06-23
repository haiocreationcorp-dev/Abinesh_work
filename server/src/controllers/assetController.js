const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

// Validated against the live AssetCategory enum so a request for a stale/removed
// category (e.g. old client code still asking for "CHARACTER" or "DRESS" from before
// the asset-library rebuild) gets a clean 400 instead of an unhandled Prisma validation
// error — which, left uncaught in an async Express handler, crashes the whole process.
const VALID_CATEGORIES = ['FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE', 'BACKGROUND', 'PROP', 'EFFECT', 'BUBBLE', 'SOUND'];

const getAssets = async (req, res) => {
  try {
    const { category, tags, search } = req.query;
    const where = {};

    if (category) {
      const categoryUpper = category.toUpperCase();
      if (!VALID_CATEGORIES.includes(categoryUpper)) {
        return res.status(400).json({ error: `Invalid category: ${category}` });
      }
      where.category = categoryUpper;
    }
    if (tags) where.tags = { hasSome: tags.split(',').map((t) => t.trim()) };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load assets' });
  }
};

const getAssetById = async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load asset' });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const removeFile = (relPath) => {
      const full = path.join(UPLOADS_ROOT, relPath);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    };

    removeFile(asset.filePath);
    if (asset.thumbnailPath) removeFile(asset.thumbnailPath);

    await prisma.asset.delete({ where: { id: req.params.id } });
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
};

const deleteAssets = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    const assets = await prisma.asset.findMany({ where: { id: { in: ids } } });

    const removeFile = (relPath) => {
      try {
        const full = path.join(UPLOADS_ROOT, relPath);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (_) { /* best-effort */ }
    };

    for (const asset of assets) {
      removeFile(asset.filePath);
      if (asset.thumbnailPath) removeFile(asset.thumbnailPath);
    }

    await prisma.asset.deleteMany({ where: { id: { in: ids } } });
    res.json({ deleted: assets.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
};

const getFacePartAlignments = async (req, res) => {
  try {
    const rows = await prisma.facePartAlignment.findMany({ where: { faceAssetId: req.params.faceAssetId } });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load alignments' });
  }
};

// Public reads for CharacterPreset/Expression — the Comic Editor needs to browse these
// to place a character, same reason GET /assets is public while mutations are admin-only.
const getCharacterPresets = async (_req, res) => {
  try {
    const presets = await prisma.characterPreset.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(presets);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load character presets' });
  }
};

const getExpressions = async (_req, res) => {
  try {
    const expressions = await prisma.expression.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(expressions);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load expressions' });
  }
};

module.exports = { getAssets, getAssetById, deleteAsset, deleteAssets, getFacePartAlignments, getCharacterPresets, getExpressions };
