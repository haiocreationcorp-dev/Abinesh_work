function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function Modal({ open, onClose, title, maxWidth = 460, children }) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="card" style={{ ...styles.box, maxWidth }} onClick={(e) => e.stopPropagation()}>
        {(title || onClose) && (
          <div style={styles.header}>
            {title && <h3 style={styles.title}>{title}</h3>}
            {onClose && <button style={styles.closeBtn} onClick={onClose} aria-label="Close"><IconX /></button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { width: '100%', padding: 24 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700 },
  closeBtn: { color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
