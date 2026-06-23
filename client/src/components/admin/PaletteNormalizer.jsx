import { useEffect, useRef, useState } from 'react';
import { uploadAsset, getAssets, saveAssetSkinMask, replaceAssetFile } from '../../api/assets.js';
import { CATEGORY_IDS } from '../../constants/categories.js';
import {
  rgbToHsv, normalize, previewMask, countUniqueSkinShades, recolorNormalized,
  thresholdsFromSample, mergeThresholds, hexToRgb, STANDARD_PALETTE, RECOLOR_PRESETS, paintStroke,
  removeNearWhiteBackground, paintAlphaStroke,
  DEFAULT_DETECTION, DEFAULT_HIGH_CUT, DEFAULT_LOW_CUT,
} from '../../utils/paletteNormalizer.js';

// V-cutoff high enough that no detected pixel can ever cross it — effectively disables
// the highlight bucket. Used once the admin starts picking Base/Shadow samples directly,
// since two real samples are more accurate than a 3rd brightness-guess band.
const HIGHLIGHT_DISABLED_CUT = 101;

const PALETTE_HINT_DEFAULT = "What detected skin pixels get normalized to. Defaults to the spec's peach tones — override for non-human skin (e.g. Hulk green).";
const PALETTE_HINT_SKIP = 'Set these to the exact 3 colors already present in your uploaded image, so the runtime swap below can find and replace them.';

// Cursor-ring color per paint tool — green/red for the skin mask brush/eraser,
// orange/cyan for the background erase/restore brush, so they're visually distinct.
const TOOL_COLORS = {
  brush: '#4ade80',
  erase: '#f87171',
  'bg-erase': '#fb923c',
  'bg-restore': '#38bdf8',
};

