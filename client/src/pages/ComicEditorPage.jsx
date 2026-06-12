import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getComic, updateComic } from '../api/comics.js';
import { useComic } from '../context/ComicContext.jsx';
import ComicEditor from '../components/comic/ComicEditor.jsx';

const GRADIENT = 'linear-gradient(90deg, #FF8C00 0%, #FF5722 28%, #C2185B 62%, #7C3AED 100%)';

export default function ComicEditorPage() {
  const { comicId } = useParams();
  const { loadComic, state, dispatch } = useComic();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Pure canvas-based export (no html2canvas — avoids SVG/transform issues) ──
  const EX_SCALE = 2;
  const EX_GAP   = 6;
  const EX_LAYOUTS = { single:{cols:1,pw:800,ph:450}, '2h':{cols:2,pw:394,ph:450}, '2v':{cols:1,pw:800,ph:220}, '4':{cols:2,pw:394,ph:220} };
  const EX_COUNT   = { single:1, '2h':2, '2v':2, '4':4 };
  const EX_BASE_W  = 120, EX_BASE_H = 200;

  const exLoadImg = (src) => new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = () => resolve(null);
    img.src = src;
  });

  const exDrawBubble = (ctx, bx, by, bubble) => {
    const { type, text, width: bw, height: bh, style: bs = {} } = bubble;
    const fill = bs.fillColor || '#fff', stroke = bs.strokeColor || '#000';
    const fontSize = bs.fontSize || 14;
    ctx.save();
    if (type === 'thought') {
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(bx+bw/2, by+bh*0.42, bw/2-4, bh*0.4, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx+bw*0.35, by+bh*0.88, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx+bw*0.28, by+bh*0.97, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    } else if (type === 'shout') {
      const cx2=bx+bw/2, cy2=by+bh*0.42;
      ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=2;
      ctx.beginPath();
      for(let i=0;i<20;i++){const a=(i/20)*Math.PI*2,r=i%2===0?bw/2-4:bw/2-14;const px=cx2+r*Math.cos(a),py=cy2+r*Math.sin(a)*0.6;i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);}
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx+bw*0.4,by+bh*0.82); ctx.lineTo(bx+bw*0.5,by+bh); ctx.lineTo(bx+bw*0.55,by+bh*0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      const isDash = type === 'whisper';
      ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=isDash?1:2;
      if(isDash) ctx.setLineDash([5,3]);
      const rx=12,rx2=bx+4,ry2=by+4,rw2=bw-8,rh2=bh*0.78;
      ctx.beginPath();
      ctx.moveTo(rx2+rx,ry2); ctx.lineTo(rx2+rw2-rx,ry2); ctx.arcTo(rx2+rw2,ry2,rx2+rw2,ry2+rx,rx);
      ctx.lineTo(rx2+rw2,ry2+rh2-rx); ctx.arcTo(rx2+rw2,ry2+rh2,rx2+rw2-rx,ry2+rh2,rx);
      ctx.lineTo(rx2+rx,ry2+rh2); ctx.arcTo(rx2,ry2+rh2,rx2,ry2+rh2-rx,rx);
      ctx.lineTo(rx2,ry2+rx); ctx.arcTo(rx2,ry2,rx2+rx,ry2,rx);
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(bx+bw*0.3,by+bh*0.82); ctx.lineTo(bx+bw*0.4,by+bh); ctx.lineTo(bx+bw*0.5,by+bh*0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = bs.textColor || '#000';
    ctx.font = `${fontSize}px ${bs.fontFamily || 'Arial, sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = (text || '').split('\n'), lineH = fontSize * 1.3;
    lines.forEach((line, i) => ctx.fillText(line, bx+bw/2, by+bh*0.35+(i-(lines.length-1)/2)*lineH));
    ctx.restore();
  };

  const exDrawPanel = async (ctx, data, x, y, w, h) => {
    // Background (clipped to panel)
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
    if (data.background?.filePath) {
      const bg = await exLoadImg(data.background.filePath);
      if (bg) ctx.drawImage(bg, x, y, w, h);
      else { ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h); }
    } else { ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h); }
    ctx.restore();
    // Items: props, effects, costumes, characters (characters rendered on top)
    const items = [...(data.props||[]),...(data.effects||[]),...(data.costumes||[]),...(data.characters||[])];
    for (const item of items) {
      if (!item.filePath) continue;
      const img = await exLoadImg(item.filePath);
      if (!img) continue;
      const scale = item.scale || 1;
      const rot   = (item.rotation || 0) * Math.PI / 180;
      const flipX = item.flipX ? -1 : 1;
      const { left:cl=0, right:cr=0, top:ct=0, bottom:cb=0 } = item.crop || {};
      ctx.save();
      ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); // keep inside panel
      ctx.translate(x + item.position.x + EX_BASE_W/2, y + item.position.y + EX_BASE_H/2);
      ctx.rotate(rot); ctx.scale(flipX*scale, scale);
      ctx.translate(-EX_BASE_W/2, -EX_BASE_H/2);
      if (cl||cr||ct||cb) { ctx.beginPath(); ctx.rect(cl,ct,EX_BASE_W-cl-cr,EX_BASE_H-ct-cb); ctx.clip(); }
      ctx.drawImage(img, 0, 0, EX_BASE_W, EX_BASE_H);
      ctx.restore();
    }
    // Speech bubbles
    for (const b of (data.speechBubbles||[])) exDrawBubble(ctx, x+b.position.x, y+b.position.y, b);
    // Narration boxes
    for (const nb of (data.narrationBoxes||[])) {
      const fs = nb.style?.fontSize || 13;
      const lh = fs * 1.3;
      const lines = (nb.text || '').split('\n');
      const isV = nb.position === 'left' || nb.position === 'right';
      let bx, by, bw, bh;
      if (nb.position === 'top')    { bx=x;           by=y;         bw=w;                   bh=nb.style?.height||40; }
      else if (nb.position==='bottom') { bx=x;         by=y+h-(nb.style?.height||40); bw=w; bh=nb.style?.height||40; }
      else if (nb.position==='left')   { bx=x;         by=y;         bw=nb.style?.width||60; bh=h; }
      else if (nb.position==='right')  { bx=x+w-(nb.style?.width||60); by=y; bw=nb.style?.width||60; bh=h; }
      else { bx=x; by=y; bw=w; bh=nb.style?.height||40; }
      ctx.fillStyle = nb.style?.fillColor || '#000';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = nb.style?.textColor || '#fff';
      ctx.font = `${fs}px Comic Neue, Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx2 = bx + bw / 2, cy2 = by + bh / 2;
      lines.forEach((line, i) => ctx.fillText(line, cx2, cy2 + (i - (lines.length-1)/2) * lh));
    }
  };

  const exRenderPage = async (pagePanels, layout) => {
    const g = EX_LAYOUTS[layout] || EX_LAYOUTS.single;
    const count = EX_COUNT[layout] || 1;
    const rows  = Math.ceil(count / g.cols);
    const totalW = g.cols*g.pw + (g.cols-1)*EX_GAP;
    const totalH = rows*g.ph  + (rows-1)*EX_GAP;
    const canvas = document.createElement('canvas');
    canvas.width = totalW * EX_SCALE; canvas.height = totalH * EX_SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(EX_SCALE, EX_SCALE);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,totalW,totalH);
    for (let i = 0; i < pagePanels.length; i++) {
      const col = i % g.cols, row = Math.floor(i / g.cols);
      await exDrawPanel(ctx, pagePanels[i].data||{}, col*(g.pw+EX_GAP), row*(g.ph+EX_GAP), g.pw, g.ph);
    }
    return canvas;
  };

  const exPageStart = (pages, idx) => {
    let s = 0; for (let i=0;i<idx;i++) s += (EX_COUNT[pages[i]?.layout]||1); return s;
  };

  // Export current page as PNG
  const exportPNG = async () => {
    setExporting(true); setShowExportMenu(false);
    try {
      const layout = state.pages[state.activePageIndex]?.layout || 'single';
      const start  = exPageStart(state.pages, state.activePageIndex);
      const panels = state.panels.slice(start, start + (EX_COUNT[layout]||1));
      const canvas = await exRenderPage(panels, layout);
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
        const start  = exPageStart(state.pages, i);
        const panels = state.panels.slice(start, start + (EX_COUNT[layout]||1));
        const canvas = await exRenderPage(panels, layout);
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
        const start  = exPageStart(state.pages, i);
        const panels = state.panels.slice(start, start + (EX_COUNT[layout]||1));
        canvases.push(await exRenderPage(panels, layout));
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
    doSave();
  }, [doSave]);

  // Keep refs so the stable listener always calls the latest version
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);
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
          {saveMsg ? (
            <span style={styles.statusText}><CheckBadge /> {saveMsg}</span>
          ) : state.isDirty ? (
            <span style={styles.statusText}>Unsaved changes</span>
          ) : (
            <span style={styles.statusText}><CheckBadge /> All changes saved</span>
          )}
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
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

          <button style={styles.chevronBtn} title="More options" onClick={() => setShowExportMenu(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </header>

      <ComicEditor onSave={handleSave} />

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
    fontFamily: 'Bangers, cursive',
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
