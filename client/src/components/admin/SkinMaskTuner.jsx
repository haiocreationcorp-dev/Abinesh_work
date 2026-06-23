import { useEffect, useRef, useState } from 'react';
import { previewSkinMask, DEFAULT_SKIN_THRESHOLDS } from '../../utils/skinMaskPreview.js';

const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Lets an admin see, before upload, exactly which pixels the "Normalize skin tones"
// step will treat as skin — and tune the HSV thresholds until costume/hair colors
// that happen to overlap skin's hue range (e.g. khaki) are excluded. The chosen
// thresholds are lifted to the parent form via onChange and sent to the server
// alongside the upload, where they're persisted on the Asset record.
export default function SkinMaskTuner({ file, thresholds, onChange }) {
  const originalCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const imageDataRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoaded(false);
    setError('');
    if (!file || !RASTER_TYPES.includes(file.type)) return;

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const oCanvas = originalCanvasRef.current;
      const mCanvas = maskCanvasRef.current;
      if (!oCanvas || !mCanvas) return;
      oCanvas.width = mCanvas.width = img.naturalWidth;
      oCanvas.height = mCanvas.height = img.naturalHeight;
      oCanvas.getContext('2d').drawImage(img, 0, 0);
      imageDataRef.current = oCanvas.getContext('2d').getImageData(0, 0, oCanvas.width, oCanvas.height);
      setLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setError('Could not load a preview for this file.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!loaded || !imageDataRef.current || !maskCanvasRef.current) return;
    const raf = requestAnimationFrame(() => {
      const result = previewSkinMask(imageDataRef.current, thresholds);
      maskCanvasRef.current.getContext('2d').putImageData(result, 0, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [loaded, thresholds]);

  if (!file) return null;

  if (!RASTER_TYPES.includes(file.type)) {
    return (
      <p style={styles.hint}>
        SVG files use a hex-replace recolor path at runtime and aren't quantized at
        upload — mask tuning only applies to raster (PNG/JPG/GIF/WebP) art.
      </p>
    );
  }

  const setPercent = (key) => (e) => onChange({ ...thresholds, [key]: Number(e.target.value) / 100 });
  const setDegrees = (key) => (e) => onChange({ ...thresholds, [key]: Number(e.target.value) });

  return (
    <div style={styles.root}>
      <p style={styles.label}>
        Magenta = pixels that will be normalized as skin. Adjust until only real
        skin (face, neck, hands) is highlighted.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div style={styles.canvasRow}>
        <div style={styles.canvasCol}>
          <canvas ref={originalCanvasRef} style={styles.canvas} />
          <span style={styles.canvasCaption}>Original</span>
        </div>
        <div style={styles.canvasCol}>
          <canvas ref={maskCanvasRef} style={styles.canvas} />
          <span style={styles.canvasCaption}>Detected mask</span>
        </div>
      </div>
      <div style={styles.sliders}>
        <label style={styles.sliderLabel}>
          Hue min ({thresholds.hueMin}°)
          <input type="range" min={0} max={360} value={thresholds.hueMin} onChange={setDegrees('hueMin')} />
        </label>
        <label style={styles.sliderLabel}>
          Hue max ({thresholds.hueMax}°)
          <input type="range" min={0} max={360} value={thresholds.hueMax} onChange={setDegrees('hueMax')} />
        </label>
        <label style={styles.sliderLabel}>
          Sat min ({Math.round(thresholds.satMin * 100)}%)
          <input type="range" min={0} max={100} value={Math.round(thresholds.satMin * 100)} onChange={setPercent('satMin')} />
        </label>
        <label style={styles.sliderLabel}>
          Val min ({Math.round(thresholds.valMin * 100)}%)
          <input type="range" min={0} max={100} value={Math.round(thresholds.valMin * 100)} onChange={setPercent('valMin')} />
        </label>
      </div>
      <button type="button" className="btn btn-ghost" style={styles.resetBtn} onClick={() => onChange(DEFAULT_SKIN_THRESHOLDS)}>
        Reset to defaults
      </button>
    </div>
  );
}

const styles = {
  root: { marginTop: 10, padding: 14, background: 'var(--primary-light)', borderRadius: 8 },
  label: { fontSize: 12, color: 'var(--mid)', marginTop: 0, marginBottom: 10, lineHeight: 1.5 },
  hint: { fontSize: 12, color: 'var(--mid)', marginTop: 6, lineHeight: 1.5 },
  canvasRow: { display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' },
  canvasCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  canvas: { width: 320, height: 320, maxWidth: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' },
  canvasCaption: { fontSize: 11, color: 'var(--mid)' },
  sliders: { display: 'flex', flexDirection: 'column', gap: 8 },
  sliderLabel: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--mid)' },
  resetBtn: { marginTop: 10 },
};
