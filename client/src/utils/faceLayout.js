// Shared helpers for composing a FACE preset from its assembled layout + calibrated alignments.
import { getAssetById } from '../api/assets.js';

// A saved layout (FACE_TEMPLATE or Dress character) stores each part's filePath as a
// snapshot from whenever it was assembled — if that part's underlying asset file is later
// replaced (e.g. re-normalizing it in Palette Normalizer or Eye Normalizer, which uploads
// a new file and deletes the old one), the saved snapshot points at a now-deleted file and
// the part silently stops rendering. assetId is the durable reference; filePath is not.
// Call this right after parsing a layout's JSON, before using it for anything, to replace
// every part's filePath with its asset's CURRENT one. Falls back to the stored filePath if
// the asset itself can't be found (e.g. actually deleted) rather than breaking the part.
export async function resolveLayoutFilePaths(layout) {
  if (!Array.isArray(layout)) return layout;
  const ids = [...new Set(layout.map((p) => p.assetId).filter(Boolean))];
  const fresh = await Promise.all(ids.map((id) => getAssetById(id).catch(() => null)));
  const byId = new Map(ids.map((id, i) => [id, fresh[i]]));
  return layout.map((part) => {
    const asset = part.assetId && byId.get(part.assetId);
    return asset ? { ...part, filePath: asset.filePath } : part;
  });
}

// Must match PartAssembler.jsx's CANVAS_W/CANVAS_H — that's the logical canvas every
// FACE_TEMPLATE's part x/y/w/h coordinates are actually saved relative to.
export const FACE_CANVAS_W = 500;
export const FACE_CANVAS_H = 600;

export const FACE_SECTIONS = [
  { id: 'hairstyle', label: 'Hair' },
  { id: 'nose', label: 'Nose' },
  { id: 'eye', label: 'Eyes' },
  { id: 'mouth', label: 'Mouth' },
];

// Classify a face-layout entry or FACE_PART asset by its name.
export function classifyFacePart(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('hair')) return 'hairstyle';
  if (n.includes('nose')) return 'nose';
  if (n.includes('eye')) return 'eye';
  if (n.includes('mouth')) return 'mouth';
  if (n.includes('face')) return 'faceShape';
  return null;
}

// Layout entries carry a reliable partType enum (FACE_SHAPE/HAIR/EYES/MOUTH) set at
// assembly time — prefer that over name-sniffing, which breaks on abbreviated asset
// names like "E1_Front" or "M1_F" that don't literally contain "eye"/"mouth".
const PART_TYPE_MAP = { FACE_SHAPE: 'faceShape', HAIR: 'hairstyle', EYES: 'eye', MOUTH: 'mouth', NOSE: 'nose' };

// Does this FACE_PART asset belong in the given section's library?
export function matchesFaceSection(asset, sectionId) {
  const n = (asset.name || '').toLowerCase();
  const tags = asset.tags || [];
  if (sectionId === 'hairstyle') return tags.includes('hairstyle') || n.includes('hair');
  return tags.includes(sectionId) || n.includes(sectionId);
}

// Default placement for a part with no calibration and no existing slot: centered 150x150.
export function defaultPartOverlay(assetId, filePath) {
  return {
    assetId, filePath,
    x: Math.round(FACE_CANVAS_W / 2 - 75), y: Math.round(FACE_CANVAS_H / 2 - 75),
    w: 150, h: 150, rotation: 0, flipX: false, flipY: false,
  };
}

// Turns a FACE_TEMPLATE's saved layoutPath JSON (a flat array of assembled parts) into
// the { faceShape, parts } shape FaceRig/CharacterPresetRig render — classifying each
// part by name and pulling out just the fields needed to draw it. Falls back to treating
// the whole asset as one flat faceShape image if there's no layout (or it fails to load).
export function buildFaceFromLayout(layout, fallbackAsset) {
  let faceShape = null;
  const parts = {};
  if (Array.isArray(layout)) {
    for (const part of layout) {
      const cls = PART_TYPE_MAP[part.partType] || classifyFacePart(part.customName || part.name);
      if (!cls) continue;
      const entry = {
        assetId: part.assetId, filePath: part.filePath,
        x: part.x, y: part.y, w: part.w, h: part.h,
        rotation: part.rotation || 0, flipX: !!part.flipX, flipY: !!part.flipY,
        ...(part.skinOverlay ? { skinOverlay: part.skinOverlay } : {}),
      };
      if (cls === 'faceShape') faceShape = entry;
      else parts[cls] = entry;
    }
  }
  if (!faceShape && fallbackAsset) {
    faceShape = {
      assetId: fallbackAsset.id, filePath: fallbackAsset.filePath,
      x: 0, y: 0, w: FACE_CANVAS_W, h: FACE_CANVAS_H,
      rotation: 0, flipX: false, flipY: false,
    };
  }
  return { faceShape, parts };
}

// Fixed paint order: face shape always bottom, hairstyle always top, eye/nose/mouth in
// between (their relative order doesn't matter since they don't overlap each other) —
// simpler and more robust than a custom per-part zIndex, which has to be correctly carried
// through every place a part can be created, loaded, or swapped, and silently reverts to
// guesswork wherever that's missed. Same order Face Builder's own canvas uses.
const FACE_PART_RENDER_ORDER = ['faceShape', 'eye', 'nose', 'mouth', 'hairstyle'];

// Returns [{ pt, part }] for faceShape + all present parts, in that fixed paint order.
export function orderFaceParts(face) {
  return FACE_PART_RENDER_ORDER
    .map((pt) => {
      const part = pt === 'faceShape' ? face.faceShape : face.parts?.[pt];
      return part ? { pt, part } : null;
    })
    .filter(Boolean);
}

// Tight bounding box of all visible face content (faceShape + parts). The nominal
// FACE_CANVAS_W x FACE_CANVAS_H frame includes blank padding and parts can intentionally
// extend outside it (e.g. hair drawn above y=0 for bangs/fringe) — fitting that nominal
// frame into a tightly-sized target box (like a Pose Builder head box) clips that overflow.
// Fitting the actual content bounds instead guarantees nothing gets cropped.
export function computeFaceContentBounds(face) {
  const entries = [face.faceShape, ...Object.values(face.parts || {})].filter(Boolean);
  if (entries.length === 0) return { minX: 0, minY: 0, maxX: FACE_CANVAS_W, maxY: FACE_CANVAS_H };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entries) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.w);
    maxY = Math.max(maxY, e.y + e.h);
  }
  return { minX, minY, maxX, maxY };
}
