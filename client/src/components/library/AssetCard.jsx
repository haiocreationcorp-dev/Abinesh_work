import { useState, useEffect } from 'react';
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

function PreviewModal({ asset, fileSize, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalName}>{asset.name}</span>
          {fileSize != null && <span style={styles.modalSize}>{formatBytes(fileSize)}</span>}
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalImgWrap}>
          <img src={asset.filePath} alt={asset.name} style={styles.modalImg} />
        </div>
      </div>
    </div>
  );
}

export default function AssetCard({ asset, category, onSelect, onDelete, onRename, isSelected, onToggleSelect }) {
  const thumb = (asset.thumbnailPath || asset.filePath) + (asset.updatedAt ? `?v=${new Date(asset.updatedAt).getTime()}` : '');
  const isSelectable = !!onSelect;
  const { startDrag, moveOverlay, endDrag } = useDrag();
  const [trim, setTrim] = useState(null);
  const [bubbleSrc, setBubbleSrc] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [showSize, setShowSize] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch(asset.filePath, { method: 'HEAD' })
      .then((r) => {
        const len = r.headers.get('content-length');
        if (len) setFileSize(parseInt(len, 10));
      })
      .catch(() => {});
  }, [category, asset.filePath]);

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

  let imgStyle;
  if (trim) {
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

  const cardBorder = isSelected
    ? { border: '2px solid #F97316', boxShadow: '0 0 0 3px rgba(249,115,22,0.18)' }
    : {};

  return (
    <div style={{ position: 'relative' }}>
      {preview && (
        <PreviewModal asset={asset} fileSize={fileSize} onClose={() => setPreview(false)} />
      )}
      <div
        style={{ ...styles.card, ...cardBorder }}
        onClick={isSelectable ? () => onSelect(asset) : () => setPreview(true)}
        onMouseDown={handleMouseDown}
        title={asset.name}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = isSelected ? cardBorder.boxShadow : '0 4px 16px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; setShowSize(true); }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = isSelected ? cardBorder.boxShadow : styles.card.boxShadow; e.currentTarget.style.transform = 'none'; setShowSize(false); }}
      >
        {asset.isNew && <span style={styles.newBadge}>NEW</span>}

        {category !== 'CHARACTER' && showSize && fileSize != null && (
          <span style={styles.sizeBadge}>{formatBytes(fileSize)}</span>
        )}

        {category === 'CHARACTER' && showSize && (
          <div style={styles.charInfo}>
            <span style={styles.charName}>{asset.name}</span>
            {fileSize != null && <span style={styles.charSize}>{formatBytes(fileSize)}</span>}
          </div>
        )}

        <div style={styles.thumb}>
          <img
            src={bubbleSrc || thumb}
            alt={asset.name}
            draggable={false}
            onLoad={handleImgLoad}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={imgStyle}
          />
        </div>

        {onToggleSelect && (
          <div
            style={{ ...styles.checkbox, ...(isSelected ? styles.checkboxChecked : {}) }}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id); }}
            title={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected && <span style={styles.checkmark}>✓</span>}
          </div>
        )}

        {onRename && (
          <button
            style={styles.renameBtn}
            onClick={(e) => {
              e.stopPropagation();
              const next = window.prompt('Rename asset', asset.name);
              if (next && next.trim() && next.trim() !== asset.name) onRename(asset.id, next.trim());
            }}
            title="Rename asset"
          >✎</button>
        )}

        {onDelete && (
          <button
            style={styles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
            title="Delete asset"
          >×</button>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-border)',
    borderRadius: 10,
    overflow: 'hidden',
    cursor: 'grab',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    transition: 'box-shadow 0.18s, transform 0.18s',
    userSelect: 'none',
  },
  thumb: {
    aspectRatio: '1',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--t-bg3)',
  },
  newBadge: {
    position: 'absolute', top: 6, left: 6,
    background: '#F97316', color: '#fff',
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
    padding: '2px 6px', borderRadius: 20, zIndex: 2,
    textTransform: 'uppercase',
  },
  checkbox: {
    position: 'absolute', top: 5, left: 5,
    width: 18, height: 18, borderRadius: 4, zIndex: 3,
    background: 'rgba(255,255,255,0.9)', border: '1.5px solid #d1d5db',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.12s, border-color 0.12s',
  },
  checkboxChecked: {
    background: '#F97316', border: '1.5px solid #F97316',
  },
  checkmark: {
    color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1, userSelect: 'none',
  },
  deleteBtn: {
    position: 'absolute', top: 4, right: 4,
    background: '#ef4444', color: '#fff', border: 'none',
    borderRadius: '50%', width: 18, height: 18,
    fontSize: 13, cursor: 'pointer', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  renameBtn: {
    position: 'absolute', top: 4, right: 24,
    background: '#6B7280', color: '#fff', border: 'none',
    borderRadius: '50%', width: 18, height: 18,
    fontSize: 10, cursor: 'pointer', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  sizeBadge: {
    position: 'absolute', bottom: 6, left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.65)', color: '#fff',
    fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
    padding: '2px 7px', borderRadius: 20, zIndex: 3,
    pointerEvents: 'none', whiteSpace: 'nowrap',
  },
  charInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex', flexDirection: 'column', gap: 1,
    padding: '5px 7px', pointerEvents: 'none',
  },
  charName: {
    fontSize: 10, fontWeight: 600, color: '#fff',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  charSize: {
    fontSize: 9, color: '#F97316', fontWeight: 700, letterSpacing: 0.2,
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 16,
    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
    maxWidth: '90vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
  },
  modalName: {
    flex: 1, fontSize: 15, fontWeight: 700, color: '#111827',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  modalSize: {
    fontSize: 12, fontWeight: 700, color: '#F97316',
    background: '#FFF7ED', padding: '2px 8px', borderRadius: 20,
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: '#6B7280', lineHeight: 1,
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
