import { ASSET_CATEGORIES } from '../../constants/categories.js';

export default function AssetCategoryPicker({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.select}>
      {ASSET_CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}

const styles = {
  select: {
    height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--dark)', fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer', width: '100%', maxWidth: 260,
  },
};
