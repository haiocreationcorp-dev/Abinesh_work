import { useEffect, useMemo, useRef, useState } from 'react';
import { getAssets, replaceAssetFile } from '../../api/assets.js';
import { paintStroke, removeNearWhiteBackground, floodFillColorMask, applyColorMaskAlpha } from '../../utils/paletteNormalizer.js';
import { previewEyeMasks, applyEyeMasks, pickDetection } from '../../utils/eyeNormalizer.js';
import { EYEBROW_REF_COLOR, IRIS_REF_COLOR, applyExactColorSwaps } from '../../utils/recolorImage.js';
import { VIEWS, GENDERS } from '../../constants/categories.js';
import {
  Search, ArrowUpDown, MousePointer2, Hand, Paintbrush, Eraser, Pipette, Crosshair,
  ZoomIn, ZoomOut, Maximize, RotateCcw, Undo2, Redo2, Save, RefreshCw, Download,
  Eye, EyeOff, Lock, Unlock, Trash2, Grid3x3, ChevronDown, ChevronUp,
} from 'lucide-react';

const LAYERS = [
  { id: 'eyebrow', label: 'Eyebrow', color: EYEBROW_REF_COLOR },
  { id: 'iris', label: 'Iris', color: IRIS_REF_COLOR },
];
const BG_PICK_TOLERANCE = 30;
const HISTORY_LIMIT = 40;
const RECENTS_KEY = 'bc_eye_normalizer_recents';
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; } catch { return []; }
}

function isTypingTarget(el) {
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable;
}

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={s.section}>
      <button type="button" style={s.sectionHead} onClick={() => setOpen((o) => !o)}>
        <span style={s.sectionTitle}>{title}</span>
        {open ? <ChevronUp size={14} color="var(--mid)" /> : <ChevronDown size={14} color="var(--mid)" />}
      </button>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  );
}

