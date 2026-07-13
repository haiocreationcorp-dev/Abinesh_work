import { useState, useRef, useEffect } from 'react';
import {
  uploadAsset, getAssetCategoryCounts,
  getBackgroundSubcategories, createBackgroundSubcategory, updateBackgroundSubcategory, deleteBackgroundSubcategory,
} from '../../api/assets.js';
import { VIEWS, FACE_PART_TYPES, GENDERS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';
import { useToast } from '../../context/ToastContext.jsx';
import AssetCategorySidebar from './AssetCategorySidebar.jsx';
import { Image, CheckCircle2, Lightbulb, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

const DRAFT_KEY = 'bc_asset_upload_draft';
const IMAGE_EXT_RE = /\.(svg|png|jpe?g|gif|webp)$/i;

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

function IconUploadCloud() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16l-4-4-4 4" /><path d="M12 12v9" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function IconFileAudio() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

// Small enumerable option sets (Part Type, Gender, View, Eye/Mouth Type — all ≤5 options)
// render as a clickable pill row instead of a dropdown; larger sets (Pose Type's 24
// options, the 12 background subcategories) stay dropdowns, where a button grid would
// be unwieldy.
function PillGroup({ label, value, onChange, options, optional }) {
  return (
    <div className="form-group" style={styles.spanTwo}>
      <label>{label}{optional && ' (optional)'}</label>
      <div style={styles.pillRow}>
        {options.map((o) => (
          <button
            key={o.id} type="button"
            onClick={() => onChange(value === o.id ? '' : o.id)}
            style={{ ...styles.pill, ...(value === o.id ? styles.pillActive : {}) }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AssetUploadForm() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', category: 'FACE_PART', tags: '' });
  const [bgSubcategory, setBgSubcategory] = useState('');
  // Per-category structured metadata.
  const [partType, setPartType] = useState('');
  const [view, setView] = useState('');
  const [gender, setGender] = useState('');
  const [eyeType, setEyeType] = useState('');
  const [mouthType, setMouthType] = useState('');
  const [faceFamily, setFaceFamily] = useState('');
  const [costume, setCostume] = useState('');
  const [poseType, setPoseType] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dimensions, setDimensions] = useState(null);
  const [draftStatus, setDraftStatus] = useState('saved'); // 'saved' | 'saving'
  const [counts, setCounts] = useState({});
  // Admin-managed BACKGROUND subcategories (fetched from the server, add/rename/delete-able).
  const [subcats, setSubcats] = useState([]);
  const [addingSubcat, setAddingSubcat] = useState(false);
  const [newSubcatLabel, setNewSubcatLabel] = useState('');
  const [editingSubcatId, setEditingSubcatId] = useState(null);
  const [editingSubcatLabel, setEditingSubcatLabel] = useState('');
  const fileRef = useRef(null);
  const isFirstRender = useRef(true);

  const resetMetadataFields = () => {
    setPartType(''); setView(''); setGender(''); setEyeType(''); setMouthType(''); setFaceFamily(''); setCostume(''); setPoseType('');
  };

  const refreshCounts = () => { getAssetCategoryCounts().then(setCounts).catch(() => {}); };
  useEffect(refreshCounts, []);

  const refreshSubcats = () => { getBackgroundSubcategories().then(setSubcats).catch(() => {}); };
  useEffect(refreshSubcats, []);

  const handleAddSubcat = async () => {
    const label = newSubcatLabel.trim();
    if (!label) return;
    try {
      const created = await createBackgroundSubcategory(label);
      setNewSubcatLabel('');
      setAddingSubcat(false);
      await refreshSubcats();
      setBgSubcategory(created.slug); // auto-select the one just created
    } catch (err) {
      toast?.error(err.response?.data?.error || 'Could not add subcategory');
    }
  };

  const handleRenameSubcat = async (id) => {
    const label = editingSubcatLabel.trim();
    if (!label) return;
    try {
      await updateBackgroundSubcategory(id, label);
      setEditingSubcatId(null);
      setEditingSubcatLabel('');
      refreshSubcats();
    } catch (err) {
      toast?.error(err.response?.data?.error || 'Rename failed');
    }
  };

  const handleDeleteSubcat = async (sc) => {
    // First attempt with no password; the server tells us if assets are attached and a
    // password is required (cascade delete of >9 background assets).
    try {
      const res = await deleteBackgroundSubcategory(sc.id);
      if (bgSubcategory === sc.slug) setBgSubcategory('');
      refreshSubcats();
      refreshCounts();
      toast?.success(res.deletedAssets ? `Deleted "${sc.label}" and ${res.deletedAssets} background(s)` : `Deleted "${sc.label}"`);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.needsPassword) {
        const password = prompt(`"${sc.label}" has ${err.response.data.assetCount} background assets. Deleting it PERMANENTLY deletes all of them.\n\nEnter the bulk-delete password to confirm:`);
        if (!password) return;
        try {
          const res = await deleteBackgroundSubcategory(sc.id, password);
          if (bgSubcategory === sc.slug) setBgSubcategory('');
          refreshSubcats();
          refreshCounts();
          toast?.success(`Deleted "${sc.label}" and ${res.deletedAssets} background(s)`);
        } catch (err2) {
          toast?.error(err2.response?.data?.error || 'Delete failed');
        }
      } else {
        toast?.error(err.response?.data?.error || 'Delete failed');
      }
    }
  };

  // Restore an unsaved draft on first mount (metadata fields only — File objects can't be serialized).
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setForm((f) => ({ ...f, ...draft.form }));
      setBgSubcategory(draft.bgSubcategory || '');
      setPartType(draft.partType || '');
      setView(draft.view || '');
      setGender(draft.gender || '');
      setFaceFamily(draft.faceFamily || '');
      setCostume(draft.costume || '');
      setPoseType(draft.poseType || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      form, bgSubcategory, partType, view, gender, faceFamily, costume, poseType,
    }));
    setDraftStatus('saved');
  };

  // Debounced autosave of the metadata fields whenever they change.
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setDraftStatus('saving');
    const t = setTimeout(flushDraft, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, bgSubcategory, partType, view, gender, faceFamily, costume, poseType]);

  // Live preview (image dimensions/thumbnail) for the selected asset file.
  useEffect(() => {
    if (!file || !IMAGE_EXT_RE.test(file.name)) { setPreviewUrl(null); setDimensions(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    const img = new Image();
    img.onload = () => setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasUnsavedContent = () => !!(file || form.name.trim() || form.tags.trim());

  // Warn on tab close/refresh if there's a picked file or entered text not yet uploaded.
  useEffect(() => {
    const handler = (e) => { if (hasUnsavedContent()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, form.name, form.tags]);

  // Ctrl/Cmd+S forces an immediate draft save instead of waiting for the debounce.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushDraft(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, bgSubcategory, partType, view, gender, faceFamily, costume, poseType]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const handleCancel = () => {
    if (hasUnsavedContent() && !confirm('Discard unsaved changes?')) return;
    setForm((f) => ({ name: '', category: f.category, tags: '' }));
    setBgSubcategory('');
    resetMetadataFields();
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    localStorage.removeItem(DRAFT_KEY);
    setError('');
    setMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select an asset file'); return; }
    setError('');
    setMsg('');
    setLoading(true);

    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('category', form.category);
    const allTags = [bgSubcategory, ...form.tags.split(',').map(t => t.trim())].filter(Boolean).join(',');
    fd.append('tags', allTags);
    if (form.category === 'BACKGROUND' && bgSubcategory) fd.append('bgSubcategory', bgSubcategory);
    if (form.category === 'FACE_PART') {
      if (partType) fd.append('partType', partType);
      if (view) fd.append('view', view);
      if (gender) fd.append('gender', gender);
      if (partType === 'EYES' && eyeType) fd.append('eyeType', eyeType);
      if (partType === 'MOUTH' && mouthType) fd.append('mouthType', mouthType);
    }
    if (form.category === 'FACE_TEMPLATE') {
      if (faceFamily) fd.append('faceFamily', faceFamily);
      if (view) fd.append('view', view);
    }
    if (form.category === 'BODY_POSE') {
      if (costume) fd.append('costume', costume);
      if (poseType) fd.append('poseType', poseType);
      if (view) fd.append('view', view);
    }
    fd.append('file', file);

    try {
      await uploadAsset(fd);
      const successMsg = `"${form.name}" uploaded successfully`;
      setMsg(successMsg);
      toast?.success(successMsg);
      setForm({ name: '', category: form.category, tags: '' });
      setBgSubcategory('');
      resetMetadataFields();
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      localStorage.removeItem(DRAFT_KEY);
      refreshCounts();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Upload failed';
      setError(errMsg);
      toast?.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const showGender = form.category === 'FACE_PART';
  const showView = ['FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE'].includes(form.category);

  const actionButtons = (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={handleCancel}>Cancel</button>
      <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
        {loading ? 'Uploading…' : 'Upload Asset'}
      </button>
    </>
  );

  return (
    <form onSubmit={handleSubmit} style={styles.root}>
      {/* ── Compact page header ── */}
      <div style={styles.headerRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={styles.logoBox}><Image size={20} /></div>
          <div>
            <h2 style={styles.title}>Asset Library</h2>
            <p className="text-sm text-muted">Upload and manage comic assets with metadata.</p>
          </div>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.draftStatus}>
            {draftStatus === 'saving' ? 'Saving…' : (<><CheckCircle2 size={14} color="var(--action-primary)" /> All changes saved</>)}
          </span>
          {actionButtons}
        </div>
      </div>

      <div style={styles.columns}>
        {/* ── LEFT: category sidebar ── */}
        <div style={styles.leftCol}>
          <AssetCategorySidebar
            value={form.category}
            counts={counts}
            onChange={(categoryId) => {
              setForm((f) => ({ ...f, category: categoryId }));
              setBgSubcategory('');
              resetMetadataFields();
            }}
          />
        </div>

        {/* ── CENTER: asset details form ── */}
        <div style={styles.centerCol}>
          <div className="card" style={styles.formCard}>
            <p style={styles.heading}>Asset Details</p>
            <div style={styles.formGrid}>
              {(() => {
                const autoNamed = form.category === 'BACKGROUND' && !!bgSubcategory;
                return (
                  <div className="form-group" style={styles.spanTwo}>
                    <label>Asset Name {autoNamed ? '(auto)' : '*'}</label>
                    <input
                      required={!autoNamed}
                      disabled={autoNamed}
                      className="asset-form-input"
                      value={autoNamed ? '' : form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={autoNamed ? 'Auto-named per subcategory, e.g. A22' : 'e.g. Cartoon Boy Standing'}
                      maxLength={100}
                    />
                    {!autoNamed && <p style={styles.charCount}>{form.name.length}/100</p>}
                  </div>
                );
              })()}
              {showGender && <PillGroup label="Gender" value={gender} onChange={setGender} options={GENDERS} optional />}
              {showView && <PillGroup label="View" value={view} onChange={setView} options={VIEWS} />}

              {form.category === 'BACKGROUND' && (
                <div className="form-group" style={styles.spanTwo}>
                  <label>Subcategory</label>
                  {addingSubcat ? (
                    <div style={styles.subcatAddRow}>
                      <input
                        autoFocus
                        className="asset-form-input"
                        value={newSubcatLabel}
                        onChange={(e) => setNewSubcatLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcat(); } if (e.key === 'Escape') { setAddingSubcat(false); setNewSubcatLabel(''); } }}
                        placeholder="New subcategory name…"
                      />
                      <button type="button" style={styles.iconBtn} title="Add" onClick={handleAddSubcat}><Check size={14} /></button>
                      <button type="button" style={styles.iconBtn} title="Cancel" onClick={() => { setAddingSubcat(false); setNewSubcatLabel(''); }}><X size={14} /></button>
                    </div>
                  ) : (
                    <div style={styles.subcatAddRow}>
                      <select className="asset-form-input" value={bgSubcategory} onChange={(e) => setBgSubcategory(e.target.value)}>
                        <option value="">— None —</option>
                        {subcats.map((s) => <option key={s.id} value={s.slug}>{s.label}</option>)}
                      </select>
                      <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setAddingSubcat(true)}>
                        <Plus size={14} /> New
                      </button>
                    </div>
                  )}
                </div>
              )}

              {form.category === 'FACE_PART' && (
                <>
                  <PillGroup label="Part Type" value={partType} onChange={setPartType} options={FACE_PART_TYPES} />
                  {partType === 'EYES' && <PillGroup label="Eye Type" value={eyeType} onChange={setEyeType} options={EYE_TYPES} optional />}
                  {partType === 'MOUTH' && <PillGroup label="Mouth Type" value={mouthType} onChange={setMouthType} options={MOUTH_TYPES} optional />}
                </>
              )}

              {form.category === 'FACE_TEMPLATE' && (
                <div className="form-group">
                  <label>Face Family</label>
                  <input
                    className="asset-form-input"
                    value={faceFamily}
                    onChange={(e) => setFaceFamily(e.target.value)}
                    placeholder="e.g. Rahul, Teacher"
                  />
                </div>
              )}

              {form.category === 'BODY_POSE' && (
                <>
                  <div className="form-group">
                    <label>Costume</label>
                    <input
                      className="asset-form-input"
                      value={costume}
                      onChange={(e) => setCostume(e.target.value)}
                      placeholder="e.g. Student, Police, Teacher"
                    />
                  </div>
                  <div className="form-group">
                    <label>Pose Type</label>
                    <select className="asset-form-input" value={poseType} onChange={(e) => setPoseType(e.target.value)}>
                      <option value="">— None —</option>
                      {POSE_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div className="form-group" style={styles.spanTwo}>
                <label>Tags (comma separated)</label>
                <input
                  className="asset-form-input"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="e.g. boy, standing, cartoon"
                  maxLength={200}
                />
                <p style={styles.charCount}>{form.tags.length}/200</p>
              </div>
              <div style={styles.tipBox}>
                <Lightbulb size={15} color="var(--nav-primary)" style={{ flexShrink: 0 }} />
                <span><strong>Tip:</strong> Use relevant tags to help find your asset easily.</span>
              </div>
            </div>
          </div>

          {form.category === 'BACKGROUND' && (
            <div className="card" style={styles.formCard}>
              <p style={styles.heading}>Manage Subcategories</p>
              <div style={styles.subcatList}>
                {subcats.length === 0 && <p className="text-sm text-muted" style={{ margin: 0 }}>No subcategories yet.</p>}
                {subcats.map((sc) => (
                  <div key={sc.id} style={styles.subcatRow}>
                    {editingSubcatId === sc.id ? (
                      <>
                        <input
                          autoFocus
                          className="asset-form-input"
                          style={{ flex: 1 }}
                          value={editingSubcatLabel}
                          onChange={(e) => setEditingSubcatLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRenameSubcat(sc.id); } if (e.key === 'Escape') setEditingSubcatId(null); }}
                        />
                        <button type="button" style={styles.iconBtn} title="Save" onClick={() => handleRenameSubcat(sc.id)}><Check size={14} /></button>
                        <button type="button" style={styles.iconBtn} title="Cancel" onClick={() => setEditingSubcatId(null)}><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span style={styles.subcatName}>{sc.label}</span>
                        <button type="button" style={styles.iconBtn} title="Rename" onClick={() => { setEditingSubcatId(sc.id); setEditingSubcatLabel(sc.label); }}><Pencil size={13} /></button>
                        <button type="button" style={{ ...styles.iconBtn, color: '#DC2626' }} title="Delete" onClick={() => handleDeleteSubcat(sc)}><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p style={styles.hintSmall}>Deleting a subcategory permanently deletes every background tagged to it.</p>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          {msg && <p style={styles.success}>{msg}</p>}
        </div>

        {/* ── RIGHT: sticky preview + upload + file info ── */}
        <div style={styles.rightCol}>
          <div className="card" style={styles.previewCard}>
            <p style={styles.heading}>Preview</p>

            {!file ? (
              <div
                className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onClick={() => fileRef.current?.click()}
                style={styles.dropzoneCompact}
              >
                <div style={styles.dropzoneIconWrap}><IconUploadCloud /></div>
                <p style={{ fontWeight: 700, marginTop: 10, fontSize: 14 }}>No file selected</p>
                <p className="text-sm text-muted" style={{ margin: '2px 0 12px' }}>Upload an image to preview</p>
                <button type="button" className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                  Upload File
                </button>
              </div>
            ) : (
              <>
                <div style={styles.previewBox}>
                  {previewUrl ? (
                    <div className="checkered-bg" style={styles.previewCheckeredLg}>
                      <img src={previewUrl} alt="" style={styles.previewImgLg} />
                    </div>
                  ) : (
                    <div style={styles.audioIconWrap}><IconFileAudio /></div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>Replace</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setFile(null)}>Remove</button>
                </div>
              </>
            )}
            <input
              ref={fileRef} type="file" style={{ display: 'none' }}
              accept=".svg,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.m4a"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          <div className="card" style={styles.previewCard}>
            <p style={styles.heading}>File Information</p>
            <InfoRow label="Status" value={file ? 'Ready' : 'No file selected'} />
            <InfoRow label="File type" value={file ? file.name.split('.').pop().toUpperCase() : '—'} />
            <InfoRow label="File size" value={file ? `${(file.size / 1024).toFixed(1)} KB` : '—'} />
            <InfoRow label="Dimensions" value={dimensions ? `${dimensions.width}×${dimensions.height}px` : '—'} />
          </div>
        </div>
      </div>
    </form>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  logoBox: { width: 40, height: 40, borderRadius: 10, background: 'var(--nav-light)', color: 'var(--nav-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: '0 0 2px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10 },
  draftStatus: { fontSize: 12, color: 'var(--mid)', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 },

  columns: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  leftCol: { flex: '1 1 240px', maxWidth: 280, minWidth: 220 },
  centerCol: { flex: '2 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 },
  rightCol: { flex: '1 1 260px', maxWidth: 300, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 20, alignSelf: 'flex-start' },

  formCard: { padding: 18 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px 20px' },
  spanTwo: { gridColumn: '1 / -1' },
  charCount: { fontSize: 11, color: 'var(--mid)', textAlign: 'right', margin: '2px 0 0' },

  pillRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: { flex: '1 1 100px', padding: '9px 14px', textAlign: 'center', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--dark)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  pillActive: { borderColor: 'var(--edit-primary)', background: 'var(--primary-light)', color: 'var(--edit-primary)' },

  subcatAddRow: { display: 'flex', gap: 6, alignItems: 'center' },
  iconBtn: {
    width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: '#fff',
    color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  subcatList: { display: 'flex', flexDirection: 'column', gap: 6 },
  subcatRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' },
  subcatName: { flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--dark)' },
  hintSmall: { fontSize: 11.5, color: 'var(--mid)', margin: '8px 0 0' },

  tipBox: { ...{ gridColumn: '1 / -1' }, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--nav-light)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12.5, color: 'var(--nav-text)' },

  heading: { fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 10px' },
  previewCard: { padding: 16 },
  previewBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: 'var(--light)', borderRadius: 'var(--radius-sm)' },
  previewCheckeredLg: { display: 'inline-block', padding: 4 },
  previewImgLg: { maxWidth: 200, maxHeight: 200, display: 'block', borderRadius: 8 },

  success: { color: 'var(--success)', fontSize: 13, margin: 0 },
  audioIconWrap: {
    width: 64, height: 64, borderRadius: '50%', background: 'var(--nav-light)', color: 'var(--nav-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dropzoneCompact: { padding: '24px 14px', textAlign: 'center' },
  dropzoneIconWrap: {
    width: 52, height: 52, borderRadius: 12, background: 'var(--nav-light)', color: 'var(--nav-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
  },

  infoRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  infoLabel: { color: 'var(--mid)' },
  infoValue: { color: 'var(--dark)', fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' },
};
