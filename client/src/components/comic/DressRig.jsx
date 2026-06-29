import { useState, useEffect, useMemo } from 'react';
import { loadTrimRect, trimmedRect } from '../../utils/trimRect.js';
import { hexToRgb } from '../../lighting/lightingEngine.js';
import { classifyFacePart, resolveLayoutFilePaths } from '../../utils/faceLayout.js';
import { recolorSkin } from '../../utils/recolorImage.js';

const DRESS_CANVAS_W = 400;
const DRESS_CANVAS_H = 600;
const MAX_W = 120;
const MAX_H = 200;

// Compute tight content bounds using actual visual (trim-aware) extents.
function contentLayout(parts, trims = {}) {
  const valid = parts.filter((p) => p.w > 0 && p.h > 0);
  if (valid.length === 0) return { drawW: MAX_W, drawH: MAX_H, drawScale: MAX_W / DRESS_CANVAS_W, drawLeft: 0, drawTop: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of valid) {
    const trim = trims[p.filePath];
    if (trim && trim.maxX > trim.minX && trim.maxY > trim.minY) {
      const tw = trim.maxX - trim.minX;
      const th = trim.maxY - trim.minY;
      const scale = Math.min(p.w / tw, p.h / th);
      const cw = tw * scale;
      const ch = th * scale;
      const left = p.x + (p.w - cw) / 2;
      const top = p.y + (p.h - ch) / 2;
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + cw);
      maxY = Math.max(maxY, top + ch);
    } else {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
  }
  if (!isFinite(minX)) return { drawW: MAX_W, drawH: MAX_H, drawScale: MAX_W / DRESS_CANVAS_W, drawLeft: 0, drawTop: 0 };
  const cw = maxX - minX || DRESS_CANVAS_W;
  const ch = maxY - minY || DRESS_CANVAS_H;
  const drawScale = Math.min(MAX_W / cw, MAX_H / ch);
  return {
    drawW: Math.round(cw * drawScale),
    drawH: Math.round(ch * drawScale),
    drawScale,
    drawLeft: -minX * drawScale,
    drawTop: -minY * drawScale,
  };
}

const FACE_PART_KEYS = ['eye', 'nose', 'mouth', 'faceShape'];

// Determine which character.parts key this layout part can be overridden by.
function getDressKey(part) {
  if (part.dressRole) return part.dressRole;
  if (part.partCategory === 'hair') return 'hairstyle';
  const faceClass = classifyFacePart(part.partType || part.name || '');
  if (FACE_PART_KEYS.includes(faceClass)) return faceClass;
  // Tag-based fallback (layouts saved after tag-tracking was added)
  const tags = part.tags || [];
  for (const t of ['cloth', 'neck', 'hands']) {
    if (tags.includes(t)) return t;
  }
  // Name-based fallback (mirrors PartAssembler alignablePartType)
  const n = (part.customName || part.name || '').toLowerCase();
  if (n.includes('neck')) return 'neck';
  if (n.includes('hand')) return 'hands';
  // Explicit "Clothing" tag or no category → swappable cloth/outfit layer
  if (!part.partCategory || part.partCategory === 'clothing') return 'cloth';
  return null;
}

function overlayDiv(rgb, overlay, rect, filePath) {
  if (!rgb) return null;
  return (
    <div style={{
      position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
      background: `rgba(${rgb.r},${rgb.g},${rgb.b},${(overlay.opacity ?? 50) / 100})`,
      mixBlendMode: overlay.blendMode || 'multiply', pointerEvents: 'none',
      WebkitMaskImage: `url(${filePath})`, maskImage: `url(${filePath})`,
      WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
      WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    }} />
  );
}

