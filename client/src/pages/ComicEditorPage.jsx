import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getComic, updateComic } from '../api/comics.js';
import { useComic } from '../context/ComicContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { getAIStatus } from '../api/student.js';
import ComicEditor from '../components/comic/ComicEditor.jsx';
import { renderPage, pageStartIndex, RENDER_SCALE as EX_SCALE, LAYOUT_COUNT as EX_COUNT } from '../utils/comicRenderer.js';
import { comicIdFromParam } from '../utils/comicUrl.js';

const GRADIENT = 'var(--header-gradient)';
// Above this character count, a centered title would start clipping inside titleBox's
// maxWidth (46vw) — switch to left-anchored (starts after the brand logo) instead.
const LONG_TITLE_THRESHOLD = 24;

export default function ComicEditorPage() {
  const { comicId: rawParam } = useParams();
  const comicId = comicIdFromParam(rawParam);
  const { loadComic, state, dispatch } = useComic();
  const { isViewOnly, user } = useAuth();
  const { mode, toggle } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const AUTOSAVE_SECONDS = 300; // 5 minutes
  const [countdown, setCountdown] = useState(AUTOSAVE_SECONDS);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const isDirtyRef = useRef(false);

  // Comic title editing — lives in the header now (was in the canvas toolbar). Single
  // source of truth is still ComicContext's state.title + SET_TITLE.
  const commitTitle = () => {
    dispatch({ type: 'SET_TITLE', title: titleDraft.trim() || 'Untitled Comic' });
    setEditingTitle(false);
  };
  const startEditingTitle = () => {
    if (isViewOnly) return;
    setTitleDraft(state.title || '');
    setEditingTitle(true);
  };
  const canUndo = (state.past?.length || 0) > 0;
  const canRedo = (state.future?.length || 0) > 0;

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

  useEffect(() => {
    if (user?.role === 'STUDENT') {
      getAIStatus().then((d) => setAiEnabled(d.aiEnabled)).catch(() => setAiEnabled(false));
    }
  }, [user?.role]);

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
    if (state.isDirty) setCountdown(AUTOSAVE_SECONDS);
  }, [state.isDirty]);

  // Countdown tick — saves at 0, resets after save
  useEffect(() => {
    if (isViewOnly) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (!isDirtyRef.current) return AUTOSAVE_SECONDS;
        if (c <= 1) { handleSaveRef.current(); return AUTOSAVE_SECONDS; }
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

        {/* Left: Back button + brand */}
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate('/dashboard')} title="Back to Dashboard">
            <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" fill="#F97316"/>
              <path d="M27 20 L13 20 M13 20 L19 14 M13 20 L19 26" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={styles.brandWrap}>
            <img src="/tool-icons/bharathcomic-wordmark.png" alt="BharathComic" style={styles.brandLogo} draggable={false} />
          </div>
        </div>

        {/* Center: editable comic title — centered while short; long titles would clip
            inside the centered box's maxWidth, so they switch to starting right after the
            brand logo instead, growing rightward rather than being clipped. */}
        <div style={(editingTitle ? titleDraft : state.title || '').length > LONG_TITLE_THRESHOLD ? styles.titleBoxLeft : styles.titleBox}>
          {editingTitle ? (
            <input
              autoFocus
              style={styles.titleInput}
              value={titleDraft}
              placeholder="Title of the comic…"
              maxLength={140}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              onBlur={commitTitle}
            />
          ) : (
            <span style={styles.titleText} onClick={startEditingTitle} title="Click to edit title">
              {state.title || 'Untitled Comic'}
            </span>
          )}
          {!isViewOnly && !editingTitle && (
            <button style={styles.titlePencil} onClick={startEditingTitle} title="Edit title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Right: status + undo/redo + save + theme + export */}
        <div style={styles.topRight}>
          {isViewOnly ? (
            <span style={styles.statusText}>🔒 View only</span>
          ) : (
            <span style={styles.statusText}>
              <CloudSyncIcon dirty={state.isDirty} countdown={countdown} />
            </span>
          )}

          {!isViewOnly && (
            <div style={styles.undoRedoWrap}>
              <button style={{ ...styles.roundIconBtn, opacity: canUndo ? 1 : 0.4 }} disabled={!canUndo} title="Undo" onClick={() => dispatch({ type: 'UNDO' })}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
              </button>
              <button style={{ ...styles.roundIconBtn, opacity: canRedo ? 1 : 0.4 }} disabled={!canRedo} title="Redo" onClick={() => dispatch({ type: 'REDO' })}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
              </button>
            </div>
          )}

          {!isViewOnly && (
            <button style={styles.saveBtn} onClick={handleSave}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save
            </button>
          )}

          <button
            style={styles.themeToggleBtn}
            onClick={toggle}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {mode === 'dark' ? '☀️' : '🌙'}
          </button>

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
        </div>
      </header>

      <ComicEditor onSave={handleSave} readOnly={isViewOnly} aiEnabled={user?.role === 'STUDENT' ? aiEnabled : true} />

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
    height: 'var(--editor-top-bar-h)',
    background: GRADIENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    gap: 12,
    position: 'relative',
    // Casts a shadow down onto the editor body below — the header is a distinct colored
    // bar (not a neutral --t-* surface), so it gets elevation via a drop shadow rather
    // than the inset/recessed treatment used for the rail/panel/canvas seams beneath it.
    boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35)',
    zIndex: 10,
  },

  /* Left group: back + brand */
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 1 },
  // The icon itself is now a self-contained circular badge (ring + filled arrow), so the
  // button wrapper is just a plain hit-area — no separate background/shadow behind it.
  backBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, background: 'none',
    border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0,
  },
  brandWrap: { display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' },
  star: { fontSize: 14, color: 'rgba(255,255,255,0.85)', userSelect: 'none', flexShrink: 0 },
  appName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--editor-app-name-size)',
    letterSpacing: 1.5, fontWeight: 800,
    color: '#ffffff',
    textShadow: '0 2px 12px rgba(0,0,0,0.25)',
    userSelect: 'none', whiteSpace: 'nowrap',
  },
  brandLogo: {
    height: 'calc(var(--editor-top-bar-h) * 1.1)', width: 'auto', objectFit: 'contain',
    userSelect: 'none', flexShrink: 0,
  },

  /* Center editable title box — shrinks to fit the title, doesn't pad out short ones */
  titleBox: {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    maxWidth: '46vw',
  },
  /* Long-title variant: sits in normal flex flow right after headerLeft (back button +
     logo) instead of being centered — a 4-character gap (in `ch` units) stands in for the
     "4-letter spacing" from the logo, and the title grows rightward instead of clipping. */
  titleBoxLeft: {
    position: 'static', marginLeft: '4ch',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    maxWidth: '46vw', flexShrink: 1, minWidth: 0,
  },
  titleText: {
    fontFamily: "'Alegreya', serif",
    fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'text',
    textTransform: 'uppercase', letterSpacing: 1.5,
    textShadow: '0 1px 0 rgba(255,255,255,0.35), 0 -1px 0 rgba(0,0,0,0.25), 1px 2px 3px rgba(0,0,0,0.45)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  titleInput: {
    fontFamily: "'Alegreya', serif",
    border: 'none', borderBottom: '1.5px solid rgba(255,255,255,0.6)', outline: 'none', background: 'transparent',
    fontSize: 15, fontWeight: 700, color: '#fff', width: '40vw', maxWidth: 560,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  titlePencil: {
    width: 20, height: 20, borderRadius: 6, border: 'none', flexShrink: 0,
    background: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  /* Right controls */
  topRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, zIndex: 1 },
  statusText: {
    fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: 500,
    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
  },
  undoRedoWrap: { display: 'flex', alignItems: 'center', gap: 4 },
  roundIconBtn: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.3)',
    color: '#fff', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--action-primary)', color: '#fff', border: 'none',
    borderRadius: 10, padding: '7px 12px',
    fontSize: 13, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(0,0,0,0.2)', flexShrink: 0,
  },
  themeToggleBtn: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'rgba(255,255,255,0.18)',
    border: '1.5px solid rgba(255,255,255,0.3)',
    cursor: 'pointer', flexShrink: 0, fontSize: 14, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'rgba(255,255,255,0.96)',
    border: 'none',
    borderRadius: 10, padding: '7px 12px',
    fontSize: 13, fontWeight: 800, color: '#1a1a2e',
    cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
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
    color: 'var(--t-text-faint)',
  },
  haioLogo: {
    width: 46,
    height: 46,
    objectFit: 'contain',
    // A soft, consistent drop-shadow on the badge itself (not a boxed card behind it) —
    // matches the embossed/raised look used across the editor's other UI elements.
    filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.25))',
  },
};
