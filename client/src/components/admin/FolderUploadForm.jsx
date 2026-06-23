import { useState, useRef } from 'react';
import { uploadFolder } from '../../api/assets.js';
import { CATEGORY_IDS as CATEGORIES, BG_SUBCATEGORIES } from '../../constants/categories.js';
import SkinMaskTuner from './SkinMaskTuner.jsx';
import { DEFAULT_SKIN_THRESHOLDS } from '../../utils/skinMaskPreview.js';

const ALLOWED_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.m4a'];
const SKIN_NORMALIZABLE_CATEGORIES = ['FACE_PART', 'BODY_POSE'];

const FOLDER_CATEGORY_MAP = {
  // FACE_PART
  face_part: 'FACE_PART', face_parts: 'FACE_PART', faceparts: 'FACE_PART',
  hair: 'FACE_PART', hairstyle: 'FACE_PART', hairstyles: 'FACE_PART',
  eye: 'FACE_PART', eyes: 'FACE_PART', mouth: 'FACE_PART', mouths: 'FACE_PART',
  faceshape: 'FACE_PART', 'face-shape': 'FACE_PART', nose: 'FACE_PART',
  // FACE_TEMPLATE
  face: 'FACE_TEMPLATE', faces: 'FACE_TEMPLATE', face_template: 'FACE_TEMPLATE', face_templates: 'FACE_TEMPLATE',
  // BODY_POSE
  pose: 'BODY_POSE', poses: 'BODY_POSE', body_pose: 'BODY_POSE', body_poses: 'BODY_POSE',
  costume: 'BODY_POSE', costumes: 'BODY_POSE', outfit: 'BODY_POSE', outfits: 'BODY_POSE',
  // BACKGROUND
  background: 'BACKGROUND', backgrounds: 'BACKGROUND', bg: 'BACKGROUND', bgs: 'BACKGROUND',
  scene: 'BACKGROUND', scenes: 'BACKGROUND', location: 'BACKGROUND', locations: 'BACKGROUND',
  environment: 'BACKGROUND', environments: 'BACKGROUND', backdrop: 'BACKGROUND', backdrops: 'BACKGROUND',
  // PROP
  prop: 'PROP', props: 'PROP', object: 'PROP', objects: 'PROP',
  item: 'PROP', items: 'PROP', asset: 'PROP', assets: 'PROP',
  // EFFECT
  effect: 'EFFECT', effects: 'EFFECT', fx: 'EFFECT', vfx: 'EFFECT',
  particle: 'EFFECT', particles: 'EFFECT', special: 'EFFECT',
  // SOUND
  sound: 'SOUND', sounds: 'SOUND', sfx: 'SOUND', audio: 'SOUND',
  'sound effects': 'SOUND', music: 'SOUND', onomatopoeia: 'SOUND',
  // BUBBLE
  bubble: 'BUBBLE', bubbles: 'BUBBLE', speech: 'BUBBLE', text: 'BUBBLE', dialog: 'BUBBLE',
};

