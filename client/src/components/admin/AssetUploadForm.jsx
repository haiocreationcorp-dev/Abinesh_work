import { useState, useRef, useEffect } from 'react';
import { uploadAsset, getAssetCategoryCounts } from '../../api/assets.js';
import { BG_SUBCATEGORIES, VIEWS, FACE_PART_TYPES, GENDERS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';
import { useToast } from '../../context/ToastContext.jsx';
import AssetCategorySidebar from './AssetCategorySidebar.jsx';

const DRAFT_KEY = 'bc_asset_upload_draft';
const IMAGE_EXT_RE = /\.(svg|png|jpe?g|gif|webp)$/i;

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'properties', label: 'Properties' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'upload', label: 'Upload' },
  { id: 'history', label: 'History' },
];

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

function IconUploadCloud() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function EmptyTabState({ text }) {
  return (
    <div style={styles.emptyTab}>
      <p className="text-sm text-muted">{text}</p>
      <p className="text-sm text-muted" style={{ marginTop: 2 }}>Coming soon.</p>
    </div>
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
  const [thumbnail, setThumbnail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dimensions, setDimensions] = useState(null);
  const [draftStatus, setDraftStatus] = useState('saved'); // 'saved' | 'saving'
  const [activeTab, setActiveTab] = useState('general');
  const [counts, setCounts] = useState({});
  const fileRef = useRef(null);
  const thumbRef = useRef(null);
  const isFirstRender = useRef(true);

  const resetMetadataFields = () => {
    setPartType(''); setView(''); setGender(''); setEyeType(''); setMouthType(''); setFaceFamily(''); setCostume(''); setPoseType('');
  };

  const refreshCounts = () => { getAssetCategoryCounts().then(setCounts).catch(() => {}); };
  useEffect(refreshCounts, []);

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
    setThumbnail(null);
    if (fileRef.current) fileRef.current.value = '';
    if (thumbRef.current) thumbRef.current.value = '';
    localStorage.removeItem(DRAFT_KEY);
    setError('');
    setMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select an asset file'); setActiveTab('upload'); return; }
    setError('');
    setMsg('');
    setLoading(true);

    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('category', form.category);
    const allTags = [bgSubcategory, ...form.tags.split(',').map(t => t.trim())].filter(Boolean).join(',');
    fd.append('tags', allTags);
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
    if (thumbnail) fd.append('thumbnail', thumbnail);

    try {
      await uploadAsset(fd);
      const successMsg = `"${form.name}" uploaded successfully`;
      setMsg(successMsg);
      toast?.success(successMsg);
      setForm({ name: '', category: form.category, tags: '' });
      setBgSubcategory('');
      resetMetadataFields();
      setFile(null);
      setThumbnail(null);
      if (fileRef.current) fileRef.current.value = '';
      if (thumbRef.current) thumbRef.current.value = '';
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
  const hasProperties = ['FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE', 'BACKGROUND'].includes(form.category);

  const actionButtons = (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={handleCancel}>Cancel</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={flushDraft}>Save Draft</button>
      <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
        {loading ? 'Uploading…' : 'Upload Asset'}
      </button>
    </>
  );

  return (
    <form onSubmit={handleSubmit} style={styles.root}>
      {/* ── Compact page header ── */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Asset Library</h2>
          <p className="text-sm text-muted">Upload and manage comic assets with metadata.</p>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.draftStatus}>{draftStatus === 'saving' ? 'Saving…' : 'All changes saved'}</span>
          {actionButtons}
        </div>
      </div>

      {/* Hidden file inputs — always mounted so the right panel's buttons can trigger them
          regardless of which center tab is active. */}
      <input
        ref={fileRef} type="file" style={{ display: 'none' }}
        accept=".svg,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.m4a"
        onChange={(e) => setFile(e.target.files[0])}
      />
      <input
        ref={thumbRef} type="file" style={{ display: 'none' }}
        accept=".svg,.png,.jpg,.jpeg,.webp"
        onChange={(e) => setThumbnail(e.target.files[0])}
      />

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

        {/* ── CENTER: tabbed editor ── */}
        <div style={styles.centerCol}>
          <div className="card" style={styles.tabCard}>
            <div style={styles.tabStrip}>
              {TABS.map((t) => (
                <button
                  key={t.id} type="button"
                  className={`btn btn-sm ${activeTab === t.id ? 'btn-nav-active' : 'btn-ghost'}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={styles.tabBody}>
              {activeTab === 'general' && (
                <div style={styles.formGrid}>
                  <div className="form-group" style={styles.spanTwo}>
                    <label>Asset Name *</label>
                    <input
                      required
                      className="asset-form-input"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Cartoon Boy Standing"
                    />
                  </div>
                  {showGender && (
                    <div className="form-group">
                      <label>Gender (optional)</label>
                      <select className="asset-form-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                        <option value="">— None —</option>
                        {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                      </select>
                    </div>
                  )}
                  {showView && (
                    <div className="form-group">
                      <label>View</label>
                      <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                        <option value="">— None —</option>
                        {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="form-group" style={styles.spanTwo}>
                    <label>Tags (comma separated)</label>
                    <input
                      className="asset-form-input"
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="e.g. boy, standing, cartoon"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'properties' && (
                !hasProperties ? (
                  <EmptyTabState text="No additional properties for this category." />
                ) : (
                  <div style={styles.formGrid}>
                    {form.category === 'BACKGROUND' && (
                      <div className="form-group">
                        <label>Subcategory</label>
                        <select className="asset-form-input" value={bgSubcategory} onChange={(e) => setBgSubcategory(e.target.value)}>
                          <option value="">— None —</option>
                          {BG_SUBCATEGORIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                    )}

                    {form.category === 'FACE_PART' && (
                      <>
                        <div className="form-group">
                          <label>Part Type</label>
                          <select className="asset-form-input" value={partType} onChange={(e) => setPartType(e.target.value)}>
                            <option value="">— None —</option>
                            {FACE_PART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        {partType === 'EYES' && (
                          <div className="form-group">
                            <label>Eye Type (optional)</label>
                            <select className="asset-form-input" value={eyeType} onChange={(e) => setEyeType(e.target.value)}>
                              <option value="">— None —</option>
                              {EYE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                          </div>
                        )}
                        {partType === 'MOUTH' && (
                          <div className="form-group">
                            <label>Mouth Type (optional)</label>
                            <select className="asset-form-input" value={mouthType} onChange={(e) => setMouthType(e.target.value)}>
                              <option value="">— None —</option>
                              {MOUTH_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                          </div>
                        )}
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
                  </div>
                )
              )}

              {activeTab === 'relationships' && (
                <EmptyTabState text="Parent/child assets and linked expressions or animations will appear here." />
              )}

              {activeTab === 'upload' && (
                <div>
                  <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
                    SVG, PNG, JPG, GIF, WebP, MP3, WAV, OGG — max 10MB
                  </p>
                  <div
                    className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onClick={() => !file && fileRef.current?.click()}
                    style={styles.dropzoneCompact}
                  >
                    {!file ? (
                      <>
                        <div style={{ color: 'var(--nav-primary)' }}><IconUploadCloud /></div>
                        <p style={{ fontWeight: 700, marginTop: 10 }}>Drag & drop or click to browse</p>
                        <p className="text-sm text-muted">Drop your asset file here</p>
                      </>
                    ) : (
                      <div onClick={(e) => e.stopPropagation()} style={styles.previewWrap}>
                        {previewUrl ? (
                          <div className="checkered-bg" style={styles.previewCheckered}>
                            <img src={previewUrl} alt="" style={styles.previewImg} />
                          </div>
                        ) : (
                          <div style={styles.audioIconWrap}><IconFileAudio /></div>
                        )}
                        <div style={{ fontWeight: 700 }}>{file.name}</div>
                        <div className="text-sm text-muted">
                          {(file.size / 1024).toFixed(1)} KB
                          {dimensions && ` · ${dimensions.width}×${dimensions.height}px`}
                          {' · '}{file.name.split('.').pop().toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Replace</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setFile(null)}>Remove</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ marginTop: 18 }}>
                    <label>Thumbnail (optional — shown in library grid)</label>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => thumbRef.current?.click()}>
                      {thumbnail ? thumbnail.name : 'Choose thumbnail file…'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <EmptyTabState text="Created / modified / published / restored events will appear here." />
              )}
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
          {msg && <p style={styles.success}>{msg}</p>}
        </div>

        {/* ── RIGHT: sticky preview + file info ── */}
        <div style={styles.rightCol}>
          <div className="card" style={styles.previewCard}>
            <p style={styles.heading}>Preview</p>
            <div style={styles.previewBox}>
              {previewUrl ? (
                <div className="checkered-bg" style={styles.previewCheckeredLg}>
                  <img src={previewUrl} alt="" style={styles.previewImgLg} />
                </div>
              ) : file ? (
                <div style={styles.audioIconWrap}><IconFileAudio /></div>
              ) : (
                <p className="text-sm text-muted" style={{ textAlign: 'center' }}>No file selected</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
                {file ? 'Replace' : 'Upload'}
              </button>
              {file && <button type="button" className="btn btn-danger btn-sm" onClick={() => setFile(null)}>Remove</button>}
            </div>
          </div>

          <div className="card" style={styles.previewCard}>
            <p style={styles.heading}>File Information</p>
            {file ? (
              <div>
                <InfoRow label="File Name" value={file.name} />
                <InfoRow label="Dimensions" value={dimensions ? `${dimensions.width}×${dimensions.height}px` : '—'} />
                <InfoRow label="Format" value={file.name.split('.').pop().toUpperCase()} />
                <InfoRow label="File Size" value={`${(file.size / 1024).toFixed(1)} KB`} />
              </div>
            ) : (
              <p className="text-sm text-muted">No file selected yet.</p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: '0 0 2px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10 },
  draftStatus: { fontSize: 12, color: 'var(--mid)', fontWeight: 600, whiteSpace: 'nowrap' },

  columns: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  leftCol: { flex: '1 1 240px', maxWidth: 280, minWidth: 220 },
  centerCol: { flex: '2 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 },
  rightCol: { flex: '1 1 260px', maxWidth: 300, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 20, alignSelf: 'flex-start' },

  tabCard: { padding: 18 },
  tabStrip: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 14 },
  tabBody: { minHeight: 260 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px 20px' },
  spanTwo: { gridColumn: '1 / -1' },

  emptyTab: { textAlign: 'center', padding: '40px 0', color: 'var(--mid)' },

  heading: { fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 10px' },
  previewCard: { padding: 16 },
  previewBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: 'var(--light)', borderRadius: 'var(--radius-sm)' },
  previewCheckeredLg: { display: 'inline-block', padding: 4 },
  previewImgLg: { maxWidth: 200, maxHeight: 200, display: 'block', borderRadius: 8 },

  success: { color: 'var(--success)', fontSize: 13, margin: 0 },
  previewWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  previewCheckered: { display: 'inline-block', padding: 4 },
  previewImg: { maxWidth: 140, maxHeight: 140, display: 'block', borderRadius: 8 },
  audioIconWrap: {
    width: 64, height: 64, borderRadius: '50%', background: 'var(--nav-light)', color: 'var(--nav-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dropzoneCompact: { padding: '28px 20px' },

  infoRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  infoLabel: { color: 'var(--mid)' },
  infoValue: { color: 'var(--dark)', fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' },
};
