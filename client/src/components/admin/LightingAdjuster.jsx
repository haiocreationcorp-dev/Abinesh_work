import { useEffect, useState } from 'react';
import { getLightingPresets, updateLightingPreset } from '../../api/lighting.js';
import { getAssets } from '../../api/assets.js';
import { buildLightingLayers, loadLightingOverlays } from '../../lighting/lightingEngine.js';
import { sliderFillStyle } from '../../utils/sliderFill.js';

const ACCENT = 'var(--primary)';
const NAV_ACCENT = 'var(--nav-primary)';

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

function strengthLabel(intensity) {
  if (intensity < 60) return 'Subtle';
  if (intensity < 90) return 'Soft';
  if (intensity <= 110) return 'Default';
  if (intensity <= 160) return 'Strong';
  return 'High';
}

const SLIDERS = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'tint',        label: 'Tint' },
  { key: 'brightness',  label: 'Brightness' },
  { key: 'contrast',    label: 'Contrast' },
  { key: 'highlights',  label: 'Highlights' },
  { key: 'shadows',     label: 'Shadows' },
  { key: 'saturation',  label: 'Saturation' },
  { key: 'vibrance',    label: 'Vibrance' },
  { key: 'bloom',       label: 'Bloom', min: 0, max: 100 },
  { key: 'glow',        label: 'Glow', min: 0, max: 100 },
  { key: 'blur',        label: 'Blur (px)', min: 0, max: 12 },
];

