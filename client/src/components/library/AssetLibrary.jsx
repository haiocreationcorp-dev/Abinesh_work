import { useState } from 'react';
import AssetGrid from './AssetGrid.jsx';
import { ASSET_CATEGORIES as CATEGORIES } from '../../constants/categories.js';

export default function AssetLibrary({ onSelect }) {
  const [category, setCategory] = useState('CHARACTER');
  const [search, setSearch] = useState('');

  return (
    <div style={styles.root}>
      <input
        style={styles.search}
        placeholder="Search assets…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={styles.catRow}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            style={{ ...styles.catBtn, ...(category === c.id ? styles.catBtnActive : {}) }}
            onClick={() => setCategory(c.id)}
            title={c.label}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <AssetGrid
        category={category}
        search={search}
        onSelect={(asset) => onSelect(asset, category)}
      />
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 8 },
  search: {
    background: '#1e1e3a', border: '1px solid #2a2a4a', color: '#e2e8f0',
    borderRadius: 6, padding: '6px 10px', fontSize: 12,
  },
  catRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  catBtn: {
    background: '#1e1e3a', border: '1px solid #2a2a4a', borderRadius: 6,
    padding: '4px 8px', cursor: 'pointer', fontSize: 16,
  },
  catBtnActive: { border: '1px solid #6B35E8', background: '#2a2060' },
};