const prettify = (orig) => {
  const base = orig.replace(/\.[^.]+$/, '');
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function FolderUploadForm() {
  const [files, setFiles] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [skippedNames, setSkippedNames] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [category, setCategory] = useState('FACE_PART');
  const [bgSubcategory, setBgSubcategory] = useState('');
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [normalizeSkin, setNormalizeSkin] = useState(false);
  const [skinThresholds, setSkinThresholds] = useState(DEFAULT_SKIN_THRESHOLDS);
  const [autoDetected, setAutoDetected] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFolderChange = (e) => {
    const selected = Array.from(e.target.files);
    const valid = [];
    const skipped = [];

    for (const f of selected) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (ALLOWED_EXTS.includes(ext)) valid.push(f);
      else skipped.push(f.name);
    }

    if (selected.length > 0) {
      const firstPath = selected[0].webkitRelativePath || '';
      const detected = firstPath.split('/')[0] || '';
      setFolderName(detected);
      const mapped = FOLDER_CATEGORY_MAP[detected.toLowerCase()];
      if (mapped) {
        setCategory(mapped);
        setAutoDetected(true);
      } else {
        setAutoDetected(false);
      }
    }

    setFiles(valid);
    setSkippedCount(skipped.length);
    setSkippedNames(skipped);
    setResult(null);
    setError('');
    setProgress(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) { setError('Please select a folder first'); return; }
    setError('');
    setResult(null);
    setProgress(0);

    const fd = new FormData();
    fd.append('category', category);
    fd.append('folderName', folderName);
    if (category === 'BACKGROUND' && bgSubcategory) fd.append('tags', bgSubcategory);
    if (removeWhiteBg) fd.append('removeWhiteBg', 'true');
    if (normalizeSkin) {
      fd.append('normalizeSkin', 'true');
      fd.append('skinThresholds', JSON.stringify(skinThresholds));
    }
    files.forEach((f) => fd.append('files', f));

    try {
      const data = await uploadFolder(fd, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setResult(data);
      setProgress(100);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
      setProgress(null);
    }
  };

  const reset = () => {
    setFiles([]);
    setSkippedCount(0);
    setSkippedNames([]);
    setFolderName('');
    setCategory('FACE_PART');
    setBgSubcategory('');
    setRemoveWhiteBg(false);
    setNormalizeSkin(false);
    setSkinThresholds(DEFAULT_SKIN_THRESHOLDS);
    setAutoDetected(false);
    setProgress(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const assetPreviewName = (fileName) => {
    const name = prettify(fileName);
    return category === 'BODY_POSE' && folderName ? `${prettify(folderName)} ${name}` : name;
  };

  return (
    <div className="card" style={s.root}>
      <h3 style={s.heading}>Folder Upload</h3>
      <p style={s.sub}>
        Select a folder to upload assets in bulk. The <strong>folder name</strong> sets the category automatically.
        For body poses, the <strong>folder name is prefixed to each asset name</strong> so they're searchable.
        Re-uploading updates existing assets and adds new ones — no duplicates.
      </p>

      {/* Folder picker */}
      <div className="form-group">
        <label>Select Folder</label>
        <input
          ref={inputRef}
          type="file"
          webkitdirectory="true"
          multiple
          onChange={handleFolderChange}
          style={{ marginBottom: 6 }}
        />
        {folderName && (
          <span style={s.detectedLabel}>
            Folder: <strong>{folderName}</strong>
            {autoDetected && <span style={s.badge}>category auto-detected</span>}
          </span>
        )}
      </div>

      {/* Category */}
      <div className="form-group">
        <label>Category {autoDetected ? '(auto-detected — override if needed)' : '(choose manually)'}</label>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setAutoDetected(false); setBgSubcategory(''); }}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Background subcategory */}
      {category === 'BACKGROUND' && (
        <div className="form-group">
          <label>Subcategory (all files in this folder will be tagged)</label>
          <select value={bgSubcategory} onChange={(e) => setBgSubcategory(e.target.value)}>
            <option value="">— None —</option>
            {BG_SUBCATEGORIES.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
          </select>
        </div>
      )}

      {/* Remove white background — face-part / body-pose uploads only */}
      {SKIN_NORMALIZABLE_CATEGORIES.includes(category) && (
        <div className="form-group">
          <label style={s.checkboxLabel}>
            <input
              type="checkbox"
              checked={removeWhiteBg}
              onChange={(e) => setRemoveWhiteBg(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Remove white background from all files
          </label>
          {removeWhiteBg && (
            <p style={s.checkboxHint}>
              White/near-white pixels connected to each image's edges will be made transparent. White areas inside are preserved. Output as WebP.
            </p>
          )}
        </div>
      )}

      {/* Normalize skin tones — face-part / body-pose uploads */}
      {SKIN_NORMALIZABLE_CATEGORIES.includes(category) && (
        <div className="form-group">
          <label style={s.checkboxLabel}>
            <input
              type="checkbox"
              checked={normalizeSkin}
              onChange={(e) => setNormalizeSkin(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Normalize skin tones for all files
          </label>
          {normalizeSkin && (
            <>
              <p style={s.checkboxHint}>
                Detected skin-toned pixels are quantized down to 3 flat reference tones so the
                Comic UI's Skin Color tool can recolor them. Required for gradient/anti-aliased art.
                The same thresholds, tuned below against the first file, apply to the whole batch.
              </p>
              {files.length > 0 && (
                <SkinMaskTuner file={files[0]} thresholds={skinThresholds} onChange={setSkinThresholds} />
              )}
            </>
          )}
        </div>
      )}

      {/* Skipped files warning */}
      {skippedCount > 0 && (
        <div style={s.skipWarn}>
          <strong>{skippedCount} file{skippedCount !== 1 ? 's' : ''} skipped</strong> — unsupported format
          (only SVG, PNG, JPG, WebP, GIF, MP3, WAV, OGG allowed)
          <div style={s.skipList}>
            {skippedNames.slice(0, 6).map((n) => <span key={n} style={s.skipName}>{n}</span>)}
            {skippedNames.length > 6 && <span style={s.skipName}>…and {skippedNames.length - 6} more</span>}
          </div>
        </div>
      )}

      {/* File preview */}
      {files.length > 0 && !result && (
        <div style={s.previewBox}>
          <div style={s.previewHeader}>
            {files.length} file{files.length !== 1 ? 's' : ''} ready to upload
            {' '}from <strong>{folderName || 'folder'}</strong> → <strong>{category}</strong>
          </div>
          <div style={s.fileList}>
            {files.slice(0, 8).map((f) => (
              <div key={f.name} style={s.fileRow}>
                <span style={s.fileName}>{f.name}</span>
                <span style={s.assetName}>→ {assetPreviewName(f.name)}</span>
              </div>
            ))}
            {files.length > 8 && (
              <div style={s.more}>…and {files.length - 8} more</div>
            )}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {progress !== null && progress < 100 && (
        <div style={s.progressWrap}>
          <div style={{ ...s.progressBar, width: `${progress}%` }} />
          <span style={s.progressLabel}>Uploading… {progress}%</span>
        </div>
      )}

      {/* Result summary */}
      {result && (() => {
        const serverSkipped = result.skipped || [];
        const totalSkipped = skippedCount + serverSkipped.length;
        const hasIssues = result.errors?.length > 0 || totalSkipped > 0;
        return (
          <div style={hasIssues ? s.resultBoxWarn : s.resultBox}>
            <div style={hasIssues ? s.resultTitleWarn : s.resultTitle}>
              Upload complete — {result.added + result.updated} of {files.length + skippedCount} files processed
            </div>
            <div style={s.statsRow}>
              <span style={s.statAdded}>{result.added} added</span>
              <span style={s.statUpdated}>{result.updated} updated</span>
              {result.errors?.length > 0 && <span style={s.statError}>{result.errors.length} failed</span>}
              {totalSkipped > 0 && <span style={s.statSkipped}>{totalSkipped} skipped</span>}
            </div>

            {serverSkipped.length > 0 && (
              <div style={s.resultErrors}>
                <div style={s.errHeader}>Skipped by server (unsupported format):</div>
                {serverSkipped.map((e, i) => (
                  <div key={i} style={s.errRow}>
                    <span style={s.errFile}>{e.file}</span>
                    <span style={s.errMsg}>{e.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {skippedCount > 0 && (
              <div style={s.resultErrors}>
                <div style={s.errHeader}>Skipped before upload (unsupported format):</div>
                {skippedNames.slice(0, 6).map((n) => (
                  <div key={n} style={s.errRow}>
                    <span style={s.errFile}>{n}</span>
                  </div>
                ))}
                {skippedNames.length > 6 && <div style={s.errRow}><span style={s.errMsg}>…and {skippedNames.length - 6} more</span></div>}
              </div>
            )}

            {result.errors?.length > 0 && (
              <div style={s.resultErrors}>
                <div style={s.errHeader}>Failed during processing:</div>
                {result.errors.map((e, i) => (
                  <div key={i} style={s.errRow}>
                    <span style={s.errFile}>{e.file}</span>
                    <span style={s.errMsg}>{e.error}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={reset}>Upload another folder</button>
          </div>
        );
      })()}

      {error && <p className="form-error">{error}</p>}

      {files.length > 0 && !result && (
        <button className="btn btn-primary" onClick={handleUpload} disabled={progress !== null && progress < 100}>
          {progress !== null && progress < 100
            ? `Uploading… ${progress}%`
            : `Upload ${files.length} file${files.length !== 1 ? 's' : ''} → ${category}`}
        </button>
      )}
    </div>
  );
}

const s = {
  root: { padding: 28, maxWidth: 680 },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.6 },
  detectedLabel: { fontSize: 12, color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 8 },
  badge: { background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 },
  skipWarn: {
    background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
    padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e',
  },
  skipList: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  skipName: {
    background: '#fef3c7', borderRadius: 4, padding: '1px 7px',
    fontSize: 11, color: '#78350f', fontFamily: 'monospace',
  },
  previewBox: { background: 'var(--primary-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 },
  previewHeader: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  fileList: { display: 'flex', flexDirection: 'column', gap: 4 },
  fileRow: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' },
  fileName: { color: 'var(--mid)', minWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  assetName: { color: 'var(--text)', fontWeight: 500 },
  more: { fontSize: 12, color: 'var(--mid)', marginTop: 4 },
  progressWrap: { position: 'relative', height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 12, overflow: 'hidden' },
  progressBar: { position: 'absolute', top: 0, left: 0, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.2s' },
  progressLabel: { fontSize: 12, color: 'var(--mid)', display: 'block', marginTop: 4 },
  resultBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px', marginBottom: 12 },
  resultBoxWarn: { background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '14px 16px', marginBottom: 12 },
  resultTitle: { fontSize: 14, fontWeight: 700, color: '#15803d', marginBottom: 8 },
  resultTitleWarn: { fontSize: 14, fontWeight: 700, color: '#9a3412', marginBottom: 8 },
  statsRow: { display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  statAdded: { fontSize: 12, fontWeight: 600, color: '#16a34a', background: '#dcfce7', borderRadius: 4, padding: '2px 10px' },
  statUpdated: { fontSize: 12, fontWeight: 600, color: '#0369a1', background: '#e0f2fe', borderRadius: 4, padding: '2px 10px' },
  statError: { fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '2px 10px' },
  statSkipped: { fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '2px 10px' },
  resultErrors: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 },
  errHeader: { fontSize: 12, fontWeight: 600, color: '#7f1d1d', marginBottom: 2 },
  errRow: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'flex-start' },
  errFile: { color: '#374151', fontWeight: 500, fontFamily: 'monospace', minWidth: 140 },
  errMsg: { color: '#dc2626' },
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text)', cursor: 'pointer' },
  checkboxHint: { fontSize: 12, color: 'var(--mid)', marginTop: 6, lineHeight: 1.5 },
};
