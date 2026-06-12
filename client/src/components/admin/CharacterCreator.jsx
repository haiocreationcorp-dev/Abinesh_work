import { useState, useEffect, useRef, useCallback } from 'react';
import { getAssets, uploadAsset, saveAssembledCharacter } from '../../api/assets.js';

const ORANGE = '#F97316';
const CANVAS_W = 380;
const CANVAS_H = 560;
const MAX_HISTORY = 50;
const GROUP_COLORS = ['#818CF8', '#34D399', '#F472B6', '#FBBF24', '#60A5FA'];

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Detects the tight non-transparent bounding box of an img element via offscreen canvas.
function findTrimRect(img) {
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw < 1 || nh < 1) return null;
    const limit = 256;
    const sc = Math.min(1, limit / nw, limit / nh);
    const cw = Math.ceil(nw * sc), ch = Math.ceil(nh * sc);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    const { data } = ctx.getImageData(0, 0, cw, ch);
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        if (data[(y * cw + x) * 4 + 3] > 5) {
          if (x < x0) x0 = x; if (y < y0) y0 = y;
          if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
    if (x1 < 0) return null;
    return { minX: x0 / sc, minY: y0 / sc, maxX: (x1 + 1) / sc, maxY: (y1 + 1) / sc, nw, nh };
  } catch { return null; }
}
const genGroupId = () => `g-${Date.now().toString(36)}`;
const groupColor = (gid) => { if (!gid) return null; const h = [...gid].reduce((a, c) => a + c.charCodeAt(0), 0); return GROUP_COLORS[h % GROUP_COLORS.length]; };

function svgToDataUrl(svgText) {
  try {
    const bytes = new TextEncoder().encode(svgText);
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  } catch {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  }
}

// Make a valid XML ID from a part name; ensure uniqueness within the set.
function makePartId(name, usedIds) {
  let base = (name || 'part').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^([^a-zA-Z_])/, '_$1');
  let id = base;
  let n = 2;
  while (usedIds.has(id)) { id = `${base}_${n++}`; }
  usedIds.add(id);
  return id;
}

