import { useState } from 'react';
import { useComic } from '../../context/ComicContext.jsx';

export default function ExportControls() {
  const { dispatch } = useComic();
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');

  const hideExportHints = () => {
    document.querySelectorAll('[data-export-hidden]').forEach((el) => { el.style.display = 'none'; });
  };
  const showExportHints = () => {
    document.querySelectorAll('[data-export-hidden]').forEach((el) => { el.style.display = ''; });
  };

  // Deselect all items so no contentEditable or selection handles appear in the export
  const prepareForExport = async () => {
    dispatch({ type: 'SET_ACTIVE_SELECTION', selection: null });
    document.dispatchEvent(new CustomEvent('comic-deselect-all'));
    await new Promise((r) => setTimeout(r, 80));
  };

  const exportPNG = async () => {
    setExporting(true);
    setMsg('');
    try {
      await prepareForExport();
      const { default: html2canvas } = await import('html2canvas');
      const canvas = document.getElementById('comic-canvas');
      if (!canvas) { setMsg('Canvas not found'); return; }
      hideExportHints();
      const shot = await html2canvas(canvas, { useCORS: true, scale: 2, allowTaint: true, logging: false });
      showExportHints();
      const link = document.createElement('a');
      link.download = 'comic-strip.png';
      link.href = shot.toDataURL('image/png');
      link.click();
      setMsg('PNG downloaded!');
    } catch (e) {
      showExportHints();
      setMsg('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const exportPDF = async () => {
    setExporting(true);
    setMsg('');
    try {
      await prepareForExport();
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const canvas = document.getElementById('comic-canvas');
      if (!canvas) { setMsg('Canvas not found'); return; }
      hideExportHints();
      const shot = await html2canvas(canvas, { useCORS: true, scale: 2, allowTaint: true, logging: false });
      showExportHints();
      const imgData = shot.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [shot.width / 2, shot.height / 2] });
      pdf.addImage(imgData, 'PNG', 0, 0, shot.width / 2, shot.height / 2);
      pdf.save('comic-strip.pdf');
      setMsg('PDF downloaded!');
    } catch (e) {
      showExportHints();
      setMsg('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <p style={styles.label}>Export Comic</p>
      <p style={styles.hint}>
        The active panel will be exported. Switch panels in the strip and export each individually, or save and export the full page.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button
          style={styles.exportBtn}
          disabled={exporting}
          onClick={exportPNG}
        >
          {exporting ? '⏳ Exporting…' : '📸 Export as PNG'}
        </button>
        <button
          style={{ ...styles.exportBtn, background: '#FF6B35' }}
          disabled={exporting}
          onClick={exportPDF}
        >
          {exporting ? '⏳ Exporting…' : '📄 Export as PDF'}
        </button>
      </div>
      {msg && <p style={styles.msg}>{msg}</p>}

      <div style={styles.tips}>
        <p style={styles.tipTitle}>SVG Body Part Naming</p>
        <p style={styles.tipText}>
          For full skeletal posing, upload SVG characters with named group IDs:<br />
          <code>head</code>, <code>neck</code>, <code>torso</code>, <code>left-arm</code>, <code>right-arm</code>,
          <code>left-hand</code>, <code>right-hand</code>, <code>left-leg</code>, <code>right-leg</code>,
          <code>left-foot</code>, <code>right-foot</code>
        </p>
      </div>
    </div>
  );
}

const styles = {
  label: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  hint: { fontSize: 12, color: '#64748b', lineHeight: 1.5 },
  exportBtn: {
    background: '#6B35E8', color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    textAlign: 'left',
  },
  msg: { marginTop: 10, fontSize: 12, color: '#86efac' },
  tips: { marginTop: 24, background: '#1e1e3a', borderRadius: 8, padding: 12 },
  tipTitle: { fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 6 },
  tipText: { fontSize: 11, color: '#64748b', lineHeight: 1.6 },
};
