const prisma = require('../config/prisma');

const DEFAULT_PRESETS = [
  { id: 'morning',     label: 'Soft Gold',    icon: '', temperature: 18,  tint: 3,   brightness: 15,  contrast: -5,  highlights: 10,  shadows: 15,  saturation: 5,   vibrance: 10, rays: true,  overlayColor: '#fde68a', overlayBlendMode: 'soft-light', overlayOpacity: 22 },
  { id: 'daytime',     label: 'Neutral',      icon: '', temperature: 0,   tint: 0,   brightness: 0,   contrast: 0,   highlights: 0,   shadows: 0,   saturation: 0,   vibrance: 0 },
  { id: 'evening',     label: 'Bold Amber',   icon: '', temperature: 45,  tint: 4,   brightness: -2,  contrast: 16,  highlights: -6,  shadows: 14,  saturation: 6,   vibrance: 12, overlayColor: '#c8702f', overlayBlendMode: 'color',      overlayOpacity: 58 },
  { id: 'night',       label: 'Deep Indigo',  icon: '', temperature: -30, tint: -5,  brightness: -30, contrast: 20,  highlights: -20, shadows: -20, saturation: -10, vibrance: -10, overlayColor: '#1e3a8a', overlayBlendMode: 'multiply',   overlayOpacity: 30 },
  { id: 'moonlight',   label: 'Pale Blue',    icon: '', temperature: -25, tint: 5,   brightness: -18, contrast: 8,   highlights: -10, shadows: -15, saturation: -15, vibrance: -10, overlayColor: '#93c5fd', overlayBlendMode: 'soft-light', overlayOpacity: 22 },
  { id: 'rainy',       label: 'Muted Slate',  icon: '', temperature: -10, tint: 0,   brightness: -10, contrast: -8,  highlights: -15, shadows: 10,  saturation: -20, vibrance: -15, overlayColor: '#64748b', overlayBlendMode: 'multiply',   overlayOpacity: 18 },
  { id: 'storm',       label: 'Dark Charcoal', icon: '', temperature: -15, tint: 0,   brightness: -22, contrast: 28,  highlights: -30, shadows: -15, saturation: -25, vibrance: -20, flash: true, overlayColor: '#1e293b', overlayBlendMode: 'multiply', overlayOpacity: 28 },
  { id: 'horror',      label: 'Deep Crimson', icon: '', temperature: -20, tint: 20,  brightness: -25, contrast: 32,  highlights: -20, shadows: -32, saturation: -15, vibrance: -10, overlayColor: '#4c0519', overlayBlendMode: 'multiply',   overlayOpacity: 32 },
  { id: 'dream',       label: 'Hazy Lilac',   icon: '', temperature: 10,  tint: 5,   brightness: 20,  contrast: -20, highlights: 30,  shadows: 20,  saturation: -10, vibrance: 5,  bloom: 32, glow: 25, blur: 3, overlayColor: '#e9d5ff', overlayBlendMode: 'soft-light', overlayOpacity: 26 },
  { id: 'goldenHour',  label: 'Warm Amber',   icon: '', temperature: 38,  tint: 8,   brightness: 10,  contrast: 10,  highlights: 15,  shadows: 15,  saturation: 20,  vibrance: 25, overlayColor: '#fb923c', overlayBlendMode: 'overlay',    overlayOpacity: 24 },
  { id: 'underwater',  label: 'Deep Teal',    icon: '', temperature: -32, tint: -10, brightness: -10, contrast: 10,  highlights: -20, shadows: -10, saturation: -5,  vibrance: 15, overlayColor: '#0e7490', overlayBlendMode: 'multiply',   overlayOpacity: 30 },
  { id: 'magicalGlow', label: 'Violet Glow',  icon: '', temperature: 10,  tint: 15,  brightness: 15,  contrast: 5,   highlights: 25,  shadows: 10,  saturation: 20,  vibrance: 30, bloom: 32, overlayColor: '#a78bfa', overlayBlendMode: 'screen',     overlayOpacity: 22 },
  { id: 'neon',        label: 'Vivid Magenta', icon: '', temperature: -5,  tint: 25,  brightness: 10,  contrast: 20,  highlights: 20,  shadows: -10, saturation: 30,  vibrance: 42, overlayColor: '#e879f9', overlayBlendMode: 'screen',     overlayOpacity: 20 },
  { id: 'crimsonNoir', label: 'Crimson Noir', icon: '', temperature: -5,  tint: 0,   brightness: -25, contrast: 35,  highlights: -15, shadows: -35, saturation: -10, vibrance: 0,  overlayColor: '#8b0000', overlayBlendMode: 'multiply',   overlayOpacity: 55 },
  { id: 'periwinkle',  label: 'Periwinkle Blue', icon: '', temperature: -22, tint: 8,  brightness: -14, contrast: 6,   highlights: -12, shadows: -10, saturation: -12, vibrance: 0,  overlayColor: '#5b6c9e', overlayBlendMode: 'color',      overlayOpacity: 62 },
  { id: 'forestGreen', label: 'Forest Green',    icon: '', temperature: -8,  tint: -18, brightness: -8,  contrast: 8,   highlights: -8,  shadows: -6,  saturation: -5,  vibrance: 5,  overlayColor: '#4a8f4f', overlayBlendMode: 'color',      overlayOpacity: 62 },
  { id: 'brightCyan',  label: 'Bright Cyan',     icon: '', temperature: -28, tint: -10, brightness: -4,  contrast: 6,   highlights: -6,  shadows: -4,  saturation: 0,   vibrance: 8,  overlayColor: '#1b97a1', overlayBlendMode: 'color',      overlayOpacity: 60 },
];

