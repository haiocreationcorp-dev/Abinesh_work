import { useState, useEffect, useRef, useCallback } from 'react';
import { getAssets, uploadAsset, getFacePartAlignment, saveFacePartAlignment } from '../../../api/assets.js';
import { computeTrimRect, loadTrimRect, trimmedRect } from '../../../utils/trimRect.js';
import { resolveLayoutFilePaths } from '../../../utils/faceLayout.js';
import { hexToRgb } from '../../../lighting/lightingEngine.js';
import { VIEWS, GENDERS } from '../../../constants/categories.js';
import { sliderFillStyle } from '../../../utils/sliderFill.js';
import {
  Undo2, Redo2, Trash2, Plus, Minus, ChevronUp, ChevronDown, X,
  FlipHorizontal, FlipVertical, Crosshair, Scissors, Pin, UploadCloud,
} from 'lucide-react';

const ORANGE = '#F97316';
const CANVAS_W = 500;
const CANVAS_H = 600;
const MAX_HISTORY = 50;
const GROUP_COLORS = ['#818CF8', '#34D399', '#F472B6', '#FBBF24', '#60A5FA'];

// Color overlay blend modes for the skin-tone overlay (same idea as panel lighting presets).
const OVERLAY_BLEND_MODES = [
  'multiply', 'color', 'soft-light', 'overlay', 'hue', 'saturation',
  'color-dodge', 'color-burn', 'hard-light', 'screen', 'luminosity', 'normal',
];

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Classifies a part/asset as a face-part type whose position can be calibrated
// per-face ('hairstyle' | 'nose' | 'eye' | 'mouth'), or — in dress-alignment mode —
// as a dress-part type ('face' | 'neck' | 'hands') calibrated per-costume, or null
// if it's not one of those.
function alignablePartType(item, dressMode) {
  const n = (item.customName || item.name || '').toLowerCase();
  if (dressMode) {
    if (item.partCategory === 'face') return 'face';
    if (item.dressRole === 'neck' || item.partType === 'neck' || n.includes('neck') || item.tags?.includes('neck')) return 'neck';
    if (item.dressRole === 'hands' || item.partType === 'hands' || n.includes('hand') || item.tags?.includes('hands')) return 'hands';
    return null;
  }
  // item.partType (FACE_SHAPE/HAIR/EYES/MOUTH) is the structured field new FACE_PART
  // uploads carry; the name/tag heuristics remain as a fallback for assets uploaded
  // before that field existed. "Face Shape" includes the nose — no separate nose type.
  if (item.partType === 'HAIR' || n.includes('hair') || item.tags?.includes('hairstyle') || item.partCategory === 'hair') return 'hairstyle';
  if (item.partType === 'EYES' || n.includes('eye') || item.tags?.includes('eye')) return 'eye';
  if (item.partType === 'MOUTH' || n.includes('mouth') || item.tags?.includes('mouth')) return 'mouth';
  if (item.partType === 'FACE_SHAPE' || n.includes('face') || n.includes('nose') || item.tags?.includes('nose')) return 'face';
  return null;
}

const ALIGNABLE_PART_LABELS = { hairstyle: 'Hairstyle', eye: 'Eye', mouth: 'Mouth', face: 'Face', neck: 'Neck', hands: 'Hands' };

// Maps the FACE_PART_TYPES filter-chip ids (FACE_SHAPE/HAIR/EYES/MOUTH) to the
// alignablePartType() label they correspond to, so the Library filter can reuse that
// same structured-partType-first, tag/name-fallback matching logic instead of checking
// `tags` directly (which structured FACE_PART uploads don't populate with these values).
const TYPE_FILTER_TO_ALIGNABLE = { FACE_SHAPE: 'face', HAIR: 'hairstyle', EYES: 'eye', MOUTH: 'mouth' };

// Nose/eye/mouth/dress-part alignments are shared across all assets of that type for a
// given face/costume (the "slot" doesn't move when the variant changes); only hairstyle
// is calibrated per-asset.
const SHARED_ALIGNMENT_KEY = '__ALL__';
const alignmentAssetId = (partType, assetId) => (partType === 'hairstyle' ? assetId : SHARED_ALIGNMENT_KEY);

// Appends a cache-busting query param so an updated-in-place asset's new image
// content is fetched instead of the browser's cached copy of the old file.
const thumbSrc = (asset) => asset.updatedAt ? `${asset.filePath}?v=${new Date(asset.updatedAt).getTime()}` : asset.filePath;

const genGroupId = () => `g-${Date.now().toString(36)}`;
const groupColor = (gid) => { if (!gid) return null; const h = [...gid].reduce((a, c) => a + c.charCodeAt(0), 0); return GROUP_COLORS[h % GROUP_COLORS.length]; };

function svgToDataUrl(svgText) {
  try {
    const bytes = new TextEncoder().encode(svgText);
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  } catch {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  }
}

// Make a valid XML ID from a part name; ensure uniqueness within the set.
function makePartId(name, usedIds) {
  let base = (name || 'part').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^([^a-zA-Z_])/, '_$1');
  let id = base;
  let n = 2;
  while (usedIds.has(id)) { id = `${base}_${n++}`; }
  usedIds.add(id);
  return id;
}

