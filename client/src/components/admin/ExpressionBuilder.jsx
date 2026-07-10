import { useEffect, useMemo, useState } from 'react';
import { getAssets, getExpressions, createExpression, deleteExpression } from '../../api/assets.js';
import { EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';
import { Copy, Trash2, Plus, RotateCcw, ImageOff } from 'lucide-react';

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
  const [mouthAssetId, setMouthAssetId] = useState('');
  const [eyeTypeFilter, setEyeTypeFilter] = useState('');
  const [mouthTypeFilter, setMouthTypeFilter] = useState('');
  const [libSearch, setLibSearch] = useState('');
  const [savedSearch, setSavedSearch] = useState('');
  const [savedSort, setSavedSort] = useState('newest');
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

  const resetBuilder = () => {
    setName(''); setEyeAssetId(''); setMouthAssetId(''); setError('');
  };

  const handleSave = async () => {
    if (!name.trim() || !eyeAssetId || !mouthAssetId) return;
    setError('');
    setSaving(true);
    try {
      await createExpression({ name: name.trim(), eyeAssetId, mouthAssetId });
      resetBuilder();
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

  // Loads a saved expression's values into the builder so it can be tweaked and saved
  // as a new entry — there's no update-in-place endpoint, so this is a duplicate, not
  // a true edit of the original (which is why it's labeled "Duplicate," not "Edit").
  const handleDuplicate = (ex) => {
    setName(`${ex.name} Copy`);
    setEyeAssetId(ex.eyeAssetId);
    setMouthAssetId(ex.mouthAssetId);
    setError('');
  };

  const eyeAsset = eyeParts.find((p) => p.id === eyeAssetId);
  const mouthAsset = mouthParts.find((p) => p.id === mouthAssetId);

  const filteredEyes = useMemo(() => eyeParts.filter((p) =>
    (!eyeTypeFilter || p.eyeType === eyeTypeFilter) &&
    (!libSearch.trim() || p.name.toLowerCase().includes(libSearch.toLowerCase()))
  ), [eyeParts, eyeTypeFilter, libSearch]);

  const filteredMouths = useMemo(() => mouthParts.filter((p) =>
    (!mouthTypeFilter || p.mouthType === mouthTypeFilter) &&
    (!libSearch.trim() || p.name.toLowerCase().includes(libSearch.toLowerCase()))
  ), [mouthParts, mouthTypeFilter, libSearch]);

  const viewLabel = (a) => a?.view === 'THREE_QUARTER' ? '3/4' : a?.view === 'FRONT' ? 'Front' : null;

  const filteredSaved = useMemo(() => {
    let list = expressions.filter((ex) => !savedSearch.trim() || ex.name.toLowerCase().includes(savedSearch.toLowerCase()));
    list = [...list].sort((a, b) => savedSort === 'name'
      ? a.name.localeCompare(b.name)
      : new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }, [expressions, savedSearch, savedSort]);

  const assetLookup = (list, id) => list.find((x) => x.id === id);

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Expression Library</h2>
          <p className="text-sm text-muted">Create reusable eye and mouth expression combinations.</p>
        </div>
        <div style={styles.headerActions}>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetBuilder}>
            <RotateCcw size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Reset
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !name.trim() || !eyeAssetId || !mouthAssetId}>
            <Plus size={13} style={{ marginRight: 5, verticalAlign: -2 }} />{saving ? 'Saving…' : 'Save Expression'}
          </button>
        </div>
      </div>

      <div style={styles.columns}>
        {/* LEFT: Expression Components */}
        <div className="card" style={styles.sideCard}>
          <p style={styles.heading}>Expression Components</p>
          <input className="asset-form-input" placeholder="Search…" value={libSearch} onChange={(e) => setLibSearch(e.target.value)} style={{ fontSize: 12, marginBottom: 8 }} />

          <div style={styles.filterRow}>
            <select className="asset-form-input" value={eyeTypeFilter} onChange={(e) => setEyeTypeFilter(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">All Eye Types</option>
              {EYE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="asset-form-input" value={mouthTypeFilter} onChange={(e) => setMouthTypeFilter(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">All Mouth Types</option>
              {MOUTH_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <p style={styles.subheading}>Eyes Library <span style={styles.count}>({filteredEyes.length})</span></p>
          {loading ? (
            <p style={styles.hint}>Loading…</p>
          ) : filteredEyes.length === 0 ? (
            <p style={styles.hint}>No eye assets found.</p>
          ) : (
            <div style={styles.assetGrid}>
              {filteredEyes.map((a) => (
                <button key={a.id} title={a.name} onClick={() => setEyeAssetId(a.id)}
                  style={{ ...styles.assetCard, ...(eyeAssetId === a.id ? styles.assetCardActive : {}) }}>
                  <img src={a.filePath} alt="" style={styles.assetImg} />
                  <span style={styles.assetLabel}>{a.name}</span>
                  {viewLabel(a) && <span style={styles.assetView}>{viewLabel(a)}</span>}
                </button>
              ))}
            </div>
          )}

          <p style={styles.subheading}>Mouth Library <span style={styles.count}>({filteredMouths.length})</span></p>
          {loading ? (
            <p style={styles.hint}>Loading…</p>
          ) : filteredMouths.length === 0 ? (
            <p style={styles.hint}>No mouth assets found.</p>
          ) : (
            <div style={styles.assetGrid}>
              {filteredMouths.map((a) => (
                <button key={a.id} title={a.name} onClick={() => setMouthAssetId(a.id)}
                  style={{ ...styles.assetCard, ...(mouthAssetId === a.id ? styles.assetCardActive : {}) }}>
                  <img src={a.filePath} alt="" style={styles.assetImg} />
                  <span style={styles.assetLabel}>{a.name}</span>
                  {viewLabel(a) && <span style={styles.assetView}>{viewLabel(a)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CENTER: Builder */}
        <div style={styles.centerCol}>
          <div className="card" style={styles.sectionCard}>
            <p style={styles.heading}>Expression Preview</p>
            <div className="checkered-bg" style={styles.previewBox}>
              {eyeAsset || mouthAsset ? (
                <div style={styles.previewFace}>
                  {eyeAsset && <img src={eyeAsset.filePath} alt="" style={styles.previewEyes} />}
                  {mouthAsset && <img src={mouthAsset.filePath} alt="" style={styles.previewMouth} />}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--mid)' }}>
                  <ImageOff size={22} />
                  <p className="text-sm text-muted" style={{ marginTop: 6 }}>Pick eyes and a mouth to preview</p>
                </div>
              )}
            </div>
            <p style={styles.hint}>Approximate placement for a quick look — exact position on a face comes from that face's own alignment.</p>
          </div>

          <div className="card" style={styles.sectionCard}>
            <p style={styles.heading}>Expression Details</p>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Expression Name *</label>
              <input className="asset-form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Happy, Angry" />
            </div>
            <div style={styles.formGrid}>
              <div style={styles.selectedField}>
                <span style={styles.selectedLabel}>Eyes</span>
                <span style={styles.selectedValue}>{eyeAsset ? `${eyeAsset.name}${viewLabel(eyeAsset) ? ` (${viewLabel(eyeAsset)})` : ''}` : 'None selected'}</span>
              </div>
              <div style={styles.selectedField}>
                <span style={styles.selectedLabel}>Mouth</span>
                <span style={styles.selectedValue}>{mouthAsset ? `${mouthAsset.name}${viewLabel(mouthAsset) ? ` (${viewLabel(mouthAsset)})` : ''}` : 'None selected'}</span>
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        </div>

        {/* RIGHT: Saved Expressions */}
        <div className="card" style={styles.sideCard}>
          <p style={styles.heading}>Saved Expressions <span style={styles.count}>({expressions.length})</span></p>
          <div style={styles.filterRow}>
            <input className="asset-form-input" placeholder="Search…" value={savedSearch} onChange={(e) => setSavedSearch(e.target.value)} style={{ fontSize: 12, flex: 2 }} />
            <select className="asset-form-input" value={savedSort} onChange={(e) => setSavedSort(e.target.value)} style={{ fontSize: 11, flex: 1 }}>
              <option value="newest">Newest</option>
              <option value="name">Name</option>
            </select>
          </div>

          {loading ? (
            <p style={styles.hint}>Loading…</p>
          ) : filteredSaved.length === 0 ? (
            <p style={styles.hint}>None saved yet.</p>
          ) : (
            <div style={styles.savedList}>
              {filteredSaved.map((ex) => {
                const exEye = assetLookup(eyeParts, ex.eyeAssetId);
                const exMouth = assetLookup(mouthParts, ex.mouthAssetId);
                return (
                  <div key={ex.id} style={styles.savedCard}>
                    <div className="checkered-bg" style={styles.savedPreview}>
                      {exEye && <img src={exEye.filePath} alt="" style={styles.savedPreviewEyes} />}
                      {exMouth && <img src={exMouth.filePath} alt="" style={styles.savedPreviewMouth} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={styles.savedName}>{ex.name}</p>
                      <p style={styles.savedDetail}>{exEye?.name || '—'} + {exMouth?.name || '—'}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button title="Duplicate into builder" onClick={() => handleDuplicate(ex)} style={styles.iconBtn}><Copy size={13} /></button>
                      <button title="Delete" onClick={() => handleDelete(ex.id)} style={{ ...styles.iconBtn, color: 'var(--danger)' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer status bar */}
      <div className="card" style={styles.statusBar}>
        <span>{expressions.length} expression{expressions.length !== 1 ? 's' : ''} saved</span>
        <span>{eyeAssetId && mouthAssetId && name.trim() ? 'Ready to save' : 'Select eyes, a mouth, and a name to continue'}</span>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: '0 0 2px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10 },

  columns: { display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  sideCard: { flex: '1 1 260px', maxWidth: 300, minWidth: 240, padding: 14, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' },
  centerCol: { flex: '2 1 340px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 },
  sectionCard: { padding: 14 },

  heading: { fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' },
  subheading: { fontSize: 11, fontWeight: 700, color: '#374151', margin: '12px 0 6px' },
  count: { fontWeight: 400, color: '#9CA3AF' },
  hint: { fontSize: 12, color: 'var(--mid)' },

  filterRow: { display: 'flex', gap: 6, marginBottom: 4 },

  assetGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 },
  assetCard: { border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' },
  assetCardActive: { borderColor: 'var(--nav-primary)', boxShadow: '0 0 0 2px var(--nav-light)' },
  assetImg: { width: '100%', height: 56, objectFit: 'contain', display: 'block', background: 'var(--light)' },
  assetLabel: { fontSize: 9, padding: '3px 4px 0', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  assetView: { fontSize: 8, padding: '0 4px 3px', color: 'var(--mid)' },

  previewBox: { position: 'relative', height: 200, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewFace: { position: 'relative', width: 160, height: 160 },
  previewEyes: { position: 'absolute', top: '22%', left: '15%', width: '70%', height: '30%', objectFit: 'contain' },
  previewMouth: { position: 'absolute', top: '62%', left: '30%', width: '40%', height: '22%', objectFit: 'contain' },

  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  selectedField: { background: 'var(--light)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' },
  selectedLabel: { display: 'block', fontSize: 11, color: 'var(--mid)', marginBottom: 2 },
  selectedValue: { fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },

  savedList: { display: 'flex', flexDirection: 'column', gap: 6 },
  savedCard: { display: 'flex', alignItems: 'center', gap: 8, padding: 6, border: '1px solid var(--border)', borderRadius: 8 },
  savedPreview: { position: 'relative', width: 40, height: 40, borderRadius: 6, flexShrink: 0, overflow: 'hidden' },
  savedPreviewEyes: { position: 'absolute', top: '18%', left: '10%', width: '80%', height: '32%', objectFit: 'contain' },
  savedPreviewMouth: { position: 'absolute', top: '60%', left: '28%', width: '44%', height: '24%', objectFit: 'contain' },
  savedName: { fontSize: 12, fontWeight: 700, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  savedDetail: { fontSize: 10, color: 'var(--mid)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mid)', display: 'flex', padding: 2 },

  statusBar: { padding: '8px 14px', display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: 'var(--mid)', flexWrap: 'wrap' },
};
