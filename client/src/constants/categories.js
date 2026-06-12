// Single source of truth for all asset categories.
// Add a new category here and it automatically appears in Upload, Folder Upload, Browse, and Admin Browse.
export const ASSET_CATEGORIES = [
  { id: 'CHARACTER',  label: 'Characters',  icon: '🧑' },
  { id: 'BACKGROUND', label: 'Backgrounds', icon: '🌄' },
  { id: 'EXPRESSION', label: 'Expressions', icon: '😄' },
  { id: 'PROP',       label: 'Props',       icon: '🪑' },
  { id: 'EFFECT',     label: 'Effects',     icon: '✨' },
  { id: 'COSTUME',    label: 'Costumes',    icon: '👘' },
  { id: 'SOUND',      label: 'Sound',       icon: '🔊' },
  { id: 'BUBBLE',     label: 'Bubbles',     icon: '💬' },
  { id: 'BODY_PART',  label: 'Body Parts',  icon: '🦴' },
];

export const CATEGORY_IDS = ASSET_CATEGORIES.map((c) => c.id);

export const BG_SUBCATEGORIES = [
  { id: 'home',       label: 'Home',       icon: '🏠' },
  { id: 'education',  label: 'Education',  icon: '📚' },
  { id: 'office',     label: 'Office',     icon: '💼' },
  { id: 'city',       label: 'City',       icon: '🏙️' },
  { id: 'nature',     label: 'Nature',     icon: '🌿' },
  { id: 'fantasy',    label: 'Fantasy',    icon: '🧙' },
  { id: 'sci-fi',     label: 'Sci-Fi',     icon: '🚀' },
  { id: 'historical', label: 'Historical', icon: '🏛️' },
  { id: 'horror',     label: 'Horror',     icon: '💀' },
  { id: 'commercial', label: 'Commercial', icon: '🏪' },
  { id: 'transport',  label: 'Transport',  icon: '🚗' },
  { id: 'action',     label: 'Action',     icon: '⚔️' },
];
