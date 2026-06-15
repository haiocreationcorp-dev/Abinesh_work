import { useState, useEffect, useRef, useCallback } from 'react';
import { getAssets, uploadAsset, saveAssembledExpression, getFacePartAlignment, saveFacePartAlignment } from '../../../api/assets.js';
import { computeTrimRect, loadTrimRect, trimmedRect } from '../../../utils/trimRect.js';
import { hexToRgb } from '../../../lighting/lightingEngine.js';

const ORANGE = '#F97316';
const CANVAS_W = 400;
const CANVAS_H = 600;
const MAX_HISTORY = 50;
const GROUP_COLORS = ['#818CF8', '#34D399', '#F472B6', '#FBBF24', '#60A5FA'];

// Color overlay blend modes for the skin-tone overlay (same idea as panel lighting presets).
const OVERLAY_BLEND_MODES = [
  'multiply', 'color', 'soft-light', 'overlay', 'hue', 'saturation',
  'color-dodge', 'color-burn', 'hard-light', 'screen', 'luminosity', 'normal',
];

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Classify a canvas part as 'nose' | 'eye' | 'mouth' | null based on its layer name.
function classifyPartType(part) {
  const n = (part.customName || part.name || '').toLowerCase();
  if (n.includes('nose')) return 'nose';
  if (n.includes('eye')) return 'eye';
  if (n.includes('mouth')) return 'mouth';
  return null;
}

// Classifies a part/asset as a face-part type whose position can be calibrated
// per-face ('hairstyle' | 'nose' | 'eye' | 'mouth'), or null if it's not one of those.
function alignablePartType(item) {
  const n = (item.customName || item.name || '').toLowerCase();
  if (n.includes('hair') || item.tags?.includes('hairstyle')) return 'hairstyle';
  if (n.includes('nose') || item.tags?.includes('nose')) return 'nose';
  if (n.includes('eye') || item.tags?.includes('eye')) return 'eye';
  if (n.includes('mouth') || item.tags?.includes('mouth')) return 'mouth';
  return null;
}

const ALIGNABLE_PART_LABELS = { hairstyle: 'Hairstyle', nose: 'Nose', eye: 'Eye', mouth: 'Mouth' };

// Nose/eye/mouth alignments are shared across all assets of that type for a given face
// (the "slot" doesn't move when the variant changes); only hairstyle is calibrated per-asset.
const SHARED_ALIGNMENT_KEY = '__ALL__';
const alignmentAssetId = (partType, assetId) => (partType === 'hairstyle' ? assetId : SHARED_ALIGNMENT_KEY);

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
    // Skin tone overlay — a color wash blended over this part, like a panel lighting preset.
    let overlayLine = '';
    if (p.skinOverlay) {
      const rgb = hexToRgb(p.skinOverlay.color);
      if (rgb) {
        const opacity = (p.skinOverlay.opacity ?? 50) / 100;
        const maskId = `skinMask${i}`;
        defs.push(`<mask id="${maskId}" style="mask-type:alpha"><image x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" href="${href}" preserveAspectRatio="xMidYMid meet"/></mask>`);
        overlayLine = `\n    <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${p.skinOverlay.color}" opacity="${opacity}" style="mix-blend-mode:${p.skinOverlay.blendMode || 'multiply'}" mask="url(#${maskId})"/>`;
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
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">`,
    defs.length ? `  <defs>${defs.join('')}</defs>` : '',
    ...groups,
    '</svg>',
  ].filter(Boolean).join('\n');
}

