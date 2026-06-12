import { useEffect, useState } from 'react';
import { getLightingPresets } from '../api/lighting.js';

// ── Lighting overlay engine ───────────────────────────────────────────────────
// Each preset is defined by color-grade slider values (Temperature, Tint, Brightness,
// Contrast, Highlights, Shadows, Saturation, Vibrance, plus Bloom/Glow/Blur for a few).
// buildLightingLayers() converts those sliders into a stack of semi-transparent,
// blend-mode CSS layers — pure CSS, so they scale to any panel size, work over
// backgrounds/characters/props/transparent PNGs alike, and add zero asset weight.
// Presets are admin-editable (see LightingAdjuster) and fetched from the server;
// DEFAULT_LIGHTING_PRESETS below is only the offline fallback / seed shape.
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const DEFAULT_LIGHTING_PRESETS = {
  morning:     { label: 'Soft Gold',    icon: '', temperature: 18,  tint: 3,   brightness: 15,  contrast: -5,  highlights: 10,  shadows: 15,  saturation: 5,   vibrance: 10, rays: true,  overlayColor: '#fde68a', overlayBlendMode: 'soft-light', overlayOpacity: 22 },
  daytime:     { label: 'Neutral',      icon: '', temperature: 0,   tint: 0,   brightness: 0,   contrast: 0,   highlights: 0,   shadows: 0,   saturation: 0,   vibrance: 0 },
  evening:     { label: 'Bold Amber',   icon: '', temperature: 45,  tint: 4,   brightness: -2,  contrast: 16,  highlights: -6,  shadows: 14,  saturation: 6,   vibrance: 12, overlayColor: '#c8702f', overlayBlendMode: 'color',      overlayOpacity: 58 },
  night:       { label: 'Deep Indigo',  icon: '', temperature: -30, tint: -5,  brightness: -30, contrast: 20,  highlights: -20, shadows: -20, saturation: -10, vibrance: -10, overlayColor: '#1e3a8a', overlayBlendMode: 'multiply',   overlayOpacity: 30 },
  moonlight:   { label: 'Pale Blue',    icon: '', temperature: -25, tint: 5,   brightness: -18, contrast: 8,   highlights: -10, shadows: -15, saturation: -15, vibrance: -10, overlayColor: '#93c5fd', overlayBlendMode: 'soft-light', overlayOpacity: 22 },
  rainy:       { label: 'Muted Slate',  icon: '', temperature: -10, tint: 0,   brightness: -10, contrast: -8,  highlights: -15, shadows: 10,  saturation: -20, vibrance: -15, overlayColor: '#64748b', overlayBlendMode: 'multiply',   overlayOpacity: 18 },
  storm:       { label: 'Dark Charcoal', icon: '', temperature: -15, tint: 0,   brightness: -22, contrast: 28,  highlights: -30, shadows: -15, saturation: -25, vibrance: -20, flash: true, overlayColor: '#1e293b', overlayBlendMode: 'multiply', overlayOpacity: 28 },
  horror:      { label: 'Deep Crimson', icon: '', temperature: -20, tint: 20,  brightness: -25, contrast: 32,  highlights: -20, shadows: -32, saturation: -15, vibrance: -10, overlayColor: '#4c0519', overlayBlendMode: 'multiply',   overlayOpacity: 32 },
  dream:       { label: 'Hazy Lilac',   icon: '', temperature: 10,  tint: 5,   brightness: 20,  contrast: -20, highlights: 30,  shadows: 20,  saturation: -10, vibrance: 5,  bloom: 32, glow: 25, blur: 3, overlayColor: '#e9d5ff', overlayBlendMode: 'soft-light', overlayOpacity: 26 },
  goldenHour:  { label: 'Warm Amber',   icon: '', temperature: 38,  tint: 8,   brightness: 10,  contrast: 10,  highlights: 15,  shadows: 15,  saturation: 20,  vibrance: 25, overlayColor: '#fb923c', overlayBlendMode: 'overlay',    overlayOpacity: 24 },
  underwater:  { label: 'Deep Teal',    icon: '', temperature: -32, tint: -10, brightness: -10, contrast: 10,  highlights: -20, shadows: -10, saturation: -5,  vibrance: 15, overlayColor: '#0e7490', overlayBlendMode: 'multiply',   overlayOpacity: 30 },
  magicalGlow: { label: 'Violet Glow',  icon: '', temperature: 10,  tint: 15,  brightness: 15,  contrast: 5,   highlights: 25,  shadows: 10,  saturation: 20,  vibrance: 30, bloom: 32, overlayColor: '#a78bfa', overlayBlendMode: 'screen',     overlayOpacity: 22 },
  neon:        { label: 'Vivid Magenta', icon: '', temperature: -5,  tint: 25,  brightness: 10,  contrast: 20,  highlights: 20,  shadows: -10, saturation: 30,  vibrance: 42, overlayColor: '#e879f9', overlayBlendMode: 'screen',     overlayOpacity: 20 },
  crimsonNoir: { label: 'Crimson Noir', icon: '', temperature: -5,  tint: 0,   brightness: -25, contrast: 35,  highlights: -15, shadows: -35, saturation: -10, vibrance: 0,  overlayColor: '#8b0000', overlayBlendMode: 'multiply',   overlayOpacity: 55 },
  periwinkle:  { label: 'Periwinkle Blue', icon: '', temperature: -22, tint: 8,  brightness: -14, contrast: 6,   highlights: -12, shadows: -10, saturation: -12, vibrance: 0,  overlayColor: '#5b6c9e', overlayBlendMode: 'color',      overlayOpacity: 62 },
  forestGreen: { label: 'Forest Green',    icon: '', temperature: -8,  tint: -18, brightness: -8,  contrast: 8,   highlights: -8,  shadows: -6,  saturation: -5,  vibrance: 5,  overlayColor: '#4a8f4f', overlayBlendMode: 'color',      overlayOpacity: 62 },
  brightCyan:  { label: 'Bright Cyan',     icon: '', temperature: -28, tint: -10, brightness: -4,  contrast: 6,   highlights: -6,  shadows: -4,  saturation: 0,   vibrance: 8,  overlayColor: '#1b97a1', overlayBlendMode: 'color',      overlayOpacity: 60 },
};

