const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');

// Admin-managed registry of BACKGROUND asset subcategories. Each subcategory's `slug` is
// the string written into an asset's `tags` array at upload time (e.g. "sci-fi"); the slug
// is stable and never renamed, so existing tagged assets never break. `label` is the
// display name (what rename edits). Seeded from the defaults below on first access, the
// same self-healing pattern LightingPreset uses.

// The 14 starting subcategories, intentionally emoji-free.
const DEFAULT_SUBCATEGORIES = [
  'Nature', 'Transport', 'School', 'Military', 'Farm', 'City', 'Fun Zone',
  'Village', 'Work Zone', 'Sci-Fi', 'Fantasy', 'Home', 'History', 'Horror',
];

// Bulk-deleting more than this many assets at once (via a subcategory delete cascade)
// requires the confirm password — same speed bump as assetController.deleteAssets.
const BULK_DELETE_PASSWORD_THRESHOLD = 9;

function slugify(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const BACKGROUNDS_DIR = 'backgrounds';

// asset.filePath is a server-root-relative URL path (e.g. "/uploads/backgrounds/x.webp");
// resolve it back to an absolute disk path for deletion. Same logic as assetController's
// private helper (kept local rather than exported to avoid touching that file).
function removeAssetFile(relPath) {
  try {
    const full = path.join(__dirname, '../..', relPath.replace(/^\//, ''));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) { /* best-effort */ }
}

// Sequential letter code: 0→A, 25→Z, 26→AA, 27→AB, … (spreadsheet-column style). Used to
// assign a stable code to each subcategory in creation order.
function letterForIndex(n) {
  let s = '';
  let i = n;
  do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The asset name / on-disk filename for the nth background in a subcategory: its letter
// code plus a sequential number — "A01", "B07". The readable subcategory name is shown in
// the UI (folder tiles); the code is only ever used for this internal asset naming.
function codeName(code, n) {
  return `${code}${String(n).padStart(2, '0')}`;
}

// Assign a stable code to every subcategory that doesn't have one yet, in sortOrder — the
// first code-less row gets the lowest free letter, and so on. Self-healing (like
// ensureSeeded) so the column backfills itself after the migration without a data script.
async function ensureCodesBackfilled() {
  const all = await prisma.backgroundSubcategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const used = new Set(all.map((s) => s.code).filter(Boolean));
  let idx = 0;
  const nextFreeCode = () => { let c; do { c = letterForIndex(idx++); } while (used.has(c)); used.add(c); return c; };
  for (const sub of all) {
    if (!sub.code) {
      await prisma.backgroundSubcategory.update({ where: { id: sub.id }, data: { code: nextFreeCode() } });
    }
  }
}

// Next sequence number for a subcategory: one past the highest existing "<code><n>" name
// among its tagged BACKGROUND assets, so numbering continues where it left off (A21 → A22)
// and never reuses a lower slot that a middle deletion freed up.
async function nextAssetNumber(slug, code) {
  const assets = await prisma.asset.findMany({
    where: { category: 'BACKGROUND', tags: { has: slug } },
    select: { name: true },
  });
  const re = new RegExp(`^${escapeRegex(code)}(\\d+)$`);
  let max = 0;
  for (const a of assets) {
    const m = re.exec(a.name || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const ensureSeeded = async () => {
  const count = await prisma.backgroundSubcategory.count();
  if (count > 0) return;
  await prisma.backgroundSubcategory.createMany({
    data: DEFAULT_SUBCATEGORIES.map((label, i) => ({
      slug: slugify(label),
      label,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
};

// Upsert a subcategory by slug — used by the upload path so a manually-typed or
// folder-name-derived subcategory automatically registers in the managed list. Accepts
// either a slug or a free-text label; returns the row.
// Picks the lowest unused letter code across all current subcategories.
async function allocateCode() {
  const all = await prisma.backgroundSubcategory.findMany({ select: { code: true } });
  const used = new Set(all.map((s) => s.code).filter(Boolean));
  let idx = 0;
  let c;
  do { c = letterForIndex(idx++); } while (used.has(c));
  return c;
}

const ensureSubcategoryExists = async (slugOrLabel) => {
  const slug = slugify(slugOrLabel);
  if (!slug) return null;
  await ensureSeeded();
  await ensureCodesBackfilled();
  const existing = await prisma.backgroundSubcategory.findUnique({ where: { slug } });
  if (existing) return existing;
  const max = await prisma.backgroundSubcategory.aggregate({ _max: { sortOrder: true } });
  return prisma.backgroundSubcategory.create({
    data: { slug, label: String(slugOrLabel).trim(), code: await allocateCode(), sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
};

const getSubcategories = async (req, res) => {
  try {
    await ensureSeeded();
    await ensureCodesBackfilled();
    const list = await prisma.backgroundSubcategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load subcategories' });
  }
};

const createSubcategory = async (req, res) => {
  try {
    const label = String(req.body.label || '').trim();
    if (!label) return res.status(400).json({ error: 'Label is required' });
    const slug = slugify(label);
    if (!slug) return res.status(400).json({ error: 'Label must contain at least one letter or number' });

    const existing = await prisma.backgroundSubcategory.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ error: `"${existing.label}" already exists` });

    await ensureSeeded();
    await ensureCodesBackfilled();
    const max = await prisma.backgroundSubcategory.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.backgroundSubcategory.create({
      data: { slug, label, code: await allocateCode(), sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create subcategory' });
  }
};

// Rename edits the display label only — slug (and therefore every asset already tagged
// with it) stays put, so nothing tagged ever gets orphaned by a rename.
const updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const label = String(req.body.label || '').trim();
    if (!label) return res.status(400).json({ error: 'Label is required' });
    const existing = await prisma.backgroundSubcategory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Subcategory not found' });
    const updated = await prisma.backgroundSubcategory.update({ where: { id }, data: { label } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update subcategory' });
  }
};

// Delete cascades: every BACKGROUND asset tagged with this subcategory's slug is
// permanently removed (image files + rows). Over the threshold, the bulk-delete password
// is required, exactly like assetController.deleteAssets.
const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await prisma.backgroundSubcategory.findUnique({ where: { id } });
    if (!sub) return res.status(404).json({ error: 'Subcategory not found' });

    const assets = await prisma.asset.findMany({
      where: { category: 'BACKGROUND', tags: { has: sub.slug } },
    });

    if (assets.length > BULK_DELETE_PASSWORD_THRESHOLD && req.body.password !== process.env.BULK_DELETE_CONFIRM_PASSWORD) {
      return res.status(403).json({ error: 'Incorrect password', assetCount: assets.length, needsPassword: true });
    }

    for (const asset of assets) {
      removeAssetFile(asset.filePath);
      if (asset.thumbnailPath) removeAssetFile(asset.thumbnailPath);
    }
    if (assets.length > 0) {
      await prisma.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
    }
    await prisma.backgroundSubcategory.delete({ where: { id } });

    res.json({ deleted: true, deletedAssets: assets.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete subcategory' });
  }
};

// Retro-migration: move a set of existing BACKGROUND assets into this subcategory —
// rename each to the next "<code><n>", move its file into uploads/backgrounds/<slug>/, and
// retag it (add this slug, drop any other subcategory slug so an asset lives in exactly one
// folder). Untagged/legacy backgrounds (random UUID names) get folded into the scheme this
// way, since they can't be auto-placed.
const assignAssets = async (req, res) => {
  try {
    const { id } = req.params;
    const { assetIds } = req.body;
    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({ error: 'assetIds must be a non-empty array' });
    }
    await ensureSeeded();
    await ensureCodesBackfilled();
    const sub = await prisma.backgroundSubcategory.findUnique({ where: { id } });
    if (!sub) return res.status(404).json({ error: 'Subcategory not found' });

    // Slugs of all OTHER subcategories — so we can strip a prior subcategory tag on move.
    const allSubs = await prisma.backgroundSubcategory.findMany({ select: { slug: true } });
    const otherSlugs = new Set(allSubs.map((s) => s.slug).filter((s) => s !== sub.slug));

    const assets = await prisma.asset.findMany({ where: { id: { in: assetIds }, category: 'BACKGROUND' } });
    const destDirAbs = path.join(UPLOADS_ROOT, BACKGROUNDS_DIR, sub.slug);
    if (!fs.existsSync(destDirAbs)) fs.mkdirSync(destDirAbs, { recursive: true });

    let n = await nextAssetNumber(sub.slug, sub.code);
    const moved = [];
    for (const asset of assets) {
      const ext = path.extname(asset.filePath) || '.webp';
      const newName = codeName(sub.code, n);
      const newFilename = `${newName}${ext}`;
      const newRelPath = `/uploads/${BACKGROUNDS_DIR}/${sub.slug}/${newFilename}`;

      // Move the file on disk (copy + remove old), best-effort.
      try {
        const oldAbs = path.join(__dirname, '../..', asset.filePath.replace(/^\//, ''));
        const newAbs = path.join(destDirAbs, newFilename);
        if (fs.existsSync(oldAbs) && oldAbs !== newAbs) {
          fs.copyFileSync(oldAbs, newAbs);
          fs.unlinkSync(oldAbs);
        }
      } catch (_) { /* if the file is missing we still fix the DB row below */ }

      const tags = [...new Set([...(asset.tags || []).filter((t) => !otherSlugs.has(t)), sub.slug])];
      await prisma.asset.update({
        where: { id: asset.id },
        data: { name: newName, filePath: newRelPath, tags },
      });
      moved.push({ id: asset.id, name: newName });
      n += 1;
    }

    res.json({ moved: moved.length, assets: moved });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to move assets' });
  }
};

module.exports = {
  slugify,
  codeName,
  nextAssetNumber,
  ensureSubcategoryExists,
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  assignAssets,
};
