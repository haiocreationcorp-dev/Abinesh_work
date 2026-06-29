const path = require('path');
const sharp = require('sharp');
const prisma = require('../config/prisma');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const SHARED_ALIGNMENT_KEY = '__ALL__';

// Pose Builder only gets calibrated one costume at a time — most BODY_POSE assets for a
// given pose number (P2, P3, ...) across OTHER costumes never get their own head box saved.
// Rather than rendering headless, a pose with no saved box borrows the head box from
// whichever other BODY_POSE asset of the SAME poseType was calibrated earliest (in
// practice: the first costume the admin fully calibrated, e.g. C1), rescaled to this
// asset's own image dimensions (each costume's image has the same 800px height cap, but
// width varies with the source art's own aspect ratio, so a straight pixel copy would be
// off). Once the admin opens that pose in Pose Builder, adjusts, and saves, it gets its
// own real row in FacePartAlignment and stops needing this fallback going forward.
async function findInheritedHeadBox(bodyPoseAssetId) {
  const asset = await prisma.asset.findUnique({ where: { id: bodyPoseAssetId } });
  if (!asset || asset.category !== 'BODY_POSE' || !asset.poseType) return null;

  const siblings = await prisma.asset.findMany({
    where: { category: 'BODY_POSE', poseType: asset.poseType, id: { not: bodyPoseAssetId } },
    orderBy: { createdAt: 'asc' },
  });
  if (siblings.length === 0) return null;

  const siblingAligns = await prisma.facePartAlignment.findMany({
    where: { partType: 'head', partAssetId: SHARED_ALIGNMENT_KEY, faceAssetId: { in: siblings.map((s) => s.id) } },
  });
  if (siblingAligns.length === 0) return null;

  // Earliest-calibrated sibling wins, so the fallback consistently traces back to whichever
  // costume the admin finished first, rather than an arbitrary/unstable pick.
  const alignBySiblingId = new Map(siblingAligns.map((a) => [a.faceAssetId, a]));
  const source = siblings.find((s) => alignBySiblingId.has(s.id));
  const sourceAlign = alignBySiblingId.get(source.id);

  const [targetMeta, sourceMeta] = await Promise.all([
    sharp(path.join(UPLOADS_ROOT, asset.filePath.replace(/^\/uploads\//, ''))).metadata(),
    sharp(path.join(UPLOADS_ROOT, source.filePath.replace(/^\/uploads\//, ''))).metadata(),
  ]);
  const scaleX = targetMeta.width / sourceMeta.width;
  const scaleY = targetMeta.height / sourceMeta.height;

  return {
    faceAssetId: bodyPoseAssetId,
    partAssetId: SHARED_ALIGNMENT_KEY,
    partType: 'head',
    x: Math.round(sourceAlign.x * scaleX),
    y: Math.round(sourceAlign.y * scaleY),
    w: Math.round(sourceAlign.w * scaleX),
    h: Math.round(sourceAlign.h * scaleY),
    rotation: sourceAlign.rotation,
    flipX: sourceAlign.flipX,
    flipY: sourceAlign.flipY,
    connectX: sourceAlign.connectX,
    connectY: sourceAlign.connectY,
    inherited: true,
    inheritedFrom: source.name,
  };
}

module.exports = { findInheritedHeadBox };