// Generic configurable canvas-based part assembler, used by FaceBuilder and DressBuilder.
export default function PartAssembler({ title, libraryCategory, partTypes, onSave, nameLabel, savedCategory, expressionsCategory, enableFacePartAlignment }) {
  const [canvasParts, setCanvasParts]   = useState([]);
  const [selectedId, setSelectedId]     = useState(null);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [itemName, setItemName]         = useState('');
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
  const [searchQ, setSearchQ]           = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [zoom, setZoom]                 = useState(1);
  const [editingName, setEditingName]   = useState(null);
  const [editNameVal, setEditNameVal]   = useState('');
  const [showCrop, setShowCrop]         = useState(false);
  const [expressions, setExpressions]   = useState([]);
  const [loadingExpr, setLoadingExpr]   = useState(false);
  const [exprName, setExprName]         = useState('');
  const [savingExpr, setSavingExpr]     = useState(false);
  const [applyingExprId, setApplyingExprId] = useState(null);
  const [loadedFaceAssetId, setLoadedFaceAssetId] = useState(null);
  const [savingAlignment, setSavingAlignment] = useState(false);

  const dragRef      = useRef(null);
  const canvasRef    = useRef(null);
  const wrapperRef   = useRef(null);
  const historyRef   = useRef({ stack: [[]], idx: 0 });
  const zoomRef      = useRef(1);
  const userZoomedRef = useRef(false);
  const selIdRef     = useRef(null);
  const trimCacheRef = useRef({});   // filePath → trim rect
  const [trimVersion, setTrimVersion] = useState(0); // bumped to trigger rerender after trim computed
  zoomRef.current   = zoom;
  selIdRef.current  = selectedId;

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

  const refreshExpressions = useCallback(() => {
    if (!expressionsCategory) return;
    setLoadingExpr(true);
    getAssets({ category: expressionsCategory }).then(setExpressions).catch(() => setExpressions([])).finally(() => setLoadingExpr(false));
  }, [expressionsCategory]);

  useEffect(() => {
    refreshAssets();
    refreshSaved();
    refreshExpressions();
  }, [refreshAssets, refreshSaved, refreshExpressions]);

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
        const id = selIdRef.current;
        if (id) { commitParts((prev) => prev.filter((p) => p.id !== id)); setSelectedId(null); }
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commitParts, undo, redo]);

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
        const tags = uploadType ? `${name},${uploadType}` : name;
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
  const addToCanvas = async (asset) => {
    const selId = selIdRef.current;

    // For hairstyle/nose parts, check if this face+part pair has a saved alignment
    // and apply its position/size/rotation instead of the default placement.
    let alignment = null;
    const partType = alignablePartType(asset);
    if (enableFacePartAlignment && loadedFaceAssetId && partType) {
      try { alignment = await getFacePartAlignment(loadedFaceAssetId, alignmentAssetId(partType, asset.id), partType); } catch { /* ignore */ }
    }

    if (selectedIds.size > 1) {
      commitParts((prev) => prev.map((p) => selectedIds.has(p.id)
        ? { ...p, assetId: asset.id, filePath: asset.filePath, name: asset.name, customName: '',
            ...(alignment ? { x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h, rotation: alignment.rotation, flipX: alignment.flipX, flipY: alignment.flipY } : {}) }
        : p));
      return;
    }
    if (selId) {
      commitParts((prev) => prev.map((p) => p.id === selId
        ? { ...p, assetId: asset.id, filePath: asset.filePath, name: asset.name, customName: '',
            ...(alignment ? { x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h, rotation: alignment.rotation, flipX: alignment.flipX, flipY: alignment.flipY } : {}) }
        : p));
      return;
    }
    commitParts((prev) => {
      const maxZ = prev.length ? Math.max(...prev.map((p) => p.zIndex)) + 1 : 50;
      return [...prev, {
        id: genId(), assetId: asset.id, filePath: asset.filePath,
        name: asset.name, customName: '',
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

  // ── Expressions (nose-anchored eye+mouth combos) ──
  // Save the 3 currently-selected parts (nose, eye, mouth — identified by layer name)
  // as a reusable EXPRESSION asset. Eye/mouth are stored as offsets from the nose so
  // their position can be reconstructed on any face.
  const saveExpression = async () => {
    if (selectedIds.size !== 3 || !exprName.trim()) return;
    setSavingExpr(true); setSavedMsg('');
    try {
      const parts = canvasParts.filter((p) => selectedIds.has(p.id));
      const nose  = parts.find((p) => classifyPartType(p) === 'nose');
      const eye   = parts.find((p) => classifyPartType(p) === 'eye');
      const mouth = parts.find((p) => classifyPartType(p) === 'mouth');
      if (!nose || !eye || !mouth) {
        setSavedMsg('Name the layers "nose", "eye" and "mouth" so they can be identified');
        return;
      }
      const svg = await buildAssembledSvg([eye, mouth], trimCacheRef.current);
      const layout = [
        { ...eye,   type: 'eye',   dx: eye.x - nose.x,   dy: eye.y - nose.y },
        { ...mouth, type: 'mouth', dx: mouth.x - nose.x, dy: mouth.y - nose.y },
      ].map(({ id, ...rest }) => rest);
      await saveAssembledExpression(exprName.trim(), svg, layout);
      setExprName('');
      setSavedMsg('Saved expression');
      setTimeout(() => setSavedMsg(''), 3000);
      refreshExpressions();
    } catch (err) {
      setSavedMsg(err?.response?.data?.error || 'Failed to save expression');
    } finally {
      setSavingExpr(false);
    }
  };

  // Apply a saved expression onto the 3 currently-selected parts (nose, eye, mouth).
  // Eye/mouth are repositioned and resized using the target face's nose as the anchor,
  // and their images are swapped in from the saved expression.
  const applyExpression = async (asset) => {
    if (selectedIds.size !== 3 || !asset.layoutPath) return;
    setApplyingExprId(asset.id);
    try {
      const layout = await fetch(asset.layoutPath).then((r) => r.json());
      if (!Array.isArray(layout) || layout.length < 2) return;
      const exprEye   = layout.find((p) => p.type === 'eye');
      const exprMouth = layout.find((p) => p.type === 'mouth');
      if (!exprEye || !exprMouth) return;

      const parts = canvasParts.filter((p) => selectedIds.has(p.id));
      const nose  = parts.find((p) => classifyPartType(p) === 'nose');
      const eye   = parts.find((p) => classifyPartType(p) === 'eye');
      const mouth = parts.find((p) => classifyPartType(p) === 'mouth');
      if (!nose || !eye || !mouth) {
        setSavedMsg('Name the layers "nose", "eye" and "mouth" so they can be identified');
        return;
      }

      commitParts((prev) => prev.map((p) => {
        if (p.id === eye.id) {
          return { ...p, assetId: exprEye.assetId, filePath: exprEye.filePath, name: exprEye.name, customName: '',
            x: nose.x + exprEye.dx, y: nose.y + exprEye.dy, w: exprEye.w, h: exprEye.h,
            rotation: exprEye.rotation, flipX: exprEye.flipX, flipY: exprEye.flipY };
        }
        if (p.id === mouth.id) {
          return { ...p, assetId: exprMouth.assetId, filePath: exprMouth.filePath, name: exprMouth.name, customName: '',
            x: nose.x + exprMouth.dx, y: nose.y + exprMouth.dy, w: exprMouth.w, h: exprMouth.h,
            rotation: exprMouth.rotation, flipX: exprMouth.flipX, flipY: exprMouth.flipY };
        }
        return p;
      }));
    } catch {
      setSavedMsg('Failed to apply expression');
    } finally {
      setApplyingExprId(null);
    }
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

  const handleMouseMove = useCallback((e) => {
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

  const handleWheelZoom = useCallback((e) => {
    e.preventDefault();
    userZoomedRef.current = true;
    setZoom((z) => {
      const next = z - e.deltaY * 0.001;
      return Math.min(2, Math.max(0.4, Math.round(next * 100) / 100));
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current?.moved) {
      setCanvasParts((prev) => {
        const { stack, idx } = historyRef.current;
        const trimmed = stack.slice(0, idx + 1);
        const newStack = [...trimmed, prev].slice(-MAX_HISTORY);
        historyRef.current = { stack: newStack, idx: newStack.length - 1 };
        return prev;
      });
    }
    dragRef.current = null;
  }, []);

  // ── Part mutations ──
  const updatePart = useCallback((id, patch) => {
    commitParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [commitParts]);

  const updateClip = useCallback((key, val) => {
    const id = selIdRef.current; if (!id) return;
    commitParts((prev) => prev.map((p) => p.id === id ? { ...p, clip: { ...p.clip, [key]: val } } : p));
  }, [commitParts]);

  const updateProportional = useCallback((newW) => {
    const id = selIdRef.current; if (!id) return;
    setCanvasParts((prev) => {
      const p = prev.find((pt) => pt.id === id); if (!p) return prev;
      const ratio = p.h / p.w;
      const next = prev.map((pt) => pt.id === id ? { ...pt, w: newW, h: Math.round(newW * ratio) } : pt);
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

  // ── Skin tone overlay (single overlay, assignable to one layer — optionally
  // cascading to every layer below it in z-order — at a time) ──
  const stripOverlay = (p) => {
    const { skinOverlay, skinOverlayOwner, skinOverlayBelow, ...rest } = p;
    return rest;
  };

  const applySkinOverlayConfig = useCallback((targetId, applyBelow, overlay) => {
    commitParts((prev) => {
      const target = prev.find((p) => p.id === targetId);
      if (!target) return prev.map(stripOverlay);
      return prev.map((p) => {
        const rest = stripOverlay(p);
        if (p.id === targetId) return { ...rest, skinOverlay: overlay, skinOverlayOwner: true, skinOverlayBelow: applyBelow };
        if (applyBelow && p.zIndex <= target.zIndex) return { ...rest, skinOverlay: overlay };
        return rest;
      });
    });
  }, [commitParts]);

  const setSkinOverlayTarget = useCallback((targetId) => {
    const current = canvasParts.find((p) => p.skinOverlayOwner);
    const overlay = current?.skinOverlay || { color: '#d99a6c', blendMode: 'multiply', opacity: 50 };
    applySkinOverlayConfig(targetId, current?.skinOverlayBelow ?? false, overlay);
  }, [canvasParts, applySkinOverlayConfig]);

  const setSkinOverlayBelow = useCallback((applyBelow) => {
    const current = canvasParts.find((p) => p.skinOverlayOwner);
    if (!current) return;
    applySkinOverlayConfig(current.id, applyBelow, current.skinOverlay);
  }, [canvasParts, applySkinOverlayConfig]);

  const updateSkinOverlay = useCallback((patch) => {
    commitParts((prev) => prev.map((p) => p.skinOverlay ? { ...p, skinOverlay: { ...p.skinOverlay, ...patch } } : p));
  }, [commitParts]);

  const removeSkinOverlay = useCallback(() => {
    commitParts((prev) => prev.map((p) => p.skinOverlay ? stripOverlay(p) : p));
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

  // ── Save ──
  const handleSave = async () => {
    if (!itemName.trim() || !canvasParts.length) return;
    setSaving(true); setSavedMsg('');
    try {
      const svg = await buildAssembledSvg(canvasParts, trimCacheRef.current);
      // Layout: scaling, position, and layer-order data so the canvas can be recreated later.
      const layout = canvasParts.map(({ id, ...rest }) => rest);
      const res = await onSave(itemName.trim(), svg, layout);
      setSavedMsg(`Saved as "${res.name}"`);
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
      const layout = await fetch(asset.layoutPath).then((r) => r.json());
      let parts = layout.map((part) => ({ ...part, id: genId() }));

      // Override any alignable part's (hairstyle/nose/eye/mouth) position with its calibrated alignment for this face.
      if (enableFacePartAlignment) {
        parts = await Promise.all(parts.map(async (part) => {
          const partType = alignablePartType(part);
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
      if (enableFacePartAlignment) setLoadedFaceAssetId(asset.id);
    } catch {
      setSavedMsg('Failed to load saved layout');
    } finally {
      setLoadingSavedId(null);
    }
  };

  // Save the currently selected part's position/size/rotation as the
  // remembered alignment for (loaded face, part asset, part type).
  const saveFacePartAlignmentForSelected = async () => {
    const part = canvasParts.find((p) => p.id === selIdRef.current);
    const partType = part ? alignablePartType(part) : null;
    if (!part || !loadedFaceAssetId || !part.assetId || !partType) return;
    setSavingAlignment(true);
    try {
      await saveFacePartAlignment({
        faceAssetId: loadedFaceAssetId,
        partAssetId: alignmentAssetId(partType, part.assetId),
        partType,
        x: part.x, y: part.y, w: part.w, h: part.h,
        rotation: part.rotation || 0, flipX: !!part.flipX, flipY: !!part.flipY,
      });
      setSavedMsg(`Saved ${partType} position`);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setSavedMsg(err?.response?.data?.error || 'Failed to save position');
    } finally {
      setSavingAlignment(false);
    }
  };

  // Called when a canvas part image loads — computes trim rect once per filePath.
  const handlePartImgLoad = useCallback((e, filePath) => {
    if (filePath in trimCacheRef.current) return;
    const trim = computeTrimRect(e.target);
    trimCacheRef.current[filePath] = trim;
    setTrimVersion((v) => v + 1);
  }, []);

  const selectedPart = canvasParts.find((p) => p.id === selectedId);
  const overlayOwner = canvasParts.find((p) => p.skinOverlayOwner);
  const sortedByZ    = [...canvasParts].sort((a, b) => b.zIndex - a.zIndex);
  const filteredAssets = allAssets.filter((a) => {
    if (searchQ.trim() && !a.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (typeFilter !== 'all' && !a.tags?.includes(typeFilter)) return false;
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

      {/* ── LEFT: Library ── */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Upload */}
        <div className="card" style={{ padding: 14 }}>
          <p style={s.sectionTitle}>Upload Parts</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
            {!!partTypes?.length && (
              <select className="input" value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                style={{ fontSize: 12 }}>
                {partTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
            <label style={{ ...s.fileLabel, background: uploadFiles.length ? '#FFF7ED' : '#F9FAFB', borderColor: uploadFiles.length ? ORANGE : '#E5E7EB' }}>
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
          </div>
        </div>

        {/* Library */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={s.sectionTitle}>Library <span style={{ fontWeight: 400, color: '#9CA3AF' }}>({filteredAssets.length})</span></p>
            <button onClick={refreshAssets}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9CA3AF' }} title="Refresh">↻</button>
          </div>
          {selectedIds.size > 1 ? (
            <p style={{ fontSize: 11, color: ORANGE, marginTop: -4, marginBottom: 8 }}>
              Click a part to swap {selectedIds.size} selected parts
            </p>
          ) : selectedPart && (
            <p style={{ fontSize: 11, color: ORANGE, marginTop: -4, marginBottom: 8 }}>
              Click a part to swap "{selectedPart.customName || selectedPart.name}"
            </p>
          )}
          {!!partTypes?.length && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              <button onClick={() => setTypeFilter('all')}
                style={{ ...s.chip, ...(typeFilter === 'all' ? s.chipActive : {}) }}>All</button>
              {partTypes.map((t) => (
                <button key={t.id} onClick={() => setTypeFilter(t.id)}
                  style={{ ...s.chip, ...(typeFilter === t.id ? s.chipActive : {}) }}>{t.label}</button>
              ))}
            </div>
          )}
          <input className="input" placeholder="Search…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            style={{ fontSize: 12, marginBottom: 8, width: '100%', boxSizing: 'border-box' }} />
          {loadingAssets ? (
            <p style={s.hint}>Loading…</p>
          ) : filteredAssets.length === 0 ? (
            <p style={s.hint}>No parts found. Upload SVGs above.</p>
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
        </div>

        {/* Saved (recreate layout on canvas) */}
        {!!savedCategory && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={s.sectionTitle}>Saved <span style={{ fontWeight: 400, color: '#9CA3AF' }}>({savedAssets.length})</span></p>
              <button onClick={refreshSaved}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9CA3AF' }} title="Refresh">↻</button>
            </div>
            {loadingSaved ? (
              <p style={s.hint}>Loading…</p>
            ) : savedAssets.length === 0 ? (
              <p style={s.hint}>No saved items yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {savedAssets.map((asset) => (
                  <button key={asset.id} title={`Load "${asset.name}"`} onClick={() => loadSavedAsset(asset)}
                    disabled={!asset.layoutPath || loadingSavedId === asset.id} style={s.assetThumb}>
                    <img src={asset.filePath} alt={asset.name}
                      style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', opacity: loadingSavedId === asset.id ? 0.5 : 1 }} />
                    <p style={s.thumbLabel}>{asset.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expressions (eye+mouth combos) */}
        {!!expressionsCategory && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={s.sectionTitle}>Expressions <span style={{ fontWeight: 400, color: '#9CA3AF' }}>({expressions.length})</span></p>
              <button onClick={refreshExpressions}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9CA3AF' }} title="Refresh">↻</button>
            </div>
            {selectedIds.size === 3 ? (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input className="input" placeholder="Expression name…" value={exprName}
                  onChange={(e) => setExprName(e.target.value)} style={{ fontSize: 12, flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={saveExpression}
                  disabled={savingExpr || !exprName.trim()} style={{ fontSize: 12, flexShrink: 0 }}>
                  {savingExpr ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <p style={{ ...s.hint, marginTop: -4, marginBottom: 8 }}>
                Shift-select the nose, eye + mouth (3 parts, named accordingly) to save or apply an expression
              </p>
            )}
            {loadingExpr ? (
              <p style={s.hint}>Loading…</p>
            ) : expressions.length === 0 ? (
              <p style={s.hint}>No expressions saved yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {expressions.map((asset) => (
                  <button key={asset.id} title={selectedIds.size === 3 ? `Apply "${asset.name}"` : asset.name}
                    onClick={() => applyExpression(asset)}
                    disabled={selectedIds.size !== 3 || !asset.layoutPath || applyingExprId === asset.id}
                    style={{ ...s.assetThumb, opacity: selectedIds.size === 3 ? 1 : 0.5 }}>
                    <img src={asset.filePath} alt={asset.name}
                      style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', opacity: applyingExprId === asset.id ? 0.5 : 1 }} />
                    <p style={s.thumbLabel}>{asset.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CENTER: Canvas ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

        {/* Toolbar */}
        <div className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Undo / Redo */}
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...s.iconBtn, opacity: canUndo ? 1 : 0.35 }}>↩</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...s.iconBtn, opacity: canRedo ? 1 : 0.35 }}>↪</button>
          <div style={s.tbDivider} />

          {/* Zoom */}
          <button onClick={() => { userZoomedRef.current = true; setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 20) / 20)); }} title="Zoom out" style={s.iconBtn}>−</button>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 34, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => { userZoomedRef.current = true; setZoom((z) => Math.min(2, Math.round((z + 0.1) * 20) / 20)); }} title="Zoom in" style={s.iconBtn}>+</button>
          <button onClick={() => { userZoomedRef.current = false; fitZoom(); }} title="Fit to screen" style={{ ...s.iconBtn, width: 'auto', padding: '0 8px', fontSize: 11 }}>Fit</button>
          <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>Scroll to zoom</span>
          <div style={s.tbDivider} />

          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
          <div style={{ flex: 1 }} />
          <input className="input" placeholder={nameLabel} value={itemName}
            onChange={(e) => setItemName(e.target.value)} style={{ width: 160, fontSize: 13 }} />
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || !itemName.trim() || !canvasParts.length} style={{ flexShrink: 0, fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save'}
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
        <div className="card" ref={wrapperRef} onWheel={handleWheelZoom}
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

              {[...canvasParts].sort((a, b) => a.zIndex - b.zIndex).map((part) => {
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
                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, part.id); }}>
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
                    </div>
                    {isSel && (
                      <div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)',
                        background: ORANGE, color:'#fff', fontSize:10, fontWeight:700,
                        padding:'1px 6px', borderRadius:4, whiteSpace:'nowrap', pointerEvents:'none' }}>
                        {part.customName || part.name}
                      </div>
                    )}
                    {gc && (
                      <div style={{ position:'absolute', bottom:-6, right:-6, width:10, height:10, borderRadius:'50%',
                        background: gc, border:'1.5px solid #fff', pointerEvents:'none' }} />
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
        <p style={{ fontSize:11, color:'#9CA3AF', textAlign:'center', margin:0 }}>
          Del = remove • Ctrl+Z/Y = undo/redo • Shift-click layers to multi-select
        </p>
      </div>

      {/* ── RIGHT: Controls + Layers ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Part Controls */}
        <div className="card" style={{ padding: 14 }}>
          <p style={s.sectionTitle}>Part Controls</p>
          {!selectedPart ? (
            <p style={{ ...s.hint, marginTop: 8 }}>Click a part on the canvas</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>

              {/* Name */}
              <input className="input" value={selectedPart.customName || selectedPart.name}
                onChange={(e) => updatePart(selectedPart.id, { customName: e.target.value })}
                style={{ fontSize: 12, fontWeight: 600 }} placeholder="Layer name" />

              {/* Flip buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => updatePart(selectedPart.id, { flipX: !selectedPart.flipX })}
                  style={{ ...s.ctrlBtn, flex: 1, background: selectedPart.flipX ? '#FFF7ED' : '#F9FAFB', borderColor: selectedPart.flipX ? ORANGE : '#E5E7EB', color: selectedPart.flipX ? ORANGE : '#374151' }}>
                  ↔ Flip H
                </button>
                <button onClick={() => updatePart(selectedPart.id, { flipY: !selectedPart.flipY })}
                  style={{ ...s.ctrlBtn, flex: 1, background: selectedPart.flipY ? '#FFF7ED' : '#F9FAFB', borderColor: selectedPart.flipY ? ORANGE : '#E5E7EB', color: selectedPart.flipY ? ORANGE : '#374151' }}>
                  ↕ Flip V
                </button>
              </div>

              {/* Center align buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => updatePart(selectedPart.id, { x: Math.round((CANVAS_W - selectedPart.w) / 2) })}
                  style={{ ...s.ctrlBtn, flex: 1 }}>
                  ↔ Center H
                </button>
                <button onClick={() => updatePart(selectedPart.id, { y: Math.round((CANVAS_H - selectedPart.h) / 2) })}
                  style={{ ...s.ctrlBtn, flex: 1 }}>
                  ↕ Center V
                </button>
              </div>
              <button onClick={() => updatePart(selectedPart.id, {
                x: Math.round((CANVAS_W - selectedPart.w) / 2),
                y: Math.round((CANVAS_H - selectedPart.h) / 2),
              })} style={s.ctrlBtn}>
                ⊹ Center Both
              </button>

              <SliderRow label="X" value={Math.round(selectedPart.x)} min={-120} max={CANVAS_W + 40}
                onChange={(v) => updatePart(selectedPart.id, { x: v })} />
              <SliderRow label="Y" value={Math.round(selectedPart.y)} min={-120} max={CANVAS_H + 40}
                onChange={(v) => updatePart(selectedPart.id, { y: v })} />
              <SliderRow label="Width" value={selectedPart.w} min={16} max={CANVAS_W}
                onChange={updateProportional} />
              <SliderRow label="Rotate" value={selectedPart.rotation || 0} min={-180} max={180}
                onChange={(v) => updatePart(selectedPart.id, { rotation: v })} unit="°" />
              <SliderRow label="Layer Z" value={selectedPart.zIndex} min={1} max={100}
                onChange={(v) => updatePart(selectedPart.id, { zIndex: v })} />

              {/* Crop section */}
              <button onClick={() => setShowCrop((v) => !v)}
                style={{ ...s.ctrlBtn, justifyContent: 'space-between' }}>
                <span>✂ Crop</span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>{showCrop ? '▲' : '▼'}</span>
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

              {/* Group badge */}
              {selectedPart.groupId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  background: '#F5F3FF', borderRadius: 8, border: '1px solid #DDD6FE' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: groupColor(selectedPart.groupId), flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#6D28D9', flex: 1 }}>In group</span>
                  <button onClick={() => ungroupPart(selectedPart.id)}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </div>
              )}

              {enableFacePartAlignment && loadedFaceAssetId && alignablePartType(selectedPart) && (
                <button onClick={saveFacePartAlignmentForSelected} disabled={savingAlignment}
                  style={{ padding: '6px', border: '1.5px solid #BFDBFE', borderRadius: 8,
                    background: '#EFF6FF', color: '#1D4ED8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {savingAlignment ? 'Saving…' : `📌 Save ${ALIGNABLE_PART_LABELS[alignablePartType(selectedPart)]} Position`}
                </button>
              )}

              <button onClick={() => removePart(selectedPart.id)}
                style={{ padding: '6px', border: '1.5px solid #FECACA', borderRadius: 8,
                  background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Remove Part
              </button>
            </div>
          )}
        </div>

        {/* Skin Tone Overlay — a color wash on one layer, like a panel lighting preset */}
        <div className="card" style={{ padding: 14 }}>
          <p style={s.sectionTitle}>Skin Tone Overlay</p>
          <p style={{ ...s.hint, marginTop: 4, marginBottom: 8 }}>
            Tint a layer (e.g. the face shape) with a color wash, blended like the panel lighting presets.
          </p>
          <select className="input" value={overlayOwner?.id || ''}
            onChange={(e) => (e.target.value ? setSkinOverlayTarget(e.target.value) : removeSkinOverlay())}
            style={{ fontSize: 12, marginBottom: 8 }}>
            <option value="">No overlay</option>
            {sortedByZ.map((p) => (
              <option key={p.id} value={p.id}>{p.customName || p.name}</option>
            ))}
          </select>
          {overlayOwner && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={overlayOwner.skinOverlay.color}
                  onChange={(e) => updateSkinOverlay({ color: e.target.value })}
                  style={{ width: 40, height: 28, padding: 0, border: '1.5px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }} />
                <select value={overlayOwner.skinOverlay.blendMode} onChange={(e) => updateSkinOverlay({ blendMode: e.target.value })}
                  style={{ flex: 1, fontSize: 12 }}>
                  {OVERLAY_BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <SliderRow label="Opacity" value={overlayOwner.skinOverlay.opacity ?? 50} min={0} max={100}
                onChange={(v) => updateSkinOverlay({ opacity: v })} unit="%" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!overlayOwner.skinOverlayBelow}
                  onChange={(e) => setSkinOverlayBelow(e.target.checked)} />
                Also apply to layers below this one
              </label>
              <button onClick={removeSkinOverlay}
                style={{ ...s.ctrlBtn, justifyContent: 'center', color: '#9CA3AF' }}>
                Remove overlay
              </button>
            </div>
          )}
        </div>

        {/* Layers */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={s.sectionTitle}>Layers ({canvasParts.length})</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {selectedIds.size >= 2 && (
                <button onClick={groupSelected}
                  style={{ fontSize: 10, fontWeight: 700, color: '#6D28D9', background: '#F5F3FF',
                    border: '1px solid #DDD6FE', borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>
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
          </div>

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
                      background: isSel ? '#FEF3E2' : isMulti ? '#F5F3FF' : 'transparent',
                      border: `1.5px solid ${isSel ? ORANGE : isMulti ? '#818CF8' : 'transparent'}`,
                    }}>
                    {gc && <div style={{ width: 4, height: '100%', minHeight: 26, borderRadius: 2, background: gc, flexShrink: 0 }} />}
                    <img src={part.filePath} alt=""
                      style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, borderRadius: 3, background: '#f3f4f6' }} />
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
                    {/* Up / Down */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(part.id, -1); }}
                        style={{ ...s.arrowBtn }} title="Move up" disabled={sortIdx === 0}>▲</button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(part.id, 1); }}
                        style={{ ...s.arrowBtn }} title="Move down" disabled={sortIdx === sortedByZ.length - 1}>▼</button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removePart(part.id); }}
                      style={{ ...s.arrowBtn, color: '#EF4444', flexShrink: 0 }} title="Remove">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
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
        style={{ width: '100%', accentColor: ORANGE, display: 'block' }} />
    </div>
  );
}

const s = {
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 },
  hint:         { fontSize: 12, color: '#9CA3AF' },
  assetThumb:   { border: '1.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#F9FAFB', cursor: 'pointer', padding: 0, transition: 'border-color 0.15s', display: 'block', textAlign: 'left' },
  thumbLabel:   { fontSize: 9, textAlign: 'center', padding: '2px 3px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 },
  fileLabel:    { display: 'block', padding: '8px 10px', border: '1.5px dashed #E5E7EB', borderRadius: 8, fontSize: 11, color: '#6B7280', cursor: 'pointer', textAlign: 'center' },
  iconBtn:      { width: 30, height: 30, borderRadius: 7, border: '1.5px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ctrlBtn:      { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', border: '1.5px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151' },
  arrowBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#9CA3AF', padding: '1px 2px', lineHeight: 1 },
  tbDivider:    { width: 1, height: 20, background: '#E5E7EB', flexShrink: 0 },
  chip:         { fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '2px 8px', cursor: 'pointer' },
  chipActive:   { background: '#FFF7ED', borderColor: ORANGE, color: ORANGE },
};
