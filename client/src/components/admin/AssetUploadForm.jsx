import { useState, useRef } from 'react';
import { uploadAsset } from '../../api/assets.js';
import { CATEGORY_IDS as CATEGORIES, BG_SUBCATEGORIES, VIEWS, FACE_PART_TYPES, GENDERS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';

export default function AssetUploadForm() {
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
  const fileRef = useRef(null);
  const thumbRef = useRef(null);

  const resetMetadataFields = () => {
    setPartType(''); setView(''); setGender(''); setEyeType(''); setMouthType(''); setFaceFamily(''); setCostume(''); setPoseType('');
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
      setMsg(`✓ "${form.name}" uploaded successfully`);
      setForm({ name: '', category: form.category, tags: '' });
      setBgSubcategory('');
      resetMetadataFields();
      setFile(null);
      setThumbnail(null);
      if (fileRef.current) fileRef.current.value = '';
      if (thumbRef.current) thumbRef.current.value = '';
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={styles.root}>
      <h3 style={styles.heading}>Upload New Asset</h3>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Asset Name *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Cartoon Boy Standing"
          />
        </div>

        <div className="form-group">
          <label>Category *</label>
          <select value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); setBgSubcategory(''); resetMetadataFields(); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {form.category === 'BACKGROUND' && (
          <div className="form-group">
            <label>Subcategory</label>
            <select value={bgSubcategory} onChange={(e) => setBgSubcategory(e.target.value)}>
              <option value="">— None —</option>
              {BG_SUBCATEGORIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}

        {form.category === 'FACE_PART' && (
          <>
            <div className="form-group">
              <label>Part Type</label>
              <select value={partType} onChange={(e) => setPartType(e.target.value)}>
                <option value="">— None —</option>
                {FACE_PART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>View</label>
              <select value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">— None —</option>
                {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Gender (optional)</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
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
                value={faceFamily}
                onChange={(e) => setFaceFamily(e.target.value)}
                placeholder="e.g. Rahul, Teacher"
              />
            </div>
            <div className="form-group">
              <label>View</label>
              <select value={view} onChange={(e) => setView(e.target.value)}>
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
                value={costume}
                onChange={(e) => setCostume(e.target.value)}
                placeholder="e.g. Student, Police, Teacher"
              />
            </div>
            <div className="form-group">
              <label>Pose Type</label>
              <select value={poseType} onChange={(e) => setPoseType(e.target.value)}>
                <option value="">— None —</option>
                {POSE_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>View</label>
              <select value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">— None —</option>
                {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="form-group">
          <label>Tags (comma separated)</label>
          <input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="e.g. boy, standing, cartoon"
          />
        </div>

        <div className="form-group">
          <label>Asset File * (SVG, PNG, JPG, GIF, WebP, MP3, WAV, OGG — max 10MB)</label>
          <input
            ref={fileRef}
            type="file"
            required
            accept=".svg,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.m4a"
            onChange={(e) => setFile(e.target.files[0])}
          />
          {file && <span style={styles.fileInfo}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>}
        </div>

        <div className="form-group">
          <label>Thumbnail (optional — shown in library grid)</label>
          <input
            ref={thumbRef}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setThumbnail(e.target.files[0])}
          />
        </div>

        {error && <p className="form-error">{error}</p>}
        {msg && <p style={styles.success}>{msg}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Uploading…' : 'Upload Asset'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  root: { padding: 28, maxWidth: 680 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 20 },
  fileInfo: { fontSize: 12, color: 'var(--mid)', marginTop: 2 },
  success: { color: 'var(--success)', fontSize: 13, marginBottom: 8 },
  hint: {
    marginTop: 24, background: 'var(--primary-light)', borderRadius: 8,
    padding: '12px 16px', fontSize: 12, lineHeight: 1.7, color: 'var(--mid)',
  },
};
