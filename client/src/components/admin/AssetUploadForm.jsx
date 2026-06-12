import { useState, useRef } from 'react';
import { uploadAsset } from '../../api/assets.js';
import { CATEGORY_IDS as CATEGORIES, BG_SUBCATEGORIES } from '../../constants/categories.js';

export default function AssetUploadForm() {
  const [form, setForm] = useState({ name: '', category: 'CHARACTER', tags: '' });
  const [bgSubcategory, setBgSubcategory] = useState('');
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [file, setFile] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const thumbRef = useRef(null);

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
    if (removeWhiteBg) fd.append('removeWhiteBg', 'true');
    fd.append('file', file);
    if (thumbnail) fd.append('thumbnail', thumbnail);

    try {
      await uploadAsset(fd);
      setMsg(`✓ "${form.name}" uploaded successfully`);
      setForm({ name: '', category: 'CHARACTER', tags: '' });
      setBgSubcategory('');
      setRemoveWhiteBg(false);
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
          <select value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); setBgSubcategory(''); }}>
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

        {form.category === 'CHARACTER' && (
          <div className="form-group">
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={removeWhiteBg}
                onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Remove white background
            </label>
            {removeWhiteBg && (
              <p style={styles.checkboxHint}>
                White/near-white pixels connected to the image edges will be made transparent. White areas inside the character (eyes, clothing) are preserved. Output saved as PNG.
              </p>
            )}
          </div>
        )}

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

      <div style={styles.hint}>
        <strong>SVG Naming Convention</strong><br />
        For skeletal character posing, name body-part groups with <code>id</code> attributes:<br />
        <code>head</code>, <code>neck</code>, <code>torso</code>, <code>left-arm</code>, <code>right-arm</code>,
        <code>left-hand</code>, <code>right-hand</code>, <code>left-leg</code>, <code>right-leg</code>,
        <code>left-foot</code>, <code>right-foot</code>
      </div>
    </div>
  );
}

const styles = {
  root: { padding: 28, maxWidth: 540 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 20 },
  fileInfo: { fontSize: 12, color: 'var(--mid)', marginTop: 2 },
  success: { color: 'var(--success)', fontSize: 13, marginBottom: 8 },
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text)', cursor: 'pointer' },
  checkboxHint: { fontSize: 12, color: 'var(--mid)', marginTop: 6, lineHeight: 1.5 },
  hint: {
    marginTop: 24, background: 'var(--primary-light)', borderRadius: 8,
    padding: '12px 16px', fontSize: 12, lineHeight: 1.7, color: 'var(--mid)',
  },
};