function DressPart({ part, charSkinPreset, charHairOverlay }) {
  const [trim, setTrim] = useState(null);
  useEffect(() => {
    let active = true;
    loadTrimRect(part.filePath).then((t) => { if (active) setTrim(t); });
    return () => { active = false; };
  }, [part.filePath]);

  // Exact pixel-color skin swap (Comic UI "Skin Color" tool) — only for skin-category parts.
  const [recoloredSrc, setRecoloredSrc] = useState(null);
  useEffect(() => {
    if (part.partCategory !== 'skin' || !charSkinPreset) { setRecoloredSrc(null); return; }
    let active = true;
    recolorSkin(part.filePath, charSkinPreset).then((url) => { if (active) setRecoloredSrc(url); });
    return () => { active = false; };
  }, [part.filePath, part.partCategory, charSkinPreset]);

  const transform = [
    part.rotation ? `rotate(${part.rotation}deg)` : '',
    part.flipX ? 'scaleX(-1)' : '',
    part.flipY ? 'scaleY(-1)' : '',
  ].filter(Boolean).join(' ');

  const rect = trimmedRect(trim, 0, 0, part.w, part.h);
  const imgSrc = recoloredSrc || part.filePath;

  // Part-level assembly overlays (baked in DressBuilder)
  const skinRgb = part.skinOverlay ? hexToRgb(part.skinOverlay.color) : null;
  const hairRgb = part.hairOverlay ? hexToRgb(part.hairOverlay.color) : null;
  // Character-level hair overlay from Comic UI (applied per partCategory)
  const charHairRgb = charHairOverlay ? hexToRgb(charHairOverlay.color) : null;

  return (
    <div style={{
      position: 'absolute', left: part.x, top: part.y, width: part.w, height: part.h,
      transform, transformOrigin: 'center', overflow: 'hidden', pointerEvents: 'none',
    }}>
      <img src={imgSrc} alt="" draggable={false}
        style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, pointerEvents: 'none' }} />
      {overlayDiv(skinRgb, part.skinOverlay, rect, imgSrc)}
      {overlayDiv(hairRgb, part.hairOverlay, rect, imgSrc)}
      {overlayDiv(charHairRgb, charHairOverlay, rect, imgSrc)}
    </div>
  );
}

export default function DressRig({ character, onSize }) {
  const [layout, setLayout] = useState(null);
  const [trims, setTrims] = useState({});

  useEffect(() => {
    if (!character.layoutPath) return;
    setLayout(null);
    setTrims({});
    fetch(character.layoutPath)
      .then((r) => r.json())
      .then(resolveLayoutFilePaths)
      .then(setLayout)
      .catch(() => {});
  }, [character.layoutPath]);

  // Load trim rects for all layout parts so contentLayout uses visual bounds, not slot bounds.
  useEffect(() => {
    if (!layout) return;
    const filePaths = [...new Set(layout.map((p) => p.filePath).filter(Boolean))];
    let active = true;
    Promise.all(filePaths.map((fp) => loadTrimRect(fp).then((t) => [fp, t])))
      .then((results) => {
        if (!active) return;
        const map = {};
        results.forEach(([fp, t]) => { map[fp] = t; });
        setTrims(map);
      });
    return () => { active = false; };
  }, [layout]);

  const dims = useMemo(
    () => (layout ? contentLayout(layout, trims) : null),
    [layout, trims],
  );

  // Report actual rendered size to parent so selection handles match visual bounds.
  useEffect(() => {
    if (dims) onSize?.(dims.drawW, dims.drawH);
  }, [dims]); // eslint-disable-line

  if (!layout) {
    return (
      <img src={character.filePath} alt={character.name} draggable={false}
        style={{ width: MAX_W, height: MAX_H, objectFit: 'contain', display: 'block' }} />
    );
  }

  const { drawW, drawH, drawScale, drawLeft, drawTop } = dims;

  // Apply part overrides keyed by getDressKey result
  const activeParts = layout
    .map((part) => {
      const key = getDressKey(part);
      const override = key && character.parts?.[key];
      return override ? { ...part, filePath: override.filePath, assetId: override.assetId } : part;
    })
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div style={{ width: drawW, height: drawH, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: drawLeft, top: drawTop,
        width: DRESS_CANVAS_W, height: DRESS_CANVAS_H,
        transform: `scale(${drawScale})`, transformOrigin: 'top left',
      }}>
        {activeParts.map((part, i) => (
          <DressPart
            key={`${part.assetId}-${i}`}
            part={part}
            charSkinPreset={character.skinPreset}
            charHairOverlay={part.partCategory === 'hair' ? character.hairOverlay : null}
          />
        ))}
      </div>
    </div>
  );
}
