// Single source of truth for all asset categories.
// Add a new category here and it automatically appears in Upload, Folder Upload, Browse, and Admin Browse.
// EXPRESSION and CHARACTER_PRESET are intentionally not here — they're dedicated models
// (Expression, CharacterPreset) with their own small admin forms, not generic file uploads.
export const ASSET_CATEGORIES = [
  { id: 'FACE_PART',    label: 'Face Parts',    icon: '👁️' },
  { id: 'FACE_TEMPLATE', label: 'Face Templates', icon: '😀' },
  { id: 'BODY_POSE',    label: 'Body Poses',    icon: '🚶' },
  { id: 'BACKGROUND',   label: 'Backgrounds',   icon: '🌄' },
  { id: 'PROP',         label: 'Props',         icon: '🪑' },
  { id: 'EFFECT',       label: 'Effects',       icon: '✨' },
  { id: 'BUBBLE',       label: 'Bubbles',       icon: '💬' },
  { id: 'SOUND',        label: 'Sound',         icon: '🔊' },
];

export const CATEGORY_IDS = ASSET_CATEGORIES.map((c) => c.id);

export const VIEWS = [
  { id: 'FRONT',          label: 'Front' },
  { id: 'THREE_QUARTER',  label: '3/4' },
];

export const FACE_PART_TYPES = [
  { id: 'FACE_SHAPE', label: 'Face Shape (+ Nose)' },
  { id: 'HAIR',        label: 'Hair' },
  { id: 'EYES',        label: 'Eyes + Eyebrows' },
  { id: 'MOUTH',       label: 'Mouth' },
];

export const GENDERS = [
  { id: 'MALE',    label: 'Male' },
  { id: 'FEMALE',  label: 'Female' },
  { id: 'UNISEX',  label: 'Unisex' },
];

export const POSE_TYPES = Array.from({ length: 24 }, (_, i) => ({ id: `P${i + 1}`, label: `P${i + 1}` }));

// Placeholder names — rename these labels once the actual 5 eye styles (separate per
// Gender, same as other FACE_PART metadata) are decided; the ids stay stable either way.
export const EYE_TYPES = Array.from({ length: 5 }, (_, i) => ({ id: `TYPE_${i + 1}`, label: `Type ${i + 1}` }));

// Same placeholder convention as EYE_TYPES — rename labels once the actual 5 mouth
// styles (separate per Gender) are decided; ids stay stable either way.
export const MOUTH_TYPES = Array.from({ length: 5 }, (_, i) => ({ id: `TYPE_${i + 1}`, label: `Type ${i + 1}` }));

// Background subcategories are no longer a hardcoded constant — they're an admin-managed
// list stored server-side (model BackgroundSubcategory, seeded from defaults in
// server/src/controllers/backgroundSubcategoryController.js). Fetch them via
// getBackgroundSubcategories() from api/assets.js.
