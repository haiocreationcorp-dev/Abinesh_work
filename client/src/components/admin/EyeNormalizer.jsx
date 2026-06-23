import { useEffect, useRef, useState } from 'react';
import { getAssets, replaceAssetFile } from '../../api/assets.js';
import { paintStroke } from '../../utils/paletteNormalizer.js';
import { previewEyeMasks, applyEyeMasks, pickDetection } from '../../utils/eyeNormalizer.js';
import { EYEBROW_REF_COLOR, IRIS_REF_COLOR } from '../../utils/recolorImage.js';

// Fixed colors — same ones actually saved to the file (EYEBROW_REF_COLOR/IRIS_REF_COLOR
// in recolorImage.js), so the mask preview and the Result canvas are always identical.
// No customization here on purpose: the runtime exact-match swap looks for these exact
// values, so letting them vary per-session would silently break already-normalized assets.
const LAYERS = [
  { id: 'eyebrow', label: 'Eyebrow', color: EYEBROW_REF_COLOR },
  { id: 'iris', label: 'Iris', color: IRIS_REF_COLOR },
];

// Admin-only authoring tool for EYE FACE_PART assets — paint the eyebrow and iris as two
// independent regions (own Int8Array override map each, reusing paletteNormalizer.js's
// generic brush primitives), preview each in its own color (or both together), then
// flatten both to their fixed reference colors in one save so the Comic UI's
// recolorEyeAsset() exact-match swap can recolor eyebrow → hair color and iris → eye
// color independently at runtime.
export default function EyeNormalizer() {
  const originalCanvasRef = useRef(null);
  const resultCanvasRef = useRef(null);
  const originalImageDataRef = useRef(null);
  const eyebrowOverrideRef = useRef(null);
  const irisOverrideRef = useRef(null);
  const paintingRef = useRef(false);
  const lastPaintPointRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [activeLayer, setActiveLayer] = useState('eyebrow');
  const [tool, setTool] = useState('pick'); // 'none' | 'brush' | 'erase' | 'pick'
  const [brushSize, setBrushSize] = useState(8);
  const [brushCursor, setBrushCursor] = useState(null); // { x, y, diameter } in CSS px, or null
  const [previewMode, setPreviewMode] = useState('both'); // 'eyebrow' | 'iris' | 'both'
  const [overrideTick, setOverrideTick] = useState(0);
  // HSV detection windows, same paradigm as Palette Normalizer's "Pick Base/Shadow
  // Sample" — set by clicking a pixel with the 'pick' tool active, null until then.
  const [eyebrowDetection, setEyebrowDetection] = useState(null);
  const [irisDetection, setIrisDetection] = useState(null);

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLibraryLoading(true);
    getAssets({ category: 'FACE_PART' }).then(setLibraryAssets).finally(() => setLibraryLoading(false));
  }, []);

  // Redraw the live mask-preview canvas whenever the source, override paints, or preview
  // mode change.
  useEffect(() => {
    if (!loaded || !originalImageDataRef.current) return;
    const canvas = originalCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(originalImageDataRef.current.width, originalImageDataRef.current.height);
    previewEyeMasks(
      originalImageDataRef.current.data, out.data, eyebrowOverrideRef.current, irisOverrideRef.current,
      eyebrowDetection, irisDetection, previewMode,
    );
    ctx.putImageData(out, 0, 0);
  }, [loaded, previewMode, overrideTick, eyebrowDetection, irisDetection]);

  // Redraw the "Result" canvas — what actually gets saved — whenever paints change.
  useEffect(() => {
    if (!loaded || !originalImageDataRef.current) return;
    const canvas = resultCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(originalImageDataRef.current.width, originalImageDataRef.current.height);
    applyEyeMasks(originalImageDataRef.current.data, out.data, eyebrowOverrideRef.current, irisOverrideRef.current, eyebrowDetection, irisDetection);
    ctx.putImageData(out, 0, 0);
  }, [loaded, overrideTick, eyebrowDetection, irisDetection]);

  const handlePickAsset = (asset) => {
    setSelectedAssetId(asset.id);
    setFileName(asset.name);
    setMsg('');
    setLibraryOpen(false);

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
      setOverrideTick((t) => t + 1);
      setLoaded(true);
    };
    img.onerror = () => setMsg('Could not load this asset\'s image.');
    img.src = asset.filePath;
  };

  const activeOverride = () => (activeLayer === 'eyebrow' ? eyebrowOverrideRef.current : irisOverrideRef.current);

  const canvasEventToPixel = (e) => {
    const canvas = originalCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    return { x, y };
  };

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
    if (activeLayer === 'eyebrow') {
      setEyebrowDetection((prev) => pickDetection(prev, data[i], data[i + 1], data[i + 2]));
    } else {
      setIrisDetection((prev) => pickDetection(prev, data[i], data[i + 1], data[i + 2]));
    }
  };

  // Cursor-following brush-size ring, in CSS px relative to the canvas — lets the admin
  // see exactly how big an area the brush/eraser will cover before clicking. Hidden for
  // the 'pick' tool, since that's a single click, not a spatial radius.
  const updateBrushCursor = (e) => {
    if (tool !== 'brush' && tool !== 'erase') { setBrushCursor(null); return; }
    const canvas = originalCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, diameter: brushSize * 2 * scale });
  };

  const handleMouseDown = (e) => {
    if (tool === 'none' || !loaded) return;
    const { x, y } = canvasEventToPixel(e);
    if (tool === 'pick') {
      doPick(x, y);
      return;
    }
    paintingRef.current = true;
    lastPaintPointRef.current = { x, y };
    doPaintStroke(x, y, x, y);
    setOverrideTick((t) => t + 1);
  };
  const handleMouseMove = (e) => {
    updateBrushCursor(e);
    if (!paintingRef.current) return;
    const { x, y } = canvasEventToPixel(e);
    const last = lastPaintPointRef.current || { x, y };
    doPaintStroke(last.x, last.y, x, y);
    lastPaintPointRef.current = { x, y };
    setOverrideTick((t) => t + 1);
  };
  const stopPainting = () => { paintingRef.current = false; lastPaintPointRef.current = null; };
  const handleMouseLeave = () => { stopPainting(); setBrushCursor(null); };

  const clearLayer = (layer) => {
    const ref = layer === 'eyebrow' ? eyebrowOverrideRef : irisOverrideRef;
    if (ref.current) ref.current.fill(0);
    if (layer === 'eyebrow') setEyebrowDetection(null);
    else setIrisDetection(null);
    setOverrideTick((t) => t + 1);
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
        setMsg('✓ Eyebrow + iris masks applied — asset image updated in place.');
      } catch (err) {
        setMsg(err.response?.data?.error || 'Save failed');
      } finally {
        setSaving(false);
      }
    }, 'image/png');
  };

  return (
    <div style={s.root}>
      <h3 style={s.heading}>Eye Normalizer</h3>
      <p style={s.sub}>
        Mark the eyebrow and iris as two independent regions on an EYE asset (magenta and
        fluorescent blue — the same color you'll see if you ever view the saved file
        directly, e.g. in Browse Assets — these are placeholder markers, not real colors).
        At runtime, eyebrow color follows hair color and iris color is set per-character —
        independently.
      </p>

      <div style={s.layout}>
        <aside style={s.sidebar}>
          <button className="btn btn-sm btn-outline" onClick={() => setLibraryOpen((o) => !o)} style={{ marginBottom: 8 }}>
            {libraryOpen ? '▾' : '▸'} {selectedAssetId ? `Loaded: ${fileName}` : 'Pick an EYE asset…'}
          </button>
          {libraryOpen && (
            libraryLoading ? (
              <p style={s.hint}>Loading…</p>
            ) : libraryAssets.length === 0 ? (
              <p style={s.hint}>No FACE_PART assets found.</p>
            ) : (
              <div style={s.grid}>
                {libraryAssets.map((a) => (
                  <button key={a.id} title={a.name} onClick={() => handlePickAsset(a)}
                    style={{ ...s.thumb, ...(selectedAssetId === a.id ? s.thumbActive : {}) }}>
                    <img src={a.filePath} alt={a.name} style={{ width: 60, height: 60, objectFit: 'contain', display: 'block' }} />
                    <p style={s.thumbLabel}>{a.name}</p>
                  </button>
                ))}
              </div>
            )
          )}

          {loaded && (
            <>
              <p style={s.sectionTitle}>Layer</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {LAYERS.map((l) => (
                  <button key={l.id} className={`btn btn-sm ${activeLayer === l.id ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveLayer(l.id)}>
                    <span style={{ ...s.dot, background: l.color }} /> {l.label}
                  </button>
                ))}
              </div>

              <p style={s.sectionTitle}>Tool</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <button className={`btn btn-sm ${tool === 'brush' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTool((t) => (t === 'brush' ? 'none' : 'brush'))}>🖌 Brush</button>
                <button className={`btn btn-sm ${tool === 'erase' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTool((t) => (t === 'erase' ? 'none' : 'erase'))}>🧹 Eraser</button>
                <button className={`btn btn-sm ${tool === 'pick' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTool((t) => (t === 'pick' ? 'none' : 'pick'))} title="Click a pixel — same as Palette Normalizer's Pick Base/Shadow Sample">
                  🪄 Pick Color
                </button>
              </div>
              {tool === 'pick' ? (
                <p style={s.hint}>
                  Click a pixel on the {activeLayer === 'eyebrow' ? 'eyebrow' : 'iris'} —
                  every similarly-colored pixel in the image gets selected, live. If part
                  of it is missed (e.g. a highlight or shadow tone), click again on the
                  missed area — each click expands the selection, it doesn't replace it.
                </p>
              ) : (
                <label style={s.sliderLabel}>
                  Brush size ({brushSize}px)
                  <input type="range" min={2} max={40} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ width: '100%' }} />
                </label>
              )}

              <p style={s.sectionTitle}>Clear</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button className="btn btn-sm btn-outline" onClick={() => clearLayer('eyebrow')}>Clear Eyebrow</button>
                <button className="btn btn-sm btn-outline" onClick={() => clearLayer('iris')}>Clear Iris</button>
              </div>

              <p style={s.sectionTitle}>Preview</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['eyebrow', 'iris', 'both'].map((m) => (
                  <button key={m} className={`btn btn-sm ${previewMode === m ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setPreviewMode(m)} style={{ textTransform: 'capitalize' }}>
                    {m}
                  </button>
                ))}
              </div>

              <button className="btn btn-primary" disabled={saving} onClick={handleApply} style={{ marginTop: 8 }}>
                {saving ? 'Saving…' : 'Apply to Asset'}
              </button>
              {msg && <p style={s.hint}>{msg}</p>}
            </>
          )}
        </aside>

        <div style={s.stage}>
          {!loaded && <p style={s.hint}>Pick an EYE asset from the library to begin.</p>}
          <div style={{ ...s.canvasRow, display: loaded ? 'flex' : 'none' }}>
            <div style={s.canvasCol}>
              <div style={s.canvasWrap}>
                <canvas
                  ref={originalCanvasRef}
                  style={{ ...s.canvas, cursor: tool === 'none' ? 'default' : 'crosshair' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={stopPainting}
                  onMouseLeave={handleMouseLeave}
                />
                {brushCursor && (
                  <div style={{
                    ...s.brushRing,
                    left: brushCursor.x - brushCursor.diameter / 2,
                    top: brushCursor.y - brushCursor.diameter / 2,
                    width: brushCursor.diameter,
                    height: brushCursor.diameter,
                    borderColor: tool === 'erase' ? '#f87171' : '#4ade80',
                    background: tool === 'erase' ? '#f8717126' : '#4ade8026',
                  }} />
                )}
              </div>
              <span style={s.canvasCaption}>Mask preview ({previewMode})</span>
            </div>
            <div style={s.canvasCol}>
              <canvas ref={resultCanvasRef} style={s.canvas} />
              <span style={s.canvasCaption}>Result (what gets saved)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { padding: 28, maxWidth: 1100 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 },
  hint: { fontSize: 12, color: 'var(--mid)' },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  sidebar: { width: 240, flexShrink: 0 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', color: 'var(--mid)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, maxHeight: 300, overflowY: 'auto', marginBottom: 10 },
  thumb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' },
  thumbActive: { borderColor: '#8B5CF6', background: 'var(--primary-light)' },
  thumbLabel: { fontSize: 10, color: 'var(--mid)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', margin: 0 },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 4 },
  sliderLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mid)', marginBottom: 10 },
  stage: { flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', background: 'var(--primary-light)', borderRadius: 8, padding: 16 },
  canvasRow: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  canvasCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  canvasWrap: { position: 'relative', display: 'inline-block' },
  brushRing: {
    position: 'absolute', borderRadius: '50%', border: '2px solid',
    pointerEvents: 'none', boxSizing: 'border-box',
  },
  canvas: {
    // No fixed width/height and no object-fit — <canvas> doesn't support object-fit at
    // all (unlike <img>), so forcing a fixed box stretches the pixel buffer non-uniformly
    // whenever the loaded image isn't that exact aspect ratio, which throws off click
    // coordinate mapping (paint/pick landing off from the cursor). maxWidth/maxHeight let
    // it scale down uniformly from its natural (buffer) size instead, same as
    // Palette Normalizer's working canvas. display:'block' avoids the few-px inline
    // baseline gap canvases get by default, which the cursor ring doesn't account for.
    display: 'block', maxWidth: '100%', maxHeight: 320, border: '1px solid var(--border)', borderRadius: 6,
    backgroundImage: 'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)',
    backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px', backgroundColor: '#fff',
  },
  canvasCaption: { fontSize: 11, color: 'var(--mid)' },
};
