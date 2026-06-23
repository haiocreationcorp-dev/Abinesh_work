import { useEffect, useRef, useState } from 'react';
import { getAssets, getFacePartAlignment, saveFacePartAlignment } from '../../api/assets.js';

const DEFAULT_BOX_FRAC = { x: 0.3, y: 0.02, w: 0.4, h: 0.22 }; // sensible "near the top" default

// BODY_POSE assets are a single flat image (costume+pose baked together) — there's no
// multi-part canvas here, just one job: mark where the face goes on this specific image
// (facePlacement). Reuses the existing FacePartAlignment mechanism with zero backend
// changes — partType:'head', SHARED_ALIGNMENT_KEY ('__ALL__') since it's one box per
// costume regardless of which face ends up there. Coordinates are saved in the image's
// own natural pixel dimensions, so they're meaningful regardless of preview scaling.
export default function PoseBuilder() {
  const [poses, setPoses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null); // { w, h }
  const [displayWidth, setDisplayWidth] = useState(0);
  const [box, setBox] = useState(null); // { x, y, w, h } in natural-image pixels
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const dragRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    getAssets({ category: 'BODY_POSE' }).then(setPoses).catch(() => setPoses([])).finally(() => setLoading(false));
  }, []);

  const scale = naturalSize && displayWidth ? displayWidth / naturalSize.w : 1;

  const pickPose = async (asset) => {
    setSelected(asset);
    setNaturalSize(null);
    setBox(null);
    setMsg('');
    try {
      const alignment = await getFacePartAlignment(asset.id, '__ALL__', 'head');
      if (alignment) setBox({ x: alignment.x, y: alignment.y, w: alignment.w, h: alignment.h });
    } catch { /* no saved placement yet */ }
  };

  const handleImgLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.target;
    setNaturalSize({ w, h });
    setDisplayWidth(e.target.clientWidth);
    if (!box) setBox({ x: Math.round(w * DEFAULT_BOX_FRAC.x), y: Math.round(h * DEFAULT_BOX_FRAC.y), w: Math.round(w * DEFAULT_BOX_FRAC.w), h: Math.round(h * DEFAULT_BOX_FRAC.h) });
  };

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
            <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
              <img src={selected.filePath} alt={selected.name} onLoad={handleImgLoad}
                style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }} draggable={false} />
              {box && naturalSize && (
                <div
                  onMouseDown={startDrag('move')}
                  style={{
                    position: 'absolute', cursor: 'move',
                    left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale,
                    border: '2px solid #8B5CF6', background: 'rgba(139,92,246,0.15)',
                  }}
                >
                  <div onMouseDown={startDrag('resize')}
                    style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, background: '#8B5CF6', borderRadius: '50%', cursor: 'nwse-resize' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
  root: { padding: 28, maxWidth: 980 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 },
  hint: { fontSize: 12, color: 'var(--mid)' },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  sidebar: { width: 220, flexShrink: 0 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, maxHeight: 500, overflowY: 'auto' },
  thumb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' },
  thumbActive: { borderColor: '#8B5CF6', background: 'var(--primary-light)' },
  thumbLabel: { fontSize: 10, color: 'var(--mid)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', margin: 0 },
  stage: { flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', background: 'var(--primary-light)', borderRadius: 8, padding: 16 },
};
