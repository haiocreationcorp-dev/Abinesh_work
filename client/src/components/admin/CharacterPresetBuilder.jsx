import { useEffect, useMemo, useState } from 'react';
import { getAssets, getExpressions, getCharacterPresets, createCharacterPreset, updateCharacterPreset, deleteCharacterPreset } from '../../api/assets.js';
import { SKIN_PRESETS } from '../../utils/skinPalette.js';
import CharacterPresetRig from '../comic/CharacterPresetRig.jsx';

const SKIN_TONE_OPTIONS = Object.values(SKIN_PRESETS);

// A named comic-character identity: which FACE_TEMPLATEs represent it (front and,
// optionally, 3/4) plus its default skin tone / hair color / expression. skinTone is
// validated against the app's existing SKIN_PRESETS ids, not a free-text label, so it
// maps directly onto the real recolor system.
export default function CharacterPresetBuilder() {
  const [frontFaces, setFrontFaces] = useState([]);
  const [threeQuarterFaces, setThreeQuarterFaces] = useState([]);
  const [expressions, setExpressions] = useState([]);
  const [bodyPoses, setBodyPoses] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [frontFaceId, setFrontFaceId] = useState('');
  const [threeQuarterFaceId, setThreeQuarterFaceId] = useState('');
  const [skinTone, setSkinTone] = useState(SKIN_TONE_OPTIONS[0]?.id || '');
  const [hairColor, setHairColor] = useState('#3b2412');
  const [irisColor, setIrisColor] = useState('#3b2a1f');
  const [defaultExpressionId, setDefaultExpressionId] = useState('');
  const [defaultFaceView, setDefaultFaceView] = useState('');
  const [defaultBodyPoseId, setDefaultBodyPoseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      getAssets({ category: 'FACE_TEMPLATE' }),
      getExpressions(),
      getAssets({ category: 'BODY_POSE' }),
      getCharacterPresets(),
    ]).then(([faces, exprs, poses, ps]) => {
      setFrontFaces(faces.filter((f) => f.view === 'FRONT'));
      setThreeQuarterFaces(faces.filter((f) => f.view === 'THREE_QUARTER'));
      setExpressions(exprs);
      setBodyPoses(poses);
      setPresets(ps);
    }).finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  // Which face acts as the fallback when a body pose's own view has no face assigned.
  // Auto-resolves when only one face is picked; needs an explicit choice when both are.
  useEffect(() => {
    if (frontFaceId && threeQuarterFaceId) return; // ambiguous — admin must pick below
    if (frontFaceId) setDefaultFaceView('FRONT');
    else if (threeQuarterFaceId) setDefaultFaceView('THREE_QUARTER');
    else setDefaultFaceView('');
  }, [frontFaceId, threeQuarterFaceId]);

  const needsExplicitDefaultView = !!frontFaceId && !!threeQuarterFaceId;

  const resetForm = () => {
    setName(''); setFrontFaceId(''); setThreeQuarterFaceId(''); setDefaultFaceView('');
    setSkinTone(SKIN_TONE_OPTIONS[0]?.id || ''); setHairColor('#3b2412'); setIrisColor('#3b2a1f');
    setDefaultExpressionId(''); setDefaultBodyPoseId(''); setEditingId(null); setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || (!frontFaceId && !threeQuarterFaceId) || !skinTone || !hairColor) return;
    if (needsExplicitDefaultView && !defaultFaceView) {
      setError('Both faces are set — pick which one is the default.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        frontFaceId: frontFaceId || null,
        threeQuarterFaceId: threeQuarterFaceId || null,
        defaultFaceView: defaultFaceView || null,
        skinTone,
        hairColor,
        irisColor,
        defaultExpressionId: defaultExpressionId || null,
        defaultBodyPoseId: defaultBodyPoseId || null,
      };
      if (editingId) await updateCharacterPreset(editingId, payload);
      else await createCharacterPreset(payload);
      resetForm();
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Loads an existing preset's values into the form above so it can be edited in place —
  // same form/preview used for creating, just submits an update instead of a new preset.
  const handleEdit = (p) => {
    setEditingId(p.id);
    setName(p.name);
    setFrontFaceId(p.frontFaceId || '');
    setThreeQuarterFaceId(p.threeQuarterFaceId || '');
    setDefaultFaceView(p.defaultFaceView || '');
    setSkinTone(p.skinTone);
    setHairColor(p.hairColor);
    setIrisColor(p.irisColor || '#3b2a1f');
    setDefaultExpressionId(p.defaultExpressionId || '');
    setDefaultBodyPoseId(p.defaultBodyPoseId || '');
    setError('');
  };

  const handleDelete = async (id) => {
    await deleteCharacterPreset(id);
    if (editingId === id) resetForm();
    refresh();
  };

  const faceName = (id) => [...frontFaces, ...threeQuarterFaces].find((f) => f.id === id)?.name || id;

  // Live preview — reuses the exact same component that renders characters in the real
  // comic (CharacterPresetRig), fed with the current (not-yet-saved) form values instead
  // of a saved preset id, so what you see while picking options is exactly what the
  // character will actually look like once placed.
  const previewOverride = useMemo(() => ({
    id: 'draft', frontFaceId: frontFaceId || null, threeQuarterFaceId: threeQuarterFaceId || null,
    defaultFaceView: defaultFaceView || null,
    skinTone, hairColor, irisColor, defaultExpressionId: defaultExpressionId || null,
  }), [frontFaceId, threeQuarterFaceId, defaultFaceView, skinTone, hairColor, irisColor, defaultExpressionId]);
  const previewInstance = useMemo(() => ({ presetId: 'draft', bodyPoseId: defaultBodyPoseId }), [defaultBodyPoseId]);

  return (
    <div className="card" style={s.root}>
      <h3 style={s.heading}>{editingId ? `Editing "${name}"` : 'Character Preset Builder'}</h3>
      <p style={s.sub}>A character identity — which Front/3-4 face templates represent it, plus default skin tone, hair color, and expression.</p>

      <div style={s.builderRow}>
      <form onSubmit={handleSave} style={s.form}>
        <div className="form-group">
          <label>Character Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul, Inspector" />
        </div>
        <div className="form-group">
          <label>Front Face (optional)</label>
          <select value={frontFaceId} onChange={(e) => setFrontFaceId(e.target.value)}>
            <option value="">— None —</option>
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
          <p style={s.hint}>At least one of Front / 3-4 Face is required.</p>
        </div>
        {needsExplicitDefaultView && (
          <div className="form-group">
            <label>Default View *</label>
            <select required value={defaultFaceView} onChange={(e) => setDefaultFaceView(e.target.value)}>
              <option value="">— Choose —</option>
              <option value="FRONT">Front</option>
              <option value="THREE_QUARTER">3/4</option>
            </select>
            <p style={s.hint}>Used when a body pose's own view (Front/3-4) has no matching face assigned.</p>
          </div>
        )}
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
        <div className="form-group">
          <label>Default Costume + Pose (optional)</label>
          <select value={defaultBodyPoseId} onChange={(e) => setDefaultBodyPoseId(e.target.value)}>
            <option value="">— None —</option>
            {bodyPoses.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p style={s.hint}>Used automatically the first time this character is placed in a panel, instead of asking — still changeable per-placement afterward via Outfit/Pose.</p>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update Character Preset' : 'Save Character Preset'}
          </button>
          {editingId && (
            <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel</button>
          )}
        </div>
      </form>

      <div style={s.previewCol}>
        <p style={s.previewLabel}>Live Preview</p>
        <div style={s.previewBox}>
          {(frontFaceId || threeQuarterFaceId) && defaultBodyPoseId ? (
            <CharacterPresetRig instance={previewInstance} presetOverride={previewOverride} maxW={220} maxH={360} />
          ) : (
            <p style={s.hint}>Pick a Front or 3/4 Face and a Default Costume + Pose to see a preview.</p>
          )}
        </div>
      </div>
      </div>

      <h3 style={{ ...s.heading, marginTop: 28 }}>Saved Character Presets ({presets.length})</h3>
      {loading ? (
        <p style={s.hint}>Loading…</p>
      ) : presets.length === 0 ? (
        <p style={s.hint}>None saved yet.</p>
      ) : (
        <div style={s.list}>
          {presets.map((p) => (
            <div key={p.id} style={{ ...s.row, ...(editingId === p.id ? s.rowEditing : {}) }}>
              <span style={s.rowName}>{p.name}</span>
              <span style={s.rowDetail}>
                {[p.frontFaceId && `Front: ${faceName(p.frontFaceId)}`, p.threeQuarterFaceId && `3/4: ${faceName(p.threeQuarterFaceId)}`].filter(Boolean).join(' / ')}
                {p.defaultFaceView && p.frontFaceId && p.threeQuarterFaceId ? ` (default: ${p.defaultFaceView === 'FRONT' ? 'Front' : '3/4'})` : ''}
                {' · '}{SKIN_PRESETS[p.skinTone]?.label || p.skinTone}
                {p.defaultBodyPoseId ? ` · ${bodyPoses.find((bp) => bp.id === p.defaultBodyPoseId)?.name || 'pose'}` : ''}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => handleEdit(p)}>Edit</button>
              <button className="btn btn-outline btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  root: { padding: 28, maxWidth: 980 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 },
  hint: { fontSize: 12, color: 'var(--mid)', marginTop: 4 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8 },
  rowEditing: { outline: '2px solid #8B5CF6', outlineOffset: -2 },
  rowName: { fontWeight: 600, fontSize: 13, minWidth: 100 },
  rowDetail: { fontSize: 12, color: 'var(--mid)', flex: 1 },
  builderRow: { display: 'flex', gap: 24, alignItems: 'flex-start' },
  form: { flex: 1, minWidth: 0, maxWidth: 420 },
  previewCol: { flexShrink: 0, position: 'sticky', top: 16 },
  previewLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 8 },
  previewBox: {
    width: 220, height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--primary-light)', borderRadius: 10, padding: 12, textAlign: 'center',
  },
};