// Admin-only authoring tool for EYE FACE_PART assets — paint the eyebrow and iris as two
// independent regions (own Int8Array override map each, reusing paletteNormalizer.js's
// generic brush primitives), preview each in its own color (or both together), then
// flatten both to their fixed reference colors in one save so the Comic UI's
// recolorEyeAsset() exact-match swap can recolor eyebrow → hair color and iris → eye
// color independently at runtime.
export default function EyeNormalizer() {
  const originalCanvasRef = useRef(null);
  const resultCanvasRef = useRef(null);
  const livePreviewCanvasRef = useRef(null);
  const originalImageDataRef = useRef(null);
  const eyebrowOverrideRef = useRef(null);
  const irisOverrideRef = useRef(null);
  const paintingRef = useRef(false);
  const lastPaintPointRef = useRef(null);
  const bgPickOverlayCanvasRef = useRef(null);
  const viewportRef = useRef(null);
  const panDragRef = useRef(null);
  const naturalSizeRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });

  const [loaded, setLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [activeLayer, setActiveLayer] = useState('eyebrow');
  const [tool, setTool] = useState('pick'); // 'none' | 'pan' | 'brush' | 'erase' | 'pick' | 'bg-pick'
  const [brushSize, setBrushSize] = useState(8);
  const [brushCursor, setBrushCursor] = useState(null); // { x, y, diameter } in viewport CSS px
  const [overrideTick, setOverrideTick] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);
  const [bgPickPending, setBgPickPending] = useState(null); // { mask, count } | null
  const [eyebrowDetection, setEyebrowDetection] = useState(null);
  const [irisDetection, setIrisDetection] = useState(null);

  // Independent per-layer visibility/lock — replaces the old 3-way previewMode selector.
  const [eyebrowVisible, setEyebrowVisible] = useState(true);
  const [irisVisible, setIrisVisible] = useState(true);
  const [eyebrowLocked, setEyebrowLocked] = useState(false);
  const [irisLocked, setIrisLocked] = useState(false);

  const [libraryAssets, setLibraryAssets] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [viewFilter, setViewFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'updated'
  const [recentIds, setRecentIds] = useState(loadRecents);

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');

  // Zoom & pan — the canvas stack renders at native pixel size inside a transformed
  // wrapper; screenToImagePixel() below inverts this transform for painting.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [naturalSize, setNaturalSize] = useState(null);
  const [cursorImagePos, setCursorImagePos] = useState(null);

  const [gridOn, setGridOn] = useState(false);
  const [guidesOn, setGuidesOn] = useState(false);

  const [livePreviewMode, setLivePreviewMode] = useState('mask'); // 'original' | 'mask' | 'runtime'
  const [runtimeHairColor, setRuntimeHairColor] = useState('#3b2412');
  const [runtimeIrisColor, setRuntimeIrisColor] = useState('#3b2a1f');

  const isPanMode = tool === 'pan' || spaceHeld;

  useEffect(() => {
    setLibraryLoading(true);
    getAssets({ category: 'FACE_PART', partType: 'EYES' }).then(setLibraryAssets).finally(() => setLibraryLoading(false));
  }, []);

  const selectedAsset = libraryAssets.find((a) => a.id === selectedAssetId) || null;

  const visibleAssets = useMemo(() => {
    let list = libraryAssets;
    if (viewFilter) list = list.filter((a) => a.view === viewFilter);
    if (genderFilter) list = list.filter((a) => a.gender === genderFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (
      sortBy === 'updated' ? new Date(b.updatedAt) - new Date(a.updatedAt) : a.name.localeCompare(b.name)
    ));
  }, [libraryAssets, viewFilter, genderFilter, search, sortBy]);

  const recentAssets = recentIds.map((id) => libraryAssets.find((a) => a.id === id)).filter(Boolean);

  // Redraw the live mask-preview canvas whenever the source, override paints, layer
  // visibility, or detection windows change.
  useEffect(() => {
    if (!loaded || !originalImageDataRef.current) return;
    const canvas = originalCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(originalImageDataRef.current.width, originalImageDataRef.current.height);
    previewEyeMasks(
      originalImageDataRef.current.data, out.data, eyebrowOverrideRef.current, irisOverrideRef.current,
      eyebrowDetection, irisDetection, { showEyebrow: eyebrowVisible, showIris: irisVisible },
    );
    ctx.putImageData(out, 0, 0);
  }, [loaded, eyebrowVisible, irisVisible, overrideTick, eyebrowDetection, irisDetection]);

  // Redraw the "Result" canvas — what actually gets saved — whenever paints change.
  useEffect(() => {
    if (!loaded || !originalImageDataRef.current) return;
    const canvas = resultCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(originalImageDataRef.current.width, originalImageDataRef.current.height);
    applyEyeMasks(originalImageDataRef.current.data, out.data, eyebrowOverrideRef.current, irisOverrideRef.current, eyebrowDetection, irisDetection);
    ctx.putImageData(out, 0, 0);
  }, [loaded, overrideTick, eyebrowDetection, irisDetection]);

  // Draws the red highlight overlay for a pending "Pick BG Color" selection.
  useEffect(() => {
    const canvas = bgPickOverlayCanvasRef.current;
    if (!canvas || !originalImageDataRef.current) return;
    const { width, height } = originalImageDataRef.current;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (!bgPickPending) return;
    const out = ctx.createImageData(width, height);
    const { mask } = bgPickPending;
    for (let p = 0; p < mask.length; p++) {
      if (mask[p]) { out.data[p * 4] = 239; out.data[p * 4 + 1] = 68; out.data[p * 4 + 2] = 68; out.data[p * 4 + 3] = 170; }
    }
    ctx.putImageData(out, 0, 0);
  }, [bgPickPending]);

  // Live Preview panel (Inspector) — Original / Mask View / Runtime Preview. Runtime uses
  // the exact same exact-match swap primitive (applyExactColorSwaps) the real comic runtime
  // uses via recolorEyeAsset(), just run directly on the Result canvas's pixels instead of
  // round-tripping through a file — a genuine simulation, not a mockup.
  useEffect(() => {
    if (!loaded || !livePreviewCanvasRef.current || !originalImageDataRef.current) return;
    const canvas = livePreviewCanvasRef.current;
    const { width, height } = originalImageDataRef.current;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (livePreviewMode === 'original') {
      ctx.putImageData(originalImageDataRef.current, 0, 0);
    } else if (livePreviewMode === 'mask') {
      ctx.drawImage(resultCanvasRef.current, 0, 0);
    } else {
      const resultCtx = resultCanvasRef.current.getContext('2d');
      const resultData = resultCtx.getImageData(0, 0, width, height);
      const recolored = applyExactColorSwaps(resultData, [
        { old: EYEBROW_REF_COLOR, new: runtimeHairColor },
        { old: IRIS_REF_COLOR, new: runtimeIrisColor },
      ]);
      ctx.putImageData(recolored, 0, 0);
    }
  }, [loaded, livePreviewMode, overrideTick, eyebrowDetection, irisDetection, runtimeHairColor, runtimeIrisColor]);

  // ── History (undo/redo) ──────────────────────────────────────────────────────────
  const snapshotNow = () => ({
    eyebrow: Int8Array.from(eyebrowOverrideRef.current),
    iris: Int8Array.from(irisOverrideRef.current),
    imageData: Uint8ClampedArray.from(originalImageDataRef.current.data),
    eyebrowDetection, irisDetection,
  });

  const pushHistory = () => {
    if (!originalImageDataRef.current) return;
    const h = historyRef.current;
    h.past.push(snapshotNow());
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setHistoryTick((t) => t + 1);
    setDirty(true);
  };

  const restoreSnapshot = (snap) => {
    eyebrowOverrideRef.current.set(snap.eyebrow);
    irisOverrideRef.current.set(snap.iris);
    originalImageDataRef.current.data.set(snap.imageData);
    setEyebrowDetection(snap.eyebrowDetection);
    setIrisDetection(snap.irisDetection);
    setOverrideTick((t) => t + 1);
    setDirty(true);
  };

  const undo = () => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const current = snapshotNow();
    h.future.push(current);
    restoreSnapshot(h.past.pop());
    setHistoryTick((t) => t + 1);
  };

  const redo = () => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const current = snapshotNow();
    h.past.push(current);
    restoreSnapshot(h.future.pop());
    setHistoryTick((t) => t + 1);
  };

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // ── Recently opened (browser-local, no schema change) ───────────────────────────
  const pushRecent = (id) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 6);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  // ── Zoom & pan ────────────────────────────────────────────────────────────────
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  const centeredPan = (z, natW, natH) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const vw = rect?.width || natW;
    const vh = rect?.height || natH;
    return { x: (vw - natW * z) / 2, y: (vh - natH * z) / 2 };
  };

  const fitView = (natW, natH) => {
    const w = natW || naturalSizeRef.current?.w;
    const h = natH || naturalSizeRef.current?.h;
    if (!w || !h || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const z = clampZoom(Math.min(rect.width / w, rect.height / h));
    setZoom(z);
    setPan(centeredPan(z, w, h));
  };

  const resetView = () => {
    const { w, h } = naturalSizeRef.current || {};
    if (!w || !h) return;
    setZoom(1);
    setPan(centeredPan(1, w, h));
  };

  const zoomBy = (factor) => {
    setZoom((z) => {
      const nz = clampZoom(z * factor);
      const rect = viewportRef.current?.getBoundingClientRect();
      const cx = (rect?.width || 0) / 2;
      const cy = (rect?.height || 0) / 2;
      setPan((p) => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }));
      return nz;
    });
  };

  const handleWheel = (e) => {
    if (!loaded) return;
    e.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => {
      const nz = clampZoom(z * factor);
      setPan((p) => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }));
      return nz;
    });
  };

  const screenToImagePixel = (clientX, clientY) => {
    const rect = viewportRef.current.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - pan.x) / zoom);
    const y = Math.floor((clientY - rect.top - pan.y) / zoom);
    return { x, y };
  };

  // ── Asset loading ────────────────────────────────────────────────────────────
  const loadAsset = (asset) => {
    setSelectedAssetId(asset.id);
    setFileName(asset.name);
    setMsg('');
    setDirty(false);
    historyRef.current = { past: [], future: [] };
    setHistoryTick((t) => t + 1);
    pushRecent(asset.id);

    const img = new Image();
    img.onload = () => {
      [originalCanvasRef, resultCanvasRef].forEach((ref) => {
        ref.current.width = img.width;
        ref.current.height = img.height;
      });
      const ctx = originalCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      originalImageDataRef.current = ctx.getImageData(0, 0, img.width, img.height);
      eyebrowOverrideRef.current = new Int8Array(img.width * img.height);
      irisOverrideRef.current = new Int8Array(img.width * img.height);
      setEyebrowDetection(null);
      setIrisDetection(null);
      setBgPickPending(null);
      setOverrideTick((t) => t + 1);
      naturalSizeRef.current = { w: img.width, h: img.height };
      setNaturalSize({ w: img.width, h: img.height });
      setLoaded(true);
      requestAnimationFrame(() => fitView(img.width, img.height));
    };
    img.onerror = () => setMsg('Could not load this asset\'s image.');
    img.src = asset.filePath;
  };

  const handlePickAsset = (asset) => loadAsset(asset);
  const handleResetAsset = () => { if (selectedAsset) loadAsset(selectedAsset); };

  const isActiveLayerLocked = () => (activeLayer === 'eyebrow' ? eyebrowLocked : irisLocked);
  const activeOverride = () => (activeLayer === 'eyebrow' ? eyebrowOverrideRef.current : irisOverrideRef.current);

  const doPaintStroke = (x0, y0, x1, y1) => {
    const overrides = activeOverride();
    if (!overrides || !originalImageDataRef.current) return;
    const { width, height, data } = originalImageDataRef.current;
    const value = tool === 'erase' ? -1 : 1;
    paintStroke(overrides, data, width, height, x0, y0, x1, y1, brushSize, value);
  };

  const doPick = (x, y) => {
    if (!originalImageDataRef.current) return;
    const { width, height, data } = originalImageDataRef.current;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    if (data[i + 3] === 0) {
      setMsg('Clicked a transparent pixel — pick a visible part of the eyebrow/iris.');
      return;
    }
    setMsg('');
    if (activeLayer === 'eyebrow') setEyebrowDetection((prev) => pickDetection(prev, data[i], data[i + 1], data[i + 2]));
    else setIrisDetection((prev) => pickDetection(prev, data[i], data[i + 1], data[i + 2]));
  };

  const doBgPick = (x, y) => {
    if (!originalImageDataRef.current) return;
    const { width, height, data } = originalImageDataRef.current;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    if (data[i + 3] === 0) {
      setBgPickPending(null);
      setMsg('That spot is already transparent — there\'s no background pixel there to pick.');
      return;
    }
    const mask = floodFillColorMask(data, width, height, x, y, BG_PICK_TOLERANCE);
    let count = 0;
    for (let p = 0; p < mask.length; p++) if (mask[p]) count++;
    if (count <= 1) {
      setBgPickPending(null);
      setMsg('No connected pixels of a similar color around that spot — try a different click point.');
      return;
    }
    setMsg('');
    setBgPickPending({ mask, count });
  };

  const confirmBgPick = () => {
    if (!bgPickPending || !originalImageDataRef.current) return;
    pushHistory();
    const erased = applyColorMaskAlpha(originalImageDataRef.current.data, bgPickPending.mask);
    setBgPickPending(null);
    setTool('none');
    setOverrideTick((t) => t + 1);
    setMsg(`Erased ${erased} background pixels.`);
  };

  const cancelBgPick = () => setBgPickPending(null);

  const updateBrushCursor = (e) => {
    if (tool !== 'brush' && tool !== 'erase') { setBrushCursor(null); return; }
    const rect = viewportRef.current.getBoundingClientRect();
    setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, diameter: brushSize * 2 * zoom });
  };

  const handleMouseDown = (e) => {
    if (!loaded) return;
    if (isPanMode) {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPan: pan };
      return;
    }
    if (tool === 'none') return;
    const { x, y } = screenToImagePixel(e.clientX, e.clientY);
    if (tool === 'pick') {
      if (isActiveLayerLocked()) { setMsg(`${activeLayer === 'eyebrow' ? 'Eyebrow' : 'Iris'} layer is locked.`); return; }
      pushHistory();
      doPick(x, y);
      return;
    }
    if (tool === 'bg-pick') { doBgPick(x, y); return; }
    if (isActiveLayerLocked()) { setMsg(`${activeLayer === 'eyebrow' ? 'Eyebrow' : 'Iris'} layer is locked.`); return; }
    pushHistory();
    paintingRef.current = true;
    lastPaintPointRef.current = { x, y };
    doPaintStroke(x, y, x, y);
    setOverrideTick((t) => t + 1);
  };

  const handleMouseMove = (e) => {
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPan({ x: panDragRef.current.startPan.x + dx, y: panDragRef.current.startPan.y + dy });
      return;
    }
    updateBrushCursor(e);
    if (loaded) {
      const { x, y } = screenToImagePixel(e.clientX, e.clientY);
      setCursorImagePos({ x, y });
    }
    if (!paintingRef.current) return;
    const { x, y } = screenToImagePixel(e.clientX, e.clientY);
    const last = lastPaintPointRef.current || { x, y };
    doPaintStroke(last.x, last.y, x, y);
    lastPaintPointRef.current = { x, y };
    setOverrideTick((t) => t + 1);
  };

  const stopPainting = () => { paintingRef.current = false; lastPaintPointRef.current = null; };
  const handleMouseUp = () => { panDragRef.current = null; stopPainting(); };
  const handleMouseLeave = () => { panDragRef.current = null; stopPainting(); setBrushCursor(null); setCursorImagePos(null); };

  const clearLayer = (layer) => {
    pushHistory();
    const ref = layer === 'eyebrow' ? eyebrowOverrideRef : irisOverrideRef;
    if (ref.current) ref.current.fill(0);
    if (layer === 'eyebrow') setEyebrowDetection(null);
    else setIrisDetection(null);
    setOverrideTick((t) => t + 1);
  };

  const removeBackground = () => {
    if (!originalImageDataRef.current) return;
    pushHistory();
    const { data, width, height } = originalImageDataRef.current;
    const erased = removeNearWhiteBackground(data, width, height);
    setOverrideTick((t) => t + 1);
    setMsg(erased > 0 ? `Erased ${erased} background pixels.` : 'No edge-connected white background found.');
  };

  const exportMask = () => {
    if (!resultCanvasRef.current) return;
    resultCanvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName || 'eye-asset'}-mask.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleApply = () => {
    if (!selectedAssetId) return;
    setSaving(true);
    setMsg('');
    resultCanvasRef.current.toBlob(async (blob) => {
      try {
        const fd = new FormData();
        fd.append('file', blob, `${fileName || 'asset'}.png`);
        await replaceAssetFile(selectedAssetId, fd);
        setMsg('Eyebrow + iris masks applied — asset image updated in place.');
        setDirty(false);
        getAssets({ category: 'FACE_PART', partType: 'EYES' }).then(setLibraryAssets);
      } catch (err) {
        setMsg(err.response?.data?.error || 'Save failed');
      } finally {
        setSaving(false);
      }
    }, 'image/png');
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && !spaceHeld) { setSpaceHeld(true); e.preventDefault(); return; }
      if (!loaded) return;
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (e.key === 'b' || e.key === 'B') setTool('brush');
      else if (e.key === 'e' || e.key === 'E') setTool('erase');
      else if (e.key === 'f' || e.key === 'F') fitView();
      else if (e.key === 'Delete' || e.key === 'Backspace') clearLayer(activeLayer);
    };
    const onKeyUp = (e) => { if (e.code === 'Space') { setSpaceHeld(false); e.preventDefault(); } };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, spaceHeld, activeLayer, pan, zoom]);

  const statusDisplay = saving
    ? { text: 'Saving…', color: 'var(--mid)' }
    : dirty
      ? { text: 'Unsaved changes', color: 'var(--warning)' }
      : { text: 'Saved', color: 'var(--mid)' };

  const canvasCursor = !loaded ? 'default' : isPanMode ? (panDragRef.current ? 'grabbing' : 'grab') : tool === 'none' ? 'default' : 'crosshair';

  const TOOLS = [
    { id: 'none', label: 'Pointer', icon: MousePointer2 },
    { id: 'pan', label: 'Pan', icon: Hand },
    { id: 'brush', label: 'Brush', icon: Paintbrush },
    { id: 'erase', label: 'Erase', icon: Eraser },
    { id: 'pick', label: 'Pick Color', icon: Pipette },
    { id: 'bg-pick', label: 'Pick BG', icon: Crosshair },
  ];

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>Eye Alignment Tool</h2>
          <p className="text-sm text-muted">Create eyebrow, iris and skin normalization masks for eye assets.</p>
        </div>
        <div style={s.headerActions}>
          <span style={{ ...s.statusText, color: statusDisplay.color }}>{statusDisplay.text}</span>
          <button type="button" style={s.iconBtn} title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={14} /></button>
          <button type="button" style={s.iconBtn} title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}><Redo2 size={14} /></button>
          <button type="button" className="btn btn-outline btn-sm" disabled={!loaded} onClick={handleResetAsset}>
            <RefreshCw size={14} /> Reset
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={!loaded} onClick={exportMask}>
            <Download size={14} /> Export Mask
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!loaded || saving} onClick={handleApply}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={s.columns}>
        {/* ── LEFT: Eye Library ── */}
        <div style={s.leftCol}>
          <div className="card" style={s.libraryCard}>
            <p style={s.heading}>Eye Library ({libraryAssets.length})</p>
            <div style={s.searchWrap}>
              <Search size={13} color="var(--mid)" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search eye assets…" style={s.searchInput} />
            </div>
            <div style={s.filterRow}>
              <button className={`btn btn-sm ${viewFilter === '' ? 'btn-nav-active' : 'btn-outline'}`} onClick={() => setViewFilter('')}>All</button>
              {VIEWS.map((v) => (
                <button key={v.id} className={`btn btn-sm ${viewFilter === v.id ? 'btn-nav-active' : 'btn-outline'}`} onClick={() => setViewFilter(v.id)}>{v.label}</button>
              ))}
            </div>
            <div style={s.filterRow}>
              <select className="asset-form-input" style={s.filterSelect} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
                <option value="">All genders</option>
                {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-outline" style={{ whiteSpace: 'nowrap' }}
                onClick={() => setSortBy((v) => (v === 'name' ? 'updated' : 'name'))}>
                <ArrowUpDown size={13} /> {sortBy === 'name' ? 'Name' : 'Recent'}
              </button>
            </div>

            {recentAssets.length > 0 && (
              <>
                <p style={s.subheading}>Recently Opened</p>
                <div style={s.recentRow}>
                  {recentAssets.map((a) => (
                    <button key={a.id} title={a.name} onClick={() => handlePickAsset(a)} style={s.recentThumb}>
                      <img src={a.filePath} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                    </button>
                  ))}
                </div>
              </>
            )}

            <p style={s.subheading}>Eye Assets</p>
            <div style={s.grid}>
              {libraryLoading ? (
                <p style={s.hint}>Loading…</p>
              ) : visibleAssets.length === 0 ? (
                <p style={s.hint}>No eye assets found.</p>
              ) : (
                visibleAssets.map((a) => (
                  <button key={a.id} title={a.name} onClick={() => handlePickAsset(a)}
                    style={{ ...s.thumb, ...(selectedAssetId === a.id ? s.thumbActive : {}) }}>
                    <img src={a.filePath} alt={a.name} style={{ width: 56, height: 56, objectFit: 'contain', display: 'block' }} />
                    <p style={s.thumbLabel}>{a.name}</p>
                    <p style={s.thumbSub}>{a.view === 'THREE_QUARTER' ? '3/4' : a.view || '—'}{a.gender ? ` · ${a.gender}` : ''}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER: Annotation Canvas ── */}
        <div style={s.centerCol}>
          <div className="card" style={s.toolbarCard}>
            {TOOLS.map((t) => {
              const Icon = t.icon;
              const active = t.id === 'pan' ? tool === 'pan' : tool === t.id;
              return (
                <button key={t.id} type="button" title={t.label} disabled={!loaded}
                  style={{ ...s.iconBtn, ...(active ? s.iconBtnActive : {}) }}
                  onClick={() => setTool((cur) => (cur === t.id ? 'none' : t.id))}>
                  <Icon size={14} />
                </button>
              );
            })}
            <div style={s.tbDivider} />
            <button type="button" style={s.iconBtn} title="Zoom out" disabled={!loaded} onClick={() => zoomBy(1 / 1.25)}><ZoomOut size={14} /></button>
            <span style={s.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button type="button" style={s.iconBtn} title="Zoom in" disabled={!loaded} onClick={() => zoomBy(1.25)}><ZoomIn size={14} /></button>
            <button type="button" style={s.iconBtn} title="Fit (F)" disabled={!loaded} onClick={() => fitView()}><Maximize size={14} /></button>
            <button type="button" style={s.iconBtn} title="Reset View" disabled={!loaded} onClick={resetView}><RotateCcw size={14} /></button>
            <div style={s.tbDivider} />
            <button type="button" style={{ ...s.iconBtn, ...(gridOn ? s.iconBtnActive : {}) }} title="Toggle grid" disabled={!loaded} onClick={() => setGridOn((v) => !v)}><Grid3x3 size={14} /></button>
            <button type="button" style={{ ...s.iconBtn, ...(guidesOn ? s.iconBtnActive : {}) }} title="Toggle guides" disabled={!loaded} onClick={() => setGuidesOn((v) => !v)}><Crosshair size={14} /></button>
          </div>

          <div
            ref={viewportRef}
            className="checkered-bg"
            style={{ ...s.viewport, cursor: canvasCursor }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            {/* Canvas stack always mounted (never conditionally rendered) — loadAsset()'s
                img.onload writes to these refs before setLoaded(true) fires, so they must
                already exist in the DOM on the very first asset pick. Visibility is handled
                by the "pick an asset" overlay below, not by mounting/unmounting the canvases. */}
            <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              <div style={{ position: 'relative', width: naturalSize?.w || 0, height: naturalSize?.h || 0 }}>
                <canvas ref={originalCanvasRef} style={s.stackedCanvas} />
                <canvas ref={bgPickOverlayCanvasRef} style={s.stackedCanvas} />
                {/* Off-screen — holds the flattened "what actually gets saved" output.
                    Never displayed directly; Live Preview's Mask/Runtime tabs draw from it. */}
                <canvas ref={resultCanvasRef} style={s.offscreenCanvas} />
                {loaded && gridOn && <div style={s.gridOverlay} />}
                {loaded && guidesOn && (
                  <div style={s.stackedCanvas}>
                    <div style={{ ...s.guideLine, left: '50%', top: 0, bottom: 0, width: 1 }} />
                    <div style={{ ...s.guideLine, top: '50%', left: 0, right: 0, height: 1 }} />
                    <div style={{ ...s.guideLineDashed, left: '33.33%', top: 0, bottom: 0, width: 1 }} />
                    <div style={{ ...s.guideLineDashed, left: '66.66%', top: 0, bottom: 0, width: 1 }} />
                  </div>
                )}
              </div>
            </div>
            {!loaded && <p style={{ ...s.hint, margin: 'auto', position: 'relative' }}>Pick an eye asset from the library to begin.</p>}
            {brushCursor && (tool === 'brush' || tool === 'erase') && (
              <div style={{
                position: 'absolute', pointerEvents: 'none', borderRadius: '50%', border: '2px solid', boxSizing: 'border-box',
                left: brushCursor.x - brushCursor.diameter / 2, top: brushCursor.y - brushCursor.diameter / 2,
                width: brushCursor.diameter, height: brushCursor.diameter,
                borderColor: tool === 'erase' ? '#f87171' : '#4ade80',
                background: tool === 'erase' ? '#f8717126' : '#4ade8026',
              }} />
            )}
          </div>

          {bgPickPending && (
            <div style={s.bgPickConfirm}>
              <span>Found {bgPickPending.count.toLocaleString()} background-colored pixels (highlighted in red). Delete them?</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-primary" onClick={confirmBgPick}>Yes, delete</button>
                <button className="btn btn-sm btn-outline" onClick={cancelBgPick}>No, cancel</button>
              </div>
            </div>
          )}
          {msg && <p style={s.hint}>{msg}</p>}

          {/* ── Bottom status bar ── */}
          <div style={s.statusBar}>
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            <span>Canvas: {naturalSize ? `${naturalSize.w}×${naturalSize.h}px` : '—'}</span>
            <span>Cursor: {cursorImagePos ? `${cursorImagePos.x}, ${cursorImagePos.y}` : '—'}</span>
            <span>Layer: {activeLayer === 'eyebrow' ? 'Eyebrow' : 'Iris'}</span>
            <span style={s.statusShortcuts}>Ctrl+Z Undo · Ctrl+Y Redo · B Brush · E Erase · Space Pan · F Fit · Del Clear</span>
          </div>
        </div>

        {/* ── RIGHT: Inspector ── */}
        <div style={s.rightCol}>
          <div className="card" style={s.inspectorCard}>
            <p style={s.heading}>Inspector</p>

            <Section title="Selected Asset">
              {!selectedAsset ? <p style={s.hint}>No asset loaded.</p> : (
                <div style={s.summaryList}>
                  <SummaryRow label="Name" value={selectedAsset.name} />
                  <SummaryRow label="View" value={selectedAsset.view === 'THREE_QUARTER' ? '3/4' : selectedAsset.view || '—'} />
                  <SummaryRow label="Resolution" value={naturalSize ? `${naturalSize.w}×${naturalSize.h}px` : '—'} />
                  <SummaryRow label="Created" value={selectedAsset.createdAt ? new Date(selectedAsset.createdAt).toLocaleDateString() : '—'} />
                  <SummaryRow label="Modified" value={selectedAsset.updatedAt ? new Date(selectedAsset.updatedAt).toLocaleDateString() : '—'} />
                </div>
              )}
            </Section>

            <Section title="Annotation Layers">
              {LAYERS.map((l) => {
                const visible = l.id === 'eyebrow' ? eyebrowVisible : irisVisible;
                const locked = l.id === 'eyebrow' ? eyebrowLocked : irisLocked;
                const setVisible = l.id === 'eyebrow' ? setEyebrowVisible : setIrisVisible;
                const setLocked = l.id === 'eyebrow' ? setEyebrowLocked : setIrisLocked;
                return (
                  <div key={l.id} style={{ ...s.layerRow, ...(activeLayer === l.id ? s.layerRowActive : {}) }}>
                    <button type="button" style={s.layerNameBtn} onClick={() => setActiveLayer(l.id)}>
                      <span style={{ ...s.dot, background: l.color }} /> {l.label}
                    </button>
                    <button type="button" style={s.iconBtn} title={visible ? 'Hide layer' : 'Show layer'} onClick={() => setVisible((v) => !v)}>
                      {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button type="button" style={s.iconBtn} title={locked ? 'Unlock layer' : 'Lock layer'} onClick={() => setLocked((v) => !v)}>
                      {locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    <button type="button" style={{ ...s.iconBtn, color: '#DC2626' }} title="Clear layer" disabled={!loaded} onClick={() => clearLayer(l.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </Section>

            <Section title="Brush Settings">
              <label style={s.sliderLabel}>
                Brush Size ({brushSize}px)
                <input type="range" min={2} max={40} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
              <div style={s.colorPreviewRow}>
                <span style={{ ...s.summarySwatch, background: LAYERS.find((l) => l.id === activeLayer)?.color }} />
                <span style={s.hint}>{activeLayer === 'eyebrow' ? 'Eyebrow' : 'Iris'} reference color — fixed, matches the runtime recolor swap exactly.</span>
              </div>
              <p style={s.hintSmall}>Opacity/hardness aren't available — masks are flattened to exact colors for runtime recoloring; a soft edge would break that.</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm btn-outline" disabled={!loaded} onClick={removeBackground}>Remove BG</button>
              </div>
            </Section>

            <Section title="Live Preview">
              <div style={s.filterRow}>
                {['original', 'mask', 'runtime'].map((m) => (
                  <button key={m} className={`btn btn-sm ${livePreviewMode === m ? 'btn-edit-active' : 'btn-outline'}`}
                    onClick={() => setLivePreviewMode(m)} style={{ textTransform: 'capitalize' }}>
                    {m === 'mask' ? 'Mask View' : m === 'runtime' ? 'Runtime' : 'Original'}
                  </button>
                ))}
              </div>
              <div style={s.livePreviewBox}>
                {loaded ? <canvas ref={livePreviewCanvasRef} style={s.livePreviewCanvas} /> : <p style={s.hint}>No asset loaded.</p>}
              </div>
              {livePreviewMode === 'runtime' && (
                <div style={s.formGrid2}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Hair Color</label>
                    <input type="color" value={runtimeHairColor} onChange={(e) => setRuntimeHairColor(e.target.value)} style={s.colorInput} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Iris Color</label>
                    <input type="color" value={runtimeIrisColor} onChange={(e) => setRuntimeIrisColor(e.target.value)} style={s.colorInput} />
                  </div>
                </div>
              )}
            </Section>

            <Section title="History" defaultOpen={false}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button type="button" className="btn btn-sm btn-outline" disabled={!canUndo} onClick={undo}><Undo2 size={13} /> Undo</button>
                <button type="button" className="btn btn-sm btn-outline" disabled={!canRedo} onClick={redo}><Redo2 size={13} /> Redo</button>
              </div>
              <p style={s.hintSmall}>{historyRef.current.past.length} step{historyRef.current.past.length === 1 ? '' : 's'} back, {historyRef.current.future.length} forward.</p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={s.summaryRow}>
      <span style={s.summaryLabel}>{label}</span>
      <span style={s.summaryValue}>{value}</span>
    </div>
  );
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: '0 0 2px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', marginRight: 4 },

  columns: { display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' },
  leftCol: { flex: '1 1 260px', maxWidth: 300, minWidth: 240 },
  centerCol: { flex: '2 1 460px', minWidth: 340, display: 'flex', flexDirection: 'column', gap: 8 },
  rightCol: { flex: '1 1 280px', maxWidth: 320, minWidth: 260 },

  libraryCard: { padding: 14, position: 'sticky', top: 20, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' },
  inspectorCard: { padding: 14, position: 'sticky', top: 20, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' },
  heading: { fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 10px' },
  subheading: { fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 6px' },
  hint: { fontSize: 12, color: 'var(--mid)', margin: 0 },
  hintSmall: { fontSize: 11, color: 'var(--mid)', margin: '4px 0 0', lineHeight: 1.5 },

  searchWrap: { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', background: '#fff', marginBottom: 8 },
  searchInput: { border: 'none', outline: 'none', fontSize: 12.5, padding: '7px 0', width: '100%', background: 'transparent' },
  filterRow: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterSelect: { flex: 1, minWidth: 0, fontSize: 12 },

  recentRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  recentThumb: { width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 },
  thumb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' },
  thumbActive: { borderColor: 'var(--nav-primary)', background: 'var(--nav-light)' },
  thumbLabel: { fontSize: 10, color: 'var(--dark)', fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', margin: 0 },
  thumbSub: { fontSize: 9, color: 'var(--mid)', textAlign: 'center', margin: 0, textTransform: 'capitalize' },

  toolbarCard: { padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  tbDivider: { width: 1, height: 20, background: 'var(--border)', margin: '0 4px' },
  zoomLabel: { fontSize: 11, fontWeight: 700, color: 'var(--dark)', minWidth: 38, textAlign: 'center' },

  iconBtn: {
    width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: '#fff',
    color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBtnActive: { borderColor: 'var(--edit-primary)', background: 'var(--primary-light)', color: 'var(--edit-primary)' },

  viewport: {
    position: 'relative', flex: 1, minHeight: 420, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    overflow: 'hidden', display: 'flex', background: 'var(--light)',
  },
  stackedCanvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' },
  offscreenCanvas: { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },
  gridOverlay: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.18) 1px, transparent 1px)',
    backgroundSize: '20px 20px',
  },
  guideLine: { position: 'absolute', background: 'rgba(37,99,235,0.5)' },
  guideLineDashed: { position: 'absolute', background: 'repeating-linear-gradient(to bottom, rgba(37,99,235,0.35) 0 4px, transparent 4px 8px)' },

  statusBar: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--mid)', padding: '6px 4px' },
  statusShortcuts: { marginLeft: 'auto', color: 'var(--mid)' },

  bgPickConfirm: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    fontSize: 12, background: 'var(--primary-light)', border: '1px solid #c0392b',
    padding: '8px 12px', borderRadius: 6,
  },

  section: { borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: 'var(--dark)' },
  sectionBody: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 },

  summaryList: { display: 'flex', flexDirection: 'column' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 },
  summaryLabel: { color: 'var(--mid)' },
  summaryValue: { color: 'var(--dark)', fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' },
  summarySwatch: { width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border)', flexShrink: 0, display: 'inline-block' },

  layerRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' },
  layerRowActive: { borderColor: 'var(--nav-primary)', background: 'var(--nav-light)' },
  layerNameBtn: { flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--dark)', padding: 0, textAlign: 'left' },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },

  sliderLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mid)' },
  colorPreviewRow: { display: 'flex', alignItems: 'center', gap: 8 },

  formGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 },
  colorInput: { width: '100%', height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' },

  livePreviewBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: 'var(--light)', borderRadius: 'var(--radius-sm)', padding: 8 },
  livePreviewCanvas: { maxWidth: '100%', maxHeight: 160, display: 'block' },
};
