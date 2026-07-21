import { useState, useEffect, useRef, Fragment } from 'react';
import { useComic, LAYOUT_COUNT } from '../../context/ComicContext.jsx';
import { VIEWS } from '../../constants/categories.js';
import Panel from './Panel.jsx';
import PanelLayoutPicker from './PanelLayoutPicker.jsx';
import AssetGrid from '../library/AssetGrid.jsx';
import ExportControls from './ExportControls.jsx';
import SpeechBubbleEditor from './SpeechBubble.jsx';
import AIAssistantPanel from './AIAssistantPanel.jsx';
import { AlignIcon, ColorSwatch, CustomSelect, FONTS, SIZES } from './BubbleUiKit.jsx';
import { getAssets, getFacePartAlignmentsPublic, getCharacterPresets as fetchCharacterPresets, getExpressions, getBackgroundSubcategories } from '../../api/assets.js';
import { FACE_SECTIONS, FACE_CANVAS_W, FACE_CANVAS_H, classifyFacePart, matchesFaceSection, defaultPartOverlay, buildFaceFromLayout, resolveLayoutFilePaths } from '../../utils/faceLayout.js';
import { SKIN_PRESETS } from '../../utils/skinPalette.js';
import { recolorSkin } from '../../utils/recolorImage.js';
import { genId } from '../../utils/id.js';
import { renderPage, pageStartIndex } from '../../utils/comicRenderer.js';

// ── SVG icon components ───────────────────────────────────────────────────────
function IconCharacters() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}
function IconFace() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c-3.5 0-5 3-5 7s1 9 5 11c4-2 5-7 5-11s-1.5-7-5-7z"/>
      <circle cx="9.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <path d="M10 14c.5.7 1.2 1 2 1s1.5-.3 2-1"/>
    </svg>
  );
}
function IconBackgrounds() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  );
}
function IconExpressions() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
      <circle cx="9" cy="9" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="9" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function IconProps() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}
function IconEffects() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 6.6H21l-5.7 4.1 2.2 6.6L12 15.2l-5.5 4.1 2.2-6.6L3 8.6h6.6z"/>
      <line x1="19" y1="19" x2="20.5" y2="20.5"/>
      <line x1="5" y1="19" x2="3.5" y2="20.5"/>
    </svg>
  );
}
function IconCostumes() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
    </svg>
  );
}
function IconFaceSwap() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c-3.5 0-5 3-5 7s1 9 5 11c4-2 5-7 5-11s-1.5-7-5-7z"/>
      <circle cx="9.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <path d="M9.5 14c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5"/>
      <path d="M3 7l2 2M21 7l-2 2"/>
    </svg>
  );
}
function IconOutfit() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4L3 7v4h3v9h12v-9h3V7l-5-3"/>
      <path d="M8 4a4 4 0 0 0 8 0"/>
    </svg>
  );
}
function IconPose() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="15" cy="4" r="1.8"/>
      <path d="M14 6.5l-1.5 4 3 2.5 1.5 5.5"/>
      <path d="M12.5 10.5l-4 1.5"/>
      <path d="M15.5 13l3.5 1.5"/>
      <path d="M12.5 10.5l-1 6-3 4"/>
      <path d="M17 18.5l-1.5-5.5"/>
    </svg>
  );
}
function IconHairstyle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20v-6a6 6 0 0 1 12 0v6"/>
      <path d="M4 14c1-4 3-9 8-10 5 1 7 6 8 10"/>
      <path d="M9 9c-1 1.5-1.5 3-1.5 5"/>
      <path d="M15 9c1 1.5 1.5 3 1.5 5"/>
    </svg>
  );
}
function IconHelp() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.2-2.5 4.5"/>
      <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function IconBack() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}
function IconColorDrop() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-.6-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3z"/>
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="10.5" cy="7" r="1" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="17.5" cy="11" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function IconText() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7"/>
      <line x1="9" y1="20" x2="15" y2="20"/>
      <line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
  );
}
function IconSound() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  );
}
function IconAI() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.6 3.8L17.5 8.4 13.6 10l-1.6 3.8L10.4 10 6.5 8.4l3.9-1.6z"/>
      <path d="M5 16l0.9 2.1L8 19l-2.1 0.9L5 22l-0.9-2.1L2 19l2.1-0.9z"/>
      <path d="M18 14l0.7 1.6L20.3 16.3l-1.6 0.7L18 18.6l-0.7-1.6L15.7 16.3l1.6-0.7z"/>
    </svg>
  );
}
function IconExport() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

const SIDEBAR_ITEMS = [
  { id: 'BACKGROUND',    Icon: IconBackgrounds, label: 'Backgrounds' },
  { id: 'CHARACTER',     Icon: IconCharacters,  label: 'Characters' },
  { id: 'EXPRESSION',    Icon: IconExpressions, label: 'Expressions' },
  { id: 'BUBBLE',        Icon: IconText,        label: 'Text' },
  { id: 'SPEECH_BUBBLE', Icon: IconText,        label: 'Speech Bubble' },
  { id: 'SOUND',         Icon: IconSound,       label: 'Sound' },
  { id: 'AI',            Icon: IconAI,          label: 'AI Tools' },
  { id: 'PROP',          Icon: IconProps,       label: 'Props' },
  { id: 'EFFECT',        Icon: IconEffects,     label: 'Effects' },
  { id: 'COSTUME',       Icon: IconCostumes,    label: 'Costumes' },
  { id: 'HELP',          Icon: IconHelp,        label: 'Help' },
];

// New illustrated tool icons (lossless WebP in client/public/tool-icons/). Items without an
// entry (SOUND, LAYOUT — no artwork supplied) keep their original inline-SVG icon.
const TOOL_ICON = {
  BACKGROUND: '/tool-icons/background.webp',
  CHARACTER:  '/tool-icons/characters.webp',
  HELP:       '/tool-icons/help.webp',
  EXPRESSION: '/tool-icons/expression.webp',
  PROP:       '/tool-icons/props.webp',
  EFFECT:     '/tool-icons/effects.webp',
  COSTUME:    '/tool-icons/costume.webp',
  SOUND:      '/tool-icons/sound.webp',
  BUBBLE:        '/tool-icons/text.webp',
  SPEECH_BUBBLE: '/tool-icons/bubbles.webp',
  AI:         '/tool-icons/ai.webp',
};

// Icons for the CHARACTER customization sub-menu tools (keyed by their tool id). `face` has
// no dedicated swap artwork, so it reuses the Characters icon.
const SUBTOOL_ICON = {
  face:       '/tool-icons/characters.webp',
  outfit:     '/tool-icons/costume.webp',
  pose:       '/tool-icons/poses.webp',
  expression: '/tool-icons/expression.webp',
  hairstyle:  '/tool-icons/hair-style.webp',
  skinColor:  '/tool-icons/face-colour.webp',
  eyeColor:   '/tool-icons/eye-colour.webp',
  hairColor:  '/tool-icons/hair-colour.webp',
};

const ASSET_IDS = new Set(['BACKGROUND', 'EXPRESSION', 'PROP', 'EFFECT', 'COSTUME', 'SOUND']);

// Customization menu shown when a placed CHARACTER is selected — see soft-mapping-honey plan
const CHARACTER_DIMENSIONS = [
  { id: 'face',       label: 'Face',       desc: 'Swap character face',       tagPrefix: 'face:',       Icon: IconFaceSwap },
  { id: 'outfit',     label: 'Outfit',     desc: 'Change character outfit',   tagPrefix: 'outfit:',     Icon: IconOutfit },
  { id: 'pose',       label: 'Pose',       desc: 'Change character pose',     tagPrefix: 'pose:',       Icon: IconPose },
  { id: 'expression', label: 'Expression', desc: 'Change facial expression',  tagPrefix: 'expression:', Icon: IconExpressions },
  { id: 'hairstyle',  label: 'Hairstyle',  desc: 'Change hairstyle',          tagPrefix: 'hairstyle:',  Icon: IconHairstyle },
];
// Skin Color is an exact pixel-color preset swap (not an overlay) — handled separately below.
const CHARACTER_SKIN_TOOL = { id: 'skinColor', label: 'Skin Color', desc: 'Change skin color' };
// Eye Color (iris) is a Character Preset-only exact-match swap, same idea as Skin Color —
// not available for legacy CHARACTER placements.
const CHARACTER_EYE_TOOL = { id: 'eyeColor', label: 'Eye Color', desc: 'Change eye lens color' };
const CHARACTER_COLOR_TOOLS = [
  { id: 'hairColor', label: 'Hair Color', desc: 'Change hair color', overlayKey: 'hairOverlay', defaultColor: '#3b2412' },
];
const BLEND_MODES = ['multiply', 'color', 'soft-light', 'overlay', 'hue', 'saturation', 'color-dodge', 'color-burn', 'hard-light', 'screen', 'luminosity', 'normal'];

const EFFECT_SUBCATEGORIES = [
  {
    id: 'lighting', label: 'Lighting', icon: '💡',
    filters: [
      { id: 'morning',     label: 'Soft Gold',       swatch: '#fde68a' },
      { id: 'daytime',     label: 'Neutral',         swatch: '#cbd5e1' },
      { id: 'evening',     label: 'Bold Amber',      swatch: '#c8702f' },
      { id: 'night',       label: 'Deep Indigo',     swatch: '#1e3a8a' },
      { id: 'moonlight',   label: 'Pale Blue',       swatch: '#93c5fd' },
      { id: 'rainy',       label: 'Muted Slate',     swatch: '#64748b' },
      { id: 'storm',       label: 'Dark Charcoal',   swatch: '#1e293b' },
      { id: 'horror',      label: 'Deep Crimson',    swatch: '#4c0519' },
      { id: 'dream',       label: 'Hazy Lilac',      swatch: '#e9d5ff' },
      { id: 'goldenHour',  label: 'Warm Amber',      swatch: '#fb923c' },
      { id: 'underwater',  label: 'Deep Teal',       swatch: '#0e7490' },
      { id: 'magicalGlow', label: 'Violet Glow',     swatch: '#a78bfa' },
      { id: 'neon',        label: 'Vivid Magenta',   swatch: '#e879f9' },
      { id: 'crimsonNoir', label: 'Crimson Noir',    swatch: '#8b0000' },
      { id: 'periwinkle',  label: 'Periwinkle Blue', swatch: '#5b6c9e' },
      { id: 'forestGreen', label: 'Forest Green',    swatch: '#4a8f4f' },
      { id: 'brightCyan',  label: 'Bright Cyan',     swatch: '#1b97a1' },
    ],
  },
  { id: 'weather', label: 'Weather', icon: '🌦️' },
  {
    id: 'mood', label: 'Mood', icon: '🎨',
    modes: [
      { id: 'warm',      label: 'Warm',        swatch: 'linear-gradient(135deg,#fb923c,#fde68a)', css: 'sepia(0.25) saturate(1.5) brightness(1.05) hue-rotate(-10deg)' },
      { id: 'cool',      label: 'Cool',        swatch: 'linear-gradient(135deg,#93c5fd,#a5f3fc)', css: 'hue-rotate(195deg) saturate(0.85) brightness(1.0)' },
      { id: 'golden',    label: 'Golden',      swatch: 'linear-gradient(135deg,#f59e0b,#fcd34d)', css: 'sepia(0.45) saturate(1.6) brightness(1.1) hue-rotate(-15deg)' },
      { id: 'vintage',   label: 'Vintage',     swatch: 'linear-gradient(135deg,#a78a60,#d4b896)', css: 'sepia(0.55) contrast(0.85) brightness(0.9) saturate(0.7)' },
      { id: 'noir',      label: 'Noir',        swatch: 'linear-gradient(135deg,#111,#555)',        css: 'grayscale(1) contrast(1.2) brightness(0.9)' },
      { id: 'vivid',     label: 'Vivid',       swatch: 'linear-gradient(135deg,#f43f5e,#8b5cf6)', css: 'saturate(2.0) contrast(1.1)' },
      { id: 'faded',     label: 'Faded',       swatch: 'linear-gradient(135deg,#d1d5db,#e5e7eb)', css: 'saturate(0.45) brightness(1.15) contrast(0.75)' },
      { id: 'dramatic',  label: 'Dramatic',    swatch: 'linear-gradient(135deg,#1e293b,#475569)', css: 'contrast(1.5) brightness(0.82) saturate(1.3)' },
      { id: 'dreamy',    label: 'Dreamy',      swatch: 'linear-gradient(135deg,#e9d5ff,#fbcfe8)', css: 'brightness(1.1) saturate(1.35) blur(0.6px) hue-rotate(15deg)' },
      { id: 'cyberpunk', label: 'Cyberpunk',   swatch: 'linear-gradient(135deg,#a21caf,#06b6d4)', css: 'hue-rotate(265deg) saturate(2.2) contrast(1.2) brightness(0.95)' },
      { id: 'horror',    label: 'Horror',      swatch: 'linear-gradient(135deg,#450a0a,#7f1d1d)', css: 'hue-rotate(345deg) saturate(0.6) contrast(1.45) brightness(0.65)' },
    ],
  },
];

const LAYOUT_CANVAS = {
  single: { cols: 1, pw: 600, ph: 338 },
  '2h':   { cols: 2, pw: 296, ph: 338 },
  '2v':   { cols: 1, pw: 600, ph: 165 },
  '4':    { cols: 2, pw: 296, ph: 165 },
};

// True when a panel has no background and no placed items — used to keep the page-strip
// thumbnail on the themed LayoutThumb placeholder instead of the real (white-canvas) render,
// which looks like a plain white box against the dark-mode strip for a genuinely blank page.
const EMPTY_ARRAY_KEYS = ['characters', 'faces', 'characterPresets', 'props', 'effects', 'costumes', 'sounds', 'speechBubbles', 'narrationBoxes', 'bubbles'];
function isPanelEmpty(data) {
  if (!data) return true;
  if (data.background) return false;
  return EMPTY_ARRAY_KEYS.every((k) => !data[k] || data[k].length === 0);
}

function LayoutThumb({ layout, active, empty, mildLines = true }) {
  const previews = {
    single: [[1]],
    '2h':   [[0.5, 0.5]],
    '2v':   [[1], [1]],
    '4':    [[0.5, 0.5], [0.5, 0.5]],
  };
  const rows = previews[layout] || [[1]];
  const W = 42, H = 30;
  const lineColor = active ? '#F97316' : (mildLines ? 'rgba(249,115,22,0.4)' : 'var(--t-border)');
  return (
    <>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* Outer frame — always drawn, so a single-panel preview stays visible even when its
            fill matches the surrounding button/tile background (both currently var(--t-bg3)). */}
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="var(--t-bg3)"
          stroke={lineColor} strokeWidth={1} />
        {/* Internal dividers only — plain <line>s on the shared internal edges, not full
            rects, so their stroke doesn't double up with the outer frame's stroke on edges
            that coincide (which made those edges look darker than Single's single stroke). */}
        {rows.length > 1 && (
          <line x1={0} y1={H / 2} x2={W} y2={H / 2}
            stroke={lineColor} strokeWidth={1} />
        )}
        {rows[0]?.length > 1 && (
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke={lineColor} strokeWidth={1} />
        )}
      </svg>
      {/* Empty-page hint — same icon-badge + language as the panel's own "Add a Background"
          empty state, so an unstarted page reads the same way here. */}
      {empty && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 7,
            background: 'var(--t-bg2)', border: '1px solid var(--t-text-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t-text-faint)"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
        </div>
      )}
    </>
  );
}

