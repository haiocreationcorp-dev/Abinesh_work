import { useState, useRef, useMemo } from 'react';
import { uploadFolder } from '../../api/assets.js';
import { CATEGORY_IDS as CATEGORIES, BG_SUBCATEGORIES, VIEWS, FACE_PART_TYPES, GENDERS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';

const ALLOWED_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.m4a'];

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

// Matches a "C<n>P<n>" costume+pose tag anywhere in a filename, e.g. "C1P1", "c1p1_03.webp".
const COSTUME_POSE_RE = /C(\d+)P(\d+)/i;

// Pose numbers 1-4 are the front-view shots; everything from 5 up is 3/4-view.
const FRONT_POSE_MAX = 4;

// BODY_POSE bulk-upload naming convention: every file in the folder shares the same
// costume, but each carries its OWN distinct pose number (e.g. "C3P1".."C3P18") — view
// isn't picked separately, it's implied by the pose number itself (P1-P4 = Front, P5+ =
// 3/4). Since every pose number is already unique within the folder, the asset name
// (e.g. "C3P1") is naturally unique too — no index suffix needed, and re-uploading the
// same folder later cleanly updates the matching assets instead of duplicating them.
function buildCostumePosePlan(files) {
  const parsed = files.map((f) => ({ file: f, match: f.name.match(COSTUME_POSE_RE) }));
  if (parsed.some((p) => !p.match)) return null;

  const firstCostume = parsed[0].match[1];
  const sameCostume = parsed.every((p) => p.match[1] === firstCostume);
  if (!sameCostume) return null;

  const costume = `C${firstCostume}`;
  const items = parsed
    .map((p) => {
      const poseNum = Number(p.match[2]);
      return {
        file: p.file,
        poseNum,
        name: `${costume}P${poseNum}`,
        poseType: `P${poseNum}`,
        view: poseNum <= FRONT_POSE_MAX ? 'FRONT' : 'THREE_QUARTER',
      };
    })
    .sort((a, b) => a.poseNum - b.poseNum);

  return { costume, items };
}

export default function FolderUploadForm() {
  const [files, setFiles] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [skippedNames, setSkippedNames] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [category, setCategory] = useState('FACE_PART');
  const [bgSubcategory, setBgSubcategory] = useState('');
  // Per-category structured metadata (applies to the whole batch, same as view/bgSubcategory).
  const [partType, setPartType] = useState('');
  const [view, setView] = useState('');
  const [gender, setGender] = useState('');
  const [eyeType, setEyeType] = useState('');
  const [mouthType, setMouthType] = useState('');
  const [faceFamily, setFaceFamily] = useState('');
  const [costume, setCostume] = useState('');
  const [poseType, setPoseType] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [useCostumePosePlan, setUseCostumePosePlan] = useState(true);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Only offered for BODY_POSE, and only when every selected file's name carries a
  // consistent "C<n>P<n>" tag (see buildCostumePosePlan above).
  const costumePosePlan = useMemo(
    () => (category === 'BODY_POSE' ? buildCostumePosePlan(files) : null),
    [files, category]
  );

  const resetMetadataFields = () => {
    setPartType(''); setView(''); setGender(''); setEyeType(''); setMouthType(''); setFaceFamily(''); setCostume(''); setPoseType('');
  };

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
    if (category === 'FACE_PART') {
      if (partType) fd.append('partType', partType);
      if (view) fd.append('view', view);
      if (gender) fd.append('gender', gender);
      if (partType === 'EYES' && eyeType) fd.append('eyeType', eyeType);
      if (partType === 'MOUTH' && mouthType) fd.append('mouthType', mouthType);
    }
    if (category === 'FACE_TEMPLATE') {
      if (faceFamily) fd.append('faceFamily', faceFamily);
      if (view) fd.append('view', view);
    }
    const activePlan = category === 'BODY_POSE' && useCostumePosePlan ? costumePosePlan : null;

    if (category === 'BODY_POSE') {
      if (activePlan) {
        fd.append('costume', activePlan.costume);
        fd.append('fileMeta', JSON.stringify(activePlan.items.map((it) => ({ name: it.name, view: it.view, poseType: it.poseType }))));
      } else {
        if (costume) fd.append('costume', costume);
        if (poseType) fd.append('poseType', poseType);
        if (view) fd.append('view', view);
      }
    }
    (activePlan ? activePlan.items.map((it) => it.file) : files).forEach((f) => fd.append('files', f));

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
    resetMetadataFields();
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
        <select value={category} onChange={(e) => { setCategory(e.target.value); setAutoDetected(false); setBgSubcategory(''); resetMetadataFields(); }}>
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

      {/* Per-category structured metadata — applies to every file in this folder */}
      {category === 'FACE_PART' && (
        <>
          <div className="form-group">
            <label>Part Type (all files in this folder will be tagged)</label>
            <select value={partType} onChange={(e) => setPartType(e.target.value)}>
              <option value="">— None —</option>
              {FACE_PART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>View (all files in this folder will be tagged)</label>
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="">— None —</option>
              {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <p style={s.checkboxHint}>
              Set this when the whole folder is either all front-facing or all 3/4-angle art,
              so front and 3/4 variants of the same name are kept as separate assets.
            </p>
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

      {category === 'FACE_TEMPLATE' && (
        <>
          <div className="form-group">
            <label>Face Family (all files in this folder will be tagged)</label>
            <input
              value={faceFamily}
              onChange={(e) => setFaceFamily(e.target.value)}
              placeholder="e.g. Rahul, Teacher"
            />
          </div>
          <div className="form-group">
            <label>View (all files in this folder will be tagged)</label>
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="">— None —</option>
              {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <p style={s.checkboxHint}>
              Set this when the whole folder is either all front-facing or all 3/4-angle art,
              so front and 3/4 variants of the same name are kept as separate assets.
            </p>
          </div>
        </>
      )}

      {category === 'BODY_POSE' && costumePosePlan && (
        <div style={s.planBox}>
          <label style={s.checkboxLabel}>
            <input
              type="checkbox"
              checked={useCostumePosePlan}
              onChange={(e) => setUseCostumePosePlan(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Auto-detected: costume <strong>{costumePosePlan.costume}</strong> from filenames — each file's own pose
            number sets its Pose Type, and P1-P4 = Front, P5+ = 3/4
          </label>
          {useCostumePosePlan && (
            <div style={s.planList}>
              {costumePosePlan.items.map((it) => (
                <div key={it.name} style={s.planRow}>
                  <span style={s.fileName}>{it.file.name}</span>
                  <span>→ <strong>{it.name}</strong> ({it.view === 'FRONT' ? 'Front' : '3/4'})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {category === 'BODY_POSE' && !(costumePosePlan && useCostumePosePlan) && (
        <>
          <div className="form-group">
            <label>Costume (all files in this folder will be tagged)</label>
            <input
              value={costume}
              onChange={(e) => setCostume(e.target.value)}
              placeholder="e.g. Student, Police, Teacher"
            />
          </div>
          <div className="form-group">
            <label>Pose Type (all files in this folder will be tagged)</label>
            <select value={poseType} onChange={(e) => setPoseType(e.target.value)}>
              <option value="">— None —</option>
              {POSE_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>View (all files in this folder will be tagged)</label>
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="">— None —</option>
              {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <p style={s.checkboxHint}>
              Set this when the whole folder is either all front-facing or all 3/4-angle art,
              so front and 3/4 variants of the same name are kept as separate assets.
            </p>
          </div>
        </>
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

      {/* File preview — skipped when the costume/pose plan is active since that section above already shows per-file names */}
      {files.length > 0 && !result && !(costumePosePlan && useCostumePosePlan) && (
        <div style={s.previewBox}>
          <div style={s.previewHeader}>
            {files.length} file{files.length !== 1 ? 's' : ''} ready to upload
            {' '}from <strong>{folderName || 'folder'}</strong> → <strong>{category}</strong>
            {view && <> (<strong>{VIEWS.find((v) => v.id === view)?.label}</strong>)</>}
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
  root: { padding: 28 },
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
  checkboxHint: { fontSize: 12, color: 'var(--mid)', marginTop: 6, lineHeight: 1.5 },
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  planBox: { background: 'var(--primary-light)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 },
  planList: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10, maxHeight: 220, overflowY: 'auto' },
  planRow: { display: 'flex', gap: 10, fontSize: 12 },
};
