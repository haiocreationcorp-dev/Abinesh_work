import { useState, useRef, useMemo, useEffect } from 'react';
import { uploadFolder, checkDuplicateAssets, getBackgroundSubcategories, createBackgroundSubcategory } from '../../api/assets.js';
import { CATEGORY_IDS as CATEGORIES, VIEWS, FACE_PART_TYPES, GENDERS, POSE_TYPES, EYE_TYPES, MOUTH_TYPES } from '../../constants/categories.js';
import { readDroppedFolder } from '../../utils/folderDrop.js';
import { FolderOpen, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Download, ImageOff, Plus, Check, X } from 'lucide-react';

// Mirrors the server's slugify (backgroundSubcategoryController.js) so a folder-name-derived
// subcategory tag matches the slug the server registers for it.
function slugify(label) {
  return String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const ALLOWED_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.m4a'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // matches the server's multer per-file limit
const IMAGE_EXT_RE = /\.(svg|png|jpe?g|gif|webp)$/i;
const CONFIG_KEY = 'bc_folder_upload_config';

const FOLDER_CATEGORY_MAP = {
  face_part: 'FACE_PART', face_parts: 'FACE_PART', faceparts: 'FACE_PART',
  hair: 'FACE_PART', hairstyle: 'FACE_PART', hairstyles: 'FACE_PART',
  eye: 'FACE_PART', eyes: 'FACE_PART', mouth: 'FACE_PART', mouths: 'FACE_PART',
  faceshape: 'FACE_PART', 'face-shape': 'FACE_PART', nose: 'FACE_PART',
  face: 'FACE_TEMPLATE', faces: 'FACE_TEMPLATE', face_template: 'FACE_TEMPLATE', face_templates: 'FACE_TEMPLATE',
  pose: 'BODY_POSE', poses: 'BODY_POSE', body_pose: 'BODY_POSE', body_poses: 'BODY_POSE',
  costume: 'BODY_POSE', costumes: 'BODY_POSE', outfit: 'BODY_POSE', outfits: 'BODY_POSE',
  background: 'BACKGROUND', backgrounds: 'BACKGROUND', bg: 'BACKGROUND', bgs: 'BACKGROUND',
  scene: 'BACKGROUND', scenes: 'BACKGROUND', location: 'BACKGROUND', locations: 'BACKGROUND',
  environment: 'BACKGROUND', environments: 'BACKGROUND', backdrop: 'BACKGROUND', backdrops: 'BACKGROUND',
  prop: 'PROP', props: 'PROP', object: 'PROP', objects: 'PROP',
  item: 'PROP', items: 'PROP', asset: 'PROP', assets: 'PROP',
  effect: 'EFFECT', effects: 'EFFECT', fx: 'EFFECT', vfx: 'EFFECT',
  particle: 'EFFECT', particles: 'EFFECT', special: 'EFFECT',
  sound: 'SOUND', sounds: 'SOUND', sfx: 'SOUND', audio: 'SOUND',
  'sound effects': 'SOUND', music: 'SOUND', onomatopoeia: 'SOUND',
  bubble: 'BUBBLE', bubbles: 'BUBBLE', speech: 'BUBBLE', text: 'BUBBLE', dialog: 'BUBBLE',
};

const STEPS = [
  { id: 'select', label: 'Select Folder' },
  { id: 'configure', label: 'Configure Metadata' },
  { id: 'validate', label: 'Validate & Review' },
  { id: 'complete', label: 'Import Complete' },
];

const prettify = (orig) => {
  const base = orig.replace(/\.[^.]+$/, '');
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

// Matches a "C<n>P<n>" costume+pose tag anywhere in a filename, e.g. "C1P1", "c1p1_03.webp".
const COSTUME_POSE_RE = /C(\d+)P(\d+)/i;
const FRONT_POSE_MAX = 4; // pose numbers 1-4 are front-view; 5+ are 3/4-view

// BODY_POSE bulk-upload naming convention: every file shares one costume but carries its
// own pose number, which also implies the view (P1-4 = Front, P5+ = 3/4).
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

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch { return null; }
}

function Switch({ checked, onChange, label, hint }) {
  return (
    <label style={styles.switchRow}>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ ...styles.switchTrack, background: checked ? 'var(--action-primary)' : 'var(--border)' }}
      >
        <span style={{ ...styles.switchThumb, transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </span>
      <span>
        <div style={styles.switchLabel}>{label}</div>
        {hint && <div style={styles.switchHint}>{hint}</div>}
      </span>
    </label>
  );
}

export default function FolderUploadForm() {
  const [files, setFiles] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [skippedNames, setSkippedNames] = useState([]);
  const [oversizedNames, setOversizedNames] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [category, setCategory] = useState('FACE_PART');
  const [bgSubcategory, setBgSubcategory] = useState('');
  const [subcats, setSubcats] = useState([]);
  const [useFolderAsSubcat, setUseFolderAsSubcat] = useState(false);
  const [addingSubcat, setAddingSubcat] = useState(false);
  const [newSubcatLabel, setNewSubcatLabel] = useState('');
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
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [progress, setProgress] = useState(null);
  const [uploadStartedAt, setUploadStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const cfg = loadConfig();
    if (!cfg) return;
    setCategory(cfg.category || 'FACE_PART');
    setBgSubcategory(cfg.bgSubcategory || '');
    setPartType(cfg.partType || '');
    setView(cfg.view || '');
    setGender(cfg.gender || '');
    setFaceFamily(cfg.faceFamily || '');
    setCostume(cfg.costume || '');
    setPoseType(cfg.poseType || '');
    setUseCostumePosePlan(cfg.useCostumePosePlan ?? true);
    setSkipDuplicates(cfg.skipDuplicates ?? false);
  }, []);

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
      setBgSubcategory(created.slug);
    } catch (_) { /* duplicate or invalid — leave the input for the admin to fix */ }
  };

  // The subcategory slug actually applied to this batch: folder-name-derived when that
  // option is on, otherwise the one picked from the managed list.
  const effectiveSubcatSlug = category === 'BACKGROUND'
    ? (useFolderAsSubcat ? slugify(folderName) : bgSubcategory)
    : '';

  const saveConfig = () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
      category, bgSubcategory, partType, view, gender, faceFamily, costume, poseType, useCostumePosePlan, skipDuplicates,
    }));
  };

  const costumePosePlan = useMemo(
    () => (category === 'BODY_POSE' ? buildCostumePosePlan(files) : null),
    [files, category]
  );
  const activePlan = category === 'BODY_POSE' && useCostumePosePlan ? costumePosePlan : null;

  const imageFiles = useMemo(() => files.filter((f) => IMAGE_EXT_RE.test(f.name)), [files]);
  const previewFile = imageFiles[previewIndex] || null;
  const previewUrl = useMemo(() => (previewFile ? URL.createObjectURL(previewFile) : null), [previewFile]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const resetMetadataFields = () => {
    setPartType(''); setView(''); setGender(''); setEyeType(''); setMouthType(''); setFaceFamily(''); setCostume(''); setPoseType('');
  };

  const assetPreviewName = (fileName) => {
    const name = prettify(fileName);
    return category === 'BODY_POSE' && folderName ? `${prettify(folderName)} ${name}` : name;
  };

  const processFiles = (selected, detectedFolderName) => {
    const valid = [];
    const skipped = [];
    for (const f of selected) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (ALLOWED_EXTS.includes(ext)) valid.push(f);
      else skipped.push(f.name);
    }
    if (detectedFolderName) {
      setFolderName(detectedFolderName);
      const mapped = FOLDER_CATEGORY_MAP[detectedFolderName.toLowerCase()];
      if (mapped) { setCategory(mapped); setAutoDetected(true); } else setAutoDetected(false);
    }
    setFiles(valid);
    setSkippedCount(skipped.length);
    setSkippedNames(skipped);
    setOversizedNames(valid.filter((f) => f.size > MAX_FILE_SIZE).map((f) => f.name));
    setResult(null);
    setError('');
    setProgress(null);
    setValidated(false);
    setDuplicates([]);
    setPreviewIndex(0);
  };

  const handleFolderChange = (e) => {
    const selected = Array.from(e.target.files);
    const detected = selected[0]?.webkitRelativePath?.split('/')[0] || '';
    processFiles(selected, detected);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragActive(false);
    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;
    try {
      const dropped = await readDroppedFolder(items);
      const detected = dropped[0]?.webkitRelativePath?.split('/')[0] || '';
      processFiles(dropped, detected);
    } catch {
      setError('Could not read the dropped folder — try Browse Folder instead.');
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setError('');
    try {
      const items = activePlan
        ? activePlan.items.map((it) => ({ name: it.name, category, view: it.view }))
        : files.map((f) => ({ name: assetPreviewName(f.name), category, view }));
      const { duplicates: dupes } = await checkDuplicateAssets(items);
      setDuplicates(dupes);
      setValidated(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) { setError('Please select a folder first'); return; }
    setError('');
    setResult(null);
    setProgress(0);
    setUploadStartedAt(Date.now());
    saveConfig();

    const fd = new FormData();
    fd.append('category', category);
    fd.append('folderName', folderName);
    if (skipDuplicates) fd.append('skipDuplicates', 'true');
    if (category === 'BACKGROUND' && effectiveSubcatSlug) {
      fd.append('tags', effectiveSubcatSlug);
      fd.append('bgSubcategory', effectiveSubcatSlug);
    }
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
    setOversizedNames([]);
    setFolderName('');
    setCategory('FACE_PART');
    setBgSubcategory('');
    resetMetadataFields();
    setAutoDetected(false);
    setProgress(null);
    setResult(null);
    setError('');
    setValidated(false);
    setDuplicates([]);
    setPreviewIndex(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadReport = () => {
    if (!result) return;
    const report = {
      folderName, category, generatedAt: new Date().toISOString(),
      total: result.total, added: result.added, updated: result.updated,
      errors: result.errors, skipped: result.skipped, skippedDuplicates: result.skippedDuplicates,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-report-${folderName || 'folder'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eta = (() => {
    if (!uploadStartedAt || progress === null || progress <= 0 || progress >= 100) return null;
    const elapsed = (Date.now() - uploadStartedAt) / 1000;
    const remaining = Math.max(0, elapsed / (progress / 100) - elapsed);
    return remaining < 60 ? `${Math.round(remaining)}s` : `${Math.round(remaining / 60)}m`;
  })();

  const uploading = progress !== null && progress < 100;
  const currentStepId = files.length === 0 ? 'select' : result ? 'complete' : (validated || validating) ? 'validate' : 'configure';
  const stepIndex = STEPS.findIndex((s) => s.id === currentStepId);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const folderCount = new Set(files.map((f) => (f.webkitRelativePath || '').split('/').slice(0, -1).join('/'))).size;

  const actionButtons = (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={reset} disabled={uploading}>Cancel</button>
      <button
        type="button" className="btn btn-outline btn-sm"
        onClick={handleValidate} disabled={files.length === 0 || validating || uploading || !!result}
      >
        {validating ? 'Validating…' : 'Validate Assets'}
      </button>
      <button
        type="button" className="btn btn-primary btn-sm"
        onClick={handleUpload} disabled={files.length === 0 || uploading || !!result}
      >
        {uploading ? `Uploading… ${progress}%` : 'Import Assets'}
      </button>
    </>
  );

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Bulk Import</h2>
          <p className="text-sm text-muted">Upload an entire asset folder with automatic metadata assignment.</p>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.statusBadge}>{STEPS[stepIndex]?.label}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={saveConfig}>Save Configuration</button>
          {actionButtons}
        </div>
      </div>

      <input
        ref={inputRef} type="file" webkitdirectory="true" multiple
        onChange={handleFolderChange} style={{ display: 'none' }}
      />

      <div style={styles.columns}>
        {/* CENTER: scrolling config panel */}
        <div style={styles.centerCol}>
          <div className="card" style={styles.sectionCard}>
            <p style={styles.heading}>Folder Upload</p>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onClick={() => inputRef.current?.click()}
              className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
              style={styles.dropzone}
            >
              <div style={{ color: 'var(--nav-primary)' }}><FolderOpen size={22} /></div>
              <p style={{ fontWeight: 700, marginTop: 6, marginBottom: 2 }}>Drop Folder Here <span className="text-sm text-muted" style={{ fontWeight: 400 }}>or click to Browse Folder</span></p>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                SVG, PNG, JPG, GIF, WebP, MP3, WAV, OGG — max 10MB per file
              </p>
            </div>

            {folderName && (
              <div style={styles.folderSummary}>
                <SummaryStat label="Folder Name" value={folderName} />
                <SummaryStat label="Total Files" value={files.length} />
                <SummaryStat label="Folders" value={folderCount || 1} />
                <SummaryStat label="Total Size" value={`${(totalSize / (1024 * 1024)).toFixed(1)} MB`} />
                <SummaryStat label="Duplicate Files" value={duplicates.length} warn={duplicates.length > 0} />
                <SummaryStat label="Warnings" value={skippedCount + oversizedNames.length} warn={skippedCount + oversizedNames.length > 0} />
              </div>
            )}
            {autoDetected && <p style={styles.autoDetectedNote}>Category auto-detected from folder name.</p>}
          </div>

          <div className="card" style={styles.sectionCard}>
            <p style={styles.heading}>Metadata Assignment</p>
            <div style={styles.formGrid}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Category {autoDetected ? '(auto-detected)' : ''}</label>
                <select className="asset-form-input" value={category} onChange={(e) => { setCategory(e.target.value); setAutoDetected(false); setBgSubcategory(''); resetMetadataFields(); }}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {category === 'BACKGROUND' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Subcategory</label>
                  {useFolderAsSubcat ? (
                    <input
                      className="asset-form-input"
                      value={folderName ? folderName.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() : ''}
                      readOnly
                      placeholder="Pick a folder — its name becomes the subcategory"
                      style={{ background: 'var(--light)' }}
                    />
                  ) : addingSubcat ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        autoFocus
                        className="asset-form-input"
                        value={newSubcatLabel}
                        onChange={(e) => setNewSubcatLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcat(); } if (e.key === 'Escape') { setAddingSubcat(false); setNewSubcatLabel(''); } }}
                        placeholder="New subcategory name…"
                      />
                      <button type="button" style={styles.subcatIconBtn} title="Add" onClick={handleAddSubcat}><Check size={14} /></button>
                      <button type="button" style={styles.subcatIconBtn} title="Cancel" onClick={() => { setAddingSubcat(false); setNewSubcatLabel(''); }}><X size={14} /></button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="asset-form-input" value={bgSubcategory} onChange={(e) => setBgSubcategory(e.target.value)}>
                        <option value="">— None —</option>
                        {subcats.map((sc) => <option key={sc.id} value={sc.slug}>{sc.label}</option>)}
                      </select>
                      <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setAddingSubcat(true)}>
                        <Plus size={14} /> New
                      </button>
                    </div>
                  )}
                  <label style={styles.folderSubcatToggle}>
                    <input type="checkbox" checked={useFolderAsSubcat} onChange={(e) => setUseFolderAsSubcat(e.target.checked)} />
                    Use folder name as subcategory
                  </label>
                </div>
              )}
              {category === 'FACE_PART' && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Part Type</label>
                    <select className="asset-form-input" value={partType} onChange={(e) => setPartType(e.target.value)}>
                      <option value="">— None —</option>
                      {FACE_PART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>View</label>
                    <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                      <option value="">— None —</option>
                      {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Gender (optional)</label>
                    <select className="asset-form-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">— None —</option>
                      {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </select>
                  </div>
                  {partType === 'EYES' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Eye Type (optional)</label>
                      <select className="asset-form-input" value={eyeType} onChange={(e) => setEyeType(e.target.value)}>
                        <option value="">— None —</option>
                        {EYE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                  )}
                  {partType === 'MOUTH' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Mouth Type (optional)</label>
                      <select className="asset-form-input" value={mouthType} onChange={(e) => setMouthType(e.target.value)}>
                        <option value="">— None —</option>
                        {MOUTH_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              {category === 'FACE_TEMPLATE' && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Face Family</label>
                    <input className="asset-form-input" value={faceFamily} onChange={(e) => setFaceFamily(e.target.value)} placeholder="e.g. Rahul, Teacher" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>View</label>
                    <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                      <option value="">— None —</option>
                      {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              {category === 'BODY_POSE' && !(costumePosePlan && useCostumePosePlan) && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Costume</label>
                    <input className="asset-form-input" value={costume} onChange={(e) => setCostume(e.target.value)} placeholder="e.g. Student, Police, Teacher" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Pose Type</label>
                    <select className="asset-form-input" value={poseType} onChange={(e) => setPoseType(e.target.value)}>
                      <option value="">— None —</option>
                      {POSE_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>View</label>
                    <select className="asset-form-input" value={view} onChange={(e) => setView(e.target.value)}>
                      <option value="">— None —</option>
                      {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            {category === 'BODY_POSE' && costumePosePlan && useCostumePosePlan && (
              <div style={styles.planBox}>
                <p style={styles.switchLabel}>
                  Auto-detected costume <strong>{costumePosePlan.costume}</strong> from filenames
                </p>
                <p style={styles.switchHint}>
                  Each file's own pose number sets its Pose Type; P1-P4 = Front, P5+ = 3/4. Toggle
                  "Use costume/pose naming plan" off in Import Options to set these manually instead.
                </p>
              </div>
            )}
          </div>

          <div className="card" style={styles.sectionCard}>
            <p style={styles.heading}>Import Options</p>
            <div style={styles.switchList}>
              {costumePosePlan && category === 'BODY_POSE' && (
                <Switch
                  checked={useCostumePosePlan}
                  onChange={setUseCostumePosePlan}
                  label="Use costume/pose naming plan"
                  hint="Turn off to set costume, pose type and view manually for the whole folder instead."
                />
              )}
              <Switch
                checked={skipDuplicates}
                onChange={setSkipDuplicates}
                label="Skip duplicate assets"
                hint="By default, a file matching an existing asset's name/category/view overwrites it. Enable this to leave existing assets untouched instead."
              />
            </div>
          </div>

          {validated && (
            <div className="card" style={styles.sectionCard}>
              <p style={styles.heading}>Validation Results</p>
              <ValidationRow ok={skippedCount === 0} label="Unsupported File Types" detail={skippedCount > 0 ? `${skippedCount} file${skippedCount !== 1 ? 's' : ''} skipped` : 'All files supported'} />
              <ValidationRow ok={oversizedNames.length === 0} label="File Size" detail={oversizedNames.length > 0 ? `${oversizedNames.length} file${oversizedNames.length !== 1 ? 's' : ''} over 10MB` : 'All files within size limit'} />
              <ValidationRow ok={category !== 'BODY_POSE' || !!costumePosePlan} label="Costume/Pose Naming" detail={category !== 'BODY_POSE' ? 'Not applicable' : costumePosePlan ? `Consistent C#P# naming detected` : 'No consistent C#P# pattern — using manual metadata'} />
              <ValidationRow ok={duplicates.length === 0} label="Duplicate Detection" detail={duplicates.length > 0 ? `${duplicates.length} asset${duplicates.length !== 1 ? 's' : ''} already exist${duplicates.length === 1 ? 's' : ''}` : 'No existing assets matched'} />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        {/* RIGHT: sticky preview/stats panel */}
        <div style={styles.rightCol}>
          {result ? (
            <div className="card" style={styles.sectionCard}>
              <p style={styles.heading}>Import Complete</p>
              <SummaryStat label="Imported Assets" value={result.added} />
              <SummaryStat label="Updated Assets" value={result.updated} />
              <SummaryStat label="Skipped Assets" value={(result.skipped?.length || 0) + (result.skippedDuplicates?.length || 0)} />
              <SummaryStat label="Failed Assets" value={result.errors?.length || 0} warn={result.errors?.length > 0} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={downloadReport}>
                  <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Download Import Report
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={reset}>Upload Another Folder</button>
              </div>
            </div>
          ) : uploading ? (
            <div className="card" style={styles.sectionCard}>
              <p style={styles.heading}>Uploading Assets</p>
              <div style={styles.progressWrap}>
                <div style={{ ...styles.progressBar, width: `${progress}%` }} />
              </div>
              <div style={styles.progressMeta}>
                <span>{progress}% complete</span>
                {eta && <span>~{eta} remaining</span>}
              </div>
            </div>
          ) : (
            <>
              <div className="card" style={styles.sectionCard}>
                <p style={styles.heading}>Preview</p>
                {previewFile ? (
                  <>
                    <div className="checkered-bg" style={styles.previewBox}>
                      <img src={previewUrl} alt="" style={styles.previewImg} />
                    </div>
                    <div style={styles.previewNav}>
                      <button type="button" className="btn btn-outline btn-sm" disabled={previewIndex === 0} onClick={() => setPreviewIndex((i) => i - 1)}><ChevronLeft size={14} /></button>
                      <span className="text-sm text-muted">{previewIndex + 1} / {imageFiles.length}</span>
                      <button type="button" className="btn btn-outline btn-sm" disabled={previewIndex >= imageFiles.length - 1} onClick={() => setPreviewIndex((i) => i + 1)}><ChevronRight size={14} /></button>
                    </div>
                  </>
                ) : (
                  <div style={styles.previewEmpty}>
                    <ImageOff size={24} color="var(--mid)" />
                    <p className="text-sm text-muted" style={{ marginTop: 8 }}>No files selected yet</p>
                  </div>
                )}
              </div>

              <div className="card" style={styles.sectionCard}>
                <p style={styles.heading}>Folder Information</p>
                <SummaryStat label="Folder Name" value={folderName || '—'} />
                <SummaryStat label="Category" value={category} />
                <SummaryStat label="Total Files" value={files.length} />
                {category === 'BODY_POSE' && costumePosePlan && <SummaryStat label="Detected Costume" value={costumePosePlan.costume} />}
              </div>

              <div className="card" style={styles.sectionCard}>
                <p style={styles.heading}>Import Statistics</p>
                <SummaryStat label="Files Found" value={files.length + skippedCount} />
                <SummaryStat label="Accepted" value={files.length} />
                <SummaryStat label="Skipped" value={skippedCount} warn={skippedCount > 0} />
                <SummaryStat label="Duplicates" value={duplicates.length} warn={duplicates.length > 0} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, warn }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, ...(warn ? { color: 'var(--danger)' } : {}) }}>{value}</span>
    </div>
  );
}

function ValidationRow({ ok, label, detail }) {
  return (
    <div style={styles.validationRow}>
      {ok ? <CheckCircle2 size={16} color="var(--action-primary)" /> : <AlertTriangle size={16} color="var(--warning)" />}
      <div>
        <div style={styles.validationLabel}>{label}</div>
        <div className="text-sm text-muted">{detail}</div>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: '0 0 2px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  statusBadge: { fontSize: 12, fontWeight: 700, color: 'var(--nav-text)', background: 'var(--nav-light)', borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap' },

  columns: { display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  centerCol: { flex: '3 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 },
  rightCol: { flex: '1 1 260px', maxWidth: 300, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 20, alignSelf: 'flex-start' },

  sectionCard: { padding: 14 },
  heading: { fontSize: 11.5, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', marginTop: 0 },
  subcatIconBtn: {
    width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: '#fff',
    color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  folderSubcatToggle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mid)', marginTop: 6, cursor: 'pointer', textTransform: 'none', fontWeight: 500, letterSpacing: 0 },

  dropzone: { padding: '12px 16px', textAlign: 'center' },
  folderSummary: { marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px 16px' },
  autoDetectedNote: { fontSize: 12, color: 'var(--nav-text)', marginTop: 6 },

  planBox: { background: 'var(--nav-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginTop: 10 },

  switchList: { display: 'flex', flexDirection: 'column', gap: 10 },
  switchRow: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' },
  switchTrack: { width: 34, height: 20, borderRadius: 999, flexShrink: 0, position: 'relative', transition: 'background 150ms ease', marginTop: 1 },
  switchThumb: { position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 150ms ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
  switchLabel: { fontSize: 13.5, fontWeight: 600, color: 'var(--dark)' },
  switchHint: { fontSize: 12, color: 'var(--mid)', marginTop: 2, lineHeight: 1.4 },

  validationRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' },
  validationLabel: { fontSize: 13.5, fontWeight: 600, color: 'var(--dark)' },

  statRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  statLabel: { color: 'var(--mid)' },
  statValue: { color: 'var(--dark)', fontWeight: 700, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' },

  previewBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, borderRadius: 'var(--radius-sm)' },
  previewImg: { maxWidth: '100%', maxHeight: 180, display: 'block', margin: '0 auto', borderRadius: 8 },
  previewNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 },
  previewEmpty: { textAlign: 'center', padding: '30px 0' },

  progressWrap: { position: 'relative', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' },
  progressBar: { position: 'absolute', top: 0, left: 0, height: '100%', background: 'var(--nav-primary)', borderRadius: 4, transition: 'width 0.2s' },
  progressMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mid)', marginTop: 8 },
};
