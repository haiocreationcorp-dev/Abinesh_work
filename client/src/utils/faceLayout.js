// Shared helpers for composing a FACE preset from its assembled layout + calibrated alignments.

export const FACE_CANVAS_W = 400;
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
