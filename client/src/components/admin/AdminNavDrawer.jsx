import { useEffect } from 'react';

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Single shared slide-out nav panel — Content/Administration both render this,
// only `title`/`items`/`activeIndex` change, so switching between them swaps
// contents in place instead of mounting a second panel.
export default function AdminNavDrawer({ open, title, items, activeIndex, onSelect, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div style={{ ...styles.overlay, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }} onClick={onClose} />
      <div
        style={{
          ...styles.panel,
          transform: open ? 'translateX(0)' : 'translateX(-24px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
      >
        <div style={styles.header}>
          <span style={styles.title}>{title}</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div style={styles.list}>
          {items.map(({ label, index, icon }, i) => (
            <button
              key={label}
              style={{
                ...styles.item,
                ...(activeIndex === index ? styles.itemActive : {}),
                opacity: open ? 1 : 0,
                transform: open ? 'translateY(0)' : 'translateY(-4px)',
                transitionDelay: open ? `${i * 22}ms` : '0ms',
              }}
              onClick={() => onSelect(index)}
              onMouseEnter={(e) => { if (activeIndex !== index) e.currentTarget.style.background = 'var(--nav-hover)'; }}
              onMouseLeave={(e) => { if (activeIndex !== index) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={styles.itemIcon}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 110,
    transition: 'opacity 220ms ease',
  },
  panel: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: 280, zIndex: 111,
    background: 'var(--surface)', borderRight: '1px solid var(--border)',
    borderTopRightRadius: 16, borderBottomRightRadius: 16,
    boxShadow: 'var(--shadow-lg)', padding: 24, overflowY: 'auto',
    transition: 'transform 280ms ease, opacity 280ms ease',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: 800, color: 'var(--dark)' },
  closeBtn: { color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)' },
  list: { display: 'flex', flexDirection: 'column', gap: 3 },
  item: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    padding: '11px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent',
    color: 'var(--mid)', fontSize: 14, fontWeight: 600,
    transition: 'background 150ms ease, color 150ms ease, opacity 220ms ease, transform 220ms ease',
  },
  itemActive: { background: 'var(--nav-light)', color: 'var(--nav-text)' },
  itemIcon: { display: 'flex', alignItems: 'center', flexShrink: 0 },
};
