import { useEffect, useState } from 'react';
import { getAssets, getExpressions, createExpression, deleteExpression } from '../../api/assets.js';
import { EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';

// A reusable eye+mouth combo (e.g. "happy", "angry") that can be swapped onto any
// FACE_TEMPLATE. Position on a given face comes from the existing FacePartAlignment
// mechanism (same shared-key lookup any eye/mouth FACE_PART already uses) — this tool
// only records which two FACE_PART assets make up the look, no canvas needed.
export default function ExpressionBuilder() {
  const [eyeParts, setEyeParts] = useState([]);
  const [mouthParts, setMouthParts] = useState([]);
  const [expressions, setExpressions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [eyeAssetId, setEyeAssetId] = useState('');
  const [eyeTypeFilter, setEyeTypeFilter] = useState('');
  const [mouthTypeFilter, setMouthTypeFilter] = useState('');
  const [mouthAssetId, setMouthAssetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    setLoading(true);
    Promise.all([
      getAssets({ category: 'FACE_PART' }),
      getExpressions(),
    ]).then(([parts, exprs]) => {
      setEyeParts(parts.filter((p) => p.partType === 'EYES'));
      setMouthParts(parts.filter((p) => p.partType === 'MOUTH'));
      setExpressions(exprs);
    }).finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || !eyeAssetId || !mouthAssetId) return;
    setError('');
    setSaving(true);
    try {
      await createExpression({ name: name.trim(), eyeAssetId, mouthAssetId });
      setName(''); setEyeAssetId(''); setMouthAssetId('');
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteExpression(id);
    refresh();
  };

  const assetName = (list, id) => {
    const a = list.find((x) => x.id === id);
    if (!a) return null;
    return a.view ? `${a.name} (${a.view === 'THREE_QUARTER' ? '3/4' : 'Front'})` : a.name;
  };

  return (
    <div className="card" style={s.root}>
      <h3 style={s.heading}>Expression Builder</h3>
      <p style={s.sub}>An expression is just an eye + mouth pairing — pick from FACE_PART assets tagged Eyes/Mouth.</p>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Happy, Angry" />
        </div>
        <div className="form-group">
          <label>Eye Type (filter, optional)</label>
          <select value={eyeTypeFilter} onChange={(e) => setEyeTypeFilter(e.target.value)}>
            <option value="">— All Types —</option>
            {EYE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Eyes *</label>
          <select required value={eyeAssetId} onChange={(e) => setEyeAssetId(e.target.value)}>
            <option value="">— Choose —</option>
            {eyeParts.filter((p) => !eyeTypeFilter || p.eyeType === eyeTypeFilter).map((p) => <option key={p.id} value={p.id}>{p.name}{p.view ? ` (${p.view === 'THREE_QUARTER' ? '3/4' : 'Front'})` : ''}</option>)}
          </select>
          {eyeParts.length === 0 && <p style={s.hint}>No FACE_PART assets tagged Part Type "Eyes + Eyebrows" yet.</p>}
        </div>
        <div className="form-group">
          <label>Mouth Type (filter, optional)</label>
          <select value={mouthTypeFilter} onChange={(e) => setMouthTypeFilter(e.target.value)}>
            <option value="">— All Types —</option>
            {MOUTH_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Mouth *</label>
          <select required value={mouthAssetId} onChange={(e) => setMouthAssetId(e.target.value)}>
            <option value="">— Choose —</option>
            {mouthParts.filter((p) => !mouthTypeFilter || p.mouthType === mouthTypeFilter).map((p) => <option key={p.id} value={p.id}>{p.name}{p.view ? ` (${p.view === 'THREE_QUARTER' ? '3/4' : 'Front'})` : ''}</option>)}
          </select>
          {mouthParts.length === 0 && <p style={s.hint}>No FACE_PART assets tagged Part Type "Mouth" yet.</p>}
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Expression'}
        </button>
      </form>

      <h3 style={{ ...s.heading, marginTop: 28 }}>Saved Expressions ({expressions.length})</h3>
      {loading ? (
        <p style={s.hint}>Loading…</p>
      ) : expressions.length === 0 ? (
        <p style={s.hint}>None saved yet.</p>
      ) : (
        <div style={s.list}>
          {expressions.map((ex) => (
            <div key={ex.id} style={s.row}>
              <span style={s.rowName}>{ex.name}</span>
              <span style={s.rowDetail}>{assetName(eyeParts, ex.eyeAssetId) || ex.eyeAssetId} + {assetName(mouthParts, ex.mouthAssetId) || ex.mouthAssetId}</span>
              <button className="btn btn-outline btn-sm" onClick={() => handleDelete(ex.id)}>Delete</button>
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