const PARAM_FIELDS = [
  'intensity', 'temperature', 'tint', 'brightness', 'contrast', 'highlights',
  'shadows', 'saturation', 'vibrance', 'bloom', 'glow', 'blur', 'overlayOpacity',
];
const BOOL_FIELDS = ['rays', 'flash'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

const ensureSeeded = async () => {
  const count = await prisma.lightingPreset.count();
  if (count > 0) return;
  await prisma.lightingPreset.createMany({
    data: DEFAULT_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      intensity: p.intensity || 100,
      temperature: p.temperature || 0,
      tint: p.tint || 0,
      brightness: p.brightness || 0,
      contrast: p.contrast || 0,
      highlights: p.highlights || 0,
      shadows: p.shadows || 0,
      saturation: p.saturation || 0,
      vibrance: p.vibrance || 0,
      bloom: p.bloom || 0,
      glow: p.glow || 0,
      blur: p.blur || 0,
      rays: !!p.rays,
      flash: !!p.flash,
      overlayColor: p.overlayColor || null,
      overlayBlendMode: p.overlayBlendMode || 'multiply',
      overlayOpacity: p.overlayOpacity || 0,
    })),
  });
};

const getPresets = async (req, res) => {
  await ensureSeeded();
  const presets = await prisma.lightingPreset.findMany({ orderBy: { label: 'asc' } });
  res.json(presets);
};

const updatePreset = async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.lightingPreset.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Preset not found' });

  const data = {};
  if (typeof req.body.label === 'string') data.label = req.body.label;
  if (typeof req.body.icon === 'string') data.icon = req.body.icon;
  for (const field of PARAM_FIELDS) {
    if (req.body[field] !== undefined) {
      const n = Number(req.body[field]);
      if (!Number.isFinite(n)) return res.status(400).json({ error: `Invalid value for ${field}` });
      data[field] = Math.round(n);
    }
  }
  for (const field of BOOL_FIELDS) {
    if (req.body[field] !== undefined) data[field] = !!req.body[field];
  }
  if (req.body.overlayColor !== undefined) {
    if (req.body.overlayColor !== null && !HEX_COLOR.test(req.body.overlayColor)) {
      return res.status(400).json({ error: 'overlayColor must be a hex color like #1e3a8a' });
    }
    data.overlayColor = req.body.overlayColor;
  }
  if (req.body.overlayBlendMode !== undefined) {
    if (!BLEND_MODES.includes(req.body.overlayBlendMode)) {
      return res.status(400).json({ error: 'Invalid overlayBlendMode' });
    }
    data.overlayBlendMode = req.body.overlayBlendMode;
  }

  const preset = await prisma.lightingPreset.update({ where: { id }, data });
  res.json(preset);
};

module.exports = { getPresets, updatePreset };
