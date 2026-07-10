import { useEffect, useMemo, useRef, useState } from 'react';
import { getAssets, getFacePartAlignment, saveFacePartAlignment } from '../../api/assets.js';
import { VIEWS } from '../../constants/categories.js';
import { SKIN_PRESETS } from '../../utils/skinPalette.js';
import CharacterPresetRig from '../comic/CharacterPresetRig.jsx';

const SKIN_TONE_OPTIONS = Object.values(SKIN_PRESETS);

const DEFAULT_BOX_FRAC = { x: 0.3, y: 0.02, w: 0.4, h: 0.22 }; // sensible "near the top" default
const STAGE_MAX_W = 560;
const STAGE_MAX_H = 640;

// BODY_POSE assets are a single flat image (costume+pose baked together) — there's no
// multi-part canvas here, just one job: mark where the face goes on this specific image
// (facePlacement). Reuses the existing FacePartAlignment mechanism with zero backend
// changes — partType:'head', SHARED_ALIGNMENT_KEY ('__ALL__') since it's one box per
// costume regardless of which face ends up there. Coordinates are saved in the image's
// own natural pixel dimensions, so they're meaningful regardless of preview scaling.
// The box itself is shared across every face of that costume's view (FRONT vs THREE_
// QUARTER are different BODY_POSE assets with different ids, so each already gets its
// own independent saved placement) — a live face preview just helps calibrate it visually.
export default function PoseBuilder() {
  const [poses, setPoses] = useState([]);
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [previewFaceId, setPreviewFaceId] = useState('');
  // Lets the admin preview this pose's head-box calibration against any skin/hair
  // combination, not just the raw unrecolored asset — matches what a real placed
  // character will actually look like once a skin tone/hair color is chosen for it.
  const [previewSkinTone, setPreviewSkinTone] = useState(SKIN_TONE_OPTIONS[0]?.id || '');
  const [previewHairColor, setPreviewHairColor] = useState('#3b2412');
  const [previewIrisColor, setPreviewIrisColor] = useState('#3b2a1f');
  const [naturalSize, setNaturalSize] = useState(null); // { w, h }
  const [box, setBox] = useState(null); // { x, y, w, h } in natural-image pixels
  // Most-recently-used placement per view, as fractions of the image size (not raw
  // pixels, since different costumes have different image dimensions) — lets a brand-new
  // pose default to whatever placement was last settled on for that view (Front/3-4),
  // instead of the same generic guess every time. Still freely adjustable per pose.
  const [lastBoxFracByView, setLastBoxFracByView] = useState({});
  // Set when the current `box` came from another pose's saved placement (same poseType,
  // rescaled) rather than this pose's own saved row — see headBoxFallback.js server-side.
  // Purely an informational hint; Save always writes a real, pose-specific row regardless.
  const [boxInherited, setBoxInherited] = useState(null); // null | { from: string }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const dragRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    Promise.all([
      getAssets({ category: 'BODY_POSE' }).catch(() => []),
      getAssets({ category: 'FACE_TEMPLATE' }).catch(() => []),
    ]).then(([p, f]) => { setPoses(p); setFaces(f); }).finally(() => setLoading(false));
  }, []);

  // Only faces matching this pose's own view make sense to preview here — a front
  // costume should be calibrated against a front face, not a 3/4 one.
  const matchingFaces = selected ? faces.filter((f) => !selected.view || f.view === selected.view) : [];
  const previewFace = matchingFaces.find((f) => f.id === previewFaceId) || null;

  // Drives the live-preview pane: the *real* CharacterPresetRig, fed the chosen preview
  // face (regardless of which view it happens to be, since we set both front/3-4 to it)
  // and the box's current live value via headBoxOverride — so what you see there is
  // exactly what the real renderer produces, not a second hand-rolled approximation.
  // Memoized so dragging the box (which updates `box` on every mousemove) doesn't make
  // CharacterPresetRig re-fetch the face/pose data on every frame — only headBoxOverride
  // (passed directly, unmemoized) needs to change per frame; that's cheap, render-only.
  const previewRigOverride = useMemo(
    () => (previewFaceId ? {
      id: 'preview-draft', frontFaceId: previewFaceId, threeQuarterFaceId: previewFaceId,
      skinTone: previewSkinTone || undefined, hairColor: previewHairColor || undefined,
      irisColor: previewIrisColor || undefined,
    } : null),
    [previewFaceId, previewSkinTone, previewHairColor, previewIrisColor]
  );
  const previewRigInstance = useMemo(
    () => (selected ? { presetId: 'preview-draft', bodyPoseId: selected.id } : null),
    [selected]
  );

  // Content bounds = union of the body image's own pixel bounds and the head box, since
  // the box is allowed to extend above/beside the image's natural frame (e.g. y<0 for a
  // pose whose visible crop starts at the shoulders) — mirrors the same union-bounds math
  // the runtime renderer (CharacterPresetRig) uses, so what you see here while calibrating
  // matches exactly what will actually render, instead of the box appearing to spill
  // outside the canvas into blank space.
  const unionMinX = Math.min(0, box?.x ?? 0);
  const unionMinY = Math.min(0, box?.y ?? 0);
  const unionMaxX = Math.max(naturalSize?.w ?? 0, box ? box.x + box.w : 0);
  const unionMaxY = Math.max(naturalSize?.h ?? 0, box ? box.y + box.h : 0);
  const unionW = unionMaxX - unionMinX || 1;
  const unionH = unionMaxY - unionMinY || 1;
  const scale = naturalSize ? Math.min(STAGE_MAX_W / unionW, STAGE_MAX_H / unionH) : 1;

  const pickPose = async (asset) => {
    setSelected(asset);
    setNaturalSize(null);
    setBox(null);
    setBoxInherited(null);
    setMsg('');
    const matched = faces.filter((f) => !asset.view || f.view === asset.view);
    setPreviewFaceId(matched[0]?.id || '');
    try {
      const alignment = await getFacePartAlignment(asset.id, '__ALL__', 'head');
      if (alignment) {
        setBox({ x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h });
        setBoxInherited(alignment.inherited ? { from: alignment.inheritedFrom } : null);
      }
    } catch { /* no saved placement yet, and no sibling pose to borrow from either */ }
  };

  const handleImgLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.target;
    setNaturalSize({ w, h });
    if (!box) {
      const frac = (selected?.view && lastBoxFracByView[selected.view]) || DEFAULT_BOX_FRAC;
      setBox({ x: Math.round(w * frac.x), y: Math.round(h * frac.y), w: Math.round(w * frac.w), h: Math.round(h * frac.h) });
    }
  };

  // Keeps lastBoxFracByView in sync with whatever's currently on screen for this view —
  // whether that came from a saved alignment, the learned default, or a manual drag/resize
  // — so the "remembered" placement always reflects the most recent one you settled on.
  useEffect(() => {
    if (!box || !naturalSize || !selected?.view) return;
    setLastBoxFracByView((prev) => ({
      ...prev,
      [selected.view]: { x: box.x / naturalSize.w, y: box.y / naturalSize.h, w: box.w / naturalSize.w, h: box.h / naturalSize.h },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, naturalSize, selected]);

  const toNatural = (dx, dy) => ({ dx: dx / scale, dy: dy / scale });

  const startDrag = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, origBox: { ...box } };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  };

  const onDrag = (e) => {
    if (!dragRef.current) return;
    const { mode, startX, startY, origBox } = dragRef.current;
    const { dx, dy } = toNatural(e.clientX - startX, e.clientY - startY);
    if (mode === 'move') {
      setBox({ ...origBox, x: Math.round(origBox.x + dx), y: Math.round(origBox.y + dy) });
    } else {
      setBox({ ...origBox, w: Math.max(10, Math.round(origBox.w + dx)), h: Math.max(10, Math.round(origBox.h + dy)) });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  };

  const handleSave = async () => {
    if (!selected || !box) return;
    setSaving(true); setMsg('');
    try {
      await saveFacePartAlignment({
        faceAssetId: selected.id, partAssetId: '__ALL__', partType: 'head',
        x: box.x, y: box.y, w: box.w, h: box.h,
        rotation: 0, flipX: false, flipY: false, connectX: 0.5, connectY: 1.0,
      });
      setBoxInherited(null);
      setMsg('✓ Face placement saved');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={s.root}>
      <h3 style={s.heading}>Pose Builder</h3>
      <p style={s.sub}>Mark where the face goes on each BODY_POSE image. Drag the box to move it, drag the bottom-right handle to resize.</p>

      {selected && (
        matchingFaces.length > 0 ? (
          <div style={s.previewRow}>
            <label style={s.hint}>
              Preview face ({selected.view ? VIEWS.find((v) => v.id === selected.view)?.label : 'any view'}):
            </label>
            <select value={previewFaceId} onChange={(e) => setPreviewFaceId(e.target.value)} style={{ fontSize: 12 }}>
              {matchingFaces.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {previewFace && (
              <img src={previewFace.filePath} alt={previewFace.name} style={s.previewThumb} />
            )}
          </div>
        ) : (
          <p style={{ ...s.hint, marginBottom: 12 }}>
            No {selected.view ? VIEWS.find((v) => v.id === selected.view)?.label : ''} face templates saved yet —
            build one in Face Builder first to preview placement here.
          </p>
        )
      )}

      {selected && matchingFaces.length > 0 && (
        <div style={s.previewRow}>
          <label style={s.hint}>Preview Skin Tone:</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {SKIN_TONE_OPTIONS.map((t) => (
              <button key={t.id} type="button" title={t.label} onClick={() => setPreviewSkinTone(t.id)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', padding: 0, cursor: 'pointer',
                  background: t.base, border: previewSkinTone === t.id ? '2px solid var(--nav-primary)' : '1px solid var(--border)',
                }} />
            ))}
          </div>
          <label style={s.hint}>Preview Hair Color:</label>
          <input type="color" value={previewHairColor} onChange={(e) => setPreviewHairColor(e.target.value)}
            style={{ width: 32, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
          <label style={s.hint}>Preview Iris Color:</label>
          <input type="color" value={previewIrisColor} onChange={(e) => setPreviewIrisColor(e.target.value)}
            style={{ width: 32, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
        </div>
      )}

      <div style={s.layout}>
        <div style={s.sidebar}>
          <p style={s.sectionTitle}>Body Poses ({poses.length})</p>
          {loading ? (
            <p style={s.hint}>Loading…</p>
          ) : poses.length === 0 ? (
            <p style={s.hint}>No BODY_POSE assets uploaded yet.</p>
          ) : (
            <div style={s.grid}>
              {poses.map((p) => (
                <button key={p.id} title={p.name} onClick={() => pickPose(p)}
                  style={{ ...s.thumb, ...(selected?.id === p.id ? s.thumbActive : {}) }}>
                  <img src={p.filePath} alt={p.name} style={{ width: 60, height: 60, objectFit: 'contain', display: 'block' }} />
                  <p style={s.thumbLabel}>{p.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={s.stage}>
          {!selected ? (
            <p style={s.hint}>Pick a body pose to mark its face placement.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>
              <div ref={wrapRef} style={{
                position: 'relative', maxWidth: '100%',
                width: naturalSize ? unionW * scale : undefined,
                height: naturalSize ? unionH * scale : undefined,
              }}>
                <img src={selected.filePath} alt={selected.name} onLoad={handleImgLoad} draggable={false}
                  style={naturalSize ? {
                    position: 'absolute', left: -unionMinX * scale, top: -unionMinY * scale,
                    width: naturalSize.w * scale, height: naturalSize.h * scale, display: 'block',
                  } : { maxWidth: '100%', maxHeight: '70vh', display: 'block' }} />
                {box && naturalSize && (
                  <div
                    onMouseDown={startDrag('move')}
                    style={{
                      position: 'absolute', cursor: 'move',
                      left: (box.x - unionMinX) * scale, top: (box.y - unionMinY) * scale,
                      width: box.w * scale, height: box.h * scale,
                      border: '2px solid var(--primary)', background: 'rgba(37,99,235,0.15)',
                    }}
                  >
                    <div onMouseDown={startDrag('resize')}
                      style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, background: 'var(--primary)', borderRadius: '50%', cursor: 'nwse-resize' }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={s.previewPane}>
          <p style={s.sectionTitle}>Live Preview</p>
          <div style={s.previewPaneBox}>
            {!selected ? (
              <p style={s.hint}>Pick a body pose first.</p>
            ) : !previewFace ? (
              <p style={s.hint}>Pick a preview face above to see an accurate live preview.</p>
            ) : !box ? (
              <p style={s.hint}>Loading…</p>
            ) : (
              <CharacterPresetRig instance={previewRigInstance} presetOverride={previewRigOverride} headBoxOverride={box} maxW={STAGE_MAX_W} maxH={STAGE_MAX_H} />
            )}
          </div>
          <p style={s.hint}>This is the real character renderer — exactly what you'll get once placed, including any clipping or scaling the box-only view above doesn't show.</p>
        </div>
      </div>

      {selected && boxInherited && (
        <p style={{ ...s.hint, marginTop: 10 }}>
          No placement saved for this pose yet — showing "{boxInherited.from}"'s box as a default, rescaled to this image. Adjust and save to make it this pose's own.
        </p>
      )}
      {selected && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !box}>
            {saving ? 'Saving…' : 'Save Face Placement'}
          </button>
          {msg && <span style={s.hint}>{msg}</span>}
        </div>
      )}
    </div>
  );
}

const s = {
  root: { padding: 28, maxWidth: 1500 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 },
  hint: { fontSize: 12, color: 'var(--mid)' },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  sidebar: { width: 220, flexShrink: 0 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, maxHeight: 500, overflowY: 'auto' },
  thumb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' },
  thumbActive: { borderColor: 'var(--nav-primary)', background: 'var(--nav-light)' },
  thumbLabel: { fontSize: 10, color: 'var(--mid)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', margin: 0 },
  stage: { flex: 1, minWidth: 0, maxWidth: STAGE_MAX_W + 32, display: 'flex', justifyContent: 'center', background: 'var(--primary-light)', borderRadius: 8, padding: 16 },
  previewThumb: { width: 32, height: 32, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' },
  previewRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  previewPane: { flex: 1, minWidth: 0, maxWidth: STAGE_MAX_W + 32 },
  previewPaneBox: {
    width: '100%', height: STAGE_MAX_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--primary-light)', borderRadius: 8, padding: 16, textAlign: 'center', marginBottom: 8,
  },
};
