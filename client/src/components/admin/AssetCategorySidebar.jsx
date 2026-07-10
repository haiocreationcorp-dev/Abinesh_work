import { useState } from 'react';
import { ASSET_CATEGORIES } from '../../constants/categories.js';

export default function AssetCategorySidebar({ value, onChange, counts }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="card" style={styles.card}>
      <p style={styles.heading}>Category</p>
      <div style={styles.list}>
        {ASSET_CATEGORIES.map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...styles.item,
                ...(active ? styles.itemActive : hovered === c.id ? styles.itemHover : {}),
              }}
            >
              <span style={styles.itemLabel}>{c.label}</span>
              <span style={{ ...styles.count, ...(active ? styles.countActive : {}) }}>
                {counts?.[c.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  card: { padding: 14, position: 'sticky', top: 20 },
  heading: { fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 10px' },
  list: { display: 'flex', flexDirection: 'column', gap: 2 },
  item: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    padding: '9px 10px', borderRadius: 'var(--radius-sm)', background: 'transparent',
    color: 'var(--mid)', fontSize: 13.5, fontWeight: 600,
    transition: 'background 150ms ease, color 150ms ease',
  },
  itemHover: { background: 'var(--nav-hover)' },
  itemActive: { background: 'var(--nav-light)', color: 'var(--nav-text)' },
  itemLabel: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: {
    fontSize: 11, fontWeight: 700, color: 'var(--mid)', background: 'var(--light)',
    borderRadius: 999, padding: '2px 8px', flexShrink: 0,
  },
  countActive: { background: '#fff', color: 'var(--nav-text)' },
};
