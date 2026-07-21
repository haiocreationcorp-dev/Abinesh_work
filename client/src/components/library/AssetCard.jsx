import { useState, useEffect, useRef } from 'react';
import { MoreVertical, Pencil, Download, Trash2 } from 'lucide-react';
import { useDrag } from '../../context/DragContext.jsx';

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

function recolorBubbleSvg(text) {
  function remap(hex) {
    const h = hex.replace('#', '');
    if (h.length < 6) return hex;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 0.5 ? '#F97316' : '#FED7AA';
  }
  let s = text;
  s = s.replace(/\bfill="(#[0-9a-fA-F]{6,8})"/g,   (_, c) => `fill="${remap(c)}"`);
  s = s.replace(/\bfill:\s*(#[0-9a-fA-F]{6,8})/g,   (_, c) => `fill:${remap(c)}`);
  s = s.replace(/\bstroke="(#[0-9a-fA-F]{6,8})"/g,  (_, c) => `stroke="${remap(c)}"`);
  s = s.replace(/\bstroke:\s*(#[0-9a-fA-F]{6,8})/g, (_, c) => `stroke:${remap(c)}`);
  return s;
}

function formatBytes(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function PreviewModal({ asset, fileSize, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalName}>{asset.name}</span>
          {fileSize != null && <span style={styles.modalSize}>{formatBytes(fileSize)}</span>}
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className="checkered-bg" style={styles.modalImgWrap}>
          <img src={asset.filePath} alt={asset.name} style={styles.modalImg} />
        </div>
      </div>
    </div>
  );
}

function ActionMenu({ onRename, onDownload, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} style={styles.menuWrap}>
      <button
        style={styles.menuTrigger}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="More actions"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div style={styles.menuDropdown} onClick={(e) => e.stopPropagation()}>
          {onRename && (
            <button style={styles.menuItem} onClick={() => { setOpen(false); onRename(); }}>
              <Pencil size={13} /> Rename
            </button>
          )}
          <button style={styles.menuItem} onClick={() => { setOpen(false); onDownload(); }}>
            <Download size={13} /> Download
          </button>
          {onDelete && (
            <button style={{ ...styles.menuItem, color: 'var(--danger)' }} onClick={() => { setOpen(false); onDelete(); }}>
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssetCard({ asset, category, onSelect, onDelete, onRename, isSelected, onToggleSelect, showFileMeta = true, isActive = false }) {
  const thumb = (asset.thumbnailPath || asset.filePath) + (asset.updatedAt ? `?v=${new Date(asset.updatedAt).getTime()}` : '');
  const isSelectable = !!onSelect;
  const { startDrag, moveOverlay, endDrag } = useDrag();
  const [trim, setTrim] = useState(null);
  const [bubbleSrc, setBubbleSrc] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [hovering, setHovering] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!showFileMeta) return; // editor cards don't show size/date — skip the HEAD lookup
    fetch(asset.filePath, { method: 'HEAD' })
      .then((r) => {
        const len = r.headers.get('content-length');
        if (len) setFileSize(parseInt(len, 10));
      })
      .catch(() => {});
  }, [category, asset.filePath, showFileMeta]);

  useEffect(() => {
    if (category !== 'BUBBLE') return;
    let alive = true;
    let url = null;
    fetch(thumb)
      .then((r) => r.text())
      .then((text) => {
        if (!alive) return;
        const blob = new Blob([recolorBubbleSvg(text)], { type: 'image/svg+xml' });
        url = URL.createObjectURL(blob);
        setBubbleSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [category, thumb]);

  const handleImgLoad = (e) => {
    const result = findTrimRect(e.target);
    if (result) setTrim(result);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startDrag({ imageUrl: thumb });
    moveOverlay(e.clientX, e.clientY);
    const onMove = (ev) => moveOverlay(ev.clientX, ev.clientY);
    const onUp = (ev) => {
      endDrag();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.dispatchEvent(new CustomEvent('assetDrop', {
        detail: { asset, category, clientX: ev.clientX, clientY: ev.clientY },
      }));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = asset.filePath;
    a.download = asset.name || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Backgrounds are full-frame photos with no transparent margin to trim, and should fill
  // the card edge-to-edge like a real thumbnail (no letterboxing) instead of being fit
  // inside it with the trim-to-content math below, which is for cutout art (Props,
  // Characters, …) that has empty padding around the actual artwork.
  const isBackground = category === 'BACKGROUND';
  // Sound cards (CLANG!, CLICK!, …) use the same solid-card, wide-shape treatment as
  // Backgrounds — cutout SFX art on a checkerboard read as "broken" (transparency
  // showing through), unlike Props/Effects where the checker pattern is expected.
  const isSound = category === 'SOUND';
  const isBgShaped = isBackground || isSound;

  let imgStyle;
  if (isBackground) {
    imgStyle = { width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' };
  } else if (isSound && !trim) {
    // contain, not cover — Sound art is a cutout burst shape (not a full-frame photo like
    // Background), so it needs to fit inside the wide card without being cropped. Used only
    // until the trim rect loads in (below) — trimming to the actual drawn content makes the
    // art render roughly 2x bigger by cropping out the source file's transparent margin.
    imgStyle = { width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' };
  } else if (trim) {
    const { minX, minY, maxX, maxY, nw, nh } = trim;
    const cw = maxX - minX;
    const ch = maxY - minY;
    const scale = Math.min(100 / cw, 100 / ch);
    const imgW = nw * scale;
    const imgH = nh * scale;
    const contentW = cw * scale;
    const contentH = ch * scale;
    const left = -(minX * scale) + (100 - contentW) / 2;
    const top  = -(minY * scale) + (100 - contentH) / 2;
    imgStyle = { position: 'absolute', width: `${imgW}%`, height: `${imgH}%`, left: `${left}%`, top: `${top}%`, pointerEvents: 'none' };
  } else {
    imgStyle = { width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' };
  }

  // isActive = this asset is the one currently applied (e.g. the active panel's background) —
  // same orange-border treatment as the active page thumbnail in the bottom pages strip.
  const cardBorder = isSelected
    ? { borderColor: 'var(--nav-primary)', boxShadow: '0 0 0 3px rgba(99,102,241,0.18)' }
    : isActive
      ? { border: '3px solid var(--t-accent)', boxShadow: '0 0 0 3px rgba(249,115,22,0.35), 0 2px 10px rgba(249,115,22,0.4)' }
      : {};

  return (
    <div style={{ position: 'relative' }}>
      {preview && (
        <PreviewModal asset={asset} fileSize={fileSize} onClose={() => setPreview(false)} />
      )}
      <div
        style={{
          ...styles.card,
          // Backgrounds (and Sound, which shares the same treatment) sit inside a small gray
          // mat (var(--t-bg3), same tone as the panel's buttons) with a small gap around the
          // art, rounded corners on the outer edge — instead of the image running edge-to-edge
          // with no visible container.
          ...(isBgShaped ? { border: 'none', borderRadius: 8, background: 'var(--t-bg3)', padding: isSound ? 2 : 4 } : {}),
          ...cardBorder,
          ...(hovering && !isSelected ? { boxShadow: 'var(--shadow-lg)', transform: 'translateY(-3px) scale(1.02)' } : {}),
        }}
        onClick={isSelectable ? () => onSelect(asset) : () => setPreview(true)}
        onMouseDown={handleMouseDown}
        title={category === 'BACKGROUND' ? undefined : asset.name}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {asset.isNew && <span style={styles.newBadge}>NEW</span>}

        {/* Backgrounds are always opaque full-frame photos, and Sound gets the same treatment
            for a cleaner look — the transparency checker pattern only makes sense for asset
            types where the checker itself is expected/useful (Props, Effects, Characters, …).
            Both also get a landscape (not square) box instead of a square crop. */}
        <div className={isBgShaped ? undefined : 'checkered-bg'} style={isSound ? styles.thumbSound : isBgShaped ? styles.thumbWide : styles.thumb}>
          <img
            src={bubbleSrc || thumb}
            alt={asset.name}
            draggable={false}
            onLoad={handleImgLoad}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={imgStyle}
          />

          {onToggleSelect && (
            <div
              style={{ ...styles.checkbox, opacity: hovering || isSelected ? 1 : 0 }}
              onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id); }}
              title={isSelected ? 'Deselect' : 'Select'}
            >
              {isSelected && <span style={styles.checkmark}>✓</span>}
            </div>
          )}

          {(onDelete || onRename) && (
            <div style={{ opacity: hovering ? 1 : 0, transition: 'opacity 0.15s' }}>
              <ActionMenu
                onRename={onRename ? () => {
                  const next = window.prompt('Rename asset', asset.name);
                  if (next && next.trim() && next.trim() !== asset.name) onRename(asset.id, next.trim());
                } : null}
                onDownload={handleDownload}
                onDelete={onDelete ? () => onDelete(asset.id) : null}
              />
            </div>
          )}
        </div>

        {/* Backgrounds are named by an internal code (A01, D07, …) that's meaningless to
            the person picking a scene — hide the label, image only. Sound labels duplicate
            what's already legible in the artwork itself ("CLANG!", "BOOM!", …), so hiding
            them frees up the card for a bigger image. Every other category keeps its name
            (it's the only way to tell similar-looking props/effects apart). */}
        {!isBgShaped && (
          <div style={styles.meta}>
            <span style={styles.metaName}>{asset.name}</span>
            {showFileMeta && (
              <div style={styles.metaRow}>
                {fileSize != null && <span>{formatBytes(fileSize)}</span>}
                {asset.createdAt && <span>{formatDate(asset.createdAt)}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    overflow: 'hidden',
    cursor: 'grab',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
    userSelect: 'none',
  },
  thumb: {
    aspectRatio: '1',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  thumbWide: {
    aspectRatio: '16 / 9',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 5,
  },
  // Less letterboxed than thumbWide (Background's photo shape) — Sound's burst-shaped
  // cutout art reads bigger in a squarer box, since object-fit:contain leaves less
  // unused space on the sides.
  thumbSound: {
    aspectRatio: '4 / 3',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 5,
  },
  meta: {
    padding: '8px 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  metaName: {
    fontSize: 12.5, fontWeight: 600, color: 'var(--dark)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  metaRow: {
    display: 'flex', gap: 8,
    fontSize: 10.5, color: 'var(--muted)', fontWeight: 500,
  },
  newBadge: {
    position: 'absolute', top: 6, left: 6,
    background: 'var(--warning)', color: '#fff',
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
    padding: '2px 6px', borderRadius: 20, zIndex: 2,
    textTransform: 'uppercase',
  },
  checkbox: {
    position: 'absolute', top: 6, left: 6,
    width: 18, height: 18, borderRadius: 5, zIndex: 3,
    background: 'var(--action-primary)', border: '1.5px solid #fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  },
  checkmark: {
    color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1, userSelect: 'none',
  },
  menuWrap: {
    position: 'absolute', top: 6, right: 6, zIndex: 4,
  },
  menuTrigger: {
    width: 22, height: 22, borderRadius: 6,
    background: 'rgba(17,24,39,0.55)', color: '#fff', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  menuDropdown: {
    position: 'absolute', top: 26, right: 0,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: 'var(--shadow-lg)',
    minWidth: 130, padding: 4, display: 'flex', flexDirection: 'column',
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 10px', borderRadius: 6, border: 'none', background: 'none',
    fontSize: 12.5, fontWeight: 500, color: 'var(--dark)', cursor: 'pointer',
    textAlign: 'left', width: '100%',
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'var(--surface)', borderRadius: 16,
    boxShadow: 'var(--shadow-lg)',
    maxWidth: '90vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  modalName: {
    flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--dark)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  modalSize: {
    fontSize: 12, fontWeight: 700, color: 'var(--primary)',
    background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 20,
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: 'var(--mid)', lineHeight: 1,
    padding: '2px 6px', borderRadius: 6, flexShrink: 0,
  },
  modalImgWrap: {
    overflow: 'auto', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    padding: 16, minWidth: 200, minHeight: 200,
  },
  modalImg: {
    maxWidth: '80vw', maxHeight: '75vh',
    objectFit: 'contain', borderRadius: 8,
  },
};
