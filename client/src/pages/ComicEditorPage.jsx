import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getComic, updateComic } from '../api/comics.js';
import { useComic } from '../context/ComicContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import ComicEditor from '../components/comic/ComicEditor.jsx';
import { renderPage, pageStartIndex, RENDER_SCALE as EX_SCALE, LAYOUT_COUNT as EX_COUNT } from '../utils/comicRenderer.js';

const GRADIENT = 'var(--header-gradient)';

export default function ComicEditorPage() {
  const { comicId } = useParams();
  const { loadComic, state, dispatch } = useComic();
  const { isViewOnly } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const isDirtyRef = useRef(false);

  // Export current page as PNG
  const exportPNG = async () => {
    setExporting(true); setShowExportMenu(false);
    try {
      const layout = state.pages[state.activePageIndex]?.layout || 'single';
      const start  = pageStartIndex(state.pages, state.activePageIndex);
      const panels = state.panels.slice(start, start + (EX_COUNT[layout]||1));
      const canvas = await renderPage(panels, layout);
      const link = document.createElement('a');
      link.download = `comic-page-${state.activePageIndex + 1}.png`;
      link.href = canvas.toDataURL('image/png'); link.click();
    } catch(e) { console.error('PNG export failed', e); } finally { setExporting(false); }
  };

  // Print all pages (Ctrl+P)
  const printAllPages = useCallback(async () => {
    setExporting(true);
    const win = window.open('', '_blank');
    try {
      const pageImgs = [];
      for (let i = 0; i < state.pages.length; i++) {
        const layout = state.pages[i]?.layout || 'single';
        const start  = pageStartIndex(state.pages, i);
        const panels = state.panels.slice(start, start + (EX_COUNT[layout]||1));
        const canvas = await renderPage(panels, layout);
        pageImgs.push(canvas.toDataURL('image/png'));
      }
      const divs = pageImgs.map((url) => `<div class="page"><img src="${url}" /></div>`).join('');
      const html = `<!DOCTYPE html><html><head><title>BharathComic</title><style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#fff;}
        .page{page-break-after:always;}
        .page:last-child{page-break-after:avoid;}
        img{max-width:100%;height:auto;display:block;}
        @page{margin:10mm;}
      </style></head><body>${divs}</body></html>`;
      if (win) {
        win.document.open(); win.document.write(html); win.document.close();
        setTimeout(() => { win.focus(); win.print(); }, 250);
      }
    } catch(e) {
      console.error('Print failed', e);
      if (win) win.close();
    } finally { setExporting(false); }
  }, [state.pages, state.panels]);

  // Export all pages as a multi-page PDF — 2 comic pages stacked per PDF page
  const exportPDF = async () => {
    setExporting(true); setShowExportMenu(false);
    try {
      const { jsPDF } = await import('jspdf');

      // Render every comic page to its own canvas first
      const canvases = [];
      for (let i = 0; i < state.pages.length; i++) {
        const layout = state.pages[i]?.layout || 'single';
        const start  = pageStartIndex(state.pages, i);
        const panels = state.panels.slice(start, start + (EX_COUNT[layout]||1));
        canvases.push(await renderPage(panels, layout));
      }

      // Pair consecutive pages onto a single PDF page (stacked top/bottom)
      let pdf = null;
      const PAIR_GAP = 12; // px gap between the two stacked pages (at 1× scale)
      for (let i = 0; i < canvases.length; i += 2) {
        const c1 = canvases[i];
        const c2 = canvases[i + 1];
        const w1 = c1.width / EX_SCALE, h1 = c1.height / EX_SCALE;
        const w2 = c2 ? c2.width / EX_SCALE : 0, h2 = c2 ? c2.height / EX_SCALE : 0;
        const combW = Math.max(w1, w2 || 0);
        const combH = c2 ? h1 + PAIR_GAP + h2 : h1;

        // Draw both pages onto one combined canvas (still at 2× for quality)
        const combined = document.createElement('canvas');
        combined.width  = combW * EX_SCALE;
        combined.height = combH * EX_SCALE;
        const ctx = combined.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, combined.width, combined.height);
        ctx.drawImage(c1, Math.round(((combW - w1) / 2) * EX_SCALE), 0);
        if (c2) ctx.drawImage(c2, Math.round(((combW - w2) / 2) * EX_SCALE), (h1 + PAIR_GAP) * EX_SCALE);

        const w = combW, h = combH;
        const orient = w >= h ? 'landscape' : 'portrait';
        if (!pdf) {
          pdf = new jsPDF({ orientation: orient, unit: 'px', format: [w, h] });
        } else {
          pdf.addPage([w, h], orient);
        }
        pdf.addImage(combined.toDataURL('image/png'), 'PNG', 0, 0, w, h);
      }
      pdf.save('comic-strip.pdf');
    } catch(e) { console.error('PDF export failed', e); } finally { setExporting(false); }
  };

  useEffect(() => {
    getComic(comicId)
      .then(loadComic)
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));
  }, [comicId]);

  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateComic(comicId, {
        title: state.title,
        author: state.author,
        panels: state.panels,
        pages: state.pages,
      });
      dispatch({ type: 'MARK_SAVED' });
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  }, [comicId, state.title, state.author, state.panels, state.pages]);

  const handleSave = useCallback(() => {
    if (isViewOnly) return;
    doSave();
  }, [doSave, isViewOnly]);

  // Keep refs so the stable listener always calls the latest version
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // Track isDirty in a ref so the auto-save interval always sees the latest value
  useEffect(() => { isDirtyRef.current = state.isDirty; }, [state.isDirty]);

  // Reset countdown whenever new changes come in
  useEffect(() => {
    if (state.isDirty) setCountdown(10);
  }, [state.isDirty]);

  // Countdown tick — saves at 0, resets after save
  useEffect(() => {
    if (isViewOnly) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (!isDirtyRef.current) return 10;
        if (c <= 1) { handleSaveRef.current(); return 10; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isViewOnly]);
  const printAllPagesRef = useRef(printAllPages);
  useEffect(() => { printAllPagesRef.current = printAllPages; }, [printAllPages]);

  // Block Ctrl+S / Ctrl+P at document capture phase (fires before browser default)
  useEffect(() => {
    const block = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key?.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === 'keydown') handleSaveRef.current();
      }
      if (k === 'p') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === 'keydown') printAllPagesRef.current();
      }
    };
    document.addEventListener('keydown', block, true);
    document.addEventListener('keypress', block, true);
    return () => {
      document.removeEventListener('keydown', block, true);
      document.removeEventListener('keypress', block, true);
    };
  }, []);

  if (loading) return <div className="spinner" style={{ marginTop: 80 }} />;

  return (
    <div style={styles.root}>

      {/* ── Top Bar: full gradient ── */}
      <header style={styles.topBar}>

        {/* Left: Back button */}
        <button style={styles.backBtn} onClick={() => navigate('/dashboard')}>
          <span style={styles.backArrow}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#F97316" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </span>
          <span style={styles.backText}>Back to Dashboard</span>
        </button>

        {/* Center: App name */}
        <div style={styles.titleArea}>
          <span style={styles.star}>✦</span>
          <span style={styles.appName}>BharathComic</span>
          <span style={styles.star}>✦</span>
        </div>

        {/* Right: Status + Save + Chevron */}
        <div style={styles.topRight}>
          {isViewOnly ? (
            <span style={styles.statusText}>🔒 View only</span>
          ) : (
            <span style={styles.statusText}>
              <CloudSyncIcon dirty={state.isDirty} countdown={countdown} />
            </span>
          )}
          {!isViewOnly && (
            <button style={styles.saveBtn} onClick={handleSave}>
              Save
            </button>
          )}

          {/* Export button + dropdown */}
          <div style={{ position: 'relative' }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowExportMenu(false); }}>
            <button
              style={styles.exportBtn}
              disabled={exporting}
              onClick={() => setShowExportMenu((v) => !v)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            {showExportMenu && (
              <div style={styles.exportMenu}>
                <button style={styles.exportMenuItem} onMouseDown={exportPNG}>
                  📸 Export as PNG
                </button>
                <button style={styles.exportMenuItem} onMouseDown={exportPDF}>
                  📄 Export as PDF
                </button>
              </div>
            )}
          </div>

          <button style={styles.chevronBtn} title="More options" onClick={() => setShowExportMenu(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </header>

      <ComicEditor onSave={handleSave} readOnly={isViewOnly} />

      {/* Haio logo — fixed bottom-right */}
      <div style={styles.haioWrap}>
        <span style={styles.poweredBy}>Powered by</span>
        <img
          src="/haio-logo.png"
          alt="haio"
          draggable={false}
          style={styles.haioLogo}
        />
      </div>
    </div>
  );
}

function HaioLogo() {
  return (
    <svg viewBox="0 0 120 120" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hg-gy" x1="30" y1="90" x2="71" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#00C9AA"/>
          <stop offset="22%"  stopColor="#4CAF50"/>
          <stop offset="60%"  stopColor="#8BC34A"/>
          <stop offset="100%" stopColor="#FFD600"/>
        </linearGradient>
        <linearGradient id="hg-bl" x1="71" y1="18" x2="102" y2="71" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#80D8FF"/>
          <stop offset="100%" stopColor="#1565C0"/>
        </linearGradient>
        <linearGradient id="hg-or" x1="102" y1="58" x2="88" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#FFD740"/>
          <stop offset="100%" stopColor="#FF6D00"/>
        </linearGradient>
      </defs>

      {/* Black background */}
      <circle cx="60" cy="60" r="58" fill="#000000"/>

      {/* Main ring arcs — thick */}
      <path d="M 30,90 A 42,42 0 1,0 71,18"
        fill="none" stroke="url(#hg-gy)" strokeWidth="19" strokeLinecap="round"/>
      <path d="M 71,18 A 42,42 0 0,1 102,71"
        fill="none" stroke="url(#hg-bl)" strokeWidth="19" strokeLinecap="round"/>
      <path d="M 102,71 A 42,42 0 0,1 88,95"
        fill="none" stroke="url(#hg-or)" strokeWidth="19" strokeLinecap="round"/>

      {/* Circuit traces — green arc */}
      <polyline points="30,90 24,76 18,60 28,36 42,21"
        fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.85"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="24" cy="76" r="2.5" fill="white" fillOpacity="0.95"/>
      <circle cx="18" cy="60" r="2.5" fill="white" fillOpacity="0.95"/>
      <circle cx="28" cy="36" r="2.5" fill="white" fillOpacity="0.95"/>
      <line x1="24" y1="76" x2="19" y2="71" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round"/>
      <circle cx="19" cy="71" r="1.8" fill="white" fillOpacity="0.85"/>
      <line x1="28" y1="36" x2="35" y2="30" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round"/>
      <circle cx="35" cy="30" r="1.8" fill="white" fillOpacity="0.85"/>

      {/* Circuit traces — blue arc */}
      <polyline points="80,22 89,31 97,48"
        fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.85"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="89" cy="31" r="2.3" fill="white" fillOpacity="0.95"/>
      <circle cx="97" cy="48" r="2.3" fill="white" fillOpacity="0.95"/>

      {/* Circuit traces — orange arc */}
      <polyline points="103,76 100,88 89,95"
        fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.85"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="100" cy="88" r="2.3" fill="white" fillOpacity="0.95"/>

      {/* "haio" text — orange */}
      <text x="60" y="69" textAnchor="middle"
        fill="#FF6D00" fontSize="23"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight="400" letterSpacing="1">haio</text>
    </svg>
  );
}

function CloudSyncIcon({ dirty, countdown }) {
  const aboutToSave = dirty && countdown <= 2;
  const spinning = aboutToSave;
  const saved = !dirty;

  const color = saved ? '#4ade80' : spinning ? '#fff' : 'rgba(255,255,255,0.5)';
  const speed = '0.9s';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <style>{`
        @keyframes bc-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .bc-sync-icon {
          transition: stroke 0.4s ease, opacity 0.4s ease;
        }
      `}</style>
      <svg
        className="bc-sync-icon"
        width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={spinning ? { animation: `bc-spin ${speed} linear infinite`, transformOrigin: 'center' } : { transformOrigin: 'center' }}
      >
        <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64L3 16"/>
        <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 8"/>
        <polyline points="3 16 3 21 8 21"/>
        <polyline points="21 8 21 3 16 3"/>
        {saved && <polyline points="8 12 11 15 16 9" strokeWidth="2.4" stroke="#4ade80"/>}
      </svg>
    </span>
  );
}