// Renders a page's real content (background/characters/bubbles) via the same offscreen
// canvas pipeline used for PNG/PDF export (comicRenderer.js), then crops/downscales it onto
// a small canvas sized for the page-strip tile — cropped to fill (like CSS `object-fit:
// cover`) rather than letterboxed, so it matches how the <img> tile displays it with no
// white bars. Storing a full-res export-quality canvas per tile would also be wasteful.
const THUMB_W = 160, THUMB_H = 130;
async function renderPageThumb(panels, layout) {
  const full = await renderPage(panels, layout);
  const small = document.createElement('canvas');
  small.width = THUMB_W; small.height = THUMB_H;
  const ctx = small.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.max(THUMB_W / full.width, THUMB_H / full.height);
  const dw = full.width * scale, dh = full.height * scale;
  ctx.drawImage(full, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
  return small.toDataURL('image/png');
}

// BODY_POSE thumbnail — used by both the Outfit and Pose character tools. BODY_POSE
// assets are stored with neon (magenta/cyan) skin placeholders (see Palette Normalizer),
// so the raw file looks like a clown by default. Recolor to the default "fair" tone just
// for this preview; the real placement keeps whatever skin tone is actually set once swapped in.
function BodyPoseThumb({ asset, active, onClick }) {
  const [src, setSrc] = useState(asset.filePath);
  useEffect(() => {
    let isActive = true;
    setSrc(asset.filePath);
    recolorSkin(asset.filePath, 'fair').then((url) => { if (isActive) setSrc(url); }).catch(() => {});
    return () => { isActive = false; };
  }, [asset.filePath]);
  return (
    <button title={asset.costume || asset.name} onClick={onClick}
      style={{ ...styles.faceLibThumb, ...(active ? { borderColor: '#8B5CF6', borderWidth: 2 } : {}) }}>
      <img src={src} alt={asset.costume || asset.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
    </button>
  );
}

// Reliable costume identity for a BODY_POSE asset, shared by the Outfit and Pose
// character tools. Prefers the (trimmed/lowercased) `costume` text field when set, but
// falls back to the name's "C<n>" prefix (stripping a trailing "P<n>" pose suffix, e.g.
// "C1P2" -> "C1") for any asset uploaded without that field filled in, since that's how
// these are actually authored and stays consistent across that costume's pose variants.
function costumeKeyOf(bp) {
  return (bp.costume && bp.costume.trim())
    ? bp.costume.trim().toLowerCase()
    : bp.name.replace(/P\d+$/i, '').trim().toLowerCase();
}

// Numeric pose index from a poseType like "P1"/"P12" — used to sort pose options in
// natural order (P2 before P10), not lexical string order.
function poseNumOf(bp) {
  return parseInt((bp.poseType || '').replace(/^P/i, ''), 10) || 0;
}

function AddPagePicker({ onPick, onClose }) {
  const options = [
    { id: 'single', label: 'Single' },
    { id: '2h',     label: '2 Side by Side' },
    { id: '2v',     label: '2 Stacked' },
    { id: '4',      label: '4 Grid' },
  ];
  return (
    <div style={styles.addPicker}>
      <p style={styles.addPickerTitle}>Choose layout for new page</p>
      <div style={styles.addPickerGrid}>
        {options.map((o) => (
          <button key={o.id} style={styles.addPickerBtn} onClick={() => { onPick(o.id); onClose(); }}>
            <LayoutThumb layout={o.id} />
            <span style={styles.addPickerLabel}>{o.label}</span>
          </button>
        ))}
      </div>
      <button style={styles.addPickerClose} onClick={onClose}>Cancel</button>
    </div>
  );
}

function ChangeLayoutPicker({ current, onPick, onClose }) {
  const options = [
    { id: 'single', label: 'Single' },
    { id: '2h',     label: '2 Side by Side' },
    { id: '2v',     label: '2 Stacked' },
    { id: '4',      label: '4 Grid' },
  ];
  return (
    <div style={styles.addPicker}>
      <p style={styles.addPickerTitle}>Change page layout</p>
      <div style={styles.addPickerGrid}>
        {options.map((o) => (
          <button
            key={o.id}
            style={{ ...styles.addPickerBtn, ...(o.id === current ? { border: '1.5px solid var(--t-accent)', background: 'var(--t-accent-light)' } : {}) }}
            onClick={() => { onPick(o.id); onClose(); }}
          >
            <LayoutThumb layout={o.id} active={o.id === current} />
            <span style={styles.addPickerLabel}>{o.label}</span>
          </button>
        ))}
      </div>
      <button style={styles.addPickerClose} onClick={onClose}>Cancel</button>
    </div>
  );
}

export default function ComicEditor({ readOnly = false, aiEnabled = true } = {}) {
  const { state, dispatch, activePage, activePagePanels, pageStart } = useComic();
  const [activeSidebar, setActiveSidebar] = useState('BACKGROUND');
  const [effectSub, setEffectSub] = useState(null);
  // Background subcategory browsing: null = folder picker; a slug = inside that folder.
  const [bgSub, setBgSub] = useState(null);
  const [bgSubcats, setBgSubcats] = useState([]);
  // Hover tooltip for the label-less sidebar tool icons — fixed-positioned so the
  // scrolling icon rail never clips it. { label, top, left } | null.
  const [iconTip, setIconTip] = useState(null);
  // Which rail icon is currently hovered — lifts it upward, same motion as hovering an
  // asset card (AssetCard.jsx's translateY(-3px) lift).
  const [hoveredIcon, setHoveredIcon] = useState(null);
  // The tool rail scrolls internally (scrollbar hidden); the ▲/▼ page arrows drive it.
  const railScrollRef = useRef(null);
  const scrollRail = (dir) => {
    const el = railScrollRef.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior: 'smooth' });
  };
  // Background subcategory chip row scrolls horizontally; the ‹ › arrows drive it.
  // Each click advances by exactly the row's own visible width — chips are sized via
  // flex-basis to fit exactly 3 per view (see styles.bgChip), so one clientWidth-worth
  // of scroll always pages precisely 3 buttons, regardless of panel width/breakpoint.
  const bgChipScrollRef = useRef(null);
  const scrollBgChips = (dir) => {
    const el = bgChipScrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };
  const [search, setSearch] = useState('');
  const [faceParts, setFaceParts] = useState([]);
  const [faceSection, setFaceSection] = useState('hairstyle');
  const [dressParts, setDressParts] = useState([]);
  const [dressPartTab, setDressPartTab] = useState('cloth');
  // "Characters" landing picker: pick a CharacterPreset, then a BODY_POSE to place it on.
  const [characterPresets, setCharacterPresets] = useState([]);
  const [bodyPoses, setBodyPoses] = useState([]);
  const [savedExpressions, setSavedExpressions] = useState([]);
  const [pendingPreset, setPendingPreset] = useState(null);
  const [expressionTab, setExpressionTab] = useState('eye');
  const [faceAlignments, setFaceAlignments] = useState({});
  const [characterMenu, setCharacterMenu] = useState(null);
  const [characterVariants, setCharacterVariants] = useState([]);
  const [insertPickerAt, setInsertPickerAt] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [hoverGap, setHoverGap] = useState(null);
  const [thumbHover, setThumbHover] = useState(null);
  const [thumbMenu, setThumbMenu] = useState(null); // page index whose ⋮ menu is open
  const [changeLayoutFor, setChangeLayoutFor] = useState(null); // page index for layout picker
  const [zoom, setZoom] = useState(125);
  const [zoomSliderOpen, setZoomSliderOpen] = useState(false);
  const [zoomDragging, setZoomDragging] = useState(false);
  const [showOpacityPop, setShowOpacityPop] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageThumbs, setPageThumbs] = useState({}); // { [pageId]: dataUrl } — real rendered page-strip previews
  const thumbScrollRef = useRef(null);
  const canvasAreaRef = useRef(null);
  const panState = useRef(null); // { x, y, scrollLeft, scrollTop }

  const ZOOM_MIN = 50, ZOOM_MAX = 140;

  // Close thumb menu on outside click
  useEffect(() => {
    if (thumbMenu === null) return;
    const close = () => setThumbMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [thumbMenu]);

  // Close opacity popup on outside click
  useEffect(() => {
    if (!showOpacityPop) return;
    const close = () => setShowOpacityPop(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showOpacityPop]);

  // Auto-scroll page strip to end when a new page is added
  useEffect(() => {
    if (thumbScrollRef.current) {
      thumbScrollRef.current.scrollLeft = thumbScrollRef.current.scrollWidth;
    }
  }, [state.pages.length]);

  // Keep the active page's tile scrolled into view — e.g. arrow-key navigation can jump to
  // a page whose tile is currently scrolled out of the strip's visible area.
  useEffect(() => {
    const container = thumbScrollRef.current;
    if (!container) return;
    const activeTile = container.querySelector(`[data-page-idx="${state.activePageIndex}"]`);
    if (activeTile) activeTile.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [state.activePageIndex]);

  // Live page-strip thumbnail for the active page — re-renders (debounced) whenever its
  // content changes, so the strip shows the real background/characters instead of a stale icon.
  useEffect(() => {
    const page = state.pages[state.activePageIndex];
    if (!page) return;
    const timer = setTimeout(() => {
      const start = pageStartIndex(state.pages, state.activePageIndex);
      const panels = state.panels.slice(start, start + (LAYOUT_COUNT[page.layout] || 1));
      renderPageThumb(panels, page.layout).then((url) => {
        setPageThumbs((prev) => ({ ...prev, [page.id]: url }));
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [state.panels, state.activePageIndex, state.pages]);

  // Lazily fill in thumbnails for every other page (new pages, or on first mount) — one at a
  // time so we don't burst-fire a pile of concurrent image/network loads via renderPage().
  useEffect(() => {
    let cancelled = false;
    const missing = state.pages.filter((p) => !(p.id in pageThumbs));
    if (missing.length === 0) return;
    (async () => {
      for (const page of missing) {
        if (cancelled) return;
        const idx = state.pages.findIndex((p) => p.id === page.id);
        const start = pageStartIndex(state.pages, idx);
        const panels = state.panels.slice(start, start + (LAYOUT_COUNT[page.layout] || 1));
        try {
          const url = await renderPageThumb(panels, page.layout);
          if (!cancelled) setPageThumbs((prev) => ({ ...prev, [page.id]: url }));
        } catch { /* leave LayoutThumb fallback in place */ }
      }
    })();
    return () => { cancelled = true; };
  }, [state.pages]);

  // Canvas drag-to-pan
  useEffect(() => {
    const onMove = (e) => {
      if (!panState.current) return;
      const el = canvasAreaRef.current;
      if (!el) return;
      el.scrollLeft = panState.current.scrollLeft - (e.clientX - panState.current.x);
      el.scrollTop  = panState.current.scrollTop  - (e.clientY - panState.current.y);
    };
    const onUp = () => { panState.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Block the browser's native pinch-to-zoom/Ctrl+scroll page zoom while inside the
  // canvas — trackpad pinch gestures arrive as wheel events with ctrlKey:true, and a
  // React onWheel handler isn't reliably able to preventDefault() them (some browsers
  // treat it as passive), so the whole page would zoom in addition to (or instead of)
  // the per-character scale handled by each item's own onWheel below. Registered as a
  // real non-passive listener specifically to make preventDefault() actually take effect.
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const blockPageZoom = (e) => { if (e.ctrlKey) e.preventDefault(); };
    el.addEventListener('wheel', blockPageZoom, { passive: false });
    return () => el.removeEventListener('wheel', blockPageZoom);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsFullscreen(false);
      if (e.key === 'ArrowRight')
        dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex: Math.min(state.pages.length - 1, state.activePageIndex + 1) });
      if (e.key === 'ArrowLeft')
        dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex: Math.max(0, state.activePageIndex - 1) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, state.activePageIndex, state.pages.length]);

  // Arrow keys — navigate pages in edit mode (not fullscreen, not typing, no item selected)
  useEffect(() => {
    if (isFullscreen) return;
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (state.activeSelection) return;
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const newPage = Math.max(0, Math.min(state.pages.length - 1, state.activePageIndex + delta));
      if (newPage === state.activePageIndex) return;
      dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex: newPage });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, state.activePageIndex, state.pages.length, state.activeSelection, dispatch]);

  // Delete key — remove active page when no item is selected and not typing
  useEffect(() => {
    if (isFullscreen) return;
    const onKey = (e) => {
      if (e.key !== 'Delete') return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (state.activeSelection) return; // let Panel handle item deletion
      e.preventDefault();
      dispatch({ type: 'REMOVE_PAGE', pageIndex: state.activePageIndex });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, state.activePageIndex, state.activeSelection, dispatch]);

  // P key — toggle fullscreen (ignored when typing in inputs)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'p' && e.key !== 'P') return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      setIsFullscreen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activePanelIndex = state.activePanelIndex;
  const canvas = LAYOUT_CANVAS[activePage?.layout] || LAYOUT_CANVAS.single;

  // Currently-selected FACE element in the panel (if any)
  const selectedFace = state.activeSelection?.kind === 'FACE'
    ? (state.panels[state.activeSelection.panelIndex]?.data?.faces || []).find((f) => f.instanceId === state.activeSelection.instanceId)
    : null;

  // Currently-selected CHARACTER element in the panel (if any)
  const selectedCharacter = state.activeSelection?.kind === 'CHARACTER'
    ? (state.panels[state.activeSelection.panelIndex]?.data?.characters || []).find((c) => c.instanceId === state.activeSelection.instanceId)
    : null;

  // True when the selected character is a DressRig (has live-swappable parts)
  const selectedDressCharacter = selectedCharacter?.dressMode ? selectedCharacter : null;

  // Currently-selected CHARACTER_PRESET placement (if any) + the preset record it references
  const selectedCharacterPreset = state.activeSelection?.kind === 'CHARACTER_PRESET'
    ? (state.panels[state.activeSelection.panelIndex]?.data?.characterPresets || []).find((c) => c.instanceId === state.activeSelection.instanceId)
    : null;
  const selectedCharacterPresetBase = selectedCharacterPreset
    ? characterPresets.find((p) => p.id === selectedCharacterPreset.presetId)
    : null;

  // Currently-active customization tool (Outfit/Pose/.../Skin Color/Hair Color)
  const selectedCharacterTool = [...CHARACTER_DIMENSIONS, CHARACTER_SKIN_TOOL, CHARACTER_EYE_TOOL, ...CHARACTER_COLOR_TOOLS].find((t) => t.id === characterMenu) || null;

  // Load the FACE_PART library once, when the Face tool or Hairstyle character menu is opened
  useEffect(() => {
    const needFaceParts = activeSidebar === 'FACE' || (activeSidebar === 'CHARACTER' && (characterMenu === 'hairstyle' || characterMenu === 'expression' || characterMenu === 'face'));
    if (needFaceParts && faceParts.length === 0) {
      getAssets({ category: 'FACE_PART' }).then(setFaceParts).catch(() => setFaceParts([]));
    }
  }, [activeSidebar, characterMenu, faceParts.length]);

  // Load DRESS_PART library when a DressRig character is selected
  useEffect(() => {
    if (selectedDressCharacter && dressParts.length === 0) {
      getAssets({ category: 'DRESS_PART' }).then(setDressParts).catch(() => setDressParts([]));
    }
  }, [selectedDressCharacter?.instanceId, dressParts.length]);

  // Load Character Presets for the "Characters" landing picker, and Body Poses for either
  // that picker or to know the active placement's own pose view (needed to filter
  // hairstyle options to the matching Front/3-4 view below).
  useEffect(() => {
    if (activeSidebar !== 'CHARACTER') return;
    if (!characterMenu && characterPresets.length === 0) fetchCharacterPresets().then(setCharacterPresets).catch(() => setCharacterPresets([]));
    if (bodyPoses.length === 0) getAssets({ category: 'BODY_POSE' }).then(setBodyPoses).catch(() => setBodyPoses([]));
    if (savedExpressions.length === 0) getExpressions().then(setSavedExpressions).catch(() => setSavedExpressions([]));
  }, [activeSidebar, characterMenu, characterPresets.length, bodyPoses.length, savedExpressions.length]);

  // Shared by both the "pick a pose" picker and the default-body-pose fast path below —
  // takes the preset explicitly rather than reading `pendingPreset` state, since the fast
  // path places the character in the same click that would otherwise have just set
  // `pendingPreset` (that state update wouldn't be visible yet this synchronously).
  const placeCharacterPreset = (preset, bodyPoseId) => {
    const instanceId = genId();
    dispatch({ type: 'ADD_CHARACTER_PRESET_TO_PANEL', panelIndex: activePanelIndex, presetId: preset.id, bodyPoseId, name: preset.name, instanceId });
    dispatch({ type: 'SELECT_ITEM_IN_PANEL', kind: 'CHARACTER_PRESET', instanceId, panelIndex: activePanelIndex });
    setPendingPreset(null);
  };

  const handlePickBodyPose = (pose) => {
    if (!pendingPreset) return;
    placeCharacterPreset(pendingPreset, pose.id);
  };

  // Clicking a character preset normally opens the "pick a pose" picker. If the preset
  // has a default costume+pose set (Character Preset Builder), skip straight to placing
  // it with that default instead of asking every time — still fully changeable afterward
  // via the Outfit/Pose character tools, same as any other placement.
  const handlePickPreset = (preset) => {
    if (preset.defaultBodyPoseId) placeCharacterPreset(preset, preset.defaultBodyPoseId);
    else setPendingPreset(preset);
  };

  const handleSetPresetSkinTone = (skinTone) => {
    if (!selectedCharacterPreset) return;
    dispatch({
      type: 'UPDATE_CHARACTER_PRESET',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacterPreset.instanceId,
      updates: { skinTone },
    });
  };

  const handleSetPresetHairColor = (hairColor) => {
    if (!selectedCharacterPreset) return;
    dispatch({
      type: 'UPDATE_CHARACTER_PRESET',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacterPreset.instanceId,
      updates: { hairColor },
    });
  };

  const handleSetPresetIrisColor = (irisColor) => {
    if (!selectedCharacterPreset) return;
    dispatch({
      type: 'UPDATE_CHARACTER_PRESET',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacterPreset.instanceId,
      updates: { irisColor },
    });
  };

  const handleSetPresetHairstyleAsset = (hairstyleAssetId) => {
    if (!selectedCharacterPreset) return;
    dispatch({
      type: 'UPDATE_CHARACTER_PRESET',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacterPreset.instanceId,
      updates: { hairstyleAssetId },
    });
  };

  const handleSetPresetExpression = (expressionId) => {
    if (!selectedCharacterPreset) return;
    dispatch({
      type: 'UPDATE_CHARACTER_PRESET',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacterPreset.instanceId,
      updates: { expressionId },
    });
  };

  // Used by both the Outfit tool (swap costume, keep pose) and the Pose tool (swap pose,
  // keep costume) — both just point the placement at a different BODY_POSE asset id.
  const handleSetPresetBodyPose = (bodyPoseId) => {
    if (!selectedCharacterPreset) return;
    dispatch({
      type: 'UPDATE_CHARACTER_PRESET',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacterPreset.instanceId,
      updates: { bodyPoseId },
    });
  };

  // Which face (front/3-4) the active placement's body pose actually resolves to — same
  // priority CharacterPresetRig uses (pose's own view first, then the preset's explicit
  // defaultFaceView, then whichever face exists) — needed to know which face's saved
  // hairstyle alignments are relevant, since hairstyle placement is calibrated per-face.
  const selectedPresetPose = selectedCharacterPreset ? bodyPoses.find((bp) => bp.id === selectedCharacterPreset.bodyPoseId) : null;
  const resolvedPresetFaceId = selectedCharacterPresetBase ? (
    (selectedPresetPose?.view === 'THREE_QUARTER' && selectedCharacterPresetBase.threeQuarterFaceId) ? selectedCharacterPresetBase.threeQuarterFaceId
    : (selectedPresetPose?.view === 'FRONT' && selectedCharacterPresetBase.frontFaceId) ? selectedCharacterPresetBase.frontFaceId
    : (selectedCharacterPresetBase.defaultFaceView === 'THREE_QUARTER' && selectedCharacterPresetBase.threeQuarterFaceId) ? selectedCharacterPresetBase.threeQuarterFaceId
    : (selectedCharacterPresetBase.defaultFaceView === 'FRONT' && selectedCharacterPresetBase.frontFaceId) ? selectedCharacterPresetBase.frontFaceId
    : (selectedCharacterPresetBase.frontFaceId || selectedCharacterPresetBase.threeQuarterFaceId)
  ) : null;

  // Which view (Front/3-4) the resolved face above actually is — needed to keep eye/mouth
  // art (which itself comes in front/3-4 variants, e.g. "Eye5" tagged THREE_QUARTER) from
  // being placed onto the wrong-view face, which reads as the whole face looking "turned"
  // even though the body pose itself is front-on.
  const resolvedFaceView = selectedCharacterPresetBase ? (
    resolvedPresetFaceId === selectedCharacterPresetBase.threeQuarterFaceId ? 'THREE_QUARTER'
    : resolvedPresetFaceId === selectedCharacterPresetBase.frontFaceId ? 'FRONT'
    : null
  ) : null;

  // Hairstyle is calibrated per-asset (not shared across every hairstyle, unlike eye/
  // mouth), so only hairstyles with a saved Face Builder alignment for this exact face are
  // offered — picking an uncalibrated one would have nowhere reliable to place it.
  const [presetHairAlignedIds, setPresetHairAlignedIds] = useState(new Set());
  useEffect(() => {
    if (characterMenu !== 'hairstyle' || !selectedCharacterPreset || !resolvedPresetFaceId) { setPresetHairAlignedIds(new Set()); return; }
    getFacePartAlignmentsPublic(resolvedPresetFaceId)
      .then((aligns) => setPresetHairAlignedIds(new Set(aligns.filter((a) => a.partType === 'hairstyle').map((a) => a.partAssetId))))
      .catch(() => setPresetHairAlignedIds(new Set()));
  }, [characterMenu, selectedCharacterPreset?.instanceId, resolvedPresetFaceId]);

  // Reset the character customization sub-menu when it's no longer relevant
  useEffect(() => {
    if (!selectedCharacter) setCharacterMenu(null);
  }, [selectedCharacter?.instanceId]);

  // Fetch variant assets for the active Outfit/Pose/Expression/Hairstyle picker
  useEffect(() => {
    const dim = CHARACTER_DIMENSIONS.find((d) => d.id === characterMenu);
    if (!dim || !selectedCharacter) { setCharacterVariants([]); return; }
    const familyTag = (selectedCharacter.tags || []).find((t) => t.startsWith('character:'));
    getAssets({ category: 'CHARACTER', tags: familyTag || undefined })
      .then((all) => setCharacterVariants(all.filter((a) => (a.tags || []).some((t) => t.startsWith(dim.tagPrefix)))))
      .catch(() => setCharacterVariants([]));
  }, [characterMenu, selectedCharacter?.instanceId, selectedCharacter?.tags]);

  const handlePickCharacterVariant = (asset) => {
    if (!selectedCharacter) return;
    dispatch({
      type: 'UPDATE_CHARACTER',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacter.instanceId,
      updates: { assetId: asset.id, filePath: asset.filePath, name: asset.name, tags: asset.tags || [] },
    });
  };

  const handlePickSkinPreset = (presetId) => {
    if (!selectedCharacter) return;
    dispatch({
      type: 'UPDATE_CHARACTER',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacter.instanceId,
      updates: { skinPreset: selectedCharacter.skinPreset === presetId ? null : presetId },
    });
  };

  const updateCharacterOverlay = (overlayKey, defaultColor, patch) => {
    if (!selectedCharacter) return;
    const current = selectedCharacter[overlayKey] || { color: defaultColor, blendMode: 'multiply', opacity: 50 };
    dispatch({
      type: 'UPDATE_CHARACTER',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacter.instanceId,
      updates: { [overlayKey]: { ...current, ...patch } },
    });
  };

  const removeCharacterOverlay = (overlayKey) => {
    if (!selectedCharacter) return;
    dispatch({
      type: 'UPDATE_CHARACTER',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedCharacter.instanceId,
      updates: { [overlayKey]: null },
    });
  };

  // Opacity helpers — read from selected item or background
  const getSelOpacity = () => {
    if (state.activeSelection) {
      const { kind, instanceId, panelIndex: pi } = state.activeSelection;
      const panel = state.panels[pi];
      if (!panel) return 1;
      if (kind === 'CHARACTER') return panel.data?.characters?.find((c) => c.instanceId === instanceId)?.opacity ?? 1;
      if (kind === 'PLACED_BUBBLE') return panel.data?.bubbles?.find((b) => b.instanceId === instanceId)?.opacity ?? 1;
      const kindKey = kind.toLowerCase() + 's';
      return (panel.data?.[kindKey] || []).find((i) => i.instanceId === instanceId)?.opacity ?? 1;
    }
    const panel = state.panels[activePanelIndex];
    return panel?.data?.background?.opacity ?? 1;
  };
  const handleOpacity = (val) => {
    const opacity = val / 100;
    if (state.activeSelection) {
      const { kind, instanceId, panelIndex: pi } = state.activeSelection;
      if (kind === 'CHARACTER') dispatch({ type: 'UPDATE_CHARACTER', preview: true, panelIndex: pi, instanceId, updates: { opacity } });
      else if (kind === 'PLACED_BUBBLE') dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex: pi, instanceId, updates: { opacity } });
      else if (kind !== 'NARRATION') dispatch({ type: 'UPDATE_PLACED_ITEM', preview: true, panelIndex: pi, instanceId, kind: kind.toLowerCase() + 's', updates: { opacity } });
    } else {
      const panel = state.panels[activePanelIndex];
      if (panel?.data?.background) dispatch({ type: 'SET_BACKGROUND', panelIndex: activePanelIndex, background: { ...panel.data.background, opacity } });
    }
  };
  const selOpacity = Math.round(getSelOpacity() * 100);

  const toggleSidebar = (id) => {
    setActiveSidebar((prev) => (prev === id ? null : id));
    setSearch('');
    setEffectSub(null);
    setBgSub(null);
  };

  const handleSidebarBack = () => {
    if (activeSidebar === 'EFFECT' && effectSub) {
      setEffectSub(null);
      setSearch('');
    } else if (activeSidebar === 'BACKGROUND' && bgSub) {
      setBgSub(null);
      setSearch('');
    } else {
      setActiveSidebar(null);
    }
  };

  // Background subcategory folders (shown when the Backgrounds panel is open).
  // Defaults to whichever folder is first (admin-controlled sortOrder) so images load
  // immediately instead of an empty picker. Runs every time the panel opens (not just
  // once) — toggleSidebar resets bgSub to null on each open, so the default has to be
  // re-applied each time too, not just when bgSubcats is still empty.
  useEffect(() => {
    if (activeSidebar !== 'BACKGROUND') return;
    if (bgSubcats.length === 0) {
      getBackgroundSubcategories().then((cats) => {
        setBgSubcats(cats);
        if (cats[0]) setBgSub((cur) => cur ?? cats[0].slug);
      }).catch(() => {});
    } else {
      if (bgSubcats[0]) setBgSub((cur) => cur ?? bgSubcats[0].slug);
    }
  }, [activeSidebar, bgSubcats]);

  const activePanelLightingOverlay = state.panels[activePanelIndex]?.data?.lightingOverlay || null;
  const toggleLightingOverlay = (id) => {
    dispatch({
      type: 'SET_LIGHTING_OVERLAY',
      panelIndex: activePanelIndex,
      overlay: activePanelLightingOverlay === id ? null : id,
    });
  };

  const activePanelBgMode = state.panels[activePanelIndex]?.data?.backgroundMode || null;
  const toggleBgMode = (id) => {
    dispatch({
      type: 'SET_BACKGROUND_MODE',
      panelIndex: activePanelIndex,
      mode: activePanelBgMode === id ? null : id,
    });
  };

  const handleAssetSelect = (asset) => {
    if (activeSidebar === 'CHARACTER') {
      if (asset.category === 'DRESS' && asset.layoutPath) {
        dispatch({ type: 'ADD_DRESS_TO_PANEL', panelIndex: activePanelIndex, asset });
      } else {
        dispatch({ type: 'ADD_CHARACTER_TO_PANEL', panelIndex: activePanelIndex, asset });
      }
    } else if (activeSidebar === 'FACE') {
      handleFaceAssetSelect(asset);
    } else if (activeSidebar === 'BACKGROUND') {
      dispatch({ type: 'SET_BACKGROUND', panelIndex: activePanelIndex, background: { assetId: asset.id, filePath: asset.filePath } });
    } else if (activeSidebar === 'SPEECH_BUBBLE') {
      dispatch({ type: 'ADD_PANEL_BUBBLE', panelIndex: activePanelIndex, asset });
    } else if (['PROP', 'EFFECT', 'COSTUME', 'SOUND'].includes(activeSidebar)) {
      dispatch({ type: 'ADD_PROP_TO_PANEL', panelIndex: activePanelIndex, asset, kind: activeSidebar.toLowerCase() + 's' });
    }
  };

  // Add a Face preset: parse its assembled layout into a face-shape + 4 swappable parts
  const handleFaceAssetSelect = async (asset) => {
    let layout = null;
    if (asset.layoutPath) {
      try {
        layout = await fetch(asset.layoutPath).then((r) => r.json());
        layout = await resolveLayoutFilePaths(layout);
      } catch { /* fall back below */ }
    }
    const { faceShape, parts } = buildFaceFromLayout(layout, asset);
    const instanceId = genId();
    dispatch({ type: 'ADD_FACE_TO_PANEL', panelIndex: activePanelIndex, asset, faceShape, parts, instanceId });
    dispatch({ type: 'SELECT_ITEM_IN_PANEL', kind: 'FACE', instanceId, panelIndex: activePanelIndex });
  };

  // Swap a hair/eye/nose/mouth part on the selected face, applying its calibrated alignment
  const handleFacePartSelect = async (asset) => {
    if (!selectedFace) return;
    const partType = faceSection;
    let aligns = faceAlignments[selectedFace.faceAssetId];
    if (!aligns) {
      try { aligns = await getFacePartAlignmentsPublic(selectedFace.faceAssetId); } catch { aligns = []; }
      setFaceAlignments((prev) => ({ ...prev, [selectedFace.faceAssetId]: aligns }));
    }
    const partAssetId = partType === 'hairstyle' ? asset.id : '__ALL__';
    const match = aligns.find((a) => a.partType === partType && a.partAssetId === partAssetId);
    const current = selectedFace.parts?.[partType];
    let part;
    if (match) {
      part = { assetId: asset.id, filePath: asset.filePath, x: match.x, y: match.y, w: match.w, h: match.h, rotation: match.rotation, flipX: match.flipX, flipY: match.flipY };
    } else if (current) {
      part = { assetId: asset.id, filePath: asset.filePath, x: current.x, y: current.y, w: current.w, h: current.h, rotation: current.rotation, flipX: current.flipX, flipY: current.flipY };
    } else {
      part = defaultPartOverlay(asset.id, asset.filePath);
    }
    dispatch({ type: 'SET_FACE_PART', panelIndex: state.activeSelection.panelIndex, instanceId: selectedFace.instanceId, partType, part });
  };

  // Swap a cloth/neck/hands/hairstyle part on the selected DressRig character.
  const handleSwapDressPart = (partType, asset) => {
    if (!selectedDressCharacter) return;
    dispatch({
      type: 'SET_DRESS_PART',
      panelIndex: state.activeSelection.panelIndex,
      instanceId: selectedDressCharacter.instanceId,
      partType,
      part: { assetId: asset.id, filePath: asset.filePath, name: asset.name },
    });
  };

  // Swap hairstyle on the selected face using saved (face, hair) alignment metadata.
  const handleSwapHairstyle = async (asset) => {
    if (!selectedFace) return;
    let aligns = faceAlignments[selectedFace.faceAssetId];
    if (!aligns) {
      try { aligns = await getFacePartAlignmentsPublic(selectedFace.faceAssetId); } catch { aligns = []; }
      setFaceAlignments((prev) => ({ ...prev, [selectedFace.faceAssetId]: aligns }));
    }
    const match = aligns.find((a) => a.partType === 'hairstyle' && a.partAssetId === asset.id);
    const current = selectedFace.parts?.hairstyle;
    let part;
    if (match) {
      part = { assetId: asset.id, filePath: asset.filePath, x: match.x, y: match.y, w: match.w, h: match.h, rotation: match.rotation, flipX: match.flipX, flipY: match.flipY };
    } else if (current) {
      part = { ...current, assetId: asset.id, filePath: asset.filePath };
    } else {
      part = defaultPartOverlay(asset.id, asset.filePath);
    }
    dispatch({ type: 'SET_FACE_PART', panelIndex: state.activeSelection.panelIndex, instanceId: selectedFace.instanceId, partType: 'hairstyle', part });
  };

  const activeItem = SIDEBAR_ITEMS.find((i) => i.id === activeSidebar);
  const effectSubMeta = EFFECT_SUBCATEGORIES.find((s) => s.id === effectSub);

  return (
    <div style={styles.root}>

      {/* ── Far-left icon bar ── */}
      <aside style={styles.iconBar}>
        <div ref={railScrollRef} className="bg-chip-scroll" style={styles.railScroll}>
        {activeSidebar === 'CHARACTER' ? (
          <>
            <button
              style={{
                ...styles.iconBtn,
                ...(hoveredIcon === 'back' ? styles.iconBtnHover : {}),
                ...(readOnly ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
              }}
              onClick={readOnly ? undefined : () => { setActiveSidebar(null); setCharacterMenu(null); }}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setIconTip({ label: 'Back', top: r.top + r.height / 2, left: r.right }); setHoveredIcon('back'); }}
              onMouseLeave={() => { setIconTip(null); setHoveredIcon(null); }}
            >
              <span style={styles.iconImg}><IconBack /></span>
            </button>
            {[...CHARACTER_DIMENSIONS, CHARACTER_SKIN_TOOL, CHARACTER_EYE_TOOL, ...CHARACTER_COLOR_TOOLS].map((item) => {
              const Icon = item.Icon || IconColorDrop;
              return (
                <button
                  key={item.id}
                  style={{
                    ...styles.iconBtn,
                    ...(characterMenu === item.id ? styles.iconBtnActive : {}),
                    ...(hoveredIcon === item.id ? styles.iconBtnHover : {}),
                    ...(readOnly ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                  }}
                  onClick={readOnly ? undefined : () => setCharacterMenu((prev) => (prev === item.id ? null : item.id))}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setIconTip({ label: item.label, top: r.top + r.height / 2, left: r.right }); setHoveredIcon(item.id); }}
                  onMouseLeave={() => { setIconTip(null); setHoveredIcon(null); }}
                >
                  {SUBTOOL_ICON[item.id]
                    ? <img src={SUBTOOL_ICON[item.id]} alt={item.label} style={styles.iconImg} />
                    : <span style={styles.iconImg}><Icon /></span>}
                </button>
              );
            })}
          </>
        ) : (
          SIDEBAR_ITEMS.filter((item) => item.id !== 'AI' || aiEnabled).map((item) => {
            const isActive = activeSidebar === item.id;
            return (
              <button
                key={item.id}
                style={{
                  ...styles.iconBtn,
                  ...(isActive ? styles.iconBtnActive : {}),
                  ...(hoveredIcon === item.id ? styles.iconBtnHover : {}),
                  ...(readOnly ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                }}
                onClick={readOnly ? undefined : () => toggleSidebar(item.id)}
                title={readOnly ? 'Editing disabled — subscription expired' : undefined}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setIconTip({ label: item.label, top: r.top + r.height / 2, left: r.right });
                  setHoveredIcon(item.id);
                }}
                onMouseLeave={() => { setIconTip(null); setHoveredIcon(null); }}
              >
                {TOOL_ICON[item.id]
                  ? <img src={TOOL_ICON[item.id]} alt={item.label} style={styles.iconImg} />
                  : <span style={styles.iconImg}><item.Icon /></span>}
              </button>
            );
          })
        )}
        </div>

        {/* Up/down page arrows — flip through the tool rail instead of scrolling it */}
        <div style={styles.railArrows}>
          <button style={styles.railArrowBtn} title="Scroll up" onClick={() => scrollRail(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
          </button>
          <button style={styles.railArrowBtn} title="Scroll down" onClick={() => scrollRail(1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
      </aside>

      {/* Hover tooltip for the label-less sidebar tool icons */}
      {iconTip && (
        <div style={{ ...styles.iconTip, top: iconTip.top, left: iconTip.left + 8 }}>{iconTip.label}</div>
      )}

      {/* ── Expandable panel ── */}
      {activeSidebar && !readOnly && (
        <aside className="editor-expand-panel" style={styles.expandPanel}>
          {/* Header: title + filter icon */}
          <div style={styles.expandHeader}>
            <span style={styles.expandTitle}>
              {activeSidebar === 'CHARACTER' && selectedCharacterTool
                ? selectedCharacterTool.label
                : activeSidebar === 'EFFECT' && effectSub
                  ? EFFECT_SUBCATEGORIES.find((s) => s.id === effectSub)?.label
                  : activeSidebar === 'BACKGROUND' && bgSub
                    ? (bgSubcats.find((s) => s.slug === bgSub)?.label || 'Backgrounds')
                    : activeSidebar === 'LAYOUT'
                      ? 'Layout'
                      : activeSidebar === 'LAYERS'
                        ? 'Layers'
                        : activeSidebar === 'STICKERS'
                          ? 'Stickers'
                          : activeItem?.label}
            </span>
            <button style={styles.headerFilterBtn} title="Back" onClick={handleSidebarBack}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>

          {/* Backgrounds' category slider + "No Background" stay fixed above the scrollable
              asset grid — they used to live inside expandContent and scrolled away with the
              images, which also hid them mid-scroll. */}
          {activeSidebar === 'BACKGROUND' && (
            <div style={styles.expandFixedTop}>
              <div style={styles.bgChipSlider}>
                <button style={styles.bgChipArrowBtn} title="Scroll left" onClick={() => scrollBgChips(-1)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div ref={bgChipScrollRef} className="bg-chip-scroll" style={styles.bgChipRow}>
                  {bgSubcats.map((sc) => (
                    <button
                      key={sc.id}
                      style={sc.slug === bgSub ? { ...styles.bgChip, ...styles.bgChipActive } : styles.bgChip}
                      onClick={() => { setBgSub(sc.slug); setSearch(''); }}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                <button style={styles.bgChipArrowBtn} title="Scroll right" onClick={() => scrollBgChips(1)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              <button
                style={styles.noBgPanelBtn}
                title="Remove this panel's background"
                onClick={readOnly ? undefined : () => dispatch({ type: 'SET_BACKGROUND', panelIndex: activePanelIndex, background: null })}
              >
                <img src="/tool-icons/no-background.webp" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                No Background
              </button>
            </div>
          )}

          <div style={styles.expandContent}>
            {activeSidebar === 'FACE' && (
              <>
                <p style={styles.overlayHint}>Pick a face to add it to the panel.</p>
                <AssetGrid category="FACE" onSelect={handleAssetSelect} />
                {selectedFace && (
                  <div style={{ marginTop: 18 }}>
                    <p style={{ ...styles.overlayHint, marginTop: 0 }}>Customize "{selectedFace.name}"</p>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      {FACE_SECTIONS.map((sec) => (
                        <button
                          key={sec.id}
                          className={`btn btn-sm ${faceSection === sec.id ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setFaceSection(sec.id)}
                        >
                          {sec.label}
                        </button>
                      ))}
                    </div>
                    <div style={styles.faceLibGrid}>
                      {faceParts.filter((a) => matchesFaceSection(a, faceSection)).map((asset) => (
                        <button key={asset.id} title={asset.name} onClick={() => handleFacePartSelect(asset)} style={styles.faceLibThumb}>
                          <img src={asset.filePath} alt={asset.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        </button>
                      ))}
                      {faceParts.filter((a) => matchesFaceSection(a, faceSection)).length === 0 && (
                        <p style={styles.overlayHint}>No {FACE_SECTIONS.find((s) => s.id === faceSection)?.label.toLowerCase()} options found.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {activeSidebar === 'LAYERS' && (
              <p style={styles.overlayHint}>Layer controls are coming soon.</p>
            )}
            {activeSidebar === 'STICKERS' && (
              <p style={styles.overlayHint}>Stickers are coming soon.</p>
            )}
            {activeSidebar === 'CHARACTER' && (
              !characterMenu ? (
                <>
                  <div style={styles.searchRow}>
                    <div style={styles.searchInputWrap}>
                      <input
                        style={styles.searchInput}
                        placeholder="Search characters…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span style={styles.searchIcon}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                  {selectedDressCharacter ? (
                    <>
                      <p style={{ ...styles.overlayHint, marginBottom: 8 }}>Swap parts on "{selectedDressCharacter.name}"</p>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {['cloth', 'neck', 'hands', 'hairstyle'].map((tab) => (
                          <button key={tab} onClick={() => setDressPartTab(tab)}
                            className={`btn btn-sm ${dressPartTab === tab ? 'btn-primary' : 'btn-outline'}`}
                            style={{ textTransform: 'capitalize' }}>
                            {tab}
                          </button>
                        ))}
                      </div>
                      <div style={styles.faceLibGrid}>
                        {(dressPartTab === 'hairstyle'
                          ? faceParts.filter((a) => matchesFaceSection(a, 'hairstyle'))
                          : dressParts.filter((a) => (a.tags || []).includes(dressPartTab))
                        ).map((asset) => (
                          <button key={asset.id} title={asset.name}
                            onClick={() => dressPartTab === 'hairstyle' ? handleSwapDressPart('hairstyle', asset) : handleSwapDressPart(dressPartTab, asset)}
                            style={styles.faceLibThumb}>
                            <img src={asset.filePath} alt={asset.name} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                          </button>
                        ))}
                      </div>
                      <div style={{ borderTop: '1px solid var(--t-border)', margin: '12px 0 8px' }} />
                    </>
                  ) : null}
                  {!pendingPreset ? (
                    <>
                      <p style={{ ...styles.overlayHint, marginBottom: 4 }}>Characters</p>
                      <div style={styles.faceLibGrid}>
                        {characterPresets
                          .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
                          .map((preset) => (
                            <button key={preset.id} title={preset.name} onClick={() => handlePickPreset(preset)} style={styles.faceLibThumb}>
                              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', padding: 4 }}>{preset.name}</span>
                            </button>
                          ))}
                      </div>
                      {characterPresets.length === 0 && (
                        <p style={styles.overlayHint}>No Character Presets yet — create one in Admin → Character Presets.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-outline" onClick={() => setPendingPreset(null)} style={{ marginBottom: 8 }}>← Back</button>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>Pick a pose for "{pendingPreset.name}"</p>
                      <div style={styles.faceLibGrid}>
                        {bodyPoses.map((pose) => (
                          <button key={pose.id} title={pose.name} onClick={() => handlePickBodyPose(pose)} style={styles.faceLibThumb}>
                            <img src={pose.filePath} alt={pose.name} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                          </button>
                        ))}
                      </div>
                      {bodyPoses.length === 0 && (
                        <p style={styles.overlayHint}>No Body Poses uploaded yet — add one in Admin → Upload Asset.</p>
                      )}
                    </>
                  )}
                </>
              ) : selectedCharacterPreset ? (
                characterMenu === 'skinColor' ? (
                  <>
                    <p style={{ ...styles.overlayHint, marginTop: 0 }}>Tap a tone to apply it to "{selectedCharacterPreset.name}".</p>
                    <div style={styles.lightingList}>
                      {Object.values(SKIN_PRESETS).map((sp) => {
                        const active = (selectedCharacterPreset.skinTone || selectedCharacterPresetBase?.skinTone) === sp.id;
                        return (
                          <button key={sp.id}
                            style={{ ...styles.lightingRow, ...(active ? styles.lightingRowActive : {}) }}
                            onClick={() => handleSetPresetSkinTone(sp.id)}
                          >
                            <span style={{ ...styles.lightingSwatch, background: sp.base }} />
                            <span style={styles.lightingRowLabel}>{sp.label}</span>
                            {active && <span style={styles.overlayActiveTag}>Applied</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : characterMenu === 'hairColor' ? (() => {
                  const defaultColor = selectedCharacterPresetBase?.hairColor || '#3b2412';
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>Change hair color on "{selectedCharacterPreset.name}".</p>
                      <label style={styles.overlayFieldLabel}>
                        Color
                        <input type="color" value={selectedCharacterPreset.hairColor || defaultColor}
                          onChange={(e) => handleSetPresetHairColor(e.target.value)}
                          style={styles.colorInput} />
                      </label>
                    </>
                  );
                })() : characterMenu === 'eyeColor' ? (() => {
                  const defaultColor = selectedCharacterPresetBase?.irisColor || '#3b2a1f';
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>Change eye lens color on "{selectedCharacterPreset.name}".</p>
                      <label style={styles.overlayFieldLabel}>
                        Color
                        <input type="color" value={selectedCharacterPreset.irisColor || defaultColor}
                          onChange={(e) => handleSetPresetIrisColor(e.target.value)}
                          style={styles.colorInput} />
                      </label>
                    </>
                  );
                })() : characterMenu === 'hairstyle' ? (() => {
                  const viewLabel = selectedPresetPose?.view ? VIEWS.find((v) => v.id === selectedPresetPose.view)?.label : null;
                  const options = faceParts.filter((a) =>
                    a.partType === 'HAIR' && presetHairAlignedIds.has(a.id) &&
                    (!selectedPresetPose?.view || !a.view || a.view === selectedPresetPose.view)
                  );
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>
                        Pick a hairstyle for "{selectedCharacterPreset.name}"{viewLabel ? ` (${viewLabel} view)` : ''} — only hairstyles already calibrated for this face in Face Builder are shown.
                      </p>
                      {selectedCharacterPreset.hairstyleAssetId && (
                        <button className="btn btn-sm btn-outline" onClick={() => handleSetPresetHairstyleAsset(null)} style={{ marginBottom: 8 }}>Reset to face's default hairstyle</button>
                      )}
                      <div style={styles.faceLibGrid}>
                        {(() => {
                          // Match by name, not raw id — CharacterPresetRig auto-resolves a
                          // stored hairstyleAssetId to its same-name, matching-view sibling when
                          // the pose's view doesn't match what was originally picked, so the
                          // active highlight here should reflect what's actually rendered.
                          const activeName = faceParts.find((a) => a.id === selectedCharacterPreset.hairstyleAssetId)?.name;
                          return options.map((a) => {
                            const active = !!activeName && activeName === a.name;
                            return (
                              <button key={a.id} title={a.name} onClick={() => handleSetPresetHairstyleAsset(a.id)}
                                style={{ ...styles.faceLibThumb, ...(active ? { borderColor: '#8B5CF6', borderWidth: 2 } : {}) }}>
                                <img src={a.filePath} alt={a.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                              </button>
                            );
                          });
                        })()}
                      </div>
                      {options.length === 0 && (
                        <p style={styles.overlayHint}>No hairstyles calibrated for this face's {viewLabel || 'current'} view yet — calibrate one in Face Builder first.</p>
                      )}
                    </>
                  );
                })() : characterMenu === 'outfit' ? (() => {
                  const currentPoseType = selectedPresetPose?.poseType;

                  // One representative thumbnail (P1) per distinct costume — shown regardless of
                  // the character's current pose/view, since the outfit picker itself should
                  // always list every costume; the swap below is what keeps the current pose.
                  const seenCostumes = new Set();
                  const costumeOptions = bodyPoses.filter((bp) => {
                    if (bp.poseType !== 'P1') return false;
                    const key = costumeKeyOf(bp);
                    if (seenCostumes.has(key)) return false;
                    seenCostumes.add(key);
                    return true;
                  });
                  const currentCostumeKey = selectedPresetPose ? costumeKeyOf(selectedPresetPose) : null;

                  // Swap to the SAME pose type the character currently has, not just P1 — e.g.
                  // if the character is in P2, picking a new costume should land on that
                  // costume's P2 (placement data — the head box — comes along automatically
                  // since it's saved per BODY_POSE asset id in Pose Builder). View isn't part of
                  // the match — whatever view that costume's P2 actually has is the right one.
                  const handlePick = (rep) => {
                    const repKey = costumeKeyOf(rep);
                    const match = bodyPoses.find((bp) =>
                      costumeKeyOf(bp) === repKey &&
                      (currentPoseType ? bp.poseType === currentPoseType : true)
                    ) || rep;
                    handleSetPresetBodyPose(match.id);
                  };

                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>
                        Pick an outfit for "{selectedCharacterPreset.name}" — keeps the current pose ({currentPoseType || 'P1'}).
                      </p>
                      <div style={styles.faceLibGrid}>
                        {costumeOptions.map((rep) => (
                          <BodyPoseThumb key={rep.id} asset={rep} active={currentCostumeKey === costumeKeyOf(rep)} onClick={() => handlePick(rep)} />
                        ))}
                      </div>
                      {costumeOptions.length === 0 && (
                        <p style={styles.overlayHint}>No P1 body poses found yet — upload BODY_POSE assets tagged Pose Type "P1".</p>
                      )}
                    </>
                  );
                })() : characterMenu === 'pose' ? (() => {
                  // All P1..PN poses sharing the same costume identity as whichever costume is
                  // currently active (e.g. selecting "Saree" shows every Saree pose — C2P1,
                  // C2P2, C2P3, ... — regardless of view, since different poses/stances can
                  // legitimately be front-facing or 3/4-turned; CharacterPresetRig already picks
                  // the right face for whichever view the selected pose declares).
                  const currentKey = selectedPresetPose ? costumeKeyOf(selectedPresetPose) : null;
                  const poseOptions = bodyPoses
                    .filter((bp) => !currentKey || costumeKeyOf(bp) === currentKey)
                    .sort((a, b) => poseNumOf(a) - poseNumOf(b));

                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>
                        Pick a pose for "{selectedCharacterPreset.name}"{selectedPresetPose?.costume ? ` (${selectedPresetPose.costume})` : ''}.
                      </p>
                      <div style={styles.faceLibGrid}>
                        {poseOptions.map((bp) => (
                          <BodyPoseThumb key={bp.id} asset={bp} active={selectedCharacterPreset.bodyPoseId === bp.id} onClick={() => handleSetPresetBodyPose(bp.id)} />
                        ))}
                      </div>
                      {poseOptions.length === 0 && (
                        <p style={styles.overlayHint}>No poses found for this costume yet — upload more BODY_POSE assets for it (Pose Type P1, P2, P3, ...).</p>
                      )}
                    </>
                  );
                })() : characterMenu === 'expression' ? (() => {
                  // Expressions are saved eye+mouth pairs (Expression Builder); both parts use
                  // the SHARED_ALIGNMENT_KEY, so whichever face is currently resolved (front or
                  // 3/4) already has a calibrated box for them. But the eye/mouth art ITSELF
                  // comes in front/3-4 variants too (e.g. "Eye5" tagged THREE_QUARTER) — only
                  // offer expressions whose eye asset matches the resolved face's own view, so a
                  // 3/4-styled eye never ends up on a front face (reads as the whole face
                  // looking "turned" even though the body pose itself is front-on).
                  const viewLabel = resolvedFaceView ? VIEWS.find((v) => v.id === resolvedFaceView)?.label : null;
                  const expressionOptions = savedExpressions.filter((expr) => {
                    const eyeAsset = faceParts.find((a) => a.id === expr.eyeAssetId);
                    return !resolvedFaceView || !eyeAsset?.view || eyeAsset.view === resolvedFaceView;
                  });
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>
                        Pick an expression for "{selectedCharacterPreset.name}"{viewLabel ? ` (${viewLabel} view)` : ''}.
                      </p>
                      {selectedCharacterPreset.expressionId && (
                        <button className="btn btn-sm btn-outline" onClick={() => handleSetPresetExpression(null)} style={{ marginBottom: 8 }}>Reset to face's default expression</button>
                      )}
                      <div style={styles.faceLibGrid}>
                        {(() => {
                          // Match by name, not raw id — CharacterPresetRig auto-resolves a
                          // stored expressionId to its same-name, matching-view sibling when
                          // the pose's view doesn't match what was originally picked, so the
                          // active highlight here should reflect what's actually rendered.
                          const activeName = savedExpressions.find((e) => e.id === selectedCharacterPreset.expressionId)?.name;
                          // Skip expressions whose eye asset no longer exists (e.g. deleted from
                          // the Asset Library) instead of rendering an empty placeholder box.
                          return expressionOptions
                            .map((expr) => ({ expr, eyeAsset: faceParts.find((a) => a.id === expr.eyeAssetId) }))
                            .filter(({ eyeAsset }) => !!eyeAsset)
                            .map(({ expr, eyeAsset }) => {
                              const active = !!activeName && activeName === expr.name;
                              return (
                                <button key={expr.id} title={expr.name} onClick={() => handleSetPresetExpression(expr.id)}
                                  style={{ ...styles.faceLibThumb, ...(active ? { borderColor: '#8B5CF6', borderWidth: 2 } : {}) }}>
                                  <img src={eyeAsset.filePath} alt={expr.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                                </button>
                              );
                            });
                        })()}
                      </div>
                      {expressionOptions.length === 0 && (
                        <p style={styles.overlayHint}>No expressions calibrated for this face's {viewLabel || 'current'} view yet — create one in Expression Builder using a matching-view eye/mouth.</p>
                      )}
                    </>
                  );
                })() : (
                  <p style={styles.overlayHint}>Select "Skin Color", "Hair Color", "Eye Color", "Hairstyle", "Outfit", "Pose", or "Expression" to customize "{selectedCharacterPreset.name}". Other tools aren't available for Character Presets yet.</p>
                )
              ) : !selectedCharacter ? (
                <p style={styles.overlayHint}>Select a character in the panel first to use "{selectedCharacterTool?.label}".</p>
              ) : characterMenu === 'skinColor' ? (
                <>
                  <p style={{ ...styles.overlayHint, marginTop: 0 }}>Tap a tone to apply it. Tap again to reset.</p>
                  <div style={styles.lightingList}>
                    {Object.values(SKIN_PRESETS).map((preset) => {
                      const active = selectedCharacter.skinPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          style={{ ...styles.lightingRow, ...(active ? styles.lightingRowActive : {}) }}
                          onClick={() => handlePickSkinPreset(preset.id)}
                        >
                          <span style={{ ...styles.lightingSwatch, background: preset.base }} />
                          <span style={styles.lightingRowLabel}>{preset.label}</span>
                          {active && <span style={styles.overlayActiveTag}>Applied</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : characterMenu === 'eyeColor' ? (
                <p style={styles.overlayHint}>Eye Color isn't available for classic Characters yet — only Character Presets.</p>
              ) : CHARACTER_COLOR_TOOLS.some((t) => t.id === characterMenu) ? (() => {
                const tool = CHARACTER_COLOR_TOOLS.find((t) => t.id === characterMenu);
                const overlay = selectedCharacter[tool.overlayKey];
                return (
                  <>
                    <p style={{ ...styles.overlayHint, marginTop: 0 }}>{tool.desc}</p>
                    <label style={styles.overlayFieldLabel}>
                      Color
                      <input type="color" value={overlay?.color || tool.defaultColor}
                        onChange={(e) => updateCharacterOverlay(tool.overlayKey, tool.defaultColor, { color: e.target.value })}
                        style={styles.colorInput} />
                    </label>
                    <label style={styles.overlayFieldLabel}>
                      Blend Mode
                      <select value={overlay?.blendMode || 'multiply'}
                        onChange={(e) => updateCharacterOverlay(tool.overlayKey, tool.defaultColor, { blendMode: e.target.value })}
                        style={styles.selectInput}>
                        {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                    <label style={styles.overlayFieldLabel}>
                      Opacity: {overlay?.opacity ?? 50}%
                      <input type="range" min={0} max={100} value={overlay?.opacity ?? 50}
                        onChange={(e) => updateCharacterOverlay(tool.overlayKey, tool.defaultColor, { opacity: Number(e.target.value) })}
                        style={{ width: '100%' }} />
                    </label>
                    {overlay && (
                      <button style={styles.removeOverlayBtn} onClick={() => removeCharacterOverlay(tool.overlayKey)}>
                        Remove {tool.label}
                      </button>
                    )}
                  </>
                );
              })() : (() => {
                const dim = CHARACTER_DIMENSIONS.find((d) => d.id === characterMenu);
                if (dim.id === 'hairstyle') {
                  const hairstyles = faceParts.filter((a) => matchesFaceSection(a, 'hairstyle'));
                  const canSwap = !!selectedDressCharacter || !!selectedFace;
                  const swapLabel = selectedDressCharacter
                    ? `Swapping hair on "${selectedDressCharacter.name}"`
                    : selectedFace
                    ? `Swapping hair on "${selectedFace.name}"`
                    : 'Select a placed face or costume in the panel to swap hairstyle.';
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>{swapLabel}</p>
                      <div style={styles.faceLibGrid}>
                        {hairstyles.map((asset) => (
                          <button key={asset.id} title={asset.name}
                            onClick={() => selectedDressCharacter ? handleSwapDressPart('hairstyle', asset) : handleSwapHairstyle(asset)}
                            style={{ ...styles.faceLibThumb, opacity: canSwap ? 1 : 0.4, cursor: canSwap ? 'pointer' : 'not-allowed' }}>
                            <img src={asset.filePath} alt={asset.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                          </button>
                        ))}
                        {hairstyles.length === 0 && (
                          <p style={styles.overlayHint}>No hairstyles found. Upload FACE_PART assets with type "Hairstyle" in the admin panel.</p>
                        )}
                      </div>
                    </>
                  );
                }
                if (dim.id === 'face' && selectedDressCharacter) {
                  const faceShapes = faceParts.filter((a) =>
                    classifyFacePart(a.name) === 'faceShape'
                    || (a.tags || []).some((t) => t === 'face' || t === 'faceShape')
                    || (a.partType || '').toLowerCase().includes('face')
                  );
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>Swapping face shape on "{selectedDressCharacter.name}"</p>
                      <div style={styles.faceLibGrid}>
                        {faceShapes.map((asset) => (
                          <button key={asset.id} title={asset.name}
                            onClick={() => handleSwapDressPart('faceShape', asset)}
                            style={styles.faceLibThumb}>
                            <img src={asset.filePath} alt={asset.name} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                          </button>
                        ))}
                        {faceShapes.length === 0 && (
                          <p style={styles.overlayHint}>
                            No face shapes found. Upload FACE_PART assets with "face" in the name (e.g. "taper_face", "oval_face").
                          </p>
                        )}
                      </div>
                    </>
                  );
                }
                if (dim.id === 'expression' && selectedDressCharacter) {
                  const EXPR_TABS = [
                    { id: 'eye', label: 'Eyes' },
                    { id: 'nose', label: 'Nose' },
                    { id: 'mouth', label: 'Mouth' },
                  ];
                  const exprParts = faceParts.filter((a) => matchesFaceSection(a, expressionTab));
                  return (
                    <>
                      <p style={{ ...styles.overlayHint, marginTop: 0 }}>Swapping expression on "{selectedDressCharacter.name}"</p>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        {EXPR_TABS.map((t) => (
                          <button key={t.id} onClick={() => setExpressionTab(t.id)}
                            className={`btn btn-sm ${expressionTab === t.id ? 'btn-primary' : 'btn-outline'}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div style={styles.faceLibGrid}>
                        {exprParts.map((asset) => (
                          <button key={asset.id} title={asset.name}
                            onClick={() => handleSwapDressPart(expressionTab, asset)}
                            style={styles.faceLibThumb}>
                            <img src={asset.filePath} alt={asset.name} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                          </button>
                        ))}
                        {exprParts.length === 0 && (
                          <p style={styles.overlayHint}>
                            No {EXPR_TABS.find((t) => t.id === expressionTab)?.label.toLowerCase()} parts uploaded yet.
                            Upload FACE_PART assets with "{expressionTab}" in the name or tags.
                          </p>
                        )}
                      </div>
                    </>
                  );
                }
                return (
                  <>
                    <p style={{ ...styles.overlayHint, marginTop: 0 }}>{dim.desc}</p>
                    <div style={styles.faceLibGrid}>
                      {characterVariants.map((asset) => (
                        <button key={asset.id} title={asset.name} onClick={() => handlePickCharacterVariant(asset)} style={styles.faceLibThumb}>
                          <img src={asset.filePath} alt={asset.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        </button>
                      ))}
                      {characterVariants.length === 0 && (
                        <p style={styles.overlayHint}>
                          No {dim.label.toLowerCase()} options found. Tag CHARACTER assets with "{dim.tagPrefix}…" to add options here.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()
            )}
            {activeSidebar === 'EFFECT' && (
              <div style={styles.effectTabRow}>
                {EFFECT_SUBCATEGORIES.map((sc) => (
                  <button
                    key={sc.id}
                    style={sc.id === effectSub ? { ...styles.effectTab, ...styles.effectTabActive } : styles.effectTab}
                    onClick={() => setEffectSub(sc.id)}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            )}
            {activeSidebar === 'EFFECT' && effectSub && effectSubMeta?.filters && (
              <>
                <p style={styles.overlayHint}>Pick an effect to add it! Tap it again to take it away.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '2px 0' }}>
                  {effectSubMeta.filters.map((f) => {
                    const active = activePanelLightingOverlay === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleLightingOverlay(f.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '10px 8px', borderRadius: 12, cursor: 'pointer', border: '2px solid',
                          borderColor: active ? '#F97316' : '#e5e7eb',
                          background: active ? 'rgba(249,115,22,0.06)' : '#fff',
                          boxShadow: active ? '0 0 0 2px rgba(249,115,22,0.25)' : 'none',
                        }}
                      >
                        <span style={{ width: 36, height: 36, borderRadius: 8, background: f.swatch, display: 'block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#F97316' : '#374151', textAlign: 'center', lineHeight: 1.2 }}>{f.label}</span>
                        {active && <span style={styles.overlayActiveTag}>On</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {activeSidebar === 'EFFECT' && effectSub === 'mood' && effectSubMeta?.modes && (
              <>
                <p style={styles.overlayHint}>Pick a mood to color your scene! Tap it again to take it away.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '2px 0' }}>
                  {effectSubMeta.modes.map((m) => {
                    const active = activePanelBgMode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleBgMode(m.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '10px 8px', borderRadius: 12, cursor: 'pointer', border: '2px solid',
                          borderColor: active ? '#F97316' : '#e5e7eb',
                          background: active ? 'rgba(249,115,22,0.06)' : '#fff',
                          boxShadow: active ? '0 0 0 2px rgba(249,115,22,0.25)' : 'none',
                        }}
                      >
                        <span style={{ width: 36, height: 36, borderRadius: 8, background: m.swatch, display: 'block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#F97316' : '#374151', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
                        {active && <span style={styles.overlayActiveTag}>On</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {ASSET_IDS.has(activeSidebar) && (activeSidebar !== 'EFFECT' || (effectSub && !effectSubMeta?.filters && !effectSubMeta?.modes)) && (activeSidebar !== 'BACKGROUND' || bgSub) && (
              <>
                {/* Search row: input with icon + filter button — skipped for Backgrounds,
                    where a folder was already picked and there's nothing else to filter. */}
                {activeSidebar !== 'BACKGROUND' && (
                  <div style={styles.searchRow}>
                    <div style={styles.searchInputWrap}>
                      <input
                        style={styles.searchInput}
                        placeholder={`Search ${activeItem?.label?.toLowerCase()}…`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span style={styles.searchIcon}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                      </span>
                    </div>

                  </div>
                )}
                <AssetGrid
                  category={activeSidebar}
                  tags={activeSidebar === 'EFFECT' ? effectSub : activeSidebar === 'BACKGROUND' ? bgSub : undefined}
                  search={activeSidebar === 'BACKGROUND' ? undefined : (search || undefined)}
                  onSelect={handleAssetSelect}
                  activeAssetId={activeSidebar === 'BACKGROUND' ? state.panels[activePanelIndex]?.data?.background?.assetId : undefined}
                />
              </>
            )}
            {/* Text — narration box settings only, no shared tab switcher with Speech Bubble */}
            {activeSidebar === 'BUBBLE' && (
              <SpeechBubbleEditor panelIndex={activePanelIndex} hideBubbles />
            )}
            {/* Speech Bubble — bubble shape picker + styling, fully independent panel */}
            {activeSidebar === 'SPEECH_BUBBLE' && (() => {
              const selBubble = state.activeSelection?.kind === 'PLACED_BUBBLE'
                ? (state.panels[state.activeSelection.panelIndex]?.data?.bubbles || []).find((b) => b.instanceId === state.activeSelection.instanceId)
                : null;
              const ts = selBubble?.textStyle || {};
              const pi2 = state.activeSelection?.panelIndex ?? activePanelIndex;
              const updTs = (patch) => { if (!selBubble) return; dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex: pi2, instanceId: selBubble.instanceId, updates: { textStyle: { ...ts, ...patch } } }); };
              const updB  = (patch) => { if (!selBubble) return; dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex: pi2, instanceId: selBubble.instanceId, updates: patch }); };
              const activeAlign = ts.textAlign || 'center';
              const fmtBtn = { width: 36, height: 36, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0, padding: 0 };
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '2px 2px 6px' }}>
                  {/* Bubble shapes grid */}
                  <AssetGrid category="BUBBLE" onSelect={handleAssetSelect} />
                  <div style={{ borderTop: '1.5px solid #f0f0f0', margin: '1px 0' }} />

                  {/* Status hint */}
                  {selBubble
                    ? <p style={{ fontSize: 11, color: '#F97316', fontWeight: 700, margin: 0, letterSpacing: '0.01em' }}>✦ Editing selected bubble</p>
                    : <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Select a bubble on the canvas to edit its style</p>
                  }

                  {/* ── Font + Size ── */}
                  <div>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1 }}>Font</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase', width: 92 }}>Size</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <CustomSelect
                        value={ts.fontFamily || "'Comic Sans MS', cursive"}
                        onChange={(v) => updTs({ fontFamily: v })}
                        options={FONTS}
                      />
                      <div style={{ width: 92, flexShrink: 0 }}>
                        <CustomSelect
                          value={ts.fontSize || 16}
                          onChange={(v) => updTs({ fontSize: Number(v) })}
                          options={SIZES.map((n) => ({ value: n, label: String(n) }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Colors + Thickness ── */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, background: '#f9fafb', borderRadius: 14, padding: '10px 12px', border: '1.5px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', gap: 14, flex: 1 }}>
                      <ColorSwatch label="Font" value={ts.color || '#000000'} onChange={(v) => updTs({ color: v })} />
                      <ColorSwatch label="Fill" value={selBubble?.fillColor || '#ffffff'} onChange={(v) => updB({ fillColor: v })} />
                      <ColorSwatch label="Border" value={selBubble?.strokeColor || '#000000'} onChange={(v) => updB({ strokeColor: v })} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Width</span>
                      <select
                        value={selBubble?.strokeWidth || 2}
                        onChange={(e) => updB({ strokeWidth: Number(e.target.value) })}
                        style={{ height: 36, width: 58, padding: '0 4px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 12, fontWeight: 700, color: '#111827', background: '#fff', cursor: 'pointer', textAlign: 'center' }}
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}px</option>)}
                      </select>
                    </div>
                  </div>

                  {/* ── Formatting toolbar: B I | align ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => updTs({ bold: !ts.bold })}
                      style={{ ...fmtBtn, borderColor: ts.bold ? '#F97316' : '#e5e7eb', color: ts.bold ? '#F97316' : '#374151', background: ts.bold ? 'rgba(249,115,22,0.07)' : '#fff' }}>
                      <b style={{ fontSize: 15, lineHeight: 1 }}>B</b>
                    </button>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => updTs({ italic: !ts.italic })}
                      style={{ ...fmtBtn, borderColor: ts.italic ? '#F97316' : '#e5e7eb', color: ts.italic ? '#F97316' : '#374151', background: ts.italic ? 'rgba(249,115,22,0.07)' : '#fff' }}>
                      <em style={{ fontSize: 15, fontStyle: 'italic', lineHeight: 1 }}>I</em>
                    </button>
                    <div style={{ width: 1, height: 22, background: '#e5e7eb', margin: '0 2px', flexShrink: 0 }} />
                    {['left', 'center', 'right', 'justify'].map((a) => (
                      <button key={a} onMouseDown={(e) => e.preventDefault()} onClick={() => updTs({ textAlign: a })}
                        style={{ ...fmtBtn, borderColor: activeAlign === a ? '#F97316' : '#e5e7eb', color: activeAlign === a ? '#F97316' : '#374151', background: activeAlign === a ? 'rgba(249,115,22,0.07)' : '#fff' }}>
                        <AlignIcon id={a} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {activeSidebar === 'AI' && (
              <AIAssistantPanel panelIndex={activePanelIndex} />
            )}
            {activeSidebar === 'LAYOUT' && (
              <>
                <p style={styles.layoutHint}>Layout for <strong>Page {state.activePageIndex + 1}</strong></p>
                <PanelLayoutPicker
                  current={activePage?.layout}
                  onChange={(layout) => dispatch({ type: 'SET_PAGE_LAYOUT', pageIndex: state.activePageIndex, layout })}
                />
              </>
            )}
          </div>
          <div style={styles.expandBottomMask} />
        </aside>
      )}

      {/* ── Main: canvas + bottom page strip ── */}
      <div style={styles.main} id="comic-main">

        {/* Canvas toolbar — full-width strip: title left, tools right */}
        <div style={styles.canvasToolbar}>

          {/* LEFT: reserved for panel title/context. No Background moved into the
              Backgrounds panel itself (contextual — only relevant while working with backgrounds). */}
          <div style={styles.toolbarLeft}>
            {[
              { id: 'LAYERS',   label: 'Layers',   icon: 'layers.webp',   clickable: true },
              { id: 'STICKERS', label: 'Stickers', icon: 'stickers.webp', clickable: true },
              { id: 'upload',   label: 'Upload',   icon: 'upload.webp',   clickable: false },
            ].map((item) => (
              <button
                key={item.id}
                style={{
                  ...styles.toolBtnLg,
                  ...(hoveredIcon === item.id ? styles.iconBtnHover : {}),
                  ...(activeSidebar === item.id ? styles.toolBtnLgActive : {}),
                }}
                onClick={item.clickable ? () => toggleSidebar(item.id) : undefined}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setIconTip({ label: item.label, top: r.top, left: r.right });
                  setHoveredIcon(item.id);
                }}
                onMouseLeave={() => { setIconTip(null); setHoveredIcon(null); }}
              >
                <img src={`/tool-icons/${item.icon}`} alt={item.label} style={styles.toolBtnLgImg} draggable={false} />
              </button>
            ))}
          </div>

          {/* RIGHT: Tool buttons */}
          <div style={styles.toolbarRight}>
            {/* Flip — only shown when a selection supports it (contextual, unlike Crop/Delete below) */}
            {state.activeSelection?.kind === 'PLACED_BUBBLE' && (() => {
              const panel = state.panels[state.activeSelection.panelIndex];
              const bub = (panel?.data?.bubbles || []).find((b) => b.instanceId === state.activeSelection.instanceId);
              return (
                <button style={styles.toolBtn} title="Flip horizontal"
                  onClick={() => bub && dispatch({ type: 'UPDATE_PANEL_BUBBLE', panelIndex: state.activeSelection.panelIndex, instanceId: state.activeSelection.instanceId, updates: { flipX: !bub.flipX } })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 8L2 12l5 4"/><path d="M17 8l5 4-5 4"/><line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2"/>
                  </svg>
                </button>
              );
            })()}
            {(state.activeSelection?.kind === 'CHARACTER' || state.activeSelection?.kind === 'CHARACTER_PRESET') && (() => {
              const panel = state.panels[state.activeSelection.panelIndex];
              const isPreset = state.activeSelection.kind === 'CHARACTER_PRESET';
              const item = isPreset
                ? panel?.data?.characterPresets?.find((c) => c.instanceId === state.activeSelection.instanceId)
                : panel?.data?.characters?.find((c) => c.instanceId === state.activeSelection.instanceId);
              const updateType = isPreset ? 'UPDATE_CHARACTER_PRESET' : 'UPDATE_CHARACTER';
              return (
                <button
                  style={styles.toolBtn}
                  title="Flip horizontal"
                  onClick={() => item && dispatch({ type: updateType, panelIndex: state.activeSelection.panelIndex, instanceId: state.activeSelection.instanceId, updates: { flipX: !item.flipX } })}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 8L2 12l5 4"/>
                    <path d="M17 8l5 4-5 4"/>
                    <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2"/>
                  </svg>
                </button>
              );
            })()}

            {/* Crop — always visible; disabled unless the current selection supports cropping */}
            {(() => {
              const canCrop = state.activeSelection?.kind === 'CHARACTER' || state.activeSelection?.kind === 'CHARACTER_PRESET';
              return (
                <button
                  style={{
                    ...styles.toolBtn,
                    color: !canCrop ? 'var(--t-text-faint)' : state.activeSelection.cropping ? '#F97316' : 'var(--t-text-muted)',
                    background: canCrop && state.activeSelection.cropping ? 'rgba(249,115,22,0.10)' : 'none',
                    opacity: canCrop ? 1 : 0.4, cursor: canCrop ? 'pointer' : 'not-allowed',
                  }}
                  title={!canCrop ? 'Select a character to crop' : state.activeSelection.cropping ? 'Exit crop' : 'Crop'}
                  disabled={!canCrop}
                  onClick={() => canCrop && dispatch({ type: 'TOGGLE_CROP_MODE' })}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
                    <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
                  </svg>
                </button>
              );
            })()}

            {/* Delete — always visible. With a canvas item selected, deletes that item;
                otherwise falls back to deleting the active PAGE — the only way to delete a
                page on touch devices, which have no keyboard Delete key to trigger the
                existing per-tile onKeyDown handler below. */}
            {(() => {
              const hasPages = state.pages.length > 0;
              const canDelete = !!state.activeSelection || hasPages;
              const label = state.activeSelection ? 'Delete selected' : hasPages ? 'Delete current page' : 'Nothing to delete';
              return (
                <button
                  style={{
                    ...styles.toolBtn,
                    color: canDelete ? '#ef4444' : 'var(--t-text-faint)',
                    opacity: canDelete ? 1 : 0.4, cursor: canDelete ? 'pointer' : 'not-allowed',
                  }}
                  title={label}
                  disabled={!canDelete}
                  onClick={() => {
                    if (state.activeSelection) {
                      // Mirrors the keyboard-Delete switch in Panel.jsx exactly — every
                      // selectable kind needs its own real reducer action; PROP/EFFECT/
                      // COSTUME/SOUND are the only ones that use the generic
                      // REMOVE_PLACED_ITEM (keyed by kind + 's'). Falling through to that
                      // generic path for a kind like NARRATION (whose items live under
                      // data.narrationBoxes, not data.narrations) throws — filtering
                      // `undefined` crashes the render and whites out the screen.
                      const { kind, instanceId, panelIndex: pi } = state.activeSelection;
                      if (kind === 'CHARACTER') dispatch({ type: 'REMOVE_CHARACTER', panelIndex: pi, instanceId });
                      else if (kind === 'FACE') dispatch({ type: 'REMOVE_FACE', panelIndex: pi, instanceId });
                      else if (kind === 'CHARACTER_PRESET') dispatch({ type: 'REMOVE_CHARACTER_PRESET', panelIndex: pi, instanceId });
                      else if (kind === 'BUBBLE') dispatch({ type: 'REMOVE_BUBBLE', panelIndex: pi, instanceId });
                      else if (kind === 'PLACED_BUBBLE') dispatch({ type: 'REMOVE_PANEL_BUBBLE', panelIndex: pi, instanceId });
                      else if (kind === 'NARRATION') dispatch({ type: 'REMOVE_NARRATION_BOX', panelIndex: pi, instanceId });
                      else if (kind === 'BACKGROUND') dispatch({ type: 'SET_BACKGROUND', panelIndex: pi, background: null });
                      else if (['PROP', 'EFFECT', 'COSTUME', 'SOUND'].includes(kind)) dispatch({ type: 'REMOVE_PLACED_ITEM', panelIndex: pi, instanceId, kind: kind.toLowerCase() + 's' });
                      dispatch({ type: 'SET_ACTIVE_SELECTION', selection: null });
                    } else if (hasPages) {
                      dispatch({ type: 'REMOVE_PAGE', pageIndex: state.activePageIndex });
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                  </svg>
                </button>
              );
            })()}

            <div style={styles.toolDivider} />

            {/* Opacity icon — click to open popup */}
          <div style={{ position: 'relative' }}>
            <button
              style={styles.toolBtn}
              title="Opacity"
              onClick={() => setShowOpacityPop((v) => !v)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" stroke="currentColor"/>
                <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/>
              </svg>
            </button>

            {showOpacityPop && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--t-surface)', border: '1px solid var(--t-border)',
                  borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                  padding: '14px 16px', width: 220, zIndex: 200,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>Opacity</p>
                  <div style={{
                    minWidth: 40, height: 32, borderRadius: 10,
                    background: 'var(--t-bg3)', border: '1px solid var(--t-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: 'var(--t-text)', padding: '0 8px',
                  }}>{selOpacity}</div>
                </div>
                {/* Custom slider — thumb anchored at true 0% and 100% */}
                <div
                  style={{ position: 'relative', height: 28, cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const update = (ev) => {
                      const val = Math.round(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * 100);
                      handleOpacity(val);
                    };
                    update(e.nativeEvent ?? e);
                    const onUp = () => { window.removeEventListener('pointermove', update); window.removeEventListener('pointerup', onUp); };
                    window.addEventListener('pointermove', update);
                    window.addEventListener('pointerup', onUp);
                  }}
                >
                  {/* Track */}
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 6, transform: 'translateY(-50%)', borderRadius: 999, background: '#e5e7eb' }}>
                    <div style={{ height: '100%', width: `${selOpacity}%`, background: '#F97316', borderRadius: 999 }} />
                  </div>
                  {/* Thumb — calc ensures left=0 at 0% and right edge flush at 100% */}
                  <div style={{
                    position: 'absolute', top: '50%',
                    left: `calc(${selOpacity / 100} * (100% - 20px))`,
                    transform: 'translateY(-50%)',
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#F97316', border: '3px solid #fff',
                    boxShadow: '0 2px 8px rgba(249,115,22,0.5)',
                    pointerEvents: 'none',
                  }} />
                </div>
              </div>
            )}
          </div>

          <button
            style={{ ...styles.toolBtn, ...(activeSidebar === 'LAYOUT' ? styles.toolBtnActive : {}) }}
            title="Page layout"
            onClick={() => toggleSidebar('LAYOUT')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>

          <button
            style={styles.toolBtn}
            title="Fullscreen (Esc to exit)"
            onClick={() => setIsFullscreen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
              <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
              <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          </button>

          <div style={styles.toolDivider} />

          <span
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', minWidth: 34, textAlign: 'right', cursor: 'default' }}
            onMouseEnter={() => setZoomSliderOpen(true)}
            onMouseLeave={() => setZoomSliderOpen(false)}
          >
            {zoom}%
          </span>

            {/* Undo/Redo now live in the page header (ComicEditorPage). */}
          </div>{/* end toolbarRight */}
        </div>{/* end canvasToolbar */}

        {/* Zoom slider — docked to the canvas's top-right corner, only shown while hovering
            the "140%" readout (or actively dragging the thumb, so moving off it mid-drag
            doesn't yank the slider away). */}
        {(zoomSliderOpen || zoomDragging) && (
        <div
          style={styles.zoomSliderDock}
          onMouseEnter={() => setZoomSliderOpen(true)}
          onMouseLeave={() => setZoomSliderOpen(false)}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)' }}>{ZOOM_MAX}%</div>
          {/* Vertical track — top = ZOOM_MAX, bottom = ZOOM_MIN (standard zoom-slider orientation) */}
          <div
            style={{ position: 'relative', width: 28, height: 240, cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}
            onPointerDown={(e) => {
              e.preventDefault();
              setZoomDragging(true);
              const rect = e.currentTarget.getBoundingClientRect();
              const update = (ev) => {
                const frac = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                setZoom(Math.round(ZOOM_MAX - frac * (ZOOM_MAX - ZOOM_MIN)));
              };
              update(e.nativeEvent ?? e);
              const onUp = () => {
                setZoomDragging(false);
                window.removeEventListener('pointermove', update); window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', update);
              window.addEventListener('pointerup', onUp);
            }}
          >
            {/* Track */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 6, transform: 'translateX(-50%)', borderRadius: 999, background: 'var(--t-bg3)' }}>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, width: '100%', borderRadius: 999, background: '#F97316',
                height: `${((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%`,
              }} />
            </div>
            {/* Thumb */}
            <div style={{
              position: 'absolute', left: '50%',
              top: `calc(${1 - (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)} * (100% - 20px))`,
              transform: 'translateX(-50%)',
              width: 20, height: 20, borderRadius: '50%',
              background: '#F97316', border: '3px solid #fff',
              boxShadow: '0 2px 8px rgba(249,115,22,0.5)',
              pointerEvents: 'none',
            }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)' }}>{ZOOM_MIN}%</div>
          <button style={styles.zoomResetBtn} onMouseDown={() => setZoom(125)}>Reset</button>
        </div>
        )}

        {/* Canvas area */}
        <div
          className="editor-themed-scroll"
          style={styles.canvasArea}
          id="comic-canvas"
          ref={canvasAreaRef}
          data-pan-bg
          onMouseDown={(e) => {
            const isMiddle = e.button === 1;
            const isBackground = e.button === 0 && !!e.target.closest('[data-pan-bg]');
            if (!isMiddle && !isBackground) return;
            e.preventDefault();
            panState.current = {
              x: e.clientX,
              y: e.clientY,
              scrollLeft: canvasAreaRef.current.scrollLeft,
              scrollTop: canvasAreaRef.current.scrollTop,
            };
          }}
        >

          {readOnly && (
            <div style={styles.readOnlyBanner}>
              🔒 View only — this institution's subscription has expired. Ask your administrator to renew.
            </div>
          )}

          {/* Panel grid / empty state */}
          {state.pages.length === 0 ? (
            <div style={{ ...styles.emptyCanvas, margin: 'auto' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(249,115,22,0.35)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              <p style={styles.emptyTitle}>Your comic is empty</p>
              <p style={styles.emptyHint}>Hit <strong>Add Page</strong> below to get started</p>
            </div>
          ) : (
            <div style={{ margin: 'auto' }} data-pan-bg>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${canvas.cols}, ${canvas.pw}px)`,
                gap: 6,
                zoom: zoom / 100,
              }}>
                {activePagePanels.map((panel, slotIdx) => {
                  const pIdx = pageStart + slotIdx;
                  return (
                    <Panel
                      key={panel.id}
                      panel={panel}
                      panelIndex={pIdx}
                      canvasW={canvas.pw}
                      canvasH={canvas.ph}
                      isActive={pIdx === activePanelIndex}
                      onActivate={() => dispatch({ type: 'SET_ACTIVE_PANEL', index: pIdx })}
                      onOpenAI={() => setActiveSidebar('AI')}
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom page strip ── */}
        <div style={styles.pageStrip}>

          {/* Fixed left: label + pill "Add Page" button stacked underneath */}
          <div style={styles.stripLeftCol}>
            <span style={styles.stripLabel}>PAGES</span>
            <button
              style={styles.addPagePill}
              onClick={() => setInsertPickerAt(state.pages.length)}
              title="Add page"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Page
            </button>
          </div>

          {/* Scrollable thumbnails */}
          <div ref={thumbScrollRef} className="bg-chip-scroll" style={styles.thumbScroll}>
            {state.pages.map((page, i) => (
              <Fragment key={page.id}>
                {/* Hover gap */}
                {i > 0 && (
                  <div
                    style={{
                      width: hoverGap === i ? 44 : 10,
                      alignSelf: 'stretch',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'width 0.18s ease',
                      cursor: 'pointer',
                      zIndex: 5,
                    }}
                    onMouseEnter={() => setHoverGap(i)}
                    onMouseLeave={() => setHoverGap(null)}
                    onClick={() => { setInsertPickerAt(i); setHoverGap(null); }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: 'var(--t-accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, lineHeight: 1,
                      opacity: hoverGap === i ? 1 : 0,
                      transform: hoverGap === i ? 'scale(1)' : 'scale(0.4)',
                      transition: 'opacity 0.15s, transform 0.15s',
                      pointerEvents: 'none', userSelect: 'none',
                      boxShadow: '0 2px 8px rgba(249,115,22,0.45)',
                    }}>+</div>
                  </div>
                )}

                {/* Page thumbnail */}
                <div
                  draggable
                  tabIndex={0}
                  data-page-idx={i}
                  style={{
                    ...styles.pageThumb,
                    ...(i === state.activePageIndex ? styles.pageThumbActive : {}),
                    ...(i === dragOverIdx && dragIdx !== i ? styles.pageThumbDragOver : {}),
                    opacity: dragIdx === i ? 0.4 : 1,
                    transform: hoverGap === i
                      ? 'translateX(7px)'
                      : hoverGap === i + 1
                      ? 'translateX(-7px)'
                      : 'translateX(0)',
                    transition: 'transform 0.18s ease, opacity 0.15s',
                  }}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex: i })}
                  onMouseEnter={() => setThumbHover(i)}
                  onMouseLeave={() => setThumbHover(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete') dispatch({ type: 'REMOVE_PAGE', pageIndex: i });
                  }}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(i); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx !== null && dragIdx !== i) dispatch({ type: 'REORDER_PAGE', from: dragIdx, to: i });
                    setDragIdx(null); setDragOverIdx(null);
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                >
                  {(() => {
                    const start = pageStartIndex(state.pages, i);
                    const pagePanels = state.panels.slice(start, start + (LAYOUT_COUNT[page.layout] || 1));
                    const pageEmpty = pagePanels.every((p) => isPanelEmpty(p.data));
                    return pageThumbs[page.id] && !pageEmpty ? (
                      <img src={pageThumbs[page.id]} alt="" style={styles.pageThumbImg} draggable={false} />
                    ) : (
                      <LayoutThumb layout={page.layout} active={i === state.activePageIndex} empty={pageEmpty} mildLines={false} />
                    );
                  })()}
                  <span style={{ ...styles.pageNum, ...(i === state.activePageIndex ? styles.pageNumActive : {}) }}>{i + 1}</span>
                </div>
              </Fragment>
            ))}
          </div>

        </div>

        {/* Layout picker for new page */}
        {insertPickerAt !== null && (
          <AddPagePicker
            onPick={(layout) => dispatch({ type: 'ADD_PAGE_AT', layout, insertAt: insertPickerAt })}
            onClose={() => setInsertPickerAt(null)}
          />
        )}

        {/* Layout picker for changing an existing page's layout */}
        {changeLayoutFor !== null && (
          <ChangeLayoutPicker
            current={state.pages[changeLayoutFor]?.layout}
            onPick={(layout) => {
              dispatch({ type: 'SET_PAGE_LAYOUT', pageIndex: changeLayoutFor, layout });
              setChangeLayoutFor(null);
            }}
            onClose={() => setChangeLayoutFor(null)}
          />
        )}
      </div>

      {/* ── Fullscreen overlay ── */}
      {isFullscreen && (() => {
        const fsGridW = canvas.cols * canvas.pw + (canvas.cols - 1) * 6;
        const fsRows = Math.ceil(activePagePanels.length / canvas.cols);
        const fsGridH = fsRows * canvas.ph + (fsRows - 1) * 6;
        const fsScale = Math.min(
          (window.innerWidth * 0.88) / fsGridW,
          (window.innerHeight * 0.78) / fsGridH,
        );
        return (
          <div style={styles.fsOverlay}>
            {/* Top bar */}
            <div style={styles.fsTopBar}>
              <div style={styles.fsNavGroup}>
                <button
                  style={{ ...styles.fsNavBtn, opacity: state.activePageIndex === 0 ? 0.35 : 1 }}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex: Math.max(0, state.activePageIndex - 1) })}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <span style={styles.fsPageInfo}>Page {state.activePageIndex + 1} / {state.pages.length}</span>
                <button
                  style={{ ...styles.fsNavBtn, opacity: state.activePageIndex === state.pages.length - 1 ? 0.35 : 1 }}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex: Math.min(state.pages.length - 1, state.activePageIndex + 1) })}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
              <button style={styles.fsCloseBtn} onClick={() => setIsFullscreen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Exit
              </button>
            </div>

            {/* Scaled panel grid */}
            <div style={styles.fsContent}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${canvas.cols}, ${canvas.pw}px)`,
                gap: 6,
                transform: `scale(${fsScale})`,
                transformOrigin: 'center center',
              }}>
                {activePagePanels.map((panel, slotIdx) => {
                  const pIdx = pageStart + slotIdx;
                  return (
                    <Panel
                      key={panel.id}
                      panel={panel}
                      panelIndex={pIdx}
                      canvasW={canvas.pw}
                      canvasH={canvas.ph}
                      isActive={pIdx === activePanelIndex}
                      onActivate={() => dispatch({ type: 'SET_ACTIVE_PANEL', index: pIdx })}
                      previewMode
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bottom hint */}
            <div style={styles.fsHint}>
              ← → arrow keys to navigate pages &nbsp;·&nbsp; Esc to exit
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const styles = {
  root: { display: 'flex', flex: 1, overflow: 'hidden', background: 'var(--t-bg)' },

  iconBar: {
    width: 'var(--editor-icon-bar-w)', background: 'var(--t-icon-bar)', display: 'flex', flexDirection: 'column',
    alignItems: 'stretch', paddingTop: 12, paddingBottom: 0, gap: 0,
    overflow: 'hidden', flexShrink: 0,
    borderRight: '1px solid var(--t-border2)',
    // Right-edge shadow (existing) plus a bottom-inset shadow where the rail meets the
    // page strip below it — same emboss language used across the other panel seams.
    boxShadow: '2px 0 8px rgba(0,0,0,0.05), inset 0 -10px 14px -10px var(--t-emboss-shadow)',
  },
  // Inner tool list: scrollable by mouse wheel/touch, plus the ▲/▼ arrows below; the
  // scrollbar itself stays hidden (see .bg-chip-scroll in index.css) for a clean look.
  // scrollSnapType keeps it from resting mid-icon (a partial icon peeking at the edge) —
  // it always settles on a full tile.
  railScroll: {
    flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    scrollbarWidth: 'none', scrollSnapType: 'y proximity',
  },
  railArrows: {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderTop: '1px solid var(--t-border2)', flexShrink: 0, padding: '8px 0',
  },
  railArrowBtn: {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--t-bg3)', border: '1px solid var(--t-border)',
    cursor: 'pointer', color: 'var(--t-text-muted)',
    transition: 'background 0.15s, color 0.15s',
  },
  // Icon-only tile, centered — name is hidden and only shown via the hover tooltip.
  // scrollSnapAlign pairs with railScroll's scrollSnapType so the rail never rests with
  // a tile half-scrolled out of view.
  iconBtn: {
    width: '100%', padding: '4px 2px', background: 'none', border: 'none',
    borderLeft: '4px solid transparent',
    cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 0, color: 'var(--t-text-muted)',
    transform: 'translateY(0)', transition: 'transform 0.15s ease',
    scrollSnapAlign: 'start',
  },
  iconBtnActive: {
    borderLeft: '4px solid var(--t-accent)',
    background: 'var(--t-accent-light)',
    color: 'var(--t-accent)',
  },
  // Lifts the icon upward on hover — same motion as hovering an asset card.
  iconBtnHover: { transform: 'translateY(-4px)' },
  iconLabel: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0, lineHeight: 1.2, textAlign: 'center' },
  iconImg: {
    width: 48, height: 48, objectFit: 'contain', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  iconTip: {
    position: 'fixed', transform: 'translateY(-50%)', zIndex: 1000, pointerEvents: 'none',
    background: '#111827', color: '#fff', padding: '5px 10px', borderRadius: 6,
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
  },

  themeToggleWrap: {
    display: 'flex', gap: 8, padding: '10px 0', justifyContent: 'center', flexShrink: 0,
  },
  themeCircle: {
    width: 34, height: 34, borderRadius: '50%',
    border: '1.5px solid var(--t-border)', background: 'var(--t-bg3)',
    cursor: 'pointer', fontSize: 17,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  themeCircleActive: {
    background: '#F97316', border: '1.5px solid #F97316',
    boxShadow: '0 2px 8px rgba(249,115,22,0.45)',
  },

  expandPanel: {
    width: 'var(--editor-panel-w)', background: 'var(--t-surface)', display: 'flex', flexDirection: 'column',
    flexShrink: 0, borderRight: '1px solid var(--t-border)',
    // Outward shadow (panel floats above the rail to its left) plus an inset shadow along
    // the same left edge — reads as recessed/embossed where the rail meets the panel,
    // matching the treatment used for the page strip and canvas area. box-shadow with no
    // vertical offset already spans the element's full height uniformly (top to bottom),
    // so a wider blur/spread here is what makes it visible for the panel's entire height,
    // not just near the top.
    boxShadow: '2px 0 12px rgba(0,0,0,0.06), inset 14px 0 18px -12px var(--t-emboss-shadow)',
    position: 'relative',
  },
  // Masks the bottom of the scrollable asset grid at all times (not just once fully
  // scrolled) — a solid strip in the panel's own background color, so a row is never
  // flush against the panel edge whether you're mid-scroll or at the very end. Height
  // matches the rail's ▲▼ arrow row (26px button + 8px top/bottom padding) so both
  // side-by-side columns line up along the same bottom edge.
  expandBottomMask: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 42,
    background: 'var(--t-surface)', pointerEvents: 'none', zIndex: 5,
    // Same border treatment as the rail's ▲▼ arrow row, so both bottom sections read
    // consistently — a plain top separator, not an inset shadow like the panel's other
    // seams (this one sits over scrolled content, so a shadow would double up oddly).
    borderTop: '1px solid var(--t-border2)',
  },
  expandHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px 8px',
    flexShrink: 0, position: 'relative',
  },
  expandTitle: { fontSize: 19, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 },
  headerFilterBtn: {
    width: 31, height: 31, borderRadius: 9,
    background: 'var(--t-bg3)', border: '1px solid var(--t-border)',
    color: 'var(--t-text-muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  // Bottom padding must be at least as tall as expandBottomMask (42px) — otherwise, at
  // true scroll-end, the mask overlaps and clips the bottom of the last row instead of
  // sitting cleanly below it. The inset shadows render on this element's own boundary
  // (fixed relative to the viewport, not the scrolled content), so they cut visibly into
  // the top/bottom of the image grid itself as it scrolls beneath them, instead of only
  // showing on the fixed sections above/below.
  expandContent: {
    flex: 1, overflowY: 'auto', padding: '12px 12px 46px', display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: 'inset 0 10px 14px -10px var(--t-emboss-shadow), inset 0 -10px 14px -10px var(--t-emboss-shadow)',
  },
  // Fixed section between the header and the scrollable content — controls that shouldn't
  // scroll away with the asset grid (e.g. Backgrounds' category slider + No Background).
  expandFixedTop: {
    flexShrink: 0, padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 8,
  },

  /* Search row: input + filter button side by side */
  searchRow: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  searchInputWrap: { position: 'relative', flex: 1 },
  searchInput: {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--t-bg3)', border: '1.5px solid var(--t-border)', color: 'var(--t-text)',
    borderRadius: 24, padding: '9px 38px 9px 14px', fontSize: 13, outline: 'none',
  },
  searchIcon: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--t-text-muted)', display: 'flex', alignItems: 'center', pointerEvents: 'none',
  },

  layoutHint: { fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 4 },

  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  // Same embossed/recessed treatment as pageStrip — the canvas reads as pressed into the
  // surface below the toolbar and beside the rail/panel, instead of a flat, boundary-less
  // fill between them.
  canvasArea: {
    flex: 1, display: 'flex',
    overflow: 'auto', padding: '50px 28px 28px', background: 'var(--t-canvas-bg)', position: 'relative',
    boxShadow: 'inset 0 10px 16px -8px var(--t-emboss-shadow), inset 10px 0 16px -8px var(--t-emboss-shadow), inset 0 -10px 16px -8px var(--t-emboss-shadow)',
  },
  readOnlyBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    background: '#F97316', color: '#fff', textAlign: 'center',
    padding: '8px 16px', fontSize: 13, fontWeight: 700,
  },

  // Canvas toolbar — full-width strip at top of canvas area
  canvasToolbar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--t-surface)', borderBottom: '1px solid var(--t-border)',
    padding: '4px 8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    zIndex: 500,
  },
  toolbarLeft: {
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
  },
  toolTextBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '7px 14px', borderRadius: 9, border: '1px solid var(--t-border)',
    background: 'var(--t-bg3)', color: 'var(--t-text)', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  toolTextBtnActive: {
    background: 'var(--t-accent-light)', borderColor: 'var(--t-accent)', color: 'var(--t-accent)',
  },
  toolbarCenter: {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 8,
    pointerEvents: 'none',
  },
  toolbarRight: {
    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
  },
  toolBtn: {
    width: 34, height: 34, borderRadius: 8, border: 'none',
    background: 'none', cursor: 'pointer', color: 'var(--t-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  toolBtnActive: { background: 'var(--t-accent-light)', color: 'var(--t-accent)' },
  toolBtnImg: { width: 20, height: 20, objectFit: 'contain', userSelect: 'none' },
  toolBtnLg: {
    width: 30, height: 30, borderRadius: 7, border: 'none',
    background: 'none', cursor: 'pointer', color: 'var(--t-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transform: 'translateY(0)', transition: 'transform 0.15s ease',
  },
  toolBtnLgImg: { width: 30, height: 30, objectFit: 'contain', userSelect: 'none', borderRadius: 5 },
  toolBtnLgActive: { background: 'var(--t-accent-light)' },
  toolDivider: { width: 1, height: 20, background: 'var(--t-border)', margin: '0 4px' },

  pageStrip: {
    height: 96, background: 'var(--t-strip-bg)', borderTop: '1px solid var(--t-border)',
    display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 10,
    // marginRight (not padding) structurally shrinks this row so it physically ends before
    // the fixed "Powered by haio" watermark's screen position (bottom-right corner, ~110px
    // footprint incl. its "POWERED BY" label) — a scrollable child can never scroll a tile
    // into space outside its own box, unlike inner padding which the tile can still reach.
    marginRight: 110,
    flexShrink: 0, overflow: 'hidden',
    // Embossed look: a soft inset shadow along the top edge (recessed into the canvas above)
    // and the left edge (recessed into the icon rail beside it), a matching one along the
    // bottom (the strip's own lower boundary, same treatment as the rail's ▲▼ arrow row),
    // plus a very faint highlight just below the top edge, like the strip is pressed into
    // the surrounding surface. --t-emboss-shadow swaps to a gray tone in dark mode — a
    // black shadow is invisible against that theme's near-black surfaces.
    boxShadow: 'inset 0 10px 16px -8px var(--t-emboss-shadow), inset 10px 0 16px -8px var(--t-emboss-shadow), inset 0 -6px 10px -8px var(--t-emboss-shadow), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  thumbScroll: {
    flex: 1,
    display: 'flex', alignItems: 'center', gap: 10,
    overflowX: 'auto', overflowY: 'hidden',
    padding: '4px 4px',
    scrollbarWidth: 'none',
  },
  stripLeftCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
    flexShrink: 0, marginRight: 10,
  },
  stripLabel: {
    fontSize: 13, fontWeight: 700, color: 'var(--t-text)',
    lineHeight: 1.4,
  },
  addPagePill: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: 'var(--t-bg3)', border: 'none', borderRadius: 10,
    padding: '7px 14px', cursor: 'pointer',
    color: 'var(--t-accent)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
  },

  pageThumb: {
    width: 80, height: 74, background: 'var(--t-bg3)', border: '1.5px solid var(--t-border)',
    borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', position: 'relative', flexShrink: 0, outline: 'none',
    overflow: 'hidden',
  },
  pageThumbActive: { border: '2px solid var(--t-accent)', boxShadow: '0 2px 8px rgba(249,115,22,0.25)' },
  pageThumbDragOver: { border: '2px solid var(--t-accent)', opacity: 0.65 },
  pageThumbImg: {
    width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none',
  },
  pageNum: {
    position: 'absolute', bottom: 5, left: 5,
    minWidth: 16, height: 16, padding: '0 4px', borderRadius: 5,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 800, lineHeight: 1,
    background: 'var(--t-surface)', color: 'var(--t-text-muted)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  pageNumActive: { background: 'var(--t-accent)', color: '#fff' },
  thumbMenuBtn: {
    width: 20, height: 20, borderRadius: 4,
    background: 'var(--t-surface)', border: '1px solid var(--t-border)',
    cursor: 'pointer', fontSize: 13, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--t-text-muted)', padding: 0,
  },
  thumbDropdown: {
    position: 'absolute', top: 24, right: 0,
    background: 'var(--t-surface)', border: '1px solid var(--t-border)',
    borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
    padding: 4, zIndex: 200, minWidth: 130,
  },
  thumbDropdownItem: {
    width: '100%', background: 'none', border: 'none',
    borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 600,
    color: '#ef4444', cursor: 'pointer', textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 7,
  },

  emptyCanvas: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, userSelect: 'none', pointerEvents: 'none',
    opacity: 0.75,
  },
  emptyTitle: {
    fontSize: 20, fontWeight: 800, color: 'var(--t-text-muted)', margin: 0,
  },
  emptyHint: {
    fontSize: 13, color: 'var(--t-text-faint)', margin: 0,
  },

  addPicker: {
    position: 'absolute', bottom: 104, right: 16,
    background: 'var(--t-surface)', border: '1px solid var(--t-border)', borderRadius: 12,
    padding: 16, width: 230, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 100,
  },
  addPickerTitle: { fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  addPickerGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 },
  addPickerBtn: {
    background: 'var(--t-bg3)', border: '1.5px solid var(--t-border)', borderRadius: 10,
    padding: '12px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6,
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  addPickerLabel: { fontSize: 9, color: 'var(--t-text-muted)', fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Background subcategory row — single-line horizontal slider (variable count, admin-managed
  // list) flanked by ‹ › arrow buttons. Each chip is its own rounded-square button (#1a1a1a
  // via --t-bg3) with a visible black gap between them, rather than one shared gray track.
  bgChipSlider: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  bgChipArrowBtn: {
    width: 25, height: 25, borderRadius: 7, border: 'none',
    background: 'var(--t-bg3)', color: 'var(--t-text-muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'background 0.15s, color 0.15s',
  },
  bgChipRow: {
    display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
    flex: 1, minWidth: 0, scrollSnapType: 'x mandatory',
  },
  // Effects has a fixed, small category count (Lighting/Weather/Mood) — a segmented-tab
  // bar (equal-width, flush together) instead of the variable-length Backgrounds slider.
  effectTabRow: {
    display: 'flex', background: 'var(--t-bg3)', border: '1px solid var(--t-border)',
    borderRadius: 10, padding: 3, gap: 3, marginBottom: 10,
  },
  effectTab: {
    flex: 1, background: 'none', border: 'none', borderRadius: 7,
    padding: '8px 6px', cursor: 'pointer', color: 'var(--t-text-muted)',
    fontSize: 12.5, fontWeight: 600, transition: 'background 0.15s, color 0.15s',
  },
  effectTabActive: {
    background: 'var(--t-accent)', color: '#fff', fontWeight: 700,
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  // Width is derived from the row's own visible size (not a fixed px) so exactly 3 chips
  // always fill the panel edge-to-edge with no 4th sliver peeking in, at any panel width /
  // responsive breakpoint (--editor-panel-w changes at 1400px/1280px).
  bgChip: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flex: '0 0 calc((100% - 12px) / 3)',
    background: 'var(--t-bg3)', border: 'none', borderRadius: 9,
    padding: '8px 6px', cursor: 'pointer', color: 'var(--t-text-muted)',
    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    transition: 'background 0.15s, color 0.15s', scrollSnapAlign: 'start',
  },
  bgChipActive: {
    background: 'var(--t-accent)', color: '#fff', fontWeight: 700,
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  // "No Background" — moved here from the canvas toolbar since it's a background-specific
  // action; only makes sense while the Backgrounds panel is open.
  noBgPanelBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
    background: 'var(--t-bg3)', border: '1.5px dashed var(--t-border)', borderRadius: 10,
    padding: '8px 12px', marginBottom: 0, cursor: 'pointer',
    color: 'var(--t-text-muted)', fontSize: 13, fontWeight: 700,
  },
  addPickerBtnActive: {
    border: '1.5px solid var(--t-accent)', background: 'var(--t-accent-light)',
    boxShadow: '0 0 0 3px rgba(249,115,22,0.15)',
  },
  overlayActiveTag: {
    fontSize: 8, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase',
    letterSpacing: 0.5, background: 'rgba(249,115,22,0.12)', borderRadius: 4, padding: '1px 6px',
  },
  lightingList: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 },
  lightingRow: {
    background: 'var(--t-bg3)', border: '1px solid var(--t-border)', borderRadius: 8,
    padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'row',
    alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    transition: 'border-color 0.12s ease, background 0.12s ease',
  },
  lightingRowActive: {
    border: '1px solid var(--t-accent)', background: 'var(--t-accent-light)',
  },
  lightingSwatch: {
    width: 14, height: 14, borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0,
  },
  lightingRowLabel: { fontSize: 12.5, color: 'var(--t-text)', fontWeight: 500, letterSpacing: 0.1, flex: 1 },
  overlayHint: { fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5, padding: '0 2px' },
  overlayFieldLabel: {
    display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--t-text)',
  },
  colorInput: { width: '100%', height: 32, border: '1px solid var(--t-border)', borderRadius: 8, padding: 2, cursor: 'pointer' },
  selectInput: {
    width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--t-border)',
    background: 'var(--t-bg3)', color: 'var(--t-text)', fontSize: 12,
  },
  removeOverlayBtn: {
    background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  faceLibGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  faceLibThumb: {
    background: 'var(--t-bg3)', border: '1px solid var(--t-border)', borderRadius: 8,
    padding: 6, cursor: 'pointer', aspectRatio: '1', display: 'flex',
    alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.12s ease',
  },
  addPickerClose: {
    width: '100%', background: 'none', border: '1px solid var(--t-border)', borderRadius: 6,
    color: 'var(--t-text-faint)', padding: '6px 0', fontSize: 11, cursor: 'pointer',
  },

  /* Zoom dropdown */
  zoomSliderDock: {
    position: 'absolute', top: 12, right: 12, zIndex: 60,
    background: 'var(--t-surface)', border: '1px solid var(--t-border)',
    borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  zoomResetBtn: {
    marginTop: 2, background: 'none', border: 'none',
    fontSize: 12, fontWeight: 600, color: 'var(--t-accent)', cursor: 'pointer', padding: '2px 4px',
  },

  /* Fullscreen overlay */
  fsOverlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(10,10,20,0.96)',
    display: 'flex', flexDirection: 'column',
  },
  fsTopBar: {
    height: 56, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  fsNavGroup: { display: 'flex', alignItems: 'center', gap: 12 },
  fsNavBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
  },
  fsPageInfo: {
    fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', minWidth: 100, textAlign: 'center',
  },
  fsCloseBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 10, padding: '8px 16px',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  fsContent: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  fsHint: {
    height: 38, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 500,
    letterSpacing: 0.3,
  },

  titleBar: {
    flexShrink: 0,
    padding: '5px 16px',
    background: 'var(--t-bg2)',
    borderBottom: '1.5px solid var(--t-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
};