// Converts a part's file (SVG or raster) into a data URL usable as an <image> href.
async function partFileToDataUrl(filePath) {
  if (filePath.toLowerCase().endsWith('.svg')) {
    const text = await fetch(filePath).then((r) => r.text());
    return svgToDataUrl(text);
  }
  const blob = await fetch(filePath).then((r) => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildAssembledSvg(parts, trimCache = {}) {
  const sorted = [...parts].sort((a, b) => a.zIndex - b.zIndex);
  const fetched = await Promise.all(
    sorted.map((p) => partFileToDataUrl(p.filePath).catch(() => ''))
  );
  const trims = await Promise.all(
    sorted.map((p) => p.filePath in trimCache ? Promise.resolve(trimCache[p.filePath]) : loadTrimRect(p.filePath))
  );
  const defs = [];
  const usedIds = new Set();
  const groups = sorted.map((p, i) => {
    const href = fetched[i];
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const tfm = [
      p.rotation ? `rotate(${p.rotation} ${cx} ${cy})` : '',
      p.flipX    ? `translate(${2 * cx} 0) scale(-1 1)` : '',
      p.flipY    ? `translate(0 ${2 * cy}) scale(1 -1)` : '',
    ].filter(Boolean).join(' ');
    const cl = p.clip?.l ?? 0, ct = p.clip?.t ?? 0, cr = p.clip?.r ?? 0, cb = p.clip?.b ?? 0;
    const cid = `clip${i}`;
    defs.push(`<clipPath id="${cid}"><rect x="${p.x + p.w * cl / 100}" y="${p.y + p.h * ct / 100}" width="${p.w * (1 - (cl + cr) / 100)}" height="${p.h * (1 - (ct + cb) / 100)}"/></clipPath>`);
    // Bake the live canvas's trim-to-content rendering into the exported SVG.
    const rect = trimmedRect(trims[i], p.x, p.y, p.w, p.h);
    // Skin tone / hair color overlays — color washes blended over this part, like panel lighting presets.
    let overlayLine = '';
    if (p.skinOverlay) {
      const rgb = hexToRgb(p.skinOverlay.color);
      if (rgb) {
        const opacity = (p.skinOverlay.opacity ?? 50) / 100;
        const maskId = `skinMask${i}`;
        defs.push(`<mask id="${maskId}" style="mask-type:alpha"><image x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" href="${href}" preserveAspectRatio="xMidYMid meet"/></mask>`);
        overlayLine += `\n    <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${p.skinOverlay.color}" opacity="${opacity}" style="mix-blend-mode:${p.skinOverlay.blendMode || 'multiply'}" mask="url(#${maskId})"/>`;
      }
    }
    if (p.hairOverlay) {
      const rgb = hexToRgb(p.hairOverlay.color);
      if (rgb) {
        const opacity = (p.hairOverlay.opacity ?? 50) / 100;
        const maskId = `hairMask${i}`;
        defs.push(`<mask id="${maskId}" style="mask-type:alpha"><image x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" href="${href}" preserveAspectRatio="xMidYMid meet"/></mask>`);
        overlayLine += `\n    <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${p.hairOverlay.color}" opacity="${opacity}" style="mix-blend-mode:${p.hairOverlay.blendMode || 'multiply'}" mask="url(#${maskId})"/>`;
      }
    }
    // Wrap in <g id="..."> so the Pose Editor can select each part by ID
    const partId = makePartId(p.customName || p.name, usedIds);
    const gTfm = tfm ? ` transform="${tfm}"` : '';
    return [
      `  <g id="${partId}" inkscape:label="${partId}"${gTfm} clip-path="url(#${cid})">`,
      `    <image x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" href="${href}" preserveAspectRatio="xMidYMid meet"/>${overlayLine}`,
      `  </g>`,
    ].join('\n');
  });
  // Tight viewBox — crop to the actual content bounds so no empty canvas space
  // is included in the exported SVG (avoids blank margins when placed in comic panels).
  const contentRects = sorted.map((p, i) => {
    const r = trimmedRect(trims[i], p.x, p.y, p.w, p.h);
    return { x: r.x, y: r.y, x2: r.x + r.w, y2: r.y + r.h };
  });
  const vx = Math.min(...contentRects.map((r) => r.x));
  const vy = Math.min(...contentRects.map((r) => r.y));
  const vw = Math.max(...contentRects.map((r) => r.x2)) - vx;
  const vh = Math.max(...contentRects.map((r) => r.y2)) - vy;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">`,
    defs.length ? `  <defs>${defs.join('')}</defs>` : '',
    ...groups,
    '</svg>',
  ].filter(Boolean).join('\n');
}

// Generic configurable canvas-based part assembler, used by FaceBuilder and DressBuilder.
export default function PartAssembler({ title, libraryCategory, partTypes, onSave, onUpdate, nameLabel, savedCategory, enableFacePartAlignment, enableDressPartAlignment, addableCategory, addableLabel }) {
  const dressAlignMode = !!enableDressPartAlignment;
  const alignmentEnabled = enableFacePartAlignment || enableDressPartAlignment;
  const [canvasParts, setCanvasParts]   = useState([]);
  const [selectedId, setSelectedId]     = useState(null);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [itemName, setItemName]         = useState('');
  // FACE_TEMPLATE-only save metadata (which named face identity + view this represents).
  const isFaceTemplateMode = savedCategory === 'FACE_TEMPLATE';
  const [faceFamily, setFaceFamily]     = useState('');
  const [faceView, setFaceView]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState('');
  const [uploadFiles, setUploadFiles]   = useState([]);
  const [uploadType, setUploadType]     = useState(partTypes?.[0]?.id || '');
  const [uploading, setUploading]       = useState(false);
  const [uploadMsg, setUploadMsg]       = useState('');
  const [allAssets, setAllAssets]       = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [savedAssets, setSavedAssets]   = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [loadingSavedId, setLoadingSavedId] = useState(null);
  const [addableAssets, setAddableAssets] = useState([]);
  const [loadingAddable, setLoadingAddable] = useState(false);
  const [addingAssetId, setAddingAssetId] = useState(null);
  const [searchQ, setSearchQ]           = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [zoom, setZoom]                 = useState(1);
  const [editingName, setEditingName]   = useState(null);
  const [editNameVal, setEditNameVal]   = useState('');
  const [showCrop, setShowCrop]         = useState(false);
  const [loadedAlignAssetId, setLoadedAlignAssetId] = useState(null);
  const [savingAlignment, setSavingAlignment] = useState(false);

  const dragRef           = useRef(null);
  const resizeRef         = useRef(null);
  const originalGroupRef  = useRef(null); // stable snapshot of group when first selected — prevents rounding drift on repeated scale
  const canvasRef    = useRef(null);
  const wrapperRef   = useRef(null);
  const historyRef   = useRef({ stack: [[]], idx: 0 });
  const zoomRef      = useRef(1);
  const userZoomedRef = useRef(false);
  const selIdRef     = useRef(null);
  const selectedIdsRef = useRef(new Set());
  const trimCacheRef = useRef({});   // filePath → trim rect
  const [trimVersion, setTrimVersion] = useState(0); // bumped to trigger rerender after trim computed
  zoomRef.current   = zoom;
  selIdRef.current  = selectedId;
  selectedIdsRef.current = selectedIds;

  // Auto-fit the canvas to the available wrapper space until the user manually zooms.
  const fitZoom = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const fit = Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H) * 0.96;
    setZoom(Math.max(0.4, Math.min(2, Math.round(fit * 100) / 100)));
  }, []);

  useEffect(() => {
    fitZoom();
    const el = wrapperRef.current;
    if (!el) return;
    const onResize = () => { if (!userZoomedRef.current) fitZoom(); };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitZoom]);

  const refreshAssets = useCallback(() => {
    setLoadingAssets(true);
    getAssets({ category: libraryCategory }).then(setAllAssets).catch(() => setAllAssets([])).finally(() => setLoadingAssets(false));
  }, [libraryCategory]);

  const refreshSaved = useCallback(() => {
    if (!savedCategory) return;
    setLoadingSaved(true);
    getAssets({ category: savedCategory }).then(setSavedAssets).catch(() => setSavedAssets([])).finally(() => setLoadingSaved(false));
  }, [savedCategory]);

  const refreshAddable = useCallback(() => {
    if (!addableCategory) return;
    setLoadingAddable(true);
    getAssets({ category: addableCategory }).then(setAddableAssets).catch(() => setAddableAssets([])).finally(() => setLoadingAddable(false));
  }, [addableCategory]);

  useEffect(() => {
    refreshAssets();
    refreshSaved();
    refreshAddable();
  }, [refreshAssets, refreshSaved, refreshAddable]);

  // ── History helpers ──
  const commitParts = useCallback((updater) => {
    setCanvasParts((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const { stack, idx } = historyRef.current;
      const trimmed = stack.slice(0, idx + 1);
      const newStack = [...trimmed, next].slice(-MAX_HISTORY);
      historyRef.current = { stack: newStack, idx: newStack.length - 1 };
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const { stack, idx } = historyRef.current;
    if (idx <= 0) return;
    historyRef.current = { ...historyRef.current, idx: idx - 1 };
    setCanvasParts(stack[idx - 1]);
    setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    const { stack, idx } = historyRef.current;
    if (idx >= stack.length - 1) return;
    historyRef.current = { ...historyRef.current, idx: idx + 1 };
    setCanvasParts(stack[idx + 1]);
    setSelectedId(null);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selectedIdsRef.current;
        if (ids.size > 1) {
          commitParts((prev) => prev.filter((p) => !ids.has(p.id)));
          setSelectedIds(new Set()); setSelectedId(null);
        } else {
          const id = selIdRef.current;
          if (id) { commitParts((prev) => prev.filter((p) => p.id !== id)); setSelectedId(null); }
        }
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commitParts, undo, redo]);

  // When a grouped part is selected, snapshot every member's exact x/y/w/h.
  // updateProportional always scales from this snapshot instead of from the
  // current (already-rounded) state, preventing rounding errors from compounding
  // across repeated enlarge→shrink cycles.
  useEffect(() => {
    if (!selectedId) { originalGroupRef.current = null; return; }
    const part = canvasParts.find((p) => p.id === selectedId);
    if (!part?.groupId) { originalGroupRef.current = null; return; }
    const members = canvasParts.filter((p) => p.groupId === part.groupId);
    const minX = Math.min(...members.map((p) => p.x));
    const minY = Math.min(...members.map((p) => p.y));
    const origParts = {};
    members.forEach((p) => { origParts[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h }; });
    originalGroupRef.current = { groupId: part.groupId, anchorX: minX, anchorY: minY, origParts };
  }, [selectedId]); // intentionally NOT canvasParts — we only snapshot on selection change

  // ── Upload ──
  const handleUpload = async () => {
    if (!uploadFiles.length) return;
    setUploading(true); setUploadMsg('');
    let ok = 0;
    for (const file of uploadFiles) {
      try {
        const name = file.name.replace(/\.[^.]+$/, '');
        const fd = new FormData();
        fd.append('file', file); fd.append('name', name);
        fd.append('category', libraryCategory);
        // 'cloth' parts are the costume's outfit layer — also tag 'outfit' so they're
        // findable under that grouping in the asset library, not just under 'cloth'.
        const typeTags = uploadType === 'cloth' ? `${uploadType},outfit` : uploadType;
        const tags = typeTags ? `${name},${typeTags}` : name;
        fd.append('tags', tags);
        await uploadAsset(fd); ok++;
      } catch { /* continue */ }
    }
    setUploadFiles([]);
    setUploadMsg(`Uploaded ${ok}/${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''}`);
    refreshAssets();
    setTimeout(() => setUploadMsg(''), 4000);
    setUploading(false);
  };

  // ── Canvas add ──
  // If part(s) are selected, clicking a library asset swaps it into those parts'
  // position/size/rotation/etc instead of adding a new part. With multiple parts
  // selected, every selected part gets the new image (each keeps its own placement).
  // Front/3-4 pairs of the same face part share one `name` and differ only in `view`
  // (e.g. "Eye1" FRONT + "Eye1" THREE_QUARTER). When building a FACE_TEMPLATE with a
  // known view, clicking either sibling should place whichever variant actually matches
  // the face being built — so picking "Eye1" just works regardless of which thumbnail
  // you clicked. Falls back to the clicked asset itself if no matching sibling exists.
  const resolveViewMatchedAsset = useCallback((clicked) => {
    if (!isFaceTemplateMode || !faceView || !clicked.view || clicked.view === faceView) return clicked;
    const sibling = allAssets.find((a) => a.name === clicked.name && a.category === clicked.category && a.view === faceView);
    return sibling || clicked;
  }, [isFaceTemplateMode, faceView, allAssets]);

  // Clears the canvas and all save-state — for starting a brand-new face from scratch.
  // Distinct from the "Clear" button in Layers, which only empties the canvas and leaves
  // the name/family/view fields and the loaded-asset id (so "Save" would still overwrite
  // whatever was loaded) untouched.
  const startNewFace = useCallback(() => {
    commitParts([]);
    setItemName('');
    if (isFaceTemplateMode) { setFaceFamily(''); setFaceView(''); }
    setLoadedAlignAssetId(null);
    setSelectedId(null);
    setSelectedIds(new Set());
    setSavedMsg('');
  }, [commitParts, isFaceTemplateMode]);

  // Swaps every part on the canvas to its sibling in the other view (Front <-> 3/4). If
  // this same character already has a SAVED template for the target view, that save is
  // the source of truth for "correct positions for that view" — load it outright instead
  // of reusing whatever's currently on screen, otherwise swapping back and forth would
  // keep overwriting each view's correct layout with the other view's positions. Only
  // falls back to a position-preserving asset swap the first time a view is being built
  // and nothing exists yet to load.
  const createOtherView = useCallback(() => {
    if (!isFaceTemplateMode || !faceView || !canvasParts.length) return;
    const targetView = faceView === 'FRONT' ? 'THREE_QUARTER' : 'FRONT';
    const targetLabel = VIEWS.find((v) => v.id === targetView)?.label || targetView;

    const characterKey = faceFamily.trim() || itemName.trim();
    const existingTarget = characterKey
      ? savedAssets.find((a) => ((a.faceFamily?.trim()) || a.name) === characterKey && a.view === targetView)
      : null;
    if (existingTarget) {
      loadSavedAsset(existingTarget);
      return;
    }

    // Nothing saved yet for the target view — swap each part to its target-view sibling
    // image but keep current positions as a rough starting draft. Parts with no sibling
    // in the target view (no matching name+category+view asset uploaded yet) are left
    // as-is. Clears loadedAlignAssetId — this is a different, not-yet-saved face
    // template, so the next save must be "Save As", never silently overwrite via "Save".
    let swapped = 0, kept = 0;
    const nextParts = canvasParts.map((p) => {
      if (!p.assetId) return p;
      const current = allAssets.find((a) => a.id === p.assetId);
      if (!current?.view) { kept++; return p; }
      const sibling = allAssets.find((a) => a.name === current.name && a.category === current.category && a.view === targetView);
      if (!sibling) { kept++; return p; }
      swapped++;
      return { ...p, assetId: sibling.id, filePath: sibling.filePath, name: sibling.name };
    });
    commitParts(nextParts);
    setFaceView(targetView);
    setLoadedAlignAssetId(null);
    setSelectedId(null);
    setSelectedIds(new Set());
    setSavedMsg(
      `Switched to ${targetLabel} — ${swapped} part${swapped === 1 ? '' : 's'} swapped` +
      (kept > 0 ? `, ${kept} kept as-is (no ${targetLabel} version found)` : '') +
      `. Click "Save As" to save this as a new face.`
    );
  }, [isFaceTemplateMode, faceView, canvasParts, allAssets, commitParts, faceFamily, itemName, savedAssets]);

  const addToCanvas = async (clickedAsset) => {
    const asset = resolveViewMatchedAsset(clickedAsset);
    const selId = selIdRef.current;

    // For hairstyle/nose parts, check if this face+part pair has a saved alignment
    // and apply its position/size/rotation instead of the default placement.
    let alignment = null;
    const partType = alignablePartType(asset, dressAlignMode);
    if (alignmentEnabled && loadedAlignAssetId && partType) {
      try { alignment = await getFacePartAlignment(loadedAlignAssetId, alignmentAssetId(partType, asset.id), partType); } catch { /* ignore */ }
    }

    // If the new asset belongs to a different category (hairstyle/nose/eye/mouth/...)
    // than the currently selected part, don't hijack the selected slot — instead swap
    // into the existing layer of the matching category (if any), or add a new layer.
    const matchesCategory = (p) => {
      const pType = alignablePartType(p, dressAlignMode);
      return !partType || !pType || pType === partType;
    };

    if (selectedIds.size > 1) {
      const targets = canvasParts.filter((p) => selectedIds.has(p.id) && matchesCategory(p));
      if (targets.length) {
        const targetIds = new Set(targets.map((p) => p.id));
        commitParts((prev) => prev.map((p) => targetIds.has(p.id)
          ? { ...p, assetId: asset.id, filePath: asset.filePath, name: asset.name, customName: '',
              ...(alignment ? { x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h, rotation: alignment.rotation, flipX: alignment.flipX, flipY: alignment.flipY } : {}) }
          : p));
        return;
      }
    } else if (selId) {
      const selPart = canvasParts.find((p) => p.id === selId);
      let targetId = selId;
      if (selPart && !matchesCategory(selPart)) {
        const matching = partType ? canvasParts.find((p) => alignablePartType(p, dressAlignMode) === partType) : null;
        targetId = matching ? matching.id : null;
      }
      if (targetId) {
        commitParts((prev) => prev.map((p) => p.id === targetId
          ? { ...p, assetId: asset.id, filePath: asset.filePath, name: asset.name, customName: '',
              ...(alignment ? { x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h, rotation: alignment.rotation, flipX: alignment.flipX, flipY: alignment.flipY } : {}) }
          : p));
        return;
      }
    }
    const inferredDressRole = dressAlignMode
      ? (['cloth', 'neck', 'hands'].find((t) => (asset.tags || []).includes(t)) || null)
      : null;
    commitParts((prev) => {
      const maxZ = prev.length ? Math.max(...prev.map((p) => p.zIndex)) + 1 : 50;
      return [...prev, {
        id: genId(), assetId: asset.id, filePath: asset.filePath,
        name: asset.name, customName: '', tags: asset.tags || [], partType: asset.partType || null,
        dressRole: inferredDressRole,
        x: alignment ? alignment.x : Math.round(CANVAS_W / 2 - 50),
        y: alignment ? alignment.y : Math.round(CANVAS_H / 2 - 50),
        w: alignment ? alignment.w : 100,
        h: alignment ? alignment.h : 100,
        rotation: alignment ? alignment.rotation : 0, zIndex: maxZ,
        flipX: alignment ? alignment.flipX : false, flipY: alignment ? alignment.flipY : false, groupId: null,
        clip: { t: 0, r: 0, b: 0, l: 0 },
      }];
    });
  };

  // ── Drag ──
  const handleMouseDown = useCallback((e, partId) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setSelectedId(partId);
    setSelectedIds(new Set([partId]));
    setCanvasParts((prev) => {
      const origPositions = {};
      prev.forEach((p) => { origPositions[p.id] = { x: p.x, y: p.y }; });
      const dragged = prev.find((p) => p.id === partId);
      dragRef.current = { partId, startX: e.clientX, startY: e.clientY, origPositions, groupId: dragged?.groupId, moved: false };
      return prev;
    });
  }, []);

  // Resize handle (bottom-right of the selected part, or its group's bounding box)
  const handleResizeMouseDown = useCallback((e, partId) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setCanvasParts((prev) => {
      const part = prev.find((p) => p.id === partId);
      if (!part) return prev;
      const box = part.groupId ? groupBBox(prev, part.groupId) : { x: part.x, y: part.y, w: part.w, h: part.h };
      const origSizes = {};
      prev.forEach((p) => { origSizes[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h }; });
      resizeRef.current = { partId, startX: e.clientX, startY: e.clientY, box, origSizes, groupId: part.groupId, moved: false };
      return prev;
    });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (resizeRef.current) {
      const z = zoomRef.current;
      const { box, origSizes, groupId, partId, startX } = resizeRef.current;
      const dx = (e.clientX - startX) / z;
      if (Math.abs(dx) > 1) resizeRef.current.moved = true;
      const newW = Math.max(16, box.w + dx);
      const scale = newW / box.w;
      setCanvasParts((prev) => prev.map((p) => {
        const orig = origSizes[p.id]; if (!orig) return p;
        if (groupId ? p.groupId === groupId : p.id === partId) {
          return { ...p,
            x: Math.round(box.x + (orig.x - box.x) * scale),
            y: Math.round(box.y + (orig.y - box.y) * scale),
            w: Math.round(orig.w * scale),
            h: Math.round(orig.h * scale) };
        }
        return p;
      }));
      return;
    }
    if (!dragRef.current) return;
    const z = zoomRef.current;
    const dx = (e.clientX - dragRef.current.startX) / z;
    const dy = (e.clientY - dragRef.current.startY) / z;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragRef.current.moved = true;
    const { partId, origPositions, groupId } = dragRef.current;
    setCanvasParts((prev) =>
      prev.map((p) => {
        const orig = origPositions[p.id];
        if (!orig) return p;
        if (p.id === partId || (groupId && p.groupId === groupId))
          return { ...p, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
        return p;
      })
    );
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current?.moved || resizeRef.current?.moved) {
      setCanvasParts((prev) => {
        const { stack, idx } = historyRef.current;
        const trimmed = stack.slice(0, idx + 1);
        const newStack = [...trimmed, prev].slice(-MAX_HISTORY);
        historyRef.current = { stack: newStack, idx: newStack.length - 1 };
        return prev;
      });
    }
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  // ── Part mutations ──
  const updatePart = useCallback((id, patch) => {
    commitParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [commitParts]);

  // Bounding box (x, y, w, h) covering every part that shares the given groupId.
  const groupBBox = (parts, gid) => {
    const members = parts.filter((p) => p.groupId === gid);
    const minX = Math.min(...members.map((p) => p.x));
    const minY = Math.min(...members.map((p) => p.y));
    const maxX = Math.max(...members.map((p) => p.x + p.w));
    const maxY = Math.max(...members.map((p) => p.y + p.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  // Shift the selected part by (dx, dy) — if it belongs to a group (e.g. a whole
  // face added as one unit), shift every part in that group by the same amount so
  // the group keeps its relative layout and moves as a single piece.
  const shiftSelectedPart = useCallback((dx, dy) => {
    const id = selIdRef.current; if (!id) return;
    if (!dx && !dy) return;
    commitParts((prev) => {
      const part = prev.find((p) => p.id === id); if (!part) return prev;
      const gid = part.groupId;
      return prev.map((p) => (p.id === id || (gid && p.groupId === gid))
        ? { ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) }
        : p);
    });
  }, [commitParts]);

  // Move the selected part (and its group, if any) so its x or y reaches `value`.
  const moveSelectedPart = useCallback((axis, value) => {
    const part = canvasParts.find((p) => p.id === selIdRef.current); if (!part) return;
    const delta = value - part[axis];
    shiftSelectedPart(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
  }, [canvasParts, shiftSelectedPart]);

  // Center the selected part on the canvas — if it belongs to a group, center
  // the whole group's bounding box instead, preserving the group's layout.
  const centerSelected = useCallback((axis) => {
    const id = selIdRef.current; if (!id) return;
    const part = canvasParts.find((p) => p.id === id); if (!part) return;
    const box = part.groupId ? groupBBox(canvasParts, part.groupId) : { x: part.x, y: part.y, w: part.w, h: part.h };
    const dx = (axis === 'x' || axis === 'both') ? Math.round((CANVAS_W - box.w) / 2) - box.x : 0;
    const dy = (axis === 'y' || axis === 'both') ? Math.round((CANVAS_H - box.h) / 2) - box.y : 0;
    shiftSelectedPart(dx, dy);
  }, [canvasParts, shiftSelectedPart]);

  const updateClip = useCallback((key, val) => {
    const id = selIdRef.current; if (!id) return;
    commitParts((prev) => prev.map((p) => p.id === id ? { ...p, clip: { ...p.clip, [key]: val } } : p));
  }, [commitParts]);

  // Resize the selected part to width `newW` (preserving aspect ratio). If the
  // part belongs to a group, scale every part in the group by the same factor
  // around the group's top-left corner, so the whole group resizes together
  // while keeping each member's position and size proportional.
  const updateProportional = useCallback((newW) => {
    const id = selIdRef.current; if (!id) return;
    setCanvasParts((prev) => {
      const p = prev.find((pt) => pt.id === id); if (!p) return prev;
      let next;
      if (p.groupId) {
        // Always scale from the snapshotted original positions/sizes taken at
        // selection time, not from the current (already-rounded) state.
        // This prevents rounding errors accumulating across repeated scale ops.
        const snap = originalGroupRef.current;
        const origParts = snap?.groupId === p.groupId ? snap.origParts : null;
        const anchorX = snap?.groupId === p.groupId ? snap.anchorX : groupBBox(prev, p.groupId).x;
        const anchorY = snap?.groupId === p.groupId ? snap.anchorY : groupBBox(prev, p.groupId).y;
        const origW = origParts?.[id]?.w ?? p.w;
        const scale = newW / origW;
        next = prev.map((pt) => {
          const orig = origParts?.[pt.id];
          if (pt.groupId !== p.groupId) return pt;
          const ox = orig?.x ?? pt.x, oy = orig?.y ?? pt.y, ow = orig?.w ?? pt.w, oh = orig?.h ?? pt.h;
          return { ...pt,
            x: Math.round(anchorX + (ox - anchorX) * scale),
            y: Math.round(anchorY + (oy - anchorY) * scale),
            w: Math.round(ow * scale),
            h: Math.round(oh * scale) };
        });
      } else {
        const ratio = p.h / p.w;
        next = prev.map((pt) => pt.id === id ? { ...pt, w: newW, h: Math.round(newW * ratio) } : pt);
      }
      const { stack, idx } = historyRef.current;
      const trimmed = stack.slice(0, idx + 1);
      historyRef.current = { stack: [...trimmed, next].slice(-MAX_HISTORY), idx: Math.min(idx + 1, MAX_HISTORY - 1) };
      return next;
    });
  }, []);

  const removePart = useCallback((id) => {
    const tid = id ?? selIdRef.current; if (!tid) return;
    commitParts((prev) => prev.filter((p) => p.id !== tid));
    if (tid === selIdRef.current) setSelectedId(null);
  }, [commitParts]);

  // Remove the currently selected part(s) — all multi-selected layers, or just
  // the single selected layer (toolbar Delete button / Del key).
  const removeSelected = useCallback(() => {
    if (selectedIds.size > 1) {
      commitParts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setSelectedId(null);
      return;
    }
    const id = selIdRef.current; if (!id) return;
    commitParts((prev) => prev.filter((p) => p.id !== id));
    setSelectedId(null);
  }, [commitParts, selectedIds]);

  // ── Part category (exposed skin vs clothing) — lets the skin-tone overlay
  // target every part tagged "skin" regardless of layer order ──
  const setPartCategory = useCallback((id, category) => {
    commitParts((prev) => prev.map((p) => p.id === id ? { ...p, partCategory: category } : p));
  }, [commitParts]);

  // Sets the dress alignment role (neck/hands) AND auto-tags as Exposed Skin so
  // skin-tone overlays cover all skin surfaces without a separate manual step.
  const setDressRole = useCallback((id, role) => {
    commitParts((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const clearing = p.dressRole === role;
      return { ...p, dressRole: clearing ? null : role, partCategory: clearing ? p.partCategory : 'skin' };
    }));
  }, [commitParts]);

  // ── Hair color overlay (same idea as the old skin tone overlay, but for hair —
  // scope can target just one layer, that layer + below, or every part
  // tagged "Hair") ──
  const stripHairOverlay = (p) => {
    const { hairOverlay, hairOverlayOwner, hairOverlayScope, ...rest } = p;
    return rest;
  };

  const applyHairOverlayConfig = useCallback((targetId, scope, overlay) => {
    commitParts((prev) => {
      const target = prev.find((p) => p.id === targetId);
      if (!target) return prev.map(stripHairOverlay);
      return prev.map((p) => {
        const rest = stripHairOverlay(p);
        if (p.id === targetId) return { ...rest, hairOverlay: overlay, hairOverlayOwner: true, hairOverlayScope: scope };
        const inScope = scope === 'below' ? p.zIndex <= target.zIndex
          : scope === 'hairTagged' ? p.partCategory === 'hair'
          : false;
        if (inScope) return { ...rest, hairOverlay: overlay };
        return rest;
      });
    });
  }, [commitParts]);

  const setHairOverlayTarget = useCallback((targetId) => {
    const current = canvasParts.find((p) => p.hairOverlayOwner);
    const overlay = current?.hairOverlay || { color: '#3b2412', blendMode: 'multiply', opacity: 50 };
    applyHairOverlayConfig(targetId, current?.hairOverlayScope ?? 'single', overlay);
  }, [canvasParts, applyHairOverlayConfig]);

  const setHairOverlayScope = useCallback((scope) => {
    const current = canvasParts.find((p) => p.hairOverlayOwner);
    if (!current) return;
    applyHairOverlayConfig(current.id, scope, current.hairOverlay);
  }, [canvasParts, applyHairOverlayConfig]);

  const updateHairOverlay = useCallback((patch) => {
    commitParts((prev) => prev.map((p) => p.hairOverlay ? { ...p, hairOverlay: { ...p.hairOverlay, ...patch } } : p));
  }, [commitParts]);

  const removeHairOverlay = useCallback(() => {
    commitParts((prev) => prev.map((p) => p.hairOverlay ? stripHairOverlay(p) : p));
  }, [commitParts]);

  // ── Layer reorder ──
  const moveLayer = useCallback((id, dir) => {
    commitParts((prev) => {
      const sorted = [...prev].sort((a, b) => b.zIndex - a.zIndex);
      const idx = sorted.findIndex((p) => p.id === id);
      const neighbor = sorted[idx + dir];
      if (!neighbor) return prev;
      const z1 = sorted[idx].zIndex, z2 = neighbor.zIndex;
      return prev.map((p) => {
        if (p.id === id) return { ...p, zIndex: z2 };
        if (p.id === neighbor.id) return { ...p, zIndex: z1 };
        return p;
      });
    });
  }, [commitParts]);

  // ── Grouping ──
  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const gid = genGroupId();
    commitParts((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, groupId: gid } : p));
    setSelectedIds(new Set());
  }, [commitParts, selectedIds]);

  const ungroupPart = useCallback((id) => {
    commitParts((prev) => prev.map((p) => p.id === id ? { ...p, groupId: null } : p));
  }, [commitParts]);

  // Persist the current canvas position/size/rotation of every alignable part
  // (hairstyle/nose/eye/mouth, or face/neck/hands in dress mode) as that part's
  // remembered alignment for this face/dress, so reloading it later restores
  // exactly where each piece was left — without requiring a separate manual
  // "Save Position" click per part.
  const syncAlignments = async (faceAssetId, parts) => {
    if (!alignmentEnabled || !faceAssetId) return;
    const saves = parts.map((part) => {
      const partType = alignablePartType(part, dressAlignMode);
      if (!partType || !part.assetId) return null;
      return saveFacePartAlignment({
        faceAssetId,
        partAssetId: alignmentAssetId(partType, part.assetId),
        partType,
        x: part.x, y: part.y, w: part.w, h: part.h,
        rotation: part.rotation || 0, flipX: !!part.flipX, flipY: !!part.flipY,
        connectX: part.connectX ?? 0.5, connectY: part.connectY ?? 0.0,
      }).catch(() => {});
    });
    // In dress mode, also save the face group's overall bbox as a 'head' anchor
    if (dressAlignMode) {
      const seenGroups = new Set();
      parts.forEach((p) => {
        if (!p.groupId || seenGroups.has(p.groupId)) return;
        seenGroups.add(p.groupId);
        const members = parts.filter((m) => m.groupId === p.groupId);
        const minX = Math.min(...members.map((m) => m.x));
        const minY = Math.min(...members.map((m) => m.y));
        const maxX = Math.max(...members.map((m) => m.x + m.w));
        const maxY = Math.max(...members.map((m) => m.y + m.h));
        saves.push(saveFacePartAlignment({
          faceAssetId,
          partAssetId: '__ALL__',
          partType: 'head',
          x: minX, y: minY, w: maxX - minX, h: maxY - minY,
          rotation: 0, flipX: false, flipY: false,
          connectX: 0.5, connectY: 1.0,
        }).catch(() => {}));
      });
    }
    await Promise.all(saves);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!itemName.trim() || !canvasParts.length) return;
    setSaving(true); setSavedMsg('');
    try {
      const svg = await buildAssembledSvg(canvasParts, trimCacheRef.current);
      // Layout: scaling, position, and layer-order data so the canvas can be recreated later.
      const layout = canvasParts.map(({ id, ...rest }) => rest);
      const meta = isFaceTemplateMode ? { faceFamily: faceFamily.trim() || undefined, view: faceView || undefined } : undefined;
      const res = await onSave(itemName.trim(), svg, layout, meta);
      setSavedMsg(`Saved as "${res.name}"`);
      if (alignmentEnabled && res.id) {
        setLoadedAlignAssetId(res.id);
        await syncAlignments(res.id, canvasParts);
      }
      setTimeout(() => setSavedMsg(''), 5000);
      refreshSaved();
    } catch (err) {
      setSavedMsg(err?.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  // Overwrite the currently loaded face/dress asset in place with the canvas's
  // current parts, instead of creating a new asset.
  const handleUpdate = async () => {
    if (!onUpdate || !loadedAlignAssetId || !canvasParts.length) return;
    setSaving(true); setSavedMsg('');
    try {
      const svg = await buildAssembledSvg(canvasParts, trimCacheRef.current);
      const layout = canvasParts.map(({ id, ...rest }) => rest);
      const meta = isFaceTemplateMode ? { faceFamily: faceFamily.trim() || undefined, view: faceView || undefined } : undefined;
      const res = await onUpdate(loadedAlignAssetId, itemName.trim() || undefined, svg, layout, meta);
      await syncAlignments(loadedAlignAssetId, canvasParts);
      setSavedMsg(`Saved changes to "${res.name}"`);
      setTimeout(() => setSavedMsg(''), 5000);
      refreshSaved();
    } catch (err) {
      setSavedMsg(err?.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  // Reload a previously saved face/dress onto the canvas from its stored layout.
  const loadSavedAsset = async (asset) => {
    if (!asset.layoutPath) return;
    setLoadingSavedId(asset.id);
    try {
      const rawLayout = await fetch(asset.layoutPath).then((r) => r.json());
      const layout = await resolveLayoutFilePaths(rawLayout);
      let parts = layout.map((part) => ({ ...part, id: genId() }));

      // Override any alignable part's (hairstyle/nose/eye/mouth, or face/neck/hands in
      // dress mode) position with its calibrated alignment for this face/costume.
      if (alignmentEnabled) {
        parts = await Promise.all(parts.map(async (part) => {
          const partType = alignablePartType(part, dressAlignMode);
          if (!partType || !part.assetId) return part;
          try {
            const alignment = await getFacePartAlignment(asset.id, alignmentAssetId(partType, part.assetId), partType);
            if (!alignment) return part;
            return { ...part, x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h,
              rotation: alignment.rotation, flipX: alignment.flipX, flipY: alignment.flipY };
          } catch {
            return part;
          }
        }));
      }

      commitParts(parts);
      setSelectedId(null);
      setSelectedIds(new Set());
      setItemName(asset.name);
      if (isFaceTemplateMode) { setFaceFamily(asset.faceFamily || ''); setFaceView(asset.view || ''); }
      if (alignmentEnabled) setLoadedAlignAssetId(asset.id);
    } catch {
      setSavedMsg('Failed to load saved layout');
    } finally {
      setLoadingSavedId(null);
    }
  };

  // Add a previously saved asset's parts (e.g. a saved Face) onto the current
  // canvas as new layers, stacked above the existing parts — without clearing them.
  // All of its parts share one new groupId so the whole face moves/positions as a
  // single unit (drag any one part to move them all); individual parts can still
  // be ungrouped afterwards for fine-tuning.
  const addSavedAssetToCanvas = async (asset) => {
    if (!asset.layoutPath) return;
    setAddingAssetId(asset.id);
    try {
      const rawLayout = await fetch(asset.layoutPath).then((r) => r.json());
      const layout = await resolveLayoutFilePaths(rawLayout);
      const maxZ = canvasParts.reduce((m, p) => Math.max(m, p.zIndex || 0), 0);
      const gid = genGroupId();
      const parts = layout.map((part) => ({ ...part, id: genId(), zIndex: (part.zIndex || 0) + maxZ, groupId: gid }));
      commitParts((prev) => [...prev, ...parts]);
    } catch {
      setSavedMsg('Failed to load saved layout');
    } finally {
      setAddingAssetId(null);
    }
  };

  // Add a previously saved asset (e.g. a saved Face) onto the canvas as a single
  // flattened image — tagged partCategory 'face' so it can be scaled/positioned as
  // one unit and aligned with the costume's neck/hands (dress alignment mode).
  const addSavedAssetAsImage = async (asset) => {
    setAddingAssetId(asset.id);
    try {
      let alignment = null;
      if (dressAlignMode && loadedAlignAssetId) {
        try { alignment = await getFacePartAlignment(loadedAlignAssetId, alignmentAssetId('face', asset.id), 'face'); } catch { /* ignore */ }
      }

      const maxZ = canvasParts.reduce((m, p) => Math.max(m, p.zIndex || 0), 0);
      const defaultW = 180, defaultH = 270;
      const part = {
        id: genId(), assetId: asset.id, filePath: asset.filePath, name: asset.name, customName: '',
        x: alignment ? alignment.x : Math.round((CANVAS_W - defaultW) / 2),
        y: alignment ? alignment.y : 10,
        w: alignment ? alignment.w : defaultW,
        h: alignment ? alignment.h : defaultH,
        rotation: alignment ? alignment.rotation : 0,
        zIndex: maxZ + 1,
        flipX: alignment ? alignment.flipX : false,
        flipY: alignment ? alignment.flipY : false,
        groupId: null, clip: { t: 0, r: 0, b: 0, l: 0 },
        partCategory: 'face',
      };
      commitParts((prev) => [...prev, part]);
    } finally {
      setAddingAssetId(null);
    }
  };

  // Save the currently selected part's position/size/rotation as the
  // remembered alignment for (loaded face/dress, part asset, part type).
  const saveFacePartAlignmentForSelected = async () => {
    const part = canvasParts.find((p) => p.id === selIdRef.current);
    const partType = part ? alignablePartType(part, dressAlignMode) : null;
    if (!part || !loadedAlignAssetId || !part.assetId || !partType) return;
    setSavingAlignment(true);
    try {
      await saveFacePartAlignment({
        faceAssetId: loadedAlignAssetId,
        partAssetId: alignmentAssetId(partType, part.assetId),
        partType,
        x: part.x, y: part.y, w: part.w, h: part.h,
        rotation: part.rotation || 0, flipX: !!part.flipX, flipY: !!part.flipY,
        connectX: part.connectX ?? 0.5, connectY: part.connectY ?? 0.0,
      });
      setSavedMsg(`Saved ${partType} position`);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setSavedMsg(err?.response?.data?.error || 'Failed to save position');
    } finally {
      setSavingAlignment(false);
    }
  };

  // Save the entire face group's bounding box as the 'head' anchor on this costume.
  const saveHeadGroupPosition = async () => {
    const part = canvasParts.find((p) => p.id === selIdRef.current);
    if (!part?.groupId || !loadedAlignAssetId) return;
    const members = canvasParts.filter((p) => p.groupId === part.groupId);
    const minX = Math.min(...members.map((p) => p.x));
    const minY = Math.min(...members.map((p) => p.y));
    const maxX = Math.max(...members.map((p) => p.x + p.w));
    const maxY = Math.max(...members.map((p) => p.y + p.h));
    setSavingAlignment(true);
    try {
      await saveFacePartAlignment({
        faceAssetId: loadedAlignAssetId,
        partAssetId: '__ALL__',
        partType: 'head',
        x: minX, y: minY, w: maxX - minX, h: maxY - minY,
        rotation: 0, flipX: false, flipY: false,
        connectX: 0.5, connectY: 1.0,
      });
      setSavedMsg('Saved head position');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setSavedMsg('Failed to save head position');
    } finally { setSavingAlignment(false); }
  };

  // Called when a canvas part image loads — computes trim rect once per filePath.
  const handlePartImgLoad = useCallback((e, filePath) => {
    if (filePath in trimCacheRef.current) return;
    const trim = computeTrimRect(e.target);
    trimCacheRef.current[filePath] = trim;
    setTrimVersion((v) => v + 1);
  }, []);

  const selectedPart = canvasParts.find((p) => p.id === selectedId);
  const hairOverlayOwner = canvasParts.find((p) => p.hairOverlayOwner);
  // Face-template parts get a fixed, automatic stacking order (face shape bottom,
  // hairstyle top, eye/mouth in between) instead of a manually-set zIndex — order is then
  // never wrong, since there's no per-part value that has to be correctly carried through
  // every place a part can be created or swapped. Other modes (e.g. Dress) keep the
  // existing free-form zIndex/Layer-reorder system, since they don't fit one fixed scheme.
  const FACE_ROLE_RANK = { face: 0, eye: 1, mouth: 2, hairstyle: 3 };
  const partRenderRank = (part) => {
    if (!isFaceTemplateMode) return part.zIndex;
    const role = alignablePartType(part, false);
    return role && role in FACE_ROLE_RANK ? FACE_ROLE_RANK[role] : 99;
  };
  const sortedByZ    = [...canvasParts].sort((a, b) => partRenderRank(b) - partRenderRank(a));
  // Groups saved FACE_TEMPLATEs that represent the same character (same faceFamily, or
  // same name if faceFamily wasn't set) so Front + 3/4 show as one card with two small
  // view buttons instead of two identical-looking, unlabeled "Rosa" thumbnails.
  const groupedSaved = (() => {
    const map = new Map();
    for (const asset of savedAssets) {
      const key = (isFaceTemplateMode && asset.faceFamily?.trim()) || asset.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(asset);
    }
    return Array.from(map.entries()).map(([key, assets]) => ({
      key, assets: [...assets].sort((a, b) => (a.view || '').localeCompare(b.view || '')),
    }));
  })();

  const filteredAssets = allAssets.filter((a) => {
    if (searchQ.trim() && !a.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (typeFilter !== 'all' && alignablePartType(a, dressAlignMode) !== TYPE_FILTER_TO_ALIGNABLE[typeFilter]) return false;
    if (genderFilter !== 'all' && a.gender !== genderFilter) return false;
    // While building a FACE_TEMPLATE with a known view, only show parts that match it (or
    // have no view at all) — front/3-4 siblings share a name, so showing both at once just
    // looks like duplicates. resolveViewMatchedAsset() still backstops this on click.
    if (isFaceTemplateMode && faceView && a.view && a.view !== faceView) return false;
    return true;
  });
  const canUndo = historyRef.current.idx > 0;
  const canRedo = historyRef.current.idx < historyRef.current.stack.length - 1;

  const handleLayerClick = (e, partId) => {
    if (e.shiftKey) {
      setSelectedIds((prev) => { const n = new Set(prev); n.has(partId) ? n.delete(partId) : n.add(partId); return n; });
    } else {
      setSelectedId(partId);
      setSelectedIds(new Set([partId]));
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* ── LEFT: Asset Browser ── */}
      <div className="card" style={{ width: 260, flexShrink: 0, padding: 14, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>Asset Browser</p>

        {/* Search + filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <input className="input" placeholder="Search…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            style={{ fontSize: 12, width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {!!partTypes?.length && (
              <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: 11, flex: 1, minWidth: 0 }}>
                <option value="all">All Types</option>
                {partTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            )}
            <select className="input" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} style={{ fontSize: 11, flex: 1, minWidth: 0 }}>
              <option value="all">All Genders</option>
              {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
        </div>

        {(selectedIds.size > 1 || selectedPart) && (
          <p style={{ fontSize: 11, color: ORANGE, marginTop: 8, marginBottom: 0 }}>
            {selectedIds.size > 1 ? `Click a part to swap ${selectedIds.size} selected parts` : `Click a part to swap "${selectedPart.customName || selectedPart.name}"`}
          </p>
        )}

        <Section title="Library" badge={`(${filteredAssets.length})`}>
          {loadingAssets ? (
            <p style={s.hint}>Loading…</p>
          ) : filteredAssets.length === 0 ? (
            <p style={s.hint}>No parts found. Upload below.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {filteredAssets.map((asset) => (
                <button key={asset.id} title={asset.name} onClick={() => addToCanvas(asset)} style={s.assetThumb}>
                  <img src={asset.filePath} alt={asset.name}
                    style={{ width: 60, height: 60, objectFit: 'contain', display: 'block' }} />
                  <p style={s.thumbLabel}>{asset.name}</p>
                </button>
              ))}
            </div>
          )}
        </Section>

        {!!savedCategory && (
          <Section title="Saved Templates" badge={`(${savedAssets.length})`}>
            {loadingSaved ? (
              <p style={s.hint}>Loading…</p>
            ) : savedAssets.length === 0 ? (
              <p style={s.hint}>No saved items yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {groupedSaved.map(({ key, assets }) => (
                  <div key={key} style={s.assetThumb}>
                    <img src={thumbSrc(assets[0])} alt={key}
                      style={{ width: 60, height: 60, objectFit: 'contain', display: 'block' }} />
                    <p style={s.thumbLabel}>{key}</p>
                    {assets.length > 1 ? (
                      <div style={{ display: 'flex', gap: 3, padding: '0 4px 4px' }}>
                        {assets.map((a) => (
                          <button key={a.id} title={`Load "${a.name}" (${VIEWS.find((v) => v.id === a.view)?.label || 'no view'})`}
                            onClick={() => loadSavedAsset(a)} disabled={!a.layoutPath || loadingSavedId === a.id}
                            style={{ ...s.savedViewBtn, opacity: loadingSavedId === a.id ? 0.5 : 1 }}>
                            {VIEWS.find((v) => v.id === a.view)?.label || '?'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button title={`Load "${assets[0].name}"`} onClick={() => loadSavedAsset(assets[0])}
                        disabled={!assets[0].layoutPath || loadingSavedId === assets[0].id}
                        style={{ ...s.savedViewBtn, width: 'calc(100% - 8px)', margin: '0 4px 4px', opacity: loadingSavedId === assets[0].id ? 0.5 : 1 }}>
                        Load
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {!!addableCategory && (
          <Section title={addableLabel || addableCategory} badge={`(${addableAssets.length})`}>
            {loadingAddable ? (
              <p style={s.hint}>Loading…</p>
            ) : addableAssets.length === 0 ? (
              <p style={s.hint}>No saved items yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {addableAssets.map((asset) => (
                  <button key={asset.id} title={`Add "${asset.name}" as grouped parts`}
                    onClick={() => addSavedAssetToCanvas(asset)}
                    disabled={!asset.layoutPath || addingAssetId === asset.id} style={s.assetThumb}>
                    <img src={thumbSrc(asset)} alt={asset.name}
                      style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', margin: '0 auto', opacity: addingAssetId === asset.id ? 0.5 : 1 }} />
                    <p style={s.thumbLabel}>{asset.name}</p>
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title="Upload Asset" defaultOpen={false}>
          {!!partTypes?.length && (
            <select className="input" value={uploadType} onChange={(e) => setUploadType(e.target.value)}
              style={{ fontSize: 12 }}>
              {partTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          )}
          <label style={{ ...s.fileLabel, background: uploadFiles.length ? '#FFF7ED' : '#F9FAFB', borderColor: uploadFiles.length ? ORANGE : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <UploadCloud size={13} />
            {uploadFiles.length
              ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected`
              : 'Choose SVG/PNG/JPG files…'}
            <input type="file" accept=".svg,.png,.jpg,.jpeg,.webp" multiple style={{ display: 'none' }}
              onChange={(e) => setUploadFiles(Array.from(e.target.files))} />
          </label>
          {uploadFiles.length > 0 && (
            <div style={{ maxHeight: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {uploadFiles.map((f, i) => (
                <div key={i} style={{ fontSize: 10, color: '#6B7280', padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name.replace(/\.[^.]+$/, '')}
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleUpload}
            disabled={uploading || !uploadFiles.length} style={{ fontSize: 12 }}>
            {uploading ? 'Uploading…' : `Upload${uploadFiles.length > 1 ? ` (${uploadFiles.length})` : ''}`}
          </button>
          {uploadMsg && (
            <p style={{ fontSize: 11, color: uploadMsg.includes('0/') ? '#dc2626' : '#16a34a' }}>{uploadMsg}</p>
          )}
        </Section>
      </div>

      {/* ── CENTER: Canvas ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

        {/* Toolbar */}
        <div className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Undo / Redo / Delete */}
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...s.iconBtn, opacity: canUndo ? 1 : 0.35 }}><Undo2 size={14} /></button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...s.iconBtn, opacity: canRedo ? 1 : 0.35 }}><Redo2 size={14} /></button>
          <button onClick={removeSelected} disabled={!selectedId && selectedIds.size === 0}
            title="Delete selected (Del)" style={{ ...s.iconBtn, opacity: (selectedId || selectedIds.size) ? 1 : 0.35, color: '#DC2626' }}><Trash2 size={14} /></button>
          <div style={s.tbDivider} />
          <button onClick={startNewFace} title="Start a new, blank face — clears the canvas and the name/family/view fields"
            style={{ ...s.iconBtn, width: 'auto', padding: '0 8px', fontSize: 11, gap: 4 }}><Plus size={13} /> New</button>
          <div style={s.tbDivider} />

          {/* Zoom */}
          <button onClick={() => { userZoomedRef.current = true; setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 20) / 20)); }} title="Zoom out" style={s.iconBtn}><Minus size={14} /></button>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 34, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => { userZoomedRef.current = true; setZoom((z) => Math.min(2, Math.round((z + 0.1) * 20) / 20)); }} title="Zoom in" style={s.iconBtn}><Plus size={14} /></button>
          <button onClick={() => { userZoomedRef.current = false; fitZoom(); }} title="Fit to screen" style={{ ...s.iconBtn, width: 'auto', padding: '0 8px', fontSize: 11 }}>Fit</button>
          <div style={s.tbDivider} />

          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
          <div style={{ flex: 1 }} />
          {isFaceTemplateMode && (
            <>
              <input className="input" placeholder="Face family (e.g. Rahul)" value={faceFamily}
                onChange={(e) => setFaceFamily(e.target.value)} style={{ width: 130, fontSize: 13 }} />
              <select className="input" value={faceView} onChange={(e) => setFaceView(e.target.value)} style={{ width: 90, fontSize: 13 }}>
                <option value="">View…</option>
                {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              {faceView && (
                <button className="btn" onClick={createOtherView} disabled={!canvasParts.length} style={{ flexShrink: 0, fontSize: 12 }}
                  title="Swap every part on the canvas to its sibling in the other view, as a starting point for that view of the same character">
                  → {VIEWS.find((v) => v.id !== faceView)?.label}
                </button>
              )}
            </>
          )}
          <input className="input" placeholder={nameLabel} value={itemName}
            onChange={(e) => setItemName(e.target.value)} style={{ width: 160, fontSize: 13 }} />
          {onUpdate && loadedAlignAssetId && (
            <button className="btn" onClick={handleUpdate}
              disabled={saving || !canvasParts.length} style={{ flexShrink: 0, fontSize: 13 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || !itemName.trim() || !canvasParts.length} style={{ flexShrink: 0, fontSize: 13 }}>
            {saving ? 'Saving…' : (onUpdate && loadedAlignAssetId) ? 'Save As' : 'Save'}
          </button>
        </div>

        {savedMsg && (
          <div style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: savedMsg.startsWith('Saved') ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${savedMsg.startsWith('Saved') ? '#6EE7B7' : '#FECACA'}`,
            color: savedMsg.startsWith('Saved') ? '#065F46' : '#991B1B' }}>
            {savedMsg}
          </div>
        )}

        {/* Canvas wrapper with zoom */}
        <div className="card" ref={wrapperRef}
          style={{ padding: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 'calc(100vh - 230px)', minHeight: 420, background: '#EEF1F5' }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', width: CANVAS_W, height: CANVAS_H, flexShrink: 0 }}>
            <div ref={canvasRef}
              style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H,
                background: '#F8FAFC', border: '2px dashed #E5E7EB', borderRadius: 10, overflow: 'hidden' }}
              onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onClick={() => { setSelectedId(null); setSelectedIds(new Set()); }}>

              {/* Guide lines */}
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={CANVAS_W} height={CANVAS_H}>
                <line x1={CANVAS_W/2} y1="0" x2={CANVAS_W/2} y2={CANVAS_H} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="5 4"/>
                <line x1="0" y1={CANVAS_H/2} x2={CANVAS_W} y2={CANVAS_H/2} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="5 4"/>
              </svg>

              {[...canvasParts].sort((a, b) => partRenderRank(a) - partRenderRank(b)).map((part) => {
                const isSel   = selectedId === part.id;
                const isMulti = selectedIds.has(part.id);
                const gc      = groupColor(part.groupId);
                const cl = part.clip?.l ?? 0, ct = part.clip?.t ?? 0, cr = part.clip?.r ?? 0, cb = part.clip?.b ?? 0;
                const hasClip = cl > 0 || ct > 0 || cr > 0 || cb > 0;

                // Compute tight-fit img style using cached trim rect
                const trim = trimCacheRef.current[part.filePath];
                const overlayRect = trim ? trimmedRect(trim, 0, 0, 100, 100) : { x: 0, y: 0, w: 100, h: 100 };
                let imgStyle;
                if (trim) {
                  imgStyle = { position: 'absolute', width: `${overlayRect.w}%`, height: `${overlayRect.h}%`, left: `${overlayRect.x}%`, top: `${overlayRect.y}%`, pointerEvents: 'none' };
                } else {
                  imgStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' };
                }
                const overlayRgb = part.skinOverlay ? hexToRgb(part.skinOverlay.color) : null;
                const hairOverlayRgb = part.hairOverlay ? hexToRgb(part.hairOverlay.color) : null;

                return (
                  <div key={part.id}
                    style={{
                      position: 'absolute', left: part.x, top: part.y, width: part.w, height: part.h,
                      transform: `rotate(${part.rotation||0}deg) scaleX(${part.flipX ? -1 : 1}) scaleY(${part.flipY ? -1 : 1})`,
                      transformOrigin: 'center center',
                      cursor: 'grab', userSelect: 'none',
                      outline: isSel ? `2px solid ${ORANGE}` : isMulti ? '2px solid #818CF8' : '2px solid transparent',
                      outlineOffset: 2,
                    }}
                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, part.id); }}
                    onClick={(e) => e.stopPropagation()}>
                    {/* Inner div clips the img to part bounds; crop uses clip-path here */}
                    <div style={{
                      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                      clipPath: hasClip ? `inset(${ct}% ${cr}% ${cb}% ${cl}%)` : undefined,
                    }}>
                      <img src={part.filePath} alt={part.name} style={imgStyle} draggable={false}
                        onLoad={(e) => handlePartImgLoad(e, part.filePath)} />
                      {overlayRgb && (
                        <div style={{
                          position: 'absolute', left: `${overlayRect.x}%`, top: `${overlayRect.y}%`,
                          width: `${overlayRect.w}%`, height: `${overlayRect.h}%`,
                          background: `rgba(${overlayRgb.r},${overlayRgb.g},${overlayRgb.b},${(part.skinOverlay.opacity ?? 50) / 100})`,
                          mixBlendMode: part.skinOverlay.blendMode || 'multiply', pointerEvents: 'none',
                          WebkitMaskImage: `url(${part.filePath})`, maskImage: `url(${part.filePath})`,
                          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
                          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                          WebkitMaskPosition: '0 0', maskPosition: '0 0',
                        }} />
                      )}
                      {hairOverlayRgb && (
                        <div style={{
                          position: 'absolute', left: `${overlayRect.x}%`, top: `${overlayRect.y}%`,
                          width: `${overlayRect.w}%`, height: `${overlayRect.h}%`,
                          background: `rgba(${hairOverlayRgb.r},${hairOverlayRgb.g},${hairOverlayRgb.b},${(part.hairOverlay.opacity ?? 50) / 100})`,
                          mixBlendMode: part.hairOverlay.blendMode || 'multiply', pointerEvents: 'none',
                          WebkitMaskImage: `url(${part.filePath})`, maskImage: `url(${part.filePath})`,
                          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
                          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                          WebkitMaskPosition: '0 0', maskPosition: '0 0',
                        }} />
                      )}
                    </div>
                    {isSel && (
                      <div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)',
                        background: ORANGE, color:'#fff', fontSize:10, fontWeight:700,
                        padding:'1px 6px', borderRadius:4, whiteSpace:'nowrap', pointerEvents:'none' }}>
                        {part.customName || part.name}
                      </div>
                    )}
                  </div>
                );
              })}


              {canvasParts.length === 0 && (
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:8, pointerEvents:'none' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                  <p style={{ color:'#D1D5DB', fontSize:13, textAlign:'center' }}>
                    Click a part from the library<br/>to add it to the canvas
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#6B7280' }}>
          <span>Selected: <strong style={{ color: '#374151' }}>{selectedPart ? (selectedPart.customName || selectedPart.name) : selectedIds.size > 1 ? `${selectedIds.size} parts` : 'None'}</strong></span>
          <span>Zoom: <strong style={{ color: '#374151' }}>{Math.round(zoom * 100)}%</strong></span>
          <span>Canvas: <strong style={{ color: '#374151' }}>{CANVAS_W} × {CANVAS_H}</strong></span>
          <span style={{ color: '#9CA3AF' }}>Del = remove • Ctrl+Z/Y = undo/redo • Shift-click layers to multi-select</span>
        </div>
      </div>

      {/* ── RIGHT: Inspector ── */}
      <div className="card" style={{ width: 240, flexShrink: 0, padding: 14, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>Inspector</p>

        {/* Selected Asset */}
        <Section title="Selected Asset" defaultOpen>
          {!selectedPart ? (
            <p style={s.hint}>Click a part on the canvas</p>
          ) : (
            <>
              <input className="input" value={selectedPart.customName || selectedPart.name}
                onChange={(e) => updatePart(selectedPart.id, { customName: e.target.value })}
                style={{ fontSize: 12, fontWeight: 600 }} placeholder="Layer name" />

              {selectedPart.groupId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  background: 'var(--nav-light)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: groupColor(selectedPart.groupId), flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--nav-text)', flex: 1 }}>In group</span>
                  <button onClick={() => ungroupPart(selectedPart.id)}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 11, padding: 0, display: 'flex' }}><X size={12} /></button>
                </div>
              )}

              {alignmentEnabled && alignablePartType(selectedPart, dressAlignMode) && (
                <button onClick={saveFacePartAlignmentForSelected} disabled={savingAlignment || !loadedAlignAssetId}
                  title={!loadedAlignAssetId ? 'Save the costume first (Save As), then lock positions' : ''}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px', border: '1.5px solid #86EFAC', borderRadius: 8,
                    background: loadedAlignAssetId ? '#DCFCE7' : '#F3F4F6', color: loadedAlignAssetId ? 'var(--action-hover)' : '#9CA3AF',
                    fontSize: 12, fontWeight: 600, cursor: loadedAlignAssetId ? 'pointer' : 'not-allowed' }}>
                  <Pin size={13} /> {savingAlignment ? 'Saving…' : `Save ${ALIGNABLE_PART_LABELS[alignablePartType(selectedPart, dressAlignMode)]} Position`}
                </button>
              )}
              {alignmentEnabled && !loadedAlignAssetId && alignablePartType(selectedPart, dressAlignMode) && (
                <p style={{ fontSize: 10, color: '#F97316', margin: 0 }}>Save As the costume first to lock positions</p>
              )}

              {/* Head group anchor — save entire face group bbox on the costume */}
              {dressAlignMode && selectedPart.groupId && (
                <button onClick={saveHeadGroupPosition} disabled={savingAlignment || !loadedAlignAssetId}
                  title={!loadedAlignAssetId ? 'Save the costume first (Save As), then lock head position' : ''}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px', border: '1.5px solid #BBF7D0', borderRadius: 8,
                    background: loadedAlignAssetId ? '#F0FDF4' : '#F3F4F6', color: loadedAlignAssetId ? '#15803D' : '#9CA3AF',
                    fontSize: 12, fontWeight: 600, cursor: loadedAlignAssetId ? 'pointer' : 'not-allowed' }}>
                  <Pin size={13} /> {savingAlignment ? 'Saving…' : 'Save Head Position'}
                </button>
              )}

              {/* Hands connection point — where wrists attach to the body arms */}
              {dressAlignMode && alignablePartType(selectedPart, dressAlignMode) === 'hands' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', background: '#FFF7ED', borderRadius: 8, border: '1.5px solid #FED7AA' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#C2410C', margin: 0 }}>Connection Point (wrist attach)</p>
                  <SliderRow label="X %" value={Math.round((selectedPart.connectX ?? 0.5) * 100)} min={0} max={100}
                    onChange={(v) => updatePart(selectedPart.id, { connectX: v / 100 })} unit="%" />
                  <SliderRow label="Y %" value={Math.round((selectedPart.connectY ?? 0.0) * 100)} min={0} max={100}
                    onChange={(v) => updatePart(selectedPart.id, { connectY: v / 100 })} unit="%" />
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>0% = top, 50% = center, 100% = bottom</p>
                </div>
              )}

              <button onClick={() => removePart(selectedPart.id)}
                style={{ padding: '6px', border: '1.5px solid #FECACA', borderRadius: 8,
                  background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Remove Part
              </button>
            </>
          )}
        </Section>

        {/* Transform */}
        <Section title="Transform" defaultOpen={!!selectedPart}>
          {!selectedPart ? (
            <p style={s.hint}>Click a part on the canvas</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => updatePart(selectedPart.id, { flipX: !selectedPart.flipX })}
                  style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', background: selectedPart.flipX ? '#FFF7ED' : '#F9FAFB', borderColor: selectedPart.flipX ? ORANGE : '#E5E7EB', color: selectedPart.flipX ? ORANGE : '#374151' }}>
                  <FlipHorizontal size={13} /> Flip H
                </button>
                <button onClick={() => updatePart(selectedPart.id, { flipY: !selectedPart.flipY })}
                  style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', background: selectedPart.flipY ? '#FFF7ED' : '#F9FAFB', borderColor: selectedPart.flipY ? ORANGE : '#E5E7EB', color: selectedPart.flipY ? ORANGE : '#374151' }}>
                  <FlipVertical size={13} /> Flip V
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => centerSelected('x')} style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center' }}>Center H</button>
                <button onClick={() => centerSelected('y')} style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center' }}>Center V</button>
              </div>
              <button onClick={() => centerSelected('both')} style={{ ...s.ctrlBtn, justifyContent: 'center' }}>
                <Crosshair size={13} /> Center Both
              </button>

              <SliderRow label="X" value={Math.round(selectedPart.x)} min={-120} max={CANVAS_W + 40}
                onChange={(v) => moveSelectedPart('x', v)} />
              <SliderRow label="Y" value={Math.round(selectedPart.y)} min={-120} max={CANVAS_H + 40}
                onChange={(v) => moveSelectedPart('y', v)} />
              <SliderRow label="Width" value={selectedPart.w} min={16} max={CANVAS_W}
                onChange={updateProportional} />
              <SliderRow label="Height" value={selectedPart.h} min={16} max={CANVAS_H}
                onChange={(v) => updatePart(selectedPart.id, { h: v })} />
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: '-4px 0 0' }}>
                Width keeps the aspect ratio; Height stretches this part independently — use both together for a non-uniform stretch (e.g. fitting a 3/4 angle).
              </p>
              <SliderRow label="Rotate" value={selectedPart.rotation || 0} min={-180} max={180}
                onChange={(v) => updatePart(selectedPart.id, { rotation: v })} unit="°" />
              {!isFaceTemplateMode && (
                <SliderRow label="Layer Z" value={selectedPart.zIndex} min={1} max={100}
                  onChange={(v) => updatePart(selectedPart.id, { zIndex: v })} />
              )}

              <button onClick={() => setShowCrop((v) => !v)}
                style={{ ...s.ctrlBtn, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Scissors size={13} /> Crop</span>
                {showCrop ? <ChevronUp size={12} color="#9CA3AF" /> : <ChevronDown size={12} color="#9CA3AF" />}
              </button>
              {showCrop && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4, borderLeft: `2px solid ${ORANGE}` }}>
                  {[['t','Top'],['b','Bottom'],['l','Left'],['r','Right']].map(([k, label]) => (
                    <SliderRow key={k} label={label} value={selectedPart.clip?.[k] ?? 0} min={0} max={49}
                      onChange={(v) => updateClip(k, v)} unit="%" />
                  ))}
                  <button onClick={() => updatePart(selectedPart.id, { clip: { t:0,r:0,b:0,l:0 } })}
                    style={{ ...s.ctrlBtn, fontSize: 10, color: '#9CA3AF' }}>Reset crop</button>
                </div>
              )}
            </>
          )}
        </Section>

        {/* Appearance */}
        <Section title="Appearance" defaultOpen={false}>
          {selectedPart && (
            <>
              {/* "Exposed Skin" marks which parts the runtime exact-match Skin Color tool
                  (DressRig) recolors; "Hair" marks which parts the hair color overlay
                  targets when its scope is "All layers tagged Hair". */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPartCategory(selectedPart.id, selectedPart.partCategory === 'skin' ? null : 'skin')}
                  style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', background: selectedPart.partCategory === 'skin' ? '#FEF3C7' : '#F9FAFB', borderColor: selectedPart.partCategory === 'skin' ? '#F59E0B' : '#E5E7EB', color: selectedPart.partCategory === 'skin' ? '#B45309' : '#374151' }}>
                  Exposed Skin
                </button>
                <button onClick={() => setPartCategory(selectedPart.id, selectedPart.partCategory === 'clothing' ? null : 'clothing')}
                  style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', background: selectedPart.partCategory === 'clothing' ? '#DBEAFE' : '#F9FAFB', borderColor: selectedPart.partCategory === 'clothing' ? '#3B82F6' : '#E5E7EB', color: selectedPart.partCategory === 'clothing' ? '#1D4ED8' : '#374151' }}>
                  Clothing
                </button>
              </div>
              <button onClick={() => setPartCategory(selectedPart.id, selectedPart.partCategory === 'hair' ? null : 'hair')}
                style={{ ...s.ctrlBtn, justifyContent: 'center', background: selectedPart.partCategory === 'hair' ? '#F3E8FF' : '#F9FAFB', borderColor: selectedPart.partCategory === 'hair' ? '#8B5CF6' : '#E5E7EB', color: selectedPart.partCategory === 'hair' ? '#6D28D9' : '#374151' }}>
                Hair
              </button>

              {/* Dress-mode part roles — assigns alignment role AND auto-tags as Exposed Skin */}
              {dressAlignMode && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setDressRole(selectedPart.id, 'neck')}
                    style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', background: selectedPart.dressRole === 'neck' ? '#DCFCE7' : '#F9FAFB', borderColor: selectedPart.dressRole === 'neck' ? '#16A34A' : '#E5E7EB', color: selectedPart.dressRole === 'neck' ? '#15803D' : '#374151' }}>
                    Neck
                  </button>
                  <button onClick={() => setDressRole(selectedPart.id, 'hands')}
                    style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', background: selectedPart.dressRole === 'hands' ? '#DCFCE7' : '#F9FAFB', borderColor: selectedPart.dressRole === 'hands' ? '#16A34A' : '#E5E7EB', color: selectedPart.dressRole === 'hands' ? '#15803D' : '#374151' }}>
                    Hands
                  </button>
                </div>
              )}
              <div style={{ borderTop: '1px solid #F3F4F6', margin: '4px 0' }} />
            </>
          )}

          {/* Hair Color Overlay — skin tone now uses the exact-match Skin Color tool
              (Palette Normalizer) instead of an overlay; hair hasn't moved to that yet */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: 0 }}>Hair Color Overlay</p>
          <p style={{ ...s.hint, margin: 0 }}>
            Tint a layer (e.g. the hairstyle) with a color wash, blended like the panel lighting presets.
          </p>
          <select className="input" value={hairOverlayOwner?.id || ''}
            onChange={(e) => (e.target.value ? setHairOverlayTarget(e.target.value) : removeHairOverlay())}
            style={{ fontSize: 12 }}>
            <option value="">No overlay</option>
            {sortedByZ.map((p) => (
              <option key={p.id} value={p.id}>{p.customName || p.name}</option>
            ))}
          </select>
          {hairOverlayOwner && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={hairOverlayOwner.hairOverlay.color}
                  onChange={(e) => updateHairOverlay({ color: e.target.value })}
                  style={{ width: 40, height: 28, padding: 0, border: '1.5px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }} />
                <select value={hairOverlayOwner.hairOverlay.blendMode} onChange={(e) => updateHairOverlay({ blendMode: e.target.value })}
                  style={{ flex: 1, fontSize: 12 }}>
                  {OVERLAY_BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <SliderRow label="Opacity" value={hairOverlayOwner.hairOverlay.opacity ?? 50} min={0} max={100}
                onChange={(v) => updateHairOverlay({ opacity: v })} unit="%" />
              <div>
                <p style={{ ...s.hint, marginBottom: 4 }}>Apply to</p>
                <select value={hairOverlayOwner.hairOverlayScope || 'single'}
                  onChange={(e) => setHairOverlayScope(e.target.value)}
                  style={{ fontSize: 12, width: '100%' }}>
                  <option value="single">This layer only</option>
                  <option value="below">This layer + layers below</option>
                  <option value="hairTagged">All layers tagged "Hair"</option>
                </select>
              </div>
              <button onClick={removeHairOverlay}
                style={{ ...s.ctrlBtn, justifyContent: 'center', color: '#9CA3AF' }}>
                Remove overlay
              </button>
            </>
          )}
        </Section>

        {/* Layers */}
        <Section title="Layers" badge={`(${canvasParts.length})`} defaultOpen action={
          <div style={{ display: 'flex', gap: 4 }}>
            {selectedIds.size >= 2 && (
              <button onClick={groupSelected}
                style={{ fontSize: 10, fontWeight: 700, color: 'var(--nav-text)', background: 'var(--nav-light)',
                  border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>
                Group
              </button>
            )}
            {canvasParts.length > 0 && (
              <button onClick={() => { commitParts([]); setSelectedId(null); setSelectedIds(new Set()); }}
                style={{ fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                Clear
              </button>
            )}
          </div>
        }>
          {canvasParts.length === 0 ? (
            <p style={s.hint}>No parts added yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 340, overflowY: 'auto' }}>
              {sortedByZ.map((part, sortIdx) => {
                const isSel   = selectedId === part.id;
                const isMulti = selectedIds.has(part.id);
                const gc      = groupColor(part.groupId);
                const isEditing = editingName === part.id;
                return (
                  <div key={part.id}
                    onClick={(e) => handleLayerClick(e, part.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 5px', borderRadius: 7, cursor: 'pointer',
                      background: isSel ? '#FEF3E2' : isMulti ? 'var(--nav-light)' : 'transparent',
                      border: `1.5px solid ${isSel ? ORANGE : isMulti ? 'var(--nav-primary)' : 'transparent'}`,
                    }}>
                    {gc && <div style={{ width: 4, height: '100%', minHeight: 26, borderRadius: 2, background: gc, flexShrink: 0 }} />}
                    <img src={part.filePath} alt=""
                      style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, borderRadius: 3, background: '#f3f4f6' }} />
                    {part.dressRole && (
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4, flexShrink: 0, background: '#DCFCE7', color: '#15803D' }}>
                        {part.dressRole.toUpperCase()}
                      </span>
                    )}
                    {part.partCategory && (
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4, flexShrink: 0,
                        background: part.partCategory === 'skin' ? '#FEF3C7' : part.partCategory === 'hair' ? '#F3E8FF' : '#DBEAFE',
                        color:      part.partCategory === 'skin' ? '#B45309' : part.partCategory === 'hair' ? '#6D28D9' : '#1D4ED8' }}>
                        {part.partCategory === 'skin' ? 'SKIN' : part.partCategory === 'hair' ? 'HAIR' : 'CLOTH'}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <input autoFocus value={editNameVal}
                          onChange={(e) => setEditNameVal(e.target.value)}
                          onBlur={() => { updatePart(part.id, { customName: editNameVal }); setEditingName(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updatePart(part.id, { customName: editNameVal }); setEditingName(null); } if (e.key === 'Escape') setEditingName(null); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '100%', fontSize: 11, border: `1px solid ${ORANGE}`, borderRadius: 4, padding: '1px 4px', outline: 'none', boxSizing: 'border-box' }} />
                      ) : (
                        <p onDoubleClick={(e) => { e.stopPropagation(); setEditingName(part.id); setEditNameVal(part.customName || part.name); }}
                          style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', margin: 0 }}
                          title="Double-click to rename">
                          {part.customName || part.name}
                        </p>
                      )}
                    </div>
                    {/* Up / Down — face-template parts use a fixed automatic order instead */}
                    {!isFaceTemplateMode && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); moveLayer(part.id, -1); }}
                          style={{ ...s.arrowBtn }} title="Move up" disabled={sortIdx === 0}><ChevronUp size={10} /></button>
                        <button onClick={(e) => { e.stopPropagation(); moveLayer(part.id, 1); }}
                          style={{ ...s.arrowBtn }} title="Move down" disabled={sortIdx === sortedByZ.length - 1}><ChevronDown size={10} /></button>
                      </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); removePart(part.id); }}
                      style={{ ...s.arrowBtn, color: '#EF4444', flexShrink: 0, display: 'flex' }} title="Remove"><X size={11} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* History */}
        <Section title="History" defaultOpen={false}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={undo} disabled={!canUndo} style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', opacity: canUndo ? 1 : 0.4 }}>
              <Undo2 size={13} /> Undo
            </button>
            <button onClick={redo} disabled={!canRedo} style={{ ...s.ctrlBtn, flex: 1, justifyContent: 'center', opacity: canRedo ? 1 : 0.4 }}>
              <Redo2 size={13} /> Redo
            </button>
          </div>
          <p style={s.hint}>Ctrl+Z / Ctrl+Y — every drag, resize, and edit is a checkpoint.</p>
        </Section>
      </div>
    </div>
  );
}

// Collapsible section wrapper used to group the Asset Browser and Inspector into
// labeled, expand/collapse blocks instead of separate cards — pure presentation,
// each section's own content/handlers are unchanged from before.
function Section({ title, badge, action, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={s.section}>
      <div style={s.sectionHeader}>
        <button onClick={() => setOpen((o) => !o)} style={s.sectionToggle}>
          {open ? <ChevronUp size={13} color="#9CA3AF" /> : <ChevronDown size={13} color="#9CA3AF" />}
          <span style={s.sectionHeaderTitle}>{title}</span>
          {badge != null && <span style={s.sectionBadge}>{badge}</span>}
        </button>
        {action}
      </div>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, unit = '' }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 6 }}>
        <span style={{ fontSize: 11, color: '#6B7280' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input type="number" min={min} max={max} value={value}
            onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onChange(clamp(v)); }}
            style={{ width: 48, fontSize: 11, fontWeight: 600, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 5, padding: '1px 4px', textAlign: 'right' }} />
          {unit && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{unit}</span>}
        </div>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', display: 'block', ...sliderFillStyle(value, min, max) }} />
    </div>
  );
}

const s = {
  hint:         { fontSize: 12, color: '#9CA3AF' },
  assetThumb:   { border: '1.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#F9FAFB', cursor: 'pointer', padding: 0, transition: 'border-color 0.15s', display: 'block', textAlign: 'left' },
  savedViewBtn: {
    fontSize: 9, fontWeight: 700, padding: '2px 6px', flex: 1, textAlign: 'center',
    border: '1px solid #E5E7EB', borderRadius: 4, background: '#fff', color: '#374151', cursor: 'pointer',
  },
  miniBtn:      { flex: 1, fontSize: 9, fontWeight: 700, color: '#374151', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 5, padding: '2px 0', cursor: 'pointer' },
  thumbLabel:   { fontSize: 9, textAlign: 'center', padding: '2px 3px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 },
  fileLabel:    { display: 'block', padding: '8px 10px', border: '1.5px dashed #E5E7EB', borderRadius: 8, fontSize: 11, color: '#6B7280', cursor: 'pointer', textAlign: 'center' },
  iconBtn:      { width: 30, height: 30, borderRadius: 7, border: '1.5px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ctrlBtn:      { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', border: '1.5px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151' },
  arrowBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#9CA3AF', padding: '1px 2px', lineHeight: 1 },
  tbDivider:    { width: 1, height: 20, background: '#E5E7EB', flexShrink: 0 },
  chip:         { fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '2px 8px', cursor: 'pointer' },
  chipActive:   { background: '#FFF7ED', borderColor: ORANGE, color: ORANGE },

  section:       { borderTop: '1px solid #E5E7EB', paddingTop: 10, marginTop: 10 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  sectionToggle: { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 },
  sectionHeaderTitle: { fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionBadge:  { fontSize: 11, fontWeight: 400, color: '#9CA3AF' },
  sectionBody:   { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 },
};