function CheckBadge() {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%',
      background: 'rgba(10,10,30,0.35)', border: '1.5px solid rgba(255,255,255,0.6)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </span>
  );
}

const styles = {
  root: { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--t-bg)' },

  topBar: {
    height: 64,
    background: GRADIENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    gap: 12,
    position: 'relative',
  },

  /* Back button — white pill on gradient */
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.95)',
    border: 'none',
    borderRadius: 24,
    padding: '7px 16px 7px 10px',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  backArrow: {
    width: 26, height: 26, borderRadius: '50%',
    background: 'rgba(249,115,22,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  backText: {
    fontSize: 13, fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap',
  },

  /* Center title — absolutely centered so it's always in the middle */
  titleArea: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 10,
    pointerEvents: 'none',
  },
  star: { fontSize: 14, color: 'rgba(255,255,255,0.8)', userSelect: 'none', flexShrink: 0 },
  appName: {
    fontFamily: 'var(--font-display)',
    fontSize: 32,
    letterSpacing: 3,
    fontStyle: 'italic',
    color: '#ffffff',
    textShadow: '0 2px 12px rgba(0,0,0,0.25)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },

  /* Right controls */
  topRight: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  statusText: {
    fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: 500,
    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
  },
  saveBtn: {
    background: '#F97316', color: '#fff', border: 'none',
    borderRadius: 24, padding: '8px 26px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(0,0,0,0.2)', flexShrink: 0,
  },
  chevronBtn: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(10,10,40,0.3)',
    border: '1.5px solid rgba(255,255,255,0.25)',
    color: '#fff', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'rgba(10,10,40,0.3)',
    border: '1.5px solid rgba(255,255,255,0.45)',
    borderRadius: 24, padding: '7px 18px',
    fontSize: 14, fontWeight: 700, color: '#fff',
    cursor: 'pointer', flexShrink: 0,
  },
  exportMenu: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: 6, zIndex: 999,
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  exportMenuItem: {
    width: '100%', background: 'none', border: 'none',
    borderRadius: 7, padding: '9px 14px',
    fontSize: 13, fontWeight: 600, color: '#fff',
    cursor: 'pointer', textAlign: 'left',
  },

  haioWrap: {
    position: 'fixed',
    bottom: 14,
    right: 14,
    zIndex: 999,
    pointerEvents: 'none',
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  poweredBy: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(120,120,140,0.75)',
  },
  haioLogo: {
    width: 56,
    height: 56,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))',
  },
};