async function buildAssembledSvg(parts) {
  const sorted = [...parts].sort((a, b) => a.zIndex - b.zIndex);
  const fetched = await Promise.all(
    sorted.map((p) => fetch(p.filePath).then((r) => r.text()).catch(() => '<svg xmlns="http://www.w3.org/2000/svg"/>'))
  );
  const defs = [];
  const usedIds = new Set();
  const groups = sorted.map((p, i) => {
    const href = svgToDataUrl(fetched[i]);
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const tfm = [
      p.rotation ? `rotate(${p.rotation} ${cx} ${cy})` : '',
      p.flipX    ? `translate(${2 * cx} 0) scale(-1 1)` : '',
      p.flipY    ? `translate(0 ${2 * cy}) scale(1 -1)` : '',
    ].filter(Boolean).join(' ');
    const cl = p.clip?.l ?? 0, ct = p.clip?.t ?? 0, cr = p.clip?.r ?? 0, cb = p.clip?.b ?? 0;
    const hasClip = cl > 0 || ct > 0 || cr > 0 || cb > 0;
    const clipAttr = hasClip ? (() => {
      const cid = `clip${i}`;
      defs.push(`<clipPath id="${cid}"><rect x="${p.x + p.w * cl / 100}" y="${p.y + p.h * ct / 100}" width="${p.w * (1 - (cl + cr) / 100)}" height="${p.h * (1 - (ct + cb) / 100)}"/></clipPath>`);
      return ` clip-path="url(#${cid})"`;
    })() : '';
    // Wrap in <g id="..."> so the Pose Editor can select each part by ID
    const partId = makePartId(p.customName || p.name, usedIds);
    const gTfm = tfm ? ` transform="${tfm}"` : '';
    return [
      `  <g id="${partId}" inkscape:label="${partId}"${gTfm}>`,
      `    <image x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" href="${href}" preserveAspectRatio="xMidYMid meet"${clipAttr}/>`,
      `  </g>`,
    ].join('\n');
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">`,
    defs.length ? `  <defs>${defs.join('')}</defs>` : '',
    ...groups,
    '</svg>',
  ].filter(Boolean).join('\n');
}

export default function CharacterCreator() {
  const [canvasParts, setCanvasParts]   = useState([]);
  const [selectedId, setSelectedId]     = useState(null);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [charName, setCharName]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState('');
  const [uploadFiles, setUploadFiles]   = useState([]);
  const [uploading, setUploading]       = useState(false);
  const [uploadMsg, setUploadMsg]       = useState('');
  const [allAssets, setAllAssets]       = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [searchQ, setSearchQ]           = useState('');
  const [zoom, setZoom]                 = useState(1);
  const [editingName, setEditingName]   = useState(null);
  const [editNameVal, setEditNameVal]   = useState('');
  const [showCrop, setShowCrop]         = useState(false);

  const dragRef      = useRef(null);
  const canvasRef    = useRef(null);
  const historyRef   = useRef({ stack: [[]], idx: 0 });
  const zoomRef      = useRef(1);
  const selIdRef     = useRef(null);
  const trimCacheRef = useRef({});   // filePath → trim rect
  const [trimVersion, setTrimVersion] = useState(0); // bumped to trigger rerender after trim computed
  zoomRef.current   = zoom;
  selIdRef.current  = selectedId;

  useEffect(() => {
    setLoadingAssets(true);
    getAssets({ category: 'BODY_PART' }).then(setAllAssets).catch(() => setAllAssets([])).finally(() => setLoadingAssets(false));
  }, []);

  // ── History helpers ──
  const commitParts = useCallback((updater) => {
    setCanvasParts((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const { stack, idx } = historyRef.current;
      const trimmed = stack.slice(0, idx + 1);
      const newStack = [...trimmed, next].slice(-MAX_HISTORY);
      historyRef.current = { stack: newStack, idx: newStack.length - 1 };
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const { stack, idx } = historyRef.current;
    if (idx <= 0) return;
    historyRef.current = { ...historyRef.current, idx: idx - 1 };
    setCanvasParts(stack[idx - 1]);
    setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    const { stack, idx } = historyRef.current;
    if (idx >= stack.length - 1) return;
    historyRef.current = { ...historyRef.current, idx: idx + 1 };
    setCanvasParts(stack[idx + 1]);
    setSelectedId(null);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = selIdRef.current;
        if (id) { commitParts((prev) => prev.filter((p) => p.id !== id)); setSelectedId(null); }
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commitParts, undo, redo]);

  // ── Upload ──
  const handleUpload = async () => {
    if (!uploadFiles.length) return;
    setUploading(true); setUploadMsg('');
    let ok = 0;
    for (const file of uploadFiles) {
      try {
        const name = file.name.replace(/\.[^.]+$/, '');
        const fd = new FormData();
        fd.append('file', file); fd.append('name', name);
        fd.append('category', 'BODY_PART'); fd.append('tags', name);
        await uploadAsset(fd); ok++;
      } catch { /* continue */ }
    }
    setUploadFiles([]);
    setUploadMsg(`Uploaded ${ok}/${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''}`);
    getAssets({ category: 'BODY_PART' }).then(setAllAssets);
    setTimeout(() => setUploadMsg(''), 4000);
    setUploading(false);
  };

  // ── Canvas add ──
  const addToCanvas = (asset) => {
    commitParts((prev) => {
      const maxZ = prev.length ? Math.max(...prev.map((p) => p.zIndex)) + 1 : 50;
      return [...prev, {
        id: genId(), assetId: asset.id, filePath: asset.filePath,
        name: asset.name, customName: '',
        x: Math.round(CANVAS_W / 2 - 50), y: Math.round(CANVAS_H / 2 - 50),
        w: 100, h: 100, rotation: 0, zIndex: maxZ,
        flipX: false, flipY: false, groupId: null,
        clip: { t: 0, r: 0, b: 0, l: 0 },
      }];
    });
  };

  // ── Drag ──
  const handleMouseDown = useCallback((e, partId) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setSelectedId(partId);
    setSelectedIds(new Set([partId]));
    setCanvasParts((prev) => {
      const origPositions = {};
      prev.forEach((p) => { origPositions[p.id] = { x: p.x, y: p.y }; });
      const dragged = prev.find((p) => p.id === partId);
      dragRef.current = { partId, startX: e.clientX, startY: e.clientY, origPositions, groupId: dragged?.groupId, moved: false };
      return prev;
    });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const z = zoomRef.current;
    const dx = (e.clientX - dragRef.current.startX) / z;
    const dy = (e.clientY - dragRef.current.startY) / z;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragRef.current.moved = true;
    const { partId, origPositions, groupId } = dragRef.current;
    setCanvasParts((prev) =>
      prev.map((p) => {
        const orig = origPositions[p.id];
        if (!orig) return p;
        if (p.id === partId || (groupId && p.groupId === groupId))
          return { ...p, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
        return p;
      })
    );
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current?.moved) {
      setCanvasParts((prev) => {
        const { stack, idx } = historyRef.current;
        const trimmed = stack.slice(0, idx + 1);
        const newStack = [...trimmed, prev].slice(-MAX_HISTORY);
        historyRef.current = { stack: newStack, idx: newStack.length - 1 };
        return prev;
      });
    }
    dragRef.current = null;
  }, []);

  // ── Part mutations ──
  const updatePart = useCallback((id, patch) => {
    commitParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [commitParts]);

  const updateClip = useCallback((key, val) => {
    const id = selIdRef.current; if (!id) return;
    commitParts((prev) => prev.map((p) => p.id === id ? { ...p, clip: { ...p.clip, [key]: val } } : p));
  }, [commitParts]);

  const updateProportional = useCallback((newW) => {
    const id = selIdRef.current; if (!id) return;
    setCanvasParts((prev) => {
      const p = prev.find((pt) => pt.id === id); if (!p) return prev;
      const ratio = p.h / p.w;
      const next = prev.map((pt) => pt.id === id ? { ...pt, w: newW, h: Math.round(newW * ratio) } : pt);
      const { stack, idx } = historyRef.current;
      const trimmed = stack.slice(0, idx + 1);
      historyRef.current = { stack: [...trimmed, next].slice(-MAX_HISTORY), idx: Math.min(idx + 1, MAX_HISTORY - 1) };
      return next;
    });
  }, []);

  const removePart = useCallback((id) => {
    const tid = id ?? selIdRef.current; if (!tid) return;
    commitParts((prev) => prev.filter((p) => p.id !== tid));
    if (tid === selIdRef.current) setSelectedId(null);
  }, [commitParts]);

  // ── Layer reorder ──
  const moveLayer = useCallback((id, dir) => {
    commitParts((prev) => {
      const sorted = [...prev].sort((a, b) => b.zIndex - a.zIndex);
      const idx = sorted.findIndex((p) => p.id === id);
      const neighbor = sorted[idx + dir];
      if (!neighbor) return prev;
      const z1 = sorted[idx].zIndex, z2 = neighbor.zIndex;
      return prev.map((p) => {
        if (p.id === id) return { ...p, zIndex: z2 };
        if (p.id === neighbor.id) return { ...p, zIndex: z1 };
        return p;
      });
    });
  }, [commitParts]);

  // ── Grouping ──
  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const gid = genGroupId();
    commitParts((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, groupId: gid } : p));
    setSelectedIds(new Set());
  }, [commitParts, selectedIds]);

  const ungroupPart = useCallback((id) => {
    commitParts((prev) => prev.map((p) => p.id === id ? { ...p, groupId: null } : p));
  }, [commitParts]);

  // ── Save ──
  const handleSave = async () => {
    if (!charName.trim() || !canvasParts.length) return;
    setSaving(true); setSavedMsg('');
    try {
      const svg = await buildAssembledSvg(canvasParts);
      const res = await saveAssembledCharacter(charName.trim(), svg);
      setSavedMsg(`Saved as "${res.name}"`);
      setTimeout(() => setSavedMsg(''), 5000);
    } catch (err) {
      setSavedMsg(err?.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  // Called when a canvas part image loads — computes trim rect once per filePath.
  const handlePartImgLoad = useCallback((e, filePath) => {
    if (trimCacheRef.current[filePath]) return;
    const trim = findTrimRect(e.target);
    if (trim) { trimCacheRef.current[filePath] = trim; setTrimVersion((v) => v + 1); }
  }, []);

  const selectedPart = canvasParts.find((p) => p.id === selectedId);
  const sortedByZ    = [...canvasParts].sort((a, b) => b.zIndex - a.zIndex);
  const filteredAssets = searchQ.trim()
    ? allAssets.filter((a) => a.name.toLowerCase().includes(searchQ.toLowerCase()))
    : allAssets;
  const canUndo = historyRef.current.idx > 0;
  const canRedo = historyRef.current.idx < historyRef.current.stack.length - 1;

  const handleLayerClick = (e, partId) => {
    if (e.shiftKey) {
      setSelectedIds((prev) => { const n = new Set(prev); n.has(partId) ? n.delete(partId) : n.add(partId); return n; });
    } else {
      setSelectedId(partId);
      setSelectedIds(new Set([partId]));
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* ── LEFT: Library ── */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Upload */}
        <div className="card" style={{ padding: 14 }}>
          <p style={s.sectionTitle}>Upload Body Parts</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
            <label style={{ ...s.fileLabel, background: uploadFiles.length ? '#FFF7ED' : '#F9FAFB', borderColor: uploadFiles.length ? ORANGE : '#E5E7EB' }}>
              {uploadFiles.length
                ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected`
                : 'Choose SVG files…'}
              <input type="file" accept=".svg" multiple style={{ display: 'none' }}
                onChange={(e) => setUploadFiles(Array.from(e.target.files))} />
            </label>
            {uploadFiles.length > 0 && (
              <div style={{ maxHeight: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {uploadFiles.map((f, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#6B7280', padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name.replace(/\.[^.]+$/, '')}
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={handleUpload}
              disabled={uploading || !uploadFiles.length} style={{ fontSize: 12 }}>
              {uploading ? 'Uploading…' : `Upload${uploadFiles.length > 1 ? ` (${uploadFiles.length})` : ''}`}
            </button>
            {uploadMsg && (
              <p style={{ fontSize: 11, color: uploadMsg.includes('0/') ? '#dc2626' : '#16a34a' }}>{uploadMsg}</p>
            )}
          </div>
        </div>

        {/* Library */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={s.sectionTitle}>Library <span style={{ fontWeight: 400, color: '#9CA3AF' }}>({filteredAssets.length})</span></p>
            <button onClick={() => { setLoadingAssets(true); getAssets({ category: 'BODY_PART' }).then(setAllAssets).finally(() => setLoadingAssets(false)); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9CA3AF' }} title="Refresh">↻</button>
          </div>
          <input className="input" placeholder="Search…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            style={{ fontSize: 12, marginBottom: 8, width: '100%', boxSizing: 'border-box' }} />
          {loadingAssets ? (
            <p style={s.hint}>Loading…</p>
          ) : filteredAssets.length === 0 ? (
            <p style={s.hint}>No parts found. Upload SVGs above.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {filteredAssets.map((asset) => (
                <button key={asset.id} title={asset.name} onClick={() => addToCanvas(asset)} style={s.assetThumb}>
                  <img src={asset.filePath} alt={asset.name}
                    style={{ width: 60, height: 60, objectFit: 'contain', display: 'block' }} />
                  <p style={s.thumbLabel}>{asset.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CENTER: Canvas ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

        {/* Toolbar */}
        <div className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Undo / Redo */}
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...s.iconBtn, opacity: canUndo ? 1 : 0.35 }}>↩</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...s.iconBtn, opacity: canRedo ? 1 : 0.35 }}>↪</button>
          <div style={s.tbDivider} />

          {/* Zoom */}
          <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>Zoom</span>
          <input type="range" min={0.4} max={2} step={0.05} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: 80, accentColor: ORANGE }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', minWidth: 34 }}>{Math.round(zoom * 100)}%</span>
          <div style={s.tbDivider} />

          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Character Creator</span>
          <div style={{ flex: 1 }} />
          <input className="input" placeholder="Character name…" value={charName}
            onChange={(e) => setCharName(e.target.value)} style={{ width: 160, fontSize: 13 }} />
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || !charName.trim() || !canvasParts.length} style={{ flexShrink: 0, fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {savedMsg && (
          <div style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: savedMsg.startsWith('Saved') ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${savedMsg.startsWith('Saved') ? '#6EE7B7' : '#FECACA'}`,
            color: savedMsg.startsWith('Saved') ? '#065F46' : '#991B1B' }}>
            {savedMsg}
          </div>
        )}

        {/* Canvas wrapper with zoom */}
        <div className="card" style={{ padding: 12, overflow: 'auto' }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: CANVAS_W, height: CANVAS_H }}>
            <div ref={canvasRef}
              style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H,
                background: '#F8FAFC', border: '2px dashed #E5E7EB', borderRadius: 10, overflow: 'hidden' }}
              onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onClick={() => { setSelectedId(null); setSelectedIds(new Set()); }}>

              {/* Guide lines */}
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={CANVAS_W} height={CANVAS_H}>
                <line x1={CANVAS_W/2} y1="0" x2={CANVAS_W/2} y2={CANVAS_H} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="5 4"/>
                <line x1="0" y1={CANVAS_H/2} x2={CANVAS_W} y2={CANVAS_H/2} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="5 4"/>
                <rect x="120" y="10"  width="140" height="130" rx="6" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="3 3"/>
                <rect x="100" y="150" width="180" height="190" rx="6" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="3 3"/>
                <rect x="100" y="350" width="180" height="180" rx="6" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="3 3"/>
              </svg>
              <span style={{ position:'absolute', left:4, top:28,   fontSize:9, color:'#D1D5DB', pointerEvents:'none', userSelect:'none' }}>HEAD</span>
              <span style={{ position:'absolute', left:4, top:228,  fontSize:9, color:'#D1D5DB', pointerEvents:'none', userSelect:'none' }}>BODY</span>
              <span style={{ position:'absolute', left:4, top:420,  fontSize:9, color:'#D1D5DB', pointerEvents:'none', userSelect:'none' }}>LEGS</span>

              {[...canvasParts].sort((a, b) => a.zIndex - b.zIndex).map((part) => {
                const isSel   = selectedId === part.id;
                const isMulti = selectedIds.has(part.id);
                const gc      = groupColor(part.groupId);
                const cl = part.clip?.l ?? 0, ct = part.clip?.t ?? 0, cr = part.clip?.r ?? 0, cb = part.clip?.b ?? 0;
                const hasClip = cl > 0 || ct > 0 || cr > 0 || cb > 0;

                // Compute tight-fit img style using cached trim rect
                const trim = trimCacheRef.current[part.filePath];
                let imgStyle;
                if (trim) {
                  const { minX, minY, maxX, maxY, nw, nh } = trim;
                  const cw = maxX - minX, ch = maxY - minY;
                  const scale = Math.min(100 / cw, 100 / ch);
                  const imgW = nw * scale, imgH = nh * scale;
                  const contentW = cw * scale, contentH = ch * scale;
                  const left = -(minX * scale) + (100 - contentW) / 2;
                  const top  = -(minY * scale) + (100 - contentH) / 2;
                  imgStyle = { position: 'absolute', width: `${imgW}%`, height: `${imgH}%`, left: `${left}%`, top: `${top}%`, pointerEvents: 'none' };
                } else {
                  imgStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' };
                }

                return (
                  <div key={part.id}
                    style={{
                      position: 'absolute', left: part.x, top: part.y, width: part.w, height: part.h,
                      transform: `rotate(${part.rotation||0}deg) scaleX(${part.flipX ? -1 : 1}) scaleY(${part.flipY ? -1 : 1})`,
                      transformOrigin: 'center center',
                      cursor: 'grab', userSelect: 'none',
                      outline: isSel ? `2px solid ${ORANGE}` : isMulti ? '2px solid #818CF8' : '2px solid transparent',
                      outlineOffset: 2,
                    }}
                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, part.id); }}>
                    {/* Inner div clips the img to part bounds; crop uses clip-path here */}
                    <div style={{
                      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                      clipPath: hasClip ? `inset(${ct}% ${cr}% ${cb}% ${cl}%)` : undefined,
                    }}>
                      <img src={part.filePath} alt={part.name} style={imgStyle} draggable={false}
                        onLoad={(e) => handlePartImgLoad(e, part.filePath)} />
                    </div>
                    {isSel && (
                      <div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)',
                        background: ORANGE, color:'#fff', fontSize:10, fontWeight:700,
                        padding:'1px 6px', borderRadius:4, whiteSpace:'nowrap', pointerEvents:'none' }}>
                        {part.customName || part.name}
                      </div>
                    )}
                    {gc && (
                      <div style={{ position:'absolute', bottom:-6, right:-6, width:10, height:10, borderRadius:'50%',
                        background: gc, border:'1.5px solid #fff', pointerEvents:'none' }} />
                    )}
                  </div>
                );
              })}

              {canvasParts.length === 0 && (
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:8, pointerEvents:'none' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                  <p style={{ color:'#D1D5DB', fontSize:13, textAlign:'center' }}>
                    Click a part from the library<br/>to add it to the canvas
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <p style={{ fontSize:11, color:'#9CA3AF', textAlign:'center', margin:0 }}>
          Del = remove • Ctrl+Z/Y = undo/redo • Shift-click layers to multi-select
        </p>
      </div>

      {/* ── RIGHT: Controls + Layers ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Part Controls */}
        <div className="card" style={{ padding: 14 }}>
          <p style={s.sectionTitle}>Part Controls</p>
          {!selectedPart ? (
            <p style={{ ...s.hint, marginTop: 8 }}>Click a part on the canvas</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>

              {/* Name */}
              <input className="input" value={selectedPart.customName || selectedPart.name}
                onChange={(e) => updatePart(selectedPart.id, { customName: e.target.value })}
                style={{ fontSize: 12, fontWeight: 600 }} placeholder="Layer name" />

              {/* Flip buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => updatePart(selectedPart.id, { flipX: !selectedPart.flipX })}
                  style={{ ...s.ctrlBtn, flex: 1, background: selectedPart.flipX ? '#FFF7ED' : '#F9FAFB', borderColor: selectedPart.flipX ? ORANGE : '#E5E7EB', color: selectedPart.flipX ? ORANGE : '#374151' }}>
                  ↔ Flip H
                </button>
                <button onClick={() => updatePart(selectedPart.id, { flipY: !selectedPart.flipY })}
                  style={{ ...s.ctrlBtn, flex: 1, background: selectedPart.flipY ? '#FFF7ED' : '#F9FAFB', borderColor: selectedPart.flipY ? ORANGE : '#E5E7EB', color: selectedPart.flipY ? ORANGE : '#374151' }}>
                  ↕ Flip V
                </button>
              </div>

              <SliderRow label="X" value={Math.round(selectedPart.x)} min={-120} max={CANVAS_W + 40}
                onChange={(v) => updatePart(selectedPart.id, { x: v })} />
              <SliderRow label="Y" value={Math.round(selectedPart.y)} min={-120} max={CANVAS_H + 40}
                onChange={(v) => updatePart(selectedPart.id, { y: v })} />
              <SliderRow label="Width" value={selectedPart.w} min={16} max={CANVAS_W}
                onChange={updateProportional} />
              <SliderRow label="Rotate" value={selectedPart.rotation || 0} min={-180} max={180}
                onChange={(v) => updatePart(selectedPart.id, { rotation: v })} unit="°" />
              <SliderRow label="Layer Z" value={selectedPart.zIndex} min={1} max={100}
                onChange={(v) => updatePart(selectedPart.id, { zIndex: v })} />

              {/* Crop section */}
              <button onClick={() => setShowCrop((v) => !v)}
                style={{ ...s.ctrlBtn, justifyContent: 'space-between' }}>
                <span>✂ Crop</span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>{showCrop ? '▲' : '▼'}</span>
              </button>
              {showCrop && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4, borderLeft: `2px solid ${ORANGE}` }}>
                  {[['t','Top'],['b','Bottom'],['l','Left'],['r','Right']].map(([k, label]) => (
                    <SliderRow key={k} label={label} value={selectedPart.clip?.[k] ?? 0} min={0} max={49}
                      onChange={(v) => updateClip(k, v)} unit="%" />
                  ))}
                  <button onClick={() => updatePart(selectedPart.id, { clip: { t:0,r:0,b:0,l:0 } })}
                    style={{ ...s.ctrlBtn, fontSize: 10, color: '#9CA3AF' }}>Reset crop</button>
                </div>
              )}

              {/* Group badge */}
              {selectedPart.groupId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  background: '#F5F3FF', borderRadius: 8, border: '1px solid #DDD6FE' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: groupColor(selectedPart.groupId), flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#6D28D9', flex: 1 }}>In group</span>
                  <button onClick={() => ungroupPart(selectedPart.id)}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </div>
              )}

              <button onClick={() => removePart(selectedPart.id)}
                style={{ padding: '6px', border: '1.5px solid #FECACA', borderRadius: 8,
                  background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Remove Part
              </button>
            </div>
          )}
        </div>

        {/* Layers */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={s.sectionTitle}>Layers ({canvasParts.length})</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {selectedIds.size >= 2 && (
                <button onClick={groupSelected}
                  style={{ fontSize: 10, fontWeight: 700, color: '#6D28D9', background: '#F5F3FF',
                    border: '1px solid #DDD6FE', borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>
                  Group
                </button>
              )}
              {canvasParts.length > 0 && (
                <button onClick={() => { commitParts([]); setSelectedId(null); setSelectedIds(new Set()); }}
                  style={{ fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {canvasParts.length === 0 ? (
            <p style={s.hint}>No parts added yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 340, overflowY: 'auto' }}>
              {sortedByZ.map((part, sortIdx) => {
                const isSel   = selectedId === part.id;
                const isMulti = selectedIds.has(part.id);
                const gc      = groupColor(part.groupId);
                const isEditing = editingName === part.id;
                return (
                  <div key={part.id}
                    onClick={(e) => handleLayerClick(e, part.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 5px', borderRadius: 7, cursor: 'pointer',
                      background: isSel ? '#FEF3E2' : isMulti ? '#F5F3FF' : 'transparent',
                      border: `1.5px solid ${isSel ? ORANGE : isMulti ? '#818CF8' : 'transparent'}`,
                    }}>
                    {gc && <div style={{ width: 4, height: '100%', minHeight: 26, borderRadius: 2, background: gc, flexShrink: 0 }} />}
                    <img src={part.filePath} alt=""
                      style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, borderRadius: 3, background: '#f3f4f6' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <input autoFocus value={editNameVal}
                          onChange={(e) => setEditNameVal(e.target.value)}
                          onBlur={() => { updatePart(part.id, { customName: editNameVal }); setEditingName(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updatePart(part.id, { customName: editNameVal }); setEditingName(null); } if (e.key === 'Escape') setEditingName(null); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '100%', fontSize: 11, border: `1px solid ${ORANGE}`, borderRadius: 4, padding: '1px 4px', outline: 'none', boxSizing: 'border-box' }} />
                      ) : (
                        <p onDoubleClick={(e) => { e.stopPropagation(); setEditingName(part.id); setEditNameVal(part.customName || part.name); }}
                          style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', margin: 0 }}
                          title="Double-click to rename">
                          {part.customName || part.name}
                        </p>
                      )}
                    </div>
                    {/* Up / Down */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(part.id, -1); }}
                        style={{ ...s.arrowBtn }} title="Move up" disabled={sortIdx === 0}>▲</button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(part.id, 1); }}
                        style={{ ...s.arrowBtn }} title="Move down" disabled={sortIdx === sortedByZ.length - 1}>▼</button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removePart(part.id); }}
                      style={{ ...s.arrowBtn, color: '#EF4444', flexShrink: 0 }} title="Remove">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, unit = '' }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: '#6B7280' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: ORANGE, display: 'block' }} />
    </div>
  );
}

const s = {
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 },
  hint:         { fontSize: 12, color: '#9CA3AF' },
  assetThumb:   { border: '1.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#F9FAFB', cursor: 'pointer', padding: 0, transition: 'border-color 0.15s', display: 'block', textAlign: 'left' },
  thumbLabel:   { fontSize: 9, textAlign: 'center', padding: '2px 3px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 },
  fileLabel:    { display: 'block', padding: '8px 10px', border: '1.5px dashed #E5E7EB', borderRadius: 8, fontSize: 11, color: '#6B7280', cursor: 'pointer', textAlign: 'center' },
  iconBtn:      { width: 30, height: 30, borderRadius: 7, border: '1.5px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ctrlBtn:      { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', border: '1.5px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151' },
  arrowBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: '#9CA3AF', padding: '1px 2px', lineHeight: 1 },
  tbDivider:    { width: 1, height: 20, background: '#E5E7EB', flexShrink: 0 },
};
