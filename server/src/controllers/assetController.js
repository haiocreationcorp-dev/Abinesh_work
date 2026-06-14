const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const getAssets = async (req, res) => {
  const { category, tags, search } = req.query;
  const where = {};

  if (category) where.category = category.toUpperCase();
  if (tags) where.tags = { hasSome: tags.split(',').map((t) => t.trim()) };
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(assets);
};

const getAssetById = async (req, res) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  res.json(asset);
};

const deleteAsset = async (req, res) => {
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
};

const deleteAssets = async (req, res) => {
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
};

const getFacePartAlignments = async (req, res) => {
  const rows = await prisma.facePartAlignment.findMany({ where: { faceAssetId: req.params.faceAssetId } });
  res.json(rows);
};

module.exports = { getAssets, getAssetById, deleteAsset, deleteAssets, getFacePartAlignments };
