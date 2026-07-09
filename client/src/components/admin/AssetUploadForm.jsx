import { useState, useRef, useEffect } from 'react';
import { uploadAsset } from '../../api/assets.js';
import { CATEGORY_IDS as CATEGORIES, BG_SUBCATEGORIES, VIEWS, FACE_PART_TYPES, GENDERS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';
import { useToast } from '../../context/ToastContext.jsx';
import AssetCategoryPicker from './AssetCategoryPicker.jsx';

const DRAFT_KEY = 'bc_asset_upload_draft';
const IMAGE_EXT_RE = /\.(svg|png|jpe?g|gif|webp)$/i;

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
  const fileRef = useRef(null);
  const thumbRef = useRef(null);
  const isFirstRender = useRef(true);

  const resetMetadataFields = () => {
    setPartType(''); setView(''); setGender(''); setEyeType(''); setMouthType(''); setFaceFamily(''); setCostume(''); setPoseType('');
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

  // Debounced autosave of the metadata fields whenever they change.
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setDraftStatus('saving');
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        form, bgSubcategory, partType, view, gender, faceFamily, costume, poseType,
      }));
      setDraftStatus('saved');
    }, 500);
    return () => clearTimeout(t);
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

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
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
      const successMsg = `✓ "${form.name}" uploaded successfully`;
      setMsg(successMsg);
      toast?.success(successMsg);
      setForm({ name: '', category: form.category, tags: '' });
      setBgSubcategory('');
      resetMetadataFields();
      setRemoveWhiteBg(false);
      setNormalizeSkin(false);
      setSkinThresholds(DEFAULT_SKIN_THRESHOLDS);
      setFile(null);
      setThumbnail(null);
      if (fileRef.current) fileRef.current.value = '';
      if (thumbRef.current) thumbRef.current.value = '';
      localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Upload failed';
      setError(errMsg);
      toast?.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card" style={styles.card}>
        <div style={styles.cardHeaderRow}>
          <h3 style={styles.heading}>Basic Information</h3>
          <span style={styles.draftStatus}>{draftStatus === 'saving' ? 'Saving…' : 'All changes saved'}</span>
        </div>

        <div className="form-group">
          <label>Asset Name *</label>
          <input
            required
            className="asset-form-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Cartoon Boy Standing"
          />
        </div>

        <div className="form-group">
          <label>Category *</label>
          <AssetCategoryPicker
            value={form.category}
            onChange={(categoryId) => { setForm({ ...form, category: categoryId }); setBgSubcategory(''); resetMetadataFields(); }}
          />
        </div>
      </div>

      <div className="card" style={styles.card}>
        <h3 style={styles.heading}>Metadata</h3>

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
            <div className="form-group">
              <label>View</label>
              <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">— None —</option>
                {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Gender (optional)</label>
              <select className="asset-form-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">— None —</option>
                {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            {partType === 'EYES' && (
              <div className="form-group">
                <label>Eye Type (optional)</label>
                <select value={eyeType} onChange={(e) => setEyeType(e.target.value)}>
                  <option value="">— None —</option>
                  {EYE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            )}
            {partType === 'MOUTH' && (
              <div className="form-group">
                <label>Mouth Type (optional)</label>
                <select value={mouthType} onChange={(e) => setMouthType(e.target.value)}>
                  <option value="">— None —</option>
                  {MOUTH_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        {form.category === 'FACE_TEMPLATE' && (
          <>
            <div className="form-group">
              <label>Face Family</label>
              <input
                className="asset-form-input"
                value={faceFamily}
                onChange={(e) => setFaceFamily(e.target.value)}
                placeholder="e.g. Rahul, Teacher"
              />
            </div>
            <div className="form-group">
              <label>View</label>
              <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">— None —</option>
                {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          </>
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
            <div className="form-group">
              <label>View</label>
              <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">— None —</option>
                {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="form-group">
          <label>Tags (comma separated)</label>
          <input
            className="asset-form-input"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="e.g. boy, standing, cartoon"
          />
        </div>
      </div>

      <div className="card" style={styles.card}>
        <h3 style={styles.heading}>Upload</h3>
        <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
          SVG, PNG, JPG, GIF, WebP, MP3, WAV, OGG — max 10MB
        </p>

        <div
          className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onClick={() => !file && fileRef.current?.click()}
        >
          {!file ? (
            <>
              <div style={{ color: 'var(--primary)' }}><IconUploadCloud /></div>
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
          <input
            ref={fileRef}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.m4a"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
        </div>

        <div className="form-group" style={{ marginTop: 18 }}>
          <label>Thumbnail (optional — shown in library grid)</label>
          <input
            ref={thumbRef}
            type="file"
            className="asset-form-input"
            accept=".svg,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setThumbnail(e.target.files[0])}
          />
        </div>

        {error && <p className="form-error">{error}</p>}
        {msg && <p style={styles.success}>{msg}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading} style={styles.submitBtn}>
          {loading ? 'Uploading…' : 'Upload Asset'}
        </button>
      </div>
    </form>
  );
}

const styles = {
  card: { padding: 28, marginBottom: 20 },
  cardHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 20 },
  draftStatus: { fontSize: 12, color: 'var(--mid)', fontWeight: 600 },
  fileInfo: { fontSize: 12, color: 'var(--mid)', marginTop: 2 },
  success: { color: 'var(--success)', fontSize: 13, marginBottom: 8 },
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--dark)', cursor: 'pointer' },
  checkboxHint: { fontSize: 12, color: 'var(--mid)', marginTop: 6, lineHeight: 1.5 },
  previewWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  previewCheckered: { display: 'inline-block', padding: 4 },
  previewImg: { maxWidth: 160, maxHeight: 160, display: 'block', borderRadius: 8 },
  audioIconWrap: {
    width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: { marginTop: 22, width: '100%', height: 50, borderRadius: 14, fontSize: 15, fontWeight: 700, boxShadow: 'var(--shadow)' },
};
