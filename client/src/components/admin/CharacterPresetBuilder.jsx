import { useEffect, useState } from 'react';
import { getAssets, getExpressions, getCharacterPresets, createCharacterPreset, deleteCharacterPreset } from '../../api/assets.js';
import { SKIN_PRESETS } from '../../utils/skinPalette.js';

const SKIN_TONE_OPTIONS = Object.values(SKIN_PRESETS);

// A named comic-character identity: which FACE_TEMPLATEs represent it (front and,
// optionally, 3/4) plus its default skin tone / hair color / expression. skinTone is
// validated against the app's existing SKIN_PRESETS ids, not a free-text label, so it
// maps directly onto the real recolor system.
export default function CharacterPresetBuilder() {
  const [frontFaces, setFrontFaces] = useState([]);
  const [threeQuarterFaces, setThreeQuarterFaces] = useState([]);
  const [expressions, setExpressions] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [frontFaceId, setFrontFaceId] = useState('');
  const [threeQuarterFaceId, setThreeQuarterFaceId] = useState('');
  const [skinTone, setSkinTone] = useState(SKIN_TONE_OPTIONS[0]?.id || '');
  const [hairColor, setHairColor] = useState('#3b2412');
  const [irisColor, setIrisColor] = useState('#3b2a1f');
  const [defaultExpressionId, setDefaultExpressionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    setLoading(true);
    Promise.all([
      getAssets({ category: 'FACE_TEMPLATE' }),
      getExpressions(),
      getCharacterPresets(),
    ]).then(([faces, exprs, ps]) => {
      setFrontFaces(faces.filter((f) => f.view === 'FRONT'));
      setThreeQuarterFaces(faces.filter((f) => f.view === 'THREE_QUARTER'));
      setExpressions(exprs);
      setPresets(ps);
    }).finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || !frontFaceId || !skinTone || !hairColor) return;
    setError('');
    setSaving(true);
    try {
      await createCharacterPreset({
        name: name.trim(),
        frontFaceId,
        threeQuarterFaceId: threeQuarterFaceId || null,
        skinTone,
        hairColor,
        irisColor,
        defaultExpressionId: defaultExpressionId || null,
      });
      setName(''); setFrontFaceId(''); setThreeQuarterFaceId(''); setDefaultExpressionId('');
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteCharacterPreset(id);
    refresh();
  };

  const faceName = (id) => [...frontFaces, ...threeQuarterFaces].find((f) => f.id === id)?.name || id;

  return (
    <div className="card" style={s.root}>
      <h3 style={s.heading}>Character Preset Builder</h3>
      <p style={s.sub}>A character identity — which Front/3-4 face templates represent it, plus default skin tone, hair color, and expression.</p>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Character Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul, Inspector" />
        </div>
        <div className="form-group">
          <label>Front Face *</label>
          <select required value={frontFaceId} onChange={(e) => setFrontFaceId(e.target.value)}>
            <option value="">— Choose —</option>
            {frontFaces.map((f) => <option key={f.id} value={f.id}>{f.faceFamily ? `${f.faceFamily} — ${f.name}` : f.name}</option>)}
          </select>
          {frontFaces.length === 0 && <p style={s.hint}>No FACE_TEMPLATE assets with View = Front yet.</p>}
        </div>
        <div className="form-group">
          <label>3/4 Face (optional)</label>
          <select value={threeQuarterFaceId} onChange={(e) => setThreeQuarterFaceId(e.target.value)}>
            <option value="">— None —</option>
            {threeQuarterFaces.map((f) => <option key={f.id} value={f.id}>{f.faceFamily ? `${f.faceFamily} — ${f.name}` : f.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Default Skin Tone *</label>
          <select required value={skinTone} onChange={(e) => setSkinTone(e.target.value)}>
            {SKIN_TONE_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Default Hair Color *</label>
          <input type="color" value={hairColor} onChange={(e) => setHairColor(e.target.value)} style={{ width: 60, height: 36, padding: 0 }} />
        </div>
        <div className="form-group">
          <label>Default Iris Color</label>
          <input type="color" value={irisColor} onChange={(e) => setIrisColor(e.target.value)} style={{ width: 60, height: 36, padding: 0 }} />
        </div>
        <div className="form-group">
          <label>Default Expression (optional)</label>
          <select value={defaultExpressionId} onChange={(e) => setDefaultExpressionId(e.target.value)}>
            <option value="">— None —</option>
            {expressions.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Character Preset'}
        </button>
      </form>

      <h3 style={{ ...s.heading, marginTop: 28 }}>Saved Character Presets ({presets.length})</h3>
      {loading ? (
        <p style={s.hint}>Loading…</p>
      ) : presets.length === 0 ? (
        <p style={s.hint}>None saved yet.</p>
      ) : (
        <div style={s.list}>
          {presets.map((p) => (
            <div key={p.id} style={s.row}>
              <span style={s.rowName}>{p.name}</span>
              <span style={s.rowDetail}>
                {faceName(p.frontFaceId)}{p.threeQuarterFaceId ? ` / ${faceName(p.threeQuarterFaceId)}` : ''} · {SKIN_PRESETS[p.skinTone]?.label || p.skinTone}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  root: { padding: 28, maxWidth: 680 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 },
  hint: { fontSize: 12, color: 'var(--mid)', marginTop: 4 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8 },
  rowName: { fontWeight: 600, fontSize: 13, minWidth: 100 },
  rowDetail: { fontSize: 12, color: 'var(--mid)', flex: 1 },
};