// `intensity` is a master strength dial (100 = the tuned default, lower = subtler,
// higher = stronger) that scales every layer's opacity uniformly. Admins can use it
// to push a preset from barely-there to dramatic without re-balancing every slider.
export function buildLightingLayers(p) {
  const layers = [];
  const k = clamp((p.intensity ?? 100) / 100, 0, 2.5);
  const fade = (amt) => clamp(amt * k, 0, 1);

  // Blur — own transparent layer so it doesn't fight with color blending
  if (p.blur) layers.push({ background: 'transparent', backdropFilter: `blur(${p.blur * k}px)` });

  // Color grade — Temperature (warm amber ↔ cool blue) blended with Tint (magenta ↔ green)
  const t = p.temperature || 0, tt = p.tint || 0;
  if (t || tt) {
    const r = clamp(128 + t * 1.3 + tt * 0.5, 0, 255) | 0;
    const g = clamp(128 - tt * 1.1,           0, 255) | 0;
    const b = clamp(128 - t * 1.3 + tt * 0.3, 0, 255) | 0;
    const amt = fade(clamp((Math.abs(t) + Math.abs(tt)) / 2 / 100, 0, 1) * 0.30);
    if (amt > 0.01) layers.push({ background: `rgba(${r},${g},${b},${amt.toFixed(2)})`, mixBlendMode: 'soft-light' });
  }

  // Exposure — Brightness + Highlights + Shadows folded into one screen/multiply wash
  const exposure = (p.brightness || 0) * 0.6 + (p.highlights || 0) * 0.25 + (p.shadows || 0) * 0.15;
  if (Math.abs(exposure) > 1) {
    const amt = fade(clamp(Math.abs(exposure) / 100, 0, 1) * 0.32);
    layers.push(exposure > 0
      ? { background: `rgba(255,255,255,${amt.toFixed(2)})`, mixBlendMode: 'screen' }
      : { background: `rgba(0,0,0,${amt.toFixed(2)})`,       mixBlendMode: 'multiply' });
  }

  // Contrast — soft vignette for punch (+) or a light haze wash to flatten (-)
  const c = p.contrast || 0;
  if (c > 1) {
    const amt = fade(clamp(c / 100, 0, 1) * 0.28);
    layers.push({ background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${amt.toFixed(2)}) 100%)`, mixBlendMode: 'multiply' });
  } else if (c < -1) {
    const amt = fade(clamp(-c / 100, 0, 1) * 0.20);
    layers.push({ background: `rgba(255,255,255,${amt.toFixed(2)})`, mixBlendMode: 'overlay' });
  }

  // Saturation + Vibrance — desaturate via gray 'saturation' blend, or richen via a vivid one
  const sat = (p.saturation || 0) + (p.vibrance || 0);
  if (sat < -2) {
    const amt = fade(clamp(-sat / 200, 0, 1) * 0.85);
    layers.push({ background: `rgba(128,128,128,${amt.toFixed(2)})`, mixBlendMode: 'saturation' });
  } else if (sat > 2) {
    const amt = fade(clamp(sat / 200, 0, 1) * 0.5);
    layers.push({ background: `rgba(255,80,60,${amt.toFixed(2)})`, mixBlendMode: 'saturation' });
  }

  // Bloom / Glow — soft radiant glow from panel center
  const glow = (p.bloom || 0) + (p.glow || 0);
  if (glow > 0) {
    const amt = fade(clamp(glow / 130, 0, 1) * 0.55);
    layers.push({ background: `radial-gradient(circle at 50% 45%, rgba(255,255,255,${amt.toFixed(2)}), transparent 65%)`, mixBlendMode: 'screen' });
  }

  // Custom color overlay — admin-picked color + blend mode (e.g. Night's blue multiply wash)
  if (p.overlayColor && p.overlayOpacity > 0) {
    const rgb = hexToRgb(p.overlayColor);
    if (rgb) {
      const amt = fade(clamp(p.overlayOpacity / 100, 0, 1));
      if (amt > 0.01) layers.push({ background: `rgba(${rgb.r},${rgb.g},${rgb.b},${amt.toFixed(2)})`, mixBlendMode: p.overlayBlendMode || 'multiply' });
    }
  }

  // Light rays — diagonal sunbeam streaks (Morning)
  if (p.rays) {
    layers.push({ background: `repeating-linear-gradient(115deg, rgba(255,255,255,${fade(0.12).toFixed(2)}) 0px, rgba(255,255,255,${fade(0.12).toFixed(2)}) 3px, transparent 3px, transparent 46px)`, mixBlendMode: 'soft-light' });
  }

  return layers;
}

function buildOverlay(p) {
  return { label: p.label, icon: p.icon, layers: buildLightingLayers(p), flash: !!p.flash };
}

const FALLBACK_OVERLAYS = Object.fromEntries(
  Object.entries(DEFAULT_LIGHTING_PRESETS).map(([id, p]) => [id, buildOverlay(p)])
);

// ── Shared cache so every Panel + the admin adjuster see the same live presets ──
let cachedOverlays = null;
let loadPromise = null;
const subscribers = new Set();

function notify() {
  subscribers.forEach((cb) => cb(cachedOverlays));
}

export function loadLightingOverlays(force = false) {
  if (loadPromise && !force) return loadPromise;
  loadPromise = getLightingPresets()
    .then((presets) => {
      cachedOverlays = Object.fromEntries(presets.map((p) => [p.id, buildOverlay(p)]));
      notify();
      return cachedOverlays;
    })
    .catch(() => null);
  return loadPromise;
}

export function useLightingOverlays() {
  const [overlays, setOverlays] = useState(() => cachedOverlays || FALLBACK_OVERLAYS);

  useEffect(() => {
    const onUpdate = (next) => { if (next) setOverlays(next); };
    subscribers.add(onUpdate);
    loadLightingOverlays();
    return () => subscribers.delete(onUpdate);
  }, []);

  return overlays;
}
