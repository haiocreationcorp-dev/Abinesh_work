import { useEffect, useMemo, useState } from 'react';
import { getAssets, getExpressions, getCharacterPresets, createCharacterPreset, updateCharacterPreset, deleteCharacterPreset } from '../../api/assets.js';
import { SKIN_PRESETS } from '../../utils/skinPalette.js';
import CharacterPresetRig from '../comic/CharacterPresetRig.jsx';
import { Search, ArrowUpDown, User, Copy, Trash2, Pencil, Plus, ZoomIn, ZoomOut, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';

const SKIN_TONE_OPTIONS = Object.values(SKIN_PRESETS);
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

function formToPayload(f) {
  return {
    name: f.name.trim(),
    frontFaceId: f.frontFaceId || null,
    threeQuarterFaceId: f.threeQuarterFaceId || null,
    defaultFaceView: f.defaultFaceView || null,
    skinTone: f.skinTone,
    hairColor: f.hairColor,
    irisColor: f.irisColor,
    defaultExpressionId: f.defaultExpressionId || null,
    defaultBodyPoseId: f.defaultBodyPoseId || null,
  };
}

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

  // Sidebar library controls.
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'updated'

  // Preview zoom — purely presentational, doesn't touch saved data.
  const [zoom, setZoom] = useState(1);

  // Snapshot of the form as of the last load/save/reset — diffed against current form
  // values to drive the honest "Unsaved changes" indicator (no background autosave exists).
  const [lastSaved, setLastSaved] = useState(null);

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

  const currentForm = useMemo(() => ({
    name, frontFaceId, threeQuarterFaceId, defaultFaceView, skinTone, hairColor, irisColor,
    defaultExpressionId, defaultBodyPoseId,
  }), [name, frontFaceId, threeQuarterFaceId, defaultFaceView, skinTone, hairColor, irisColor, defaultExpressionId, defaultBodyPoseId]);

  const isDirty = lastSaved ? JSON.stringify(currentForm) !== JSON.stringify(lastSaved) : currentForm.name.trim() !== '';

  const resetForm = () => {
    setName(''); setFrontFaceId(''); setThreeQuarterFaceId(''); setDefaultFaceView('');
    setSkinTone(SKIN_TONE_OPTIONS[0]?.id || ''); setHairColor('#3b2412'); setIrisColor('#3b2a1f');
    setDefaultExpressionId(''); setDefaultBodyPoseId(''); setEditingId(null); setError('');
    setLastSaved(null);
    setZoom(1);
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
      const payload = formToPayload(currentForm);
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
    setZoom(1);
    setLastSaved({
      name: p.name, frontFaceId: p.frontFaceId || '', threeQuarterFaceId: p.threeQuarterFaceId || '',
      defaultFaceView: p.defaultFaceView || '', skinTone: p.skinTone, hairColor: p.hairColor,
      irisColor: p.irisColor || '#3b2a1f', defaultExpressionId: p.defaultExpressionId || '',
      defaultBodyPoseId: p.defaultBodyPoseId || '',
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this character preset?')) return;
    await deleteCharacterPreset(id);
    if (editingId === id) resetForm();
    refresh();
  };

  // No server-side duplicate endpoint — clones the preset's real fields and posts them as
  // a brand-new preset via the existing create endpoint, so it's a genuine saved copy.
  const handleDuplicate = async (p) => {
    const payload = {
      name: `${p.name} (Copy)`,
      frontFaceId: p.frontFaceId || null,
      threeQuarterFaceId: p.threeQuarterFaceId || null,
      defaultFaceView: p.defaultFaceView || null,
      skinTone: p.skinTone,
      hairColor: p.hairColor,
      irisColor: p.irisColor || null,
      defaultExpressionId: p.defaultExpressionId || null,
      defaultBodyPoseId: p.defaultBodyPoseId || null,
    };
    await createCharacterPreset(payload);
    refresh();
  };

  const faceName = (id) => [...frontFaces, ...threeQuarterFaces].find((f) => f.id === id)?.name || id;
  const poseName = (id) => bodyPoses.find((bp) => bp.id === id)?.name || '';
  const exprName = (id) => expressions.find((ex) => ex.id === id)?.name || '';

  const visiblePresets = useMemo(() => {
    let list = presets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => (
      sortBy === 'updated'
        ? new Date(b.updatedAt) - new Date(a.updatedAt)
        : a.name.localeCompare(b.name)
    ));
    return list;
  }, [presets, search, sortBy]);

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
  const hasPreview = !!(frontFaceId || threeQuarterFaceId) && !!defaultBodyPoseId;

  const statusDisplay = saving
    ? { icon: <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />, text: 'Saving…', color: 'var(--mid)' }
    : isDirty
      ? { icon: null, text: 'Unsaved changes', color: 'var(--warning, #b45309)' }
      : { icon: <CheckCircle2 size={13} color="var(--action-primary)" />, text: 'Saved', color: 'var(--mid)' };

  return (
    <form onSubmit={handleSave} style={styles.root}>
      {/* ── Header ── */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Character Templates</h2>
          <p className="text-sm text-muted">Create reusable character identities with default appearance and costume settings.</p>
        </div>
        <div style={styles.headerActions}>
          <span style={{ ...styles.statusText, color: statusDisplay.color }}>
            {statusDisplay.icon}{statusDisplay.text}
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetForm}>
            <Plus size={14} /> New
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={!editingId}
            onClick={() => { const p = presets.find((x) => x.id === editingId); if (p) handleDuplicate(p); }}>
            <Copy size={14} /> Duplicate
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save Character'}
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!editingId}
            onClick={() => editingId && handleDelete(editingId)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      <div style={styles.columns}>
        {/* ── LEFT: Character Library ── */}
        <div style={styles.leftCol}>
          <div className="card" style={styles.libraryCard}>
            <p style={styles.heading}>Character Library ({presets.length})</p>
            <div style={styles.libraryControls}>
              <div style={styles.searchWrap}>
                <Search size={13} color="var(--mid)" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search characters…" style={styles.searchInput}
                />
              </div>
              <button type="button" className="btn btn-outline btn-sm" style={styles.sortBtn}
                title="Sort" onClick={() => setSortBy((s) => (s === 'name' ? 'updated' : 'name'))}>
                <ArrowUpDown size={13} /> {sortBy === 'name' ? 'Name' : 'Recent'}
              </button>
            </div>

            <div style={styles.libraryList}>
              {loading ? (
                <p style={styles.hint}>Loading…</p>
              ) : visiblePresets.length === 0 ? (
                <p style={styles.hint}>{presets.length === 0 ? 'No characters saved yet.' : 'No matches.'}</p>
              ) : (
                visiblePresets.map((p) => (
                  <div key={p.id} style={{ ...styles.presetCard, ...(editingId === p.id ? styles.presetCardActive : {}) }}>
                    <div style={styles.presetThumb}>
                      {p.defaultBodyPoseId ? (
                        <CharacterPresetRig instance={{ presetId: p.id, bodyPoseId: p.defaultBodyPoseId }} maxW={54} maxH={84} />
                      ) : (
                        <User size={22} color="var(--nav-primary)" />
                      )}
                    </div>
                    <div style={styles.presetInfo}>
                      <p style={styles.presetName}>{p.name}</p>
                      <p style={styles.presetDetail}>
                        {SKIN_PRESETS[p.skinTone]?.label || p.skinTone}
                        {p.defaultBodyPoseId ? ` · ${poseName(p.defaultBodyPoseId)}` : ''}
                      </p>
                    </div>
                    <div style={styles.presetActions}>
                      <button type="button" style={styles.iconBtn} title="Edit" onClick={() => handleEdit(p)}><Pencil size={13} /></button>
                      <button type="button" style={styles.iconBtn} title="Duplicate" onClick={() => handleDuplicate(p)}><Copy size={13} /></button>
                      <button type="button" style={{ ...styles.iconBtn, color: '#DC2626' }} title="Delete" onClick={() => handleDelete(p.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER: Character Builder ── */}
        <div style={styles.centerCol}>
          <div className="card" style={styles.formCard}>
            <p style={styles.heading}>Character Information</p>
            <div style={styles.formGrid}>
              <div className="form-group" style={{ ...styles.spanTwo, marginBottom: 0 }}>
                <label>Character Name *</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul, Inspector" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Front Face</label>
                <select value={frontFaceId} onChange={(e) => setFrontFaceId(e.target.value)}>
                  <option value="">— None —</option>
                  {frontFaces.map((f) => <option key={f.id} value={f.id}>{f.faceFamily ? `${f.faceFamily} — ${f.name}` : f.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>3/4 Face</label>
                <select value={threeQuarterFaceId} onChange={(e) => setThreeQuarterFaceId(e.target.value)}>
                  <option value="">— None —</option>
                  {threeQuarterFaces.map((f) => <option key={f.id} value={f.id}>{f.faceFamily ? `${f.faceFamily} — ${f.name}` : f.name}</option>)}
                </select>
              </div>
              {needsExplicitDefaultView && (
                <div className="form-group" style={{ ...styles.spanTwo, marginBottom: 0 }}>
                  <label>Default View *</label>
                  <select required value={defaultFaceView} onChange={(e) => setDefaultFaceView(e.target.value)}>
                    <option value="">— Choose —</option>
                    <option value="FRONT">Front</option>
                    <option value="THREE_QUARTER">3/4</option>
                  </select>
                  <p style={styles.hintSmall}>Used when a body pose's own view has no matching face assigned.</p>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Default Expression</label>
                <select value={defaultExpressionId} onChange={(e) => setDefaultExpressionId(e.target.value)}>
                  <option value="">— None —</option>
                  {expressions.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Default Costume + Pose</label>
                <select value={defaultBodyPoseId} onChange={(e) => setDefaultBodyPoseId(e.target.value)}>
                  <option value="">— None —</option>
                  {bodyPoses.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {!frontFaceId && !threeQuarterFaceId && <p style={{ ...styles.hintSmall, ...styles.spanTwo }}>At least one of Front / 3-4 Face is required.</p>}
            </div>
          </div>

          <div className="card" style={styles.formCard}>
            <p style={styles.heading}>Appearance</p>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Skin Tone</label>
              <div style={styles.swatchRow}>
                {SKIN_TONE_OPTIONS.map((t) => (
                  <button
                    key={t.id} type="button" title={t.label}
                    onClick={() => setSkinTone(t.id)}
                    style={{ ...styles.swatch, background: t.base, ...(skinTone === t.id ? styles.swatchActive : {}) }}
                  />
                ))}
              </div>
            </div>
            <div style={styles.formGrid}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Hair Color</label>
                <div style={styles.colorRow}>
                  <input type="color" value={hairColor} onChange={(e) => setHairColor(e.target.value)} style={styles.colorInput} />
                  <span style={styles.colorHex}>{hairColor}</span>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Iris Color</label>
                <div style={styles.colorRow}>
                  <input type="color" value={irisColor} onChange={(e) => setIrisColor(e.target.value)} style={styles.colorInput} />
                  <span style={styles.colorHex}>{irisColor}</span>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
        </div>

        {/* ── RIGHT: Live Preview ── */}
        <div style={styles.rightCol}>
          <div className="card" style={styles.previewCard}>
            <div style={styles.previewHeadRow}>
              <p style={{ ...styles.heading, margin: 0 }}>Character Preview</p>
              <div style={styles.zoomControls}>
                <button type="button" style={styles.iconBtn} title="Zoom out" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}><ZoomOut size={13} /></button>
                <button type="button" style={styles.iconBtn} title="Reset zoom" onClick={() => setZoom(1)}><RotateCcw size={13} /></button>
                <button type="button" style={styles.iconBtn} title="Zoom in" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}><ZoomIn size={13} /></button>
              </div>
            </div>
            <div style={styles.previewBox}>
              {hasPreview ? (
                <div style={{ transform: `scale(${zoom})`, transition: 'transform 120ms ease' }}>
                  <CharacterPresetRig instance={previewInstance} presetOverride={previewOverride} maxW={180} maxH={300} />
                </div>
              ) : (
                <p style={styles.hint}>Pick a Front or 3/4 Face and a Default Costume + Pose to see a preview.</p>
              )}
            </div>
          </div>

          <div className="card" style={styles.previewCard}>
            <p style={styles.heading}>Character Summary</p>
            <div style={styles.summaryList}>
              <SummaryRow label="Front Face" value={frontFaceId ? faceName(frontFaceId) : '—'} />
              <SummaryRow label="3/4 Face" value={threeQuarterFaceId ? faceName(threeQuarterFaceId) : '—'} />
              <SummaryRow label="Expression" value={defaultExpressionId ? exprName(defaultExpressionId) : '—'} />
              <SummaryRow label="Costume + Pose" value={defaultBodyPoseId ? poseName(defaultBodyPoseId) : '—'} />
              <SummaryRow label="Skin Tone" value={SKIN_PRESETS[skinTone]?.label || '—'} swatch={SKIN_PRESETS[skinTone]?.base} />
              <SummaryRow label="Hair Color" value={hairColor} swatch={hairColor} />
              <SummaryRow label="Iris Color" value={irisColor} swatch={irisColor} />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function SummaryRow({ label, value, swatch }) {
  return (
    <div style={styles.summaryRow}>
      <span style={styles.summaryLabel}>{label}</span>
      <span style={styles.summaryValue}>
        {swatch && <span style={{ ...styles.summarySwatch, background: swatch }} />}
        {value}
      </span>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: '0 0 2px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 },

  columns: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  leftCol: { flex: '1 1 260px', maxWidth: 300, minWidth: 240 },
  centerCol: { flex: '2 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 },
  rightCol: { flex: '1 1 260px', maxWidth: 300, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 20, alignSelf: 'flex-start' },

  libraryCard: { padding: 14, position: 'sticky', top: 20 },
  heading: { fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 10px' },
  libraryControls: { display: 'flex', gap: 8, marginBottom: 10 },
  searchWrap: { flex: 1, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', background: '#fff' },
  searchInput: { border: 'none', outline: 'none', fontSize: 12.5, padding: '7px 0', width: '100%', background: 'transparent' },
  sortBtn: { whiteSpace: 'nowrap', flexShrink: 0 },

  libraryList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' },
  hint: { fontSize: 12, color: 'var(--mid)', margin: 0, padding: '8px 2px' },
  hintSmall: { fontSize: 11.5, color: 'var(--mid)', margin: '4px 0 0' },

  presetCard: { display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: '#fff' },
  presetCardActive: { borderColor: 'var(--edit-primary)', background: 'var(--primary-light)' },
  presetThumb: { width: 54, height: 60, borderRadius: 6, background: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  presetInfo: { flex: 1, minWidth: 0 },
  presetName: { fontSize: 13, fontWeight: 700, color: 'var(--dark)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  presetDetail: { fontSize: 11, color: 'var(--mid)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  presetActions: { display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 },
  iconBtn: {
    width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: '#fff',
    color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  formCard: { padding: 18 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 20px' },
  spanTwo: { gridColumn: '1 / -1' },

  swatchRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  swatch: { width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--border)', cursor: 'pointer', padding: 0 },
  swatchActive: { borderColor: 'var(--edit-primary)', boxShadow: '0 0 0 2px var(--primary-light)' },

  colorRow: { display: 'flex', alignItems: 'center', gap: 8 },
  colorInput: { width: 40, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' },
  colorHex: { fontSize: 12, color: 'var(--mid)', fontWeight: 600 },

  previewCard: { padding: 16 },
  previewHeadRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  zoomControls: { display: 'flex', gap: 2 },
  previewBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220,
    background: 'var(--light)', borderRadius: 'var(--radius-sm)', padding: 12, textAlign: 'center',
  },

  summaryList: { display: 'flex', flexDirection: 'column', gap: 0 },
  summaryRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 },
  summaryLabel: { color: 'var(--mid)' },
  summaryValue: { color: 'var(--dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' },
  summarySwatch: { width: 12, height: 12, borderRadius: '50%', border: '1px solid var(--border)', flexShrink: 0 },
};