export default function LightingAdjuster() {
  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [previewBg, setPreviewBg] = useState(null);

  useEffect(() => {
    getLightingPresets().then((list) => {
      setPresets(list);
      if (list.length) {
        setSelectedId(list[0].id);
        setDraft(list[0]);
      }
    });
    getAssets({ category: 'BACKGROUND', search: 'temple' }).then((list) => {
      if (list.length) setPreviewBg(list[0]);
    });
  }, []);

  const selectPreset = (preset) => {
    setSelectedId(preset.id);
    setDraft(preset);
    setSavedAt(null);
  };

  const updateField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSavedAt(null);
    try {
      const body = {
        label: draft.label,
        icon: draft.icon,
        intensity: draft.intensity ?? 100,
        rays: !!draft.rays,
        flash: !!draft.flash,
        overlayColor: draft.overlayColor || null,
        overlayBlendMode: draft.overlayBlendMode || 'multiply',
        overlayOpacity: draft.overlayOpacity ?? 0,
      };
      SLIDERS.forEach(({ key }) => { body[key] = draft[key]; });
      const updated = await updateLightingPreset(draft.id, body);
      setPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDraft(updated);
      await loadLightingOverlays(true); // refresh shared cache so the user editor reflects the change
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const previewLayers = draft ? buildLightingLayers(draft) : [];

  return (
    <div style={styles.wrap}>
      <div style={styles.presetList}>
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPreset(p)}
            style={{ ...styles.presetBtn, ...(selectedId === p.id ? styles.presetBtnActive : {}) }}
          >
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {draft && (
        <div style={styles.editor}>
          <div style={styles.editorRow}>
            <div style={styles.leftCol}>
              <div style={styles.previewWrap}>
                <div style={{
                  ...styles.preview,
                  ...(previewBg ? {
                    backgroundImage: `url(${previewBg.filePath})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : {}),
                }}>
                  <span style={styles.previewLabel}>{draft.label} preview</span>
                  {previewLayers.map((layer, idx) => (
                    <div key={idx} style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      background: layer.background,
                      mixBlendMode: layer.mixBlendMode,
                      backdropFilter: layer.backdropFilter,
                    }} />
                  ))}
                </div>
                <p style={styles.hint}>Live preview of the overlay this preset will apply over a panel.</p>
              </div>

              <div style={styles.intensityBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>Effect Strength</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    {draft.intensity ?? 100}% — {strengthLabel(draft.intensity ?? 100)}
                  </span>
                </div>
                <input
                  type="range" min={20} max={200} step={5} value={draft.intensity ?? 100}
                  onChange={(e) => updateField('intensity', Number(e.target.value))}
                  style={{ width: '100%', display: 'block', ...sliderFillStyle(draft.intensity ?? 100, 20, 200) }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                  <span>Subtle</span>
                  <span>Default</span>
                  <span>High</span>
                </div>
                <p style={styles.hint}>Master dial that scales every slider's visual strength at once — turn it up if the effect feels too faint, or down to keep it whisper-subtle.</p>
              </div>

              <div style={{ display: 'flex', gap: 20 }}>
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={!!draft.rays} onChange={(e) => updateField('rays', e.target.checked)} />
                  Light rays
                </label>
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={!!draft.flash} onChange={(e) => updateField('flash', e.target.checked)} />
                  Lightning flash
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                  {saving ? 'Saving…' : 'Save & apply to user panel'}
                </button>
              </div>
              {savedAt && <span style={{ fontSize: 12, color: 'var(--success)' }}>Saved — changes are now live for users</span>}
            </div>

            <div style={styles.rightCol}>
              <div style={styles.sliderGrid}>
                {SLIDERS.map(({ key, label, min = -50, max = 50 }) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{draft[key] ?? 0}</span>
                    </div>
                    <input
                      type="range" min={min} max={max} value={draft[key] ?? 0}
                      onChange={(e) => updateField(key, Number(e.target.value))}
                      style={{ width: '100%', display: 'block', ...sliderFillStyle(draft[key] ?? 0, min, max) }}
                    />
                  </div>
                ))}
              </div>

              <div style={styles.overlayBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Custom Color Overlay</span>
                  {draft.overlayColor && (
                    <button
                      onClick={() => setDraft((prev) => ({ ...prev, overlayColor: null, overlayOpacity: 0 }))}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 11, cursor: 'pointer' }}
                    >
                      Remove overlay
                    </button>
                  )}
                </div>
                <p style={styles.hint}>Lay any solid color over the panel — e.g. a deep blue in "multiply" mode for Night, or a warm amber in "soft-light" for sunsets.</p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <input
                    type="color"
                    value={draft.overlayColor || '#1e3a8a'}
                    onChange={(e) => updateField('overlayColor', e.target.value)}
                    style={{ width: 44, height: 32, padding: 0, border: '1.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <select
                    value={draft.overlayBlendMode || 'multiply'}
                    onChange={(e) => updateField('overlayBlendMode', e.target.value)}
                    style={{ flex: 1, fontSize: 13 }}
                  >
                    {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>Overlay Opacity</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{draft.overlayOpacity ?? 0}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={draft.overlayOpacity ?? 0}
                    onChange={(e) => updateField('overlayOpacity', Number(e.target.value))}
                    style={{ width: '100%', display: 'block', ...sliderFillStyle(draft.overlayOpacity ?? 0, 0, 100) }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' },
  presetList: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 },
  presetBtn: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    borderRadius: 8, background: '#F5F3FF', color: '#374151', fontSize: 13, textAlign: 'left',
  },
  presetBtnActive: { background: NAV_ACCENT, color: '#fff' },
  editor: { flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 20 },
  editorRow: { display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' },
  leftCol: { flex: '1 1 380px', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 },
  rightCol: { flex: '2 1 480px', display: 'flex', flexDirection: 'column', gap: 16 },
  previewWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  preview: {
    position: 'relative', width: '100%', height: 220, borderRadius: 12,
    overflow: 'hidden', background: 'linear-gradient(135deg, #93c5fd 0%, #6ee7b7 50%, #fde68a 100%)',
    border: '1px solid var(--border)',
  },
  previewLabel: {
    position: 'absolute', top: 8, left: 10, zIndex: 5, fontSize: 12, fontWeight: 600,
    color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.5)',
  },
  hint: { fontSize: 12, color: 'var(--mid)' },
  intensityBox: {
    padding: '12px 14px', borderRadius: 10, background: '#F5F3FF',
    border: '1px solid #DDD6FE',
  },
  overlayBox: {
    padding: '12px 14px', borderRadius: 10, background: '#FAFAFC',
    border: '1px solid var(--border)', marginTop: 4,
  },
  sliderGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 20px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' },
};