function hexFromRgb(rgb) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`.toUpperCase();
}

// Admin-only authoring tool — load any character image, tune HSV skin detection and
// brightness-bucket cutoffs against a live mask preview, then store the result (a
// genuinely 3-color-normalized image) as a CHARACTER/FACE_PART/DRESS_PART asset so the
// Comic UI's exact-match Skin Color swap works on it. Ported from the standalone
// C:\New_Way\palette-normalizer prototype — see paletteNormalizer.js for the pure logic.
export default function PaletteNormalizer() {
  const originalCanvasRef = useRef(null);
  const normalizedCanvasRef = useRef(null);
  const recoloredCanvasRef = useRef(null);
  const originalImageDataRef = useRef(null);
  const normalizedImageDataRef = useRef(null);
  const fileNameRef = useRef('');
  // Per-pixel manual overrides from the brush/eraser tool: 1 = force "is skin" regardless
  // of color, -1 = force "is not skin" regardless of color, 0 = fall back to HSV detection.
  // This is the only way to separate two regions that share the exact same RGB value
  // (e.g. a mustache-shadow tone reused as a uniform's fabric shade) — color thresholds
  // alone can never do it. Lives in a ref (not state) since it can be image-sized and is
  // mutated continuously while dragging; `overrideTick` below signals React to re-render.
  const maskOverrideRef = useRef(null);
  const paintingRef = useRef(false);
  const lastPaintPointRef = useRef(null);
  // Undo/redo stacks of full override-array snapshots, one entry per *stroke* (taken
  // once at mousedown, not per dab) so a single Ctrl+Z reverts a whole brush stroke.
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const MAX_HISTORY = 30;

  const [loaded, setLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [alreadyNormalized, setAlreadyNormalized] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const [canvasTool, setCanvasTool] = useState('none'); // 'none' | 'eyedropper-base' | 'eyedropper-shadow' | 'brush' | 'erase' | 'bg-erase' | 'bg-restore'
  // The two HSV samples behind the "Pick Base Sample" / "Pick Shadow Sample" eyedroppers.
  // Combined (via mergeThresholds) into `detection`, and their V values set `lowCut` —
  // sampling real pixels directly instead of guessing a single point + brightness cutoffs.
  // Black line-art ink is handled automatically (see OUTLINE_PROTECT_V_MAX in
  // paletteNormalizer.js) — no picker needed for it.
  const [baseSample, setBaseSample] = useState(null);
  const [shadowSample, setShadowSample] = useState(null);
  const [brushSize, setBrushSize] = useState(14);
  const [overrideTick, setOverrideTick] = useState(0);
  const [, setHistoryTick] = useState(0); // bump to re-render so undo/redo button disabled-state stays in sync
  // Cursor-following brush-size ring, in CSS px relative to the canvas — lets the admin
  // see exactly how big an area the brush/eraser will cover before clicking.
  const [brushCursor, setBrushCursor] = useState(null); // { x, y, diameter } | null
  const [detection, setDetection] = useState(DEFAULT_DETECTION);
  const [highCut, setHighCut] = useState(DEFAULT_HIGH_CUT);
  const [lowCut, setLowCut] = useState(DEFAULT_LOW_CUT);
  const [paletteHex, setPaletteHex] = useState({
    highlight: hexFromRgb(STANDARD_PALETTE.highlight),
    base: hexFromRgb(STANDARD_PALETTE.base),
    shadow: hexFromRgb(STANDARD_PALETTE.shadow),
  });
  const [activePresetIdx, setActivePresetIdx] = useState(0);
  const [stats, setStats] = useState('');
  const [normalizedTick, setNormalizedTick] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('CHARACTER');
  const [saveTarget, setSaveTarget] = useState('normalized'); // 'normalized' | 'recolored'
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Library asset picker — lets the admin load an EXISTING asset to tune its mask
  // against, instead of an ad-hoc file. Required for "save mask only": the mask recipe
  // has to attach to a real asset id.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState('CHARACTER');
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [maskBusy, setMaskBusy] = useState(false);
  const [maskMsg, setMaskMsg] = useState('');
  const [bgMsg, setBgMsg] = useState('');
  // Detection sliders / output palette are tucked behind this toggle — the brush/eraser
  // workflow doesn't need them visible all the time.
  const [toolsOpen, setToolsOpen] = useState(false);

  const outputPalette = {
    highlight: hexToRgb(paletteHex.highlight),
    base: hexToRgb(paletteHex.base),
    shadow: hexToRgb(paletteHex.shadow),
  };

  // Redraw the Original canvas (plain or with the magenta detection-mask overlay).
  useEffect(() => {
    if (!loaded || !originalImageDataRef.current) return;
    const canvas = originalCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (showMask) {
      const out = ctx.createImageData(originalImageDataRef.current.width, originalImageDataRef.current.height);
      previewMask(originalImageDataRef.current.data, out.data, detection, maskOverrideRef.current);
      ctx.putImageData(out, 0, 0);
    } else {
      ctx.putImageData(originalImageDataRef.current, 0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, showMask, detection, overrideTick]);

  // Recompute the Normalized canvas whenever detection/mapping/palette/mode/overrides change.
  useEffect(() => {
    if (!loaded || !originalImageDataRef.current) return;
    const raf = requestAnimationFrame(() => {
      const canvas = normalizedCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const src = originalImageDataRef.current;
      const out = ctx.createImageData(src.width, src.height);

      if (alreadyNormalized) {
        out.data.set(src.data);
        setStats('Skipped detection — using uploaded image as-is. Make sure the palette colors on the left match what\'s actually in the image.');
      } else {
        normalize(src.data, out.data, detection, highCut, lowCut, outputPalette, maskOverrideRef.current);
        const before = countUniqueSkinShades(src.data, detection, maskOverrideRef.current);
        const after = countUniqueSkinShades(out.data, detection, maskOverrideRef.current);
        setStats(`Unique skin shades before: ${before}\nUnique skin shades after: ${after}`);
      }

      ctx.putImageData(out, 0, 0);
      normalizedImageDataRef.current = out;
      setNormalizedTick((t) => t + 1);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, detection, highCut, lowCut, paletteHex, alreadyNormalized, overrideTick]);

  // Recompute the Recolored canvas whenever the normalized result or active preset changes.
  useEffect(() => {
    if (!normalizedImageDataRef.current) return;
    const preset = RECOLOR_PRESETS[activePresetIdx];
    const newPalette = {
      highlight: hexToRgb(preset.highlight),
      base: hexToRgb(preset.base),
      shadow: hexToRgb(preset.shadow),
    };
    const canvas = recoloredCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const src = normalizedImageDataRef.current;
    const out = ctx.createImageData(src.width, src.height);
    recolorNormalized(src.data, out.data, outputPalette, newPalette);
    ctx.putImageData(out, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedTick, activePresetIdx, paletteHex]);

  // Shared image-loading core — used for both ad-hoc file uploads and picking an
  // existing library asset (loaded from its filePath URL instead of a blob URL).
  const loadImageFromSrc = (src, displayName, revokeAfter) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      [originalCanvasRef, normalizedCanvasRef, recoloredCanvasRef].forEach((ref) => {
        ref.current.width = img.width;
        ref.current.height = img.height;
      });
      const oCtx = originalCanvasRef.current.getContext('2d');
      oCtx.clearRect(0, 0, img.width, img.height);
      oCtx.drawImage(img, 0, 0);
      originalImageDataRef.current = oCtx.getImageData(0, 0, img.width, img.height);
      normalizedImageDataRef.current = null;
      maskOverrideRef.current = new Int8Array(img.width * img.height);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setOverrideTick((t) => t + 1);
      setHistoryTick((t) => t + 1);
      setBaseSample(null);
      setShadowSample(null);
      fileNameRef.current = displayName;
      setFileName(displayName);
      setStats('');
      setLoaded(true);
      if (revokeAfter) URL.revokeObjectURL(img.src);
    };
    img.src = src;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedAssetId(null);
    setMaskMsg('');
    setBgMsg('');
    const name = file.name.replace(/\.[^.]+$/, '');
    setSaveName(name);
    loadImageFromSrc(URL.createObjectURL(file), file.name, true);
  };

  const loadLibraryAssets = (category) => {
    setLibraryLoading(true);
    getAssets({ category }).then(setLibraryAssets).finally(() => setLibraryLoading(false));
  };

  const handlePickAsset = (asset) => {
    setSelectedAssetId(asset.id);
    setSaveName(asset.name);
    setSaveCategory(asset.category);
    setMaskMsg('');
    setBgMsg('');
    setLibraryOpen(false);

    // Restore a previously-saved mask recipe for this asset, if any.
    const saved = asset.skinThresholds;
    if (saved && saved.detection && saved.palette) {
      setDetection(saved.detection);
      setHighCut(saved.highCut ?? DEFAULT_HIGH_CUT);
      setLowCut(saved.lowCut ?? DEFAULT_LOW_CUT);
      setPaletteHex(saved.palette);
      setAlreadyNormalized(!!saved.alreadyNormalized);
    } else {
      setDetection(DEFAULT_DETECTION);
      setHighCut(DEFAULT_HIGH_CUT);
      setLowCut(DEFAULT_LOW_CUT);
      setAlreadyNormalized(false);
    }

    loadImageFromSrc(asset.filePath, asset.name, false);
  };

  // Shared pixel-coordinate conversion for both the eyedropper and the brush/eraser.
  const canvasEventToPixel = (e) => {
    const canvas = originalCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    return { x, y, width: canvas.width, height: canvas.height };
  };

  // Recomputes detection + lowCut from whichever of the two samples are set. Picking
  // both a base and a shadow sample (instead of one generic skin sample plus a guessed
  // brightness cutoff) gives a real measured boundary between them, and disables the
  // highlight bucket entirely — the admin asked for base/shadow only, no highlight.
  const applySamples = (base, shadow) => {
    const windows = [base, shadow].filter(Boolean).map((sm) => thresholdsFromSample(sm.h, sm.s, sm.v));
    if (windows.length) setDetection(mergeThresholds(windows));
    if (base && shadow) setLowCut(Math.round((base.v + shadow.v) / 2));
    setHighCut(HIGHLIGHT_DISABLED_CUT);
  };

  const handleEyedropperClick = (e) => {
    if (canvasTool !== 'eyedropper-base' && canvasTool !== 'eyedropper-shadow') return;
    if (!originalImageDataRef.current) return;
    const { x, y, width, height } = canvasEventToPixel(e);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const { data } = originalImageDataRef.current;
    if (data[i + 3] === 0) return;
    const sample = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (canvasTool === 'eyedropper-base') {
      setBaseSample(sample);
      applySamples(sample, shadowSample);
    } else {
      setShadowSample(sample);
      applySamples(baseSample, sample);
    }
  };

  // Brush (1, force-include) / Eraser (-1, force-exclude) act on the skin-mask override
  // map — the only way to separate two regions sharing the same RGB value. bg-erase /
  // bg-restore act directly on the image's alpha channel instead — a background-removal
  // touch-up tool, unrelated to skin detection. See paletteNormalizer.js for the geometry.
  const doPaintStroke = (x0, y0, x1, y1) => {
    if (!originalImageDataRef.current) return;
    const { width, height, data } = originalImageDataRef.current;
    if (canvasTool === 'brush' || canvasTool === 'erase') {
      if (!maskOverrideRef.current) return;
      const value = canvasTool === 'brush' ? 1 : -1;
      paintStroke(maskOverrideRef.current, data, width, height, x0, y0, x1, y1, brushSize, value);
    } else if (canvasTool === 'bg-erase' || canvasTool === 'bg-restore') {
      const alpha = canvasTool === 'bg-erase' ? 0 : 255;
      paintAlphaStroke(data, width, height, x0, y0, x1, y1, brushSize, alpha);
    }
  };

  const extractAlpha = (data) => {
    const out = new Uint8ClampedArray(data.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3];
    return out;
  };
  const applyAlpha = (data, alpha) => {
    for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
  };

  // Undo/redo snapshots both the skin-mask overrides AND the alpha channel together, so
  // a single history works regardless of which tool (brush/eraser or bg-erase/restore) was used.
  const pushUndoSnapshot = () => {
    if (!maskOverrideRef.current || !originalImageDataRef.current) return;
    undoStackRef.current.push({
      overrides: maskOverrideRef.current.slice(),
      alpha: extractAlpha(originalImageDataRef.current.data),
    });
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryTick((t) => t + 1);
  };

  const undo = () => {
    if (undoStackRef.current.length === 0 || !maskOverrideRef.current || !originalImageDataRef.current) return;
    redoStackRef.current.push({
      overrides: maskOverrideRef.current.slice(),
      alpha: extractAlpha(originalImageDataRef.current.data),
    });
    const snap = undoStackRef.current.pop();
    maskOverrideRef.current = snap.overrides;
    applyAlpha(originalImageDataRef.current.data, snap.alpha);
    setOverrideTick((t) => t + 1);
    setHistoryTick((t) => t + 1);
  };

  const redo = () => {
    if (redoStackRef.current.length === 0 || !maskOverrideRef.current || !originalImageDataRef.current) return;
    undoStackRef.current.push({
      overrides: maskOverrideRef.current.slice(),
      alpha: extractAlpha(originalImageDataRef.current.data),
    });
    const snap = redoStackRef.current.pop();
    maskOverrideRef.current = snap.overrides;
    applyAlpha(originalImageDataRef.current.data, snap.alpha);
    setOverrideTick((t) => t + 1);
    setHistoryTick((t) => t + 1);
  };

  // Global Ctrl+Z / Ctrl+Y, skipped while typing in a text field so normal text-undo
  // still works there. Reads undo/redo via refs, so this one-time listener never goes stale.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!e.ctrlKey) return;
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
      else if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const PAINT_TOOLS = ['brush', 'erase', 'bg-erase', 'bg-restore'];

  // Updates the cursor-following brush-size ring (CSS px, accounting for the canvas
  // being scaled down to fit the panel — the ring must match the *actual* brush
  // footprint, not brushSize's raw image-pixel value).
  const updateBrushCursor = (e) => {
    if (!PAINT_TOOLS.includes(canvasTool)) { setBrushCursor(null); return; }
    const canvas = originalCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, diameter: brushSize * 2 * scale });
  };

  const handleCanvasMouseDown = (e) => {
    if (!PAINT_TOOLS.includes(canvasTool)) return;
    if (!maskOverrideRef.current || !originalImageDataRef.current) return;
    pushUndoSnapshot();
    paintingRef.current = true;
    const { x, y } = canvasEventToPixel(e);
    lastPaintPointRef.current = { x, y };
    doPaintStroke(x, y, x, y);
    setOverrideTick((t) => t + 1);
  };
  const handleCanvasMouseMove = (e) => {
    updateBrushCursor(e);
    if (!paintingRef.current) return;
    const { x, y } = canvasEventToPixel(e);
    const last = lastPaintPointRef.current || { x, y };
    doPaintStroke(last.x, last.y, x, y);
    lastPaintPointRef.current = { x, y };
    setOverrideTick((t) => t + 1);
  };
  const stopPainting = () => { paintingRef.current = false; lastPaintPointRef.current = null; };
  const handleCanvasMouseLeave = () => { stopPainting(); setBrushCursor(null); };

  const clearOverrides = () => {
    if (!maskOverrideRef.current) return;
    pushUndoSnapshot();
    maskOverrideRef.current.fill(0);
    setOverrideTick((t) => t + 1);
  };

  // One-shot auto background removal — BFS flood-fill from the edges, same algorithm as
  // the server's upload-time removeWhiteBackground. Catches the bulk of a white/near-white
  // background; the bg-erase/bg-restore brushes handle whatever it misses or over-erases
  // (isolated background patches not connected to an edge, or holes inside the character).
  const removeBackground = () => {
    if (!originalImageDataRef.current) return;
    pushUndoSnapshot();
    const { data, width, height } = originalImageDataRef.current;
    const erased = removeNearWhiteBackground(data, width, height);
    setOverrideTick((t) => t + 1);
    setBgMsg(erased > 0 ? `Erased ${erased} background pixels.` : 'No edge-connected white background found.');
  };

  const updateDetection = (key) => (e) => setDetection((prev) => ({ ...prev, [key]: Number(e.target.value) }));
  const updatePalette = (key) => (e) => setPaletteHex((prev) => ({ ...prev, [key]: e.target.value }));

  // PNG, not WebP: HTMLCanvasElement.toBlob('image/webp') is always lossy in browsers
  // (no lossless option exists in the Canvas API for WebP) and will silently perturb
  // pixels away from the exact 3 reference colors, breaking the runtime exact-match
  // swap. PNG canvas export is genuinely lossless, so every save/download path below
  // uses it.
  const download = (canvasRef, filename) => {
    canvasRef.current.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const buildMaskRecipe = () => ({ detection, highCut, lowCut, palette: paletteHex, alreadyNormalized });

  // Creates a brand-new asset from the rendered canvas — used when working from an
  // ad-hoc file (there's no existing asset to attach a mask to yet). The mask recipe
  // is attached to the freshly-created asset as a bonus, same as picking from the library.
  // skipProcessing tells the server to store the PNG byte-for-byte instead of running it
  // through the normal lossy webp conversion, which would reintroduce the same drift.
  const handleSave = () => {
    const canvasRef = saveTarget === 'recolored' ? recoloredCanvasRef : normalizedCanvasRef;
    if (!saveName.trim()) { setSaveMsg('Enter a name first.'); return; }
    setSaveBusy(true);
    setSaveMsg('');
    canvasRef.current.toBlob(async (blob) => {
      try {
        const fd = new FormData();
        fd.append('name', saveName.trim());
        fd.append('category', saveCategory);
        fd.append('tags', 'palette-normalized');
        fd.append('skipProcessing', 'true');
        fd.append('file', blob, `${saveName.trim()}.png`);
        const asset = await uploadAsset(fd);
        await saveAssetSkinMask(asset.id, buildMaskRecipe());
        setSelectedAssetId(asset.id);
        setSaveMsg(`✓ Saved "${saveName.trim()}" to the library.`);
      } catch (err) {
        setSaveMsg(err.response?.data?.error || 'Save failed');
      } finally {
        setSaveBusy(false);
      }
    }, 'image/png');
  };

  // Applies the mask to the asset's own stored file (overwritten in place — same asset
  // id, no duplicate) and records the mask recipe alongside it. Always writes the
  // Normalized (3-color) canvas, never the Recolored preview: the runtime exact-match
  // swap in the Comic UI needs the stored file to contain the 3 standard reference
  // colors byte-for-byte, not whatever preset happened to be selected here. Saving only
  // the mask metadata (without touching the file) has no visible effect at runtime,
  // since the swap operates on the asset's actual stored pixels.
  const handleSaveMask = async () => {
    if (!selectedAssetId || !normalizedImageDataRef.current) return;
    setMaskBusy(true);
    setMaskMsg('');
    normalizedCanvasRef.current.toBlob(async (blob) => {
      try {
        const fd = new FormData();
        fd.append('file', blob, `${saveName || 'asset'}.png`);
        fd.append('mask', JSON.stringify(buildMaskRecipe()));
        await replaceAssetFile(selectedAssetId, fd);
        setMaskMsg('✓ Mask applied — asset image updated in place.');
      } catch (err) {
        setMaskMsg(err.response?.data?.error || 'Save failed');
      } finally {
        setMaskBusy(false);
      }
    }, 'image/png');
  };

  return (
    <div style={s.root}>
      {/* TOOLBAR — everything needed for the brush/eraser editing workflow, always visible */}
      <header style={s.toolbar}>
        <h1 style={s.h1}>Palette Normalization</h1>

        <div style={s.toolbarGroup}>
          <button
            type="button"
            style={{ ...s.btn, ...(canvasTool === 'eyedropper-base' ? s.btnActive : {}) }}
            onClick={() => setCanvasTool((t) => (t === 'eyedropper-base' ? 'none' : 'eyedropper-base'))}
            disabled={!loaded || alreadyNormalized}
            title="Click a pixel on the Original image that represents the base skin tone"
          >
            Pick Base Sample
            {baseSample && <span style={{ ...s.sampleDot, background: `hsl(${baseSample.h},${baseSample.s}%,${baseSample.v}%)` }} />}
          </button>
          <button
            type="button"
            style={{ ...s.btn, ...(canvasTool === 'eyedropper-shadow' ? s.btnActive : {}) }}
            onClick={() => setCanvasTool((t) => (t === 'eyedropper-shadow' ? 'none' : 'eyedropper-shadow'))}
            disabled={!loaded || alreadyNormalized}
            title="Click a pixel on the Original image that represents the shadow skin tone"
          >
            Pick Shadow Sample
            {shadowSample && <span style={{ ...s.sampleDot, background: `hsl(${shadowSample.h},${shadowSample.s}%,${shadowSample.v}%)` }} />}
          </button>
          <button type="button" style={s.btn} disabled={undoStackRef.current.length === 0} onClick={undo} title="Ctrl+Z">↶ Undo</button>
          <button type="button" style={s.btn} disabled={redoStackRef.current.length === 0} onClick={redo} title="Ctrl+Y">↷ Redo</button>
        </div>

        <div style={s.toolbarGroup}>
          <button
            type="button"
            style={{ ...s.btn, ...(canvasTool === 'brush' ? s.btnActive : {}) }}
            onClick={() => { setCanvasTool((t) => (t === 'brush' ? 'none' : 'brush')); setShowMask(true); }}
            disabled={!loaded || alreadyNormalized}
          >
            🖌 Brush
          </button>
          <button
            type="button"
            style={{ ...s.btn, ...(canvasTool === 'erase' ? s.btnActive : {}) }}
            onClick={() => { setCanvasTool((t) => (t === 'erase' ? 'none' : 'erase')); setShowMask(true); }}
            disabled={!loaded || alreadyNormalized}
          >
            🧹 Eraser
          </button>
          <label style={s.toolbarSlider}>
            Size ({brushSize}px)
            <input type="range" min={2} max={60} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={s.range} />
          </label>
          <button type="button" style={s.btn} onClick={clearOverrides} disabled={!loaded}>Clear</button>
        </div>

        <div style={s.toolbarGroup}>
          <button type="button" style={s.btn} onClick={removeBackground} disabled={!loaded} title="Auto-erase white background connected to the edges">
            Remove BG
          </button>
          <button
            type="button"
            style={{ ...s.btn, ...(canvasTool === 'bg-erase' ? s.btnActive : {}) }}
            onClick={() => setCanvasTool((t) => (t === 'bg-erase' ? 'none' : 'bg-erase'))}
            disabled={!loaded}
            title="Manually erase leftover background spots"
          >
            🧽 Erase BG
          </button>
          <button
            type="button"
            style={{ ...s.btn, ...(canvasTool === 'bg-restore' ? s.btnActive : {}) }}
            onClick={() => setCanvasTool((t) => (t === 'bg-restore' ? 'none' : 'bg-restore'))}
            disabled={!loaded}
            title="Paint back any character pixels erased by mistake"
          >
            ↩ Restore BG
          </button>
        </div>

        <div style={s.toolbarGroup}>
          <label style={s.checkboxRow}>
            <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />
            Show mask
          </label>
          <button type="button" style={s.btn} onClick={() => setToolsOpen((o) => !o)}>
            {toolsOpen ? '▾' : '▸'} All Other Tools
          </button>
        </div>
      </header>

      {bgMsg && <p style={s.bgMsg}>{bgMsg}</p>}

      {libraryOpen && (
        <div style={s.libraryPanel}>
          <div style={s.libraryCategoryRow}>
            {['CHARACTER', 'FACE_PART', 'DRESS_PART', 'BODY_POSE'].map((c) => (
              <button
                key={c}
                type="button"
                style={{ ...s.btn, ...(libraryCategory === c ? s.btnActive : {}) }}
                onClick={() => { setLibraryCategory(c); loadLibraryAssets(c); }}
              >
                {c}
              </button>
            ))}
          </div>
          {libraryLoading ? (
            <p style={s.hint}>Loading…</p>
          ) : libraryAssets.length === 0 ? (
            <p style={s.hint}>No {libraryCategory} assets found.</p>
          ) : (
            <div style={s.libraryGrid}>
              {libraryAssets.map((asset) => (
                <button key={asset.id} type="button" style={s.libraryThumb} title={asset.name} onClick={() => handlePickAsset(asset)}>
                  <img src={asset.filePath} alt={asset.name} style={s.libraryThumbImg} />
                  <span style={s.libraryThumbLabel}>{asset.name}</span>
                  {asset.skinThresholds && <span style={s.libraryMaskTag}>mask saved</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MAIN ROW: the two canvases that matter for editing, plus a compact load/preset column */}
      <div style={s.mainRow}>
        <div style={s.bigStage}>
          <h3 style={s.h3}>Original (AI shades)</h3>
          <div style={s.canvasWrap}>
            <canvas
              ref={originalCanvasRef}
              style={{ ...s.canvas, cursor: canvasTool === 'none' ? 'default' : 'crosshair' }}
              onClick={handleEyedropperClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={stopPainting}
              onMouseLeave={handleCanvasMouseLeave}
            />
            {brushCursor && (
              <div
                style={{
                  ...s.brushRing,
                  left: brushCursor.x - brushCursor.diameter / 2,
                  top: brushCursor.y - brushCursor.diameter / 2,
                  width: brushCursor.diameter,
                  height: brushCursor.diameter,
                  borderColor: TOOL_COLORS[canvasTool] || '#fff',
                  background: `${TOOL_COLORS[canvasTool] || '#fff'}26`,
                }}
              />
            )}
          </div>
        </div>

        <div style={s.bigStage}>
          <h3 style={s.h3}>Recolored ({RECOLOR_PRESETS[activePresetIdx].name})</h3>
          <canvas ref={recoloredCanvasRef} style={s.canvas} />
        </div>

        {/* Still computed for the Apply/Save pipeline — just not shown, since "Recolored"
            on the Fair preset (the default) is visually identical to this. */}
        <canvas ref={normalizedCanvasRef} style={s.hiddenCanvas} />

        <aside style={s.sideCol}>
          <h2 style={s.h2}>Skin Recolor</h2>
          <div style={s.presetGrid}>
            {RECOLOR_PRESETS.map((preset, i) => (
              <button
                key={preset.name}
                type="button"
                disabled={!loaded}
                title={preset.name}
                style={{ ...s.presetCircle, background: preset.base, ...(activePresetIdx === i ? s.presetCircleActive : {}) }}
                onClick={() => setActivePresetIdx(i)}
              />
            ))}
          </div>
          <p style={s.presetActiveLabel}>{RECOLOR_PRESETS[activePresetIdx].name}</p>

          <h2 style={s.h2}>Load</h2>
          <button
            type="button"
            style={{ ...s.btn, ...(libraryOpen ? s.btnActive : {}) }}
            onClick={() => { setLibraryOpen((o) => !o); if (!libraryOpen) loadLibraryAssets(libraryCategory); }}
          >
            Load From Library…
          </button>
          <label style={s.fileLoadSide}>
            Choose File
            <input type="file" accept="image/png,image/webp,image/jpeg" onChange={handleFileChange} />
          </label>
          {fileName && <span style={s.fileName}>{fileName}{selectedAssetId ? ' (library asset)' : ''}</span>}

          <h2 style={s.h2}>Download</h2>
          <button type="button" style={s.btn} disabled={!loaded} onClick={() => download(recoloredCanvasRef, 'character_recolored.png')}>Download Recolored</button>

          <h2 style={s.h2}>Store Result</h2>
          {selectedAssetId ? (
            <div style={s.saveBox}>
              <p style={s.hint}>
                Applies this mask to "{saveName}"'s own image (overwritten in place — same
                asset, no duplicate) and remembers the recipe for next time.
              </p>
              <button type="button" style={s.btn} disabled={maskBusy} onClick={handleSaveMask}>
                {maskBusy ? 'Applying…' : 'Apply Mask to Asset'}
              </button>
              {maskMsg && <p style={s.hint}>{maskMsg}</p>}
            </div>
          ) : !saveOpen ? (
            <button type="button" style={s.btn} disabled={!loaded} onClick={() => setSaveOpen(true)}>Save to Library…</button>
          ) : (
            <div style={s.saveBox}>
              <p style={s.hint}>No existing asset is loaded, so there's nothing to attach a mask to yet — this creates a new asset (image + mask together).</p>
              <label style={s.thresholdLabel}>Name
                <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} style={s.textInput} />
              </label>
              <label style={s.thresholdLabel}>Category
                <select value={saveCategory} onChange={(e) => setSaveCategory(e.target.value)} style={s.textInput}>
                  {CATEGORY_IDS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={s.thresholdLabel}>Save which image
                <select value={saveTarget} onChange={(e) => setSaveTarget(e.target.value)} style={s.textInput}>
                  <option value="normalized">Normalized (3-color)</option>
                  <option value="recolored">Recolored (current preset)</option>
                </select>
              </label>
              <button type="button" style={s.btn} disabled={saveBusy} onClick={handleSave}>{saveBusy ? 'Saving…' : 'Save'}</button>
              {saveMsg && <p style={s.hint}>{saveMsg}</p>}
            </div>
          )}
        </aside>
      </div>
      {!loaded && <p style={s.emptyStateInline}>Load a character image to begin.</p>}

      {/* Detection thresholds + output palette — collapsed behind "All Other Tools" since
          the brush/eraser workflow doesn't need them visible all the time. */}
      {toolsOpen && (
      <div style={s.toolsPanel}>
        <div style={s.toolsCol}>
          <label style={s.alreadyNormalizedRow}>
            <input type="checkbox" checked={alreadyNormalized} onChange={(e) => setAlreadyNormalized(e.target.checked)} />
            Image is already normalized (skip detection)
          </label>
          <p style={s.hint}>Check this for images that already only contain the 3 standard skin colors. Skips HSV detection and brightness re-bucketing entirely, going straight to the exact-match runtime swap.</p>

            {!alreadyNormalized && (
              <>
                <h2 style={s.h2}>Skin Detection (HSV)</h2>
                <div style={s.thresholdGroup}>
                  <label style={s.thresholdLabel}>Hue min <input type="range" min={0} max={360} value={detection.hMin} onChange={updateDetection('hMin')} style={s.range} /><output style={s.output}>{Math.round(detection.hMin)}</output></label>
                  <label style={s.thresholdLabel}>Hue max <input type="range" min={0} max={360} value={detection.hMax} onChange={updateDetection('hMax')} style={s.range} /><output style={s.output}>{Math.round(detection.hMax)}</output></label>
                  <label style={s.thresholdLabel}>Sat min % <input type="range" min={0} max={100} value={detection.sMin} onChange={updateDetection('sMin')} style={s.range} /><output style={s.output}>{Math.round(detection.sMin)}</output></label>
                  <label style={s.thresholdLabel}>Sat max % <input type="range" min={0} max={100} value={detection.sMax} onChange={updateDetection('sMax')} style={s.range} /><output style={s.output}>{Math.round(detection.sMax)}</output></label>
                  <label style={s.thresholdLabel}>Val min % <input type="range" min={0} max={100} value={detection.vMin} onChange={updateDetection('vMin')} style={s.range} /><output style={s.output}>{Math.round(detection.vMin)}</output></label>
                  <label style={s.thresholdLabel}>Val max % <input type="range" min={0} max={100} value={detection.vMax} onChange={updateDetection('vMax')} style={s.range} /><output style={s.output}>{Math.round(detection.vMax)}</output></label>
                </div>

                <h2 style={s.h2}>Brightness Mapping</h2>
                <div style={s.thresholdGroup}>
                  <label style={s.thresholdLabel}>Shadow cutoff (V &lt;) <input type="range" min={0} max={100} value={lowCut} onChange={(e) => setLowCut(Number(e.target.value))} style={s.range} /><output style={s.output}>{lowCut}</output></label>
                </div>
                <p style={s.hint}>Pixels below the cutoff → Shadow, everything else → Base. Use the Pick Base/Shadow Sample buttons above for an accurate starting point, then fine-tune here.</p>
                <button
                  type="button"
                  style={s.btn}
                  onClick={() => {
                    setDetection(DEFAULT_DETECTION);
                    setHighCut(DEFAULT_HIGH_CUT);
                    setLowCut(DEFAULT_LOW_CUT);
                    setBaseSample(null);
                    setShadowSample(null);
                  }}
                >
                  Reset Detection Defaults
                </button>
              </>
            )}
          </div>

          <div style={s.toolsCol}>
            <h2 style={s.h2}>Standard Output Palette</h2>
            <p style={s.hint}>{alreadyNormalized ? PALETTE_HINT_SKIP : PALETTE_HINT_DEFAULT}</p>
            <div style={s.paletteRow}>
              <label style={s.paletteLabel}>Base <input type="color" value={paletteHex.base} onChange={updatePalette('base')} style={s.colorInput} /></label>
              <label style={s.paletteLabel}>Shadow <input type="color" value={paletteHex.shadow} onChange={updatePalette('shadow')} style={s.colorInput} /></label>
            </div>
            <button type="button" style={s.btn} onClick={() => setPaletteHex((prev) => ({ ...prev, base: hexFromRgb(STANDARD_PALETTE.base), shadow: hexFromRgb(STANDARD_PALETTE.shadow) }))}>Reset Palette</button>
            {stats && <div style={s.stats}>{stats}</div>}
          </div>

      </div>
      )}
    </div>
  );
}

const s = {
  root: { fontFamily: 'system-ui, sans-serif', background: '#1b1b1f', color: '#eee', borderRadius: 8, overflow: 'hidden' },
  toolbar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, padding: '10px 16px', background: '#15151a', borderBottom: '1px solid #333' },
  toolbarGroup: { display: 'flex', alignItems: 'center', gap: 6, paddingRight: 18, borderRight: '1px solid #333' },
  toolbarSlider: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#bbb', width: 110 },
  sampleDot: { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginLeft: 6, border: '1px solid #555', verticalAlign: 'middle' },
  h1: { fontSize: 16, margin: 0 },
  fileName: { fontSize: 11, color: '#999', display: 'block', marginTop: 4 },
  bgMsg: { fontSize: 12, color: '#7fd17f', textAlign: 'center', margin: '8px 16px 0' },
  fileLoadSide: { fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  libraryPanel: { padding: 12, background: '#1f1f24', borderBottom: '1px solid #333' },
  libraryCategoryRow: { display: 'flex', gap: 8, marginBottom: 10 },
  libraryGrid: { display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 220, overflowY: 'auto' },
  libraryThumb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 96, padding: 6, background: '#2a2a31', border: '1px solid #3a3a42', borderRadius: 4, cursor: 'pointer', position: 'relative' },
  libraryThumbImg: { width: 80, height: 80, objectFit: 'contain', background: '#fff', borderRadius: 4 },
  libraryThumbLabel: { fontSize: 10, color: '#ddd', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' },
  libraryMaskTag: { fontSize: 9, color: '#7fd17f', position: 'absolute', top: 2, right: 4 },
  mainRow: { display: 'flex', gap: 16, padding: 16, alignItems: 'flex-start' },
  bigStage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 },
  sideCol: { width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflowY: 'auto' },
  hiddenCanvas: { display: 'none' },
  presetGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, justifyContent: 'start' },
  presetCircle: { width: 44, height: 44, borderRadius: '50%', border: '3px solid transparent', cursor: 'pointer', padding: 0 },
  presetCircleActive: { borderColor: '#3b5bdb' },
  presetActiveLabel: { fontSize: 12, color: '#ddd', textAlign: 'center', margin: '8px 0 0' },
  emptyStateInline: { textAlign: 'center', color: '#777', fontSize: 13, margin: '0 0 16px' },
  toolsPanel: { display: 'flex', gap: 24, padding: 16, background: '#16161a', borderTop: '1px solid #333', flexWrap: 'wrap' },
  toolsCol: { flex: '1 1 260px', minWidth: 240 },
  h2: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', margin: '16px 0 8px' },
  h3: { fontSize: 12, color: '#aaa', margin: '0 0 6px' },
  thresholdGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  thresholdLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb' },
  range: { flex: 1 },
  output: { width: 32, textAlign: 'right', fontSize: 11, color: '#ddd' },
  hint: { fontSize: 11, color: '#888', lineHeight: 1.4, whiteSpace: 'pre-line' },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6 },
  alreadyNormalizedRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff' },
  paletteRow: { display: 'flex', gap: 10 },
  paletteLabel: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 11, color: '#bbb' },
  colorInput: { width: 36, height: 30, padding: 0, border: '1px solid #3a3a42', borderRadius: 4, background: 'none' },
  textInput: { width: '100%', padding: '5px 8px', background: '#2a2a31', color: '#eee', border: '1px solid #3a3a42', borderRadius: 4, fontSize: 12 },
  btn: { padding: '6px 12px', cursor: 'pointer', background: '#2a2a31', color: '#eee', border: '1px solid #3a3a42', borderRadius: 4, fontSize: 12, marginTop: 8, marginRight: 6 },
  btnActive: { borderColor: '#3b5bdb', background: '#283156' },
  stats: { marginTop: 14, fontSize: 12, color: '#7fd17f', lineHeight: 1.6, whiteSpace: 'pre-line' },
  saveBox: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 },
  canvasWrap: { position: 'relative', display: 'inline-block', maxWidth: '100%' },
  brushRing: {
    position: 'absolute', borderRadius: '50%', border: '2px solid',
    pointerEvents: 'none', boxSizing: 'border-box',
  },
  canvas: {
    maxWidth: '100%', maxHeight: '60vh',
    backgroundImage: 'linear-gradient(45deg, #2b2b2f 25%, transparent 25%), linear-gradient(-45deg, #2b2b2f 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2b2b2f 75%), linear-gradient(-45deg, transparent 75%, #2b2b2f 75%)',
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
    backgroundColor: '#232328',
    border: '1px solid #333',
  },
};
